/**
 * ChatService - 聊天服务（重构版）
 * 处理聊天请求的完整生命周期
 *
 * 职责：
 * - 协调各子服务完成聊天请求处理
 * - 不再直接创建内部服务，而是通过依赖注入
 */

import { ProtocolEngine } from "../core/ProtocolEngine";
import { LLMManager } from "../core/LLMManager";
import { EventBus } from "../core/EventBus";
import { Message, ChatOptions } from "../types";
import { logger } from "../utils/logger";
import { generateRequestId } from "../utils/request-id";
import { IWebSocketManager } from "../api/websocket/WebSocketManager";
import { ConversationHistoryService, type ConversationMessage } from "./ConversationHistoryService";
import { SessionManager } from "./SessionManager";
import { RequestTracker } from "./RequestTracker";
import type { ChatStrategy, ChatResult } from "../strategies/ChatStrategy";
import { MessagePreprocessor } from "./chat/MessagePreprocessor";
import { ConversationSaver } from "./chat/ConversationSaver";
import { StrategySelector } from "./chat/StrategySelector";
import { TIMEOUT } from "../constants";
import { ModelRegistry } from "./ModelRegistry";
import { getContextCompressionService } from "./context-compression";

export class ChatService {
  private conversationHistoryService: ConversationHistoryService;

  constructor(
    private protocolEngine: ProtocolEngine,
    private llmManager: LLMManager,
    private eventBus: EventBus,
    private messagePreprocessor: MessagePreprocessor,
    private conversationSaver: ConversationSaver,
    private strategySelector: StrategySelector,
    private sessionManager: SessionManager,
    private requestTracker: RequestTracker
  ) {
    // 初始化 ConversationHistoryService
    this.conversationHistoryService = ConversationHistoryService.getInstance();
    logger.debug("[ChatService] Initialized with ConversationHistoryService");
  }

  /**
   * 设置WebSocket管理器
   */
  setWebSocketManager(manager: IWebSocketManager): void {
    this.requestTracker = new RequestTracker(manager, TIMEOUT.SKILL_CACHE_TTL);
    logger.debug("[ChatService] WebSocketManager attached to RequestTracker");
  }

  /**
   * 注册活动请求（代理到RequestTracker）
   */
  private registerRequest(
    requestId: string,
    abortController: AbortController,
    context?: any
  ): void {
    this.requestTracker.register(requestId, abortController, context);
  }

  /**
   * 中断请求（代理到RequestTracker）
   */
  async interruptRequest(requestId: string): Promise<boolean> {
    return this.requestTracker.interrupt(requestId);
  }

  /**
   * 获取或创建会话（代理到SessionManager）
   */
  private async getOrCreateSession(
    agentId: string | undefined,
    userId: string | undefined,
    conversationId: string
  ): Promise<string | null> {
    return this.sessionManager.getOrCreate(agentId, userId, conversationId);
  }

  /**
   * 主要入口：处理聊天消息
   */
  async processMessage(messages: Message[], options: ChatOptions = {}): Promise<any> {
    const requestId = options.requestId || generateRequestId();

    logger.info(
      `[ChatService] Processing message (requestId: ${requestId}, stream: ${options.stream || false})`
    );

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
        logger.debug("[ChatService] Processing message without session (no conversationId)");
      }

      // 2. 选择策略
      const strategy = this.strategySelector.select(options);

      // 3. 调用策略的 prepare 方法获取需要注入的变量
      let strategyVariables: Record<string, string> = {};
      if (strategy.prepare) {
        const prepareResult = await strategy.prepare(messages, options);
        strategyVariables = prepareResult.variables;
        logger.debug(
          `[ChatService] Strategy ${strategy.getName()} provided ${Object.keys(strategyVariables).length} variables`
        );
      }

      // 4. 统一消息预处理（系统提示词注入 + 变量替换）
      const preprocessResult = await this.messagePreprocessor.preprocess(
        messages,
        options,
        strategyVariables
      );
      const processedMessages = preprocessResult.messages;

      // 5. 应用上下文压缩
      // 默认启用（遵循 ContextCompressionService.defaultConfig.enabled = true）
      let messagesForLLM = processedMessages;
      const compressionEnabled = options.contextCompression?.enabled ?? true;
      if (compressionEnabled) {
        // 获取模型上下文限制
        const model = ModelRegistry.getInstance().findModel(
          options.provider || "default",
          options.model || "default"
        );
        const contextLimit = model?.modelConfig?.contextWindow || 8000;

        // 应用压缩
        const compressionResult = await getContextCompressionService().compress(
          processedMessages,
          contextLimit,
          options
        );

        messagesForLLM = compressionResult.messages;

        // 记录压缩统计信息
        if (compressionResult.stats.savingsRatio > 0) {
          logger.debug(
            `[ChatService] Context compression: ${(compressionResult.stats.savingsRatio * 100).toFixed(1)}% saved, ` +
              `${compressionResult.stats.originalTokens} -> ${compressionResult.stats.compactedTokens} tokens`
          );
        }
      }

