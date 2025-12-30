# ChatService 重构功能设计文档

**文档编号**: FD-005
**版本**: 1.0.0
**创建日期**: 2025-12-30
**关联需求**: R-002
**状态**: 待评审

---

## 1. 概述

### 1.1 背景说明

ChatService 是聊天服务的核心组件，当前文件 `src/services/ChatService.ts` 包含 1190 行代码，承担过多协调职责，构造函数注入 10+ 个依赖，processMessage 方法超过 200 行，职责混乱。

### 1.2 重构目标

1. 将 1190 行代码拆分为 6 个高内聚模块
2. 分离消息处理、会话管理、上下文管理、流式处理、伦理审查
3. **不引入依赖注入容器**，保持现状仅拆分职责
4. 保持公共 API 不变

### 1.3 关键决策

- ChatService **不引入依赖注入容器**
- 仅通过拆分职责降低耦合度

### 1.4 参考标准

- 单个文件不超过 500 行
- 单一职责原则：每个类/模块只有一个变更理由
- 方法不超过 50 行（特殊情况不超过 100 行）
- 单元测试覆盖率不低于 80%

---

## 2. 目标结构

### 2.1 目录结构

```
src/services/chat/
├── ChatService.ts              # 主协调器 (300行)
├── MessageProcessor.ts         # 消息处理 (250行)
├── SessionCoordinator.ts       # 会话协调 (200行)
├── StreamHandler.ts            # 流式处理 (200行)
├── EthicsFilter.ts             # 伦理审查 (150行)
├── ContextManager.ts           # 上下文管理 (200行)
├── types.ts                    # 类型定义 (100行)
└── index.ts                    # 统一导出
```

### 2.2 架构图

```
                         +-----------------+
                         |   ChatService   |
                         |    (主协调器)    |
                         +-----------------+
                                  |
    +-----------------------------+-----------------------------+
    |                             |                             |
    v                             v                             v
+-----------------+     +-----------------+     +-----------------+
| EthicsFilter    |     | SessionCoordinator|     | ContextManager |
|(伦理审查)       |     |   (会话协调)      |     |  (上下文管理)    |
+-----------------+     +-----------------+     +-----------------+
                                  |
                                  v
                         +-----------------+
                         |MessageProcessor |
                         |   (消息处理)    |
                         +-----------------+
                                  |
                                  v
                         +-----------------+
                         | StreamHandler  |
                         |   (流式处理)    |
                         +-----------------+
```

---

## 3. 职责划分

### 3.1 模块职责表

| 模块文件 | 职责描述 | 预估行数 | 依赖 |
|----------|----------|----------|------|
| ChatService.ts | 主协调器，策略选择，依赖注入初始化 | 300 | MessageProcessor, SessionCoordinator, StreamHandler, EthicsFilter, ContextManager, ProtocolEngine, LLMManager, 15+ 依赖 |
| MessageProcessor.ts | 消息预处理、变量注入、系统提示词注入 | 250 | SystemPromptService, VariableEngine, PlaybookInjector |
| SessionCoordinator.ts | 会话管理协调、获取/创建会话 | 200 | SessionManager, ConversationHistoryService |
| StreamHandler.ts | 流式消息处理、WebSocket 支持 | 200 | LLMManager, ProtocolEngine |
| EthicsFilter.ts | 伦理审查逻辑、内容过滤 | 150 | AceEthicsGuard |
| ContextManager.ts | 上下文管理协调、ACE 编排 | 200 | ContextManager, AceService, AceIntegrator, AceStrategyOrchestrator |
| types.ts | 类型定义 | 100 | - |

### 3.2 方法迁移表

| 原始方法 | 新位置 | 迁移类型 |
|----------|--------|----------|
| processMessage() | ChatService.ts | 重构 |
| streamMessage() | ChatService.ts | 重构 |
| getStatus() | ChatService.ts | 保留 |
| ethicsCheck() | EthicsFilter.ts | 迁移 |
| _ethicsCheck() | EthicsFilter.ts | 迁移 |
| getOrCreateSession() | SessionCoordinator.ts | 迁移 |
| saveConversationHistory() | SessionCoordinator.ts | 迁移 |
| prepareMessages() | MessageProcessor.ts | 迁移 |
| injectSystemPrompt() | MessageProcessor.ts | 迁移 |
| injectPlaybookGuidance() | MessageProcessor.ts | 迁移 |
| resolveVariables() | MessageProcessor.ts | 迁移 |
| manageContext() | ContextManager.ts | 迁移 |
| runACE() | ContextManager.ts | 迁移 |
| executeACE() | ContextManager.ts | 迁移 |
| sendWebSocketChunk() | StreamHandler.ts | 迁移 |
| handleWebSocketInterrupt() | StreamHandler.ts | 迁移 |

