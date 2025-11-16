# NodeManager 节点管理器设计文档

> **文档版本**: v1.0  
> **创建时间**: 2025-01-06  
> **基于**: ARCHITECTURE.md v2.0, DEVELOPMENT_PRIORITY.md  
> **状态**: 已实现（最近更新：2025-11-08）

---

## 📋 文档说明

本文档详细设计 M3.1 节点管理器（NodeManager）的功能、架构、协议和实现方案。

**设计目标**：
1. 支持分布式节点（Worker、Companion）的注册和管理
2. 实现节点心跳机制和状态管理
3. 实现任务分发和LLM代理请求
4. 提供完整的节点管理API
5. 为后续 Worker 和 Companion 开发奠定基础

---

## 1. 总体架构

### 1.1 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Apex Bridge Hub                          │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           NodeManager (核心管理器)                    │  │
│  │  - 节点注册与注销                                      │  │
│  │  - 心跳监控                                           │  │
│  │  - 状态管理                                           │  │
│  │  - 任务分发                                           │  │
│  │  - LLM代理                                            │  │
│  └──────────────────────────────────────────────────────┘  │
│                        ↑         ↑                          │
│                        │         │                          │
│  ┌─────────────────────┘         └──────────────────────┐  │
│  │  DistributedServerChannelSDK  │  NodeService          │  │
│  │  (WebSocket通信)               │  (持久化存储)         │  │
│  └──────────────────────────────────────────────────────┘  │
│                        ↑                                    │
│                        │                                    │
│  ┌─────────────────────┴────────────────────────────────┐  │
│  │           WebSocketManager (SDK)                      │  │
│  │           /abp-distributed-server (推荐)              │  │
│  │           /vcp-distributed-server (兼容，已弃用)      │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                        ↕ WebSocket
┌─────────────────────────────────────────────────────────────┐
│                    Worker / Companion Node                  │
│  - 连接Hub                                                  │
│  - 注册节点信息                                             │  │
│  - 发送心跳                                                 │  │
│  - 接收任务                                                 │  │
│  - 请求LLM服务                                              │  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 核心组件

1. **NodeManager** - 核心管理器类
   - 节点注册与注销
   - 心跳监控与状态管理
   - 任务分发与负载均衡
   - LLM代理请求处理

2. **NodeService** - 节点持久化服务（已存在，需扩展）
   - 节点信息存储（JSON文件）
   - 节点配置管理
   - 节点状态持久化

3. **DistributedServerChannelSDK** - WebSocket通信通道（已存在）
   - 处理节点连接
   - 消息路由
   - 心跳检测

4. **NodeController** - REST API控制器（新建）
   - 节点列表查询
   - 节点状态查询
   - 节点操作（重启、卸载等）

---

## 2. 节点信息模型

### 2.1 NodeInfo 接口

```typescript
export interface NodeInfo {
  // 基础信息
  id: string;                    // 节点ID（由Hub生成或节点提供）
  name: string;                  // 节点名称
  type: 'worker' | 'companion';  // 节点类型
  version?: string;              // 节点版本
  
  // 状态信息
  status: 'online' | 'offline' | 'busy' | 'unknown';
  registeredAt: number;          // 注册时间戳
  lastHeartbeat: number;         // 最后心跳时间戳
  lastSeen?: number;             // 最后活跃时间
  
  // 能力信息
  capabilities: string[];        // 能力列表（如：['file_management', 'music_control']）
  tools?: string[];              // 工具列表（从register_tools消息获取）
  
  // 人格配置（Companion类型需要）
  personality?: PersonalityConfig;
  
  // 网络信息
  endpoint?: string;             // 节点端点（如果有）
  ips?: {
    localIPs?: string[];
    publicIP?: string;
  };
  
  // 配置信息
  config?: {
    maxConcurrentTasks?: number;  // 最大并发任务数
    resources?: {                 // 资源信息
      cpu?: number;
      memory?: number;
      disk?: number;
    };
    metadata?: Record<string, any>; // 其他元数据
  };
  
  // 统计信息
  stats?: {
    totalTasks?: number;          // 总任务数
    completedTasks?: number;      // 已完成任务数
    failedTasks?: number;         // 失败任务数
    averageResponseTime?: number; // 平均响应时间（ms）
  };
}
```

