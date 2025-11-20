# 🧠 通过 Chat 接口触发自我思考完整指南

> 快速掌握如何使用 chat 接口启用 ReAct 模式的自我思考循环

---

## 📋 目录

1. [两种启用方式](#两种启用方式)
2. [详细配置选项](#详细配置选项)
3. [完整示例](#完整示例)
4. [工具调用流程](#工具调用流程)
5. [调试技巧](#调试技巧)
6. [常见问题](#常见问题)

---

## 🚀 两种启用方式

### 方式一：使用专用自我思考端点（推荐）

**端点**: `POST /v1/chat/self-thinking`

这是专门为自我思考设计的端点，提供更好的控制和调试功能。

```bash
curl -X POST http://localhost:8088/v1/chat/self-thinking \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "system",
        "content": "你是一个助手。可用工具:\n{{ABPAllTools}}\n\n当用户需要使用工具时，请主动调用工具并自我思考直到完成任务。"
      },
      {
        "role": "user",
        "content": "检查系统状态，然后玩石头剪刀布，我出石头"
      }
    ],
    "selfThinking": {
      "enabled": true,
      "maxIterations": 5,
      "includeThoughtsInResponse": true
    }
  }'
```

**优势**：
- ✅ 专门的自我思考功能
- ✅ 更好的错误提示
- ✅ 完整的调试信息
- ✅ 任务复杂度分析支持

### 方式二：在标准 Chat 接口中启用

**端点**: `POST /v1/chat/completions`

在现有的聊天接口中添加 `selfThinking` 参数即可启用。

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "system",
        "content": "你是一个助手。可用工具:\n{{ABPAllTools}}\n\n当需要使用工具时请主动调用。"
      },
      {
        "role": "user",
        "content": "掷3个骰子并告诉我总和"
      }
    ],
    "selfThinking": {
      "enabled": true,
      "maxIterations": 3
    }
  }'
```

**优势**：
- ✅ 与现有API兼容
- ✅ 无需修改端点URL
- ✅ 可以选择性启用

---

## ⚙️ 详细配置选项

### selfThinking 对象详解

```typescript
{
  "selfThinking": {
    // 🔧 核心配置
    "enabled": true,                          // 是否启用自我思考循环

    // 🔄 循环控制
    "maxIterations": 5,                      // 最大循环次数（默认5）
    "loopTimeout": 300000,                    // 总超时时间，单位毫秒（5分钟）

    // 🧠 任务评估
    "enableTaskEvaluation": true,               // 是否启用任务完成评估（默认true）
    "completionPrompt": "自定义评估提示...",      // 自定义任务完成判断提示（可选）

    // 💭 思考过程
    "includeThoughtsInResponse": true,        // 是否在响应中包含思考过程（默认true）
    "thoughtsFormat": "text"                   // 思考过程格式（预留）
  }
}
```

### 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| **enabled** | boolean | false | 是否启用自我思考循环 |
| **maxIterations** | number | 5 | 最大循环次数，防止无限循环 |
| **loopTimeout** | number | 300000 | 总超时时间，5分钟 |
| **enableTaskEvaluation** | boolean | true | 是否启用智能任务完成评估 |
| **includeThoughtsInResponse** | boolean | true | 是否返回AI的思考过程 |
| **completionPrompt** | string | null | 自定义任务完成判断提示 |

---

## 🔧 实际使用示例

### 示例 1：单工具调用（掷骰子）

```bash
curl -X POST http://localhost:8088/v1/chat/self-thinking \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "system",
        "content": "你是一个助手。可用工具:\n{{ABPAllTools}}\n\n请使用工具来准确回答用户的问题。"
      },
      {
        "role": "user",
        "content": "掷3个骰子，告诉我每个骰子的点数和总和"
      }
    ],
    "selfThinking": {
      "enabled": true,
      "maxIterations": 3,
      "includeThoughtsInResponse": true
    }
  }'
```

**预期执行过程**：
1. AI分析：用户需要掷3个骰子
2. AI行动：调用 `SimpleDice` 工具，参数 `{"count": 3}`
3. AI观察：工具返回 `[4, 2, 6]`
4. AI思考：需要计算总和并告诉用户
5. AI回复：`3个骰子的结果是 [4, 2, 6]，总和是 12！`

---

### 示例 2：多步骤任务（系统检查 + 游戏）

```bash
curl -X POST http://localhost:8088/v1/chat/self-thinking \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "system",
        "content": "你是一个助手。可用工具:\n{{ABPAllTools}}\n\n你能够自主规划并执行多步骤任务。请分析用户需求，分步骤完成。"
      },
      {
        "role": "user",
        "content": "先检查系统健康状况，然后玩石头剪刀布，我出布"
      }
    ],
    "selfThinking": {
      "enabled": true,
      "maxIterations": 6,
      "includeThoughtsInResponse": true,
      "enableTaskEvaluation": true
    }
  }'
