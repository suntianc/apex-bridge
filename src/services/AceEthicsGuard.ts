/**
 * AceEthicsGuard - ACE伦理守卫
 * 映射到L1（Aspirational Layer）- 渴望层
 *
 * 核心职责：
 * 1. 道德裁决和价值观约束
 * 2. 监督所有战略决策（L2-L6）
 * 3. 提供纠正指令和道德对齐
 * 4. 多级审查机制
 * 5. 降级保障机制（关键词检测）
 */

import type { LLMManager } from '../core/LLMManager';
import type { AceIntegrator } from './AceIntegrator';
import { logger } from '../utils/logger';

export interface EthicalRule {
  id: string;
  name: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  keywords: string[];
  patterns: RegExp[];
  action: 'block' | 'warn' | 'log';
  message: string;
}

export interface StrategyReview {
  goal: string;
  plan: string;
  layer: string;
}

export interface ReviewResult {
  approved: boolean;
  reason?: string;
  suggestions?: string[];
  violations?: string[];
}

/**
 * ACE伦理守卫（L1渴望层）
 * 使用项目现有的LLMManager和配置系统
 */
export class AceEthicsGuard {
  private constitution: string = '';
  private ethicalRules: EthicalRule[] = [];
  private reviewCache: Map<string, ReviewResult> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

  constructor(
    private llmManager: LLMManager,
    private aceIntegrator: AceIntegrator
  ) {
    logger.info('[AceEthicsGuard] Initialized (L1 Aspirational Layer)');
  }

  /**
   * 核心方法：战略审查
   * 对来自L2-L6层的战略决策进行伦理审查
   */
  async reviewStrategy(strategy: StrategyReview): Promise<ReviewResult> {
    try {
      // 检查缓存
      const cacheKey = this.generateCacheKey(strategy);
      const cachedResult = this.getCachedResult(cacheKey);
      if (cachedResult) {
        logger.debug('[AceEthicsGuard] Returning cached review result');
        return cachedResult;
      }

      // 1. 应用伦理规则检查（快速筛选）
      const ruleResult = this.applyEthicalRules(strategy);
      if (!ruleResult.approved && ruleResult.violations.length > 0) {
        const severeViolations = this.ethicalRules.filter(r =>
          ruleResult.violations!.includes(r.name) &&
          (r.severity === 'high' || r.severity === 'critical')
        );

        if (severeViolations.length > 0) {
          const result: ReviewResult = {
            approved: false,
            reason: `严重伦理违规: ${severeViolations.map(v => v.name).join(', ')}`,
            violations: ruleResult.violations
          };
          this.cacheResult(cacheKey, result);
          return result;
        }
      }

      // 2. 使用LLM进行伦理审查（深度分析）
      const llmResult = await this.performLLMReview(strategy);
      if (llmResult.approved) {
        this.cacheResult(cacheKey, llmResult);
      }

      return llmResult;

    } catch (error: any) {
      logger.error('[AceEthicsGuard] Strategy review failed:', error);

      // 审查失败时降级到关键词检测
      const fallbackResult = this.fallbackEthicalCheck(strategy);
      logger.warn('[AceEthicsGuard] Using fallback keyword detection');
      return fallbackResult;
    }
  }

  /**
   * 能力决策审查（L3层）
   * 在技能注册和能力管理前进行审查
   */
  async reviewCapability(capability: {
    name: string;
    description: string;
    type: string;
  }): Promise<ReviewResult> {
    return this.reviewStrategy({
      goal: `Register capability: ${capability.name}`,
      plan: `${capability.type}: ${capability.description}`,
      layer: 'L3_AGENT_MODEL'
    });
  }

  /**
   * 长期规划审查（L2层）
   * 在世界模型更新和战略规划前进行审查
   */
  async reviewPlanning(planning: {
    goal: string;
    context: string;
  }): Promise<ReviewResult> {
    return this.reviewStrategy({
      goal: planning.goal,
      plan: planning.context,
      layer: 'L2_GLOBAL_STRATEGY'
    });
  }