---

## 4. 详细类型设计

### 4.1 核心类型定义 (types.ts)

```typescript
// ==================== 消息类型 ====================

/**
 * 聊天消息
 */
export interface Message {
  /** 角色 */
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** 内容 */
  content: string;
  /** 工具调用 */
  tool_calls?: ToolCall[];
  /** 元数据 */
  metadata?: MessageMetadata;
}

/**
 * 消息元数据
 */
export interface MessageMetadata {
  /** 消息 ID */
  messageId?: string;
  /** 时间戳 */
  timestamp?: Date;
  /** 会话 ID */
  sessionId?: string;
  /** 令牌数 */
  tokenCount?: number;
}

/**
 * 工具调用
 */
export interface ToolCall {
  /** 调用 ID */
  id: string;
  /** 函数名称 */
  function: {
    name: string;
    arguments: string;
  };
  /** 类型 */
  type?: string;
}

// ==================== 聊天选项 ====================

/**
 * 聊天选项
 */
export interface ChatOptions {
  /** 会话 ID */
  sessionId?: string;
  /** 流式输出 */
  stream?: boolean;
  /** 策略选项 */
  strategyOptions?: StrategyOptions;
  /** Playbook 配置 */
  playbookConfig?: PlaybookConfig;
  /** 上下文配置 */
  contextConfig?: ContextConfig;
  /** WebSocket 回调 */
  websocketCallbacks?: WebSocketCallbacks;
}

/**
 * 策略选项
 */
export interface StrategyOptions {
  /** 自思考启用 */
  selfThinking?: {
    enabled: boolean;
    maxIterations?: number;
  };
  /** 快速响应 */
  fastResponse?: boolean;
  /** 最大令牌数 */
  maxTokens?: number;
  /** 温度参数 */
  temperature?: number;
}

/**
 * Playbook 配置
 */
export interface PlaybookConfig {
  /** 启用 Playbook */
  enabled?: boolean;
  /** 最大匹配数 */
  maxMatches?: number;
  /** 注入策略 */
  injectionStrategy?: 'prepend' | 'append' | 'system';
}

/**
 * 上下文配置
 */
export interface ContextConfig {
  /** 最大轮次 */
  maxRounds?: number;
  /** 压缩启用 */
  compressionEnabled?: boolean;
  /** 系统提示词覆盖 */
  systemPromptOverride?: string;
}

/**
 * WebSocket 回调
 */
export interface WebSocketCallbacks {
  /** 发送数据 */
  send: (data: string) => void;
  /** 中断处理 */
  onInterrupt?: () => void;
  /** 错误处理 */
  onError?: (error: Error) => void;
}

// ==================== 聊天结果 ====================

/**
 * 聊天结果
 */
export interface ChatResult {
  /** 消息内容 */
  message: Message;
  /** 完成原因 */
  finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
  /** 使用统计 */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** 元数据 */
  metadata?: ChatResultMetadata;
}

/**
 * 聊天结果元数据
 */
export interface ChatResultMetadata {
  /** 会话 ID */
  sessionId: string;
  /** 响应时间（毫秒） */
  responseTime: number;
  /** 使用的策略 */
  strategyUsed: string;
  /** 匹配的 Playbook 数量 */
  playbookMatches?: number;
}

/**
 * 流式聊天迭代器
 */
export interface StreamingChatIterator {
  [Symbol.asyncIterator](): AsyncIterator<string | ChatResult>;
}

// ==================== 伦理审查 ====================

/**
 * 伦理审查结果
 */
export interface EthicsReviewResult {
  /** 是否通过 */
  approved: boolean;
  /** 拒绝原因 */
  rejectionReason?: string;
  /** 过滤后的内容 */
  filteredContent?: string;
  /** 警告信息 */
  warnings?: string[];
}

// ==================== 会话类型 ====================

/**
 * 会话信息
 */
export interface SessionInfo {
  /** 会话 ID */
  id: string;
  /** 用户 ID */
  userId?: string;
  /** 创建时间 */
  createdAt: Date;
  /** 最后活动 */
  lastActivity: Date;
  /** 消息数量 */
  messageCount: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 会话创建选项
 */
export interface SessionCreateOptions {
  /** 用户 ID */
  userId?: string;
  /** 初始消息 */
  initialMessage?: string;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

// ==================== 上下文类型 ====================

/**
 * 上下文信息
 */
export interface ContextInfo {
  /** 会话 ID */
  sessionId: string;
  /** 消息历史 */
  messageHistory: Message[];
  /** 系统提示词 */
  systemPrompt: string;
  /** 变量映射 */
  variables: Record<string, unknown>;
  /** 扩展数据 */
  extensions?: Record<string, unknown>;
}

/**
 * 上下文更新
 */
export interface ContextUpdate {
  /** 添加的消息 */
  addedMessages?: Message[];
  /** 移除的消息 */
  removedIndices?: number[];
  /** 系统提示词更新 */
  systemPromptUpdate?: string;
  /** 变量更新 */
  variableUpdates?: Record<string, unknown>;
}

// ==================== 服务状态 ====================

/**
 * 服务状态
 */
export interface ServiceStatus {
  /** 已就绪 */
  ready: boolean;
  /** 健康状态 */
  healthy: boolean;
  /** 活跃会话数 */
  activeSessions: number;
  /** 最后健康检查 */
  lastHealthCheck?: Date;
}

/**
 * 组件状态
 */
export interface ComponentStatus {
  /** 组件名称 */
  name: string;
  /** 是否健康 */
  healthy: boolean;
  /** 详细信息 */
  details?: Record<string, unknown>;
}
```

