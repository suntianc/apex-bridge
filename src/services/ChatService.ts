/**
 * ChatService - 聊天服务（简化版，无ACE依赖）
 * 处理聊天请求的完整生命周期
 */

import { ProtocolEngine } from '../core/ProtocolEngine';
import { LLMManager } from '../core/LLMManager';
import { EventBus } from '../core/EventBus';
import {
  Message,
  ChatOptions,
  ToolDefinition
} from '../types';
import { logger } from '../utils/logger';
import { SystemPromptService } from './SystemPromptService';
import { generateRequestId } from '../utils/request-id';
import { IWebSocketManager } from '../api/websocket/WebSocketManager';
import { ConversationHistoryService, type ConversationMessage } from './ConversationHistoryService';
import { SessionManager } from './SessionManager';
import { RequestTracker } from './RequestTracker';
import type { ChatStrategy } from '../strategies/ChatStrategy';
import { SingleRoundStrategy } from '../strategies/SingleRoundStrategy';
import { ReActStrategy } from '../strategies/ReActStrategy';
import { extractTextFromMessage } from '../utils/message-utils';
import { parseAggregatedContent } from '../api/utils/stream-parser';
import { VariableEngine } from '../core/variable/VariableEngine';
import { ToolRetrievalService } from './ToolRetrievalService';
import { getSkillManager } from './SkillManager';

export class ChatService {

  private llmManager: LLMManager;
  private conversationHistoryService: ConversationHistoryService;

  // 系统提示词服务
  private systemPromptService: SystemPromptService;

  // 会话管理器
  private sessionManager: SessionManager;

  // 请求追踪器
  private requestTracker: RequestTracker;

  // 变量引擎（统一的变量解析）
  private variableEngine: VariableEngine;

  // 策略数组
  private strategies: ChatStrategy[];

  constructor(
    private protocolEngine: ProtocolEngine,
    llmManager: LLMManager,
    private eventBus: EventBus
  ) {
    this.llmManager = llmManager;
    this.conversationHistoryService = ConversationHistoryService.getInstance();

    // 初始化系统提示词服务（从Markdown文件读取）
    this.systemPromptService = new SystemPromptService('./config');
    logger.debug('[ChatService] SystemPromptService initialized (Markdown format)');

    // 初始化会话管理器（简化版，无ACE依赖）
    this.sessionManager = new SessionManager(this.conversationHistoryService);

    // 初始化请求追踪器（5分钟超时）
    this.requestTracker = new RequestTracker(null, 300000);

    // 初始化变量引擎（30秒缓存）
    this.variableEngine = new VariableEngine({ cacheTtlMs: 30000 });

    // 初始化策略
    this.strategies = [
      new ReActStrategy(this.llmManager, this.conversationHistoryService),
      new SingleRoundStrategy(this.llmManager, this.conversationHistoryService)
    ];
    logger.debug('[ChatService] Chat strategies initialized');

    logger.debug('ChatService initialized (simplified, no ACE)');
  }

  /**
   * 设置WebSocket管理器
   */
  setWebSocketManager(manager: IWebSocketManager): void {
    this.requestTracker = new RequestTracker(manager, 300000);
    logger.debug('[ChatService] WebSocketManager attached to RequestTracker');
  }

  /**
   * 注册活动请求（代理到RequestTracker）
   */
  private registerRequest(requestId: string, abortController: AbortController, context?: any): void {
    this.requestTracker.register(requestId, abortController, context);
  }

  /**
   * 中断请求（代理到RequestTracker）
   */
  async interruptRequest(requestId: string): Promise<boolean> {
    return this.requestTracker.interrupt(requestId);
  }

  /**
   * 选择聊天策略
   */
  private async selectStrategy(options: ChatOptions): Promise<ChatStrategy> {
    for (const strategy of this.strategies) {
      if (strategy.supports(options)) {
        logger.debug(`[ChatService] Selected strategy: ${strategy.getName()}`);
        return strategy;
      }
    }

    // 默认使用单轮策略
    const defaultStrategy = this.strategies.find(s => s.getName() === 'SingleRoundStrategy');
    if (!defaultStrategy) {
      throw new Error('No suitable chat strategy found');
    }
    return defaultStrategy;
  }

