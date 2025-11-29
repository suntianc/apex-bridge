# ReAct 引擎实现详细 TodoList

> 基于极简方案（纯 AsyncGenerator，无事件队列和任务池）
> 总计约 180 行核心代码

---

## 📋 任务总览

**总任务数**: 12 项
**预计总耗时**: 6-8 小时
**核心代码行数**: ~180 行
**测试代码行数**: ~250 行

---

## 🎯 Phase 1: 核心引擎实现

### 任务 1.1: 创建 ReAct 引擎核心文件和类型定义
**优先级**: 🔴 **高**
**预计耗时**: 45 分钟
**涉及文件**:
- `src/core/react/ReActEngine.ts` (新建)
- `src/types/react.ts` (新建)

**实现内容**:
```typescript
// src/types/react.ts
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (args: any) => Promise<any>;
}

export interface ReActOptions {
  maxIterations?: number;
  timeout?: number;
  enableThink?: boolean;
}

export interface StreamEvent {
  type: 'reasoning' | 'content' | 'tool_start' | 'tool_end' | 'error' | 'done';
  data: any;
  timestamp: number;
}
```

**关键实现点**:
- ✅ 定义 Tool 接口（工具标准）
- ✅ 定义 ReActOptions 配置接口
- ✅ 定义 StreamEvent 事件类型
- ✅ 添加 JSDoc 注释说明

**自测验证**:
- [ ] TypeScript 编译通过
- [ ] 类型检查无错误

---

### 任务 1.2: 实现 LLM 适配器的流式聊天接口
**优先级**: 🔴 **高**
**预计耗时**: 60 分钟
**涉及文件**:
- `src/core/llm/adapters/BaseAdapter.ts` (修改)
- `src/core/llm/LLMManager.ts` (修改)

**实现内容**:
```typescript
// 在 BaseAdapter 中添加 streamChatWithTools 方法
interface ChatOptionsWithTools extends ChatOptions {
  tools?: any[];
  enableThink?: boolean;
}

async *streamChatWithTools(
  messages: Message[],
  options: ChatOptionsWithTools,
  signal?: AbortSignal
): AsyncGenerator<any> {
  // 调用 OpenAI 兼容 API 的 stream
  // 处理 SSE 解析
  // yield 原始 chunk
}
```

**关键实现点**:
- ✅ 支持 `tools` 参数传递
- ✅ 支持 `enableThink` 启用思考输出
- ✅ 正确处理 SSE 流式响应
- ✅ 保持 `responseType: 'stream'`

**自测验证**:
- [ ] 流式响应正常接收
- [ ] 能收到 reasoning_content
- [ ] 能收到 tool_calls

---

### 任务 1.3: 更新 BaseAdapter 支持 tool_calls 和 reasoning_content
**优先级**: 🔴 **高**
**预计耗时**: 40 分钟
**涉及文件**:
- `src/core/llm/adapters/BaseAdapter.ts` (修改)

**实现内容**:
```typescript
// 在 buildRequestBody 中添加 tools
if (options.tools) {
  requestBody.tools = options.tools;
}

// 在 streamChat 解析时提取 reasoning_content 和 tool_calls
for await (const chunk of response.data) {
  const lines = chunk.toString().split('\n').filter((line: string) => line.trim());

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.substring(6);
      if (data === '[DONE]') return;

      try {
        const parsed = JSON.parse(data);

        // 提取 reasoning_content
        const reasoning = parsed.choices?.[0]?.delta?.reasoning_content;

        // 提取 content
        const content = parsed.choices?.[0]?.delta?.content;

        // 提取 tool_calls
        const toolCalls = parsed.choices?.[0]?.delta?.tool_calls;

        yield {
          reasoning_content: reasoning,
          content: content,
          tool_calls: toolCalls
        };
      } catch (e) {
        // ignore parse errors
      }
    }
  }
}
```

**关键实现点**:
- ✅ SSE 解析时提取 reasoning_content
- ✅ SSE 解析时提取 tool_calls
- ✅ 保持向后兼容

