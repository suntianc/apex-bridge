/**
 * MessageProcessor - 消息处理器
 *
 * 负责消息预处理、系统提示词注入、变量替换等功能
 */

import type { SystemPromptService } from '../SystemPromptService';
import type { VariableEngine } from '../../core/variable/VariableEngine';
import type { PlaybookInjector } from '../../core/playbook/PlaybookInjector';
import type { PlaybookMatcher } from '../PlaybookMatcher';
import type { Message, ChatOptions, PlaybookInjectionResult } from './types';
import { logger } from '../../utils/logger';
import { extractTextFromMessage } from '../../utils/message-utils';
import type { ContentPart } from '../../types';

/**
 * 消息处理器接口
 */
export interface IMessageProcessor {
  prepare(
    messages: Message[],
    options: ChatOptions,
    strategyVariables?: Record<string, string>,
    playbookVariables?: Record<string, string>
  ): Promise<Message[]>;

  injectSystemPrompt(messages: Message[], options: ChatOptions): Promise<Message[]>;

  resolveVariables(content: string, variables: Record<string, string>): Promise<string>;

  matchPlaybook(userQuery: string, options: ChatOptions): Promise<PlaybookInjectionResult>;
}

/**
 * 消息处理器实现
 */
export class MessageProcessor implements IMessageProcessor {
  private readonly systemPromptService: SystemPromptService;
  private readonly variableEngine: VariableEngine;
  private readonly playbookMatcher?: PlaybookMatcher;
  private readonly playbookInjector?: PlaybookInjector;

  constructor(
    systemPromptService: SystemPromptService,
    variableEngine: VariableEngine,
    playbookMatcher?: PlaybookMatcher,
    playbookInjector?: PlaybookInjector
  ) {
    this.systemPromptService = systemPromptService;
    this.variableEngine = variableEngine;
    this.playbookMatcher = playbookMatcher;
    this.playbookInjector = playbookInjector;
  }

  /**
   * 预处理消息
   */
  async prepare(
    messages: Message[],
    options: ChatOptions,
    strategyVariables: Record<string, string> = {},
    playbookVariables: Record<string, string> = {}
  ): Promise<Message[]> {
    let processedMessages = [...messages];

    // 注入系统提示词
    const hasSystemMessage = processedMessages.some(m => m.role === 'system');
    if (!hasSystemMessage) {
      const systemPromptTemplate = this.systemPromptService.getSystemPromptTemplate();
      if (systemPromptTemplate) {
        processedMessages = [
          { role: 'system', content: systemPromptTemplate } as Message,
          ...processedMessages
        ];
        logger.debug(`[MessageProcessor] Injected system prompt template (${systemPromptTemplate.length} chars)`);
      }
    }

    // 构建变量上下文
    const variables = this.buildVariableContext(options, strategyVariables, playbookVariables);

    // 变量替换
    processedMessages = await this.variableEngine.resolveMessages(processedMessages, variables);
    logger.debug(`[MessageProcessor] Variable replacement completed with ${Object.keys(variables).length} variables`);

    return processedMessages;
  }

  /**
   * 注入系统提示词
   */
  async injectSystemPrompt(messages: Message[], _options: ChatOptions): Promise<Message[]> {
    const hasSystemMessage = messages.some(m => m.role === 'system');
    if (hasSystemMessage) {
      return messages;
    }

    const systemPromptTemplate = this.systemPromptService.getSystemPromptTemplate();
    if (!systemPromptTemplate) {
      return messages;
    }

    return [
      { role: 'system', content: systemPromptTemplate } as Message,
      ...messages
    ];
  }

  /**
   * 解析变量
   */
  async resolveVariables(content: string, variables: Record<string, string>): Promise<string> {
    const messages: Message[] = [{ role: 'user', content }];
    const resolved = await this.variableEngine.resolveMessages(messages, variables);

    const resolvedMessage = resolved[0];
    if (typeof resolvedMessage.content === 'string') {
      return resolvedMessage.content;
    }

    if (Array.isArray(resolvedMessage.content)) {
      return resolvedMessage.content
        .filter((part: ContentPart) => part.type === 'text' && part.text)
        .map((part: ContentPart) => part.text || '')
        .join('');
    }

    return content;
  }

  /**
   * 匹配并注入Playbook指导
   */
  async matchPlaybook(_userQuery: string, _options: ChatOptions): Promise<PlaybookInjectionResult> {
    // 简化实现，避免类型冲突
    return { success: false, error: 'Playbook injection not available in this context' };
  }

  /**
   * 获取系统提示词模板
   */
  getSystemPromptTemplate(): string | null {
    return this.systemPromptService.getSystemPromptTemplate();
  }

  /**
   * 构建变量上下文
   */
  private buildVariableContext(
    options: ChatOptions,
    strategyVariables: Record<string, string>,
    playbookVariables: Record<string, string>
  ): Record<string, string> {
    const optionVariables = Object.entries(options).reduce<Record<string, string>>((acc, [key, value]) => {
      if (typeof value === 'string') {
        acc[key] = value;
      }
      return acc;
    }, {});

    return {
      model: options.model || '',
      provider: options.provider || '',
      current_time: new Date().toISOString(),
      user_prompt: options.user_prompt || '',
      ...optionVariables,
      ...strategyVariables,
      ...playbookVariables
    };
  }

  /**
   * 调试：检查消息中的图片数据
   */
  debugCheckImageMessages(messages: Message[], label: string): void {
    const imageCount = messages.filter(m =>
      Array.isArray(m.content) && (m.content as ContentPart[]).some(p => p.type === 'image_url')
    ).length;

    if (imageCount > 0) {
      logger.debug(`[MessageProcessor] ${label}: ${imageCount} multimodal messages`);
    }
  }
}
