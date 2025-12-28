/**
 * CompressionService - LLM驱动的上下文压缩服务
 * Phase 2: Context Compression System
 *
 * 职责：
 * - 使用LLM生成高质量的对话摘要
 * - 保留关键信息，过滤冗余内容
 * - 生成语义连贯的压缩消息
 */

import { logger } from '../utils/logger';
import { LLMManager } from '../core/LLMManager';
import { Message } from '../types';
import { ContextConfig } from './types';

export interface CompressionRequest {
  messages: Message[];
  targetTokenCount: number;
  preserveSystemMessages?: boolean;
  customPrompt?: string;
}

export interface CompressionResponse {
  summary: string;
  compressedMessages: Message[];
  tokensBefore: number;
  tokensAfter: number;
  compressionRatio: number;
  metadata: {
    originalMessageCount: number;
    compressedMessageCount: number;
    preservedMessageIds: number[];
    removedMessageIds: number[];
    summaryMethod: string;
    processingTime: number;
  };
}

export class CompressionService {
  private compressionModel: string;
  private compressionTimeout: number;

  constructor(
    private llmManager: LLMManager,
    config: ContextConfig
  ) {
    this.compressionModel = config.compressionModel;
    this.compressionTimeout = config.compressionTimeout;
    logger.debug(`[CompressionService] Initialized with model: ${this.compressionModel}`);
  }