  /**
   * 更新会话元数据（代理到SessionManager）
   */
  private async updateSessionMetadata(sessionId: string, usage: any): Promise<void> {
    await this.sessionManager.updateMetadata(sessionId, { total_tokens: usage.total_tokens, prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens });
  }

  /**
   * 统一的消息预处理：注入系统提示词 + 变量替换
   * @param messages 原始消息数组
   * @param options 聊天选项
   * @param strategyVariables 策略提供的额外变量（如 available_tools）
   */
  private async prepareMessages(
    messages: Message[],
    options: ChatOptions,
    strategyVariables: Record<string, string> = {}
  ): Promise<Message[]> {
    let processedMessages = [...messages];

    // DEBUG: 检查输入消息中的图片数据
    const inputImageCount = messages.filter(m =>
      Array.isArray(m.content) && m.content.some(p => p.type === 'image_url')
    ).length;
    if (inputImageCount > 0) {
      logger.debug(`[ChatService.prepareMessages] Input has ${inputImageCount} multimodal messages`);
      messages.forEach((msg, idx) => {
        if (Array.isArray(msg.content)) {
          msg.content.forEach((part, pIdx) => {
            if (part.type === 'image_url') {
              const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
              if (url) {
                logger.debug(`[ChatService.prepareMessages] Input msg[${idx}].content[${pIdx}]: ${url.length} chars, has ;base64,: ${url.includes(';base64,')}`);
              }
            }
          });
        }
      });
    }

    // 1. 注入系统提示词（如果没有）
    const hasSystemMessage = processedMessages.some(m => m.role === 'system');
    if (!hasSystemMessage) {
      const systemPromptTemplate = this.systemPromptService.getSystemPromptTemplate();
      if (systemPromptTemplate) {
        processedMessages = [
          { role: 'system', content: systemPromptTemplate } as Message,
          ...processedMessages
        ];
        logger.debug(`[ChatService] Injected system prompt template (${systemPromptTemplate.length} chars)`);
      }
    }

    // 2. 构建统一的变量上下文
    const variables: Record<string, string> = {
      // 基础变量
      model: options.model || '',
      provider: options.provider || '',
      current_time: new Date().toISOString(),
      user_prompt: options.user_prompt || '',
      // 从 options 中提取字符串类型的变量
      ...Object.entries(options).reduce((acc, [key, value]) => {
        if (typeof value === 'string') {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, string>),
      // 策略提供的变量（如 available_tools）
      ...strategyVariables
    };

    // 3. 统一变量替换
    processedMessages = await this.variableEngine.resolveMessages(processedMessages, variables);
    logger.debug(`[ChatService] Variable replacement completed with ${Object.keys(variables).length} variables`);

    // DEBUG: 检查输出消息中的图片数据
    const outputImageCount = processedMessages.filter(m =>
      Array.isArray(m.content) && m.content.some(p => p.type === 'image_url')
    ).length;
    if (outputImageCount > 0) {
      logger.debug(`[ChatService.prepareMessages] Output has ${outputImageCount} multimodal messages`);
      processedMessages.forEach((msg, idx) => {
        if (Array.isArray(msg.content)) {
          msg.content.forEach((part, pIdx) => {
            if (part.type === 'image_url') {
              const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
              if (url) {
                logger.debug(`[ChatService.prepareMessages] Output msg[${idx}].content[${pIdx}]: ${url.length} chars, has ;base64,: ${url.includes(';base64,')}`);
              }
            }
          });
        }
      });
    }

    return processedMessages;
  }

  /**
   * 获取或创建会话（代理到SessionManager）
   */
  private async getOrCreateSession(agentId: string | undefined, userId: string | undefined, conversationId: string): Promise<string | null> {
    return this.sessionManager.getOrCreate(agentId, userId, conversationId);
  }

  /**
   * 统一保存对话历史（包含思考过程）
   */
  private async saveConversationHistory(
    conversationId: string,
    messages: Message[],
    aiContent: string,
    thinkingProcess?: string[],
    isReAct: boolean = false
  ): Promise<void> {
    try {
      // 1. 检查历史记录数量
      const count = await this.conversationHistoryService.getMessageCount(conversationId);
      const messagesToSave: Message[] = [];

      // 2. 准备要保存的消息（统一逻辑）
      if (count === 0) {
        // 新对话：保存所有非assistant、非system消息
        messagesToSave.push(...messages.filter(m =>
          m.role !== 'assistant' && m.role !== 'system'
        ));
      } else {
        // 已有对话：只保存最后一条非assistant、非system消息
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role !== 'assistant' && lastMessage.role !== 'system') {
          messagesToSave.push(lastMessage);
        }
      }

      // 3. 构建AI回复内容（统一格式）
      let assistantContent = aiContent;
      const parsed = parseAggregatedContent(assistantContent);
      if (isReAct) {
        const thinkingParts = [];
        if (thinkingProcess?.length > 0) {
          const extractedThinking = this.extractThinkingContent(thinkingProcess);
          thinkingParts.push(`<thinking>${extractedThinking}</thinking>`);
        }
        thinkingParts.push(
          parsed.reasoning
          ? `<thinking>${parsed.reasoning}</thinking> ${parsed.content}`
          : parsed.content
        );
        assistantContent = thinkingParts.join(' ');
      } else if (!isReAct) {
        // 普通模式：解析特殊格式（如glm-4）
        assistantContent = parsed.reasoning
          ? `<thinking>${parsed.reasoning}</thinking> ${parsed.content}`
          : parsed.content;
      }

      // 4. 添加AI回复
      messagesToSave.push({
        role: 'assistant',
        content: assistantContent
      });

      // 5. 保存到数据库
      await this.conversationHistoryService.saveMessages(conversationId, messagesToSave);
      logger.debug(`[ChatService] Saved ${messagesToSave.length} messages to history`);
    } catch (err: any) {
      logger.warn(`[ChatService] Failed to save conversation history: ${err.message}`);
    }
  }

  /**
   * 提取思考过程内容
   */
  private extractThinkingContent(thinkingProcess: string[]): string {
    const extracted: string[] = [];
    for (const chunk of thinkingProcess) {
      try {
        const cleaned = chunk.replace(/^data:\s*/, '').trim();
        if (cleaned && cleaned !== '[DONE]') {
          if (cleaned.includes('}{')) {
            const jsonObjects = cleaned.split(/\}\{/);
            for (let i = 0; i < jsonObjects.length; i++) {
              let jsonStr = jsonObjects[i];
              if (i > 0) jsonStr = '{' + jsonStr;
              if (i < jsonObjects.length - 1) jsonStr = jsonStr + '}';
              if (jsonStr) {
                const parsed = JSON.parse(jsonStr);
                if (parsed.reasoning_content) {
                  extracted.push(parsed.reasoning_content);
                }
              }
            }
          } else {
            const parsed = JSON.parse(cleaned);
            if (parsed.reasoning_content) {
              extracted.push(parsed.reasoning_content);
            }
          }
        }
      } catch (error) {
        extracted.push(chunk);
      }
    }
    return extracted.join('');
  }

  /**
   * 主要入口：处理聊天消息
   */
  async processMessage(messages: Message[], options: ChatOptions = {}): Promise<any> {
    const requestId = options.requestId || generateRequestId();

    logger.info(`[ChatService] Processing message (requestId: ${requestId}, stream: ${options.stream || false})`);

    try {
      // 1. 获取或创建会话（必须在处理消息之前）
      const conversationId = options.conversationId as string | undefined;

      if (conversationId) {
        const sessionId = await this.getOrCreateSession(
          options.agentId,
          options.userId,
          conversationId
        );

        if (sessionId) {
          options.sessionId = sessionId;
          logger.debug(`[ChatService] Processing message with session: ${sessionId}`);
        }
      } else {
        logger.debug('[ChatService] Processing message without session (no conversationId)');
      }

      // 2. 选择策略（原有逻辑，保持向后兼容）
      const strategy = await this.selectStrategy(options);

      // 3. 调用策略的 prepare 方法获取需要注入的变量
      let strategyVariables: Record<string, string> = {};
      if (strategy.prepare) {
        const prepareResult = await strategy.prepare(messages, options);
        strategyVariables = prepareResult.variables;
        logger.debug(`[ChatService] Strategy ${strategy.getName()} provided ${Object.keys(strategyVariables).length} variables`);
      }

      // 4. 统一消息预处理（系统提示词注入 + 变量替换）
      const processedMessages = await this.prepareMessages(messages, options, strategyVariables);

      // 5. 检查是否为流式模式
      if (options.stream) {
        // 流式模式，返回AsyncGenerator
        return strategy.execute(processedMessages, options) as AsyncIterableIterator<any>;
      } else {
        // 普通模式，返回ChatResult
        const result = await strategy.execute(processedMessages, options) as any;

        // 6. 更新会话元数据（由ChatService处理，避免循环依赖）
        if (options.sessionId && result?.usage) {
          await this.updateSessionMetadata(options.sessionId, result.usage).catch(err => {
            logger.warn(`[ChatService] Failed to update session metadata: ${err.message}`);
          });
        }

        // 7. 统一保存对话历史（非流式模式）
        if (options.conversationId) {
          await this.saveConversationHistory(
            options.conversationId,
            messages,  // 保存原始消息，不含系统提示词
            result.content,
            result.rawThinkingProcess,
            options.selfThinking?.enabled
          );
        }

        return result;
      }

    } catch (error: any) {
      logger.error('Error in ChatService.processMessage:', error);
      throw error;
    }
  }

  /**
   * 任务复杂度评估（供外部调用或未来扩展）
   * 评估用户请求的复杂度，返回0-1之间的分数
   */
  estimateTaskComplexity(query: string): number {
    let score = 0;

    // 关键词检测
    const complexKeywords = [
      '项目', '系统', '应用', '网站', '平台',
      '开发', '构建', '实现', '设计',
      '完整', '全面', '综合'
    ];

    complexKeywords.forEach(keyword => {
      if (query.includes(keyword)) {
        score += 0.15;
      }
    });

    // 长度检测
    if (query.length > 100) {
      score += 0.2;
    } else if (query.length > 50) {
      score += 0.1;
    }

    // 多步骤检测
    const stepKeywords = ['首先', '然后', '接着', '最后', '第一', '第二', '第三'];
    stepKeywords.forEach(keyword => {
      if (query.includes(keyword)) {
        score += 0.1;
      }
    });

    // 列表检测（1. 2. 或 - 等）
    if (/\d+[\.\)]\s|^[-*]\s/m.test(query)) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  /**
   * WebSocket适配方法 - 创建聊天完成（兼容OpenAI格式）
   */
  async createChatCompletion(params: {
    messages: Message[];
    model?: string;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
  }): Promise<any> {
    const { messages, model, temperature, max_tokens, stream } = params;

    const options: ChatOptions = {
      model,
      temperature,
      max_tokens,
      stream: false // 这个方法不支持流式
    };

    if (stream) {
      throw new Error('createChatCompletion不支持流式响应，请使用createStreamChatCompletion');
    }

    return this.processMessage(messages, options);
  }

  /**
   * WebSocket适配方法 - 创建流式聊天完成
   */
  async *createStreamChatCompletion(params: {
    messages: Message[];
    model?: string;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
  }): AsyncIterableIterator<any> {
    const { messages, model, temperature, max_tokens } = params;

    const options: ChatOptions = {
      model,
      temperature,
      max_tokens,
      stream: true
    };

    for await (const chunk of this.streamMessage(messages, options)) {
      yield {
        type: 'stream_chunk',
        payload: chunk
      };
    }
  }

  async *streamMessage(
    messages: Message[],
    options: ChatOptions = {},
    abortSignal?: AbortSignal
  ): AsyncIterableIterator<string> {
    const requestId = options.requestId || generateRequestId();
    const abortController = new AbortController();

    logger.info(`[ChatService] Streaming message (requestId: ${requestId})`);

    // 收集完整响应，用于保存对话历史
    let fullContent = '';
    const collectedThinking: string[] = [];

    try {
      // 注册请求（用于中断）
      this.registerRequest(requestId, abortController, { messages, options });

      // 监听外部中断信号
      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          abortController.abort();
          logger.debug(`[ChatService] External abort signal received for ${requestId}`);
        });
      }