### 2.2 节点类型说明

#### Worker 节点
- **用途**: 执行特定任务（文件管理、记账、音乐控制等）
- **特点**: 
  - 有明确的工具列表（capabilities）
  - 通常不需要完整的人格配置
  - 专注于任务执行

#### Companion 节点
- **用途**: AI陪伴（如AI女儿小悦）
- **特点**:
  - 需要完整的人格配置
  - 有独立的对话能力
  - 可能需要独立的LLM访问（或通过Hub代理）

---

## 3. 节点注册协议

### 3.1 注册流程

```
1. 节点连接WebSocket: 
   - 推荐：ws://hub:port/abp-distributed-server/VCP_Key=xxx 或 ws://hub:port/distributed-server/VCP_Key=xxx
   - 兼容：ws://hub:port/vcp-distributed-server/VCP_Key=xxx (已弃用)
2. Hub发送连接确认: connection_ack
3. 节点发送注册消息: node_register
4. Hub验证并注册节点
5. Hub发送注册确认: node_registered
6. 节点开始发送心跳: heartbeat (每30秒)
```

### 3.2 消息类型定义

#### 3.2.1 node_register（节点注册）

**方向**: Node → Hub

```typescript
{
  type: 'node_register',
  data: {
    nodeId?: string;              // 可选，如果提供则使用，否则由Hub生成
    name: string;                 // 节点名称（必需）
    type: 'worker' | 'companion'; // 节点类型（必需）
    version?: string;             // 节点版本
    capabilities: string[];       // 能力列表（必需）
    tools?: string[];             // 工具列表（可选，Worker类型）
    personality?: PersonalityConfig; // 人格配置（可选，Companion类型）
    config?: {
      maxConcurrentTasks?: number;
      resources?: {
        cpu?: number;
        memory?: number;
        disk?: number;
      };
      metadata?: Record<string, any>;
    };
  }
}
```

**Hub响应**: `node_registered`

```typescript
{
  type: 'node_registered',
  data: {
    nodeId: string;               // Hub分配的节点ID
    success: boolean;
    message?: string;
    hubInfo?: {
      version: string;
      llmAvailable: boolean;      // Hub是否提供LLM代理
    };
  }
}
```

#### 3.2.2 heartbeat（心跳）

**方向**: Node → Hub

```typescript
{
  type: 'heartbeat',
  data: {
    nodeId: string;
    status?: 'online' | 'busy';   // 当前状态
    stats?: {                      // 统计信息（可选）
      activeTasks?: number;
      completedTasks?: number;
      failedTasks?: number;
    };
  }
}
```

**Hub响应**: `heartbeat_ack`

```typescript
{
  type: 'heartbeat_ack',
  data: {
    nodeId: string;
    timestamp: number;
  }
}
```

**心跳超时**: 如果90秒内未收到心跳，Hub将节点标记为离线

#### 3.2.3 node_unregister（节点注销）

**方向**: Node → Hub

```typescript
{
  type: 'node_unregister',
  data: {
    nodeId: string;
    reason?: string;
  }
}
```

**Hub响应**: `node_unregistered`

```typescript
{
  type: 'node_unregistered',
  data: {
    nodeId: string;
    success: boolean;
  }
}
```

---

## 4. 任务分发协议

### 4.1 任务分配流程

```
1. Hub需要执行任务 → NodeManager.assignTask()
2. NodeManager选择合适节点（负载均衡）
3. Hub发送任务: task_assign
4. 节点执行任务
5. 节点返回结果: task_result
6. Hub处理结果
```

