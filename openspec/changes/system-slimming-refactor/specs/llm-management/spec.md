# LLM管理器重构规范

## 变更类型
`MODIFIED`

## 变更范围
- 模块：`core/LLMClient.ts` → `core/LLMManager.ts`（重命名+增强）
- 影响：`services/ChatService.ts`、`api/controllers/chat-controller.ts`
- 配置：`config/*.yml`（LLM 配置项保持不变）

## 目标
将 LLM 客户端从简单的适配器升级为全功能的管理器，提供健康检查、负载均衡和故障转移能力，提升系统稳定性和可用性。

## MODIFIED Requirements

### 能力 1：健康检查

#### 场景：检测多个 LLM 提供商的可用性

**Given** 系统配置了多个 LLM 提供商（OpenAI、DeepSeek、Claude、Ollama 等）
**When** 调用 `llmManager.healthCheck()`
**Then** 系统应返回所有提供商的健康状态，包括：
- provider 名称
- status（healthy/degraded/down）
- latency（响应延迟）
- lastError（如果有错误）

**示例：**
```typescript
const health = await llmManager.healthCheck();
// 返回:
// [
//   { provider: 'openai', status: 'healthy', latency: 120 },
//   { provider: 'deepseek', status: 'down', latency: 5000, lastError: 'Timeout' }
// ]
```

**Given** 指定特定提供商
**When** 调用 `llmManager.healthCheck('openai')`
**Then** 只返回该提供商的健康状态

### 能力 2：智能提供商选择

#### 场景：根据模型名称自动选择提供商

**Given** 用户请求使用模型 "gpt-4o-mini"
**When** 调用 `llmManager.switchProvider('gpt-4o-mini')`
**Then** 系统应根据模型前缀自动选择提供商：
- `gpt-*` → 'openai'
- `deepseek-*` → 'deepseek'
- `claude-*` → 'claude'
- `llama*`, `qwen*`, `mistral*` → 'ollama'

**Given** 模型无法匹配任何规则
**When** 调用 `llmManager.switchProvider('unknown-model')`
**Then** 返回配置的默认提供商

### 能力 3：负载均衡

#### 场景：在多个健康提供商间分发请求

**Given** 提供商列表 ['openai', 'deepseek', 'claude']
**And** 所有提供商都处于 healthy 状态
**When** 多次调用 `llmManager.loadBalance(['openai', 'deepseek'], messages, options)`
**Then** 请求应均匀分发到各个提供商（轮询或随机算法）

**Given** 某个提供商处于 down 状态
**When** 调用负载均衡
**Then** 自动跳过 down 的提供商，只使用 healthy 的提供商

### 能力 4：故障转移链

#### 场景：按优先级尝试多个提供商

**Given** 提供商优先级列表 ['openai', 'deepseek', 'claude']
**When** 调用 `llmManager.fallbackChain(['openai', 'deepseek', 'claude'], messages, options)`
**Then** 系统应按顺序尝试：
1. 首先尝试 'openai'
2. 如果失败，尝试 'deepseek'
3. 如果失败，尝试 'claude'
4. 如果全部失败，抛出错误

**示例：**
```typescript
try {
  const response = await llmManager.fallbackChain(
    ['openai', 'deepseek', 'claude'],
    messages,
    { model: 'gpt-4o-mini' }
  );
  // 使用第一个成功的响应
} catch (error) {
  // 所有提供商都失败
}
```

### 能力 5：性能指标监控

#### 场景：获取提供商使用统计

**Given** 系统运行一段时间，有多个 LLM 请求
**When** 调用 `llmManager.getProviderMetrics()`
**Then** 返回每个提供商的统计信息：
- provider 名称
- requests（请求次数）
- errors（错误次数）
- avgLatency（平均延迟）
- costPer1K（估算的每千次成本）

## 兼容性要求

### 场景：保持向后兼容

**Given** 现有代码使用 `llmClient.chat()` 和 `llmClient.streamChat()`
**When** 升级到 LLMManager
**Then** 原有接口应保持不变，无需修改调用代码

### ADDED Requirements

#### 场景：定期健康监控

**Given** 生产环境部署
**When** 配置定时任务每 30 秒执行健康检查
**Then** 系统应记录健康状态到日志
**And** 可用于监控面板展示

**示例代码：**
```typescript
setInterval(async () => {
  const health = await llmManager.healthCheck();
  logger.info('🏥 LLM Health Check:', health);
}, 30000);
```

## 技术方案

### 文件变更

```
src/core/
├── LLMClient.ts → LLMManager.ts（重命名 + 增强）
└── types/llm.ts（可能需要新增类型定义）
```

