type AuthorizedToolCall = {
  tool: ToolRequest;
  decision: ToolAuthorizationDecision;
};

interface PersonaMemoryInfo {
  personaId: string;
  userId: string;
  conversationId?: string;
  memoryUserId: string;
  knowledgeBase: string;
}

type NodeConversationMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
};

interface NodeConversationResult {
  content: string;
  rawResult: any;
  partialOutputs: Array<{ chunk: string; timestamp: number }>;
  delegations?: any[];
  usage?: any;
}

/**
 * ApexBridge - 聊天服务（ABP-only）
 * 处理聊天请求的完整生命周期
 */

import { randomUUID } from 'crypto';
import { Memory } from '../types/memory';
import { ProtocolEngine } from '../core/ProtocolEngine';
import { LLMClient } from '../core/LLMClient';
import { EventBus } from '../core/EventBus';
import { PersonalityEngine } from '../core/PersonalityEngine';
import { EmotionEngine } from '../core/EmotionEngine';
import { NodeManager } from '../core/NodeManager';
import { IMemoryService } from '../types/memory';
import {
  Message,
  ChatOptions,
  ToolRequest,
  ToolAuthorizationDecision,
  ToolApprovalRequest
} from '../types';
import { ActiveRequest } from '../types/request-abort';
import { logger } from '../utils/logger';
import { generateRequestId } from '../utils/request-id';
import { ToolAuthorization } from '../core/conversation/ToolAuthorization';
import { RouteResolution } from '../core/conversation/ConversationRouter';
import { conversationContextStore } from '../core/conversation/ConversationContextStore';
import { PromptBuilder } from './memory/PromptBuilder';
import { SemanticMemoryService } from './memory/SemanticMemoryService';
import { EpisodicMemoryService } from './memory/EpisodicMemoryService';
import { SkillsExecutionManager } from '../core/skills/SkillsExecutionManager';
import { SkillsToToolMapper } from '../core/skills/SkillsToToolMapper';

export class ChatService {
  
  // 🆕 活动请求追踪
  private activeRequests: Map<string, ActiveRequest> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private webSocketManager: any = null; // WebSocketManager 实例（可选）
  private personalityEngine?: PersonalityEngine; // 🆕 人格引擎（可选）
  private emotionEngine?: EmotionEngine; // 🆕 情感引擎（可选）
  private memoryService?: IMemoryService; // 🆕 记忆服务（可选）
  private semanticMemoryService?: SemanticMemoryService; // 🆕 语义记忆服务（可选）
  private episodicMemoryService?: EpisodicMemoryService; // 🆕 情景记忆服务（可选）
  private promptBuilder?: PromptBuilder; // 🆕 Prompt构建器（可选）
  private toolAuthorization?: ToolAuthorization;
  private nodeManager?: NodeManager;
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
  
  setToolAuthorization(authorization: ToolAuthorization): void {
    this.toolAuthorization = authorization;
    logger.debug('[ChatService] ToolAuthorization attached');
    logger.debug('[ChatService] ToolAuthorization attached');
  }
  
  setNodeManager(manager: NodeManager): void {
    this.nodeManager = manager;
    logger.debug('[ChatService] NodeManager attached');
  }
  
  /**
   * 🆕 设置PersonalityEngine（可选）
   */
  setPersonalityEngine(engine: PersonalityEngine): void {
    this.personalityEngine = engine;
    logger.debug('[ChatService] PersonalityEngine attached');
  }
  
  /**
   * 🆕 设置EmotionEngine（可选）
   */
  setEmotionEngine(engine: EmotionEngine): void {
    this.emotionEngine = engine;
    logger.debug('[ChatService] EmotionEngine attached');
  }
  
  /**
   * 🆕 设置MemoryService（可选）
   */
  setMemoryService(service: IMemoryService): void {
    this.memoryService = service;
    logger.debug('[ChatService] MemoryService attached');
  }

  /**
   * 🆕 设置SemanticMemoryService（可选）
   */
  setSemanticMemoryService(service: SemanticMemoryService): void {
    this.semanticMemoryService = service;
    this.updatePromptBuilder();
    logger.debug('[ChatService] SemanticMemoryService attached');
  }

  /**
   * 🆕 设置EpisodicMemoryService（可选）
   */
  setEpisodicMemoryService(service: EpisodicMemoryService): void {
    this.episodicMemoryService = service;
    this.updatePromptBuilder();
    logger.debug('[ChatService] EpisodicMemoryService attached');
  }

