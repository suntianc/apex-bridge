// AuthorizedToolCall 已移除，直接使用 ToolRequest

// PersonaMemoryInfo 接口已移除（记忆服务已删除）

// NodeConversationMessage 和 NodeConversationResult 已移除（节点对话功能已删除）

/**
 * ApexBridge - 聊天服务（ABP-only）
 * 处理聊天请求的完整生命周期
 */

import { randomUUID } from 'crypto';
import { ProtocolEngine } from '../core/ProtocolEngine';
import { LLMManager as LLMClient } from '../core/LLMManager'; // 向后兼容别名
import { EventBus } from '../core/EventBus';
import {
  Message,
  ChatOptions,
  ToolRequest
} from '../types';
import { ActiveRequest } from '../types/request-abort';
import { logger } from '../utils/logger';
import { generateRequestId } from '../utils/request-id';
// ConversationRouter 和 ConversationContextStore 已移除（对话路由功能已删除）
import { SkillsExecutionManager } from '../core/skills/SkillsExecutionManager';
import { SkillsToToolMapper } from '../core/skills/SkillsToToolMapper';

export class ChatService {
  
  // 🆕 活动请求追踪
  private activeRequests: Map<string, ActiveRequest> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private webSocketManager: any = null; // WebSocketManager 实例（可选）
  // 🆕 Skills 执行集成（可选，逐步替换 PluginRuntime）
  private skillsExecutionManager?: SkillsExecutionManager;
  private skillsMapper?: SkillsToToolMapper;
  
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
  
  // 🆕 注入 Skills 执行能力
  setSkillsExecution(manager: SkillsExecutionManager, mapper: SkillsToToolMapper): void {
    this.skillsExecutionManager = manager;
    this.skillsMapper = mapper;
    logger.debug('[ChatService] SkillsExecutionManager attached');
  }
  
  // setToolAuthorization 和 setNodeManager 方法已移除（工具授权和节点管理已删除）
  
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
          (abpLogChannel as any).pushToolLog?.({
            status: 'interrupted',
            tool: 'System',
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
      // 记忆服务已移除（清理变更）

      logger.debug(`📨 Processing chat message, ${messages.length} messages`);
      
      // PersonalityEngine、EmotionEngine 和 MemoryService 已移除（根据系统精简要求）
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
      
      // 4. 解析工具调用（仅支持ABP协议）
      logger.debug(`🔍 AI Response Content (first 500 chars): ${aiContent.substring(0, 500)}`);
      
      // 使用ProtocolEngine的统一解析方法（仅支持ABP协议）
      const toolRequests = this.protocolEngine.parseToolRequests(aiContent);
      
      logger.debug(`🔍 Parsed ${toolRequests.length} tool requests from AI response`);
      if (toolRequests.length > 0) {
        toolRequests.forEach((req: any, index: number) => {
          logger.debug(`   Tool ${index + 1} [ABP]: name="${req.name}", parameters=${JSON.stringify(req.args)}, id=${req.abpCallId}`);
        });
      }
      
      if (toolRequests.length === 0) {
        // 无工具调用，直接返回
        logger.debug('ℹ️  No tool calls detected');
        
        return {
          content: aiContent,
          toolCalls: []
        };
      }
      
      logger.debug(`🔧 Detected ${toolRequests.length} tool calls`);
      toolRequests.forEach((req: any) => {
        logger.debug(`   - ${req.name} [ABP] (id: ${req.abpCallId})`);
      });

      // 工具授权已移除，直接执行所有工具
      if (toolRequests.length === 0) {
        logger.debug('ℹ️  No tools to execute');
        return {
          content: aiContent,
          toolCalls: toolRequests,
          toolResults: []
        };
      }

      // ABP格式不支持archery，所有工具都是同步执行
      const syncTools = toolRequests.filter((tool) => !(tool as any).archery);
      const asyncTools = toolRequests.filter((tool) => (tool as any).archery);

      const executedResults = await Promise.all(
        syncTools.map(async (tool) => {
          logger.debug(`⚙️  Executing tool: ${tool.name}`);
          const result = await this.executeTool(tool);
          if (result.error) {
            logger.error(`❌ Tool execution failed: ${tool.name} -> ${result.error}`);
          } else {
            logger.debug(`✅ Tool ${tool.name} executed successfully`);
            logger.debug(`   Result: ${JSON.stringify(result.result ?? '').substring(0, 100)}...`);
          }
          return result;
        })
      );

      asyncTools.forEach((tool) => {
        this.executeArcheryTool(tool);
      });

      const allResults = executedResults;

      if (allResults.length > 0) {
        logger.debug(`📬 Preparing tool results for AI (${allResults.length} entries)`);

        const toolResultTexts = this.formatToolResultEntries(allResults);
        const combinedToolResults = toolResultTexts.join('\n\n');

        const toolResultMessage: Message = {
          role: 'user',
          content: combinedToolResults
        };

        logger.debug(`📬 Tool results message: ${combinedToolResults.substring(0, 200)}...`);

        const finalMessages: Message[] = [
          ...preprocessedMessages,
          { role: 'assistant', content: aiContent } as Message,
          toolResultMessage
        ];

        logger.debug('🤖 Making second LLM call with tool results...');
        const llmFollowup = await this.requireLLMClient();
        const finalResponse = await llmFollowup.chat(finalMessages, options);

        logger.debug('✅ Second LLM call completed');

        return {
          content: finalResponse.choices[0]?.message?.content || '',
          toolCalls: toolRequests,
          toolResults: allResults
        };
      }
      
      // 7. 只有异步工具，返回初始响应
      return {
        content: aiContent,
        toolCalls: toolRequests,
        toolResults: []
      };
      
    } catch (error: any) {
      logger.error('❌ Error in ChatService.processMessage:', error);
      throw error;
    }
  }
  
