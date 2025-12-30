# Service 服务层模块设计

> 所属模块：Service
> 文档版本：v1.0.0
> 创建日期：2025-12-29

## 1. 模块概述

Service 层是 ApexBridge 的业务逻辑层，位于 API 层和 Core 引擎层之间，负责协调各核心组件完成具体业务功能。

### 1.1 模块职责

- 聊天业务协调与策略选择
- 会话生命周期管理
- 技能系统管理
- 上下文管理与压缩
- Playbook 匹配
- MCP 集成

### 1.2 目录结构

```
src/services/
├── ChatService.ts              # 聊天服务（主协调器）
├── SessionManager.ts           # 会话管理器
├── RequestTracker.ts           # 请求跟踪器
├── LLMConfigService.ts         # LLM 配置服务
├── ConversationHistoryService.ts # 对话历史服务
├── SkillManager.ts             # 技能管理器
├── ContextManager.ts           # 上下文管理器
├── AceService.ts               # ACE 服务
├── PlaybookMatcher.ts          # Playbook 匹配器
├── MCPIntegrationService.ts    # MCP 集成服务
├── ContextStorageService.ts    # 上下文存储服务
└── DataPurgeService.ts         # 数据清理服务
```

---

## 2. 核心组件

### 2.1 ChatService

**职责**：聊天业务主协调器，策略选择与执行

**核心方法**：
- `processMessage(request: ChatRequest)` - 处理聊天消息
- `selectStrategy(options: ChatOptions)` - 选择聊天策略
- `interruptRequest(sessionId: string)` - 中断请求

### 2.2 SessionManager

**职责**：会话创建、查询、生命周期管理

**核心方法**：
- `createSession(config: SessionConfig)` - 创建会话
- `getSession(sessionId: string)` - 获取会话
- `updateSession(sessionId: string, updates: Partial<Session>)` - 更新会话
- `endSession(sessionId: string)` - 结束会话

### 2.3 RequestTracker

**职责**：活动请求跟踪、中断处理

**核心方法**：
- `trackRequest(request: ActiveRequest)` - 跟踪请求
- `getRequest(requestId: string)` - 获取请求
- `interrupt(requestId: string)` - 中断请求
- `complete(requestId: string)` - 标记完成

### 2.4 LLMConfigService

**职责**：SQLite 基础 LLM 配置管理

**核心方法**：
- `getProviders()` - 获取所有提供商
- `getProvider(id: string)` - 获取指定提供商
- `saveProvider(provider: ProviderConfig)` - 保存提供商
- `deleteProvider(id: string)` - 删除提供商
- `getModels(providerId: string)` - 获取模型列表

### 2.5 SkillManager

**职责**：Skills 生命周期管理

**核心方法**：
- `getInstance()` - 单例获取
- `installSkill(skillPath: string)` - 安装技能
- `uninstallSkill(skillId: string)` - 卸载技能
- `listSkills()` - 列出所有技能
- `getSkill(skillId: string)` - 获取技能详情
- `reindexSkills()` - 重新索引技能

### 2.6 ContextManager

**职责**：上下文修剪、压缩、检查点

**核心方法**：
- `manageContext(messages: Message[])` - 管理上下文
- `compressContext(messages: Message[])` - 压缩上下文
- `pruneContext(messages: Message[], maxTokens: number)` - 修剪上下文
- `createCheckpoint(context: Context)` - 创建检查点
- `restoreCheckpoint(checkpointId: string)` - 恢复检查点

### 2.7 AceService

**职责**：ACE（自主认知引擎）核心服务

**核心方法**：
- `getInstance()` - 单例获取
- `initialize()` - 初始化
- `processThought(thought: Thought)` - 处理思考
- `executeAction(action: Action)` - 执行动作

---

## 3. 类图

