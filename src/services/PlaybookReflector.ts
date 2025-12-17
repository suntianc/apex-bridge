/**
 * Playbook 反思器 - MVP 规则引擎版
 *
 * 职责:
 * - 对比成功/失败 Trajectory
 * - 识别失败模式（基于规则引擎）
 * - 生成风险规避型 Playbook
 */

import { Trajectory } from '../types/trajectory';
import { ErrorType, ErrorDetails } from '../types/trajectory';
import { StrategicPlaybook, PlaybookAction } from '../types/playbook';
import { ErrorPatternRule, FailurePattern } from '../types/reflector';
import { PlaybookManager } from './PlaybookManager';
import { logger } from '../utils/logger';

export class PlaybookReflector {
  private playbookManager: PlaybookManager;

  /**
   * 硬编码的错误模式规则（MVP 版本）
   */
  private errorPatternRules: ErrorPatternRule[] = [
    {
      error_type: ErrorType.TIMEOUT,
      keywords: ['timeout', 'exceeded', 'timed out'],
      anti_pattern: '不要在单次调用中处理过多数据',
      solution: '分批处理，每批≤100条，添加超时限制',
      tags: ['timeout', 'batch-processing', 'performance']
    },
    {
      error_type: ErrorType.RATE_LIMIT,
      keywords: ['rate limit', '429', 'too many requests', 'quota exceeded'],
      anti_pattern: '避免短时间内频繁调用API',
      solution: '添加速率限制器，间隔至少1秒',
      tags: ['rate-limit', 'throttling', 'api']
    },
    {
      error_type: ErrorType.RESOURCE_EXHAUSTED,
      keywords: ['out of memory', 'heap', 'allocation failed', 'disk full'],
      anti_pattern: '避免一次性加载大文件到内存',
      solution: '使用流式处理或分块读取',
      tags: ['resource', 'memory', 'streaming']
    },
    {
      error_type: ErrorType.NETWORK_ERROR,
      keywords: ['connection refused', 'network error', 'ECONNREFUSED'],
      anti_pattern: '未实现重试机制',
      solution: '添加指数退避重试（最多3次）',
      tags: ['network', 'retry', 'resilience']
    },
    {
      error_type: ErrorType.PERMISSION_DENIED,
      keywords: ['permission denied', 'forbidden', '403', 'unauthorized'],
      anti_pattern: 'API Key过期或权限错误',
      solution: '检查API Key有效性，验证权限',
      tags: ['permission', 'auth', 'security']
    }
  ];

  constructor(playbookManager: PlaybookManager) {
    this.playbookManager = playbookManager;
  }

  /**
   * 分析失败模式（主入口）
   */
  async analyzeFailurePatterns(
    successTrajectories: Trajectory[],
    failureTrajectories: Trajectory[]
  ): Promise<StrategicPlaybook[]> {
    logger.info(`[Reflector] 开始分析失败模式: ${failureTrajectories.length} 个失败案例`);

    // 1. 提取失败模式
    const patterns = this.extractFailurePatterns(failureTrajectories);

    // 2. 过滤低置信度模式（至少出现 2 次）
    const significantPatterns = patterns.filter(p => p.occurrences >= 2);

    logger.info(`[Reflector] 识别到 ${significantPatterns.length} 个显著失败模式`);

    // 3. 生成风险规避型 Playbook
    const playbooks: StrategicPlaybook[] = [];

    for (const pattern of significantPatterns) {
      try {
        const playbook = await this.generateRiskAvoidancePlaybook(pattern, failureTrajectories);
        playbooks.push(playbook);

        // 持久化到知识库
        await this.playbookManager.createPlaybook(playbook);

        logger.info(`[Reflector] 生成风险规避 Playbook: ${playbook.name}`);
      } catch (error: any) {
        logger.error(`[Reflector] 生成 Playbook 失败`, error);
      }
    }

    return playbooks;
  }

  /**
   * 提取失败模式
   */
  private extractFailurePatterns(failureTrajectories: Trajectory[]): FailurePattern[] {
    const patternMap = new Map<string, FailurePattern>();

    for (const trajectory of failureTrajectories) {
      for (const step of trajectory.steps) {
        if (step.error_details) {
          // 匹配规则
          const matchedRule = this.matchErrorRule(step.error_details);

          if (matchedRule) {
            const patternKey = `${matchedRule.error_type}`;

            if (!patternMap.has(patternKey)) {
              patternMap.set(patternKey, {
                error_type: matchedRule.error_type,
                occurrences: 0,
                failed_trajectories: [],
                anti_pattern: matchedRule.anti_pattern,
                solution: matchedRule.solution,
                tags: matchedRule.tags,
                confidence: 0
              });
            }

            const pattern = patternMap.get(patternKey)!;
            pattern.occurrences++;
            pattern.failed_trajectories.push(trajectory.task_id);
          }
        }
      }
    }

    // 计算置信度（基于出现次数）
    const patterns = Array.from(patternMap.values());
    patterns.forEach(pattern => {
      pattern.confidence = Math.min(pattern.occurrences / 5, 1.0);  // 5 次及以上为 100%
    });

    return patterns;
  }