  /**
   * 加载宪法文件
   * 支持动态加载和热更新
   */
  async loadConstitution(configPath?: string): Promise<string> {
    if (this.constitution) {
      return this.constitution;
    }

    const constitutionPath = configPath ||
      process.env.CONSTITUTION_PATH ||
      './config/constitution.md';

    try {
      const fs = await import('fs/promises');
      const constitution = await fs.readFile(constitutionPath, 'utf8');
      this.constitution = constitution;

      logger.debug(`[AceEthicsGuard] Constitution loaded from ${constitutionPath}`);
      return constitution;
    } catch (error: any) {
      logger.warn('[AceEthicsGuard] Failed to load constitution, using default');
      this.constitution = this.getDefaultConstitution();
      return this.constitution;
    }
  }

  /**
   * 重新加载宪法（热更新）
   */
  async reloadConstitution(configPath?: string): Promise<string> {
    this.constitution = '';
    return this.loadConstitution(configPath);
  }

  /**
   * 更新伦理规则
   */
  async updateEthicalRules(rules: EthicalRule[]): Promise<void> {
    this.ethicalRules = rules;

    // 向L1层报告规则更新
    await this.aceIntegrator.sendToLayer('ASPIRATIONAL', {
      type: 'ETHICS_RULE_UPDATE',
      content: `Updated ${rules.length} ethical rules`,
      metadata: {
        ruleCount: rules.length,
        timestamp: Date.now()
      }
    });

    logger.info(`[AceEthicsGuard] Updated ${rules.length} ethical rules`);
    this.clearCache();
  }

  /**
   * 获取当前伦理规则
   */
  getEthicalRules(): EthicalRule[] {
    return [...this.ethicalRules];
  }

  /**
   * 获取宪法内容
   */
  getConstitution(): string {
    return this.constitution || this.getDefaultConstitution();
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.reviewCache.clear();
    logger.debug('[AceEthicsGuard] Review cache cleared');
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; hits: number; misses: number } {
    return {
      size: this.reviewCache.size,
      hits: 0, // 简化实现，实际可添加命中计数
      misses: 0
    };
  }

  // ==================== 私有方法 ====================

  /**
   * 使用LLM进行伦理审查
   */
  private async performLLMReview(strategy: StrategyReview): Promise<ReviewResult> {
    const constitution = await this.loadConstitution();
    const reviewPrompt = this.buildReviewPrompt(constitution, strategy);

    const response = await this.llmManager.chat([
      {
        role: 'user',
        content: reviewPrompt
      }
    ], { stream: false });

    const content = response.choices[0]?.message?.content || '{}';

    try {
      const result = JSON.parse(content);
      return {
        approved: Boolean(result.approved),
        reason: result.reason,
        suggestions: result.suggestions
      };
    } catch (parseError) {
      logger.warn('[AceEthicsGuard] Failed to parse LLM response, using fallback');
      return this.fallbackEthicalCheck(strategy);
    }
  }

  /**
   * 构建审查提示词
   */
  private buildReviewPrompt(
    constitution: string,
    strategy: StrategyReview
  ): string {
    return `
${constitution}

请审查以下来自${strategy.layer}层的战略决策：

目标: ${strategy.goal}
计划: ${strategy.plan}

请从以下角度进行审查：
1. 是否符合宪法规定？
2. 是否可能造成伤害？
3. 是否涉及非法活动？
4. 是否违反道德准则？
5. 是否存在更好的替代方案？

请以JSON格式返回结果：
{
  "approved": true/false,
  "reason": "详细解释",
  "suggestions": ["改进建议1", "改进建议2"]
}

只返回JSON，不要其他内容。
`;
  }

  /**
   * 应用伦理规则检查（快速筛选）
   */
  private applyEthicalRules(strategy: StrategyReview): {
    approved: boolean;
    violations: string[];
  } {
    const text = `${strategy.goal} ${strategy.plan}`.toLowerCase();
    const violations: string[] = [];

    for (const rule of this.ethicalRules) {
      // 检查关键词
      for (const keyword of rule.keywords) {
        if (text.includes(keyword.toLowerCase())) {
          violations.push(rule.name);
          break;
        }
      }

      // 检查正则模式
      for (const pattern of rule.patterns) {
        if (pattern.test(text)) {
          violations.push(rule.name);
          break;
        }
      }
    }

    if (violations.length > 0) {
      const severeViolations = this.ethicalRules.filter(r =>
        violations.includes(r.name) &&
        (r.severity === 'high' || r.severity === 'critical')
      );

      if (severeViolations.length > 0) {
        return {
          approved: false,
          violations
        };
      }
    }

    return { approved: true, violations };
  }