**自测验证**:
- [ ] reasoning_content 正确解析
- [ ] tool_calls 正确累积
- [ ] 普通聊天不受影响

---

### 任务 1.4: 创建工具接口和示例工具
**优先级**: 🟡 **中**
**预计耗时**: 50 分钟
**涉及文件**:
- `src/core/react/tools/date.ts` (新建)
- `src/core/react/tools/web-search.ts` (新建)
- `src/core/react/tools/index.ts` (新建)

**实现内容**:
```typescript
// src/core/react/tools/date.ts
export const dateTool: Tool = {
  name: 'get_current_date',
  description: '获取当前日期和时间',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  execute: async () => {
    return new Date().toISOString();
  }
};

// src/core/react/tools/web-search.ts
export const webSearchTool: Tool = {
  name: 'web_search',
  description: '搜索互联网信息',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词' }
    },
    required: ['query']
  },
  execute: async (args) => {
    // 调用搜索 API
    const results = await searchAPI.search(args.query);
    return results;
  }
};
```

**关键实现点**:
- ✅ 提供标准工具示例
- ✅ 参数定义符合 OpenAI Tool 规范
- ✅ execute 方法返回 Promise

**自测验证**:
- [ ] 工具能正确执行
- [ ] 参数验证正常工作

---

### 任务 1.5: 实现工具调用的合并逻辑
**优先级**: 🔴 **高**
**预计耗时**: 35 分钟
**涉及文件**:
- `src/core/react/ReActEngine.ts` (修改)

**实现内容**:
```typescript
/**
 * 合并工具调用（SSE 分片传输时需要累积）
 */
private mergeToolCalls(existing: any[], newCalls: any[]): any[] {
  const merged = [...existing];

  for (const newCall of newCalls) {
    const index = newCall.index;

    if (!merged[index]) {
      merged[index] = newCall;
    } else {
      // 合并 function.arguments（累积 JSON 字符串）
      if (newCall.function?.arguments) {
        merged[index].function.arguments += newCall.function.arguments;
      }
    }
  }

  return merged;
}
```

**关键实现点**:
- ✅ 按 index 累积 tool_calls
- ✅ 合并 function.arguments 字符串
- ✅ 确保 JSON 完整

**自测验证**:
- [ ] 分片 tool_calls 能正确合并
- [ ] 完整的 JSON 参数能正确解析

---

### 任务 1.6: 添加 ReAct 迭代次数和超时控制
**优先级**: 🟡 **中**
**预计耗时**: 30 分钟
**涉及文件**:
- `src/core/react/ReActEngine.ts` (修改)

**实现内容**:
```typescript
// 迭代次数控制
const maxIterations = options.maxIterations || 10;
const timeout = options.timeout || 300000; // 5 分钟

const startTime = Date.now();

for (let iteration = 0; iteration < maxIterations; iteration++) {
  // 检查超时
  if (Date.now() - startTime > timeout) {
    yield {
      type: 'error',
      data: { message: 'ReAct execution timeout' },
      timestamp: Date.now()
    };
    throw new Error('ReAct execution timeout');
  }

  // ... 迭代逻辑
}
```

**关键实现点**:
- ✅ maxIterations 参数限制迭代次数
- ✅ timeout 参数控制总执行时间
- ✅ 超时后抛出错误并停止

**自测验证**:
- [ ] 达到 maxIterations 时正确停止
- [ ] 超时时正确中断

---

## 🎨 Phase 2: 前端集成

### 任务 2.1: 创建前端流式消费示例代码
**优先级**: 🔵 **低**
**预计耗时**: 40 分钟
**涉及文件**:
- `examples/react-client.ts` (新建)
- `examples/react-browser.html` (新建)

