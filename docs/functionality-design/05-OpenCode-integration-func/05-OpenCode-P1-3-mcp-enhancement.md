# R-005 P1-3: MCP 工具增强功能设计

> 所属需求：R-005 OpenCode 架构特性集成需求
> 所属阶段：P1（第二优先级）
> 功能模块：MCP 工具增强
> 文档版本：v1.0.0

---

## 1. 功能概述

### 1.1 功能描述

本功能旨在增强 apex-bridge 的 MCP 工具集成能力，主要包括：
- **convertMcpTool() 转换器**：将 MCP 工具转换为统一工具定义格式
- **工具命名规范**：支持 `{clientName}_{toolName}` 格式
- **MCP resource URI 解析**：支持 mcp:// URI 解析
- **MCPIntegrationService 改造**：适配 Tool.define() 模式

### 1.2 涉及文件

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `src/services/MCPIntegrationService.ts` | 修改 | 适配 Tool.define() 模式 |
| `src/services/mcp/convert.ts` | 新建 | MCP 工具转换器（convertMcpTool） |
| `src/core/tool/tool.ts` | 修改 | 适配 MCP 工具定义 |
| `src/core/tool/registry.ts` | 修改 | MCP 工具注册集成 |

### 1.3 依赖关系

```
MCPIntegrationService
    ├── MCP Server 管理
    ├── MCP Client 生命周期
    ├── convertMcpTool() 转换器
    └── MCP 工具注册

convertMcpTool()
    └── Tool.define()

MCP Tool
    └── ToolRegistry
            └── Tool.define()
```

---

## 2. 功能模块结构

```
MCP 工具增强
├── MCP 工具转换器
│   ├── convertMcpTool() 主函数
│   ├── inputSchema 转换
│   └── 工具描述处理
├── 工具命名规范
│   ├── {clientName}_{toolName} 格式
│   └── 名称冲突处理
├── MCP 资源读取
│   ├── mcp:// URI 解析
│   ├── 资源内容获取
│   └── FilePart 转换
└── MCPIntegrationService 改造
    ├── Tool.define() 模式注册
    ├── 超时配置
    └── 转换器集成
```

---

## 3. 数据结构设计

### 3.1 MCP 工具定义（原始）

```typescript
interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, any>;
    required?: string[];
  };
}

interface MCPClient {
  name: string;
  server: MCPServer;
  tools: MCPTool[];
  resources?: MCPResource[];
}

interface MCPServer {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}
```

### 3.2 convertMcpTool 配置

```typescript
interface ConvertMcpToolConfig {
  /** 客户端名称 */
  clientName: string;

  /** 工具前缀 */
  toolPrefix?: string;

  /** 工具描述模板 */
  descriptionTemplate?: (original: string, clientName: string) => string;

  /** 参数名称映射 */
  parameterMapper?: (paramName: string) => string;

  /** 忽略的工具列表 */
  ignoredTools?: string[];

  /** 超时时间（毫秒） */
  timeout?: number;
}
```

### 3.3 工具名称格式

```typescript
// 工具名称格式：{clientName}_{toolName}
type McpToolName = `${string}_${string}`;

// 示例：
// filesystem_readFile
// github_createIssue
// sqlite_query
```

### 3.4 MCP 资源 URI

```typescript
// mcp:// URI 格式
type McpResourceUri = `mcp://${string}/${string}`;

// 示例：
// mcp://filesystem/etc/hosts
// mcp://github/my-org/my-repo

interface McpResourceRef {
  uri: McpResourceUri;
  serverId: string;
  resourcePath: string;
}
```

### 3.5 转换后的 Tool.Info

```typescript
interface McpToolInfo {
  /** 原始 MCP 工具名称 */
  originalName: string;

  /** 转换后的工具名称 */
  toolName: McpToolName;

  /** 客户端名称 */
  clientName: string;

  /** 工具描述 */
  description: string;

