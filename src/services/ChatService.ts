/**
 * ApexBridge - 聊天服务（ABP-only）
 * 处理聊天请求的完整生命周期
 */

import { ProtocolEngine } from '../core/ProtocolEngine';
import { LLMManager } from '../core/LLMManager';
import { EventBus } from '../core/EventBus';
import {
  Message,
  ChatOptions
} from '../types';
import { ActiveRequest } from '../types/request-abort';
import { logger } from '../utils/logger';
import { generateRequestId } from '../utils/request-id';
import { IWebSocketManager } from '../api/websocket/WebSocketManager';
import { ConfigService } from './ConfigService';
import { AceService } from './AceService';
import { ConversationHistoryService } from './ConversationHistoryService';
import { TaskEvaluator } from '../core/TaskEvaluator';

/**
 * 会话扩展元数据接口
 */
interface SessionExtendedMetadata {
  /** Agent ID */
  agentId?: string;
  /** 用户 ID */
  userId?: string;
  /** 对话 ID */
  conversationId?: string;
  /** 创建时间 */
  createdAt?: number;
  /** 来源 */
  source?: string;
  /** 最后一条消息时间 */
  lastMessageAt?: number;
  /** 消息计数 */
  messageCount?: number;
  /** 累计 Token 使用量 */
  totalTokens?: number;
  /** 累计输入 Token */
  totalInputTokens?: number;
  /** 累计输出 Token */
  totalOutputTokens?: number;
}

export class ChatService {

  // 🆕 活动请求追踪
  private activeRequests: Map<string, ActiveRequest> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private webSocketManager: IWebSocketManager | null = null; // WebSocketManager 实例（可选）

  private llmManager: LLMManager | null = null; // 改为可选，支持懒加载
  private aceService: AceService;
  private conversationHistoryService: ConversationHistoryService;

  // 🆕 会话管理映射表：conversationId -> sessionId
  private sessionMap: Map<string, string> = new Map();

  constructor(
    private protocolEngine: ProtocolEngine,
    llmManager: LLMManager | null, // 改为可选参数
    private eventBus: EventBus
  ) {
    this.llmManager = llmManager; // 可选，可以为null（懒加载）
    this.aceService = AceService.getInstance();
    this.conversationHistoryService = ConversationHistoryService.getInstance();

    // 尝试初始化 ACE (非阻塞)
    this.aceService.initialize().catch(err => {
      logger.warn(`[ChatService] Failed to auto-init ACE: ${err.message}`);
    });

    logger.info('✅ ChatService initialized (using ProtocolEngine unified variable engine)');

    // 🆕 启动定期清理任务（每60秒）
    this.startCleanupTimer();
  }

  /**
   * 🆕 设置 WebSocketManager（用于中断通知）
   */
  setWebSocketManager(manager: IWebSocketManager): void {
    this.webSocketManager = manager;
    logger.debug('[ChatService] WebSocketManager attached');
  }

  /**
   * 🆕 注册活动请求
   */
  private registerRequest(requestId: string, abortController: AbortController, context?: any): void {
    const request: ActiveRequest = {
      requestId,
      abortController,
      startTime: Date.now(),
      context
    };

    this.activeRequests.set(requestId, request);
    logger.debug(`[ChatService] Registered request: ${requestId} (total: ${this.activeRequests.size})`);
  }

  /**
   * 🆕 中断请求
   */
  async interruptRequest(requestId: string): Promise<boolean> {
    const request = this.activeRequests.get(requestId);

    if (!request) {
      logger.warn(`[ChatService] Request not found for interrupt: ${requestId}`);
      return false;
    }

    logger.debug(`[ChatService] Interrupting request: ${requestId}`);

    // 触发中断
    request.abortController.abort();

    // 🆕 推送 WebSocket 通知
    if (this.webSocketManager) {
      try {
        const abpLogChannel = this.webSocketManager.getChannel?.('ABPLog');

        if (abpLogChannel) {
          (abpLogChannel as any).pushLog?.({
            status: 'interrupted',
            content: `请求已中断: ${requestId}`,
            source: 'request_interrupt',
            metadata: {
              requestId: requestId,
              timestamp: new Date().toISOString(),
              duration: Date.now() - request.startTime
            }
          });

          logger.debug(`[ChatService] Pushed interrupt notification to ABPLog`);
        }
      } catch (wsError) {
        logger.warn(`[ChatService] WebSocket push failed (non-critical):`, wsError);
      }
    }

    // 清理请求
    this.cleanupRequest(requestId);

    return true;
  }