**实现内容**:
```typescript
// examples/react-client.ts
async function runConversation() {
  const tools = [dateTool, webSearchTool];
  const reactEngine = new ReActEngine(tools);

  const messages = [{
    role: 'user',
    content: '今天北京天气如何？'
  }];

  const llmClient = new OpenAIAdapter({
    apiKey: process.env.GLM_API_KEY,
    baseURL: 'https://open.bigmodel.cn/api/paas/v4'
  });

  // 直接读取生成器事件
  const stream = reactEngine.execute(messages, llmClient, {
    maxIterations: 10,
    enableThink: true
  });

  for await (const event of stream) {
    switch (event.type) {
      case 'reasoning':
        console.log('思考中:', event.data.content);
        break;

      case 'content':
        console.log('回答:', event.data.content);
        break;

      case 'tool_start':
        console.log('执行工具:', event.data.toolName);
        break;

      case 'tool_end':
        console.log('工具结果:', event.data.result);
        break;
    }
  }
}
```

**关键实现点**:
- ✅ 提供 Node.js 示例
- ✅ 提供浏览器示例
- ✅ 展示完整的事件处理流程

**自测验证**:
- [ ] Node.js 示例能正常运行
- [ ] 浏览器示例能正常显示流式输出

---

### 任务 2.2: 添加错误处理和工具执行失败容错
**优先级**: 🟡 **中**
**预计耗时**: 35 分钟
**涉及文件**:
- `src/core/react/ReActEngine.ts` (修改)

**实现内容**:
```typescript
try {
  const result = await tool.execute(args);
} catch (error) {
  logger.error(`❌ Tool execution failed: ${toolName}`, error);

  // 错误回流到 LLM
  messages.push({
    role: 'tool',
    tool_call_id: toolCall.id,
    name: toolName,
    content: JSON.stringify({ error: error.message })
  });

  yield {
    type: 'error',
    data: {
      message: `Tool ${toolName} failed: ${error.message}`
    },
    timestamp: Date.now()
  };

  // 继续执行（不中断整个流程）
  yield* this.execute(messages, llmClient, options);
}
```

**关键实现点**:
- ✅ 工具执行错误被捕获
- ✅ 错误信息回流到 LLM
- ✅ 流程继续执行（不中断）
- ✅ 前端收到错误通知

**自测验证**:
- [ ] 工具执行失败时流程不中断
- [ ] 错误信息能正确回流

---

## 🧪 Phase 3: 测试验证

### 任务 3.1: 编写 ReAct 引擎单元测试
**优先级**: 🔴 **高**
**预计耗时**: 60 分钟
**涉及文件**:
- `tests/core/react/ReActEngine.test.ts` (新建)

**测试用例**:
```typescript
describe('ReActEngine', () => {
  // 测试 1: 基本聊天（无工具调用）
  test('should handle basic chat without tools', async () => {
    const engine = new ReActEngine([]);
    const events = [];

    for await (const event of engine.execute(messages, mockLLMClient)) {
      events.push(event);
    }

    expect(events.some(e => e.type === 'content')).toBe(true);
    expect(events.some(e => e.type === 'done')).toBe(true);
  });

  // 测试 2: 单工具调用
  test('should execute single tool call', async () => {
    const tools = [dateTool];
    const engine = new ReActEngine(tools);
    const events = [];

    for await (const event of engine.execute(messages, mockLLMClient)) {
      events.push(event);
    }

    expect(events.some(e => e.type === 'tool_start')).toBe(true);
    expect(events.some(e => e.type === 'tool_end')).toBe(true);
    expect(events.some(e => e.type === 'content')).toBe(true);
  });

  // 测试 3: 多工具调用
  test('should handle multiple tool calls', async () => {
    const tools = [dateTool, weatherTool];
    const engine = new ReActEngine(tools);

    // ...
  });

  // 测试 4: 工具执行失败
  test('should handle tool execution failure', async () => {
    const brokenTool = {
      ...dateTool,
      execute: async () => { throw new Error('Tool failed'); }
    };

    const engine = new ReActEngine([brokenTool]);

    // 验证错误被捕获且流程继续
  });

  // 测试 5: maxIterations 限制
  test('should respect maxIterations limit', async () => {
    const engine = new ReActEngine([loopTool]);

    // 验证迭代次数限制
  });
});
```