      // 1. 选择策略
      const strategy = await this.selectStrategy(options);

      // 2. 调用策略的 prepare 方法获取需要注入的变量
      let strategyVariables: Record<string, string> = {};
      if (strategy.prepare) {
        const prepareResult = await strategy.prepare(messages, options);
        strategyVariables = prepareResult.variables;
        logger.debug(`[ChatService] Strategy ${strategy.getName()} provided ${Object.keys(strategyVariables).length} variables`);
      }

      // 3. 统一消息预处理（系统提示词注入 + 变量替换）
      const processedMessages = await this.prepareMessages(messages, options, strategyVariables);

      // 4. 执行流式处理
      for await (const chunk of strategy.stream(processedMessages, options, abortController.signal)) {
        if (abortController.signal.aborted) {
          logger.debug(`[ChatService] Stream aborted for ${requestId}`);
          break;
        }

        // 尝试解析 JSON 收集 thinking 和 content
        try {
          const parsed = JSON.parse(chunk);
          if (parsed.reasoning_content) {
            collectedThinking.push(parsed.reasoning_content);
          }
          if (parsed.content) {
            fullContent += parsed.content;
          }
        } catch {
          // 非 JSON 格式，直接收集为 content
          fullContent += chunk;
        }

        yield chunk;
      }

    } finally {
      // 清理请求追踪
      this.requestTracker.unregister(requestId);
      logger.debug(`[ChatService] Stream completed for ${requestId}`);

      // 统一保存对话历史（流式模式）
      const conversationId = options.conversationId;
      if (conversationId && !abortController.signal.aborted) {
        await this.saveConversationHistory(
          conversationId,
          messages,  // 保存原始消息，不含系统提示词
          fullContent,
          collectedThinking.length > 0 ? collectedThinking : undefined,
          options.selfThinking?.enabled
        );
      }
    }
  }

  /**
   * 获取服务状态
   */
  getStatus(): any {
    return {
      activeRequests: this.requestTracker.getActiveRequestCount(),
      sessionCount: this.sessionManager.getSessionCount(),
      llmManagerReady: !!this.llmManager,
      strategies: this.strategies ? this.strategies.map(s => s.getName()) : []
    };
  }

  /**
   * 获取会话管理器（供外部使用）
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * 获取请求追踪器（供外部使用）
   */
  getRequestTracker(): RequestTracker {
    return this.requestTracker;
  }

  /**
   * 获取变量引擎（供外部使用）
   */
  getVariableEngine(): VariableEngine {
    return this.variableEngine;
  }

  /**
   * 结束会话（代理到SessionManager）
   */
  async endSession(conversationId: string): Promise<void> {
    await this.sessionManager.archive(conversationId);
  }

  /**
   * 获取所有有对话历史的会话ID（代理到ConversationHistoryService）
   */
  async getAllConversationsWithHistory(): Promise<string[]> {
    return this.conversationHistoryService.getAllConversationIds();
  }

  /**
   * 获取会话ID通过对话ID（代理到SessionManager）
   */
  getSessionIdByConversationId(conversationId: string): string | undefined {
    return this.sessionManager.getSessionId(conversationId);
  }

  /**
   * 获取对话历史（代理到ConversationHistoryService）
   */
  async getConversationHistory(conversationId: string, limit: number = 100, offset: number = 0): Promise<Message[]> {
    return this.conversationHistoryService.getMessages(conversationId, limit, offset);
  }

  /**
   * 获取对话消息数量（代理到ConversationHistoryService）
   */
  async getConversationMessageCount(conversationId: string): Promise<number> {
    return this.conversationHistoryService.getMessageCount(conversationId);
  }

  /**
   * 获取对话最后一条消息（代理到ConversationHistoryService）
   */
  async getConversationLastMessage(conversationId: string): Promise<ConversationMessage | null> {
    return this.conversationHistoryService.getLastMessage(conversationId);
  }

  /**
   * 获取活动请求数量（代理到RequestTracker）
   */
  getActiveRequestCount(): number {
    return this.requestTracker.getActiveRequestCount();
  }

  /**
   * 停止清理定时器（代理到RequestTracker）
   */
  stopCleanupTimer(): void {
    this.requestTracker.stopCleanupTimer();
  }
}