---

## 5. 接口定义

### 5.1 ChatService 接口

```typescript
/**
 * ChatService 主接口
 */
export interface IChatService {
  /**
   * 处理消息
   * @param messages 消息数组
   * @param options 选项
   * @returns 聊天结果
   */
  processMessage(
    messages: Message[],
    options?: ChatOptions
  ): Promise<ChatResult>;

  /**
   * 流式处理消息
   * @param messages 消息数组
   * @param options 选项
   * @returns 流式迭代器
   */
  streamMessage(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterableIterator<string>;

  /**
   * 获取服务状态
   * @returns 服务状态
   */
  getStatus(): ServiceStatus;
}
```

### 5.2 EthicsFilter 接口

```typescript
/**
 * 伦理过滤器接口
 */
export interface IEthicsFilter {
  /**
   * 审查消息
   * @param messages 消息数组
   * @returns 审查结果
   */
  review(messages: Message[]): Promise<EthicsReviewResult>;

  /**
   * 审查单条消息
   * @param content 消息内容
   * @returns 审查结果
   */
  reviewContent(content: string): Promise<EthicsReviewResult>;

  /**
   * 过滤消息内容
   * @param message 消息
   * @returns 过滤后的消息
   */
  filterMessage(message: Message): Promise<Message>;
}
```

### 5.3 SessionCoordinator 接口

```typescript
/**
 * 会话协调器接口
 */
export interface ISessionCoordinator {
  /**
   * 获取或创建会话
   * @param options 会话选项
   * @returns 会话信息
   */
  getOrCreate(options?: ChatOptions): Promise<SessionInfo>;

  /**
   * 保存对话历史
   * @param sessionId 会话 ID
   * @param messages 消息数组
   */
  saveConversationHistory(
    sessionId: string,
    messages: Message[]
  ): Promise<void>;

  /**
   * 获取对话历史
   * @param sessionId 会话 ID
   * @param limit 限制数量
   * @returns 消息数组
   */
  getConversationHistory(
    sessionId: string,
    limit?: number
  ): Promise<Message[]>;

  /**
   * 结束会话
   * @param sessionId 会话 ID
   */
  endSession(sessionId: string): Promise<void>;
}
```

### 5.4 MessageProcessor 接口

```typescript
/**
 * 消息处理器接口
 */
export interface IMessageProcessor {
  /**
   * 预处理消息
   * @param messages 原始消息
   * @param options 选项
   * @param strategyVars 策略变量
   * @param playbookVars Playbook 变量
   * @returns 处理后的消息
   */
  prepare(
    messages: Message[],
    options: ChatOptions,
    strategyVars?: Record<string, unknown>,
    playbookVars?: Record<string, unknown>
  ): Promise<Message[]>;

  /**
   * 注入系统提示词
   * @param messages 消息
   * @param options 选项
   * @returns 处理后的消息
   */
  injectSystemPrompt(
    messages: Message[],
    options: ChatOptions
  ): Promise<Message[]>;

  /**
   * 注入 Playbook 指导
   * @param messages 消息
   * @param playbookMatches Playbook 匹配
   * @returns 处理后的消息
   */
  injectPlaybookGuidance(
    messages: Message[],
    playbookMatches: unknown[]
  ): Promise<Message[]>;

  /**
   * 解析变量
   * @param content 内容
   * @param variables 变量映射
   * @returns 解析后的内容
   */
  resolveVariables(
    content: string,
    variables: Record<string, unknown>
  ): Promise<string>;
}
```