  /** 工具元数据 */
  metadata: {
    source: "mcp";
    clientName: string;
    originalName: string;
    timeout?: number;
  };
}
```

---

## 4. 接口设计

### 4.1 convertMcpTool() 转换器

```typescript
namespace McpToolConverter {
  function convertMcpTool(
    mcpTool: MCPTool,
    clientName: string,
    config?: Partial<ConvertMcpToolConfig>
  ): ToolInfo;

  function convertMcpTools(
    mcpTools: MCPTool[],
    clientName: string,
    config?: Partial<ConvertMcpToolConfig>
  ): ToolInfo[];

  function convertAllClients(
    clients: MCPClient[],
    config?: Partial<ConvertMcpToolConfig>
  ): ToolInfo[];
}
```

### 4.2 MCP 资源读取器

```typescript
interface McpResourceReader {
  /** 解析 mcp:// URI */
  parseUri(uri: string): McpResourceRef;

  /** 检查 URI 是否有效 */
  isValidUri(uri: string): boolean;

  /** 读取资源内容 */
  readResource(uri: string): Promise<ResourceContent>;

  /** 列出可用资源 */
  listResources(clientName?: string): MCPResource[];
}

interface ResourceContent {
  uri: string;
  mimeType: string;
  content: string | Buffer;
  metadata?: Record<string, any>;
}
```

### 4.3 MCPIntegrationService（改造后）

```typescript
interface MCPIntegrationService {
  // 现有方法（保留）
  initialize(): Promise<void>;
  connect(serverId: string): Promise<void>;
  disconnect(serverId: string): Promise<void>;
  callTool(serverId: string, toolName: string, params: Record<string, any>): Promise<MCPContent[]>;

  // 新增方法（适配 Tool.define() 模式）
  getToolInfo(toolName: string): ToolInfo | undefined;
  getAllToolInfos(): ToolInfo[];
  registerAllTools(): void;
  unregisterClientTools(clientName: string): void;

  // 资源读取
  readResource(uri: string): Promise<ResourceContent>;
  listResources(serverId?: string): MCPResource[];

  // 工具转换
  convertTool(mcpTool: MCPTool, clientName: string): ToolInfo;
  convertAllTools(): ToolInfo[];
}
```

### 4.4 转换后的 Tool.Execute

```typescript
interface McpToolExecutor {
  execute(ctx: Tool.Context): Promise<ToolResult>;

  // MCP 特定功能
  getRawResult(): MCPContent[];
  hasResourceResult(): boolean;
}
```

---

## 5. 业务规则

### 5.1 工具命名规则

| 规则编号 | 规则描述 |
|---------|---------|
| BR-01 | 工具名称格式：`{clientName}_{toolName}` |
| BR-02 | clientName 中的特殊字符转换为下划线 |
| BR-03 | 同名工具自动添加后缀：`{name}_1`、`{name}_2` |
| BR-04 | 工具名称长度限制在 64 字符内 |

### 5.2 工具转换规则

| 规则编号 | 规则描述 |
|---------|---------|
| BR-05 | inputSchema 转换为 Zod schema |
| BR-06 | 必填参数在 Zod schema 中标记 |
| BR-07 | 工具描述自动添加 `[MCP-{clientName}]` 前缀 |
| BR-08 | 忽略列表中的工具不进行转换 |

### 5.3 资源读取规则

| 规则编号 | 规则描述 |
|---------|---------|
| BR-09 | mcp:// URI 格式：`mcp://{serverId}/{resourcePath}` |
| BR-10 | 资源内容自动转换为 FilePart |
| BR-11 | 支持多种 content 类型（text、image、resource） |
| BR-12 | 资源读取超时可配置 |

---

## 6. 异常处理

### 6.1 异常类型

| 异常类型 | 触发条件 | 处理方式 |
|---------|---------|---------|
| `McpToolNotFoundError` | 工具不存在 | 返回错误 |
| `McpServerDisconnectedError` | MCP 服务器断开 | 重连或返回错误 |
| `McpToolExecutionError` | 工具执行异常 | 返回 error 状态 |
| `McpResourceNotFoundError` | 资源不存在 | 返回错误 |
| `McpResourceReadError` | 资源读取失败 | 返回错误 |
| `McpTimeoutError` | MCP 调用超时 | 返回超时错误 |