### 4.2 消息类型定义

#### 4.2.1 task_assign（任务分配）

**方向**: Hub → Node

```typescript
{
  type: 'task_assign',
  data: {
    taskId: string;               // 任务ID（由Hub生成）
    nodeId: string;               // 目标节点ID
    toolName: string;             // 工具名称
    toolArgs: Record<string, any>; // 工具参数
    timeout?: number;             // 超时时间（ms，默认60000）
    priority?: number;            // 优先级（0-10，默认5）
  }
}
```

#### 4.2.2 task_result（任务结果）

**方向**: Node → Hub

```typescript
{
  type: 'task_result',
  data: {
    taskId: string;               // 任务ID
    nodeId: string;               // 节点ID
    success: boolean;             // 是否成功
    result?: any;                 // 执行结果（成功时）
    error?: {                     // 错误信息（失败时）
      code: string;
      message: string;
      details?: any;
    };
    executionTime?: number;       // 执行时间（ms）
  }
}
```

### 4.3 负载均衡策略

1. **状态优先**: 只选择 `online` 状态的节点
2. **能力匹配**: 选择具有所需能力的节点
3. **负载均衡**: 
   - 优先选择 `activeTasks` 最少的节点
   - 如果所有节点都忙碌，选择 `maxConcurrentTasks` 最大的节点
4. **轮询备选**: 如果多个节点满足条件，使用轮询策略

---

## 5. LLM代理请求协议

### 5.1 LLM代理流程

```
1. Worker节点需要调用LLM → 发送 llm_request
2. Hub接收请求 → NodeManager.handleLLMRequest()
3. Hub使用LLMClient调用LLM
4. Hub返回结果: llm_response
5. Worker节点接收结果
```

### 5.2 消息类型定义

#### 5.2.1 llm_request（LLM请求）

**方向**: Node → Hub

```typescript
{
  type: 'llm_request',
  data: {
    requestId: string;            // 请求ID（由节点生成）
    nodeId: string;               // 节点ID
    model?: string;               // 模型名称（可选，使用Hub默认）
    messages: Message[];          // 消息列表
    options?: {
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;           // 是否流式返回
      [key: string]: any;
    };
  }
}
```

#### 5.2.2 llm_response（LLM响应）

**方向**: Hub → Node

**成功响应**:
```typescript
{
  type: 'llm_response',
  data: {
    requestId: string;
    nodeId: string;
    success: true;
    content: string;              // LLM响应内容
    usage?: {                     // Token使用情况
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  }
}
```

**失败响应**:
```typescript
{
  type: 'llm_response',
  data: {
    requestId: string;
    nodeId: string;
    success: false;
    error: {
      code: string;
      message: string;
      details?: any;
    };
  }
}
```

**流式响应**（如果 `stream: true`）:
```typescript
{
  type: 'llm_response_stream',
  data: {
    requestId: string;
    nodeId: string;
    chunk: string;                // 流式数据块
    done: boolean;                // 是否完成
  }
}
```

---

## 6. NodeManager 核心类设计

### 6.1 类接口

```typescript
export class NodeManager {
  // 构造函数
  constructor(config: NodeManagerConfig);
  
  // 节点管理
  registerNode(nodeInfo: NodeRegisterInfo): Promise<NodeInfo>;
  unregisterNode(nodeId: string): Promise<void>;
  getNode(nodeId: string): NodeInfo | undefined;
  listNodes(filter?: NodeFilter): NodeInfo[];
  updateNodeStatus(nodeId: string, status: NodeStatus): void;
  
  // 心跳管理
  handleHeartbeat(nodeId: string, data: HeartbeatData): void;
  checkHeartbeatTimeout(): void;  // 定期检查心跳超时
  
  // 任务分发
  assignTask(task: Task): Promise<TaskResult>;
  getAvailableNodes(capability?: string): NodeInfo[];
  
  // LLM代理
  handleLLMRequest(nodeId: string, request: LLMRequest): Promise<LLMResponse>;
  
  // 统计信息
  getNodeStats(nodeId: string): NodeStats | undefined;
  getAllStats(): NodeManagerStats;
  
  // 生命周期
  start(): void;
  stop(): void;
}
```

