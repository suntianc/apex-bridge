/**
 * ApexBridge - 聊天服务（ABP-only）
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
import { ConfigService } from './ConfigService';
import { AceService } from './AceService';
import { ConversationHistoryService, type ConversationMessage } from './ConversationHistoryService';
import { SessionManager } from './SessionManager';
import { RequestTracker } from './RequestTracker';
import { VariableResolver } from './VariableResolver';
import { AceIntegrator } from './AceIntegrator';
import type { ChatStrategy } from '../strategies/ChatStrategy';
import { SingleRoundStrategy } from '../strategies/SingleRoundStrategy';
import { ReActStrategy } from '../strategies/ReActStrategy';
import type { Tool } from '../core/stream-orchestrator/types';
import { SkillExecutor } from '../core/skills/SkillExecutor';
import { LLMManagerAdapter } from '../core/stream-orchestrator/LLMAdapter';
import { parseAggregatedContent } from '../api/utils/stream-parser';

export class ChatService {

  private llmManager: LLMManager;
  private aceService: AceService;
  private conversationHistoryService: ConversationHistoryService;

  // 🆕 系统提示词服务
  private systemPromptService: SystemPromptService;

  // 🆕 会话管理器
  private sessionManager: SessionManager;

  // 🆕 请求追踪器
  private requestTracker: RequestTracker;

  // 🆕 变量解析器
  private variableResolver: VariableResolver;

  // 🆕 ACE集成器
  private aceIntegrator: AceIntegrator;

  // 🆕 策略数组
  private strategies: ChatStrategy[];

  constructor(
    private protocolEngine: ProtocolEngine,
    llmManager: LLMManager, // 必需参数
    private eventBus: EventBus
  ) {
    this.llmManager = llmManager;
    this.aceService = AceService.getInstance();
    this.conversationHistoryService = ConversationHistoryService.getInstance();

    // 🆕 初始化系统提示词服务
    this.systemPromptService = new SystemPromptService('./config');
    logger.debug('[ChatService] SystemPromptService initialized');

    // 初始化会话管理器
    this.sessionManager = new SessionManager(this.aceService, this.conversationHistoryService);

    // 初始化请求追踪器（5分钟超时）
    this.requestTracker = new RequestTracker(null, 300000);

    // 初始化变量解析器（30秒缓存）
    this.variableResolver = new VariableResolver(this.protocolEngine, 30000);

    // 初始化ACE集成器
    this.aceIntegrator = new AceIntegrator(this.aceService);

    // 初始化策略（构造时立即初始化，因为LLMManager已传入）
    this.strategies = [
      new ReActStrategy(this.llmManager, this.variableResolver, this.aceIntegrator, this.conversationHistoryService),
      new SingleRoundStrategy(this.llmManager, this.variableResolver, this.aceIntegrator, this.conversationHistoryService)
    ];
    logger.debug('[ChatService] Chat strategies initialized');

    // 尝试初始化 ACE (非阻塞)
    this.aceService.initialize().catch(err => {
      logger.warn(`[ChatService] Failed to auto-init ACE: ${err.message}`);
    });

    logger.info('✅ ChatService initialized (using ProtocolEngine unified variable engine)');
  }

  /**
   * 🆕 设置WebSocket管理器
   */
  setWebSocketManager(manager: IWebSocketManager): void {
    this.requestTracker = new RequestTracker(manager, 300000);
    logger.debug('[ChatService] WebSocketManager attached to RequestTracker');
  }

  /**
   * 🆕 注册活动请求（代理到RequestTracker）
   */
  private registerRequest(requestId: string, abortController: AbortController, context?: any): void {
    this.requestTracker.register(requestId, abortController, context);
  }

  /**
   * 🆕 中断请求（代理到RequestTracker）
   */
  async interruptRequest(requestId: string): Promise<boolean> {
    return this.requestTracker.interrupt(requestId);
  }

  /**
   * 🆕 选择聊天策略
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
   * 🆕 更新会话元数据（代理到SessionManager）
   */
  private async updateSessionMetadata(sessionId: string, usage: any): Promise<void> {
    await this.sessionManager.updateMetadata(sessionId, { total_tokens: usage.total_tokens, prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens });
  }

  /**
   * 🆕 获取或创建会话（代理到SessionManager）
   */
  private async getOrCreateSession(agentId: string | undefined, userId: string | undefined, conversationId: string): Promise<string | null> {
    return this.sessionManager.getOrCreate(agentId, userId, conversationId);
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
          // 将 sessionId 添加到 options 中，供后续使用
          options.sessionId = sessionId;

          logger.debug(`[ChatService] Processing message with session: ${sessionId}`);
        }
      } else {
        logger.debug('[ChatService] Processing message without session (no conversationId)');
      }

      // 🆕 检查并添加系统提示词（如果没有在messages中）
      const hasSystemMessage = messages.some(m => m.role === 'system');

      if (!hasSystemMessage) {
        const systemPrompt = await this.systemPromptService.getSystemPrompt({
          model: options.model,
          provider: options.provider
          // 其他上下文变量会自动从options中传递
        });

        if (systemPrompt) {
          messages = [
            {
              role: 'system',
              content: systemPrompt
            },
            ...messages
          ];

          logger.debug(`[ChatService] Applied system prompt (${systemPrompt.length} chars)`);
        }
      }

      // 2. 选择并执行策略
      const strategy = await this.selectStrategy(options);

      // 检查是否为流式模式
      if (options.stream) {
        // 流式模式，返回AsyncGenerator
        return strategy.execute(messages, options) as AsyncIterableIterator<any>;
      } else {
        // 普通模式，返回ChatResult
        const result = await strategy.execute(messages, options) as any;

        // 3. 更新会话元数据（由ChatService处理，避免循环依赖）
        if (options.sessionId && result?.usage) {
          await this.updateSessionMetadata(options.sessionId, result.usage).catch(err => {
            logger.warn(`[ChatService] Failed to update session metadata: ${err.message}`);
          });
        }

        return result;
      }

    } catch (error: any) {
      logger.error('❌ Error in ChatService.processMessage:', error);
      throw error;
    }
  }

  /**
   * 🆕 WebSocket适配方法 - 创建聊天完成（兼容OpenAI格式）
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
   * 🆕 WebSocket适配方法 - 创建流式聊天完成
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

      // 选择策略并执行流式处理
      const strategy = await this.selectStrategy(options);

      if (options.selfThinking?.enabled) {
        // ReAct策略流式处理
        for await (const chunk of strategy.stream(messages, options, abortController.signal)) {
          if (abortController.signal.aborted) {
            logger.debug(`[ChatService] Stream aborted for ${requestId}`);
            break;
          }

          // 收集完整内容
          if (chunk.startsWith('__THOUGHT__:')) {
            collectedThinking.push(chunk);
          } else {
            fullContent += chunk;
          }

          yield chunk;
        }
      } else {
        // 单轮策略流式处理
        for await (const chunk of strategy.stream(messages, options, abortController.signal)) {
          if (abortController.signal.aborted) {
            logger.debug(`[ChatService] Stream aborted for ${requestId}`);
            break;
          }

          // 收集完整内容
          fullContent += chunk;

          yield chunk;
        }
      }

    } finally {
      // 清理请求追踪
      this.requestTracker.unregister(requestId);
      logger.debug(`[ChatService] Stream completed for ${requestId}`);

      // 🆕 保存对话历史（流式响应完成后）
      const conversationId = options.conversationId;
      if (conversationId && !abortController.signal.aborted) {
        try {
          // 获取历史记录数量
          const count = await this.conversationHistoryService.getMessageCount(conversationId);

          const messagesToSave: Message[] = [];
          if (count === 0) {
            // 新对话：保存所有非assistant消息
            messagesToSave.push(...messages.filter(m => m.role !== 'assistant'));
          } else {
            // 已有对话：只保存最后一条非assistant消息
            const lastMessage = messages[messages.length - 1];
            if (lastMessage && lastMessage.role !== 'assistant') {
              messagesToSave.push(lastMessage);
            }
          }

          // 如果是ReAct模式，包含思考过程
          let assistantContent = fullContent;
          if (options.selfThinking?.enabled && collectedThinking.length > 0) {
            const thinkingContent = collectedThinking.join('');
            assistantContent = `<thinking>${thinkingContent}</thinking> ${fullContent}`;
          } else if (!options.selfThinking?.enabled) {
            // 普通模式：解析可能包含的嵌套JSON格式（如glm-4）
            const parsed = parseAggregatedContent(fullContent);
            if (parsed.reasoning) {
              // 如果有推理内容，使用<thinking>标签包裹
              assistantContent = `<thinking>${parsed.reasoning}</thinking> ${parsed.content}`;
            } else {
              // 只有输出内容
              assistantContent = parsed.content;
            }
          }

          // 添加AI回复
          messagesToSave.push({
            role: 'assistant',
            content: assistantContent
          });

          await this.conversationHistoryService.saveMessages(conversationId, messagesToSave);
          logger.debug(`[ChatService] Saved ${messagesToSave.length} messages from stream`);
        } catch (err: any) {
          logger.warn(`[ChatService] Failed to save stream conversation history: ${err.message}`);
        }
      }
    }
  }

  /**
   * 获取服务状态
   */
  getStatus(): any {
    return {
      aceEnabled: this.aceService.isEnabled(),
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
   * 获取变量解析器（供外部使用）
   */
  getVariableResolver(): VariableResolver {
    return this.variableResolver;
  }

  /**
   * 获取ACE集成器（供外部使用）
   */
  getAceIntegrator(): AceIntegrator {
    return this.aceIntegrator;
  }

  /**
   * 🆕 获取ACE引擎（代理到AceService）
   */
  getAceEngine() {
    return this.aceService.getEngine();
  }

  /**
   * 🆕 获取会话状态（代理到AceService）
   */
  async getSessionState(conversationId: string): Promise<any> {
    // 1. 先尝试从SessionManager获取sessionId
    let sessionId = this.sessionManager.getSessionId(conversationId);

    // 2. 如果sessionId不存在，尝试直接从 ACE Engine 查询
    if (!sessionId) {
      const engine = this.aceService.getEngine();
      if (engine) {
        try {
          // 直接使用 conversationId 作为 sessionId 查询
          const session = await engine.getSessionState(conversationId);
          if (session && session.status === 'active') {
            // 找到会话，更新SessionManager映射
            // 注意：这里不能直接操作sessionManager的私有map，所以仅返回session
            return session;
          }
        } catch (error: any) {
          logger.warn(`[ChatService] Failed to query ACE engine directly: ${error.message}`);
        }
      }
    }

    // 3. 如果还是找不到sessionId，返回null
    if (!sessionId) {
      logger.debug(`[ChatService] No session found for conversationId: ${conversationId}`);
      return null;
    }

    // 4. 使用sessionId查询ACE引擎
    const engine = this.aceService.getEngine();
    if (!engine) {
      logger.warn('[ChatService] ACE engine not available');
      return null;
    }

    try {
      return await engine.getSessionState(sessionId);
    } catch (error: any) {
      logger.error(`[ChatService] Failed to get session state: ${error.message}`);
      return null;
    }
  }

  /**
   * 🆕 结束会话（代理到SessionManager）
   */
  async endSession(conversationId: string): Promise<void> {
    await this.sessionManager.archive(conversationId);
  }

  /**
   * 🆕 获取所有有对话历史的会话ID（代理到ConversationHistoryService）
   */
  async getAllConversationsWithHistory(): Promise<string[]> {
    return this.conversationHistoryService.getAllConversationIds();
  }

  /**
   * 🆕 获取会话ID通过对话ID（代理到SessionManager）
   */
  getSessionIdByConversationId(conversationId: string): string | undefined {
    return this.sessionManager.getSessionId(conversationId);
  }

  /**
   * 🆕 获取对话历史（代理到ConversationHistoryService）
   */
  async getConversationHistory(conversationId: string, limit: number = 100, offset: number = 0): Promise<Message[]> {
    return this.conversationHistoryService.getMessages(conversationId, limit, offset);
  }

  /**
   * 🆕 获取对话消息数量（代理到ConversationHistoryService）
   */
  async getConversationMessageCount(conversationId: string): Promise<number> {
    return this.conversationHistoryService.getMessageCount(conversationId);
  }

  /**
   * 🆕 获取对话最后一条消息（代理到ConversationHistoryService）
   */
  async getConversationLastMessage(conversationId: string): Promise<ConversationMessage | null> {
    return this.conversationHistoryService.getLastMessage(conversationId);
  }

  /**
   * 🆕 获取活动请求数量（代理到RequestTracker）
   */
  getActiveRequestCount(): number {
    return this.requestTracker.getActiveRequestCount();
  }

  /**
   * 🆕 停止清理定时器（代理到RequestTracker）
   */
  stopCleanupTimer(): void {
    this.requestTracker.stopCleanupTimer();
  }
}