### 接口定义

```typescript
// src/core/types/llm.ts

export interface ProviderHealth {
  provider: string;
  status: 'healthy' | 'degraded' | 'down';
  latency: number;
  lastError?: string;
}

export interface ProviderMetrics {
  provider: string;
  requests: number;
  errors: number;
  avgLatency: number;
  costPer1K: number;
}

// src/core/LLMManager.ts

export class LLMManager {
  // 原有接口（保持不变）
  async chat(messages: Message[], options: ChatOptions): Promise<LLMResponse>;
  async *streamChat(messages: Message[], options: ChatOptions, signal?: AbortSignal): AsyncIterableIterator<string>;
  async getAllModels(): Promise<Array<{id: string, provider: string}>>;

  // 新增接口
  async healthCheck(provider?: string): Promise<ProviderHealth[]>;
  async switchProvider(model: string): Promise<string>;
  async loadBalance(providers: string[], messages: Message[], options: ChatOptions): Promise<LLMResponse>;
  async fallbackChain(providers: string[], messages: Message[], options: ChatOptions): Promise<LLMResponse>;
  async getProviderMetrics(): Promise<ProviderMetrics[]>;
}
```

### 实现细节

1. **健康检查**：调用每个提供商的 `getModels()` 端点，测量响应时间
2. **负载均衡**：使用轮询或随机算法选择 healthy 提供商
3. **故障转移**：使用 for+try/catch 循环实现顺序尝试
4. **性能指标**：在每次请求时记录统计信息到内存（或可选的外部存储）

### 配置示例

```yaml
llm:
  defaultProvider: 'openai'  # 默认提供商
  healthCheck:
    enabled: true
    interval: 30000  # 健康检查间隔（毫秒）
  loadBalance:
    enabled: false
    strategy: 'round-robin'  # 轮询或 random
  fallback:
    enabled: true
    chain: ['openai', 'deepseek', 'claude']  # 故障转移顺序

  # 提供商配置（保持不变）
  openai:
    baseURL: 'https://api.openai.com/v1'
    apiKey: '${OPENAI_API_KEY}'
    defaultModel: 'gpt-4o-mini'

  deepseek:
    baseURL: 'https://api.deepseek.com/v1'
    apiKey: '${DEEPSEEK_API_KEY}'
    defaultModel: 'deepseek-chat'
```

## 测试策略

### 单元测试

1. **健康检查测试**
   - 测试单个提供商健康检查
   - 测试多个提供商健康检查
   - 测试超时和错误处理

2. **负载均衡测试**
   - 测试请求分发均匀性
   - 测试跳过 down 提供商
   - 测试无可用提供商错误

3. **故障转移测试**
   - 测试顺序尝试机制
   - 测试首次成功停止
   - 测试全部失败错误

4. **指标测试**
   - 测试请求计数
   - 测试错误计数
   - 测试延迟计算

### 集成测试

1. **完整请求流程**
   - 配置多个提供商
   - 发送对话请求
   - 验证健康检查、负载均衡、故障转移协同工作

2. **生产场景模拟**
   - 模拟提供商故障
   - 验证自动切换到备用提供商
   - 验证服务不中断

## 性能影响

### 正面影响

1. **提升可用性**：故障转移减少服务中断
2. **负载分发**：防止单个提供商过载
3. **成本控制**：可选择成本更低的提供商

### 潜在负面影响

1. **健康检查开销**：定期健康检查增加少量网络请求
   - 缓解：可配置检查间隔，或按需检查

2. **故障转移延迟**：首次请求失败后才尝试备用
   - 缓解：健康检查提前发现故障，路由到健康节点

### 性能目标

- 健康检查响应时间：`< 200ms`
- 故障转移延迟：`< 1s`（当主提供商故障时）
- 负载均衡额外开销：`< 10ms`

## 相关任务

- [ ] 重命名 LLMClient.ts → LLMManager.ts
- [ ] 新增 ProviderHealth 和 ProviderMetrics 接口
- [ ] 实现 healthCheck() 方法
- [ ] 实现 switchProvider() 方法
- [ ] 实现 loadBalance() 方法
- [ ] 实现 fallbackChain() 方法
- [ ] 实现 getProviderMetrics() 方法
- [ ] 更新 ChatService 以使用 LLMManager（如果不兼容）
- [ ] 添加 LLM 管理配置到配置文件
- [ ] 编写单元测试
- [ ] 编写集成测试
- [ ] 更新 API 文档
- [ ] 性能基准测试