### 5.5 ContextManager 接口

```typescript
/**
 * 上下文管理器接口
 */
export interface IContextManager {
  /**
   * 管理上下文
   * @param session 会话信息
   * @param messages 消息数组
   * @returns 上下文信息
   */
  manage(
    session: SessionInfo,
    messages: Message[]
  ): Promise<ContextInfo>;

  /**
   * 运行 ACE
   * @param context 上下文
   * @param options 选项
   * @returns ACE 结果
   */
  runACE(
    context: ContextInfo,
    options: ChatOptions
  ): Promise<unknown>;

  /**
   * 更新上下文
   * @param current 当前上下文
   * @param update 更新内容
   * @returns 更新后的上下文
   */
  updateContext(
    current: ContextInfo,
    update: ContextUpdate
  ): Promise<ContextInfo>;
}
```

### 5.6 StreamHandler 接口

```typescript
/**
 * 流式处理器接口
 */
export interface IStreamHandler {
  /**
   * 处理流式响应
   * @param messages 消息
   * @param options 选项
   * @returns 流式迭代器
   */
  handle(
    messages: Message[],
    options: ChatOptions
  ): AsyncIterableIterator<string>;

  /**
   * 发送 WebSocket 数据块
   * @param data 数据
   * @param callbacks 回调
   */
  sendChunk(
    data: string,
    callbacks: WebSocketCallbacks
  ): void;

  /**
   * 处理中断
   * @param callbacks 回调
   */
  handleInterrupt(callbacks: WebSocketCallbacks): void;
}
```

---

## 6. 依赖关系

### 6.1 外部依赖

```typescript
// ChatService.ts
import { ProtocolEngine } from '../core/ProtocolEngine';
import { LLMManager } from '../core/LLMManager';
import { EventBus } from '../core/EventBus';
import { SessionManager } from './SessionManager';
import { ConversationHistoryService } from './ConversationHistoryService';
import { AceService } from './AceService';
import { AceIntegrator } from './AceIntegrator';
import { AceEthicsGuard } from './AceEthicsGuard';
import { AceStrategyOrchestrator } from './AceStrategyOrchestrator';
import { PlaybookMatcher } from './playbook/PlaybookMatcher';
import { ToolRetrievalService } from './ToolRetrievalService';
import { SystemPromptService } from './SystemPromptService';
import { VariableEngine } from '../core/variable/VariableEngine';
import { EnhancedSessionManager } from './EnhancedSessionManager';
```

### 6.2 内部依赖图

```
ChatService
    |
    +---> EthicsFilter
    |         |
    |         +---> AceEthicsGuard
    |
    +---> SessionCoordinator
    |         |
    |         +---> SessionManager
    |         +---> ConversationHistoryService
    |
    +---> ContextManager
    |         |
    |         +---> ContextManager (内部)
    |         +---> AceService
    |         +---> AceIntegrator
    |         +---> AceStrategyOrchestrator
    |
    +---> MessageProcessor
    |         |
    |         +---> SystemPromptService
    |         +---> VariableEngine
    |         +---> PlaybookInjector
    |
    +---> StreamHandler
              |
              +---> LLMManager
              +---> ProtocolEngine
```

### 6.3 依赖组织设计

