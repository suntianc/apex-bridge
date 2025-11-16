/**
 * EvaluationEngine - 判断/评审层
 * 负责评估场景、计算评分、决定是否执行
 */

import { ProactiveContext, ProactiveScene, SceneScore } from '../types/proactivity';
import { logger } from '../utils/logger';

export interface EvaluationEngineConfig {
  actionThreshold?: number; // 默认 0.62（Phase 2标准阈值）
  weightValue?: number; // Value权重，默认 0.35
  weightUrgency?: number; // Urgency权重，默认 0.30
  weightUncertainty?: number; // Uncertainty权重，默认 0.15
  weightNovelty?: number; // Novelty权重，默认 0.10
  weightEffort?: number; // Effort权重（负向），默认 -0.20
  diversityPenalty?: number; // 多样性惩罚，默认 -0.10
}

export class EvaluationEngine {
  private config: Required<EvaluationEngineConfig>;
  private recentTopics: string[] = []; // 最近的话题，用于多样性惩罚（保留最近2个）

  constructor(config?: EvaluationEngineConfig) {
    this.config = {
      actionThreshold: config?.actionThreshold ?? 0.62, // Phase 2标准阈值
      weightValue: config?.weightValue ?? 0.35,
      weightUrgency: config?.weightUrgency ?? 0.30,
      weightUncertainty: config?.weightUncertainty ?? 0.15,
      weightNovelty: config?.weightNovelty ?? 0.10,
      weightEffort: config?.weightEffort ?? -0.20,
      diversityPenalty: config?.diversityPenalty ?? -0.10
    };

    logger.info('✅ EvaluationEngine initialized (Phase 2)', {
      actionThreshold: this.config.actionThreshold,
      weights: {
        value: this.config.weightValue,
        urgency: this.config.weightUrgency,
        uncertainty: this.config.weightUncertainty,
        novelty: this.config.weightNovelty,
        effort: this.config.weightEffort
      },
      diversityPenalty: this.config.diversityPenalty
    });
  }

  /**
   * 评估场景（简化版，MVP阶段）
   */
  async evaluateScenes(
    scenes: ProactiveScene[],
    context: ProactiveContext
  ): Promise<SceneScore[]> {
    const scores: SceneScore[] = [];

    for (const scene of scenes) {
      // 简化版评分：基于场景优先级和基础判断
      const score = await this.calculateScore(scene, context);
      
      scores.push({
        sceneId: scene.id,
        score: score,
        reason: this.getScoreReason(scene, score),
        metadata: {
          priority: scene.priority || 0,
          trigger: scene.trigger
        }
      });
    }

    // 按分数排序（从高到低）
    return scores.sort((a, b) => b.score - a.score);
  }

  /**
   * 计算场景评分（Phase 2：多维度评分）
   * 基于 Value/Urgency/Novelty/Effort 四个维度，加上 Uncertainty（可选）
   */
  private async calculateScore(
    scene: ProactiveScene,
    context: ProactiveContext
  ): Promise<number> {
    // 计算各维度分数
    const value = this.calculateValue(scene, context);
    const urgency = this.calculateUrgency(scene, context);
    const uncertainty = this.calculateUncertainty(scene, context);
    const novelty = this.calculateNovelty(scene, context);
    const effort = this.calculateEffort(scene, context);

    // 加权计算总分
    let score = 
      value * this.config.weightValue +
      urgency * this.config.weightUrgency +
      uncertainty * this.config.weightUncertainty +
      novelty * this.config.weightNovelty +
      effort * this.config.weightEffort;

    // 多样性惩罚（如果话题重复）
    if (this.isTopicRepeated(scene.id)) {
      score += this.config.diversityPenalty;
      logger.debug(`⚠️ Diversity penalty (${this.config.diversityPenalty}) applied for scene: ${scene.id}`);
    }

    // 确保分数在0-1范围内
    return Math.max(0, Math.min(1, score));
  }

  /**
   * 计算价值维度（Value）
   * 评估场景与长期目标一致度、预期时间节省等
   */
  private calculateValue(scene: ProactiveScene, context: ProactiveContext): number {
    let value = 0.5; // 基础值

    // 基于场景优先级
    if (scene.priority) {
      value += scene.priority * 0.3; // 优先级影响30%
    }

    // 基于触发类型
    if (scene.trigger === 'schedule') {
      value += 0.2; // 定时触发通常有价值
    } else if (scene.trigger === 'event') {
      value += 0.3; // 事件触发通常更有价值
    } else if (scene.trigger === 'condition') {
      value += 0.25; // 状态触发有一定价值
    }

    // 基于场景ID（特殊场景给予更高价值）
    if (scene.id.includes('reminder') || scene.id.includes('care')) {
      value += 0.1; // 提醒和关怀类场景价值较高
    }

    return Math.max(0, Math.min(1, value));
  }

  /**
   * 计算紧迫性维度（Urgency）
   * 评估与DDL/事件时间距离、时间敏感性
   */
  private calculateUrgency(scene: ProactiveScene, context: ProactiveContext): number {
    let urgency = 0.3; // 基础紧迫性

    // 基于触发类型
    if (scene.trigger === 'event') {
      urgency += 0.4; // 事件触发通常更紧迫
    } else if (scene.trigger === 'condition') {
      urgency += 0.3; // 状态触发有一定紧迫性
    }

    // 基于上下文（如果有时间戳或DDL信息）
    if (context.metadata?.deadline) {
      const deadline = new Date(context.metadata.deadline).getTime();
      const now = Date.now();
      const hoursUntil = (deadline - now) / (1000 * 60 * 60);
      
      if (hoursUntil < 24) {
        urgency += 0.3; // 24小时内紧迫性高
      } else if (hoursUntil < 48) {
        urgency += 0.2; // 48小时内紧迫性中等
      }
    }

    // 基于场景ID
    if (scene.id.includes('urgent') || scene.id.includes('important')) {
      urgency += 0.2;
    }

    return Math.max(0, Math.min(1, urgency));
  }