**关键实现点**:
- ✅ Mock LLM 客户端（返回可预测的流）
- ✅ 覆盖所有事件类型
- ✅ 测试工具执行成功和失败
- ✅ 测试迭代次数限制

**自测验证**:
- [ ] 所有测试用例通过
- [ ] 代码覆盖率 > 80%

---

### 任务 3.2: 创建集成测试脚本
**优先级**: 🟡 **中**
**预计耗时**: 45 分钟
**涉及文件**:
- `tests/integration/react-e2e.test.ts` (新建)
- `scripts/test-react.ts` (新建)

**测试场景**:
```typescript
// 场景 1: 天气查询（需要 web_search）
const messages = [{
  role: 'user',
  content: '今天北京天气如何？'
}];

// 场景 2: 日期计算
const messages = [{
  role: 'user',
  content: '今天日期是多少？'
}];

// 场景 3: 多轮工具调用
const messages = [{
  role: 'user',
  content: '今天北京天气如何？现在几点了？'
}];
```

**关键实现点**:
- ✅ 使用真实 LLM API（GLM）
- ✅ 验证完整流程
- ✅ 性能测试（测量响应时间）
- ✅ 压力测试（连续多次调用）

**自测验证**:
- [ ] 端到端流程正常工作
- [ ] 性能指标达到预期

---

## 📚 Phase 4: 文档与监控

### 任务 4.1: 编写 ReAct 使用文档
**优先级**: 🟢 **低**
**预计耗时**: 50 分钟
**涉及文件**:
- `docs/react-integration.md` (新建)

**文档内容**:
- 架构概述
- 快速开始
- API 参考
- 工具定义指南
- 前端集成示例
- 常见问题

**关键实现点**:
- ✅ 清晰的架构图
- ✅ 完整的使用示例
- ✅ 常见问题解答
- ✅ 最佳实践建议

---

### 任务 4.2: 添加性能监控和日志记录
**优先级**: 🟢 **低**
**预计耗时**: 30 分钟
**涉及文件**:
- `src/core/react/ReActEngine.ts` (修改)

**实现内容**:
```typescript
// 在关键节点添加日志
logger.debug(`🔄 ReAct iteration ${iteration + 1}/${maxIterations}`);
logger.info(`🔧 Executing tool: ${toolName}`, args);
logger.info(`✅ Tool executed: ${toolName}`, { result });
logger.error(`❌ Tool execution failed: ${toolName}`, error);
```

**关键实现点**:
- ✅ 迭代次数日志
- ✅ 工具执行开始/结束日志
- ✅ 错误日志
- ✅ 性能指标（响应时间）

**自测验证**:
- [ ] 日志输出完整且有用
- [ ] 性能指标可追踪

---

## 📊 总结

### 工作量统计
| 阶段 | 任务数 | 预计耗时 |
|------|--------|----------|
| Phase 1: 核心引擎 | 6 项 | 4 小时 |
| Phase 2: 前端集成 | 2 项 | 1.25 小时 |
| Phase 3: 测试验证 | 2 项 | 1.75 小时 |
| Phase 4: 文档监控 | 2 项 | 1.25 小时 |
| **总计** | **12 项** | **8.25 小时** |

### 关键里程碑
1. **M1** (2 小时): 基础 ReAct 引擎可运行，支持 reasoning 和 content 输出
2. **M2** (4 小时): 工具调用完整实现，支持 tool_start/tool_end 事件
3. **M3** (6 小时): 所有测试通过，错误处理完善
4. **M4** (8 小时): 文档完成，性能监控到位

### 风险与应对
| 风险 | 可能性 | 应对措施 |
|------|--------|----------|
| tool_calls 分片合并失败 | 中 | 添加单元测试，验证各种分片场景 |
| 递归调用导致深度过大 | 低 | 设置合理的 maxIterations（10） |
| 超时控制不精确 | 低 | 使用 Date.now() 精确计时 |
| 真实 LLM 流式解析异常 | 中 | 准备 Mock 数据，隔离测试 |

---

**Ready to start!** 🚀