  /**
   * 🆕 更新PromptBuilder实例（当记忆服务变更时）
   */
  private updatePromptBuilder(): void {
    if (this.semanticMemoryService || this.episodicMemoryService) {
      this.promptBuilder = new PromptBuilder(
        this.semanticMemoryService,
        this.episodicMemoryService
      );
      logger.debug('[ChatService] PromptBuilder updated');
    }
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
   * 处理聊天消息
   */
  async processMessage(messages: Message[], options: ChatOptions = {}, route?: RouteResolution): Promise<any> {
    try {
      const personaInfo = this.resolvePersonaMemoryInfo(route, options);
      const lastUserMessage = [...messages].reverse().find((msg) => msg.role === 'user');
      await this.recallPersonaMemories(lastUserMessage, route, personaInfo);

      logger.debug(`📨 Processing chat message, ${messages.length} messages`);
      
      // 🆕 0. 注入人格（如果有agentId和PersonalityEngine）
      let processedMessages = messages;
      let detectedEmotion = null;
      let personality = null;
      
      if (options.agentId && this.personalityEngine) {
        personality = this.personalityEngine.loadPersonality(options.agentId);
        processedMessages = this.personalityEngine.injectIntoMessages(messages, personality, options.agentId);
        logger.debug(`🎭 Injected personality: ${options.agentId}`);
      }
      
      // 🆕 0.5 识别用户情感（在LLM调用前）
      if (this.emotionEngine && processedMessages.length > 0) {
        // 找到最后一条用户消息
        const userMessages = processedMessages.filter(msg => msg.role === 'user');
        const lastUserMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1] : null;
        
        if (lastUserMessage && lastUserMessage.content) {
          try {
            detectedEmotion = await this.emotionEngine.detectEmotion(lastUserMessage.content);
            logger.debug(`💭 Detected emotion: ${detectedEmotion.type} (intensity: ${detectedEmotion.intensity.toFixed(2)})`);
            
            // 生成共情响应并注入到System Prompt（如果有情感且有人格）
            if (detectedEmotion.type !== 'neutral' && personality) {
              const empatheticResponse = this.emotionEngine.generateEmpatheticResponse(detectedEmotion, personality);
              if (empatheticResponse) {
                // 将共情响应添加到第一个system message（如果存在）
                const systemMessages = processedMessages.filter(msg => msg.role === 'system');
                if (systemMessages.length > 0) {
                  systemMessages[0].content += `\n\n用户当前情绪：${detectedEmotion.type}。${empatheticResponse}`;
                } else {
                  // 如果没有system message，创建一个
                  processedMessages.unshift({
                    role: 'system',
                    content: `用户当前情绪：${detectedEmotion.type}。${empatheticResponse}`
                  });
                }
                logger.debug(`💝 Injected empathetic response for ${detectedEmotion.type}`);
              }
            }
          } catch (error: any) {
            logger.warn(`⚠️ Emotion detection failed, continuing without emotion adjustment: ${error.message}`);
          }
        }
      }

      // 🆕 0.6 注入记忆（在LLM调用前）
      // 优先使用 PromptBuilder（如果可用），否则使用旧的记忆注入方法
      if (personaInfo) {
        try {
          if (this.promptBuilder) {
            // 使用 PromptBuilder 构建标准 Prompt 结构
            const promptStructure = await this.promptBuilder.buildPrompt(processedMessages, {
              includeUserProfile: true,
              includeHouseholdProfile: true,
              includeSessionMemory: true,
              sessionMemoryLimit: 50,
              semanticMemoryTopK: 3,
              episodicMemoryTopK: 1,
              includeToolInstr: true, // 包含 ABP 工具调用格式定义
              memoryFilter: {
                userId: personaInfo.userId,
                personaId: personaInfo.personaId,
                householdId: personaInfo.knowledgeBase
              },
              maxTokens: options.maxTokens // 如果指定了 Token 限制
            });

            // 将 Prompt 结构转换为消息数组
            processedMessages = this.promptBuilder.toMessages(promptStructure);
            logger.debug('[ChatService] Memory injection completed using PromptBuilder');
          } else if (this.memoryService) {
            // Fallback 到旧的记忆注入方法
            processedMessages = await this.injectMemoriesIntoMessages(
              processedMessages,
              personaInfo,
              options
            );
          }
        } catch (error: any) {
          logger.warn(`⚠️ Memory injection failed, continuing without memory: ${error.message}`);
        }
      }
      
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
          const protocol = req.protocol || 'abp';
          if (protocol === 'abp') {
            logger.debug(`   Tool ${index + 1} [ABP]: name="${req.name}", parameters=${JSON.stringify(req.args)}, id=${req.abpCallId}`);
          } else {
            // 不再支持VCP协议，但保留日志兼容性
            logger.debug(`   Tool ${index + 1} [${protocol.toUpperCase()}]: name="${req.name}", args=${JSON.stringify(req.args)}`);
          }
        });
      }
      
      if (toolRequests.length === 0) {
        // 无工具调用，直接返回
        logger.debug('ℹ️  No tool calls detected');
        
        // 🆕 记录用户情感
        this.recordEmotionIfDetected(detectedEmotion, messages, personaInfo, route);
        
        // 🆕 记录记忆并发布事件（触发文档分析场景）
        if (lastUserMessage && lastUserMessage.content) {
          await this.recordMemoryAndPublishEvent(lastUserMessage.content, personaInfo, {
            messageCount: messages.length,
            hasEmotion: !!detectedEmotion
          });
        }
        
        return {
          content: aiContent,
          toolCalls: []
        };
      }
      
      logger.debug(`🔧 Detected ${toolRequests.length} tool calls`);
      toolRequests.forEach((req: any) => {
        const protocol = req.protocol || 'vcp';
        if (protocol === 'abp') {
          logger.debug(`   - ${req.name} [ABP] (id: ${req.abpCallId})`);
        } else {
          logger.debug(`   - ${req.name} [VCP] ${req.archery ? '(archery)' : ''}`);
        }
      });

      const authorization = this.evaluateToolAuthorization(toolRequests, route);
      const allowedTools = authorization.allowed;
      const blockedTools = authorization.blocked;
      if (blockedTools.length > 0) {
        blockedTools.forEach(({ tool, decision }) => {
          logger.warn(
            `🚫 Tool "${tool.name}" blocked by authorization: status=${decision.status}, reason=${decision.reason}`
          );
        });
      }

      if (allowedTools.length === 0) {
        if (blockedTools.length === 0) {
          logger.debug('ℹ️  No executable tools after authorization');
          this.recordEmotionIfDetected(detectedEmotion, messages, personaInfo, route);
          return {
            content: aiContent,
            toolCalls: toolRequests,
            toolResults: []
          };
        }

        const blockedResults = blockedTools.map(({ tool, decision }) => ({
          tool: tool.name,
          error: this.buildAuthorizationError(decision)
        }));

        const toolResultTexts = this.formatToolResultEntries(blockedResults);
        const combinedToolResults = toolResultTexts.join('\n\n');

        const toolResultMessage: Message = {
          role: 'user',
          content: combinedToolResults
        };

        logger.debug(`📬 Tool authorization message: ${combinedToolResults.substring(0, 200)}...`);

        const finalMessages: Message[] = [
          ...preprocessedMessages,
          { role: 'assistant', content: aiContent } as Message,
          toolResultMessage
        ];

        logger.debug('🤖 Making second LLM call with authorization feedback...');
        const llmFollowup = await this.requireLLMClient();
        const finalResponse = await llmFollowup.chat(finalMessages, options);

        logger.debug('✅ Second LLM call completed (authorization feedback)');

        this.recordEmotionIfDetected(detectedEmotion, messages, personaInfo, route);

        return {
          content: finalResponse.choices[0]?.message?.content || '',
          toolCalls: toolRequests,
          toolResults: blockedResults
        };
      }

      allowedTools.forEach(({ tool, decision }) => {
        const protocol = (tool as any).protocol || 'vcp';
        const isArchery = (tool as any).archery || false; // ABP格式不支持archery，默认为false
        logger.debug(
          `   ✔ ${tool.name} [${protocol}] ${isArchery ? '(archery)' : ''} [origin=${decision.originType}${
            decision.originNodeId ? `:${decision.originNodeId}` : ''
          }]`
        );
      });

      // ABP格式不支持archery，所有工具都是同步执行
      const syncTools = allowedTools.filter(({ tool }) => !(tool as any).archery);
      const asyncTools = allowedTools.filter(({ tool }) => (tool as any).archery);

      const executedResults = await Promise.all(
        syncTools.map(async (call) => {
          logger.debug(
            `⚙️  Executing tool: ${call.tool.name} [origin=${call.decision.originType}${
              call.decision.originNodeId ? `:${call.decision.originNodeId}` : ''
            }]`
          );
          // 插件系统已移除，不再输出可用插件列表
          const result = await this.executeAllowedTool(call, route);
          if (result.error) {
            logger.error(`❌ Tool execution failed: ${call.tool.name} -> ${result.error}`);
          } else {
            logger.debug(`✅ Tool ${call.tool.name} executed successfully`);
            logger.debug(`   Result: ${JSON.stringify(result.result ?? '').substring(0, 100)}...`);
          }
          return result;
        })
      );

      asyncTools.forEach((call) => {
        this.executeAllowedArcheryTool(call, route);
      });

      const blockedResults = blockedTools.map(({ tool, decision }) => ({
        tool: tool.name,
        error: this.buildAuthorizationError(decision)
      }));
      const allResults = [...executedResults, ...blockedResults];

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

        this.recordEmotionIfDetected(detectedEmotion, messages, personaInfo, route);

        return {
          content: finalResponse.choices[0]?.message?.content || '',
          toolCalls: toolRequests,
          toolResults: allResults
        };
      }
      
      // 7. 只有异步工具，返回初始响应
      // 🆕 记录用户情感
      this.recordEmotionIfDetected(detectedEmotion, messages, personaInfo, route);
      
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
  
  async processNodeConversation(
    messages: Message[],
    options: ChatOptions = {},
    route: RouteResolution
  ): Promise<NodeConversationResult> {
    if (!route || !route.primaryTarget) {
      throw new Error('会话路由信息缺失，无法派发节点对话');
    }

    const target = route.primaryTarget;
    if (target.type === 'hub') {
      throw new Error('Hub 人格无需节点对话处理');
    }

    if (!target.nodeId) {
      throw new Error(`目标成员 ${target.memberId ?? target.personaId ?? 'unknown'} 未绑定节点`);
    }

    if (!this.nodeManager) {
      throw new Error('NodeManager 未初始化，无法派发对话任务');
    }

    const supportedNodeTypes: Array<typeof target.type> = ['companion', 'worker'];
    if (!supportedNodeTypes.includes(target.type)) {
      throw new Error(`当前会话暂不支持 ${target.type} 类型节点直接回复`);
    }

    const personaInfo = this.resolvePersonaMemoryInfo(route, options);
    const lastUserMessage = [...messages].reverse().find((msg) => msg.role === 'user');
    if (lastUserMessage) {
      await this.recallPersonaMemories(lastUserMessage, route, personaInfo);
    }

    logger.debug('[ChatService] Node raw options', {
      model: options?.model ?? null,
      keys: Object.keys(options ?? {})
    });

    let detectedEmotion: any = null;
    if (this.emotionEngine && lastUserMessage?.content) {
      try {
        detectedEmotion = await this.emotionEngine.detectEmotion(lastUserMessage.content);
      } catch (error: any) {
        logger.warn(`⚠️ Emotion detection failed for node conversation: ${error?.message ?? error}`);
      }
    }

    let nodeMessages = this.buildNodeConversationMessages(route, messages);
    if (nodeMessages.length === 0) {
      throw new Error('无法构建会话消息发送给节点');
    }

    if (this.personalityEngine && target.personaId) {
      try {
        const personality = this.personalityEngine.loadPersonality(target.personaId);
        const injected = this.personalityEngine
          .injectIntoMessages(nodeMessages, personality, target.personaId)
          .filter(
            (msg): msg is Message & { role: 'system' | 'user' | 'assistant' } =>
              msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant'
          )
          .map((msg) => {
            const result: NodeConversationMessage = {
              role: msg.role,
              content: msg.content ?? ''
            };
            if (msg.name) {
              result.name = msg.name;
            }
            return result;
          });
        if (injected.length > 0) {
          nodeMessages = injected;
        }
        logger.debug(`[ChatService] Injected personality prompt for node conversation (${target.personaId})`);
      } catch (error: any) {
        logger.warn(
          `[ChatService] Failed to inject personality for ${target.personaId}, continue without personality`,
          error?.message ?? error
        );
      }
    }

    const llmPayload: Record<string, unknown> = {};
    if (options.model) {
      llmPayload.model = options.model;
    }
    if (typeof options.temperature === 'number') {
      llmPayload.temperature = options.temperature;
    }
    if (typeof options.max_tokens === 'number') {
      llmPayload.maxTokens = options.max_tokens;
    }
    llmPayload.stream = options.stream === true;

    const personaState =
      target.personaId && route.context.personaState
        ? route.context.personaState[target.personaId]
        : undefined;

    const toolMetadata: Record<string, any> = {
      sessionType: route.sessionType,
      waitForResult: route.waitForResult,
      personaId: target.personaId,
      memberId: target.memberId,
      mentions: route.mentions?.length ? route.mentions : undefined,
      userId:
        (options as any)?.userId ??
        options.user ??
        (options as any)?.user ??
        personaInfo.userId ??
        'default',
      conversationMembers: route.context.members?.map((member) => ({
        memberId: member.memberId,
        personaId: member.personaId,
        type: member.type,
        nodeId: member.nodeId
      })),
      personaState,
      detectedEmotion: detectedEmotion
        ? {
            type: detectedEmotion.type,
            intensity: detectedEmotion.intensity,
            confidence: detectedEmotion.confidence
          }
        : undefined
    };
    this.pruneEmptyFields(toolMetadata);

    const toolArgs = {
      conversationId: route.conversationId,
      messages: nodeMessages,
      llm: llmPayload,
      metadata: toolMetadata
    };

    const capability = target.type === 'worker' ? 'worker' : 'companion';
    const toolName = target.type === 'worker' ? 'worker_conversation' : 'companion_conversation';

    logger.info('[ChatService] Dispatching node conversation', {
      conversationId: route.conversationId,
      memberId: target.memberId,
      personaId: target.personaId,
      model: llmPayload.model ?? null,
      nodeType: target.type
    });

    const assignmentMetadata: Record<string, any> = {
      conversationId: route.conversationId,
      personaId: target.personaId,
      memberId: target.memberId,
      sessionType: route.sessionType,
      mentions: route.mentions?.length ? route.mentions : undefined,
      origin: 'chat_service'
    };
    this.pruneEmptyFields(assignmentMetadata);

    let nodeResult: any;
    try {
      const { result } = this.nodeManager.dispatchTaskToNode(target.nodeId, {
        capability,
        toolName,
        toolArgs,
        metadata: assignmentMetadata
      });
      nodeResult = await result;
    } catch (error: any) {
      logger.error(`[ChatService] Node conversation dispatch failed (node=${target.nodeId}):`, error);
      throw new Error(error?.message || '节点对话执行失败');
    }

    const partialOutputs = Array.isArray(nodeResult?.partialOutputs)
      ? nodeResult.partialOutputs
          .filter(
            (chunk: any) =>
              chunk &&
              typeof chunk === 'object' &&
              typeof chunk.chunk === 'string' &&
              chunk.chunk.length > 0
          )
          .map((chunk: any) => ({
            chunk: chunk.chunk,
            timestamp: typeof chunk.timestamp === 'number' ? chunk.timestamp : Date.now()
          }))
      : [];

    const delegations = Array.isArray(nodeResult?.delegations)
      ? nodeResult.delegations
      : undefined;

    let content = '';
    const replyPayload = nodeResult?.reply;
    if (typeof replyPayload === 'string') {
      content = replyPayload;
    } else if (replyPayload && typeof replyPayload === 'object') {
      if (typeof replyPayload.text === 'string') {
        content = replyPayload.text;
      } else if (typeof replyPayload.content === 'string') {
        content = replyPayload.content;
      }
    } else if (typeof nodeResult === 'string') {
      content = nodeResult;
    }

    if (!content && partialOutputs.length > 0) {
      content = partialOutputs.map((item) => item.chunk).join('');
    }

    this.recordEmotionIfDetected(detectedEmotion, messages, personaInfo, route);

    if (lastUserMessage?.content) {
      await this.recordMemoryAndPublishEvent(lastUserMessage.content, personaInfo, {
        messageCount: messages.length,
        hasEmotion: !!detectedEmotion
      });
    }

    return {
      content: content ?? '',
      rawResult: nodeResult,
      partialOutputs,
      delegations,
      usage: nodeResult?.usage
    };
  }
 
  /**
   * 流式处理消息 - 支持工具调用循环（参考VCPToolBox chatCompletionHandler.js:446-861）
   */
  async *streamMessage(
    messages: Message[],
    options: ChatOptions = {},
    route?: RouteResolution
  ): AsyncIterableIterator<string> {
    const personaInfo = this.resolvePersonaMemoryInfo(route, options);
    const lastUserMessage = [...messages].reverse().find((msg) => msg.role === 'user');
    await this.recallPersonaMemories(lastUserMessage, route, personaInfo);

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
      // 🆕 0. 注入人格（如果有agentId和PersonalityEngine）
      let processedMessages = messages;
      let detectedEmotion = null;
      let personality = null;
      
      if (options.agentId && this.personalityEngine) {
        personality = this.personalityEngine.loadPersonality(options.agentId);
        processedMessages = this.personalityEngine.injectIntoMessages(messages, personality, options.agentId);
        logger.debug(`🎭 Injected personality: ${options.agentId}`);
      }
      
      // 🆕 0.5 识别用户情感（在LLM调用前，流式对话也需要）
      if (this.emotionEngine && processedMessages.length > 0) {
        // 找到最后一条用户消息
        const userMessages = processedMessages.filter(msg => msg.role === 'user');
        const lastUserMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1] : null;
        
        if (lastUserMessage && lastUserMessage.content) {
          try {
            detectedEmotion = await this.emotionEngine.detectEmotion(lastUserMessage.content);
            logger.debug(`💭 Detected emotion: ${detectedEmotion.type} (intensity: ${detectedEmotion.intensity.toFixed(2)})`);
            
            // 生成共情响应并注入到System Prompt（如果有情感且有人格）
            if (detectedEmotion.type !== 'neutral' && personality) {
              const empatheticResponse = this.emotionEngine.generateEmpatheticResponse(detectedEmotion, personality);
              if (empatheticResponse) {
                // 将共情响应添加到第一个system message（如果存在）
                const systemMessages = processedMessages.filter(msg => msg.role === 'system');
                if (systemMessages.length > 0) {
                  systemMessages[0].content += `\n\n用户当前情绪：${detectedEmotion.type}。${empatheticResponse}`;
                } else {
                  // 如果没有system message，创建一个
                  processedMessages.unshift({
                    role: 'system',
                    content: `用户当前情绪：${detectedEmotion.type}。${empatheticResponse}`
                  });
                }
                logger.debug(`💝 Injected empathetic response for ${detectedEmotion.type}`);
              }
            }
          } catch (error: any) {
            logger.warn(`⚠️ Emotion detection failed, continuing without emotion adjustment: ${error.message}`);
          }
        }
      }
      
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
      
      // 4. 主循环：工具调用循环（参考VCPToolBox while循环）
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
          const { RuntimeConfigService } = await import('./RuntimeConfigService');
          const runtimeConfig = RuntimeConfigService.getInstance();
          llmClient = await runtimeConfig.getLLMClient();
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
        
        // 4.2 解析工具调用
        // VCP协议已移除，仅使用ABP协议
        const toolRequests = this.protocolEngine.parseToolRequests(fullContent);
        
        if (toolRequests.length === 0) {
          logger.debug('🔄 [Protocol Loop] No tool calls found, exiting loop');
          break; // 无工具调用，退出循环
        }
        
        logger.debug(`🔧 [Protocol Loop] Found ${toolRequests.length} tool calls in iteration ${recursionDepth + 1}`);
        
        // 4.3 将AI响应添加到消息历史
        currentMessages.push({ role: 'assistant', content: fullContent });

        const authorization = this.evaluateToolAuthorization(toolRequests, route);
        const allowedTools = authorization.allowed;
        const blockedTools = authorization.blocked;

        if (blockedTools.length > 0) {
          blockedTools.forEach(({ tool, decision }) => {
            logger.warn(
              `🚫 [Protocol Loop] Tool "${tool.name}" blocked: status=${decision.status}, reason=${decision.reason}`
            );
          });
        }

        if (allowedTools.length === 0) {
          if (blockedTools.length === 0) {
            logger.debug('🔄 [Protocol Loop] No executable tools after authorization, exiting loop');
            break;
          }
          const blockedResults = blockedTools.map(({ tool, decision }) => ({
            tool: tool.name,
            error: this.buildAuthorizationError(decision)
          }));
          const blockedText = this.formatToolResultEntries(blockedResults).join('\n\n');
          currentMessages.push({ role: 'user', content: blockedText });
          recursionDepth++;
          continue;
        }

        allowedTools.forEach(({ tool, decision }) => {
          logger.debug(
            `   ✔ [Protocol Loop] ${tool.name} ${tool.archery ? '(archery)' : ''} [origin=${decision.originType}${
              decision.originNodeId ? `:${decision.originNodeId}` : ''
            }]`
          );
        });
        
        const syncTools = allowedTools.filter(({ tool }) => !tool.archery);
        const asyncTools = allowedTools.filter(({ tool }) => tool.archery);
        
        if (asyncTools.length > 0) {
          logger.debug(`🏹 [Protocol Loop] Executing ${asyncTools.length} archery tools (fire-and-forget)`);
          asyncTools.forEach((call) => this.executeAllowedArcheryTool(call, route));
        }

        const blockedResults = blockedTools.map(({ tool, decision }) => ({
          tool: tool.name,
          error: this.buildAuthorizationError(decision)
        }));
        
        if (syncTools.length === 0) {
          if (blockedResults.length > 0) {
            const blockedText = this.formatToolResultEntries(blockedResults).join('\n\n');
            currentMessages.push({ role: 'user', content: blockedText });
            recursionDepth++;
            continue;
          }
          logger.debug('🔄 [Protocol Loop] Only archery tools found, exiting loop');
          break;
        }
        
        logger.debug(`🔧 [Protocol Loop] Executing ${syncTools.length} sync tools in parallel...`);
        
        const executedResults = await Promise.all(
          syncTools.map(async (call) => this.executeAllowedTool(call, route))
        );
        const allResults = [...executedResults, ...blockedResults];

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
      
      // 🆕 记录用户情感（在正常完成时）
      this.recordEmotionIfDetected(detectedEmotion, messages, personaInfo, route);
      
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
  
  private evaluateToolAuthorization(
    toolRequests: ToolRequest[],
    route?: RouteResolution
  ): {
    allowed: AuthorizedToolCall[];
    blocked: Array<{ tool: ToolRequest; decision: ToolAuthorizationDecision }>;
  } {
    if (!this.toolAuthorization || toolRequests.length === 0 || !route) {
      return {
        allowed: toolRequests.map((tool) => ({
          tool,
          decision: {
            toolName: tool.name,
            status: 'allow',
            originType: 'hub'
          }
        })),
        blocked: []
      };
    }

    const allowed: AuthorizedToolCall[] = [];
    const blocked: Array<{ tool: ToolRequest; decision: ToolAuthorizationDecision }> = [];

    for (const tool of toolRequests) {
      const decision = this.toolAuthorization.authorize(tool, route!);
      const resolved = this.resolveApprovalForDecision(tool, decision, route);
      if (resolved.allowed) {
        allowed.push(resolved.allowed);
      } else if (resolved.blocked) {
        blocked.push(resolved.blocked);
      }
    }

    return { allowed, blocked };
  }

  private buildAuthorizationError(decision: ToolAuthorizationDecision): string {
    if (decision.reason) {
      return decision.reason;
    }
    if (decision.status === 'requires_approval') {
      return '工具调用需要用户确认';
    }
    if (decision.status === 'deny') {
      return '当前人格无权调用该工具';
    }
    return '工具当前不可用';
  }

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
      const { RuntimeConfigService } = await import('./RuntimeConfigService');
      const runtimeConfig = RuntimeConfigService.getInstance();
      llmClient = await runtimeConfig.getLLMClient();
      if (!llmClient) {
        throw new Error('LLMClient not available. Please configure LLM providers in admin panel.');
      }
      this.llmClient = llmClient;
    }
    return llmClient;
  }

  private resolveApprovalForDecision(
    tool: ToolRequest,
    decision: ToolAuthorizationDecision,
    route?: RouteResolution
  ): {
    allowed?: AuthorizedToolCall;
    blocked?: { tool: ToolRequest; decision: ToolAuthorizationDecision };
  } {
    if (decision.status === 'allow') {
      return { allowed: { tool, decision } };
    }

    if (!route || !route.context) {
      return { blocked: { tool, decision } };
    }

    if (decision.status === 'deny') {
      return { blocked: { tool, decision } };
    }

    const conversationId = route.conversationId;
    const approvalMatch = this.findMatchingApproval(route, tool, decision);
    const approvalResponse = route.approvalResponse;

    if (approvalMatch && approvalMatch.status === 'approved') {
      conversationContextStore.consumeToolApproval(conversationId, approvalMatch.id);
      return {
        allowed: {
          tool,
          decision: {
            ...decision,
            status: 'allow',
            metadata: {
              ...(decision.metadata ?? {}),
              approvalRequestId: approvalMatch.id,
              approvalStatus: approvalMatch.status
            }
          }
        }
      };
    }

    if (approvalMatch && approvalMatch.status === 'consumed') {
      return {
        allowed: {
          tool,
          decision: {
            ...decision,
            status: 'allow',
            metadata: {
              ...(decision.metadata ?? {}),
              approvalRequestId: approvalMatch.id,
              approvalStatus: approvalMatch.status
            }
          }
        }
      };
    }

    if (approvalMatch && approvalMatch.status === 'denied') {
      return {
        blocked: {
          tool,
          decision: {
            ...decision,
            status: 'requires_approval',
            reason: approvalMatch.decisionReason || '工具审批已被拒绝',
            metadata: {
              ...(decision.metadata ?? {}),
              approvalRequestId: approvalMatch.id,
              approvalStatus: approvalMatch.status
            }
          }
        }
      };
    }

    const pendingRequest =
      approvalMatch && approvalMatch.status === 'pending'
        ? approvalMatch
        : this.ensureToolApprovalRequest(route, tool, decision);

    const reason =
      approvalMatch && approvalMatch.status === 'pending'
        ? `工具调用等待审批 (请求ID ${approvalMatch.id})`
        : `工具调用需要用户确认 (请求ID ${pendingRequest.id})`;

    if (approvalResponse && approvalResponse.requestId === pendingRequest.id) {
      const refreshed = this.findMatchingApproval(route, tool, decision);
      if (refreshed && refreshed.status === 'approved') {
        conversationContextStore.consumeToolApproval(conversationId, refreshed.id);
        this.eventBus.publish('tool_approval_completed', {
          conversationId,
          request: refreshed
        });
        return {
          allowed: {
            tool,
            decision: {
              ...decision,
              status: 'allow',
              metadata: {
                ...(decision.metadata ?? {}),
                approvalRequestId: refreshed.id,
                approvalStatus: refreshed.status
              }
            }
          }
        };
      }
      if (refreshed && refreshed.status === 'denied') {
        this.eventBus.publish('tool_approval_completed', {
          conversationId,
          request: refreshed
        });
        return {
          blocked: {
            tool,
            decision: {
              ...decision,
              status: 'requires_approval',
              reason: refreshed.decisionReason || '工具审批已被拒绝',
              metadata: {
                ...(decision.metadata ?? {}),
                approvalRequestId: refreshed.id,
                approvalStatus: refreshed.status
              }
            }
          }
        };
      }
    }

    return {
      blocked: {
        tool,
        decision: {
          ...decision,
          status: 'requires_approval',
          reason,
          metadata: {
            ...(decision.metadata ?? {}),
            approvalRequestId: pendingRequest.id,
            approvalStatus: pendingRequest.status
          }
        }
      }
    };
  }

  private findMatchingApproval(
    route: RouteResolution,
    tool: ToolRequest,
    decision: ToolAuthorizationDecision
  ): ToolApprovalRequest | undefined {
    const context = route.context;
    if (!context.toolApprovals) {
      return undefined;
    }
    const personaId = route.primaryTarget?.personaId;
    const memberId = route.primaryTarget?.memberId;
    return context.toolApprovals
      .slice()
      .reverse()
      .find(
        (item) =>
          item.toolName === tool.name &&
          item.originType === decision.originType &&
          item.originNodeId === decision.originNodeId &&
          item.requesterPersonaId === personaId &&
          (item.requesterMemberId ? item.requesterMemberId === memberId : true) &&
          item.status !== 'consumed'
      );
  }

  private ensureToolApprovalRequest(
    route: RouteResolution,
    tool: ToolRequest,
    decision: ToolAuthorizationDecision
  ): ToolApprovalRequest {
    const existing = this.findMatchingApproval(route, tool, decision);
    if (existing && existing.status === 'pending') {
      return existing;
    }

    const request: ToolApprovalRequest = {
      id: randomUUID(),
      toolName: tool.name,
      args: tool.args ?? {},
      requesterPersonaId: route.primaryTarget?.personaId ?? 'unknown',
      requesterMemberId: route.primaryTarget?.memberId,
      originType: decision.originType,
      originNodeId: decision.originNodeId,
      originNodeName: decision.originNodeName,
      status: 'pending',
      requestedAt: Date.now(),
      metadata: {
        ...(decision.metadata ?? {}),
        pendingMessage: `等待用户确认是否允许调用 ${tool.name}`
      }
    };

    conversationContextStore.addToolApprovalRequest(route.conversationId, request);
    this.eventBus.publish('tool_approval_requested', {
      conversationId: route.conversationId,
      request
    });

    return request;
  }

  private resolvePersonaMemoryInfo(route?: RouteResolution, options?: ChatOptions): PersonaMemoryInfo {
    const personaId = route?.primaryTarget?.personaId ?? options?.agentId ?? 'default';
    const existingState =
      personaId && route?.context?.personaState ? route.context.personaState[personaId] : undefined;
    const normalizedOptionUser =
      typeof options?.userId === 'string' && options.userId.trim().length > 0
        ? options.userId.trim()
        : typeof (options as any)?.user === 'string' && (options as any).user.trim().length > 0
        ? (options as any).user.trim()
        : undefined;
    const userId =
      normalizedOptionUser ??
      (typeof existingState?.userId === 'string' ? (existingState.userId as string) : undefined) ??
      'default';
    const memoryUserId =
      (typeof existingState?.memoryUserId === 'string'
        ? (existingState.memoryUserId as string)
        : undefined) ?? `${userId}::${personaId}`;
    const knowledgeBase =
      (typeof existingState?.knowledgeBase === 'string'
        ? (existingState.knowledgeBase as string)
        : undefined) ?? `${userId}-persona-${personaId}`;
    const conversationId = route?.conversationId;

    if (route && personaId) {
      conversationContextStore.setPersonaState(route.conversationId, personaId, {
        userId,
        memoryUserId,
        knowledgeBase,
        lastUpdatedAt: Date.now()
      });
    }

    return { personaId, userId, conversationId, memoryUserId, knowledgeBase };
  }

  private async executeAllowedTool(
    call: AuthorizedToolCall,
    route?: RouteResolution
  ): Promise<{ tool: string; result?: any; error?: string }> {
    const { tool, decision } = call;
    try {
      if (decision.originType === 'worker' || decision.originType === 'companion') {
        if (!this.nodeManager) {
          logger.error(`❌ 无法执行工具 ${tool.name}：NodeManager 未设置`);
          return {
            tool: tool.name,
            error: 'NodeManager 未初始化，无法派发工具任务'
          };
        }
        if (!decision.originNodeId) {
          logger.warn(`⚠️ 工具 ${tool.name} 缺少 originNodeId，无法派发`);
          return {
            tool: tool.name,
            error: '工具未绑定可用节点'
          };
        }
        const capability = decision.originType === 'companion' ? 'companion' : 'worker';
        const metadata: Record<string, any> = {
          conversationId: route?.conversationId,
          personaId: route?.primaryTarget.personaId,
          memberId: route?.primaryTarget.memberId,
          originType: decision.originType,
          origin: 'chat_service'
        };
        if (route?.mentions?.length) {
          metadata.mentions = route.mentions;
        }
        const { result } = this.nodeManager.dispatchTaskToNode(decision.originNodeId, {
          capability,
          toolName: tool.name,
          toolArgs: tool.args ?? {},
          metadata
        });
        const taskResult = await result;
        if (taskResult && typeof taskResult === 'object' && taskResult.success === false) {
          return {
            tool: tool.name,
            error: taskResult.error?.message ?? '节点执行失败',
            result: taskResult
          };
        }
        return {
          tool: tool.name,
          result: taskResult
        };
      }

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
            userId: route?.primaryTarget.memberId || 'default',
            sessionId: route?.conversationId
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
          conversationId: route?.conversationId,
          userId: route?.primaryTarget.memberId,
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

  private executeAllowedArcheryTool(call: AuthorizedToolCall, route?: RouteResolution): void {
    const { tool, decision } = call;
    logger.debug(`🏹 Async tool triggered: ${tool.name} (origin=${decision.originType})`);

    if ((decision.originType === 'worker' || decision.originType === 'companion') && this.nodeManager) {
      if (!decision.originNodeId) {
        logger.warn(`⚠️ Archery 工具 ${tool.name} 缺少 originNodeId，跳过派发`);
        return;
      }
      const capability = decision.originType === 'companion' ? 'companion' : 'worker';
      const metadata: Record<string, any> = {
        conversationId: route?.conversationId,
        personaId: route?.primaryTarget.personaId,
        memberId: route?.primaryTarget.memberId,
        originType: decision.originType,
        origin: 'chat_service',
        archery: true
      };
      if (route?.mentions?.length) {
        metadata.mentions = route.mentions;
      }
      try {
        const { result } = this.nodeManager.dispatchTaskToNode(decision.originNodeId, {
          capability,
          toolName: tool.name,
          toolArgs: tool.args ?? {},
          metadata
        });
        result
          .then((taskResult) => {
            logger.debug(`✅ Archery tool completed via node: ${tool.name}`);
            if (taskResult && typeof taskResult === 'object' && taskResult.success === false) {
              this.eventBus.publish('tool_failed', {
                plugin: tool.name,
                error: taskResult.error?.message ?? '节点执行失败',
                result: taskResult
              });
              return;
            }
            this.eventBus.publish('tool_completed', {
              plugin: tool.name,
              result: taskResult
            });
          })
          .catch((err: any) => {
            logger.error(`❌ Archery tool failed via node: ${tool.name}`, err);
            this.eventBus.publish('tool_failed', {
              plugin: tool.name,
              error: err?.message ?? String(err)
            });
          });
      } catch (error) {
        logger.error(`❌ Archery 工具派发失败: ${tool.name}`, error);
      }
      return;
    }

    // 插件系统已移除：异步工具在 Skills 架构中不支持，记录告警
    logger.warn(`⚠️ Archery tool not supported in skills-only architecture: ${tool.name}`);
  }

  /**
   * 解析消息中的变量
   * 
   * 使用SDK VariableEngine统一处理所有变量占位符：
   * - {{VCPAllTools}} - 所有工具描述（ToolDescriptionProvider）
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

  private recordEmotionIfDetected(
    detectedEmotion: any,
    messages: Message[],
    personaInfo: PersonaMemoryInfo,
    _route?: RouteResolution
  ): void {
    if (detectedEmotion && this.memoryService) {
      const userMessages = messages.filter(msg => msg.role === 'user');
      const lastUserMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1] : null;
      const context = lastUserMessage ? lastUserMessage.content.substring(0, 200) : '';

      const memory: Memory = {
        content: context || `用户情绪：${detectedEmotion.type}`,
        userId: personaInfo.memoryUserId,
        timestamp: Date.now(),
        metadata: {
          source: 'emotion',
          knowledgeBase: personaInfo.knowledgeBase,
          personaId: personaInfo.personaId,
          conversationId: personaInfo.conversationId,
          emotion: {
            type: detectedEmotion.type,
            intensity: detectedEmotion.intensity,
            confidence: detectedEmotion.confidence
          },
          tags: [`emotion:${detectedEmotion.type}`, `persona:${personaInfo.personaId}`]
        }
      };

      this.memoryService.save(memory).catch((error: any) => {
        logger.warn(`⚠️ Failed to record emotion, but continuing: ${error.message}`);
      });
    }
    
    if (detectedEmotion && detectedEmotion.type !== 'neutral' && detectedEmotion.intensity > 0.5) {
      this.eventBus.publish('emotion:negative_detected', {
        userId: personaInfo.userId,
        personaId: personaInfo.personaId,
        conversationId: personaInfo.conversationId,
        emotion: detectedEmotion.type,
        intensity: detectedEmotion.intensity,
        context: messages.filter(msg => msg.role === 'user').pop()?.content || ''
      });
      logger.debug(`📡 Published emotion:negative_detected event for ${personaInfo.userId} (${detectedEmotion.type})`);
    }
  }
 
  private buildNodeConversationMessages(
    route: RouteResolution,
    fallbackMessages: Message[]
  ): NodeConversationMessage[] {
    const history = (route.context?.history ?? [])
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((record) => {
        if (
          record.role !== 'system' &&
          record.role !== 'user' &&
          record.role !== 'assistant'
        ) {
          return null;
        }
        if (typeof record.content !== 'string' || record.content.trim().length === 0) {
          return null;
        }
        const message: NodeConversationMessage = {
          role: record.role,
          content: record.content
        };
        const name = record.metadata?.name;
        if (typeof name === 'string' && name.trim().length > 0) {
          message.name = name;
        }
        return message;
      })
      .filter((msg): msg is NodeConversationMessage => msg !== null);

    if (history.length > 0) {
      return history;
    }

    return fallbackMessages
      .map((msg) => {
        if (
          (msg.role !== 'system' && msg.role !== 'user' && msg.role !== 'assistant') ||
          typeof msg.content !== 'string' ||
          msg.content.trim().length === 0
        ) {
          return null;
        }
        const message: NodeConversationMessage = {
          role: msg.role as 'system' | 'user' | 'assistant',
          content: msg.content
        };
        if (msg.name) {
          message.name = msg.name;
        }
        return message;
      })
      .filter((msg): msg is NodeConversationMessage => msg !== null);
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
   * 🆕 记录记忆并发布事件
   */
  private async recordMemoryAndPublishEvent(
    content: string,
    personaInfo: PersonaMemoryInfo,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      const rawTags = (metadata as any)?.tags;
      const baseTags: string[] = Array.isArray(rawTags)
        ? rawTags.map((tag: unknown) => String(tag))
        : rawTags !== undefined
        ? [String(rawTags)]
        : [];
      const source =
        typeof (metadata as any)?.source === 'string' ? ((metadata as any).source as string) : 'chat';

      const memory: Memory = {
        content,
        userId: personaInfo.memoryUserId,
        timestamp: Date.now(),
        metadata: {
          ...(metadata ?? {}),
          knowledgeBase: personaInfo.knowledgeBase,
          personaId: personaInfo.personaId,
          conversationId: personaInfo.conversationId,
          source,
          tags: Array.from(new Set([...baseTags, `persona:${personaInfo.personaId}`]))
        }
      };

      if (this.memoryService) {
        await this.memoryService.save(memory);
      }

      // 发布 memory:new_document 事件，触发文档分析场景
      // 注意：记忆服务会自动记录，这里只需要发布事件
      this.eventBus.publish('memory:new_document', {
        userId: personaInfo.userId,
        personaId: personaInfo.personaId,
        conversationId: personaInfo.conversationId,
        content: content.substring(0, 500), // 只发送前500字符
        metadata: memory.metadata
      });
      logger.debug(`📡 Published memory:new_document event for ${personaInfo.userId}`);
    } catch (error: any) {
      logger.warn(`⚠️ Failed to publish memory:new_document event, but continuing: ${error.message}`);
    }
  }

  private async recallPersonaMemories(
    lastUserMessage: Message | undefined,
    route: RouteResolution | undefined,
    personaInfo: PersonaMemoryInfo
  ): Promise<void> {
    if (!this.memoryService || !route || !lastUserMessage || !lastUserMessage.content?.trim()) {
      return;
    }

    try {
      const query = lastUserMessage.content.substring(0, 500);
      const results = await this.memoryService.recall(query, {
        userId: personaInfo.memoryUserId,
        knowledgeBase: personaInfo.knowledgeBase,
        limit: 5
      });

      const summary = {
        query,
        recalledAt: Date.now(),
        total: results.length,
        samples: results.slice(0, 3).map((memory: Memory) => ({
          id: memory.id,
          content: memory.content.substring(0, 120),
          score: (memory as any)?.metadata?.score ?? (memory as any)?.metadata?.similarity
        }))
      };

      conversationContextStore.setPersonaState(route.conversationId, personaInfo.personaId, {
        lastRecall: summary
      });

      if (results.length > 0) {
        this.eventBus.publish('memory:persona_recall', {
          conversationId: route.conversationId,
          personaId: personaInfo.personaId,
          userId: personaInfo.userId,
          query,
          total: results.length,
          samples: summary.samples
        });
      }
    } catch (error: any) {
      logger.debug(`⚠️ Failed to recall persona memories: ${error.message}`);
    }
  }

  /**
   * 🆕 注入记忆到消息列表
   * 按照Prompt结构规范注入UserProfile、HouseholdProfile和Session Memory
   * 
   * Prompt结构：
   * [SYSTEM]
   * - Persona prompt (已通过PersonalityEngine注入)
   * - UserProfile (可选)
   * - HouseholdProfile (可选)
   * 
   * [MEMORY]
   * - Session Memory (最近N条消息)
   * - Semantic Memory (第二阶段实现)
   * - Episodic Memory (第二阶段实现)
   * 
   * [USER]
   * - 当前用户消息
   */
  private async injectMemoriesIntoMessages(
    messages: Message[],
    personaInfo: PersonaMemoryInfo,
    options?: ChatOptions,
    config?: import('../types/memory').MemoryInjectionConfig
  ): Promise<Message[]> {
    if (!this.memoryService) {
      return messages;
    }

    try {
      const memorySections: string[] = [];

      // 注入偏好（在记忆前），影响提示与工具默认值的呈现
      try {
        if (this.preferenceService) {
          const sessionId = personaInfo.conversationId;
          const view = this.preferenceService.getView({
            userId: personaInfo.memoryUserId,
            sessionId
          });
          const prefs = Object.fromEntries(
            Object.entries(view.merged).map(([k, v]) => [k, v.value])
          ) as Record<string, unknown>;
          const prefLines: string[] = [];
          if (prefs.lang) prefLines.push(`语言: ${String(prefs.lang)}`);
          if (prefs.toolsDisclosure) prefLines.push(`工具披露: ${String(prefs.toolsDisclosure)}`);
          // 可扩展更多偏好键
          if (prefLines.length > 0) {
            memorySections.push(`[偏好]\n${prefLines.join('\n')}`);
          }
        }
      } catch (e) {
        logger.debug(`[ChatService] Preference injection skipped: ${(e as Error).message}`);
      }

      const injectionConfig: import('../types/memory').MemoryInjectionConfig = {
        includeUserProfile: config?.includeUserProfile !== false,
        includeHouseholdProfile: config?.includeHouseholdProfile !== false,
        includeSessionMemory: config?.includeSessionMemory !== false,
        sessionMemoryLimit: config?.sessionMemoryLimit || 50,
        reserveSemanticMemory: config?.reserveSemanticMemory !== false,
        reserveEpisodicMemory: config?.reserveEpisodicMemory !== false
      };

      // 1. 获取UserProfile（如果有userId且启用）
      if (injectionConfig.includeUserProfile && personaInfo.userId && personaInfo.userId !== 'default') {
        try {
          const userProfileMemories = await this.memoryService.recall('user profile', {
            userId: personaInfo.userId,
            knowledgeBase: personaInfo.knowledgeBase,
            limit: 3,
            tags: ['profile', 'user']
          });

          if (userProfileMemories && userProfileMemories.length > 0) {
            const profileContent = userProfileMemories
              .map((mem: Memory) => mem.content)
              .join('\n');
            if (profileContent.trim()) {
              memorySections.push(`[用户资料]\n${profileContent}`);
              logger.debug('[ChatService] Injected UserProfile', {
                userId: personaInfo.userId,
                count: userProfileMemories.length
              });
            }
          }
        } catch (error: any) {
          logger.debug(`⚠️ Failed to retrieve UserProfile: ${error.message}`);
        }
      }

      // 2. 获取HouseholdProfile（如果有householdId且启用，通过userId推断）
      if (injectionConfig.includeHouseholdProfile && personaInfo.userId && personaInfo.userId !== 'default') {
        try {
          // 假设householdId可以从userId中推断（实际可能需要从配置中获取）
          const householdProfileMemories = await this.memoryService.recall('household profile', {
            userId: personaInfo.userId,
            knowledgeBase: personaInfo.knowledgeBase,
            limit: 3,
            tags: ['profile', 'household']
          });

          if (householdProfileMemories && householdProfileMemories.length > 0) {
            const profileContent = householdProfileMemories
              .map((mem: Memory) => mem.content)
              .join('\n');
            if (profileContent.trim()) {
              memorySections.push(`[家庭资料]\n${profileContent}`);
              logger.debug('[ChatService] Injected HouseholdProfile', {
                userId: personaInfo.userId,
                count: householdProfileMemories.length
              });
            }
          }
        } catch (error: any) {
          logger.debug(`⚠️ Failed to retrieve HouseholdProfile: ${error.message}`);
        }
      }

      // 3. 获取Session Memory（最近N条消息，默认50条）
      // 注意：这里我们从messages数组中提取，而不是从MemoryService获取
      // 因为Session Memory是会话级别的，暂时不需要持久化
      let sessionMessages: Message[] = [];
      if (injectionConfig.includeSessionMemory) {
        sessionMessages = this.extractSessionMemory(messages, injectionConfig.sessionMemoryLimit || 50);
        if (sessionMessages.length > 0) {
          const sessionContent = sessionMessages
            .map((msg, _index) => {
              const role = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? '助手' : '系统';
              return `${role}: ${msg.content}`;
            })
            .join('\n');
          memorySections.push(`[会话历史]\n${sessionContent}`);
          logger.debug('[ChatService] Injected Session Memory', {
            count: sessionMessages.length
          });
        }
      }

      // 4. 预留Semantic和Episodic Memory位置（占位符，第二阶段实现）
      // 注意：实际注入逻辑在第二阶段实现，这里只是预留结构
      // 未来可以通过以下接口实现：
      // - semanticMemories = await this.memoryService.searchSemanticMemories(query, options);
      // - episodicMemories = await this.memoryService.searchEpisodicMemories(query, options);
      
      // 预留Semantic Memory位置（第二阶段实现）
      // if (config?.reserveSemanticMemory !== false) {
      //   memorySections.push('[语义记忆]\n（第二阶段实现：将根据查询自动检索相关语义记忆）');
      // }

      // 预留Episodic Memory位置（第二阶段实现）
      // if (config?.reserveEpisodicMemory !== false) {
      //   memorySections.push('[情景记忆]\n（第二阶段实现：将根据查询自动检索相关情景记忆）');
      // }

      // 5. 将记忆注入到system message
      if (memorySections.length > 0) {
        const memoryContent = `[记忆]\n${memorySections.join('\n\n')}`;
        
        // 找到第一个system message或创建新的
        const systemMessages = messages.filter(msg => msg.role === 'system');
        if (systemMessages.length > 0) {
          // 追加到第一个system message
          systemMessages[0].content += `\n\n${memoryContent}`;
        } else {
          // 创建新的system message
          messages.unshift({
            role: 'system',
            content: memoryContent
          });
        }

        logger.debug('[ChatService] Memory injection completed', {
          sections: memorySections.length
        });
      }

      return messages;
    } catch (error: any) {
      logger.error('[ChatService] Failed to inject memories', {
        error: error.message
      });
      return messages; // 失败时返回原始消息
    }
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

  /**
   * 🆕 过滤记忆（基于userId和householdId）
   */
  private filterMemoryByContext(
    memories: Memory[],
    userId?: string,
    householdId?: string
  ): Memory[] {
    return memories.filter((memory: Memory) => {
      // 基于userId过滤
      if (userId && memory.userId && memory.userId !== userId) {
        // 检查是否是household级别的记忆
        if (!householdId || memory.metadata?.ownerType !== 'household') {
          return false;
        }
      }

      // 基于householdId过滤（如果有）
      if (householdId && memory.metadata?.ownerType === 'household') {
        if (memory.metadata?.ownerId !== householdId) {
          return false;
        }
      }

      return true;
    });
  }
}