  /**
   * 匹配错误规则
   */
  private matchErrorRule(errorDetails: ErrorDetails): ErrorPatternRule | null {
    // 1. 优先精确匹配 ErrorType
    for (const rule of this.errorPatternRules) {
      if (errorDetails.error_type === rule.error_type) {
        return rule;
      }
    }

    // 2. 回退到关键词匹配
    const message = errorDetails.error_message.toLowerCase();
    for (const rule of this.errorPatternRules) {
      if (rule.keywords.some(kw => message.includes(kw))) {
        return rule;
      }
    }

    return null;
  }

  /**
   * 生成风险规避型 Playbook
   */
  private async generateRiskAvoidancePlaybook(
    pattern: FailurePattern,
    allFailures: Trajectory[]
  ): Promise<StrategicPlaybook> {
    // 提取相关的工具名称
    const involvedTools = new Set<string>();
    for (const trajectoryId of pattern.failed_trajectories) {
      const trajectory = allFailures.find(t => t.task_id === trajectoryId);
      if (trajectory) {
        trajectory.steps.forEach(step => {
          if (step.tool_details?.tool_name) {
            involvedTools.add(step.tool_details.tool_name);
          }
        });
      }
    }

    // 提取场景描述（从用户输入）
    const scenarioDescriptions = pattern.failed_trajectories
      .map(id => allFailures.find(t => t.task_id === id)?.user_input)
      .filter(Boolean)
      .slice(0, 3);  // 取前 3 个

    const action: PlaybookAction = {
      step: 1,
      description: pattern.solution,
      expectedOutcome: `避免 ${this.getErrorTypeDisplayName(pattern.error_type)} 错误`,
      resources: Array.from(involvedTools),
      fallbackStrategy: pattern.anti_pattern
    };

    const playbook: StrategicPlaybook = {
      id: this.generatePlaybookId(),
      name: `[风险规避] ${this.getErrorTypeDisplayName(pattern.error_type)}处理模式`,
      type: 'problem_solving',
      version: '1.0.0',
      status: 'active',
      description: `处理 ${this.getErrorTypeDisplayName(pattern.error_type)} 错误的最佳实践（基于 ${pattern.occurrences} 次失败经验）`,
      context: {
        domain: 'general',
        scenario: scenarioDescriptions.join('; ') || '数据处理',
        complexity: 'medium' as const,
        stakeholders: []
      },
      trigger: {
        type: 'pattern',
        condition: `检测到 ${pattern.error_type} 错误`
      },
      actions: [action],
      sourceLearningIds: [],
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      lastOptimized: Date.now(),
      metrics: {
        successRate: 0.0,
        usageCount: 0,
        averageOutcome: 0,
        lastUsed: 0,
        timeToResolution: 0,
        userSatisfaction: 0
      },
      optimizationCount: 0,
      tags: ['failure-derived', 'risk-avoidance', ...pattern.tags],
      author: 'reflector',
      reviewers: []
    };

    // 添加反模式信息到描述中
    playbook.description += `\n反模式: ${pattern.anti_pattern}`;

    return playbook;
  }

  /**
   * 生成 Playbook ID
   */
  private generatePlaybookId(): string {
    return `pb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取错误类型的可读名称
   */
  private getErrorTypeDisplayName(errorType: ErrorType): string {
    const displayNames: Record<ErrorType, string> = {
      [ErrorType.TIMEOUT]: '超时',
      [ErrorType.RATE_LIMIT]: 'API限流',
      [ErrorType.RESOURCE_EXHAUSTED]: '资源耗尽',
      [ErrorType.NETWORK_ERROR]: '网络错误',
      [ErrorType.PERMISSION_DENIED]: '权限不足',
      [ErrorType.INVALID_INPUT]: '输入参数错误',
      [ErrorType.LOGIC_ERROR]: '逻辑错误',
      [ErrorType.UNKNOWN]: '未知错误'
    };

    return displayNames[errorType] || errorType;
  }

  /**
   * 🆕 第二阶段：LLM 辅助分析未匹配错误（可选）
   */
  async analyzeUnknownFailures(
    unmatchedTrajectories: Trajectory[]
  ): Promise<StrategicPlaybook[]> {
    // TODO: Stage 1.5 实现 LLM 聚类分析
    logger.info(`[Reflector] LLM 分析功能待实现（${unmatchedTrajectories.length} 个未匹配案例）`);
    return [];
  }
}
