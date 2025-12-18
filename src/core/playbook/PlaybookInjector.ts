/**
 * PlaybookInjector - Playbook 提示词注入器
 * ==========================================
 *
 * 替代 PlaybookExecutor，将 Playbook 指导内容注入到 LLM 推理链中。
 * 支持注入强度控制、失败回退机制、多 Playbook 同时注入。
 *
 * Features:
 * - 三种注入强度：light (思考链) / medium (用户消息) / intensive (系统提示词)
 * - 支持多 Playbook 同时注入和冲突处理
 * - 完整的错误处理和回退机制
 * - 变量构建和模板渲染
 * - 详细的日志记录和效果追踪
 *
 * Version: 1.0.0
 * Created: 2025-12-18
 */

import { logger } from '../../utils/logger';
import { PlaybookTemplateManager } from './PlaybookTemplateManager';
import { SystemPromptService } from '../../services/SystemPromptService';
import {
  StrategicPlaybook,
  PromptTemplate,
  TemplateRenderResult,
  InjectionContext,
  InjectionResult,
  InjectionOptions,
  MatchingContext,
  GuidanceStep,
  PlaybookAction
} from './types';

// Simple logger interface
interface SimpleLogger {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
}

/**
 * 注入统计信息
 */
export interface InjectionStats {
  totalInjections: number;
  successfulInjections: number;
  failedInjections: number;
  fallbackTriggered: number;
  averageTokenCount: number;
}

/**
 * 多 Playbook 注入上下文
 */
export interface MultiPlaybookContext {
  playbooks: StrategicPlaybook[];
  templates: PromptTemplate[];
  renderedContents: TemplateRenderResult[];
  guidance_levels: Array<'light' | 'medium' | 'intensive'>;
  injection_points: Array<'system_prompt' | 'user_message' | 'thinking_chain'>;
}

/**
 * PlaybookInjector - Playbook 提示词注入器
 *
 * 负责将 Playbook 指导内容注入到 LLM 推理链的各个层面：
 * - 系统提示词层面：最强影响力，全局约束
 * - 用户消息层面：中等影响力，任务级别指导
 * - 思考链层面：最小影响力，仅影响思考过程
 */
export class PlaybookInjector {
  private templateManager: PlaybookTemplateManager;
  private systemPromptService: SystemPromptService;
  private logger: SimpleLogger;
  private stats: InjectionStats;

  constructor(
    templateManager: PlaybookTemplateManager,
    systemPromptService: SystemPromptService,
    loggerInstance: SimpleLogger = logger
  ) {
    this.templateManager = templateManager;
    this.systemPromptService = systemPromptService;
    this.logger = loggerInstance;

    // 初始化统计信息
    this.stats = {
      totalInjections: 0,
      successfulInjections: 0,
      failedInjections: 0,
      fallbackTriggered: 0,
      averageTokenCount: 0
    };
  }

  /**
   * ============================================
   * CORE METHODS - 核心方法
   * ============================================
   */

