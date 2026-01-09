/**
 * ChatServiceFactory - ChatService 工厂类
 * 负责创建和组装 ChatService 及其依赖
 */

import { LLMManager } from "../../core/LLMManager";
import { ProtocolEngine } from "../../core/ProtocolEngine";
import { EventBus } from "../../core/EventBus";
import { ConversationHistoryService } from "../ConversationHistoryService";
import { SystemPromptService } from "../SystemPromptService";
import { SessionManager } from "../SessionManager";
import { RequestTracker } from "../RequestTracker";
import { VariableEngine } from "../../core/variable/VariableEngine";
import { ChatService } from "../ChatService";
import { MessagePreprocessor } from "./MessagePreprocessor";
import { ConversationSaver } from "./ConversationSaver";
import { StrategySelector } from "./StrategySelector";
import { SingleRoundStrategy } from "../../strategies/SingleRoundStrategy";
import { ReActStrategy } from "../../strategies/ReActStrategy";
import { IWebSocketManager } from "../../api/websocket/WebSocketManager";
import { TIMEOUT } from "../../constants";

export interface ChatServiceFactoryOptions {
  configPath?: string;
  requestTimeout?: number;
  variableCacheTtl?: number;
}

export class ChatServiceFactory {
  private options: ChatServiceFactoryOptions;

  constructor(options: ChatServiceFactoryOptions = {}) {
    this.options = {
      configPath: "./config",
      requestTimeout: TIMEOUT.SKILL_CACHE_TTL, // 5分钟
      variableCacheTtl: TIMEOUT.TOOL_EXECUTION, // 30秒
      ...options,
    };
  }

  /**
   * 创建 ChatService 实例
   */
  create(protocolEngine: ProtocolEngine, llmManager: LLMManager, eventBus: EventBus): ChatService {
    // 1. 创建共享服务实例
    const conversationHistoryService = ConversationHistoryService.getInstance();
    const systemPromptService = new SystemPromptService(this.options.configPath);
    const variableEngine = new VariableEngine({ cacheTtlMs: this.options.variableCacheTtl });

    // 2. 创建会话管理器
    const sessionManager = new SessionManager(conversationHistoryService);

    // 3. 创建请求追踪器
    const requestTracker = new RequestTracker(null, this.options.requestTimeout);

    // 4. 创建策略
    const strategies = [
      new ReActStrategy(llmManager, conversationHistoryService),
      new SingleRoundStrategy(llmManager, conversationHistoryService),
    ];

    // 5. 创建子服务
    const messagePreprocessor = new MessagePreprocessor(systemPromptService, variableEngine);
    const conversationSaver = new ConversationSaver(conversationHistoryService, sessionManager);
    const strategySelector = new StrategySelector(strategies);

    // 6. 创建 ChatService
    const chatService = new ChatService(
      protocolEngine,
      llmManager,
      eventBus,
      messagePreprocessor,
      conversationSaver,
      strategySelector,
      sessionManager,
      requestTracker
    );

    return chatService;
  }

  /**
   * 设置 WebSocket 管理器
   */
  attachWebSocketManager(chatService: ChatService, manager: IWebSocketManager): void {
    chatService.setWebSocketManager(manager);
  }
}
