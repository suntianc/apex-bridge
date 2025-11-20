# 🧠 自我思考循环（ReAct模式）实现指南

> 为 ApexBridge 添加自我思考直到完成任务的能力
>
> 实现类似 AutoGPT、BabyAGI 的自主任务执行循环

---

## 📋 实现概览

本指南帮助你为 ApexBridge 实现 **自我思考循环**（Self-Thinking Loop），也称为 **ReAct模式**（Reasoning + Acting），让 AI 能够：

1. **思考**（Reason）：分析当前任务状态
2. **行动**（Act）：调用工具获取信息或执行操作
3. **观察**（Observe）：检查工具执行结果
4. **循环**（Loop）：重复直到任务完成

---

## 🎯 核心组件

### 1. TaskEvaluator（已实现 ✅）

**文件**：`src/core/TaskEvaluator.ts`

**职责**：评估任务是否完成

**关键特性**：
- 支持最大循环次数限制（防无限循环）
- 可配置的任务完成评估提示
- 提供快速评估（轻量级）和完整评估（调用LLM）

```typescript
const evaluation = await taskEvaluator.evaluate(
  messages,      // 完整对话历史
  userQuery,     // 用户原始查询
  currentIteration  // 当前循环次数
);

// evaluation.isComplete -> 任务是否完成
// evaluation.reasoning -> 评估推理
// evaluation.needsMoreWork -> 是否需要继续工作
```

---

### 2. 增强的 ChatService（需实现）

**文件**：`src/services/ChatService.ts`

**关键改动点**：

#### a. 导入 TaskEvaluator

```typescript
import { TaskEvaluator } from '../core/TaskEvaluator';
```

#### b. 添加私有属性

```typescript
export class ChatService {
  private taskEvaluator?: TaskEvaluator;
  // ... 其他属性
}
```

#### c. 增强 processMessage 方法

```typescript
async processMessage(messages: Message[], options: ChatOptions = {}): Promise<any> {
  // 🆕 检查是否启用自我思考循环
  if (options.selfThinking?.enabled) {
    return this.processMessageWithSelfThinking(messages, options);
  }

  // 原有的单次逻辑
  // ... 现有代码 ...
}
```

#### d. 实现自我思考循环