### 6.2 错误响应格式

```typescript
interface McpErrorResponse {
  name: string;
  message: string;
  details: {
    serverId?: string;
    toolName?: string;
    resourceUri?: string;
    cause?: string;
  };
  recoverable: boolean;
}
```

---

## 7. 关键逻辑指导

### 7.1 convertMcpTool() 实现

**实现思路**：
1. 提取 MCP 工具的元信息
2. 将 inputSchema 转换为 Zod schema
3. 包装 execute 函数，处理 MCP 调用
4. 添加 MCP 元数据

**关键步骤**：
```
接收 MCP 工具定义
    |
    v
生成工具名称 {clientName}_{toolName}
    |
    v
转换 inputSchema 为 Zod schema
    |
    +-- object 类型 → z.object()
    +-- properties → z.object({...})
    +-- required → .required()
    |
    v
包装 execute 函数
    |
    +-- 调用 MCPIntegrationService.callTool()
    +-- 转换 MCPContent[] 为 ToolResult
    |
    v
生成 ToolInfo
    |
    v
返回 ToolInfo
```

**inputSchema 转换示例**：
```typescript
// MCP inputSchema
{
  type: "object",
  properties: {
    path: { type: "string", description: "File path" },
    encoding: { type: "string", enum: ["utf-8", "base64"] }
  },
  required: ["path"]
}

// 转换为 Zod schema
z.object({
  path: z.string().describe("File path"),
  encoding: z.enum(["utf-8", "base64"]).optional()
}).required(["path"])
```

### 7.2 资源 URI 解析实现

**实现思路**：
1. 验证 URI 格式
2. 解析 serverId 和 resourcePath
3. 从对应 MCP server 读取资源
4. 转换为 FilePart

**关键步骤**：
```
接收 mcp:// URI
    |
    v
验证 URI 格式
    |
    v
解析 {serverId}/{resourcePath}
    |
    v
查找对应的 MCP server
    |
    v
调用 MCP server 的资源读取接口
    |
    v
转换 content 为 FilePart
    |
    v
返回结果
```

**注意事项**：
- 需要处理 URI 编码
- serverId 必须存在
- 资源不存在时抛出异常

### 7.3 名称冲突处理实现

**实现思路**：
1. 检查工具名称是否已存在
2. 如果冲突，添加后缀 `{name}_1`、`{name}_2` 等
3. 继续检查直到找到可用名称

**关键步骤**：
```
生成候选工具名称
    |
    v
检查是否已存在
    |
    +-- 不存在 → 直接使用
    |
    v
存在冲突
    |
    v
添加后缀 {name}_1
    |
    v
再次检查
    |
    v
循环直到找到可用名称
```

---

## 8. 验收标准

### 8.1 功能验收

- [ ] convertMcpTool() 转换器工作正常
- [ ] {clientName}_{toolName} 工具命名规范
- [ ] 工具名称冲突处理正常
- [ ] MCP resource URI 解析正常工作
- [ ] MCPIntegrationService 适配 Tool.define() 模式
- [ ] 工具元数据正确传递

### 8.2 质量验收

- [ ] TypeScript 编译无错误
- [ ] 单元测试覆盖率 80%+
- [ ] 现有功能 100% 正常（回归测试）
- [ ] 文档完整

---

## 9. 参考资料

| 类型 | 文件 | 说明 |
|-----|------|------|
| 参考实现 | `opencode/packages/opencode/src/mcp/index.ts` | MCP 集成参考 |
| 现有实现 | `src/services/MCPIntegrationService.ts` | 当前 MCPIntegrationService |
| MCP SDK | `@modelcontextprotocol/sdk` | MCP 协议 SDK |
| 架构设计 | `docs/architecture-design/模块/Core核心引擎模块设计.md` | Core 模块架构 |
| 需求文档 | `docs/requirements/05-opencode-integration.md` | R-005 需求文档 |
| 前置设计 | `05-OpenCode-P1-1-tool-framework.md` | P1-1 工具框架设计 |
