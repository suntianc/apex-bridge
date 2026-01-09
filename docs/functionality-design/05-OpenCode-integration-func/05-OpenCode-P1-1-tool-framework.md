# R-005 P1-1: 工具调用框架功能设计

> 所属需求：R-005 OpenCode 架构特性集成需求
> 所属阶段：P1（第二优先级）
> 功能模块：工具调用框架规范化
> 文档版本：v1.0.0

---

## 1. 功能概述

### 1.1 功能描述

本功能旨在规范化 apex-bridge 的工具调用框架，引入 Tool.define() 工厂模式，统一工具定义和执行。主要包括：
- **Tool.define() 工厂**：基于现有 BuiltInTool 实现工具工厂函数
- **ToolRegistry**：集中管理所有工具（替换 BuiltInToolsRegistry）
- **Tool.Context 参数**：统一的工具执行上下文
- **metadata() 方法**：工具状态更新方法

### 1.2 涉及文件

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `src/core/tool-action/tool-system.ts` | 修改 | 改造 BuiltInTool 为 Tool.Info 兼容模式 |
| `src/services/BuiltInToolsRegistry.ts` | 修改 | 改造为 ToolRegistry |
| `src/core/tool/tool.ts` | 新建 | Tool.define() 工厂 |
| `src/core/tool/registry.ts` | 新建 | ToolRegistry 工具注册表 |
| `src/core/tool-action/ToolDispatcher.ts` | 修改 | 适配 Tool.define() 模式 |

### 1.3 依赖关系

```
ToolDispatcher
    └── ToolRegistry
            ├── Tool.define() 工厂
            └── 工具定义（BuiltInTool 改造）

Tool.define()
    ├── parameters（Zod schema）
    ├── execute（执行函数）
    └── metadata（工具元信息）
```

---

## 2. 功能模块结构

```
工具调用框架
├── Tool.define() 工厂
│   ├── 工具配置定义
│   ├── 参数验证
│   └── 执行函数包装
├── ToolRegistry
│   ├── 工具注册/注销
│   ├── 工具查询/列表
│   └── 工具状态管理
├── Tool.Info 接口
│   ├── 工具标识
│   ├── 参数模式
│   ├── 执行函数
│   └── 元数据
└── Tool.Context
    ├── 输入参数
    ├── 工具状态
    └── 工具执行器
```

---

## 3. 数据结构设计

### 3.1 Tool.Config（工具配置）

```typescript
interface ToolConfig {
  name: string;
  description?: string;
  parameters: z.ZodType;  // Zod schema
  execute: ToolExecuteFunction;
  metadata?: ToolMetadata;
}

type ToolExecuteFunction = (ctx: Tool.Context) => Promise<ToolResult>;
```

### 3.2 Tool.Info（工具信息）

```typescript
interface ToolInfo {
  /** 工具名称 */
  name: string;

  /** 工具描述 */
  description?: string;

  /** 参数模式 */
  parameters: z.ZodType;

  /** 执行函数 */
  execute: ToolExecuteFunction;

  /** 元数据 */
  metadata: ToolMetadata;

  /** 创建时间 */
  createdAt: number;

  /** 是否已禁用 */
  disabled: boolean;
}
```

### 3.3 Tool.Metadata（工具元数据）

```typescript
interface ToolMetadata {
  /** 工具类别 */
  category?: string;

  /** 权限要求 */
  permissions?: string[];

  /** 超时时间（毫秒） */
  timeout?: number;

  /** 是否危险操作 */
  dangerous?: boolean;

  /** 确认提示 */
  confirm?: string;

  /** 自定义标签 */
  tags?: string[];
}
```

### 3.4 Tool.Context（工具执行上下文）

```typescript
interface ToolContext {
  /** 工具调用 ID */
  callId: string;

  /** 输入参数 */
  input: Record<string, any>;

  /** 会话 ID */
  sessionID: string;

  /** 消息 ID */
  messageID: string;

  /** 工具状态更新回调 */
  metadata: (update: Partial<ToolState>) => void;

  /** AbortSignal 用于取消 */
  signal?: AbortSignal;

  /** 工具信息（只读） */
  tool: ToolInfo;

  /** 工具注册表（只读） */
  registry: ToolRegistry;
}
```

### 3.5 Tool.Result（工具执行结果）