```typescript
/**
 * 自我思考循环（ReAct模式）
 *
 * 循环执行以下步骤：
 * 1. 调用 LLM 获取响应
 * 2. 解析工具调用并执行
 * 3. 评估任务是否完成
 * 4. 如果未完成，继续循环
 * 5. 返回最终结果
 */
private async processMessageWithSelfThinking(
  messages: Message[],
  options: ChatOptions
): Promise<any> {
  const startTime = Date.now();
  const maxDuration = options.loopTimeout || 300000; // 5分钟
  const maxIterations = options.selfThinking?.maxIterations || 5;
  const enableTaskEvaluation = options.selfThinking?.enableTaskEvaluation ?? true;
  const includeThoughtsInResponse = options.selfThinking?.includeThoughtsInResponse ?? true;

  // 获取用户原始查询（第一条用户消息）
  const userQuery = messages.find(msg => msg.role === 'user')?.content || '';

  let iteration = 0;
  let currentMessages = [...messages];
  let finalResult: any = null;
  const thinkingProcess: string[] = []; // 记录思考过程

  // 初始化 TaskEvaluator
  this.taskEvaluator = new TaskEvaluator({
    maxIterations,
    completionPrompt: options.selfThinking?.completionPrompt
  });

  logger.info(`🧠 Starting Self-Thinking Loop (max: ${maxIterations} iterations)`);

  while (iteration < maxIterations) {
    iteration++;

    logger.info(`\n🔄 [Self-Thinking Loop Iteration ${iteration}/${maxIterations}]`);

    // 检查超时
    if (Date.now() - startTime > maxDuration) {
      logger.warn(`⚠️ Self-thinking loop timeout (${maxDuration}ms) reached`);
      thinkingProcess.push(`[系统警告] 达到最大超时时间，停止循环`);
      break;
    }

    // 步骤 1: 调用 LLM
    logger.debug('🤖 Calling LLM...');
    const llmClient = await this.requireLLMClient();
    const llmResponse = await llmClient.chat(currentMessages, options);
    const aiContent = llmResponse.choices[0]?.message?.content || '';

    logger.debug(`📝 LLM Response: ${aiContent.substring(0, 200)}...`);

    // 记录思考过程
    thinkingProcess.push(`\n[思考步骤 ${iteration}]`);
    thinkingProcess.push(`AI分析: ${aiContent}`);

    // 步骤 2: 解析工具调用
    const toolRequests = this.protocolEngine.parseToolRequests(aiContent);

    if (toolRequests.length === 0) {
      // 没有工具调用，认为任务已经完成
      logger.debug('ℹ️ No tool calls detected, marking as complete');
      finalResult = {
        content: aiContent,
        toolCalls: [],
        toolResults: [],
        iterations: iteration,
        thinkingProcess: includeThoughtsInResponse ? thinkingProcess.join('\n') : undefined
      };
      break;
    }

    logger.debug(`🔧 Detected ${toolRequests.length} tool calls`);

    // 步骤 3: 执行工具
    thinkingProcess.push(`识别到 ${toolRequests.length} 个工具调用`);

    const toolResults = await Promise.all(
      toolRequests.map(async (tool) => {
        logger.debug(`⚙️ Executing tool: ${tool.name}`);
        const result = await this.executeTool(tool);

        if (result.error) {
          logger.error(`❌ Tool failed: ${tool.name} -> ${result.error}`);
          thinkingProcess.push(`工具 "${tool.name}" 执行失败: ${result.error}`);
        } else {
          logger.debug(`✅ Tool executed: ${tool.name}`);
          thinkingProcess.push(`工具 "${tool.name}" 执行成功`);
        }

        // 格式化结果用于AI理解
        const formattedResult = this.formatToolResultEntries([result]).join('\n\n');
        return {
          tool: tool.name,
          result: result,
          formatted: formattedResult
        };
      })
    );

    // 步骤 4: 评估任务是否完成
    if (enableTaskEvaluation) {
      logger.debug('🧠 Evaluating task completion...');

      // 构建评估用的消息历史
      const evalMessages = [
        ...currentMessages,
        { role: 'assistant', content: aiContent },
        {
          role: 'user',
          content: toolResults.map(r => r.formatted).join('\n\n')
        }
      ];

      // 注意：这里需要在 TaskEvaluator 中传入 LLMClient 进行评估
      // 简化版本：基于是否有工具调用来做快速判断
      const quickEval = this.taskEvaluator.quickEvaluate(evalMessages);

      if (quickEval.isLikelyComplete || iteration >= maxIterations) {
        logger.info(`✅ Task appears complete after ${iteration} iterations`);

        // 生成最终回答
        const finalMessages = [
          ...evalMessages,
          {
            role: 'system',
            content: '基于以上所有步骤和工具执行结果，请给出最终回答。如果任务已完成，请总结结果。'
          }
        ];

        const finalResponse = await llmClient.chat(finalMessages, options);
        const finalContent = finalResponse.choices[0]?.message?.content || '';

        finalResult = {
          content: finalContent,
          toolCalls: toolRequests,
          toolResults: toolResults.map(r => ({ tool: r.tool, result: r.result })),
          iterations: iteration,
          thinkingProcess: includeThoughtsInResponse ? thinkingProcess.join('\n') : undefined
        };

        break;
      }
    }

    // 步骤 5: 准备下一轮循环的消息
    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: aiContent },
      {
        role: 'user',
        content: '观察结果:\n' + toolResults.map(r => r.formatted).join('\n\n') +
                '\n\n请基于以上结果，继续完成任务。'
      }
    ];

    // 清理：保持上下文大小可控
    if (currentMessages.length > 50) {
      logger.warn(`⚠️ 消息历史过长(${currentMessages.length}条)，可能影响性能`);
    }
  }

  if (!finalResult) {
    // 如果循环结束但没有生成结果，返回最后一条消息
    logger.warn(`⚠️ Self-thinking loop ended without clear result`);

    const llmClient = await this.requireLLMClient();
    const llmResponse = await llmClient.chat(currentMessages, options);
    const aiContent = llmResponse.choices[0]?.message?.content || '';

    finalResult = {
      content: aiContent,
      toolCalls: [],
      toolResults: [],
      iterations: iteration,
      thinkingProcess: includeThoughtsInResponse ? thinkingProcess.join('\n') : undefined
    };
  }

  logger.info(`✅ Self-thinking loop completed in ${iteration} iterations`);

  return finalResult;
}
```

