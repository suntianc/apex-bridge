/**
 * ChatService - 聊天服务主协调器
 *
 * 负责协调各子模块，提供统一的聊天处理接口
 */

import type { ProtocolEngine } from '../../core/ProtocolEngine';
import type { LLMManager } from '../../core/LLMManager';
import type { EventBus } from '../../core/EventBus';
import type { Message, ChatOptions, ChatResult, ServiceStatus } from './types';
import { EthicsFilter, IEthicsFilter } from './EthicsFilter';
import { SessionCoordinator, ISessionCoordinator } from './SessionCoordinator';
import { MessageProcessor, IMessageProcessor } from './MessageProcessor';
import { ChatContextManager, IChatContextManager } from './ContextManager';
import { StreamHandler, IStreamHandler } from './StreamHandler';
import type { AceService } from '../AceService';
import type { ConversationHistoryService } from '../ConversationHistoryService';
import type { AceIntegrator } from '../AceIntegrator';
import type { AceEthicsGuard } from '../AceEthicsGuard';
import type { AceStrategyOrchestrator } from '../../strategies/AceStrategyOrchestrator';
import type { PlaybookMatcher } from '../PlaybookMatcher';
import type { ToolRetrievalService } from '../ToolRetrievalService';
import type { SystemPromptService } from '../SystemPromptService';
import type { VariableEngine } from '../../core/variable/VariableEngine';
import type { SessionManager } from '../SessionManager';
import type { ContextManager as CoreContextManager } from '../../context/ContextManager';
import type { ContextStorageService } from '../ContextStorageService';
import type { ChatStrategy } from '../../strategies/ChatStrategy';
import { SingleRoundStrategy } from '../../strategies/SingleRoundStrategy';
import { ReActStrategy } from '../../strategies/ReActStrategy';
import { logger } from '../../utils/logger';
import { extractTextFromMessage } from '../../utils/message-utils';
import { RequestTracker } from '../RequestTracker';

/**
 * ChatService 接口
 */
export interface IChatService {
  processMessage(messages: Message[], options?: ChatOptions): Promise<ChatResult>;
  streamMessage(messages: Message[], options?: ChatOptions): AsyncIterableIterator<string>;
  getStatus(): ServiceStatus;
}

/**
 * ChatService 实现
 */
export class ChatService implements IChatService {
  // 子模块
  private readonly ethicsFilter: IEthicsFilter;
  private readonly sessionCoordinator: ISessionCoordinator;
  private readonly messageProcessor: IMessageProcessor;
  private readonly contextManager: IChatContextManager;
  private readonly streamHandler: IStreamHandler;

  // 核心依赖
  private readonly llmManager: LLMManager;
  private readonly aceService: AceService;
  private readonly aceIntegrator: AceIntegrator;

  // 策略
  private readonly strategies: ChatStrategy[];
  private readonly aceOrchestrator: AceStrategyOrchestrator;

  // 会话管理
  private readonly sessionManager: SessionManager;

  constructor(
    private readonly _protocolEngine: ProtocolEngine,
    llmManager: LLMManager,
    private readonly _eventBus: EventBus,
    aceService: AceService,
    aceIntegrator: AceIntegrator,
    aceEthicsGuard: AceEthicsGuard,
    aceStrategyOrchestrator: AceStrategyOrchestrator,
    sessionManager: SessionManager,
    conversationHistoryService: ConversationHistoryService,
    contextManager: CoreContextManager,
    contextStorageService: ContextStorageService,
    systemPromptService: SystemPromptService,
    variableEngine: VariableEngine,
    playbookMatcher?: PlaybookMatcher,
    playbookInjector?: PlaybookInjector
  ) {
    // 初始化核心依赖
    this.llmManager = llmManager;
    this.aceService = aceService;
    this.aceIntegrator = aceIntegrator;
    this.sessionManager = sessionManager;

    // 初始化子模块
    this.ethicsFilter = new EthicsFilter(aceEthicsGuard, aceIntegrator);
    this.sessionCoordinator = new SessionCoordinator(sessionManager, conversationHistoryService);
    this.messageProcessor = new MessageProcessor(
      systemPromptService,
      variableEngine,
      playbookMatcher,
      playbookInjector
    );
    this.contextManager = new ChatContextManager(contextManager, contextStorageService);

    // 创建流式处理器
    this.streamHandler = new StreamHandler(new RequestTracker(undefined, 300000));

    // 初始化策略
    this.strategies = [
      new ReActStrategy(llmManager, aceIntegrator, conversationHistoryService),
      new SingleRoundStrategy(llmManager, aceIntegrator, conversationHistoryService)
    ];

    // ACE编排器
    this.aceOrchestrator = aceStrategyOrchestrator;

    logger.debug('[ChatService] Initialized');
  }