  // processNodeConversation 方法已移除（节点对话功能已删除）
  // 如果类型为 companion 或 worker，应该使用普通的 processMessage 方法
 
  /**
   * 流式处理消息 - 支持工具调用循环（参考早期实现的聊天处理循环，已改为 ABP-only）
   */
  async *streamMessage(
    messages: Message[],
    options: ChatOptions = {}
  ): AsyncIterableIterator<string> {
    // 记忆服务已移除（清理变更）

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
      // PersonalityEngine、EmotionEngine 和 MemoryService 已移除（根据系统精简要求）
      let processedMessages = messages;
      
      // 1. 变量替换
      processedMessages = await this.resolveVariables(processedMessages);
      
      // 2. 消息预处理（移除对插件系统依赖，直接使用变量解析后的消息）
      const preprocessedMessages = processedMessages;
      
      // 3. 循环控制参数
      const currentMessages = [...preprocessedMessages];
      let recursionDepth = 0;
      const maxRecursion = options.maxRecursion || 5; // 可配置的最大递归深度
      const loopTimeout = options.loopTimeout || 300000; // 5分钟总超时
      const startTime = Date.now();
      
        // 4. 主循环：工具调用循环（ABP-only 实现）
      while (recursionDepth < maxRecursion) {
        // 4.0 超时检查
        if (Date.now() - startTime > loopTimeout) {
          logger.warn(`⚠️  [Protocol Loop] Loop timeout (${loopTimeout}ms) reached, exiting`);
          break;
        }
        
        logger.debug(`🔄 [Protocol Loop] Iteration ${recursionDepth + 1}/${maxRecursion}`);
        
        // 🔍 4.0.1 上下文长度检查（防止400错误）
        const totalChars = currentMessages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0);
        const estimatedTokens = Math.ceil(totalChars / 3); // 粗略估算：3字符≈1token
        const maxContextTokens = 30000; // DeepSeek上下文限制（保守估计）
        
        if (estimatedTokens > maxContextTokens) {
          logger.warn(`⚠️  [Protocol Loop] Context too long: ~${estimatedTokens} tokens (max: ${maxContextTokens})`);
          logger.warn(`⚠️  [Protocol Loop] Stopping to prevent 400 error. Please start a new topic.`);
          yield `\n\n⚠️ 上下文过长（约${estimatedTokens}个token），已停止循环。请新建话题继续对话。`;
          break;
        }
        
        // 🆕 4.0.5 检查中断信号
        if (abortController.signal.aborted) {
          logger.debug(`[ChatService] Request interrupted before LLM call: ${requestId}`);
          yield `__META__:${JSON.stringify({type:'interrupted'})}`;
          break;
        }
        
        // 4.1 流式调用LLM（传递中断信号）
        // 懒加载LLMClient（如果还没有）
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
        
        let fullContent = '';
        try {
          for await (const chunk of llmClient.streamChat(currentMessages, options, abortController.signal)) {
            // 🆕 检查中断
            if (abortController.signal.aborted) {
              logger.debug(`[ChatService] Request interrupted during LLM streaming: ${requestId}`);
              yield `\n\n[用户已中断请求]`;
              yield `__META__:${JSON.stringify({type:'interrupted'})}`;
              return; // 退出generator
            }
            
            fullContent += chunk;
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
          
          // 🔍 捕获LLM错误（如400），避免污染消息历史
          logger.error(`❌ [Protocol Loop] LLM request failed in iteration ${recursionDepth + 1}: ${error.message}`);
          
          // 如果是400错误，给用户友好提示
          if (error.message.includes('400')) {
            yield `\n\n❌ 请求失败（上下文可能过长）。建议新建话题重试。`;
          } else {
            yield `\n\n❌ 请求失败：${error.message}`;
          }
          
          // 立即退出循环，不修改currentMessages
          break;
        }
        
        // 4.2 解析工具调用（仅使用 ABP 协议）
        const toolRequests = this.protocolEngine.parseToolRequests(fullContent);
        
        if (toolRequests.length === 0) {
          logger.debug('🔄 [Protocol Loop] No tool calls found, exiting loop');
          break; // 无工具调用，退出循环
        }
        
        logger.debug(`🔧 [Protocol Loop] Found ${toolRequests.length} tool calls in iteration ${recursionDepth + 1}`);
        
        // 4.3 将AI响应添加到消息历史
        currentMessages.push({ role: 'assistant', content: fullContent });

        // 工具授权已移除，直接执行所有工具
        if (toolRequests.length === 0) {
          logger.debug('🔄 [Protocol Loop] No tools to execute, exiting loop');
          break;
        }

        const syncTools = toolRequests.filter((tool) => !tool.archery);
        const asyncTools = toolRequests.filter((tool) => tool.archery);
        
        if (asyncTools.length > 0) {
          logger.debug(`🏹 [Protocol Loop] Executing ${asyncTools.length} archery tools (fire-and-forget)`);
          asyncTools.forEach((tool) => this.executeArcheryTool(tool));
        }
        
        if (syncTools.length === 0) {
          logger.debug('🔄 [Protocol Loop] Only archery tools found, exiting loop');
          break;
        }
        
        logger.debug(`🔧 [Protocol Loop] Executing ${syncTools.length} sync tools in parallel...`);
        
        const executedResults = await Promise.all(
          syncTools.map(async (tool) => this.executeTool(tool))
        );
        const allResults = executedResults;

        if (allResults.length > 0) {
          const toolResultTexts = this.formatToolResultEntries(allResults);
          const combinedToolResults = toolResultTexts.join('\n\n');
          currentMessages.push({ role: 'user', content: combinedToolResults });
          logger.debug(`🔄 [Protocol Loop] Tool results added to message history, preparing next iteration`);
        }
        
        // 4.8 增加递归深度
        recursionDepth++;
      }
      
      // 5. 检查是否达到最大递归深度
      if (recursionDepth >= maxRecursion) {
        logger.warn(`⚠️  [Protocol Loop] Max recursion depth (${maxRecursion}) reached`);
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
  
  // evaluateToolAuthorization、buildAuthorizationError 方法已移除（工具授权已删除）

  private formatToolResultEntries(entries: Array<{ tool: string; result?: any; error?: string }>): string[] {
    return entries.map((entry) => {
      if (entry.error) {
        return `来自工具 "${entry.tool}" 的结果:\n执行错误：${entry.error}`;
      }
      const resultText =
        typeof entry.result === 'object' && entry.result !== null
          ? JSON.stringify(entry.result, null, 2)
          : String(entry.result);
      return `来自工具 "${entry.tool}" 的结果:\n${resultText}`;
    });
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

  // resolveApprovalForDecision、findMatchingApproval、ensureToolApprovalRequest 方法已移除（工具授权已删除）

  // resolvePersonaMemoryInfo 方法已移除（记忆服务已删除）

  private async executeTool(
    tool: ToolRequest
  ): Promise<{ tool: string; result?: any; error?: string }> {
    try {
      // 节点派发逻辑已移除，所有工具在本地执行（通过 SkillsExecutionManager）

      // 仅走 Skills 执行通路（不再回退到插件系统）
      if (!this.skillsExecutionManager || !this.skillsMapper) {
        return {
          tool: tool.name,
          error: 'Skills execution is not configured'
        };
      }
      // 将工具调用转换为 Skills 执行请求（intent 使用工具名），并用偏好补全缺省参数
      let execReq;
      if (this.preferenceService) {
        try {
          const prefsView = this.preferenceService.getView({
            userId: 'default',
            sessionId: undefined
          });
          const prefs = Object.fromEntries(
            Object.entries(prefsView.merged).map(([k, v]) => [k, v.value])
          ) as Record<string, unknown>;
          execReq = await this.skillsMapper.convertToolCallToExecutionRequestWithDefaults(tool, prefs);
        } catch (e) {
          logger.debug(`[ChatService] Tool param defaults from preferences skipped: ${(e as Error).message}`);
          execReq = await this.skillsMapper.convertToolCallToExecutionRequest(tool);
        }
      } else {
        execReq = await this.skillsMapper.convertToolCallToExecutionRequest(tool);
      }
      const response = await this.skillsExecutionManager.executeByIntent(tool.name, {
        skillName: execReq.skillName,
        parameters: execReq.parameters,
        context: {
          metadata: { origin: 'chat_service' }
        }
      } as any);
      const mapped = await this.skillsMapper.convertExecutionResponseToToolResult(response);
      return {
        tool: tool.name,
        result: mapped
      };
    } catch (error: any) {
      logger.error(`❌ 工具执行失败: ${tool.name}`, error);
      return {
        tool: tool.name,
        error: error?.message ?? String(error)
      };
    }
  }

  private executeArcheryTool(tool: ToolRequest): void {
    logger.debug(`🏹 Async tool triggered: ${tool.name}`);

    // 节点派发逻辑已移除，异步工具在 Skills 架构中不支持，记录告警
    logger.warn(`⚠️ Archery tool not supported in skills-only architecture: ${tool.name}`);
  }

  /**
   * 解析消息中的变量
   * 
   * 使用SDK VariableEngine统一处理所有变量占位符：
   * - {{ABPAllTools}} - 所有工具描述（ToolDescriptionProvider）
   * - {{ToolName}} - 单个工具描述（ToolDescriptionProvider）
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

  /**
   * 🆕 记录情感（如果检测到）
   * 辅助方法，确保情感记录不阻塞对话流程
   */
  private preferenceService?: import('./PreferenceService').PreferenceService;

  setPreferenceService(service: import('./PreferenceService').PreferenceService): void {
    this.preferenceService = service;
  }

  // recordEmotionIfDetected 方法已移除（MemoryService 已移除）
  // buildNodeConversationMessages 方法已移除（节点对话功能已删除）

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
  
  // recordMemoryAndPublishEvent 方法已移除（MemoryService 已移除）

  // recallPersonaMemories 方法已移除（记忆服务已删除）
  // injectMemoriesIntoMessages 方法已移除（记忆服务已删除）

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

  // filterMemoryByContext 方法已移除（记忆服务已删除）
}