---

### 3. 创建新的 API 端点

**文件**：`src/api/controllers/SelfThinkingController.ts`（新建）

```typescript
import { Request, Response } from 'express';
import { ChatService } from '../../services/ChatService';
import { logger } from '../../utils/logger';

export class SelfThinkingController {
  constructor(private chatService: ChatService) {}

  /**
   * POST /v1/chat/self-thinking
   * 自我思考循环聊天API
   */
  async selfThinkingChat(req: Request, res: Response): Promise<void> {
    try {
      const { messages, ...options } = req.body;

      // 确保启用自我思考
      options.selfThinking = {
        enabled: true,
        maxIterations: options.maxIterations || 5,
        enableTaskEvaluation: options.enableTaskEvaluation ?? true,
        ...options.selfThinking
      };

      const result = await this.chatService.processMessage(messages, options);

      res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: options.model || 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: result.content
          },
          finish_reason: 'stop'
        }],
        metadata: {
          iterations: result.iterations,
          toolCalls: result.toolCalls?.length || 0,
          thinkingProcess: result.thinkingProcess
        }
      });

    } catch (error: any) {
      logger.error('❌ Error in selfThinkingChat:', error);

      res.status(500).json({
        error: {
          message: error.message || 'Internal server error',
          type: 'server_error'
        }
      });
    }
  }
}
```

然后在 `src/server.ts` 中添加路由：

```typescript
// ...
const selfThinkingController = new SelfThinkingController(this.chatService);
this.app.post('/v1/chat/self-thinking',
  createValidationMiddleware(chatCompletionSchema),
  (req, res) => selfThinkingController.selfThinkingChat(req, res)
);
// ...
```

---

### 4. 更新类型定义

**文件**：`src/types/index.ts`

```typescript
export interface ChatOptions {
  // ... 其他选项 ...
  // 🆕 自我思考循环配置（ReAct模式）
  selfThinking?: {
    enabled?: boolean;           // 是否启用自我思考循环（ReAct模式）
    maxIterations?: number;      // 最大思考循环次数（默认5）
    enableTaskEvaluation?: boolean; // 是否启用任务完成评估（会使用LLM评估）
    completionPrompt?: string;   // 自定义任务完成评估提示
    includeThoughtsInResponse?: boolean; // 是否在响应中包含思考过程（默认true）
  };
}

// 🆕 自我思考循环的响应结果
export interface SelfThinkingResult {
  content: string;
  toolCalls?: ToolRequest[];
  toolResults?: Array<{ tool: string; result?: any; error?: string }>;
  iterations: number;
  thinkingProcess?: string;
}
```

---

## 🧪 测试自我思考循环

### 测试 1：掷骰子（单次工具调用）

```bash
curl -X POST http://localhost:8088/v1/chat/self-thinking \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "你是一个助手。可用工具:\n{{ABPAllTools}}"},
      {"role": "user", "content": "帮我掷3个骰子并告诉我结果"}
    ],
    "selfThinking": {
      "enabled": true,
      "maxIterations": 3,
      "includeThoughtsInResponse": true
    },
    "stream": false
  }'
```

**预期输出**：
```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "我已经为你掷了3个骰子，结果是 [4, 2, 6]！"
    }
  }],
  "metadata": {
    "iterations": 2,
    "toolCalls": 1,
    "thinkingProcess": "[思考步骤 1]\nAI分析: 用户想要掷3个骰子，我需要使用 SimpleDice 工具...\n工具执行成功...\n任务完成！"
  }
}
```

---

### 测试 2：多工具调用（游戏+系统信息）

```bash
curl -X POST http://localhost:8088/v1/chat/self-thinking \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "你是一个助手。可用工具:\n{{ABPAllTools}}\n优先使用工具获取准确信息。"},
      {"role": "user", "content": "先检查系统状态，然后玩石头剪刀布（你帮我出）"}
    ],
    "selfThinking": {
      "enabled": true,
      "maxIterations": 5,
      "includeThoughtsInResponse": true
    },
    "stream": false
  }'
```