  /**
   * 处理消息
   */
  async processMessage(messages: Message[], options: ChatOptions = {}): Promise<ChatResult> {
    const requestId = options.requestId || this.generateRequestId();

    logger.info(`[ChatService] Processing message (requestId: ${requestId}, stream: ${options.stream || false})`);

    try {
      // 1. 伦理审查
      const ethicsResult = await this.ethicsFilter.review(messages, options);
      if (!ethicsResult.approved) {
        logger.warn(`[ChatService] L1伦理审查未通过: ${ethicsResult.reason}`);

        await this.ethicsFilter.reportRequestRejected(ethicsResult, requestId);

        return this.ethicsFilter.createRejectionResult(ethicsResult, requestId);
      }

      // 2. 会话协调
      if (options.conversationId) {
        const sessionId = await this.sessionCoordinator.getOrCreate(
          options.agentId,
          options.userId,
          options.conversationId
        );
        if (sessionId) {
          options.sessionId = sessionId;
        }
      }

      // 3. 上下文管理
      let processedMessages = messages;
      if (options.sessionId) {
        try {
          const history = await this.sessionCoordinator.getConversationHistory(
            options.conversationId || options.sessionId,
            1000,
            0
          );

          const contextResult = await this.contextManager.manage(
            options.sessionId,
            history,
            { force: false, createCheckpoint: true }
          );

          if (contextResult.managed) {
            logger.info(`[ChatService] Context managed: ${contextResult.action?.type}`);
            processedMessages = contextResult.effectiveMessages || messages;
          }
        } catch (error) {
          logger.warn(`[ChatService] Context management failed: ${(error as Error).message}`);
        }
      }

      // 4. 检查是否使用ACE编排模式
      if (this.shouldUseACEOrchestration(options)) {
        logger.info('[ChatService] Using ACE orchestration mode');
        const strategyResult = await this.aceOrchestrator.orchestrate(processedMessages, options) as ChatResult;

        if (options.conversationId) {
          await this.sessionCoordinator.saveConversationHistory(
            options.conversationId,
            messages,
            strategyResult.content,
            strategyResult.rawThinkingProcess,
            options.selfThinking?.enabled
          );
        }

        if (options.sessionId && strategyResult.usage) {
          await this.sessionCoordinator.updateMetadata(
            options.sessionId,
            {
              total_tokens: strategyResult.usage.total_tokens || 0,
              prompt_tokens: strategyResult.usage.prompt_tokens || 0,
              completion_tokens: strategyResult.usage.completion_tokens || 0
            }
          );
        }

        return strategyResult;
      }

      // 5. Playbook匹配
      const userQuery = extractTextFromMessage(messages[messages.length - 1]) || '';
      let playbookVariables: Record<string, string> = {};

      if (userQuery.trim() && !options.stream) {
        const playbookResult = await this.messageProcessor.matchPlaybook(userQuery, options);
        if (playbookResult.success && playbookResult.variables) {
          playbookVariables = playbookResult.variables;
          logger.info(`[ChatService] Playbook applied: ${playbookResult.playbookName}`);
        }
      }

      // 6. 策略选择
      const strategy = this.selectStrategy(options);

      // 7. 策略预处理
      let strategyVariables: Record<string, string> = {};
      if (strategy.prepare) {
        const prepareResult = await strategy.prepare(processedMessages, options);
        strategyVariables = prepareResult.variables;
      }

      // 8. 消息预处理
      const finalMessages = await this.messageProcessor.prepare(
        processedMessages,
        options,
        strategyVariables,
        playbookVariables
      );

      // 9. 执行策略
      if (options.stream) {
        const streamResult = await strategy.execute(finalMessages, options);
        return this.wrapStreamResult(streamResult, messages, options);
      } else {
        const result = await strategy.execute(finalMessages, options) as ChatResult;

        if (options.conversationId) {
          await this.sessionCoordinator.saveConversationHistory(
            options.conversationId,
            messages,
            result.content,
            result.rawThinkingProcess,
            options.selfThinking?.enabled
          );
        }

        if (options.sessionId && result.usage) {
          await this.sessionCoordinator.updateMetadata(
            options.sessionId,
            {
              total_tokens: result.usage.total_tokens || 0,
              prompt_tokens: result.usage.prompt_tokens || 0,
              completion_tokens: result.usage.completion_tokens || 0
            }
          );
        }

        return result;
      }
    } catch (error) {
      logger.error('[ChatService] Error processing message:', error);
      throw error;
    }
  }