### 6.2 配置接口

```typescript
export interface NodeManagerConfig {
  // 心跳配置
  heartbeatInterval: number;      // 心跳间隔（ms，默认30000）
  heartbeatTimeout: number;       // 心跳超时（ms，默认90000）
  
  // 任务配置
  defaultTaskTimeout: number;     // 默认任务超时（ms，默认60000）
  maxRetries: number;             // 最大重试次数（默认3）
  
  // 依赖服务
  distributedChannel: DistributedServerChannelSDK;
  nodeService: NodeService;
  llmClient?: LLMClient;          // LLM客户端（用于代理请求）
  eventBus?: EventBus;            // 事件总线（可选）
  
  // 日志配置
  enableLogging?: boolean;
}
```

---

## 7. 节点管理API设计

### 7.1 REST API端点

#### 7.1.1 获取节点列表

```
GET /api/admin/nodes
Query Parameters:
  - type?: 'worker' | 'companion'  // 过滤节点类型
  - status?: 'online' | 'offline' | 'busy'  // 过滤状态
  - capability?: string  // 过滤能力

Response:
{
  "success": true,
  "nodes": NodeInfo[],
  "total": number
}
```

#### 7.1.2 获取节点详情

```
GET /api/admin/nodes/:nodeId

Response:
{
  "success": true,
  "node": NodeInfo
}
```

#### 7.1.3 获取节点统计信息

```
GET /api/admin/nodes/:nodeId/stats

Response:
{
  "success": true,
  "stats": {
    "totalTasks": number,
    "completedTasks": number,
    "failedTasks": number,
    "averageResponseTime": number,
    "uptime": number,  // 在线时长（ms）
    "lastHeartbeat": number
  }
}
```

#### 7.1.4 获取节点日志（可选）

```
GET /api/admin/nodes/:nodeId/logs
Query Parameters:
  - limit?: number  // 日志条数（默认100）
  - level?: 'info' | 'warn' | 'error'

Response:
{
  "success": true,
  "logs": LogEntry[]
}
```

#### 7.1.5 手动触发节点心跳检查

```
POST /api/admin/nodes/:nodeId/heartbeat-check

Response:
{
  "success": true,
  "status": "online" | "offline",
  "lastHeartbeat": number
}
```

#### 7.1.6 注销节点

```
DELETE /api/admin/nodes/:nodeId

Response:
{
  "success": true,
  "message": "Node unregistered successfully"
}
```

### 7.2 WebSocket事件（推送到管理端）

#### 7.2.1 节点状态变化

```typescript
{
  type: 'node_status_changed',
  data: {
    nodeId: string;
    oldStatus: NodeStatus;
    newStatus: NodeStatus;
    timestamp: number;
  }
}
```

#### 7.2.2 节点注册

```typescript
{
  type: 'node_registered',
  data: {
    node: NodeInfo;
    timestamp: number;
  }
}
```

#### 7.2.3 节点注销

```typescript
{
  type: 'node_unregistered',
  data: {
    nodeId: string;
    timestamp: number;
  }
}
```

---

## 8. 实现计划

### 8.1 阶段1：核心功能（Week 1-2）

**任务清单**：
- [x] 创建 `NodeManager` 类（`src/core/NodeManager.ts`）
- [x] 扩展 `NodeService` 接口（添加统计信息、资源信息等）
- [x] 实现节点注册协议（`node_register` 消息处理）
- [x] 实现心跳机制（`heartbeat` 消息处理、超时检测）
- [x] 实现节点状态管理（online/offline/busy状态转换）
- [x] 集成到 `DistributedServerChannelSDK`（消息路由）
- [x] 单元测试