```typescript
/**
 * ChatService - 不使用依赖注入容器
 */
export class ChatService implements IChatService {
  // 子模块
  private readonly ethicsFilter: EthicsFilter;
  private readonly sessionCoordinator: SessionCoordinator;
  private readonly contextManager: ContextManager;
  private readonly messageProcessor: MessageProcessor;
  private readonly streamHandler: StreamHandler;

  // 核心依赖（直接使用）
  private readonly protocolEngine: ProtocolEngine;
  private readonly llmManager: LLMManager;
  private readonly eventBus: EventBus;

  constructor(
    // 核心依赖
    protocolEngine: ProtocolEngine,
    llmManager: LLMManager,
    eventBus: EventBus,
    // Playbook 相关
    playbookMatcher: PlaybookMatcher,
    // ACE 相关
    aceService: AceService,
    aceIntegrator: AceIntegrator,
    aceEthicsGuard: AceEthicsGuard,
    aceStrategyOrchestrator: AceStrategyOrchestrator,
    // 工具检索
    toolRetrievalService: ToolRetrievalService,
    // 会话管理
    sessionManager: SessionManager,
    conversationHistoryService: ConversationHistoryService,
    enhancedSessionManager: EnhancedSessionManager,
    // 提示词和变量
    systemPromptService: SystemPromptService,
    variableEngine: VariableEngine,
    // 上下文管理
    contextManager: ContextManager,
    // 可选依赖
    skillManager?: SkillManager
  ) {
    // 初始化子模块（手动依赖注入）
    this.ethicsFilter = new EthicsFilter(aceEthicsGuard);
    this.sessionCoordinator = new SessionCoordinator(
      sessionManager,
      conversationHistoryService
    );
    this.contextManager = new ContextManager(
      contextManager,
      aceService,
      aceIntegrator,
      aceStrategyOrchestrator
    );
    this.messageProcessor = new MessageProcessor(
      systemPromptService,
      variableEngine
    );
    this.streamHandler = new StreamHandler(llmManager, protocolEngine);

    // 核心依赖
    this.protocolEngine = protocolEngine;
    this.llmManager = llmManager;
    this.eventBus = eventBus;
  }

  async processMessage(
    messages: Message[],
    options?: ChatOptions
  ): Promise<ChatResult> {
    const startTime = Date.now();

    // 1. 伦理审查
    const ethicsResult = await this.ethicsFilter.review(messages);
    if (!ethicsResult.approved) {
      return this.createRejectionResult(ethicsResult, startTime);
    }

    // 2. 会话协调
    const session = await this.sessionCoordinator.getOrCreate(options);

    // 3. 上下文管理
    const context = await this.contextManager.manage(session, messages);

    // 4. 消息预处理
    const processedMessages = await this.messageProcessor.prepare(
      messages,
      options,
      {},
      {}
    );

    // 5. 策略选择和执行
    const result = await this.executeStrategy(processedMessages, options);

    // 6. 保存对话历史
    await this.sessionCoordinator.saveConversationHistory(
      session.id,
      processedMessages
    );

    return this.enhanceResult(result, session, startTime);
  }

  async *streamMessage(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterableIterator<string> {
    const callbacks = options?.websocketCallbacks;
    if (!callbacks) {
      throw new Error('WebSocket callbacks required for streaming');
    }

    try {
      // 伦理审查
      const ethicsResult = await this.ethicsFilter.review(messages);
      if (!ethicsResult.approved) {
        yield `Error: ${ethicsResult.rejectionReason}`;
        return;
      }

      // 会话协调
      const session = await this.sessionCoordinator.getOrCreate(options);

      // 消息预处理
      const processedMessages = await this.messageProcessor.prepare(
        messages,
        options,
        {},
        {}
      );

      // 流式处理
      for await (const chunk of this.streamHandler.handle(
        processedMessages,
        options
      )) {
        this.streamHandler.sendChunk(chunk, callbacks);
        yield chunk;
      }
    } catch (error) {
      if (callbacks.onError) {
        callbacks.onError(error as Error);
      }
      throw error;
    }
  }

  getStatus(): ServiceStatus {
    return {
      ready: true,
      healthy: true,
      activeSessions: 0,
      lastHealthCheck: new Date(),
    };
  }

  // 私有辅助方法
  private createRejectionResult(
    ethicsResult: EthicsReviewResult,
    startTime: number
  ): ChatResult {
    return {
      message: {
        role: 'assistant',
        content: ethicsResult.rejectionReason || 'Content rejected',
      },
      finishReason: 'error',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      metadata: {
        sessionId: '',
        responseTime: Date.now() - startTime,
        strategyUsed: 'ethics-filter',
      },
    };
  }

  private async executeStrategy(
    messages: Message[],
    options?: ChatOptions
  ): Promise<ChatResult> {
    // 策略选择和执行逻辑
    return {} as ChatResult;
  }

  private enhanceResult(
    result: ChatResult,
    session: SessionInfo,
    startTime: number
  ): ChatResult {
    return {
      ...result,
      metadata: {
        ...result.metadata,
        sessionId: session.id,
        responseTime: Date.now() - startTime,
      },
    };
  }
}
```

---

## 7. 迁移步骤

### 7.1 阶段一：创建类型定义

