/**
 * EthicsFilter - 伦理过滤器
 *
 * 负责聊天消息的伦理审查，支持多级审查机制
 */

import { AceEthicsGuard } from '../AceEthicsGuard';
import type { LLMManager } from '../../core/LLMManager';
import type { AceIntegrator } from '../AceIntegrator';
import type { Message, ChatOptions, ChatResult, EthicsReviewResult } from './types';
import { extractTextFromMessage } from '../../utils/message-utils';
import { logger } from '../../utils/logger';

/**
 * 伦理过滤器接口
 */
export interface IEthicsFilter {
  /**
   * 审查消息
   */
  review(messages: Message[], options?: ChatOptions): Promise<EthicsReviewResult>;

  /**
   * 审查用户请求
   */
  reviewRequest(userRequest: string): Promise<EthicsReviewResult>;

  /**
   * 过滤消息内容
   */
  filterMessage(message: Message): Promise<Message>;

  /**
   * 创建伦理拒绝结果
   */
  createRejectionResult(reviewResult: EthicsReviewResult, requestId: string): ChatResult;

  /**
   * 向ACE层报告请求被阻止
   */
  reportRequestRejected(reviewResult: EthicsReviewResult, requestId: string): Promise<void>;

  /**
   * 加载伦理宪法
   */
  loadConstitution(configPath?: string): Promise<string>;

  /**
   * 重新加载伦理宪法
   */
  reloadConstitution(configPath?: string): Promise<string>;

  /**
   * 获取伦理规则
   */
  getEthicalRules(): unknown[];

  /**
   * 清空审查缓存
   */
  clearCache(): void;
}

/**
 * 伦理过滤器实现
 */
export class EthicsFilter implements IEthicsFilter {
  private readonly ethicsGuard: AceEthicsGuard;
  private readonly aceIntegrator: AceIntegrator;

  constructor(ethicsGuard: AceEthicsGuard, aceIntegrator: AceIntegrator) {
    this.ethicsGuard = ethicsGuard;
    this.aceIntegrator = aceIntegrator;
  }

  /**
   * 审查消息数组
   */
  async review(messages: Message[], _options?: ChatOptions): Promise<EthicsReviewResult> {
    const userRequest = extractTextFromMessage(messages[messages.length - 1]) || '';

    if (!userRequest.trim()) {
      return { approved: true };
    }

    return this.reviewRequest(userRequest);
  }

  /**
   * 审查用户请求
   */
  async reviewRequest(userRequest: string): Promise<EthicsReviewResult> {
    try {
      const reviewResult = await this.ethicsGuard.reviewStrategy({
        goal: `User request: ${userRequest.substring(0, 100)}`,
        plan: 'Process user request',
        layer: 'L6_TASK_EXECUTION'
      });

      return {
        approved: reviewResult.approved,
        reason: reviewResult.reason,
        suggestions: reviewResult.suggestions,
        violations: reviewResult.violations
      };
    } catch (error) {
      logger.error('[EthicsFilter] Review failed:', error);
      return {
        approved: false,
        reason: '伦理审查失败'
      };
    }
  }

  /**
   * 过滤单条消息
   */
  async filterMessage(message: Message): Promise<Message> {
    const content = extractTextFromMessage(message);

    if (!content.trim()) {
      return message;
    }

    const reviewResult = await this.reviewRequest(content);

    if (reviewResult.approved) {
      return message;
    }

    return {
      ...message,
      content: `[内容已过滤] ${reviewResult.reason || '不符合伦理要求'}`
    };
  }

  /**
   * 创建伦理拒绝结果
   */
  createRejectionResult(
    reviewResult: EthicsReviewResult,
    _requestId: string
  ): ChatResult {
    const suggestions = reviewResult.suggestions
      ? `\n\n建议：${reviewResult.suggestions.join('; ')}`
      : '';

    return {
      content: `抱歉，我不能处理此请求：${reviewResult.reason}${suggestions}`,
      iterations: 0,
      blockedByEthics: true,
      ethicsReview: reviewResult,
      ethicsLayer: 'L1_ASPIRATIONAL'
    };
  }

  /**
   * 向ACE层报告请求被阻止
   */
  async reportRequestRejected(
    reviewResult: EthicsReviewResult,
    requestId: string
  ): Promise<void> {
    await this.aceIntegrator.sendToLayer('ASPIRATIONAL', {
      type: 'USER_REQUEST_REJECTED',
      content: '用户请求被拒绝',
      metadata: {
        reason: reviewResult.reason,
        suggestions: reviewResult.suggestions,
        requestId,
        timestamp: Date.now()
      }
    });
  }

  /**
   * 加载伦理宪法
   */
  async loadConstitution(configPath?: string): Promise<string> {
    return this.ethicsGuard.loadConstitution(configPath);
  }

  /**
   * 重新加载伦理宪法
   */
  async reloadConstitution(configPath?: string): Promise<string> {
    return this.ethicsGuard.reloadConstitution(configPath);
  }

  /**
   * 获取伦理规则
   */
  getEthicalRules(): unknown[] {
    return this.ethicsGuard.getEthicalRules();
  }

  /**
   * 清空审查缓存
   */
  clearCache(): void {
    this.ethicsGuard.clearCache();
  }
}

/**
 * 创建伦理过滤器
 */
export function createEthicsFilter(
  llmManager: LLMManager,
  aceIntegrator: AceIntegrator
): IEthicsFilter {
  try {
    const ethicsGuard = new AceEthicsGuard(llmManager, aceIntegrator);
    return new EthicsFilter(ethicsGuard, aceIntegrator);
  } catch (error) {
    logger.warn('[EthicsFilter] Failed to create ethics guard, using disabled filter');
    return createDisabledEthicsFilter();
  }
}

/**
 * 创建禁用状态的伦理过滤器
 */
function createDisabledEthicsFilter(): IEthicsFilter {
  return {
    async review(): Promise<EthicsReviewResult> {
      return { approved: true };
    },
    async reviewRequest(): Promise<EthicsReviewResult> {
      return { approved: true };
    },
    async filterMessage(message: Message): Promise<Message> {
      return message;
    },
    createRejectionResult(): ChatResult {
      return {
        content: '服务暂时不可用',
        iterations: 0
      };
    },
    async reportRequestRejected(): Promise<void> {
      // 空实现
    },
    async loadConstitution(): Promise<string> {
      return '';
    },
    async reloadConstitution(): Promise<string> {
      return '';
    },
    getEthicalRules(): unknown[] {
      return [];
    },
    clearCache(): void {
      // 空实现
    }
  };
}