  /**
   * 计算不确定性维度（Uncertainty）
   * 评估收益不确定性（越低越好，但这里我们计算不确定性的负面影响）
   */
  private calculateUncertainty(scene: ProactiveScene, context: ProactiveContext): number {
    let uncertainty = 0.3; // 基础不确定性

    // 基于触发类型
    if (scene.trigger === 'random') {
      uncertainty += 0.4; // 随机触发不确定性高
    } else if (scene.trigger === 'schedule') {
      uncertainty -= 0.2; // 定时触发不确定性低
    }

    // 基于场景定义是否完整
    if (scene.generateMessage && scene.condition) {
      uncertainty -= 0.1; // 有明确条件定义，不确定性降低
    }

    return Math.max(0, Math.min(1, uncertainty));
  }

  /**
   * 计算新颖性维度（Novelty）
   * 评估与最近两次话题差异度
   */
  private calculateNovelty(scene: ProactiveScene, context: ProactiveContext): number {
    let novelty = 0.5; // 基础新颖性

    // 检查话题是否重复
    if (!this.isTopicRepeated(scene.id)) {
      novelty += 0.3; // 新话题新颖性高
    } else {
      novelty -= 0.4; // 重复话题新颖性低
    }

    // 基于触发类型
    if (scene.trigger === 'random') {
      novelty += 0.2; // 随机触发通常更新颖
    }

    return Math.max(0, Math.min(1, novelty));
  }

  /**
   * 计算努力成本维度（Effort）
   * 评估算力/时间/步骤成本（负向，越低越好）
   */
  private calculateEffort(scene: ProactiveScene, context: ProactiveContext): number {
    let effort = 0.5; // 基础努力成本

    // 基于场景复杂度（简化评估）
    if (scene.condition) {
      effort += 0.2; // 有复杂条件判断，成本较高
    }

    // 基于触发类型
    if (scene.trigger === 'event' || scene.trigger === 'condition') {
      effort += 0.1; // 需要额外判断，成本略高
    } else if (scene.trigger === 'schedule') {
      effort -= 0.1; // 定时触发成本较低
    }

    // 基于场景ID（简单场景成本低）
    if (scene.id.includes('greeting') || scene.id.includes('reminder')) {
      effort -= 0.2; // 问候和提醒类场景成本低
    }

    return Math.max(0, Math.min(1, effort));
  }

  /**
   * 检查话题是否重复（Phase 2增强）
   * 检查最近两次是否包含相同场景
   */
  private isTopicRepeated(sceneId: string): boolean {
    const recent = this.recentTopics.slice(-2);
    return recent.includes(sceneId);
  }

  /**
   * 记录话题（用于多样性惩罚）
   * Phase 2：只保留最近2个话题（用于多样性惩罚）
   */
  recordTopic(sceneId: string): void {
    this.recentTopics.push(sceneId);
    // 只保留最近2个话题（用于多样性惩罚）
    if (this.recentTopics.length > 2) {
      this.recentTopics.shift();
    }
    logger.debug(`📝 Topic recorded: ${sceneId} (recent: ${this.recentTopics.join(', ')})`);
  }

  /**
   * 判断是否应该执行（基于评分）
   */
  shouldAct(score: number): boolean {
    const result = score >= this.config.actionThreshold;
    if (!result) {
      logger.debug(`⏸️ Scene score ${score.toFixed(2)} below threshold ${this.config.actionThreshold}`);
    }
    return result;
  }

  /**
   * 获取评分原因（用于日志和调试，Phase 2增强）
   */
  private getScoreReason(scene: ProactiveScene, score: number): string {
    const reasons: string[] = [];

    // 计算各维度分数（用于详细日志）
    const value = this.calculateValue(scene, {} as ProactiveContext);
    const urgency = this.calculateUrgency(scene, {} as ProactiveContext);
    const novelty = this.calculateNovelty(scene, {} as ProactiveContext);
    const effort = this.calculateEffort(scene, {} as ProactiveContext);

    reasons.push(`V=${value.toFixed(2)}`);
    reasons.push(`U=${urgency.toFixed(2)}`);
    reasons.push(`N=${novelty.toFixed(2)}`);
    reasons.push(`E=${effort.toFixed(2)}`);

    if (scene.priority) {
      reasons.push(`P=${scene.priority}`);
    }
    reasons.push(`T=${scene.trigger}`);
    
    if (this.isTopicRepeated(scene.id)) {
      reasons.push(`DIV=${this.config.diversityPenalty}`);
    }
    
    reasons.push(`SCORE=${score.toFixed(2)}`);

    return reasons.join(' ');
  }

  /**
   * 更新行动阈值
   */
  setActionThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 1) {
      logger.warn(`⚠️ Invalid threshold ${threshold}, keeping current: ${this.config.actionThreshold}`);
      return;
    }
    this.config.actionThreshold = threshold;
    logger.info(`✅ Action threshold updated to ${threshold}`);
  }

  /**
   * 清除话题历史（用于测试或重置）
   */
  clearTopicHistory(): void {
    this.recentTopics = [];
    logger.debug('🔄 Topic history cleared');
  }
}

