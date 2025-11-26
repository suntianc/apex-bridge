# 多轮思考 (Self-Thinking) API 使用指南

## 概述

ApexBridge 支持多轮思考模式（ReAct模式），基于提示工程的客户端路由 Agent 实现。该模式通过 XML 标签协议（`<thought>`, `<action>`, `<answer>`）实现思考-行动循环，不依赖 Function Calling API，支持跨模型通用（如 DeepSeek、Llama 等开源模型）。

这个功能通过 `selfThinking` 参数在 `/v1/chat/completions` 接口中启用。

## 参数说明

### selfThinking 对象

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | - | 是否启用多轮思考模式（ReAct模式） |
| `maxIterations` | number | 5 | 最大思考循环次数 |
| `includeThoughtsInResponse` | boolean | true | 是否在响应中包含思考过程 |
| `systemPrompt` | string | - | 可注入的基础系统提示词 |
| `additionalPrompts` | string[] | - | 额外的提示词段落（支持多段注入） |
| `tools` | ToolDefinition[] | - | 自定义工具定义 |
| `enableStreamThoughts` | boolean | false | 是否流式输出思考过程（仅流式模式有效） |

#### 关于 `enableStreamThoughts` 参数

`enableStreamThoughts` 控制是否以 SSE 事件的形式流式输出思考过程。该参数**仅在流式模式**（`stream: true`）下生效：

-  **`false`（默认）**  ：不输出思考过程的详细事件。响应仍然包含思考过程（如果 `includeThoughtsInResponse: true`），但只在最终的响应中返回，而不是以流式事件输出

-  **`true`**  ：通过 SSE 事件实时输出思考过程：
  - `event: thought_start` - 思考开始
  - `event: thought` - 思考内容（带 `data._type: 'thought'` 标识）
  - `event: thought_end` - 思考结束
  - `event: action_start` - 工具执行开始
  - `event: observation` - 观察结果
  - `event: answer_start` - 最终答案开始
  - `data: {...}` - 最终答案内容（标准格式）
  - `event: answer_end` - 最终答案结束

**注意**：启用此参数会增加前端处理的复杂度，但能提供更好的用户体验（实时展示AI的思考过程）。

## 性能优化建议

多轮思考模式（ReAct）由于需要进行多次迭代，响应时间会比普通对话更长。以下是一些优化建议：

### 1. 调整迭代次数

`maxIterations` 参数直接影响响应时间：

```javascript
// 快速模式（推荐用于简单问题）
{
  "selfThinking": {
    "enabled": true,
    "maxIterations": 2,  // 最多思考 2 轮
    "includeThoughtsInResponse": true
  }
}

// 标准模式（默认，适合大多数场景）
{
  "selfThinking": {
    "enabled": true,
    "maxIterations": 3,  // 最多思考 3 轮
    "includeThoughtsInResponse": true
  }
}

// 深度模式（适合复杂推理）
{
  "selfThinking": {
    "enabled": true,
    "maxIterations": 5,  // 最多思考 5 轮（默认）
    "includeThoughtsInResponse": true
  }
}
```

**响应时间参考**（假设每次 LLM 调用 2-3 秒）：

| maxIterations | 预估响应时间 | 适用场景 |
|---------------|-------------|----------|
| 2 | 4-6 秒 | 简单问题、快速问答 |
| 3 | 6-9 秒 | 标准推理、大多数场景 |
| 5 | 10-15 秒 | 复杂问题、深度分析 |

### 2. 使用更快的模型

选择响应速度更快的 LLM 模型：

```javascript
{
  "model": "gpt-4-turbo",  // 比 gpt-4 快 30-50%
  "selfThinking": {
    "enabled": true,
    "maxIterations": 3
  }
}
```

### 3. 关闭思考过程输出

如果不需要在响应中包含思考过程，可以关闭以减少 token 消耗：

```javascript
{
  "selfThinking": {
    "enabled": true,
    "maxIterations": 3,
    "includeThoughtsInResponse": false  // 不输出思考过程
  }
}
```

