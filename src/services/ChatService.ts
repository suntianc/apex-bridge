/**
 * ApexBridge - 聊天服务（ABP-only）
 * 处理聊天请求的完整生命周期
 */

import { ProtocolEngine } from '../core/ProtocolEngine';
import { LLMManager as LLMClient } from '../core/LLMManager'; // 向后兼容别名
import { EventBus } from '../core/EventBus';
import {
  Message,
  ChatOptions
} from '../types';
import { ActiveRequest } from '../types/request-abort';
import { logger } from '../utils/logger';
import { generateRequestId } from '../utils/request-id';
import { TaskEvaluator } from '../core/TaskEvaluator';

export class ChatService {

  // 🆕 活动请求追踪
  private activeRequests: Map<string, ActiveRequest> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private webSocketManager: any = null; // WebSocketManager 实例（可选）
  // 🆕 自我思考循环（ReAct模式）
  private taskEvaluator?: TaskEvaluator;

  private llmClient: LLMClient | null = null; // 改为可选，支持懒加载
  
  constructor(
    private protocolEngine: ProtocolEngine,
    llmClient: LLMClient | null, // 改为可选参数
    private eventBus: EventBus
  ) {
    this.llmClient = llmClient; // 可选，可以为null（懒加载）
    logger.info('✅ ChatService initialized (using ProtocolEngine unified variable engine)');
    
    // 🆕 启动定期清理任务（每60秒）
    this.startCleanupTimer();
  }
  
  /**
   * 🆕 设置 WebSocketManager（用于中断通知）
   */
  setWebSocketManager(manager: any): void {
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
      // 🆕 检查是否启用自我思考循环（ReAct模式）
      if (options.selfThinking?.enabled) {
        return this.processMessageWithSelfThinking(messages, options);
      }

      // 原有的单次处理逻辑
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

    return {
      content: aiContent
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
    const enableTaskEvaluation = options.selfThinking?.enableTaskEvaluation ?? true;
    const includeThoughtsInResponse = options.selfThinking?.includeThoughtsInResponse ?? true;

    // 获取用户原始查询（第一条用户消息）
    const userQuery = messages.find(msg => msg.role === 'user')?.content || '';

    let iteration = 0;
    let currentMessages = [...messages];
    let finalResult: any = null;
    const thinkingProcess: string[] = []; // 记录思考过程

    // 初始化 TaskEvaluator
    this.taskEvaluator = new TaskEvaluator({
      maxIterations,
      completionPrompt: options.selfThinking?.completionPrompt
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

      logger.debug('ℹ️ Task marked as complete');
      finalResult = {
        content: aiContent,
        iterations: iteration,
        thinkingProcess: includeThoughtsInResponse ? thinkingProcess.join('\n') : undefined
      };
      break;

      // 清理：保持上下文大小可控
      if (currentMessages.length > 50) {
        logger.warn(`⚠️ 消息历史过长(${currentMessages.length}条)，可能影响性能`);
      }
    }

    if (!finalResult) {
      // 如果循环结束但没有生成结果，返回最后一条消息
      logger.warn(`⚠️ Self-thinking loop ended without clear result`);

      const llmClient = await this.requireLLMClient();
      const llmResponse = await llmClient.chat(currentMessages, options);
      const aiContent = llmResponse.choices[0]?.message?.content || '';

      finalResult = {
        content: aiContent,
        iterations: iteration,
        thinkingProcess: includeThoughtsInResponse ? thinkingProcess.join('\n') : undefined
      };
    }

    logger.info(`✅ Self-thinking loop completed in ${iteration} iterations`);

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
    
    // 🆕 0.1 注册请求
    this.registerRequest(requestId, abortController, {
      model: options.model,
      messageCount: messages.length
    });
    
    // 🆕 0.2 发送请求ID给客户端（元数据标记）
    yield `__META__:${JSON.stringify({type:'requestId',value:requestId})}`;
    
    try {
      let processedMessages = messages;
      
      // 1. 变量替换
      processedMessages = await this.resolveVariables(processedMessages);
      
      // 2. 消息预处理
      const preprocessedMessages = processedMessages;
      
      // 3. 流式调用LLM（传递中断信号）
      let llmClient = this.llmClient;
      if (!llmClient) {
        const { LLMManager } = await import('../core/LLMManager');
        llmClient = new LLMManager() as LLMClient;
        if (!llmClient) {
          throw new Error('LLMClient not available. Please configure LLM providers in admin panel.');
        }
        this.llmClient = llmClient;
      }
      
      try {
        for await (const chunk of llmClient.streamChat(preprocessedMessages, options, abortController.signal)) {
          // 🆕 检查中断
          if (abortController.signal.aborted) {
            logger.debug(`[ChatService] Request interrupted during LLM streaming: ${requestId}`);
            yield `\n\n[用户已中断请求]`;
            yield `__META__:${JSON.stringify({type:'interrupted'})}`;
            return;
          }
          
          yield chunk;
        }
      } catch (error: any) {
        // 🆕 捕获中断错误
        if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
          logger.debug(`[ChatService] Request aborted: ${requestId}`);
          yield `\n\n[用户已中断请求]`;
          yield `__META__:${JSON.stringify({type:'interrupted'})}`;
          return;
        }
        
        logger.error(`❌ LLM request failed: ${error.message}`);
        if (error.message.includes('400')) {
          yield `\n\n❌ 请求失败（上下文可能过长）。建议新建话题重试。`;
        } else {
          yield `\n\n❌ 请求失败：${error.message}`;
        }
      }
      
    } catch (error: any) {
      // 🆕 检查是否为中断错误
      if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
        logger.debug(`[ChatService] Request aborted in catch block: ${requestId}`);
        yield `\n\n[用户已中断请求]`;
        yield `__META__:${JSON.stringify({type:'interrupted'})}`;
        return;
      }
      
      logger.error('❌ Error in ChatService.streamMessage:', error);
      throw error;
    } finally {
      // 🆕 无论成功或失败，都清理请求
      this.cleanupRequest(requestId);
    }
  }
  