  /**
   * 主要注入方法 - 将 Playbook 指导注入到推理链
   *
   * @param playbook - 要注入的 Playbook
   * @param context - 匹配上下文
   * @param options - 注入选项
   * @returns 注入结果
   */
  async injectGuidance(
    playbook: StrategicPlaybook,
    context: MatchingContext,
    options: InjectionOptions = {}
  ): Promise<InjectionResult> {
    this.logger.info('[PlaybookInjector] Starting playbook guidance injection', {
      playbookId: playbook.id,
      playbookName: playbook.name,
      guidanceLevel: options.guidance_level || playbook.guidance_level || 'medium'
    });

    this.stats.totalInjections++;

    try {
      // 1. 验证输入参数
      const validation = this.validateInput(playbook, context, options);
      if (!validation.valid) {
        return this.createFailureResult(validation.reason || 'Invalid input');
      }

      // 2. 选择最佳模板
      const template = await this.templateManager.selectBestTemplate(playbook, context, {
        guidance_level: options.guidance_level || playbook.guidance_level || 'medium'
      });

      if (!template) {
        this.logger.warn('[PlaybookInjector] No suitable template found', {
          playbookId: playbook.id
        });
        return this.createFailureResult('no_suitable_template', true);
      }

      // 3. 渲染模板
      const renderResult = await this.templateManager.renderTemplate(
        template.template_id,
        playbook,
        {
          variables: this.buildVariables(playbook, context),
          guidance_level: options.guidance_level || playbook.guidance_level || 'medium',
          language: 'zh', // 默认中文，可配置
          tone: 'professional' // 默认专业语调，可配置
        }
      );

      // 4. 确定注入点
      const injectionPoint = options.injection_point ||
        this.determineInjectionPoint(options.guidance_level || playbook.guidance_level || 'medium');

      // 5. 执行注入
      const injectionContext: InjectionContext = {
        playbook,
        template,
        rendered_content: renderResult.content,
        guidance_level: options.guidance_level || playbook.guidance_level || 'medium',
        injection_point: injectionPoint
      };

      const result = await this.performInjection(injectionContext);

      // 6. 评估模板效果
      await this.templateManager.evaluateTemplate(template.template_id, {
        success: result.success,
        response_time: Date.now()
      });

      // 7. 更新统计信息
      this.updateStats(result, renderResult.token_count);

      this.logger.info('[PlaybookInjector] Playbook guidance injected successfully', {
        playbookId: playbook.id,
        injectionPoint,
        tokenCount: renderResult.token_count,
        success: result.success
      });

      return result;

    } catch (error) {
      this.logger.error('[PlaybookInjector] Playbook guidance injection failed', {
        playbookId: playbook.id,
        error: error instanceof Error ? error.message : String(error)
      });

      this.stats.failedInjections++;

      if (options.fallback_enabled !== false) {
        return this.createFailureResult('injection_error', true);
      }

      throw error;
    }
  }