**交付物**：
- NodeManager核心类
- 节点注册和心跳功能
- 节点状态管理

### 8.2 阶段2：任务分发（Week 2-3）

**任务清单**：
- [x] 实现任务分发逻辑（`task_assign` 消息处理）
- [x] 实现负载均衡算法
- [ ] 实现任务结果处理（`task_result` 消息处理）
- [x] 实现任务超时和重试机制
- [ ] 集成测试

**交付物**：
- 任务分发功能
- 负载均衡算法
- 任务管理

### 8.3 阶段3：LLM代理（Week 3-4）

**任务清单**：
- [x] 实现LLM代理请求处理（`llm_request` 消息处理）
- [x] 实现LLM响应返回（`llm_response` 消息处理）
- [ ] 实现流式LLM响应（`llm_response_stream` 消息处理）
- [ ] 实现请求限流和配额管理（可选）
- [ ] 集成测试

**交付物**：
- LLM代理功能
- 流式响应支持

### 8.4 阶段4：API和监控（Week 4）

**任务清单**：
- [x] 创建 `NodeController`（`src/api/controllers/NodeController.ts`）
- [x] 实现节点管理REST API
- [x] 实现WebSocket事件推送（节点状态变化）
- [x] 实现节点统计信息收集
- [ ] API文档

**交付物**：
- 节点管理REST API
- WebSocket事件推送
- API文档

---

## 9. 技术细节

### 9.1 心跳超时检测

```typescript
// 定期检查心跳超时（每30秒）
private heartbeatCheckInterval: NodeJS.Timeout | null = null;

startHeartbeatCheck(): void {
  this.heartbeatCheckInterval = setInterval(() => {
    this.checkHeartbeatTimeout();
  }, 30000); // 每30秒检查一次
}

checkHeartbeatTimeout(): void {
  const now = Date.now();
  const timeout = this.config.heartbeatTimeout;
  
  for (const [nodeId, node] of this.nodes.entries()) {
    if (node.status === 'online' || node.status === 'busy') {
      const timeSinceLastHeartbeat = now - node.lastHeartbeat;
      if (timeSinceLastHeartbeat > timeout) {
        logger.warn(`⚠️ Node ${nodeId} heartbeat timeout (${timeSinceLastHeartbeat}ms)`);
        this.updateNodeStatus(nodeId, 'offline');
        // 发布事件
        this.config.eventBus?.publish('node_status_changed', {
          nodeId,
          oldStatus: node.status,
          newStatus: 'offline',
          timestamp: now
        });
      }
    }
  }
}
```

### 9.2 负载均衡算法

```typescript
getAvailableNodes(capability?: string): NodeInfo[] {
  return Array.from(this.nodes.values())
    .filter(node => {
      // 状态过滤
      if (node.status !== 'online' && node.status !== 'busy') {
        return false;
      }
      
      // 能力过滤
      if (capability && !node.capabilities.includes(capability)) {
        return false;
      }
      
      // 忙碌节点过滤（如果所有节点都忙碌，则不过滤）
      const allNodesBusy = Array.from(this.nodes.values())
        .every(n => n.status === 'busy' || n.status === 'offline');
      if (!allNodesBusy && node.status === 'busy') {
        return false;
      }
      
      return true;
    });
}

selectNodeForTask(capability?: string): NodeInfo | null {
  const availableNodes = this.getAvailableNodes(capability);
  if (availableNodes.length === 0) {
    return null;
  }
  
  // 优先选择在线且空闲的节点
  const onlineNodes = availableNodes.filter(n => n.status === 'online');
  if (onlineNodes.length > 0) {
    // 选择活跃任务最少的节点
    return onlineNodes.reduce((min, node) => {
      const minTasks = min.stats?.activeTasks || 0;
      const nodeTasks = node.stats?.activeTasks || 0;
      return nodeTasks < minTasks ? node : min;
    });
  }
  
  // 如果所有节点都忙碌，选择最大并发任务数最大的节点
  return availableNodes.reduce((max, node) => {
    const maxConcurrent = max.config?.maxConcurrentTasks || 1;
    const nodeConcurrent = node.config?.maxConcurrentTasks || 1;
    return nodeConcurrent > maxConcurrent ? node : max;
  });
}
```

