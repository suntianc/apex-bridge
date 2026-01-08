# Service 服务层模块设计

> 所属模块：Service
> 文档版本：v2.0.0
> 创建日期：2025-12-29
> 更新日期：2026-01-08

## 1. 模块概述

Service 层是 ApexBridge 的业务逻辑层，位于 API 层和 Core 引擎层之间，负责协调各核心组件完成具体业务功能。

### 1.1 模块职责

- 聊天业务协调与策略选择
- 会话生命周期管理
- 技能系统管理
- 对话历史存储
- MCP 集成
- 工具向量检索

### 1.2 目录结构

```
src/services/
├── ChatService.ts              # 聊天服务（主协调器）
├── SessionManager.ts           # 会话管理器
├── RequestTracker.ts           # 请求跟踪器
├── LLMConfigService.ts         # LLM 配置服务
├── ConversationHistoryService.ts # 对话历史服务
├── SkillManager.ts             # 技能管理器
├── MCPIntegrationService.ts    # MCP 集成服务
├── ToolRetrievalService.ts     # 工具检索服务
├── DataPurgeService.ts         # 数据清理服务
└── tool-retrieval/             # 向量检索模块
    ├── ToolRetrievalService.ts
    ├── LanceDBConnection.ts
    ├── SearchEngine.ts
    └── types.ts
```

**v2.0.0 变更**：
- 移除 ContextManager（上下文压缩）
- 移除 AceService（ACE 框架）
- 移除 PlaybookMatcher（Playbook 系统）
- 移除 ContextStorageService（上下文存储）
- 新增 ToolRetrievalService（工具检索）

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

### 2.6 ToolRetrievalService

**职责**：工具向量检索（Skill/MCP/Builtin）

**核心方法**：
- `initialize()` - 初始化向量数据库
- `findRelevantSkills(query: string, limit: number)` - 检索相关工具
- `indexTools(tools: SkillTool[])` - 索引工具

---

## 3. 类图

```
┌─────────────────────────────────────────────────────────────────┐
│                        ChatService                              │
├─────────────────────────────────────────────────────────────────┤
│ - strategies: ChatStrategy[]                                    │
│ - sessionManager: SessionManager                                │
│ - requestTracker: RequestTracker                                │
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
│                   ToolRetrievalService                          │
├─────────────────────────────────────────────────────────────────┤
│ - vectorDB: LanceDBConnection                                   │
│ - embeddingGenerator: EmbeddingGenerator                        │
├─────────────────────────────────────────────────────────────────┤
│ + initialize()                                                  │
│ + findRelevantSkills(query: string, limit: number)              │
│ + indexTools(tools: SkillTool[])                                │
└─────────────────────────────────────────────────────────────────┘
         │
         v
┌─────────────────────────────────────────────────────────────────┐
│                   LanceDBConnection                              │
├─────────────────────────────────────────────────────────────────┤
│ - db: lancedb.Connection                                        │
│ - table: lancedb.Table                                          │
├─────────────────────────────────────────────────────────────────┤
│ + connect(config: LanceDBConfig)                                │
│ + initializeTable()                                             │
│ + addRecords(records: ToolsTable[])                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. 依赖关系

```
ChatService
    ├── SessionManager (会话管理)
    ├── RequestTracker (请求跟踪)
    ├── LLMConfigService (配置获取)
    ├── SkillManager (技能加载)
    └── ConversationHistoryService (历史记录)

SkillManager
    ├── SkillInstaller (安装)
    ├── ToolRetrievalService (索引)
    └── LanceDB (向量存储)

ToolRetrievalService
    ├── LanceDBConnection (数据库连接)
    └── EmbeddingGenerator (向量生成)
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
    maxContextMessages: number;
    enableInterrupt: boolean;
  };
  session: {
    ttl: number;
    maxPerUser: number;
  };
  skills: {
    installedPath: string;
    indexRefreshInterval: number;
  };
  vectorSearch: {
    enabled: boolean;
    defaultLimit: number;
    defaultThreshold: number;
  };
}
```

---

## 7. 扩展点

### 7.1 新增聊天策略

1. 在 `src/strategies/` 创建策略类
2. 实现 `ChatStrategy` 接口
3. 在 `ChatService` 构造函数中注册

### 7.2 新增会话存储

1. 实现 `SessionStorage` 接口
2. 在 `SessionManager` 中切换实现

### 7.3 新增向量数据库

1. 实现 `IVectorDBConnection` 接口
2. 在 `ToolRetrievalService` 中切换实现