```

**预期执行过程**：
1. 🔄 **迭代 1**：AI分析任务需要两个步骤
   - 行动：调用 `HealthCheck` 工具
   - 结果：系统状态良好
   - 思考：第一步完成，现在可以玩游戏了

2. 🔄 **迭代 2**：AI继续任务
   - 行动：调用 `RockPaperScissors` 工具，用户出布
   - 结果：你出布，AI出石头，你赢了！
   - 思考：两个步骤都完成了，可以结束循环

3. 🔄 **迭代 3**：AI生成最终回答
   - 行动：不再调用工具，直接回复
   - 结果：完整的回答

---

### 示例 3：复杂任务（链式操作）

```bash
curl -X POST http://localhost:8088/v1/chat/self-thinking \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "system",
        "content": "你是一个智能助手。可用工具:\n{{ABPAllTools}}\n\n请：\n1. 分析用户需求\n2. 规划执行步骤\n3. 逐步完成所有步骤\n4. 总结最终结果"
      },
      {
        "role": "user",
        "content": "帮我完成一个完整的系统检查和娱乐任务：先检查系统状态，如果系统正常就掷骰子庆祝，否则显示警告"
      }
    ],
    "selfThinking": {
      "enabled": true,
      "maxIterations": 8,
      "includeThoughtsInResponse": true,
      "enableTaskEvaluation": true
    }
  }'
```

**条件逻辑执行**：
1. AI先调用 `SystemInfo` 检查系统状态
2. 根据结果决定下一步：
   - 系统正常 → 调用 `SimpleDice` 庆祝
   - 系统异常 → 调用 `HealthCheck` 并显示警告

---

## 🔄 完整的工具调用流程

### 流程图

```
用户请求
    ↓
变量解析（{{ABPAllTools}}）
    ↓
System Prompt（含工具描述）
    ↓
AI 分析用户意图
    ↓
🧠 自我思考判断
    ↓
AI 生成 ABP 工具调用
    ↓
🔧 工具执行
    ↓
📊 结果返回
    ↓
🧠 评估任务完成
    ↓
完成任务？→ 是 → 生成最终回复
         ↓ 否 → 继续思考 → 重复循环
```

### 详细步骤

1. **接收请求**
   ```
   POST /v1/chat/self-thinking
   {
     "messages": [...],
     "selfThinking": {"enabled": true, "maxIterations": 5}
   }
   ```

2. **变量解析**
   - 检测 `{{ABPAllTools}}`
   - 调用 `ToolDescriptionProvider`
   - 生成完整的工具描述
   - 更新 System Prompt

3. **AI 分析和思考**
   ```
   System Prompt 更新为：
   "你是一个助手。可用工具:
   工具: HealthCheck - 基础健康检查
   工具: SimpleDice - 掷骰子
   工具: RockPaperScissors - 石头剪刀布
   ...
   "
   ```

4. **生成工具调用**
   AI 根据用户需求生成 ABP 格式：
   ```

    <tool_name>SystemInfo</tool_name>
    <parameters>{}</parameters>
    ```

5. **工具执行与结果返回**
   ```
   工具执行结果：系统正常运行，CPU使用率45%，内存使用率60%
   ```

6. **自我思考与评估**
   ```
   AI思考：系统状态已获取，用户要求玩游戏，继续执行下一步
   ```

7. **循环或结束**
   - 任务未完成 → 继续循环
   - 任务完成 → 生成最终回复并结束

---

## 🎯 调试技巧

### 1. 启用详细日志

```bash
# 设置环境变量启用调试
export DEBUG_LOG_LEVEL=debug
export SELF_THINKING_DEBUG=true
npm start
```

### 2. 查看循环状态

```bash
# 实时监控自我思考状态
curl http://localhost:8088/v1/chat/self-thinking/status | jq .
```

### 3. 使用任务分析API

```bash
curl -X POST http://localhost:8088/v1/chat/self-thinking/analyze \
  -H "Content-Type: application/json" \
  -d '{"userQuery": "检查系统状态并生成报告"}' | jq .
```

### 4. 调整循环参数

```json
{
  "selfThinking": {
    "enabled": true,
    "maxIterations": 2,        // 减少循环次数用于测试
    "includeThoughtsInResponse": true,  // 查看思考过程
    "enableTaskEvaluation": true        // 启用智能评估
  }
}
```

---

## ❓ 常见问题

### Q1: 为什么工具没有被调用？

**可能原因**：
- `{{ABPAllTools}}` 变量未被正确解析
- 工具描述不充分，AI不知道如何使用
- 循环次数设置过少

**解决方案**：
```bash
# 检查工具披露是否正常
curl http://localhost:8088/v1/models | jq '.data[0].description'