### 9.3 任务超时处理

```typescript
private pendingTasks: Map<string, {
  taskId: string;
  nodeId: string;
  timeout: NodeJS.Timeout;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
}> = new Map();

assignTask(task: Task): Promise<TaskResult> {
  const node = this.selectNodeForTask(task.capability);
  if (!node) {
    return Promise.reject(new Error('No available node for task'));
  }
  
  const taskId = generateTaskId();
  const timeout = task.timeout || this.config.defaultTaskTimeout;
  
  return new Promise((resolve, reject) => {
    // 设置超时
    const timeoutHandle = setTimeout(() => {
      this.pendingTasks.delete(taskId);
      reject(new Error(`Task ${taskId} timeout after ${timeout}ms`));
    }, timeout);
    
    // 保存任务
    this.pendingTasks.set(taskId, {
      taskId,
      nodeId: node.id,
      timeout: timeoutHandle,
      resolve,
      reject
    });
    
    // 发送任务
    this.distributedChannel.sendToNode(node.id, {
      type: 'task_assign',
      data: {
        taskId,
        nodeId: node.id,
        toolName: task.toolName,
        toolArgs: task.toolArgs,
        timeout,
        priority: task.priority || 5
      }
    });
  });
}

handleTaskResult(nodeId: string, result: TaskResult): void {
  const task = this.pendingTasks.get(result.taskId);
  if (!task) {
    logger.warn(`⚠️ Received result for unknown task: ${result.taskId}`);
    return;
  }
  
  // 清除超时
  clearTimeout(task.timeout);
  this.pendingTasks.delete(result.taskId);
  
  // 解析或拒绝Promise
  if (result.success) {
    task.resolve(result.result);
  } else {
    task.reject(new Error(result.error?.message || 'Task failed'));
  }
}
```

---

## 10. 测试计划

### 10.1 单元测试

- [ ] NodeManager节点注册测试
- [ ] NodeManager心跳处理测试
- [ ] NodeManager状态管理测试
- [ ] NodeManager负载均衡测试
- [ ] NodeManager任务分发测试
- [ ] NodeManagerLLM代理测试

### 10.2 集成测试

- [ ] 节点注册完整流程测试
- [ ] 心跳超时检测测试
- [ ] 任务分发和执行测试
- [ ] LLM代理请求测试
- [ ] 多节点负载均衡测试

### 10.3 端到端测试

- [ ] Worker节点连接和注册
- [ ] Companion节点连接和注册
- [ ] 任务分发和执行
- [ ] LLM代理请求
- [ ] 节点离线检测

---

## 10. 实施现状与测试（2025-11-08）

### 10.1 已完成内容

- NodeManager 支持节点注册、心跳、状态管理、任务分发（含超时处理），并通过 EventBus 推送 `node_*`、`task_*`、`llm_proxy_*` 事件。
- NodeAwareDistributedServerChannel 拦截 `node_register`、`heartbeat`、`node_unregister`、`llm_request`，与 NodeManager 协同，同时规避与 SDK 私有方法冲突。
- NodeController 暴露节点列表、详情、统计与待执行任务 REST API，并集成后台鉴权。
- `server.ts` 完成 NodeManager 与 AdminPanel Channel 集成，使管理面板可实时接收节点事件。

### 10.2 测试记录

- `npm run build`
- `npm test -- NodeManager`
- `npm test -- node-manager-websocket`
- Postman：登录 `/api/admin/auth/login` 获取 token，调用 `/api/admin/nodes` 系列接口，并在 `ws://.../abp-distributed-server/...` 频道（或兼容路径 `/vcp-distributed-server/...`）完成节点注册、心跳、LLM 代理及注销流程。