### 4. 流式输出优化体验

使用流式输出可以提升用户体验（响应更快）：

```javascript
{
  "stream": true,  // 启用流式
  "selfThinking": {
    "enabled": true,
    "maxIterations": 3,
    "enableStreamThoughts": false  // 或使用 true 实时展示思考
  }
}
```

### 5. 工具执行优化

- 确保自定义工具响应迅速
- 使用缓存避免重复的工具调用
- 对于耗时工具，考虑异步执行

### 性能 vs 质量的权衡

| 配置 | 响应速度 | 推理质量 | 建议场景 |
|------|---------|---------|----------|
| maxIterations=2 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 快速问答、简单问题 |
| maxIterations=3 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 大多数场景（推荐） |
| maxIterations=5 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 复杂推理、深度分析 |

**提示**：对于生产环境，建议从 `maxIterations: 2` 开始，根据实际需求逐步调整。

### ToolDefinition 接口

| 参数 | 类型 | 说明 |
|------|------|------|
| `name` | string | 工具名称（只能包含字母、数字、下划线） |
| `description` | string | 工具描述 |
| `parameters` | object | 工具参数定义 |

## API 接口列表

### 接口对比

| 功能特性 | 标准接口 `/v1/chat/completions` | 简化接口 `/v1/chat/simple-stream` ⭐ | 会话接口 `/v1/chat/sessions/active` |
|---------|-----------------------------|-----------------------------------|-------------------------------------|
| **多轮思考** | ✅ 支持 | ❌ 不支持 | ❌ 不支持 |
| **ACE引擎** | ✅ 触发轨迹保存 | ❌ 不触发 | ✅ ACE会话管理 |
| **会话管理** | ✅ 完整支持 | ❌ 不支持 | ✅ 会话查询 |
| **流式输出** | ✅ 支持 | ✅ **强制流式** | ❌ 非流式 |
| **参数复杂度** | 🔄 复杂（selfThinking等） | ✅ 简单（基础LLM参数） | ✅ 简单（时间过滤） |
| **响应速度** | 🐌 较慢（多轮推理） | ⚡ 快速（单轮响应） | ⚡ 快速 |
| **适用场景** | 复杂推理任务 | 前端看板娘、简单对话 |

### 1. 标准聊天接口 `/v1/chat/completions`
支持完整的多轮思考和ACE功能的OpenAI兼容接口。

### 2. 简化流式聊天接口 `/v1/chat/simple-stream` ⭐ **新增**
专为前端看板娘设计的简化接口，只支持基本的流式对话，不包含多轮思考和ACE逻辑。

### 3. 会话管理接口 `/v1/chat/sessions/active`
用于查询ACE引擎管理的会话列表，支持获取活跃会话或所有未归档会话。

#### 简化接口特点：
- ✅ **强制流式输出** - 始终返回流式响应
- ✅ **基础LLM参数** - 只支持最常用的参数
- ✅ **API Key认证** - 需要有效的API Key进行访问
- ✅ **请求验证** - 自动验证请求参数格式和安全性
- ❌ **不包含多轮思考** - 不触发ReAct模式
- ❌ **不触发ACE引擎** - 不保存轨迹、不进行自我进化
- ❌ **不进行会话管理** - 每次请求都是独立的
- ❌ **不保存对话历史** - 轻量级，无状态设计

## API 调用示例

### 1. 标准聊天接口（支持多轮思考）

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "请帮我分析这个算法的时间复杂度：for(i=0;i<n;i++) for(j=i;j<n;j++) sum += arr[j];"
      }
    ],
    "model": "gpt-4",
    "selfThinking": {
      "enabled": true,
      "maxIterations": 3,
      "includeThoughtsInResponse": true,
      "systemPrompt": "你是一个专业的算法分析师...",
      "additionalPrompts": [
        "特别关注时间复杂度分析",
        "提供详细的步骤说明"
      ]
    }
  }'