  /**
   * 降级保障机制：关键词检测
   * 当LLM不可用或审查失败时使用
   */
  private fallbackEthicalCheck(strategy: StrategyReview): ReviewResult {
    const text = `${strategy.goal} ${strategy.plan}`.toLowerCase();

    // 致命关键词（直接阻止）- 英文
    const criticalKeywords = [
      'hack', 'exploit', 'steal', 'illegal', 'weapon', 'bomb',
      'terrorist', 'murder', 'suicide', 'abuse', 'violence'
    ];

    // 致命关键词（直接阻止）- 中文
    const criticalKeywordsZh = [
      '黑客', '攻击', '破解', '非法', '武器', '炸弹',
      '恐怖分子', '谋杀', '自杀', '虐待', '暴力'
    ];

    for (const keyword of criticalKeywords) {
      if (text.includes(keyword)) {
        return {
          approved: false,
          reason: `检测到潜在有害内容: ${keyword}`
        };
      }
    }

    for (const keyword of criticalKeywordsZh) {
      if (text.includes(keyword)) {
        return {
          approved: false,
          reason: `检测到潜在有害内容: ${keyword}`
        };
      }
    }

    // 高风险关键词（警告）- 英文
    const highRiskKeywords = [
      'weapon', 'illegal', 'drug', 'gamble', 'fraud'
    ];

    // 高风险关键词（警告）- 中文
    const highRiskKeywordsZh = [
      '武器', '非法', '毒品', '赌博', '诈骗'
    ];

    for (const keyword of highRiskKeywords) {
      if (text.includes(keyword)) {
        return {
          approved: false,
          reason: `检测到高风险内容: ${keyword}。请咨询人类专家。`
        };
      }
    }

    for (const keyword of highRiskKeywordsZh) {
      if (text.includes(keyword)) {
        return {
          approved: false,
          reason: `检测到高风险内容: ${keyword}。请咨询人类专家。`
        };
      }
    }

    return { approved: true };
  }

  /**
   * 默认宪法内容
   */
  private getDefaultConstitution(): string {
    return `# AI伦理宪法

## 核心原则

1. **用户安全第一**: 始终优先考虑用户的安全和福祉
2. **诚实透明**: 提供真实、准确的信息，不欺骗用户
3. **尊重隐私**: 保护用户隐私和机密信息
4. **无害原则**: 不协助任何可能造成伤害的活动
5. **非歧视**: 不因种族、性别、年龄等因素产生歧视
6. **法律合规**: 遵守适用法律法规
7. **公平公正**: 保持中立，不偏不倚
8. **责任担当**: 对AI的行为和决策负责

## 禁止活动

1. 协助非法活动
2. 传播虚假信息
3. 侵犯他人隐私
4. 造成身体或心理伤害
5. 歧视或偏见行为
6. 破坏他人财物
7. 传播恶意软件
8. 从事欺诈活动

## 审查标准

任何战略决策都必须通过以下审查：
- 是否符合核心原则？
- 是否可能造成伤害？
- 是否涉及非法活动？
- 是否违反道德准则？
- 是否存在更好的替代方案？
`;
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(strategy: StrategyReview): string {
    return `${strategy.layer}:${strategy.goal}:${strategy.plan}`.replace(/\s+/g, '_');
  }

  /**
   * 获取缓存结果
   */
  private getCachedResult(cacheKey: string): ReviewResult | null {
    const cached = this.reviewCache.get(cacheKey);
    if (!cached) return null;

    // 检查TTL
    // 注意：简化实现，实际应存储时间戳
    return cached;
  }

  /**
   * 缓存结果
   */
  private cacheResult(cacheKey: string, result: ReviewResult): void {
    this.reviewCache.set(cacheKey, result);

    // 限制缓存大小
    if (this.reviewCache.size > 1000) {
      const firstKey = this.reviewCache.keys().next().value;
      this.reviewCache.delete(firstKey);
    }
  }
}