| 步骤 | 操作 | 预计工时 | 验证标准 |
|------|------|----------|----------|
| 1.1 | 创建 `types.ts` 文件 | 1h | 文件创建成功 |
| 1.2 | 迁移所有类型定义 | 2h | 编译通过 |
| 1.3 | 添加类型别名兼容层 | 1h | 旧类型引用正常 |

### 7.2 阶段二：创建子模块

| 步骤 | 操作 | 预计工时 | 验证标准 |
|------|------|----------|----------|
| 2.1 | 创建 `EthicsFilter.ts` 并迁移伦理审查方法 | 4h | 伦理审查功能测试 |
| 2.2 | 创建 `SessionCoordinator.ts` 并迁移会话方法 | 6h | 会话协调功能测试 |
| 2.3 | 创建 `MessageProcessor.ts` 并迁移消息处理方法 | 8h | 消息预处理功能测试 |
| 2.4 | 创建 `ContextManager.ts` 并迁移上下文方法 | 6h | 上下文管理功能测试 |
| 2.5 | 创建 `StreamHandler.ts` 并迁移流式处理方法 | 6h | 流式处理功能测试 |

### 7.3 阶段三：重构主服务

| 步骤 | 操作 | 预计工时 | 验证标准 |
|------|------|----------|----------|
| 3.1 | 重构 `ChatService.ts` 主服务 | 6h | 不超过 300 行 |
| 3.2 | 创建 `index.ts` 统一导出 | 1h | 导出正确 |

### 7.4 阶段四：验证与测试

| 步骤 | 操作 | 预计工时 | 验证标准 |
|------|------|----------|----------|
| 4.1 | 运行现有测试 | 2h | 测试通过 |
| 4.2 | 补充单元测试 | 6h | 覆盖率 80%+ |
| 4.3 | 集成测试验证 | 4h | 功能正常 |

### 7.5 总工时

| 阶段 | 预计工时 |
|------|----------|
| 阶段一：类型定义 | 4h |
| 阶段二：子模块 | 30h |
| 阶段三：主服务 | 7h |
| 阶段四：验证测试 | 12h |
| **合计** | **53h (约 3 周)** |

---

## 8. 验收标准

### 8.1 代码质量标准

- [ ] ChatService 不超过 300 行
- [ ] EthicsFilter 不超过 150 行
- [ ] SessionCoordinator 不超过 200 行
- [ ] MessageProcessor 不超过 250 行
- [ ] ContextManager 不超过 200 行
- [ ] StreamHandler 不超过 200 行
- [ ] 消除所有 `any` 类型
- [ ] 重复代码率低于 5%

### 8.2 功能验收标准

- [ ] `processMessage()` API 行为 100% 一致
- [ ] `streamMessage()` API 行为 100% 一致
- [ ] `getStatus()` API 行为 100% 一致
- [ ] 各子模块可独立测试
- [ ] 伦理审查可独立配置
- [ ] 保持 WebSocket 接口兼容

### 8.3 测试标准

- [ ] 单元测试覆盖率不低于 80%
- [ ] 伦理审查有独立测试
- [ ] 会话协调有独立测试
- [ ] 消息处理有独立测试
- [ ] 流式处理有独立测试

### 8.4 兼容性标准

- [ ] 保持公共 API 不变
- [ ] 保持 `Message` 类型兼容
- [ ] 保持 `ChatOptions` 类型兼容
- [ ] 保持 `ChatResult` 类型兼容
- [ ] TypeScript 编译无错误
- [ ] 现有功能 100% 正常

---

## 9. 风险与缓解措施

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 核心聊天逻辑中断 | 极高 | 中 | 建立完整的集成测试，Feature Flag 切换 |
| 改动影响所有聊天请求 | 极高 | 中 | 渐进式迁移，保持 API 兼容 |
| WebSocket 兼容性 | 高 | 低 | 保持流式接口不变 |
| 依赖链复杂 | 高 | 低 | 不引入依赖注入容器 |

---

## 10. 附录

### 10.1 术语表

| 术语 | 定义 |
|------|------|
| Ethics Filter | 伦理过滤器，负责内容审查 |
| Session Coordinator | 会话协调器，管理会话生命周期 |
| Message Processor | 消息处理器，预处理和注入逻辑 |
| Stream Handler | 流式处理器，处理实时输出 |
| Context Manager | 上下文管理器，管理对话上下文 |

### 10.2 变更记录

| 版本 | 日期 | 作者 | 描述 |
|------|------|------|------|
| 1.0.0 | 2025-12-30 | - | 初始版本 |

---

**文档版本**: 1.0.0
**最后更新**: 2025-12-30
**状态**: 评审通过