```typescript
interface ToolResult {
  /** 结果内容 */
  content: string;

  /** 结果类型 */
  type: "text" | "json" | "error";

  /** 附件列表 */
  attachments?: FilePart[];

  /** 元数据 */
  metadata?: Record<string, any>;
}
```

### 3.6 ToolRegistry 状态

```typescript
interface ToolRegistryState {
  /** 工具映射 */
  tools: Map<string, ToolInfo>;

  /** 工具状态映射 */
  toolStates: Map<string, ToolState>;

  /** 类别索引 */
  categories: Map<string, Set<string>>;

  /** 标签索引 */
  tagIndex: Map<string, Set<string>>;

  /** 工具调用历史（用于 Doom Loop 检测） */
  callHistory: ToolCallRecord[];
}

interface ToolCallRecord {
  toolName: string;
  parameters: Record<string, any>;
  parametersHash: string;
  timestamp: number;
  callId: string;
}
```

---

## 4. 接口设计

### 4.1 Tool.define() 工厂

```typescript
namespace Tool {
  function define(config: ToolConfig): ToolInfo;

  // 便捷方法
  function createTextTool(name: string, description: string): ToolInfo;
  function createSearchTool(name: string, description: string, searchFn: SearchFunction): ToolInfo;
}
```

### 4.2 ToolRegistry

```typescript
interface ToolRegistry {
  // 工具注册
  register(info: ToolInfo): void;
  unregister(name: string): boolean;
  update(name: string, updates: Partial<ToolInfo>): void;
  disable(name: string): void;
  enable(name: string): void;

  // 工具查询
  get(name: string): ToolInfo | undefined;
  getAll(): ToolInfo[];
  list(category?: string): ToolInfo[];
  search(query: string): ToolInfo[];
  findByTag(tag: string): ToolInfo[];

  // 工具执行
  execute(name: string, input: Record<string, any>, context: Partial<ToolContext>): Promise<ToolResult>;

  // 状态管理
  getState(callId: string): ToolState | undefined;
  updateState(callId: string, state: Partial<ToolState>): void;
  clearStates(): void;

  // Doom Loop 检测
  detectDoomLoop(): DoomLoopDetectionResult;
  getCallHistory(limit: number): ToolCallRecord[];

  // 统计信息
  getStats(): {
    totalTools: number;
    disabledTools: number;
    categories: Record<string, number>;
  };
}
```

### 4.3 ToolDispatcher 适配

```typescript
interface ToolDispatcher {
  // 现有方法
  dispatch(toolName: string, params: any): Promise<Observation>;

  // 新增方法（适配 Tool.define() 模式）
  registerTool(info: ToolInfo): void;
  unregisterTool(name: string): boolean;
  getTool(name: string): ToolInfo | undefined;
  listTools(): ToolInfo[];

  // 执行工具（带 Tool.Context）
  executeWithContext(toolName: string, input: Record<string, any>, context: ToolContext): Promise<ToolResult>;
}
```

---

## 5. 业务规则

### 5.1 工具注册规则

| 规则编号 | 规则描述 |
|---------|---------|
| BR-01 | 工具名称在同一注册表中必须唯一 |
| BR-02 | `parameters` 必须是有效的 Zod schema |
| BR-03 | `execute` 函数必须是异步函数 |
| BR-04 | 注册时自动生成 `createdAt` 时间戳 |
| BR-05 | 禁用的工具不能被调用 |

### 5.2 工具执行规则

| 规则编号 | 规则描述 |
|---------|---------|
| BR-06 | 执行前自动验证输入参数是否符合 schema |
| BR-07 | 执行超时自动中断（可配置 timeout） |
| BR-08 | 危险操作需要用户确认（可配置） |
| BR-09 | 执行结果自动记录到状态管理 |
| BR-10 | 执行异常自动转换为 error 状态 |

### 5.3 状态管理规则

| 规则编号 | 规则描述 |
|---------|---------|
| BR-11 | 每个工具调用对应一个唯一的 callId |
| BR-12 | 状态更新通过 `metadata()` 回调进行 |
| BR-13 | callHistory 保留最近 N 条记录（默认 100） |
| BR-14 | `detectDoomLoop()` 使用滑动窗口检测重复模式 |

---

## 6. 异常处理

### 6.1 异常类型