  private async requireLLMClient(): Promise<LLMClient> {
    let llmClient = this.llmClient;
    if (!llmClient) {
      // LLMManager 支持懒加载，从 SQLite 加载配置
      const { LLMManager } = await import('../core/LLMManager');
      llmClient = new LLMManager() as LLMClient;
      if (!llmClient) {
        throw new Error('LLMClient not available. Please configure LLM providers in admin panel.');
      }
      this.llmClient = llmClient;
    }
    return llmClient;
  }

  /**
   * 解析消息中的变量
   * 
   * 使用SDK VariableEngine统一处理所有变量占位符：
   * - {{Date}}, {{Time}}, {{Today}} - 时间变量（TimeProvider）
   * - {{TarXXX}}, {{VarXXX}} - 环境变量（EnvironmentProvider）
   * - 自定义占位符（PlaceholderProvider）
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
        
        const originalLength = msg.content.length;
        
        // 🎯 使用ProtocolEngine的VariableEngine，传递完整的VariableContext
        // 包括role、model等上下文信息，支持role过滤机制
        const resolvedContent = await this.protocolEngine.variableEngine.resolveAll(
          msg.content,
          {
            role: msg.role || 'system', // 传递消息角色
            currentMessage: msg.content
          }
        );
        
        // 调试日志：显示解析前后的长度变化
        if (originalLength !== resolvedContent.length) {
          logger.debug(
            `[SDK] Variable resolved (${msg.role}): ${originalLength} → ${resolvedContent.length} chars (+${resolvedContent.length - originalLength})`
          );
        }
        
        return { ...msg, content: resolvedContent };
      })
    );
  }

  private pruneEmptyFields(payload: Record<string, any>): Record<string, any> {
    Object.keys(payload).forEach((key) => {
      const value = payload[key];
      if (
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim().length === 0) ||
        (Array.isArray(value) && value.length === 0)
      ) {
        delete payload[key];
      }
    });
    return payload;
  }
  
  /**
   * 🆕 提取Session Memory（最近N条消息）
   */
  private extractSessionMemory(messages: Message[], limit: number = 50): Message[] {
    // 过滤掉system消息，只保留user和assistant消息
    const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
    
    // 取最后N条消息
    const sessionMessages = nonSystemMessages.slice(-limit);
    
    return sessionMessages;
  }

}