```

### 2. 使用自定义工具

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "解释什么是递归函数，并给出一个斐波那契数列的递归实现"
      }
    ],
    "model": "gpt-4",
      "selfThinking": {
        "enabled": true,
        "maxIterations": 4,
      "includeThoughtsInResponse": false,
      "tools": [
        {
          "name": "query_code_examples",
          "description": "查询代码示例",
          "parameters": {
            "language": "string",
            "topic": "string"
          }
      }
      ]
    }
  }'
```

### 3. 编程语言示例

#### JavaScript/Node.js

```javascript
const response = await fetch('http://localhost:3000/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    messages: [
      { role: 'user', content: '分析这个数学问题的解题步骤：2x + 3 = 7' }
    ],
    model: 'gpt-4',
    selfThinking: {
      enabled: true,
      maxIterations: 2,
      includeThoughtsInResponse: true,
      systemPrompt: '你是一个数学问题解决专家...',
      enableStreamThoughts: true
    }
  })
});

const result = await response.json();
console.log(result.choices[0].message.content);
```

### 2. 简化流式聊天接口（不包含多轮思考）

```bash
curl -X POST http://localhost:3000/v1/chat/simple-stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "你好，请介绍一下你自己"
      }
    ],
    "model": "gpt-4",
    "temperature": 0.7,
    "max_tokens": 1000
  }'
```

#### 简化接口参数说明

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `messages` | array | ✅ | 对话消息数组 |
| `model` | string | ✅ | 模型名称 |
| `temperature` | number | ❌ | 随机性 (0-2) |
| `max_tokens` | number | ❌ | 最大token数 |
| `user` | string | ❌ | 用户标识 |

#### JavaScript/Node.js (简化接口)

```javascript
// 使用简化接口 - 轻量级流式对话
const response = await fetch('http://localhost:3000/v1/chat/simple-stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_API_KEY'
  },
  body: JSON.stringify({
    messages: [
      { role: 'user', content: '你好！' }
    ],
    model: 'gpt-4',
    temperature: 0.7
  })
});

// 处理流式响应
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(new TextDecoder().decode(value));
}
```

#### Python (简化接口)

```python
import requests

# 简化接口 - 只包含基本参数
response = requests.post('http://localhost:3000/v1/chat/simple-stream',
    headers={'Authorization': 'Bearer YOUR_API_KEY'},
    json={
        'messages': [
            {'role': 'user', 'content': '你好，请讲个笑话'}
        ],
        'model': 'gpt-4',
        'temperature': 0.8
    }, stream=True)

for line in response.iter_lines():
    if line:
        print(line.decode('utf-8'))

### 3. 会话管理接口

#### 获取所有有对话历史的会话
```bash
GET /v1/chat/sessions/active?cutoffTime=-1
```

#### 获取最近1小时活跃会话（默认）
```bash
GET /v1/chat/sessions/active
```

#### 获取最近30分钟活跃会话
```bash
GET /v1/chat/sessions/active?cutoffTime=$(($(date +%s)*1000 - 30*60*1000))
```

#### JavaScript获取所有有对话历史的会话
```javascript
// 获取所有有对话历史的会话
const response = await fetch('/v1/chat/sessions/active?cutoffTime=-1', {
  headers: { 'Authorization': 'Bearer YOUR_API_KEY' }
});
const data = await response.json();
console.log(`总共 ${data.total} 个有对话历史的会话`);

// 每个会话返回统一的ACE会话格式
data.sessions.forEach(session => {
  console.log(`会话ID: ${session.sessionId}`);
  console.log(`状态: ${session.status}`);
  console.log(`最后活动: ${new Date(session.lastActivityAt).toLocaleString()}`);
  if (session.metadata?.messageCount) {
    console.log(`消息数量: ${session.metadata.messageCount}`);
  }
});
```

#### Python获取所有有对话历史的会话
```python
import requests