# 增加最大循环次数
"maxIterations": 10
```

### Q2: 为什么只循环了一次？

**可能原因**：
- 任务过于简单，一次即可完成
- 任务评估器认为任务已完成
- `includeThoughtsInResponse` 设置为 false，看不到思考过程

**解决方案**：
```json
{
  "selfThinking": {
    "enabled": true,
    "maxIterations": 5,
    "includeThoughtsInResponse": true,
    "enableTaskEvaluation": true
  }
}
```

### Q3: 如何避免无限循环？

**内置保护机制**：
- `maxIterations`：最大循环次数限制
- `loopTimeout`：总超时时间限制
- `TaskEvaluator`：智能任务完成评估

**建议配置**：
```json
{
  "selfThinking": {
    "enabled": true,
    "maxIterations": 5,           // 推荐3-8次
    "loopTimeout": 300000,        // 5分钟超时
    "enableTaskEvaluation": true  // 启用智能评估
  }
}
```

### Q4: 如何查看完整的工具调用过程？

**方法1**：启用详细日志
```bash
export DEBUG=self-thinking:*
npm start
```

**方法2**：使用包含思考过程的配置
```json
{
  "selfThinking": {
    "enabled": true,
    "includeThoughtsInResponse": true
  }
}
```

**方法3**：检查响应元数据
```bash
curl ... | jq '.metadata'
```

---

## 🔧 高级配置

### 自定义任务完成评估

```json
{
  "selfThinking": {
    "enabled": true,
    "enableTaskEvaluation": true,
    "completionPrompt": "请评估任务是否已完成：\n1. 是否已回答用户的所有问题\n2. 是否已执行所有必要的操作\n3. 是否提供了有用的结果\n\n如果以上都是，请回复'任务完成'，否则回复'需要继续工作'。"
  }
}
```

### 流式响应中的自我思考

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "system",
        "content": "你是一个助手。可用工具:\n{{ABPAllTools}}\n\n请逐步完成用户任务。"
      },
      {
        "role": "user",
        "content": "检查系统状态"
      }
    ],
    "selfThinking": {
      "enabled": true,
      "maxIterations": 3
    },
    "stream": true
  }'
```

### 批量处理多个任务

```bash
curl -X POST http://localhost:8088/v1/chat/self-thinking \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "system",
        "content": "你是系统管理员。可用工具:\n{{ABPAllTools}}\n\n请按顺序完成以下任务：\n1. 检查系统状态\n2. 如果系统正常，执行健康检查\n3. 生成状态报告"
      },
      {
        "role": "user",
        "content": "请完成完整的系统巡检"
      }
    ],
    "selfThinking": {
      "enabled": true,
      "maxIterations": 8,
      "includeThoughtsInResponse": true,
      "enableTaskEvaluation": true
    }
  }'
```

---

## 📊 性能优化建议

### 1. 合理设置循环次数

| 任务复杂度 | 推荐循环次数 | 说明 |
|------------|--------------|------|
| 简单工具调用 | 1-3 | 单一工具，如掷骰子 |
| 中等复杂度 | 3-5 | 2-3个步骤的任务 |
| 复杂多步骤 | 5-8 | 需要条件判断和多个操作 |
| 超复杂任务 | 8-10 | 需要分析和规划的任务 |

### 2. 启用任务评估

```json
{
  "selfThinking": {
    "enabled": true,
    "enableTaskEvaluation": true  // 避免不必要的循环
  }
}
```

### 3. 使用超时保护

```json
{
  "selfThinking": {
    "enabled": true,
    "loopTimeout": 180000  // 3分钟，防止长时间等待
  }
}
```

---

## 🎉 总结

自我思考循环为 ApexBridge 聊天接口带来了强大的自主执行能力：

### ✅ 核心优势

1. **自主执行**：AI 可以自主规划并执行多步骤任务
2. **智能评估**：自动判断任务完成状态，避免无效循环
3. **工具集成**：完整的 ABP 工具调用支持
4. **调试友好**：详细的思考过程和执行日志
5. **灵活配置**：支持多种配置模式和优化选项

### 🚀 使用场景

- **系统管理**：自动化系统检查和维护
- **数据分析**：多步骤数据查询和分析
- **游戏娱乐**：自主游戏和互动体验
- **创意任务**：多步骤内容生成和处理
- **问题解决**：复杂问题的逐步分析和解决

### 💡 最佳实践

1. **明确的系统提示**：告诉 AI 可以使用工具和需要循环
2. **合理的循环配置**：根据任务复杂度设置参数
3. **启用思考过程**：便于调试和理解 AI 行为
4. **善用任务评估**：提高执行效率，避免无效循环
5. **监控执行状态**：使用状态 API 和日志监控

现在你已经掌握了如何通过 chat 接口触发自我思考并调用工具的完整方法！试试用不同的任务和配置来体验这个强大的功能吧 (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