---

## 📊 性能考虑

### Token 消耗估算

自我思考循环的 Token 消耗 = 单次对话 × 循环次数

**示例**（5个工具，brief阶段）：
```
单次工具调用: ~750 tokens
循环3次    : 750 × 3 = 2250 tokens

vs 普通单次调用: 750 tokens
```

**优化建议**：
- 限制 `maxIterations`（推荐 3-5）
- 使用 `quickEvaluate` 而非完整LLM评估
- 定期清理消息历史
- 对简单任务禁用自我思考循环

---

## 🎯 使用场景

**适合自我思考循环的任务**：
- ✅ 需要多个步骤的复杂查询
- ✅ 工具链式调用（A→B→C）
- ✅ 需要验证结果的任务
- ✅ 探索性任务（不确定需要什么工具）

**不适合的场景**：
- ❌ 简单问答（直接回答即可）
- ❌ 单工具即可完成
- ❌ 对延迟敏感的场景

---

## 🔍 调试技巧

### 1. 查看思考过程

在响应中启用 `thinkingProcess`：

```json
{
  "selfThinking": {
    "includeThoughtsInResponse": true
  }
}
```

然后在响应的 `metadata.thinkingProcess` 中查看完整的思考过程。

### 2. 日志追踪

查看日志中的关键字：
- `🧠 Starting Self-Thinking Loop` → 循环开始
- `🔄 [Self-Thinking Loop Iteration X/Y]` → 第X次迭代
- `🔧 Detected X tool calls` → 工具调用
- `🧠 Evaluating task completion` → 任务评估
- `✅ Task appears complete` → 任务完成

### 3. 循环中断

如果循环没有正确结束，检查：
- `maxIterations` 是否设置合理
- `TaskEvaluator` 是否正确初始化
- 工具调用是否返回了预期结果

---

## 🚀 高级用法

### 自定义任务完成评估

```typescript
const customCompletionPrompt = `你是一个严格的任务评估员。请分析对话并判断：

1. 用户的目标是否完全实现？
2. 所有必需的工具是否已调用？
3. 结果是否准确且完整？

只有当以上全部为"是"时，才标记为完成。

对话历史: {{conversation_history}}
用户目标: {{user_query}}

回应格式:
COMPLETE: [是/否]
REASONING: [详细推理]
MISSING: [如果有，缺少什么]`;

await chatService.processMessage(messages, {
  selfThinking: {
    enabled: true,
    completionPrompt: customCompletionPrompt
  }
});
```

---

## ✅ 验证清单

实现完成后，请检查：

- [ ] `TaskEvaluator` 已正确导入
- [ ] ChatService 添加了 `taskEvaluator` 属性
- [ ] `processMessageWithSelfThinking` 方法已实现
- [ ] 类型定义已更新（`ChatOptions.selfThinking`）
- [ ] 新 API 端点已添加（`/v1/chat/self-thinking`）
- [ ] 路由配置正确
- [ ] 测试用例通过
- [ ] 日志输出完整
- [ ] 思考过程可追踪

---

## 📚 相关文档

- [TaskEvaluator 实现](./src/core/TaskEvaluator.ts)
- [ChatService 源码](./src/services/ChatService.ts)
- [ReAct Paper](https://arxiv.org/abs/2210.03629) - 理论基础
- [ABP 协议](./docs/ABP_PROTOCOL.md) - 工具调用协议

---

**实现难度**：⭐⭐⭐（中等）
**预计耗时**：30-60分钟
**影响范围**：ChatService、新 API 端点、类型定义

---

## 🎉 下一步

按照本指南实现完成后，你的 ApexBridge 将具备：

1. ✅ **自主任务执行**：AI 可以自我规划并执行多步骤任务
2. ✅ **自我评估**：判断任务是否完成
3. ✅ **循环优化**：重复执行直到成功
4. ✅ **思考可追踪**：查看完整的思考过程

快去试试吧喵～ (｡･ω･｡)♪