  /**
   * 压缩对话上下文
   */
  async compressContext(request: CompressionRequest): Promise<CompressionResponse> {
    const startTime = Date.now();

    try {
      const { messages, targetTokenCount, preserveSystemMessages = true, customPrompt } = request;

      // 计算原始token数
      const tokensBefore = this.estimateTokenCount(messages);

      // 如果已经低于目标token数，不需要压缩
      if (tokensBefore <= targetTokenCount) {
        return {
          summary: '',
          compressedMessages: messages,
          tokensBefore,
          tokensAfter: tokensBefore,
          compressionRatio: 0,
          metadata: {
            originalMessageCount: messages.length,
            compressedMessageCount: messages.length,
            preservedMessageIds: messages.map((_, i) => i),
            removedMessageIds: [],
            summaryMethod: 'no_compression',
            processingTime: Date.now() - startTime
          }
        };
      }

      // 分离系统消息和对话消息
      const systemMessages = preserveSystemMessages
        ? messages.filter(m => m.role === 'system')
        : [];
      const conversationMessages = messages.filter(m => m.role !== 'system');

      // 生成压缩摘要
      const summary = await this.generateSummary(conversationMessages, customPrompt);

      // 保留最新的N条消息
      const messagesToKeep = this.selectMessagesToKeep(conversationMessages, targetTokenCount);

      // 构建压缩后的消息列表
      const summaryMessage: Message = {
        role: 'assistant',
        content: `**Conversation Summary:**\n${summary}`,
        name: 'summary' // 使用name字段标记这是摘要
      };

      const compressedMessages = [
        ...systemMessages,
        ...messagesToKeep,
        summaryMessage
      ];

      const tokensAfter = this.estimateTokenCount(compressedMessages);
      const compressionRatio = (tokensBefore - tokensAfter) / tokensBefore;

      const processingTime = Date.now() - startTime;
      logger.info(`[CompressionService] Compression completed: ${tokensBefore} -> ${tokensAfter} tokens (${(compressionRatio * 100).toFixed(1)}% saved, ${processingTime}ms)`);

      return {
        summary,
        compressedMessages,
        tokensBefore,
        tokensAfter,
        compressionRatio,
        metadata: {
          originalMessageCount: conversationMessages.length,
          compressedMessageCount: compressedMessages.length,
          preservedMessageIds: messagesToKeep.map((_, i) => i),
          removedMessageIds: conversationMessages
            .filter((_, i) => !messagesToKeep.includes(conversationMessages[i]))
            .map((_, i) => i),
          summaryMethod: 'llm_generated',
          processingTime
        }
      };

    } catch (error: any) {
      logger.error(`[CompressionService] Compression failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 生成对话摘要
   */
  private async generateSummary(messages: Message[], customPrompt?: string): Promise<string> {
    try {
      // 构建压缩提示词
      const prompt = customPrompt || this.buildCompressionPrompt(messages);

      // 调用LLM生成摘要
      const response = await this.llmManager.chat([
        { role: 'user', content: prompt }
      ], {
        model: this.compressionModel,
        max_tokens: 500,
        temperature: 0.3
      });

      const summary = response.choices?.[0]?.message?.content || 'Unable to generate summary';
      const summaryText = typeof summary === 'string' ? summary : JSON.stringify(summary);
      logger.debug(`[CompressionService] Generated summary: ${summaryText.substring(0, 100)}...`);
      return summaryText;

    } catch (error: any) {
      logger.warn(`[CompressionService] LLM compression failed, using fallback: ${error.message}`);
      return this.generateFallbackSummary(messages);
    }
  }

  /**
   * 构建压缩提示词
   */
  private buildCompressionPrompt(messages: Message[]): string {
    const conversationText = messages
      .map((msg, index) => `${index + 1}. ${msg.role.toUpperCase()}: ${this.formatMessageContent(msg.content)}`)
      .join('\n\n');

    return `Please summarize the following conversation, preserving the key information, decisions, and context:

${conversationText}

Requirements:
1. Keep the summary concise but comprehensive (200-300 words)
2. Preserve important details, decisions, and context
3. Maintain the logical flow of the conversation
4. Use a neutral, factual tone
5. Include any important technical details or requirements mentioned

Summary:`;
  }

  /**
   * 格式化消息内容
   */
  private formatMessageContent(content: string | any[]): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      const parts: string[] = [];
      for (const part of content) {
        if (part.type === 'text' && part.text) {
          parts.push(part.text);
        }
      }
      return parts.join(' ');
    }

    return JSON.stringify(content);
  }

  /**
   * 选择需要保留的消息
   * 策略：保留最新的消息，直到接近目标token数
   */
  private selectMessagesToKeep(messages: Message[], targetTokenCount: number): Message[] {
    const result: Message[] = [];
    let totalTokens = 0;

    // 从最新消息开始，逆向遍历
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const messageTokens = this.estimateMessageTokenCount(message);

      // 如果加上这条消息不会超出目标token数，则保留
      if (totalTokens + messageTokens <= targetTokenCount * 0.7) { // 保留30%空间给摘要
        result.unshift(message); // 添加到开头保持顺序
        totalTokens += messageTokens;
      } else {
        break; // 达到目标，停止
      }
    }

    // 如果没有保留任何消息，至少保留最后一条
    if (result.length === 0 && messages.length > 0) {
      result.push(messages[messages.length - 1]);
    }

    logger.debug(`[CompressionService] Kept ${result.length} messages out of ${messages.length}`);
    return result;
  }

  /**
   * 估算单条消息的token数
   */
  private estimateMessageTokenCount(message: Message): number {
    return this.estimateTokenCount([message]);
  }

  /**
   * 估算多条消息的token数
   */
  private estimateTokenCount(messages: Message[]): number {
    let totalChars = 0;

    for (const message of messages) {
      if (typeof message.content === 'string') {
        totalChars += message.content.length;
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'text' && part.text) {
            totalChars += part.text.length;
          }
        }
      }
    }

    // 简单的token估算：英文约4字符/token，中文约2字符/token
    return Math.ceil(totalChars / 3);
  }

  /**
   * 生成备用摘要（当LLM压缩失败时）
   */
  private generateFallbackSummary(messages: Message[]): string {
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');

    const summaryParts = [
      `Conversation with ${userMessages.length} user messages and ${assistantMessages.length} assistant responses.`,
    ];

    // 添加关键信息
    if (messages.length > 0) {
      const firstMessage = messages[0];
      const firstContent = this.formatMessageContent(firstMessage.content);
      summaryParts.push(`Initial topic: ${firstContent.substring(0, 100)}...`);
    }

    if (messages.length > 1) {
      const lastMessage = messages[messages.length - 1];
      const lastContent = this.formatMessageContent(lastMessage.content);
      summaryParts.push(`Latest context: ${lastContent.substring(0, 100)}...`);
    }

    summaryParts.push(`Total conversation length: ${messages.length} messages.`);

    return summaryParts.join(' ');
  }

  /**
   * 验证压缩结果质量
   */
  validateCompression(compressedMessages: Message[], originalMessages: Message[]): {
    isValid: boolean;
    issues: string[];
    score: number;
  } {
    const issues: string[] = [];
    let score = 100;

    // 检查是否包含摘要
    const hasSummary = compressedMessages.some(m =>
      m.name === 'summary' ||
      (typeof m.content === 'string' && m.content.includes('Conversation Summary'))
    );

    if (!hasSummary) {
      issues.push('Missing summary in compressed messages');
      score -= 20;
    }

    // 检查消息数量是否减少
    if (compressedMessages.length >= originalMessages.length) {
      issues.push('Message count not reduced');
      score -= 15;
    }

    // 检查是否保留了系统消息
    const originalSystemMessages = originalMessages.filter(m => m.role === 'system');
    const compressedSystemMessages = compressedMessages.filter(m => m.role === 'system');

    if (originalSystemMessages.length > 0 && compressedSystemMessages.length === 0) {
      issues.push('System messages not preserved');
      score -= 10;
    }

    // 检查token数是否减少
    const originalTokens = this.estimateTokenCount(originalMessages);
    const compressedTokens = this.estimateTokenCount(compressedMessages);

    if (compressedTokens >= originalTokens) {
      issues.push('Token count not reduced');
      score -= 20;
    }

    const isValid = issues.length === 0;
    return { isValid, issues, score };
  }
}