### 10.3 未完成事项与风险

- 需要补全 `task_assign` / `task_result` WebSocket 消息链路，闭合任务执行闭环。
- LLM 流式响应与配额控制仍待实现。
- 建议持续完善 Admin 面板对 `node_event` 推送的前端展示与告警策略。

---

## 11. 流式 LLM 响应与配额控制方案

### 11.1 设计目标

1. 支持节点在 `llm_request` 中声明 `stream: true`，Hub 以增量方式返回 `llm_response_stream`，提升交互体验。
2. 为 Hub 侧 LLM 代理提供可配置的速率限制与配额管理，避免资源滥用。
3. 保持向后兼容：不支持流式的请求仍可获得一次性 `llm_response`。

### 11.2 消息协议扩展

#### 11.2.1 请求端（节点 → Hub）

```jsonc
{
  "type": "llm_request",
  "data": {
    "requestId": "req-123",
    "nodeId": "worker-1",
    "model": "gpt-4o-mini",
    "messages": [...],
    "options": {
      "stream": true,
      "temperature": 0.7,
      "...": "..."
    }
  }
}
```

- `options.stream = true` 表示节点期望获得流式响应；省略或为 `false` 时回退到一次性响应。

#### 11.2.2 Hub → 节点（流式片段）

```jsonc
{
  "type": "llm_response_stream",
  "data": {
    "requestId": "req-123",
    "nodeId": "worker-1",
    "chunk": "当前增量文本（可为空用于心跳）",
    "delta": {
      "role": "assistant",
      "content": "纯增量内容，可选"
    },
    "usage": {
      "promptTokens": 123,
      "completionTokens": 5,
      "totalTokens": 128
    },
    "done": false,
    "timestamp": 1700000000000
  }
}
```

- `chunk`：推荐直接返回可展示的文本；`delta` 可选，用于与 OpenAI Stream 对齐。
- `usage`：当服务方支持增量统计时填充；否则仅在结束帧返回。
- `done = true` 的最后一帧：`chunk` 可为空，`usage` 应包含最终统计，并随后发送一次性 `llm_response`（success=true，content为完整内容）或在 Node 端聚合。
- 若调用失败，直接发送一次 `llm_response`（`success: false`，`error.code` 标明原因）。

### 11.3 NodeManager 改动

1. **流式分支**：
   - `handleLLMRequest` 检查 `options.stream`，若为真则调用 `llmClient.chatStream(messages, chatOptions)`。
   - 通过回调 / async iterator 获取 `chunk`，逐条调用 `publishEvent('llm_proxy_stream', ...)` 并委托 WebSocket 通道推送。
   - 维护 `pendingLLMRequests` 的状态，支持 `cancel`（后续扩展）。
2. **配额拦截**：
   - 在发起真实请求前调用 `QuotaManager.checkAndConsume(nodeId, {tokensBudget, requestType: 'llm'})`。
   - 若失败，直接返回 `llm_response` 错误：`{ code: 'quota_exceeded', message: 'Daily token quota exceeded' }`。
3. **事件记录**：
   - 新增事件：`llm_proxy_rate_limited`、`llm_proxy_stream_chunk`、`llm_proxy_stream_completed`。
   - 便于 AdminPanel 和日志系统追踪。

### 11.4 WebSocket 通道改动

1. `NodeAwareDistributedServerChannel` 新增 `sendLLMStreamChunk(ws, payload)` 帮助方法，统一处理 JSON 序列化、异常重试。
2. 连接关闭时，通知 NodeManager 终止对应流（可先记录警告，后续实现真正的取消逻辑）。
3. 当节点不支持流式或处理失败时，通过 `llm_response` 回告，避免请求悬挂。

### 11.5 配额与限流策略