      // 6. 检查是否为流式模式
      if (options.stream) {
        // 流式模式，返回 AsyncGenerator
        return strategy.execute(messagesForLLM, options) as AsyncIterableIterator<any>;
      } else {
        // 普通模式，返回 ChatResult
        const result = (await strategy.execute(messagesForLLM, options)) as ChatResult;

        // 7. 更新会话元数据
        if (options.sessionId && result?.usage) {
          await this.conversationSaver
            .updateSessionMetadata(options.sessionId, result.usage)
            .catch((err: Error) => {
              logger.error(`[ChatService] Failed to update session metadata: ${err.message}`, {
                stack: err.stack,
                sessionId: options.sessionId,
                requestId,
              });
            });
        }

        // 8. 统一保存对话历史（非流式模式）
        if (options.conversationId) {
          await this.conversationSaver.save(
            options.conversationId,
            messages, // 保存原始消息，不含系统提示词
            result.content,
            result.rawThinkingProcess,
            options.selfThinking?.enabled
          );
        }

        return result;
      }
    } catch (error: any) {
      logger.error("Error in ChatService.processMessage:", error);
      throw error;
    }
  }

  /**
   * 任务复杂度评估（供外部调用或未来扩展）
   */
  estimateTaskComplexity(query: string): number {
    let score = 0;

    // 关键词检测
    const complexKeywords = [
      "项目",
      "系统",
      "应用",
      "网站",
      "平台",
      "开发",
      "构建",
      "实现",
      "设计",
      "完整",
      "全面",
      "综合",
    ];

    complexKeywords.forEach((keyword) => {
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
    const stepKeywords = ["首先", "然后", "接着", "最后", "第一", "第二", "第三"];
    stepKeywords.forEach((keyword) => {
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
      stream: false,
    };

    if (stream) {
      throw new Error("createChatCompletion不支持流式响应，请使用createStreamChatCompletion");
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
      stream: true,
    };

    for await (const chunk of this.streamMessage(messages, options)) {
      yield {
        type: "stream_chunk",
        payload: chunk,
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
    let fullContent = "";
    const collectedThinking: string[] = [];

    try {
      // 注册请求（用于中断）
      this.registerRequest(requestId, abortController, { messages, options });

      // 监听外部中断信号
      if (abortSignal) {
        abortSignal.addEventListener("abort", () => {
          abortController.abort();
          logger.debug(`[ChatService] External abort signal received for ${requestId}`);
        });
      }

      // 1. 选择策略
      const strategy = this.strategySelector.select(options);

      // 2. 调用策略的 prepare 方法获取需要注入的变量
      let strategyVariables: Record<string, string> = {};
      if (strategy.prepare) {
        const prepareResult = await strategy.prepare(messages, options);
        strategyVariables = prepareResult.variables;
        logger.debug(
          `[ChatService] Strategy ${strategy.getName()} provided ${Object.keys(strategyVariables).length} variables`
        );
      }

      // 3. 统一消息预处理
      const preprocessResult = await this.messagePreprocessor.preprocess(
        messages,
        options,
        strategyVariables
      );
      const processedMessages = preprocessResult.messages;

      // 4. 应用上下文压缩
      // 默认启用（遵循 ContextCompressionService.defaultConfig.enabled = true）
      let messagesForLLM = processedMessages;
      const compressionEnabled = options.contextCompression?.enabled ?? true;
      if (compressionEnabled) {
        // 获取模型上下文限制
        const model = ModelRegistry.getInstance().findModel(
          options.provider || "default",
          options.model || "default"
        );
        const contextLimit = model?.modelConfig?.contextWindow || 8000;

        // 应用压缩
        const compressionResult = await getContextCompressionService().compress(
          processedMessages,
          contextLimit,
          options
        );

        messagesForLLM = compressionResult.messages;

        // 记录压缩统计信息
        if (compressionResult.stats.savingsRatio > 0) {
          logger.debug(
            `[ChatService] Context compression (stream): ${(compressionResult.stats.savingsRatio * 100).toFixed(1)}% saved, ` +
              `${compressionResult.stats.originalTokens} -> ${compressionResult.stats.compactedTokens} tokens`
          );
        }
      }

      // 5. 执行流式处理
      for await (const chunk of strategy.stream(messagesForLLM, options, abortController.signal)) {
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
        } catch (error) {
          logger.debug(
            `[ChatService] Failed to parse chunk as JSON, treating as plain text`,
            error
          );
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
        await this.conversationSaver.save(
          conversationId,
          messages,
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
      strategies: this.strategySelector.getStrategyNames(),
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
   * 结束会话（代理到SessionManager）
   */
  async endSession(conversationId: string): Promise<void> {
    await this.sessionManager.archive(conversationId);
  }

  /**
   * 获取所有有对话历史的会话ID（代理到ConversationHistoryService）
   */
  async getAllConversationsWithHistory(): Promise<string[]> {
    return this.conversationHistoryService?.getAllConversationIds() || [];
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
  async getConversationHistory(
    conversationId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<Message[]> {
    const historyService = this.conversationHistoryService;
    if (!historyService) {
      return [];
    }
    const messages = await historyService.getMessages(conversationId, limit, offset);
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      metadata: msg.metadata ? JSON.parse(msg.metadata) : undefined,
    }));
  }

  /**
   * 获取对话消息数量（代理到ConversationHistoryService）
   */
  async getConversationMessageCount(conversationId: string): Promise<number> {
    const historyService = this.conversationHistoryService || null;
    return historyService?.getMessageCount(conversationId) || 0;
  }

  /**
   * 获取对话最后一条消息（代理到ConversationHistoryService）
   */
  async getConversationLastMessage(conversationId: string): Promise<ConversationMessage | null> {
    const historyService = this.conversationHistoryService || null;
    return historyService?.getLastMessage(conversationId) || null;
  }

  /**
   * 获取对话第一条消息（代理到ConversationHistoryService）
   */
  async getConversationFirstMessage(conversationId: string): Promise<ConversationMessage | null> {
    const historyService = this.conversationHistoryService || null;
    return historyService?.getFirstMessage(conversationId) || null;
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