  /**
   * 注入多个 Playbook
   *
   * @param playbooks - Playbook 数组
   * @param context - 匹配上下文
   * @param options - 注入选项
   * @returns 多个注入结果
   */
  async injectMultiplePlaybooks(
    playbooks: StrategicPlaybook[],
    context: MatchingContext,
    options: InjectionOptions & { max_playbooks?: number } = {}
  ): Promise<InjectionResult[]> {
    this.logger.info('[PlaybookInjector] Starting multiple playbook injection', {
      playbookCount: playbooks.length,
      maxPlaybooks: options.max_playbooks || playbooks.length
    });

    // 限制最大数量
    const limitedPlaybooks = playbooks.slice(0, options.max_playbooks || playbooks.length);

    // 并发注入（使用 Promise.allSettled 以防单个失败影响全部）
    const results = await Promise.allSettled(
      limitedPlaybooks.map(playbook =>
        this.injectGuidance(playbook, context, options)
      )
    );

    // 转换结果
    const injectionResults: InjectionResult[] = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        this.logger.error('[PlaybookInjector] Playbook injection failed', {
          playbookIndex: index,
          error: result.reason
        });
        return this.createFailureResult('injection_error', true);
      }
    });

    // 处理冲突
    const resolvedResults = this.resolveConflicts(injectionResults);

    this.logger.info('[PlaybookInjector] Multiple playbook injection completed', {
      totalPlaybooks: limitedPlaybooks.length,
      successfulInjections: resolvedResults.filter(r => r.success).length,
      failedInjections: resolvedResults.filter(r => !r.success).length
    });

    return resolvedResults;
  }

  /**
   * 执行注入 - 根据注入点执行不同的注入逻辑
   *
   * @param context - 注入上下文
   * @returns 注入结果
   */
  private async performInjection(context: InjectionContext): Promise<InjectionResult> {
    this.logger.debug('[PlaybookInjector] Performing injection', {
      injectionPoint: context.injection_point,
      playbookId: context.playbook.id
    });

    switch (context.injection_point) {
      case 'system_prompt':
        return this.injectToSystemPrompt(context);

      case 'user_message':
        return this.injectToUserMessage(context);

      case 'thinking_chain':
        return this.injectToThinkingChain(context);

      default:
        return this.createFailureResult('invalid_injection_point');
    }
  }

  /**
   * 注入到系统提示词（最强影响力）
   *
   * @param context - 注入上下文
   * @returns 注入结果
   */
  private async injectToSystemPrompt(context: InjectionContext): Promise<InjectionResult> {
    try {
      // 获取当前系统提示词
      const currentPrompt = this.systemPromptService.getSystemPromptTemplate();

      // 格式化指导内容
      const formattedGuidance = this.formatForSystemPrompt(context);

      // 如果有现有提示词，追加；否则直接设置
      let enhancedPrompt: string;
      if (currentPrompt && currentPrompt.trim()) {
        enhancedPrompt = `${currentPrompt.trim()}\n\n${formattedGuidance}`;
      } else {
        enhancedPrompt = formattedGuidance;
      }

      // 更新系统提示词（仅内存中，不保存到文件）
      this.systemPromptService.updateConfig(
        {
          template: enhancedPrompt,
          enabled: true
        },
        false // 不保存到文件
      );

      this.logger.info('[PlaybookInjector] Injected into system prompt', {
        playbookId: context.playbook.id,
        tokenCount: this.estimateTokenCount(enhancedPrompt)
      });

      return {
        success: true,
        injected_content: enhancedPrompt,
        guidance_applied: true,
        fallback_triggered: false
      };

    } catch (error) {
      this.logger.error('[PlaybookInjector] Failed to inject into system prompt', {
        playbookId: context.playbook.id,
        error: error instanceof Error ? error.message : String(error)
      });

      return this.createFailureResult('system_prompt_injection_failed');
    }
  }

  /**
   * 注入到用户消息（中等影响力）
   *
   * @param context - 注入上下文
   * @returns 注入结果
   */
  private async injectToUserMessage(context: InjectionContext): Promise<InjectionResult> {
    try {
      // 格式化指导内容
      const formattedGuidance = this.formatForUserMessage(context);

      this.logger.debug('[PlaybookInjector] Injected into user message', {
        playbookId: context.playbook.id,
        tokenCount: this.estimateTokenCount(formattedGuidance)
      });

      return {
        success: true,
        injected_content: formattedGuidance,
        guidance_applied: true,
        fallback_triggered: false
      };

    } catch (error) {
      this.logger.error('[PlaybookInjector] Failed to inject into user message', {
        playbookId: context.playbook.id,
        error: error instanceof Error ? error.message : String(error)
      });

      return this.createFailureResult('user_message_injection_failed');
    }
  }

  /**
   * 注入到思考链（最小影响力）
   *
   * @param context - 注入上下文
   * @returns 注入结果
   */
  private async injectToThinkingChain(context: InjectionContext): Promise<InjectionResult> {
    try {
      // 格式化思考链指导
      const formattedGuidance = this.formatForThinkingChain(context);

      this.logger.debug('[PlaybookInjector] Injected into thinking chain', {
        playbookId: context.playbook.id,
        tokenCount: this.estimateTokenCount(formattedGuidance)
      });

      return {
        success: true,
        injected_content: formattedGuidance,
        guidance_applied: true,
        fallback_triggered: false
      };

    } catch (error) {
      this.logger.error('[PlaybookInjector] Failed to inject into thinking chain', {
        playbookId: context.playbook.id,
        error: error instanceof Error ? error.message : String(error)
      });

      return this.createFailureResult('thinking_chain_injection_failed');
    }
  }

  /**
   * ============================================
   * HELPER METHODS - 辅助方法
   * ============================================
   */

  /**
   * 确定注入点 - 根据指导强度选择合适的注入位置
   *
   * @param guidance_level - 指导强度
   * @returns 注入点
   */
  determineInjectionPoint(
    guidance_level: 'light' | 'medium' | 'intensive'
  ): 'system_prompt' | 'user_message' | 'thinking_chain' {
    switch (guidance_level) {
      case 'light':
        return 'thinking_chain'; // 轻度：仅影响思考过程

      case 'medium':
        return 'user_message'; // 中度：用户消息级别指导

      case 'intensive':
        return 'system_prompt'; // 重度：系统级别约束

      default:
        this.logger.warn('[PlaybookInjector] Unknown guidance level, using default', {
          guidanceLevel: guidance_level
        });
        return 'user_message';
    }
  }

  /**
   * 构建变量 - 从 Playbook 和上下文中提取变量
   *
   * @param playbook - Playbook
   * @param context - 匹配上下文
   * @returns 变量字典
   */
  buildVariables(playbook: StrategicPlaybook, context: MatchingContext): Record<string, string> {
    const variables: Record<string, string> = {
      // Playbook 核心信息
      playbook_name: playbook.name || '',
      playbook_description: playbook.description || '',
      goal: playbook.description || '',
      steps: this.formatStepsForVariable(playbook.guidance_steps || playbook.actions || []),
      expected_outcome: this.extractExpectedOutcome(playbook),

      // 上下文信息
      user_query: context.userQuery || '',
      domain: playbook.context?.domain || '',
      scenario: playbook.context?.scenario || '',
      complexity: playbook.context?.complexity || '',

      // 时间信息
      current_time: new Date().toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),

      // 作者信息
      author: playbook.author || '系统'
    };

    return variables;
  }

  /**
   * 格式化系统提示词
   *
   * @param context - 注入上下文
   * @returns 格式化的系统提示词
   */
  formatForSystemPrompt(context: InjectionContext): string {
    return `
## Playbook 指导：${context.playbook.name}

**目标**：${context.playbook.description}

**指导内容**：
${context.rendered_content}

---
**说明**：请在处理用户请求时严格参考以上 Playbook 指导，确保按照既定步骤和原则执行任务。`;
  }

  /**
   * 格式化思考链
   *
   * @param context - 注入上下文
   * @returns 格式化的思考链指导
   */
  formatForThinkingChain(context: InjectionContext): string {
    return `【思考指导】根据 Playbook "${context.playbook.name}" 的指导：
${context.rendered_content}

请在思考过程中参考这些要点，确保决策和行动符合 Playbook 的原则和步骤。`;
  }

  /**
   * 格式化用户消息
   *
   * @param context - 注入上下文
   * @returns 格式化的用户消息
   */
  formatForUserMessage(context: InjectionContext): string {
    return `【任务指导 - ${context.playbook.name}】

${context.rendered_content}

请按照以上指导完成当前任务，确保遵循 Playbook 中的步骤和原则。`;
  }

  /**
   * ============================================
   * CONFLICT RESOLUTION - 冲突处理
   * ============================================
   */

  /**
   * 解决多个 Playbook 注入的冲突
   *
   * @param results - 多个注入结果
   * @returns 解决冲突后的结果
   */
  private resolveConflicts(results: InjectionResult[]): InjectionResult[] {
    if (results.length <= 1) {
      return results;
    }

    this.logger.debug('[PlaybookInjector] Resolving conflicts between multiple injections', {
      resultCount: results.length
    });

    // 按优先级排序：system_prompt > user_message > thinking_chain
    const priorityMap = {
      'system_prompt': 3,
      'user_message': 2,
      'thinking_chain': 1
    };

    // 对每个结果附加优先级（从 injected_content 中推断）
    const resultsWithPriority = results.map(result => {
      let priority = 1;
      if (result.injected_content.includes('## Playbook 指导')) {
        priority = 3; // system_prompt
      } else if (result.injected_content.includes('【任务指导')) {
        priority = 2; // user_message
      } else if (result.injected_content.includes('【思考指导')) {
        priority = 1; // thinking_chain
      }

      return { ...result, priority };
    });

    // 冲突处理策略：
    // 1. 如果有 system_prompt 注入，只保留最高优先级的那个
    // 2. 如果没有 system_prompt，保留所有 user_message
    // 3. 如果只有 thinking_chain，全部保留

    const systemPromptResults = resultsWithPriority.filter(r => r.priority === 3);
    const userMessageResults = resultsWithPriority.filter(r => r.priority === 2);
    const thinkingChainResults = resultsWithPriority.filter(r => r.priority === 1);

    let resolvedResults: InjectionResult[] = [];

    if (systemPromptResults.length > 0) {
      // 保留最高优先级的 system_prompt 注入
      const bestSystemPrompt = systemPromptResults.reduce((best, current) =>
        current.injected_content.length > best.injected_content.length ? current : best
      );
      resolvedResults = [bestSystemPrompt];
    } else if (userMessageResults.length > 0) {
      // 合并所有 user_message 注入
      const mergedContent = userMessageResults
        .map(r => r.injected_content)
        .join('\n\n---\n\n');
      resolvedResults = [{
        success: true,
        injected_content: mergedContent,
        guidance_applied: true,
        fallback_triggered: false
      }];
    } else {
      // 保留所有 thinking_chain 注入
      resolvedResults = thinkingChainResults;
    }

    this.logger.info('[PlaybookInjector] Conflict resolution completed', {
      originalCount: results.length,
      resolvedCount: resolvedResults.length
    });

    return resolvedResults;
  }

  /**
   * ============================================
   * VALIDATION & UTILITIES - 验证与工具
   * ============================================
   */

  /**
   * 验证输入参数
   *
   * @param playbook - Playbook
   * @param context - 匹配上下文
   * @param options - 注入选项
   * @returns 验证结果
   */
  private validateInput(
    playbook: StrategicPlaybook,
    context: MatchingContext,
    options: InjectionOptions
  ): { valid: boolean; reason?: string } {
    // 验证 playbook
    if (!playbook) {
      return { valid: false, reason: 'playbook_is_null' };
    }

    if (!playbook.id || !playbook.name) {
      return { valid: false, reason: 'playbook_missing_required_fields' };
    }

    // 验证 context
    if (!context) {
      return { valid: false, reason: 'context_is_null' };
    }

    if (!context.userQuery) {
      return { valid: false, reason: 'user_query_is_empty' };
    }

    // 验证 options
    if (options.guidance_level &&
        !['light', 'medium', 'intensive'].includes(options.guidance_level)) {
      return { valid: false, reason: 'invalid_guidance_level' };
    }

    if (options.injection_point &&
        !['system_prompt', 'user_message', 'thinking_chain'].includes(options.injection_point)) {
      return { valid: false, reason: 'invalid_injection_point' };
    }

    return { valid: true };
  }

  /**
   * 创建失败结果
   *
   * @param reason - 失败原因
   * @param fallback - 是否触发了回退
   * @returns 失败结果
   */
  private createFailureResult(reason: string, fallback: boolean = false): InjectionResult {
    if (fallback) {
      this.stats.fallbackTriggered++;
    } else {
      this.stats.failedInjections++;
    }

    return {
      success: false,
      injected_content: '',
      guidance_applied: false,
      fallback_triggered: fallback,
      reason
    };
  }

  /**
   * 更新统计信息
   *
   * @param result - 注入结果
   * @param tokenCount - Token 数量
   */
  private updateStats(result: InjectionResult, tokenCount: number): void {
    if (result.success) {
      this.stats.successfulInjections++;

      // 更新平均 token 数
      if (this.stats.averageTokenCount === 0) {
        this.stats.averageTokenCount = tokenCount;
      } else {
        this.stats.averageTokenCount = Math.round(
          (this.stats.averageTokenCount + tokenCount) / 2
        );
      }
    }
  }

  /**
   * 估算 Token 数量
   *
   * @param content - 内容
   * @returns 估算的 Token 数
   */
  private estimateTokenCount(content: string): number {
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishChars = content.length - chineseChars;
    return Math.ceil(chineseChars + englishChars / 4);
  }

  /**
   * 格式化步骤（用于变量替换）
   */
  private formatStepsForVariable(steps: GuidanceStep[] | PlaybookAction[]): string {
    if (steps.length === 0) {
      return '无具体步骤';
    }

    return steps
      .map((step, index) => {
        const description = 'description' in step ? step.description : '';
        return `${index + 1}. ${description}`;
      })
      .join(' → ');
  }

  /**
   * 提取预期结果
   */
  private extractExpectedOutcome(playbook: StrategicPlaybook): string {
    const outcomes: string[] = [];

    // 从 guidance_steps 提取
    if (playbook.guidance_steps) {
      for (const step of playbook.guidance_steps) {
        if (step.expected_outcome) {
          outcomes.push(step.expected_outcome);
        }
      }
    }

    // 从 actions 提取（兼容旧版）
    if (playbook.actions) {
      for (const action of playbook.actions) {
        if (action.expectedOutcome) {
          outcomes.push(action.expectedOutcome);
        }
      }
    }

    return outcomes.length > 0
      ? outcomes.join('; ')
      : '根据 Playbook 指导成功完成任务。';
  }

  /**
   * ============================================
   * GETTERS - 获取器
   * ============================================
   */

  /**
   * 获取注入统计信息
   */
  getStats(): Readonly<InjectionStats> {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      totalInjections: 0,
      successfulInjections: 0,
      failedInjections: 0,
      fallbackTriggered: 0,
      averageTokenCount: 0
    };

    this.logger.info('[PlaybookInjector] Statistics reset');
  }
}