# 获取所有有对话历史的会话
response = requests.get('/v1/chat/sessions/active?cutoffTime=-1', headers={
    'Authorization': 'Bearer YOUR_API_KEY'
})
data = response.json()
print(f"找到 {data['total']} 个有对话历史的会话")

# 显示每个会话的详细信息（统一的ACE会话格式）
for session in data['sessions']:
    print(f"会话ID: {session['sessionId']}")
    print(f"状态: {session['status']}")
    print(f"最后活动: {session['lastActivityAt']}")
    if session.get('metadata') and session['metadata'].get('messageCount'):
        print(f"消息数量: {session['metadata']['messageCount']}")
```
```

#### Python

```python
import requests

response = requests.post('http://localhost:3000/v1/chat/completions', json={
    'messages': [
        {'role': 'user', 'content': '设计一个简单的用户管理系统的数据模型'}
    ],
    'model': 'gpt-4',
    'selfThinking': {
        'enabled': True,
        'maxIterations': 3,
        'includeThoughtsInResponse': True,
        'systemPrompt': '你是一个系统设计专家...',
        'additionalPrompts': ['关注可扩展性', '考虑性能优化']
    }
})

result = response.json()
print(result['choices'][0]['message']['content'])
```

## 响应格式

### 启用思考过程的响应

```json
{
  "id": "chatcmpl-1234567890",
  "object": "chat.completion",
  "created": 1703123456,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "\n[思考步骤 1]\nAI分析: 用户问的是时间复杂度问题。我需要识别出这是一个双重循环...\n\n[思考步骤 2]\nAI分析: 外层循环i从0到n-1，内层循环j从i到n-1。这看起来像是求解一个算法的时间复杂度...\n\n[思考步骤 3]\n最终答案: 这个算法的时间复杂度是O(n²)，因为有两个嵌套的循环，每个都与n相关..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 300,
    "total_tokens": 450
  }
}
```

### 不包含思考过程的响应

```json
{
  "id": "chatcmpl-1234567891",
  "object": "chat.completion",
  "created": 1703123457,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "这个算法的时间复杂度是O(n²)，因为它使用了双重嵌套循环。外层循环执行n次，内层循环平均执行n/2次，所以总的时间复杂度为O(n²)。"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 200,
    "total_tokens": 350
  }
}
```

## ReAct 模式工作原理

ReAct 模式通过 XML 标签协议实现思考-行动循环：

1. **思考阶段**：LLM 输出 `<thought>...</thought>` 标签，记录推理过程
2. **行动阶段**：如果需要调用工具，输出 `<action name="工具名">{"参数"}</action>` 标签
3. **观察阶段**：系统执行工具并返回结果，作为观察反馈给 LLM
4. **完成阶段**：当任务完成时，输出 `<answer>...</answer>` 标签

### 默认工具

系统提供以下默认工具：

- `query_database`: 查询业务数据库
- `fetch_user_profile`: 获取用户画像信息
- `calculate_risk`: 计算风险评分

### 自定义工具

可以通过 `tools` 参数定义自定义工具，工具执行逻辑由后端实现。

## 注意事项

1. **性能考虑**: 多轮思考会增加响应时间，因为需要进行多次LLM调用
2. **成本控制**: 合理设置 `maxIterations` 避免过度消耗
3. **任务复杂度**: 对于简单问题，建议不启用多轮思考；对于复杂推理任务，推荐启用
4. **提示词注入**: 支持通过 `systemPrompt` 和 `additionalPrompts` 多段注入提示词，方便灵活配置
5. **工具调用**: 工具调用通过 XML 标签协议实现，不依赖 Function Calling API，支持跨模型通用
6. **思考链可视化**: 启用 `enableStreamThoughts` 可以实时流式输出思考过程，提升用户体验

## 错误处理

如果多轮思考过程中发生错误，系统会：
1. 记录错误日志
2. 返回最后一次成功的思考结果
3. 在响应中包含错误信息（如果启用了思考过程显示）