| 异常类型 | 触发条件 | 处理方式 |
|---------|---------|---------|
| `ToolNotFoundError` | 工具不存在 | 返回错误，不中断执行 |
| `ToolDisabledError` | 工具已禁用 | 返回错误，不中断执行 |
| `ToolExecutionError` | 工具执行异常 | 记录错误，返回 error 状态 |
| `InvalidArgumentError` | 输入参数不符合 schema | 验证失败，不执行工具 |
| `PermissionDeniedError` | 权限不足 | 返回错误，不中断执行 |

### 6.2 错误响应格式

```typescript
interface ToolErrorResponse {
  name: string;
  message: string;
  details?: {
    toolName: string;
    input: Record<string, any>;
    cause?: string;
  };
  recoverable: boolean;  // 是否可恢复
}
```

---

## 7. 关键逻辑指导

### 7.1 Tool.define() 工厂实现

**实现思路**：
1. 包装用户提供的 execute 函数
2. 添加参数验证逻辑
3. 生成 ToolInfo 对象
4. 返回 ToolInfo

**关键步骤**：
```
接收 ToolConfig
    |
    v
验证配置有效性
    |
    +-- 检查 name 非空
    +-- 检查 parameters 是 Zod schema
    +-- 检查 execute 是函数
    |
    v
包装 execute 函数（添加验证、错误处理）
    |
    v
创建 ToolInfo 对象
    |
    v
返回 ToolInfo
```

**注意事项**：
- Zod schema 的验证错误需要转换为 ToolError
- 需要处理 execute 函数中的异常
- metadata 中的 timeout 需要在执行时生效

### 7.2 ToolRegistry 状态管理实现

**实现思路**：
1. 使用 Map 存储工具信息和状态
2. 实现工具调用历史的滑动窗口
3. 提供 Doom Loop 检测接口

**关键步骤**：
```
注册工具
    |
    v
存储到 tools Map
    |
    +-- 更新 categories 索引
    +-- 更新 tagIndex 索引
    |
    v
执行工具
    |
    v
记录调用历史（push 到 callHistory，移除超出的）
    |
    v
返回结果，更新状态
```

**注意事项**：
- Map 的键需要考虑工具名称的大小写
- callHistory 需要限制大小，防止内存溢出
- 索引需要同步更新

### 7.3 参数验证实现

**实现思路**：
1. 使用 Zod 进行参数验证
2. 验证失败时抛出 InvalidArgumentError
3. 验证成功时继续执行

**关键步骤**：
```
接收 input
    |
    v
使用 parameters schema 解析
    |
    +-- parse：严格验证，失败抛出错误
    +-- safeParse：安全验证，返回结果
    |
    v
验证失败
    |
    v
返回验证错误详情
```

**边界条件**：
- 空 input：使用默认值（如果有）
- 多余字段：默认忽略（可配置 strict 模式）
- 类型不匹配：返回详细错误信息

---

## 8. 验收标准

### 8.1 功能验收

- [ ] Tool.define() 工厂模式工作正常（基于现有 BuiltInTool 改造）
- [ ] ToolRegistry 替代 BuiltInToolsRegistry
- [ ] 工具注册/注销功能正常
- [ ] 工具查询/列表功能正常
- [ ] 参数验证功能正常
- [ ] 状态管理功能正常（pending/running/completed/error）
- [ ] Doom Loop 检测功能正常

### 8.2 质量验收

- [ ] TypeScript 编译无错误
- [ ] 单元测试覆盖率 80%+
- [ ] 现有功能 100% 正常（回归测试）
- [ ] 文档完整

---

## 9. 参考资料

| 类型 | 文件 | 说明 |
|-----|------|------|
| 参考实现 | `opencode/packages/opencode/src/tool/tool.ts` | Tool.define() 定义 |
| 参考实现 | `opencode/packages/opencode/src/tool/registry.ts` | ToolRegistry 定义 |
| 现有实现 | `src/core/tool-action/tool-system.ts` | 当前 BuiltInTool 定义 |
| 现有实现 | `src/services/BuiltInToolsRegistry.ts` | 当前 BuiltInToolsRegistry |
| 架构设计 | `docs/architecture-design/模块/Core核心引擎模块设计.md` | Core 模块架构 |
| 需求文档 | `docs/requirements/05-opencode-integration.md` | R-005 需求文档 |
| 前置设计 | `05-OpenCode-P0-2-message-part.md` | P0-2 消息结构设计 |