| 维度         | 默认值 (建议)      | 说明 |
|--------------|--------------------|------|
| `maxRequestsPerMinute` | 30             | 每节点每分钟最多 LLM 请求数（含流式）。 |
| `maxTokensPerDay`      | 200_000        | 每节点每日 token 上限，超限后当日拒绝。 |
| `maxConcurrentStreams` | 3              | 允许的并发流式请求数。 |
| `burstMultiplier`      | 2              | 允许瞬时突发的乘数，结合滑动窗口计算。 |

- **数据结构**：`QuotaManager` 维护 `Map<nodeId, NodeQuotaState>`，包含：
  ```ts
  interface NodeQuotaState {
    requestsWindow: SlidingWindowCounter;
    tokensToday: number;
    streamsInFlight: number;
    resetAt: number; // UTC 零点或滚动时间
  }
  ```
- **配置入口**：支持从 `config/runtime.json` 或 `RuntimeConfigService` 动态加载，允许按类型/标签覆写。
- **日志**：限流触发时记录 `logger.warn('[Quota] node worker-1 exceeded maxTokensPerDay (210k > 200k)')`。

### 11.6 节点侧要求

1. 处理多条 `llm_response_stream` 后聚合内容，`done` 为真时收束流程。
2. 若收到 `quota_exceeded`，应根据返回信息实现退避或降级策略。
3. 支持心跳帧（`chunk` 为空）以保持连接活跃。

### 11.7 测试计划

- **单元测试**：
  - `QuotaManager` 速率/配额命中逻辑。
  - NodeManager 流式回调：模拟 3 个 chunk + 完成帧，确保事件与推送顺序正确。
  - 限流拒绝：验证 `quota_exceeded` 响应。
- **集成测试**：
  - 利用伪 LLMClient，模拟流式输出，断言 WebSocket 侧收到多帧 `llm_response_stream`。
  - 测试并发流数量超过阈值的拒绝场景。
- **端到端回归（后续 TODO）**：
  - 前端或节点 Demo 接入，验证 UI 显示与断线恢复。

---

## 12. 风险和注意事项

### 11.1 技术风险

1. **WebSocket连接稳定性**
   - 风险: 网络不稳定导致连接断开
   - 缓解: 实现自动重连机制（节点端）

2. **心跳超时误判**
   - 风险: 网络延迟导致心跳超时误判
   - 缓解: 设置合理的心跳超时时间（90秒），考虑网络延迟

3. **任务分发失败**
   - 风险: 节点在执行任务时离线
   - 缓解: 实现任务重试机制，任务超时处理

### 11.2 性能考虑

1. **心跳检查频率**: 每30秒检查一次，避免过于频繁
2. **节点数量限制**: 支持最多100个节点（可配置）
3. **任务队列**: 如果所有节点都忙碌，任务进入队列等待

### 11.3 安全考虑

1. **节点认证**: 使用VCP_Key进行WebSocket连接认证
2. **任务权限**: 验证节点是否有执行任务的权限
3. **LLM配额**: 限制每个节点的LLM请求频率和配额

---

## 13. 后续扩展

### 12.1 高级功能（Phase 3+）

- [ ] 节点资源监控（CPU、内存、磁盘）
- [ ] 节点健康检查（主动ping节点）
- [ ] 节点自动扩容和缩容
- [ ] 节点分组和标签
- [ ] 任务优先级队列
- [ ] 任务依赖管理

### 12.2 管理界面（Phase 3+）

- [ ] 节点列表页面（实时状态）
- [ ] 节点详情页面（统计信息、日志）
- [ ] 节点操作界面（重启、卸载）
- [ ] 任务监控界面（任务列表、执行状态）

---

## 14. 参考文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 系统架构设计
- [DEVELOPMENT_PRIORITY.md](./DEVELOPMENT_PRIORITY.md) - 开发优先级
- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) - 项目结构

---

**文档维护**: 随着开发进展持续更新  
**负责人**: Apex Bridge Team