  /**
   * 🆕 清理请求
   */
  private cleanupRequest(requestId: string): void {
    const request = this.activeRequests.get(requestId);

    if (request) {
      const duration = Date.now() - request.startTime;
      logger.debug(`[ChatService] Cleaning up request: ${requestId} (duration: ${duration}ms)`);
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * 🆕 启动定期清理定时器
   */
  private startCleanupTimer(): void {
    const intervalMs = parseInt(process.env.ACTIVE_REQUEST_CLEANUP_INTERVAL_MS || '60000');
    const timeoutMs = parseInt(process.env.REQUEST_TIMEOUT_MS || '300000'); // 5分钟

    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [requestId, request] of this.activeRequests.entries()) {
        const age = now - request.startTime;

        if (age > timeoutMs) {
          logger.warn(`[ChatService] Auto-cleaning timeout request: ${requestId} (age: ${age}ms)`);
          request.abortController.abort();
          this.activeRequests.delete(requestId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.debug(`[ChatService] Cleaned ${cleanedCount} timeout request(s)`);
      }
    }, intervalMs);

    logger.debug(`[ChatService] Cleanup timer started (interval: ${intervalMs}ms, timeout: ${timeoutMs}ms)`);
  }

  /**
   * 🆕 停止清理定时器
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.debug('[ChatService] Cleanup timer stopped');
    }
  }

  /**
   * 🆕 获取活动请求数量
   */
  getActiveRequestCount(): number {
    return this.activeRequests.size;
  }

  // ========== 会话管理方法 ==========

  /**
   * 获取或创建会话
   * @param agentId Agent ID（可选）
   * @param userId 用户ID（可选）
   * @param conversationId 对话ID（必需，来自前端）
   * @returns sessionId 或 null
   */
  private async getOrCreateSession(
    agentId: string | undefined,
    userId: string | undefined,
    conversationId: string | undefined
  ): Promise<string | null> {
    // 1. 如果没有 conversationId，无法创建会话
    if (!conversationId) {
      logger.debug('[ChatService] No conversationId provided, processing without session');
      return null;
    }

    // 2. 检查是否已存在会话映射
    let sessionId = this.sessionMap.get(conversationId);

    if (sessionId) {
      // 3. 验证会话是否仍然存在且有效
      const engine = this.aceService.getEngine();
      if (engine) {
        try {
          const session = await engine.getSessionState(sessionId);
          if (session && session.status === 'active') {
            // 更新会话活动时间
            await engine.updateSessionActivity(sessionId).catch(err => {
              logger.warn(`[ChatService] Failed to update session activity: ${err.message}`);
            });
            return sessionId;
          } else {
            // 会话已失效或被归档，移除映射
            this.sessionMap.delete(conversationId);
            logger.debug(`[ChatService] Session ${sessionId} is no longer active, removed from map`);
          }
        } catch (error: any) {
          logger.warn(`[ChatService] Failed to verify session: ${error.message}`);
          // 验证失败，移除映射并重新创建
          this.sessionMap.delete(conversationId);
          sessionId = null;
        }
      }
    }

    // 4. 如果内存中没有，直接使用 conversationId 作为 sessionId
    if (!sessionId) {
      sessionId = conversationId;
    }

    const engine = this.aceService.getEngine();
    if (!engine) {
      logger.warn('[ChatService] ACE Engine not initialized, cannot create session');
      return null;
    }

    // 5. 🆕 先检查数据库中是否已存在该 session（防止 UNIQUE constraint 错误）
    try {
      const existingSession = await engine.getSessionState(sessionId);
      if (existingSession) {
        // 会话已存在，更新映射关系并返回
        this.sessionMap.set(conversationId, sessionId);

        // 更新会话活动时间
        await engine.updateSessionActivity(sessionId).catch(err => {
          logger.warn(`[ChatService] Failed to update session activity: ${err.message}`);
        });

        logger.debug(`[ChatService] Reused existing session: ${sessionId} for conversation: ${conversationId}`);
        return sessionId;
      }
    } catch (error: any) {
      // 如果查询失败（可能是 session 不存在），继续创建流程
      logger.debug(`[ChatService] Session ${sessionId} not found in database, will create new one`);
    }

    // 6. 创建新会话（数据库中不存在）
    try {
      // 🆕 初始化扩展元数据
      const metadata: SessionExtendedMetadata = {
        agentId,
        userId,
        conversationId,
        createdAt: Date.now(),
        source: 'frontend',
        lastMessageAt: Date.now(),
        messageCount: 0,
        totalTokens: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0
      };

      await engine.createSession(sessionId, metadata);

      // 7. 保存映射关系
      this.sessionMap.set(conversationId, sessionId);

      logger.info(`[ChatService] Created new session: ${sessionId} for conversation: ${conversationId}`);
    } catch (error: any) {
      // 🆕 如果创建失败（可能是并发创建导致的 UNIQUE constraint），再次尝试获取
      if (error.message && error.message.includes('UNIQUE constraint')) {
        logger.warn(`[ChatService] Session ${sessionId} already exists (concurrent creation), reusing it`);
        try {
          const existingSession = await engine.getSessionState(sessionId);
          if (existingSession) {
            this.sessionMap.set(conversationId, sessionId);
            await engine.updateSessionActivity(sessionId).catch(() => { });
            return sessionId;
          }
        } catch (retryError: any) {
          logger.error(`[ChatService] Failed to get session after UNIQUE constraint error: ${retryError.message}`);
        }
      }
      logger.error(`[ChatService] Failed to create session: ${error.message}`);
      return null;
    }

    return sessionId;
  }

  /**
   * 🆕 更新会话元数据（消息计数、Token使用量等）
   * @param sessionId 会话ID
   * @param usage Token使用信息（可选）
   */
  private async updateSessionMetadata(
    sessionId: string,
    usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number }
  ): Promise<void> {
    const engine = this.aceService.getEngine();
    if (!engine) {
      return;
    }

    try {
      // 获取当前会话状态
      const session = await engine.getSessionState(sessionId);
      if (!session || !session.metadata) {
        return;
      }

      const currentMetadata = session.metadata as SessionExtendedMetadata;

      // 更新元数据
      const updates: Partial<SessionExtendedMetadata> = {
        lastMessageAt: Date.now(),
        messageCount: (currentMetadata.messageCount || 0) + 1
      };

      // 更新 Token 统计
      if (usage) {
        const totalTokens = usage.total_tokens || 0;
        const inputTokens = usage.prompt_tokens || 0;
        const outputTokens = usage.completion_tokens || 0;

        updates.totalTokens = (currentMetadata.totalTokens || 0) + totalTokens;
        updates.totalInputTokens = (currentMetadata.totalInputTokens || 0) + inputTokens;
        updates.totalOutputTokens = (currentMetadata.totalOutputTokens || 0) + outputTokens;
      }

      // 合并更新
      await engine.updateSessionMetadata(sessionId, updates);
    } catch (error: any) {
      logger.warn(`[ChatService] Failed to update session metadata: ${error.message}`);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 🆕 根据 conversationId 获取 sessionId
   * @param conversationId 对话ID
   * @returns sessionId 或 null
   */
  getSessionIdByConversationId(conversationId: string): string | null {
    return this.sessionMap.get(conversationId) || null;
  }

  /**
   * 🆕 获取 ACE Engine 实例（用于 API 调用）
   * @returns AceEngine 实例或 null
   */
  getAceEngine() {
    return this.aceService.getEngine();
  }

  /**
   * 结束会话（用户删除对话时调用）
   * @param conversationId 对话ID
   */
  async endSession(conversationId: string): Promise<void> {
    const sessionId = this.sessionMap.get(conversationId);
    if (!sessionId) {
      logger.warn(`[ChatService] No session found for conversation: ${conversationId}`);
      // 即使没有 sessionId，也尝试删除消息历史（因为 conversationId 可能直接作为 sessionId）
      try {
        await this.conversationHistoryService.deleteMessages(conversationId);
        logger.info(`[ChatService] Deleted conversation history for: ${conversationId}`);
      } catch (error: any) {
        logger.warn(`[ChatService] Failed to delete conversation history: ${error.message}`);
      }
      return;
    }

    const engine = this.aceService.getEngine();
    if (engine) {
      try {
        await engine.archiveSession(sessionId);
        logger.info(`[ChatService] Archived session: ${sessionId} for conversation: ${conversationId}`);
      } catch (error: any) {
        logger.error(`[ChatService] Failed to archive session: ${error.message}`);
      }
    }

    // 🆕 删除对话消息历史
    try {
      await this.conversationHistoryService.deleteMessages(conversationId);
      logger.info(`[ChatService] Deleted conversation history for: ${conversationId}`);
    } catch (error: any) {
      logger.error(`[ChatService] Failed to delete conversation history: ${error.message}`);
    }

    // 移除映射
    this.sessionMap.delete(conversationId);
  }

  /**
   * 🆕 获取对话消息历史
   * @param conversationId 对话ID
   * @param limit 限制返回数量，默认 100
   * @param offset 偏移量，默认 0
   * @returns 消息列表
   */
  async getConversationHistory(
    conversationId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<any[]> {
    return this.conversationHistoryService.getMessages(conversationId, limit, offset);
  }

  /**
   * 🆕 获取对话消息总数
   * @param conversationId 对话ID
   * @returns 消息总数
   */
  async getConversationMessageCount(conversationId: string): Promise<number> {
    return this.conversationHistoryService.getMessageCount(conversationId);
  }

  /**
   * 获取对话的最后一条消息
   * @param conversationId 对话ID
   * @returns 最后一条消息
   */
  async getConversationLastMessage(conversationId: string): Promise<any> {
    const messages = await this.conversationHistoryService.getMessages(conversationId, 1, 0);
    return messages.length > 0 ? messages[0] : null;
  }

  /**
   * 🆕 向 ACE 引擎发布带会话的消息（可选功能）
   * @param conversationId 对话ID
   * @param content 消息内容
   * @param targetLayer 目标层级（可选，默认 GLOBAL_STRATEGY）
   */
  async publishToAceEngine(
    conversationId: string,
    content: string,
    targetLayer?: string
  ): Promise<void> {
    const sessionId = this.sessionMap.get(conversationId);
    if (!sessionId) {
      logger.warn(`[ChatService] No session found for conversation: ${conversationId}`);
      return;
    }

    const engine = this.aceService.getEngine();
    if (!engine) {
      logger.warn('[ChatService] ACE Engine not initialized');
      return;
    }

    try {
      // 使用字符串值作为层级（AceLayerID 枚举值就是字符串）
      // 有效的层级: 'ASPIRATIONAL', 'GLOBAL_STRATEGY', 'AGENT_MODEL', 
      //            'EXECUTIVE_FUNCTION', 'COGNITIVE_CONTROL', 'TASK_PROSECUTION'
      const validLayers = [
        'ASPIRATIONAL',
        'GLOBAL_STRATEGY',
        'AGENT_MODEL',
        'EXECUTIVE_FUNCTION',
        'COGNITIVE_CONTROL',
        'TASK_PROSECUTION'
      ] as const;

      const layer = (targetLayer && validLayers.includes(targetLayer as any))
        ? (targetLayer as any)
        : 'GLOBAL_STRATEGY';

      await engine.publishWithSession(sessionId, content, layer as any);
      logger.debug(`[ChatService] Published message to ACE engine (session: ${sessionId}, layer: ${layer})`);
    } catch (error: any) {
      logger.error(`[ChatService] Failed to publish to ACE engine: ${error.message}`);
    }
  }

  /**
   * 获取会话状态（用于查询）
   * @param conversationId 对话ID
   * @returns 会话状态或 null
   */
  async getSessionState(conversationId: string): Promise<any> {
    // 1. 先查内存映射
    let sessionId = this.sessionMap.get(conversationId);

    // 2. 如果映射不存在，尝试直接从 ACE Engine 查询（因为 sessionId = conversationId）
    if (!sessionId) {
      const engine = this.aceService.getEngine();
      if (engine) {
        try {
          // 直接使用 conversationId 作为 sessionId 查询
          const session = await engine.getSessionState(conversationId);
          if (session && session.status === 'active') {
            // 找到会话，更新映射
            this.sessionMap.set(conversationId, conversationId);
            return session;
          }
        } catch (error: any) {
          logger.debug(`[ChatService] Session ${conversationId} not found in ACE Engine: ${error.message}`);
        }
      }
      return null;
    }

    // 3. 如果映射存在，从 ACE Engine 获取最新状态
    const engine = this.aceService.getEngine();
    if (!engine) {
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
   * 🆕 WebSocket适配方法 - 创建聊天完成（兼容OpenAI格式）
   */
  async createChatCompletion(params: {
    messages: Message[];
    model?: string;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    userId?: string;
    [key: string]: any;
  }): Promise<any> {
    const { messages, stream, ...options } = params;

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
    userId?: string;
    [key: string]: any;
  }): AsyncIterableIterator<any> {
    const { messages, ...options } = params;

    // 将streamMessage转换为兼容格式
    for await (const chunk of this.streamMessage(messages, options)) {
      // 🛡️ 处理 Meta 协议头，转换为事件格式
      if (chunk.startsWith('__META__:')) {
        const metaJson = chunk.substring(9);
        try {
          const meta = JSON.parse(metaJson);

          // 将 requestId 作为 meta_event 传递，供 WebSocket 层使用
          if (meta.type === 'requestId') {
            yield {
              type: 'meta_event',
              payload: {
                requestId: meta.value
              }
            };
          } else if (meta.type === 'interrupted') {
            // 中断事件也转换为标准格式
            yield {
              type: 'meta_event',
              payload: {
                type: 'interrupted'
              }
            };
          }
          continue; // 跳过 META 标记的原始格式
        } catch (parseError) {
          logger.warn('[ChatService] Failed to parse meta chunk in WebSocket adapter:', metaJson);
          continue;
        }
      }

      // 确保 chunk 不是 META 标记（双重保护）
      if (chunk.startsWith('__META__')) {
        logger.warn('[ChatService] Unhandled META chunk detected in WebSocket adapter, skipping:', chunk.substring(0, 50));
        continue;
      }

      // 发送正常内容
      yield {
        type: 'stream_chunk',
        payload: {
          choices: [{
            delta: {
              content: chunk
            }
          }]
        }
      };
    }

    // 发送完成信号
    yield {
      type: 'stream_done'
    };
  }

  /**
   * 处理聊天消息
   */
  async processMessage(messages: Message[], options: ChatOptions = {}): Promise<any> {
    try {
      // 🆕 1. 获取或创建会话（必须在处理消息之前）
      const conversationId = options.conversationId as string | undefined;

      if (conversationId) {
        const sessionId = await this.getOrCreateSession(
          options.agentId,
          options.userId,
          conversationId
        );

        if (sessionId) {
          // 🆕 2. 将 sessionId 添加到 options 中，供后续使用
          options.sessionId = sessionId;

          logger.debug(`[ChatService] Processing message with session: ${sessionId}`);
        }
      } else {
        logger.debug('[ChatService] Processing message without session (no conversationId)');
      }

      // 3. 检查是否启用自我思考循环（ReAct模式）
      if (options.selfThinking?.enabled) {
        return this.processMessageWithSelfThinking(messages, options);
      }

      // 4. 原有的单次处理逻辑
      return this.processSingleRound(messages, options);

    } catch (error: any) {
      logger.error('❌ Error in ChatService.processMessage:', error);
      throw error;
    }
  }

  /**
   * 单轮处理逻辑（原有实现）
   */
  private async processSingleRound(messages: Message[], options: ChatOptions = {}): Promise<any> {
    logger.debug(`📨 Processing chat message, ${messages.length} messages`);

    let processedMessages = messages;

    // 1. 变量替换
    processedMessages = await this.resolveVariables(processedMessages);

    // 2. 消息预处理（移除对插件系统依赖，直接使用变量解析后的消息）
    const preprocessedMessages = processedMessages;

    // 3. 调用LLM（懒加载LLMClient）
    const llmClient = await this.requireLLMClient();
    const llmResponse = await llmClient.chat(preprocessedMessages, options);
    const aiContent = llmResponse.choices[0]?.message?.content || '';

    logger.debug(`🤖 LLM Response (first 200 chars): ${aiContent.substring(0, 200)}`);

    // 🆕 更新会话活动时间和元数据（如果有会话）
    const sessionId = options.sessionId;
    if (sessionId && this.aceService.getEngine()) {
      // 异步更新，不阻塞响应
      this.aceService.getEngine()?.updateSessionActivity(sessionId).catch(err => {
        logger.warn(`[ChatService] Failed to update session activity: ${err.message}`);
      });

      // 🆕 更新会话元数据（消息计数、Token使用量）
      this.updateSessionMetadata(sessionId, llmResponse.usage).catch(err => {
        logger.warn(`[ChatService] Failed to update session metadata: ${err.message}`);
      });
    }

    // 🆕 ACE Integration: 保存轨迹（单轮处理）
    if (this.aceService.getEngine() && sessionId) {
      const userQuery = messages.find(m => m.role === 'user')?.content || '';
      const taskId = options.requestId || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const trajectory = {
        task_id: taskId,
        session_id: sessionId, // 🆕 会话ID
        user_input: userQuery,
        steps: [{
          thought: 'Single round processing',
          action: 'chat',
          output: aiContent
        }],
        final_result: aiContent,
        outcome: 'SUCCESS' as const,
        environment_feedback: 'Single round chat completed',
        used_rule_ids: [],
        timestamp: Date.now(),
        duration_ms: 0, // 单轮处理，不计算耗时
        evolution_status: 'PENDING' as const
      };

      this.aceService.evolve(trajectory).catch(err => {
        logger.error(`[ChatService] ACE Evolution failed: ${err.message}`);
      });
    }

    // 🆕 保存对话消息历史
    const conversationId = options.conversationId as string | undefined;
    if (conversationId) {
      try {
        // 检查是否是新对话
        const count = await this.conversationHistoryService.getMessageCount(conversationId);
        const messagesToSave: Message[] = [];

        if (count === 0) {
          // 新对话：保存所有请求消息（通常包含 System 和 第一条 User）
          // 过滤掉可能存在的 assistant 消息（防止重复历史中的 assistant）
          messagesToSave.push(...messages.filter(m => m.role !== 'assistant'));
        } else {
          // 已有对话：只保存最后一条消息（通常是新的 User 消息）
          const lastMessage = messages[messages.length - 1];
          if (lastMessage && lastMessage.role !== 'assistant') {
            messagesToSave.push(lastMessage);
          }
        }

        // 添加 AI 回复
        messagesToSave.push({
          role: 'assistant',
          content: aiContent
        });

        await this.conversationHistoryService.saveMessages(conversationId, messagesToSave);
      } catch (err: any) {
        logger.warn(`[ChatService] Failed to save conversation history: ${err.message}`);
      }
    }

    return {
      content: aiContent,
      usage: llmResponse.usage
    };
  }

  /**
   * 自我思考循环（ReAct模式）
   *
   * 循环执行：思考 → 行动 → 观察 → 评估 → 直到任务完成
   */
  private async processMessageWithSelfThinking(
    messages: Message[],
    options: ChatOptions
  ): Promise<any> {
    const startTime = Date.now();
    const maxDuration = options.loopTimeout || 300000; // 5分钟
    const maxIterations = options.selfThinking?.maxIterations || 5;
    // ✅ 修复1：自我思考循环默认启动评估
    const enableTaskEvaluation = options.selfThinking?.enableTaskEvaluation ?? true;
    const includeThoughtsInResponse = options.selfThinking?.includeThoughtsInResponse ?? true;

    // ✅ 修复2：从配置文件读取快速评估/LLM评估开关，而不是从参数读取
    const configService = ConfigService.getInstance();
    const config = configService.readConfig();
    const useLLMEvaluation = config.selfThinking?.useLLMEvaluation ?? false;
    const evaluationModel = config.selfThinking?.evaluationModel;

    // 获取用户原始查询（第一条用户消息）
    const userQuery = messages.find(msg => msg.role === 'user')?.content || '';

    let iteration = 0;
    // 关键修复：使用可变的消息数组，每次迭代都会更新
    const currentMessages: Message[] = [...messages];
    let finalResult: any = null;
    const thinkingProcess: string[] = []; // 记录思考过程

    // ✅ 修复并发 Bug：使用局部变量而不是类成员变量，确保每个请求独享一个实例
    const taskEvaluator = new TaskEvaluator({
      maxIterations,
      completionPrompt: options.selfThinking?.completionPrompt,
      model: evaluationModel // ✅ 从配置文件读取评估模型
    });

    logger.info(`🧠 Starting Self-Thinking Loop (max: ${maxIterations} iterations)`);

    while (iteration < maxIterations) {
      iteration++;

      logger.info(`\n🔄 [Self-Thinking Loop Iteration ${iteration}/${maxIterations}]`);

      // 检查超时
      if (Date.now() - startTime > maxDuration) {
        logger.warn(`⚠️ Self-thinking loop timeout (${maxDuration}ms) reached`);
        thinkingProcess.push(`[系统警告] 达到最大超时时间，停止循环`);
        break;
      }

      // 步骤 1: 调用 LLM
      logger.debug('🤖 Calling LLM...');
      const llmClient = await this.requireLLMClient();
      const llmResponse = await llmClient.chat(currentMessages, options);
      const aiContent = llmResponse.choices[0]?.message?.content || '';

      logger.debug(`📝 LLM Response: ${aiContent.substring(0, 200)}...`);

      // 记录思考过程
      thinkingProcess.push(`\n[思考步骤 ${iteration}]`);
      thinkingProcess.push(`AI分析: ${aiContent}`);

      // 关键修复：更新上下文，让模型知道它之前的思考
      currentMessages.push({
        role: 'assistant',
        content: aiContent
      });

      // 步骤 2: 使用 TaskEvaluator 评估任务是否完成
      let shouldContinue = false;
      if (enableTaskEvaluation && taskEvaluator) {
        // ✅ 从配置文件读取评估方式，而不是从参数读取
        if (useLLMEvaluation) {
          // 🆕 使用真实的 LLM 评估（更准确但成本更高）
          logger.debug('[TaskEvaluator] Using LLM-based evaluation');
          try {
            const evaluation = await taskEvaluator.evaluate(
              llmClient,
              currentMessages,
              userQuery,
              iteration
            );
            shouldContinue = !evaluation.isComplete;

            logger.debug(
              `[TaskEvaluator] LLM Evaluation result: ${evaluation.isComplete ? 'Complete' : 'Needs more work'}` +
              (evaluation.reasoning ? ` (Reasoning: ${evaluation.reasoning.substring(0, 100)}...)` : '')
            );

            // 如果提供了建议的下一步行动，可以记录到思考过程中
            if (evaluation.suggestedNextAction) {
              thinkingProcess.push(`[评估建议] ${evaluation.suggestedNextAction}`);
            }

            // 如果评估提供了推理过程，也记录到思考过程中
            if (evaluation.reasoning) {
              thinkingProcess.push(`[评估推理] ${evaluation.reasoning}`);
            }
          } catch (error: any) {
            // 如果 LLM 评估失败，降级到快速评估
            logger.warn(`[TaskEvaluator] LLM evaluation failed, falling back to quick evaluation: ${error.message || error}`);
            const evaluation = taskEvaluator.quickEvaluate(currentMessages);
            shouldContinue = !evaluation.isLikelyComplete;
            logger.debug(`[TaskEvaluator] Quick Evaluation (fallback) result: ${evaluation.isLikelyComplete ? 'Complete' : 'Needs more work'}`);
          }
        } else {
          // 使用快速评估（轻量级，基于关键词匹配）
          logger.debug('[TaskEvaluator] Using quick evaluation (keyword-based)');
          const evaluation = taskEvaluator.quickEvaluate(currentMessages);
          shouldContinue = !evaluation.isLikelyComplete;

          logger.debug(`[TaskEvaluator] Quick Evaluation result: ${evaluation.isLikelyComplete ? 'Complete' : 'Needs more work'}`);
        }
      } else {
        // 如果没有启用评估，默认在达到最大迭代次数时结束
        shouldContinue = iteration < maxIterations;
      }

      // 如果任务完成或达到最大迭代次数，结束循环
      if (!shouldContinue || iteration >= maxIterations) {
        finalResult = {
          content: aiContent,
          iterations: iteration,
          thinkingProcess: includeThoughtsInResponse ? thinkingProcess.join('\n') : undefined,
          usage: llmResponse.usage
        };

        // 🚀 ACE Integration: Capture Trajectory
        // Only evolve if we have a valid result and ACE is active
        if (this.aceService.getEngine()) {
          const outcome = shouldContinue ? 'FAILURE' : 'SUCCESS'; // If loop broke early, it's success

          // Generate a unique task ID if not present (using request ID context if available)
          // For now we use a random UUID if requestId is not easily accessible here, 
          // but ideally we should pass requestId through options
          const taskId = options.requestId || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          const trajectory = {
            task_id: taskId,
            session_id: options.sessionId, // 🆕 添加会话ID
            user_input: userQuery,
            steps: thinkingProcess.map(t => ({
              thought: t,
              action: 'think',
              output: ''
            })),
            final_result: aiContent,
            outcome: outcome as 'SUCCESS' | 'FAILURE',
            environment_feedback: 'TaskEvaluator: ' + (shouldContinue ? 'Max iterations reached' : 'Task completed'),
            used_rule_ids: [], // We don't track rule usage in ApexBridge yet
            timestamp: Date.now(),
            duration_ms: Date.now() - startTime,
            evolution_status: 'PENDING' as const
          };

          this.aceService.evolve(trajectory).catch(err => {
            logger.error(`[ChatService] ACE Evolution failed: ${err.message}`);
          });
        }

        // 🆕 更新会话元数据（消息计数、Token使用量）
        const sessionId = options.sessionId;
        if (sessionId && this.aceService.getEngine()) {
          // 更新会话活动时间
          this.aceService.getEngine()?.updateSessionActivity(sessionId).catch(err => {
            logger.warn(`[ChatService] Failed to update session activity: ${err.message}`);
          });

          // 更新会话元数据（使用最后一次 LLM 调用的 usage）
          // 注意：这里只统计最后一次调用的 usage，后续可以优化为累计所有迭代的 usage
          this.updateSessionMetadata(sessionId, llmResponse.usage).catch(err => {
            logger.warn(`[ChatService] Failed to update session metadata: ${err.message}`);
          });
        }

        break;
      }

      // 步骤 3: 如果任务未完成，添加提示消息推动继续思考
      currentMessages.push({
        role: 'user',
        content: '请继续下一步分析，或给出最终结论。如果任务已完成，请明确说明。'
      });

      // 清理：保持上下文大小可控
      if (currentMessages.length > 50) {
        logger.warn(`⚠️ 消息历史过长(${currentMessages.length}条)，可能影响性能`);
        // 保留前几条系统消息和最后20条消息
        const systemMessages = currentMessages.filter(msg => msg.role === 'system');
        const recentMessages = currentMessages.slice(-20);
        currentMessages.length = 0;
        currentMessages.push(...systemMessages, ...recentMessages);
      }
    }

    // 如果循环结束但没有生成结果，返回最后一条 AI 回复
    if (!finalResult) {
      logger.warn(`⚠️ Self-thinking loop ended without clear result`);

      const lastAssistantMessage = [...currentMessages].reverse().find(msg => msg.role === 'assistant');
      const aiContent = lastAssistantMessage?.content || '思考循环结束，但未生成明确结果。';

      finalResult = {
        content: aiContent,
        iterations: iteration,
        thinkingProcess: includeThoughtsInResponse ? thinkingProcess.join('\n') : undefined
      };
    }

    logger.info(`✅ Self-thinking loop completed in ${iteration} iterations`);

    // 🆕 保存对话消息历史
    const conversationId = options.conversationId as string | undefined;
    if (conversationId) {
      try {
        const count = await this.conversationHistoryService.getMessageCount(conversationId);
        const messagesToSave: Message[] = [];

        // 找出新增的消息（排除原始消息）
        // 注意：currentMessages 中的原始消息引用与 messages 相同
        const newMessages = currentMessages.filter(m => !messages.includes(m));

        if (count === 0) {
          // 新对话：保存所有原始消息
          messagesToSave.push(...messages);
        } else {
          // 已有对话：只保存最后一条原始消息
          const lastMessage = messages[messages.length - 1];
          if (lastMessage) {
            messagesToSave.push(lastMessage);
          }
        }

        // 添加思考过程中的新消息
        messagesToSave.push(...newMessages);

        await this.conversationHistoryService.saveMessages(conversationId, messagesToSave);
      } catch (err: any) {
        logger.warn(`[ChatService] Failed to save conversation history: ${err.message}`);
      }
    }

    return finalResult;
  }

  /**
   * 流式处理消息
   */
  async *streamMessage(
    messages: Message[],
    options: ChatOptions = {}
  ): AsyncIterableIterator<string> {
    // 🆕 0. 生成请求ID和中断控制器
    const requestId = generateRequestId();
    const abortController = new AbortController();

    // 🆕 0.0 获取或创建会话（与 processMessage 保持一致）
    const conversationId = options.conversationId as string | undefined;
    if (conversationId) {
      try {
        const sessionId = await this.getOrCreateSession(
          options.agentId,
          options.userId,
          conversationId
        );
        if (sessionId) {
          options.sessionId = sessionId;
        }
      } catch (err: any) {
        logger.warn(`[ChatService] Failed to get/create session in stream: ${err.message}`);
        // 不阻塞流式处理，继续执行
      }
    }

    // 🆕 0.1 注册请求
    this.registerRequest(requestId, abortController, {
      model: options.model,
      messageCount: messages.length
    });

    // 🆕 0.2 发送请求ID给客户端（元数据标记）
    yield `__META__:${JSON.stringify({ type: 'requestId', value: requestId })}`;

    // 🆕 收集完整的AI回复内容（用于保存历史，需要在方法作用域内声明）
    let fullAssistantContent = '';

    try {
      let processedMessages = messages;

      // 1. 变量替换
      processedMessages = await this.resolveVariables(processedMessages);

      // 2. 消息预处理
      const preprocessedMessages = processedMessages;

      // 3. 流式调用LLM（传递中断信号）
      // 修复：使用 requireLLMClient 避免代码重复
      const llmClient = await this.requireLLMClient();

      try {
        for await (const chunk of llmClient.streamChat(preprocessedMessages, options, abortController.signal)) {
          // 🆕 检查中断
          if (abortController.signal.aborted) {
            logger.debug(`[ChatService] Request interrupted during LLM streaming: ${requestId}`);
            // 修复：发送中断元数据，但不发送错误文本给用户
            yield `__META__:${JSON.stringify({ type: 'interrupted' })}`;
            return;
          }

          // 🆕 收集完整内容
          fullAssistantContent += chunk;
          yield chunk;
        }
      } catch (error: any) {
        // 🆕 捕获中断错误
        if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
          logger.debug(`[ChatService] Request aborted: ${requestId}`);
          // 修复：发送中断元数据，但不发送错误文本给用户
          yield `__META__:${JSON.stringify({ type: 'interrupted' })}`;
          return;
        }

        // 修复：对于非中断错误，抛出异常而不是 yield 错误文本
        logger.error(`❌ LLM request failed: ${error.message}`);
        throw error; // 让上层处理错误，而不是在流中发送错误文本
      }

    } catch (error: any) {
      // 🆕 检查是否为中断错误
      if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
        logger.debug(`[ChatService] Request aborted in catch block: ${requestId}`);
        // 修复：发送中断元数据，但不发送错误文本给用户
        yield `__META__:${JSON.stringify({ type: 'interrupted' })}`;
        return;
      }

      logger.error('❌ Error in ChatService.streamMessage:', error);
      // 修复：对于非中断错误，抛出异常而不是 yield 错误文本
      throw error;
    } finally {
      // 🆕 更新会话活动时间（如果有会话）
      const sessionId = options.sessionId;
      if (sessionId && this.aceService.getEngine()) {
        // 异步更新，不阻塞响应
        this.aceService.getEngine()?.updateSessionActivity(sessionId).catch(err => {
          logger.warn(`[ChatService] Failed to update session activity in stream: ${err.message}`);
        });
      }

      // 🆕 保存对话消息历史（流式响应完成后）
      if (conversationId && fullAssistantContent) {
        try {
          // 检查是否是新对话
          const count = await this.conversationHistoryService.getMessageCount(conversationId);
          const messagesToSave: Message[] = [];

          if (count === 0) {
            // 新对话：保存所有请求消息
            messagesToSave.push(...messages.filter(m => m.role !== 'assistant'));
          } else {
            // 已有对话：只保存最后一条消息
            const lastMessage = messages[messages.length - 1];
            if (lastMessage && lastMessage.role !== 'assistant') {
              messagesToSave.push(lastMessage);
            }
          }

          // 添加 AI 回复
          messagesToSave.push({
            role: 'assistant',
            content: fullAssistantContent
          });

          await this.conversationHistoryService.saveMessages(conversationId, messagesToSave);
        } catch (err: any) {
          logger.warn(`[ChatService] Failed to save conversation history in stream: ${err.message}`);
        }
      }

      // 🆕 ACE Integration: 保存轨迹（流式单轮处理）
      if (this.aceService.getEngine() && options.sessionId && fullAssistantContent) {
        const userQuery = messages.find(m => m.role === 'user')?.content || '';
        const taskId = requestId || `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const trajectory = {
          task_id: taskId,
          session_id: options.sessionId,
          user_input: userQuery,
          steps: [{
            thought: 'Stream processing',
            action: 'chat_stream',
            output: fullAssistantContent
          }],
          final_result: fullAssistantContent,
          outcome: 'SUCCESS' as const,
          environment_feedback: 'Stream response completed',
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 0, // 流式处理，不精确计算耗时
          evolution_status: 'PENDING' as const
        };

        this.aceService.evolve(trajectory).catch(err => {
          logger.error(`[ChatService] ACE Evolution failed in stream: ${err.message}`);
        });
      }

      // 🆕 无论成功或失败，都清理请求
      this.cleanupRequest(requestId);
    }
  }

  private   /**
   * 获取所有有对话历史的会话ID
   * @returns conversation_id 列表
   */
  async getAllConversationsWithHistory(): Promise<string[]> {
    return this.conversationHistoryService.getAllConversationIds();
  }

  private async requireLLMClient(): Promise<LLMManager> {
    // 如果 llmManager 未初始化（null），尝试懒加载
    if (!this.llmManager) {
      const { LLMManager } = await import('../core/LLMManager');
      const manager = new LLMManager();
      if (!manager) {
        throw new Error('LLMManager not available. Please configure LLM providers in admin panel.');
      }
      this.llmManager = manager;
    }
    return this.llmManager;
  }

  /**
   * 解析消息中的变量
   * 
   * 使用SDK VariableEngine统一处理所有变量占位符：
   * - {{Date}}, {{Time}}, {{Today}} - 时间变量（TimeProvider）
   * - 自定义占位符（PlaceholderProvider）
   * 
   * 如果变量解析失败，会降级使用原始文本，确保请求不会因变量解析错误而失败。
   * 
   * @param messages - 消息数组
   * @returns 解析后的消息数组
   */
  private async resolveVariables(messages: Message[]): Promise<Message[]> {
    logger.debug(`[SDK] Resolving variables in ${messages.length} messages`);

    return Promise.all(
      messages.map(async (msg) => {
        if (!msg.content || typeof msg.content !== 'string') {
          return msg;
        }

        const originalContent = msg.content;
        const originalLength = originalContent.length;

        try {
          // 🎯 使用ProtocolEngine的VariableEngine，传递完整的VariableContext
          // 包括role、model等上下文信息，支持role过滤机制
          const resolvedContent = await this.protocolEngine.variableEngine.resolveAll(
            originalContent,
            {
              role: msg.role || 'system', // 传递消息角色
              currentMessage: originalContent
            }
          );

          // 调试日志：显示解析前后的长度变化
          if (originalLength !== resolvedContent.length) {
            logger.debug(
              `[SDK] Variable resolved (${msg.role}): ${originalLength} → ${resolvedContent.length} chars (+${resolvedContent.length - originalLength})`
            );
          }

          return { ...msg, content: resolvedContent };
        } catch (error: any) {
          // 🛡️ 变量解析失败时降级使用原始文本，确保请求不会因变量解析错误而失败
          logger.warn(
            `[SDK] Variable resolution failed for message (${msg.role}), using original content: ${error.message || error}`
          );

          // 降级：返回原始消息内容
          return { ...msg, content: originalContent };
        }
      })
    );
  }

}