  /**
   * 流式处理消息
   */
  async *streamMessage(
    messages: Message[],
    options: ChatOptions = {}
  ): AsyncIterableIterator<string> {
    const requestId = options.requestId || this.generateRequestId();
    const abortController = new AbortController();

    logger.info(`[ChatService] Streaming message (requestId: ${requestId})`);

    let fullContent = '';
    const collectedThinking: string[] = [];

    try {
      this.streamHandler.registerRequest(requestId, abortController, { messages, options });

      const ethicsResult = await this.ethicsFilter.review(messages, options);
      if (!ethicsResult.approved) {
        yield `Error: ${ethicsResult.reason}`;
        return;
      }

      if (options.conversationId) {
        const sessionId = await this.sessionCoordinator.getOrCreate(
          options.agentId,
          options.userId,
          options.conversationId
        );
        if (sessionId) {
          options.sessionId = sessionId;
        }
      }

      const strategy = this.selectStrategy(options);

      let strategyVariables: Record<string, string> = {};
      if (strategy.prepare) {
        const prepareResult = await strategy.prepare(messages, options);
        strategyVariables = prepareResult.variables;
      }

      const processedMessages = await this.messageProcessor.prepare(
        messages,
        options,
        strategyVariables
      );

      for await (const chunk of strategy.stream(processedMessages, options, abortController.signal)) {
        if (abortController.signal.aborted) {
          logger.debug(`[ChatService] Stream aborted for ${requestId}`);
          break;
        }

        try {
          const parsed = JSON.parse(chunk);
          if (parsed.reasoning_content) {
            collectedThinking.push(parsed.reasoning_content);
          }
          if (parsed.content) {
            fullContent += parsed.content;
          }
        } catch {
          fullContent += chunk;
        }

        yield chunk;
      }

      const conversationId = options.conversationId;
      if (conversationId && !abortController.signal.aborted) {
        await this.sessionCoordinator.saveConversationHistory(
          conversationId,
          messages,
          fullContent,
          collectedThinking.length > 0 ? collectedThinking : undefined,
          options.selfThinking?.enabled
        );
      }
    } finally {
      this.streamHandler.unregisterRequest(requestId);
    }
  }

  /**
   * 获取服务状态
   */
  getStatus(): ServiceStatus {
    return {
      aceEnabled: this.aceService.isEnabled(),
      activeRequests: this.streamHandler.getActiveRequestCount(),
      sessionCount: this.sessionCoordinator.getSessionCount(),
      llmManagerReady: !!this.llmManager,
      strategies: this.strategies.map(s => s.getName()),
      aceOrchestratorReady: !!this.aceOrchestrator
    };
  }

  /**
   * 获取会话管理器
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * 获取请求追踪器
   */
  getRequestTracker(): RequestTracker {
    return this.streamHandler.getRequestTracker();
  }

  /**
   * 获取变量引擎
   */
  getVariableEngine(): VariableEngine {
    return this._protocolEngine.variableEngine as unknown as VariableEngine;
  }

  /**
   * 获取ACE编排器
   */
  getAceOrchestrator(): AceStrategyOrchestrator {
    return this.aceOrchestrator;
  }

  /**
   * 获取ACE集成器
   */
  getAceIntegrator(): AceIntegrator {
    return this.aceIntegrator;
  }

  /**
   * 获取会话状态
   */
  async getSessionState(conversationId: string): Promise<unknown> {
    const sessionId = this.sessionManager.getSessionId(conversationId);
    if (!sessionId) {
      return null;
    }

    const engine = this.aceService.getEngine();
    if (!engine) {
      return null;
    }

    try {
      return await engine.getSessionState(sessionId);
    } catch (error) {
      logger.error(`[ChatService] Failed to get session state: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 评估任务复杂度
   */
  estimateTaskComplexity(query: string): number {
    let score = 0;

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

    if (query.length > 100) {
      score += 0.2;
    } else if (query.length > 50) {
      score += 0.1;
    }

    const stepKeywords = ['首先', '然后', '接着', '最后', '第一', '第二', '第三'];
    stepKeywords.forEach(keyword => {
      if (query.includes(keyword)) {
        score += 0.1;
      }
    });

    if (/\d+[\.\)]\s|^[-*]\s/m.test(query)) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  /**
   * 选择策略
   */
  private selectStrategy(options: ChatOptions): ChatStrategy {
    for (const strategy of this.strategies) {
      if (strategy.supports(options)) {
        logger.debug(`[ChatService] Selected strategy: ${strategy.getName()}`);
        return strategy;
      }
    }

    const defaultStrategy = this.strategies.find(s => s.getName() === 'SingleRoundStrategy');
    if (!defaultStrategy) {
      throw new Error('No suitable chat strategy found');
    }
    return defaultStrategy;
  }

  /**
   * 判断是否使用ACE编排模式
   */
  private shouldUseACEOrchestration(options: ChatOptions): boolean {
    if (options.stream) {
      return false;
    }

    if (options.aceOrchestration?.enabled) {
      return true;
    }

    if (options.aceOrchestration?.enabled === false) {
      return false;
    }

    return false;
  }

  /**
   * 包装流式结果
   */
  private wrapStreamResult(
    _streamResult: unknown,
    _messages: Message[],
    _options: ChatOptions
  ): ChatResult {
    return {
      content: '',
      iterations: 0
    };
  }

  /**
   * 生成请求ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// 导入 PlaybookInjector 用于构造函数
import type { PlaybookInjector } from '../../core/playbook/PlaybookInjector';
