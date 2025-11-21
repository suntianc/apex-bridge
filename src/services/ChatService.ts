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
import { IWebSocketManager } from '../api/websocket/WebSocketManager';
import { ConfigService } from './ConfigService';
import { AceService } from './AceService';

export class ChatService {

  // 🆕 活动请求追踪
  private activeRequests: Map<string, ActiveRequest> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private webSocketManager: IWebSocketManager | null = null; // WebSocketManager 实例（可选）

  private llmClient: LLMClient | null = null; // 改为可选，支持懒加载
  private aceService: AceService;

  constructor(
    private protocolEngine: ProtocolEngine,
    llmClient: LLMClient | null, // 改为可选参数
    private eventBus: EventBus
  ) {
    this.llmClient = llmClient; // 可选，可以为null（懒加载）
    this.aceService = AceService.getInstance();

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
        if (this.aceService.getAgent()) {
          const outcome = shouldContinue ? 'FAILURE' : 'SUCCESS'; // If loop broke early, it's success

          // Generate a unique task ID if not present (using request ID context if available)
          // For now we use a random UUID if requestId is not easily accessible here, 
          // but ideally we should pass requestId through options
          const taskId = options.requestId || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          const trajectory = {
            task_id: taskId,
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
    yield `__META__:${JSON.stringify({ type: 'requestId', value: requestId })}`;

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