```
┌─────────────────────────────────────────────────────────────────┐
│                        ChatService                              │
├─────────────────────────────────────────────────────────────────┤
│ - strategies: ChatStrategy[]                                    │
│ - sessionManager: SessionManager                                │
│ - requestTracker: RequestTracker                                │
│ - contextManager: ContextManager                                │
├─────────────────────────────────────────────────────────────────┤
│ + processMessage(request: ChatRequest)                          │
│ + selectStrategy(options: ChatOptions)                          │
│ + interruptRequest(sessionId: string)                           │
└─────────────────────────────────────────────────────────────────┘
         │                    │
         │                    │
         v                    v
┌──────────────────┐  ┌──────────────────┐
│  SessionManager  │  │  RequestTracker  │
├──────────────────┤  ├──────────────────┤
│ - sessions: Map  │  │ - requests: Map  │
├──────────────────┤  ├──────────────────┤
│ + createSession  │  │ + trackRequest   │
│ + getSession     │  │ + interrupt      │
│ + endSession     │  │ + complete       │
└──────────────────┘  └──────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      ContextManager                             │
├─────────────────────────────────────────────────────────────────┤
│ - maxTokens: number                                             │
│ - compressionThreshold: number                                  │
├─────────────────────────────────────────────────────────────────┤
│ + manageContext(messages)                                       │
│ + compressContext(messages)                                     │
│ + pruneContext(messages, maxTokens)                             │
│ + createCheckpoint(context)                                     │
└─────────────────────────────────────────────────────────────────┘
         │
         v
┌─────────────────────────────────────────────────────────────────┐
│                  ContextStorageService                          │
├─────────────────────────────────────────────────────────────────┤
│ + saveEffectiveContext(context)                                 │
│ + createCheckpoint(context)                                     │
│ + loadCheckpoint(id)                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. 依赖关系

```
ChatService
    ├── SessionManager (会话管理)
    ├── RequestTracker (请求跟踪)
    ├── ContextManager (上下文管理)
    ├── LLMConfigService (配置获取)
    ├── SkillManager (技能加载)
    └── AceService (ACE 集成)

ContextManager
    ├── ContextStorageService (存储)
    └── TokenCounter (令牌计数)

SkillManager
    ├── SkillInstaller (安装)
    ├── SkillIndex (索引)
    └── LanceDB (向量存储)

AceService
    ├── ReActEngine (思考引擎)
    └── EventBus (事件)
```

---

## 5. 数据结构

### 5.1 ChatRequest

```typescript
interface ChatRequest {
  sessionId?: string;
  messages: Message[];
  options?: {
    strategy?: 'react' | 'single-round';
    selfThinking?: boolean;
    stream?: boolean;
    interruptible?: boolean;
  };
}
```

### 5.2 Session

```typescript
interface Session {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, any>;
  status: 'active' | 'ended';
}
```

### 5.3 ActiveRequest

```interface ActiveRequest {
  id: string;
  sessionId: string;
  startTime: Date;
  controller: AbortController;
  status: 'running' | 'interrupted' | 'completed';
}
```

---

## 6. 配置项

```typescript
interface ServiceConfig {
  chat: {
    defaultStrategy: 'react' | 'single-round';
    maxContextTokens: number;
    enableInterrupt: boolean;
  };
  session: {
    ttl: number;
    maxPerUser: number;
  };
  context: {
    compressionThreshold: number;
    maxCheckpoints: number;
  };
  skills: {
    installedPath: string;
    indexRefreshInterval: number;
  };
}
```

---

## 7. 扩展点

### 7.1 新增聊天策略

1. 在 `src/strategies/` 创建策略类
2. 实现 `ChatStrategy` 接口
3. 在 `ChatService` 构造函数中注册

### 7.2 新增上下文压缩算法

1. 实现 `ContextCompressor` 接口
2. 在 `ContextManager` 中注册

### 7.3 新增会话存储

1. 实现 `SessionStorage` 接口
2. 在 `SessionManager` 中切换实现
