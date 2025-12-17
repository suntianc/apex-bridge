# Stage 3.5: Playbook 强制执行

## 📋 阶段概述

| 属性 | 值 |
|------|-----|
| **阶段编号** | Stage 3.5 |
| **优先级** | 🟠 推荐 |
| **预估工作量** | 6 小时 |
| **难度等级** | 🟡 中等 |
| **依赖** | Stage 1 Reflector MVP 完成 |
| **产出物** | PlaybookExecutor 强制执行器 + Plan 对象转换 + 回退机制 |

## 🎯 阶段目标

### 核心目标
解决 Playbook "执行力弱"的问题：当前 Playbook 仅注入到 System Prompt，LLM 可能忽略具体步骤。升级为**强制执行 Plan 对象**，提升执行成功率从 60% → 85%。

### 技术方案
1. **创建 PlaybookExecutor 类**：将 Playbook 转换为可执行的 Plan 对象
2. **Plan 对象结构**：包含 stepNumber, actionType, toolName, parameters, expectedDuration, antiPatterns
3. **强制步骤执行**：按 Plan 逐步执行工具调用，验证输出
4. **回退机制**：如果 Playbook 执行失败，回退到 ReAct 自由思考模式
5. **反模式检测**：匹配已知反模式，提前终止

### 价值
- ✅ **执行成功率提升 25%**（60% → 85%）
- ✅ **减少 LLM 试错次数**（平均从 3 轮 → 1.5 轮）
- ✅ **降低 Token 消耗 30%**（跳过冗余思考步骤）

## 📚 背景知识

### 问题分析（来自工程评审）

**原报告设计的缺陷**：

```typescript
// ❌ 弱执行：只注入 System Prompt
messages.unshift({
  role: 'system',
  content: `[Playbook 提示]\n推荐步骤:\n1. tool_call: feedback-analyzer\n2. llm_prompt: 分类问题\n...`
});

// LLM 可能忽略这些步骤，或者自由发挥
```

**问题**：
1. LLM 在长上下文情况下会"淹没" Playbook 提示
2. 与 ReAct 的"自由思考"模式冲突（LLM 倾向于自主推理）
3. 无法验证 LLM 是否按步骤执行

### 修正方案：强制执行 Plan

```
┌─────────────────────────────────────────────────┐
│  1. 检索到匹配的 Playbook (matchScore >0.8)     │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│  2. 转换为 Plan 对象                             │
│     - Playbook.actions → Plan.steps             │
│     - 每个步骤包含工具名称、参数、期望输出       │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│  3. 强制执行 Plan（跳过部分 ReAct 思考）         │
│     - Step 1: 调用 feedback-analyzer            │
│     - Step 2: 调用 LLM 分类                     │
│     - Step 3: 生成解决方案                      │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│  4. 验证每步输出                                 │
│     - 如果输出不符合预期 → 回退到 ReAct         │
│     - 如果触发反模式 → 提前终止                 │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│  5. 成功/失败反馈                                │
│     - 更新 Playbook 成功率                      │
│     - 记录 Trajectory（含 used_playbook_id）    │
└─────────────────────────────────────────────────┘
```

## 🗄️ 数据结构设计

### Plan 对象结构

```typescript
/**
 * Playbook 执行计划
 */
export interface PlaybookPlan {
  plan_id: string;
  playbook_id: string;
  playbook_name: string;
  confidence: number;  // 来自 Playbook 的 successRate
  steps: PlanStep[];
  fallback_strategy: 'revert-to-react' | 'abort';
}

/**
 * 计划步骤
 */
export interface PlanStep {
  step_number: number;
  description: string;
  action_type: 'tool_call' | 'llm_prompt' | 'conditional_branch';

  // 工具调用
  tool_name?: string;
  parameters?: Record<string, any>;

  // LLM 调用
  prompt_template?: string;
  expected_output_format?: string;

  // 执行元数据
  expected_duration_ms?: number;
  anti_patterns: string[];  // 来自 Playbook
  retry_on_failure?: boolean;
}

/**
 * 执行上下文
 */
export interface ExecutionContext {
  messages: Message[];
  options: ChatOptions;
  intermediate_results: Map<number, any>;  // stepNumber → result
  final_result?: string;
}

/**
 * 执行结果
 */
export interface ExecutionResult {
  success: boolean;
  output?: string;
  duration: number;
  steps_completed: number;
  reason?: string;  // 失败原因（如 'anti-pattern-triggered', 'unexpected-output'）
}
```

## 💻 核心代码实现

### 1. PlaybookExecutor 核心类

创建 `src/services/PlaybookExecutor.ts`:

```typescript
import { StrategicPlaybook } from '../types/playbook';
import { PlaybookPlan, PlanStep, ExecutionContext, ExecutionResult } from '../types/playbook-execution';
import { ToolDispatcher } from '../core/tool-action/ToolDispatcher';
import { LLMManager } from '../core/LLMManager';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Playbook 执行器
 *
 * 职责:
 * - 将 Playbook 转换为可执行的 Plan
 * - 强制执行 Plan 步骤
 * - 验证每步输出
 * - 检测反模式并提前终止
 */
export class PlaybookExecutor {
  private toolDispatcher: ToolDispatcher;
  private llmManager: LLMManager;

  constructor(toolDispatcher: ToolDispatcher, llmManager: LLMManager) {
    this.toolDispatcher = toolDispatcher;
    this.llmManager = llmManager;
  }

  /**
   * 将 Playbook 转换为 Plan
   */
  convertPlaybookToPlan(playbook: StrategicPlaybook): PlaybookPlan {
    const steps: PlanStep[] = playbook.actions.map((action, index) => ({
      step_number: index + 1,
      description: action.description,
      action_type: action.action_type || 'tool_call',
      tool_name: action.tool_name,
      parameters: action.parameters || {},
      prompt_template: action.prompt_template,
      expected_output_format: action.expected_output_format,
      expected_duration_ms: action.expected_duration_ms,
      anti_patterns: playbook.anti_patterns || [],
      retry_on_failure: false
    }));

    return {
      plan_id: uuidv4(),
      playbook_id: playbook.id,
      playbook_name: playbook.name,
      confidence: playbook.metrics.successRate,
      steps,
      fallback_strategy: 'revert-to-react'
    };
  }

  /**
   * 执行 Playbook Plan
   */
  async executePlan(
    plan: PlaybookPlan,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    logger.info(`[PlaybookExecutor] 开始执行 Plan: ${plan.playbook_name} (置信度: ${plan.confidence})`);

    const startTime = Date.now();
    let stepsCompleted = 0;

    try {
      for (const step of plan.steps) {
        logger.debug(`[PlaybookExecutor] 执行步骤 ${step.step_number}: ${step.description}`);

        const stepResult = await this.executeStep(step, context);

        // 验证输出
        if (!this.validateStepOutput(stepResult, step)) {
          logger.warn(`[PlaybookExecutor] 步骤 ${step.step_number} 输出不符合预期，回退到 ReAct`);
          return {
            success: false,
            duration: Date.now() - startTime,
            steps_completed: stepsCompleted,
            reason: 'unexpected-output'
          };
        }

        // 检测反模式
        if (this.matchesAntiPattern(stepResult, step.anti_patterns)) {
          logger.error(`[PlaybookExecutor] 步骤 ${step.step_number} 触发反模式，终止执行`);
          return {
            success: false,
            duration: Date.now() - startTime,
            steps_completed: stepsCompleted,
            reason: 'anti-pattern-triggered'
          };
        }

        // 记录中间结果
        context.intermediate_results.set(step.step_number, stepResult);
        stepsCompleted++;
      }

      // 所有步骤执行成功
      const finalResult = this.buildFinalResult(context);

      logger.info(`[PlaybookExecutor] Plan 执行成功: ${plan.playbook_name}`);

      return {
        success: true,
        output: finalResult,
        duration: Date.now() - startTime,
        steps_completed: stepsCompleted
      };

    } catch (error: any) {
      logger.error(`[PlaybookExecutor] Plan 执行失败`, error);

      return {
        success: false,
        duration: Date.now() - startTime,
        steps_completed: stepsCompleted,
        reason: error.message
      };
    }
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(step: PlanStep, context: ExecutionContext): Promise<any> {
    if (step.action_type === 'tool_call') {
      // 工具调用
      const params = this.resolveParameters(step.parameters!, context);
      const result = await this.toolDispatcher.dispatchTool(step.tool_name!, params);

      if (!result.success) {
        throw new Error(`工具调用失败: ${result.error}`);
      }

      return result.output;

    } else if (step.action_type === 'llm_prompt') {
      // LLM 调用
      const prompt = this.resolvePromptTemplate(step.prompt_template!, context);
      const response = await this.llmManager.chat([
        { role: 'user', content: prompt }
      ], { stream: false });

      return response.choices[0]?.message?.content || '';

    } else if (step.action_type === 'conditional_branch') {
      // 条件分支（简化实现）
      return null;
    }

    throw new Error(`不支持的步骤类型: ${step.action_type}`);
  }

  /**
   * 解析参数（支持占位符）
   */
  private resolveParameters(
    params: Record<string, any>,
    context: ExecutionContext
  ): Record<string, any> {
    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
        // 占位符：{step_1_result}
        const match = value.match(/\{step_(\d+)_result\}/);
        if (match) {
          const stepNumber = parseInt(match[1], 10);
          resolved[key] = context.intermediate_results.get(stepNumber);
        } else {
          resolved[key] = value;
        }
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * 解析 Prompt 模板
   */
  private resolvePromptTemplate(template: string, context: ExecutionContext): string {
    let resolved = template;

    // 替换占位符：{step_1_result}
    for (const [stepNumber, result] of context.intermediate_results.entries()) {
      resolved = resolved.replace(
        new RegExp(`\\{step_${stepNumber}_result\\}`, 'g'),
        JSON.stringify(result)
      );
    }

    // 替换用户输入：{user_input}
    const userMessage = context.messages[context.messages.length - 1];
    resolved = resolved.replace(/\{user_input\}/g, userMessage.content);

    return resolved;
  }

  /**
   * 验证步骤输出
   */
  private validateStepOutput(output: any, step: PlanStep): boolean {
    // 简单验证：检查输出是否为空
    if (!output || (typeof output === 'string' && output.trim().length === 0)) {
      return false;
    }

    // 如果有期望的输出格式，验证格式
    if (step.expected_output_format) {
      try {
        if (step.expected_output_format === 'json') {
          JSON.parse(output);
        }
        // 其他格式验证...
      } catch {
        return false;
      }
    }

    return true;
  }

  /**
   * 检测反模式
   */
  private matchesAntiPattern(output: any, antiPatterns: string[]): boolean {
    if (!output || antiPatterns.length === 0) return false;

    const outputStr = JSON.stringify(output).toLowerCase();

    // 检查是否包含反模式关键词
    for (const pattern of antiPatterns) {
      const keywords = pattern.toLowerCase().match(/[\u4e00-\u9fa5a-z0-9]+/g) || [];
      if (keywords.some(kw => outputStr.includes(kw))) {
        logger.warn(`[PlaybookExecutor] 检测到反模式: ${pattern}`);
        return true;
      }
    }

    return false;
  }

  /**
   * 构建最终结果
   */
  private buildFinalResult(context: ExecutionContext): string {
    const results = Array.from(context.intermediate_results.values());
    return results[results.length - 1] || '';
  }
}
```

### 2. 集成到 ChatService

修改 `src/services/ChatService.ts`，使用强制执行：

```typescript
// src/services/ChatService.ts

import { PlaybookExecutor } from './PlaybookExecutor';
import { ExecutionContext } from '../types/playbook-execution';

export class ChatService {
  private playbookExecutor: PlaybookExecutor;

  constructor(/* deps */) {
    // ... existing initialization
    this.playbookExecutor = new PlaybookExecutor(this.toolDispatcher, this.llmManager);
  }

  /**
   * 主聊天方法（修改后）
   */
  async chat(messages: Message[], options: ChatOptions): Promise<ChatResult> {
    const userQuery = messages[messages.length - 1].content;

    // 检索 Playbook
    const playbooks = await this.playbookMatcher.matchPlaybooks({
      userQuery,
      sessionHistory: []
    }, { maxRecommendations: 1, minMatchScore: 0.8 });

    // 🆕 如果匹配到高置信度 Playbook，强制执行
    if (playbooks.length > 0 && playbooks[0].matchScore >= 0.8) {
      const playbook = playbooks[0].playbook;

      logger.info(`[ChatService] 使用 Playbook 强制执行: ${playbook.name} (置信度: ${playbook.metrics.successRate})`);

      // 转换为 Plan
      const plan = this.playbookExecutor.convertPlaybookToPlan(playbook);

      // 强制执行
      const context: ExecutionContext = {
        messages,
        options,
        intermediate_results: new Map()
      };

      const result = await this.playbookExecutor.executePlan(plan, context);

      // 如果成功，返回结果并更新统计
      if (result.success) {
        await this.playbookManager.recordExecution({
          playbookId: playbook.id,
          sessionId: options.sessionId,
          outcome: 'success',
          duration: result.duration
        });

        return {
          content: result.output!,
          usage: { /* ... */ },
          duration: result.duration
        };
      } else {
        // 失败：记录失败并回退到 ReAct
        logger.warn(`[ChatService] Playbook 执行失败（${result.reason}），回退到 ReAct`);

        await this.playbookManager.recordExecution({
          playbookId: playbook.id,
          sessionId: options.sessionId,
          outcome: 'failure',
          duration: result.duration,
          reason: result.reason
        });
      }
    }

    // 回退到常规 ReAct 策略
    logger.info('[ChatService] 使用 ReAct 策略执行');
    return this.strategy.execute(messages, options);
  }
}
```

### 3. 记录 Playbook 使用情况

修改 `src/services/PlaybookManager.ts`，添加执行记录方法：

```typescript
// src/services/PlaybookManager.ts

/**
 * 🆕 记录 Playbook 执行情况
 */
async recordExecution(params: {
  playbookId: string;
  sessionId: string;
  outcome: 'success' | 'failure';
  duration: number;
  reason?: string;
}): Promise<void> {
  const playbook = await this.getPlaybook(params.playbookId);
  if (!playbook) return;

  // 使用指数移动平均更新成功率
  const alpha = 0.2;  // 学习率
  const newSuccessRate = alpha * (params.outcome === 'success' ? 1 : 0)
                       + (1 - alpha) * playbook.metrics.successRate;

  // 更新平均执行时间
  const newAvgDuration = (playbook.metrics.avgExecutionTime * playbook.metrics.usageCount + params.duration)
                       / (playbook.metrics.usageCount + 1);

  await this.updatePlaybook(params.playbookId, {
    metrics: {
      successRate: newSuccessRate,
      usageCount: playbook.metrics.usageCount + 1,
      avgExecutionTime: newAvgDuration,
      lastUsed: Date.now()
    },
    updatedAt: new Date()
  });

  logger.info(
    `[PlaybookManager] 记录执行: ${params.playbookId} → ${params.outcome} ` +
    `(新成功率: ${(newSuccessRate * 100).toFixed(1)}%)`
  );

  // 如果成功率下降到阈值以下，触发反思
  if (newSuccessRate < 0.6 && playbook.metrics.usageCount > 10) {
    logger.warn(`[PlaybookManager] Playbook ${playbook.name} 成功率过低，建议重新评估`);
    // TODO: 入队 REFLECT 任务
  }
}
```

## 🧪 测试验收

### 测试场景

创建 `tests/playbook/stage3.5-forced-execution.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from '@jest/globals';
import { PlaybookExecutor } from '../../src/services/PlaybookExecutor';
import { StrategicPlaybook } from '../../src/types/playbook';
import { ExecutionContext } from '../../src/types/playbook-execution';

describe('Stage 3.5: Playbook Forced Execution', () => {
  let executor: PlaybookExecutor;

  beforeAll(() => {
    executor = new PlaybookExecutor(/* deps */);
  });

  it('场景1: 将 Playbook 转换为 Plan 对象', () => {
    const playbook: StrategicPlaybook = {
      id: 'pb-test-001',
      name: '用户反馈分析',
      actions: [
        { description: '调用 feedback-analyzer', action_type: 'tool_call', tool_name: 'feedback-analyzer', parameters: { limit: 100 } },
        { description: '分类问题', action_type: 'llm_prompt', prompt_template: '将以下反馈分类：{step_1_result}' }
      ],
      anti_patterns: ['不要处理超过 100 条数据'],
      metrics: { successRate: 0.85, usageCount: 10, avgExecutionTime: 5000, lastUsed: Date.now() },
      // ... other fields
    };

    const plan = executor.convertPlaybookToPlan(playbook);

    expect(plan.playbook_id).toBe(playbook.id);
    expect(plan.steps.length).toBe(2);
    expect(plan.steps[0].tool_name).toBe('feedback-analyzer');
    expect(plan.steps[0].anti_patterns).toContain('不要处理超过 100 条数据');
  });

  it('场景2: 强制执行 Plan，验证每步输出', async () => {
    const plan = createMockPlan({
      steps: [
        { step_number: 1, action_type: 'tool_call', tool_name: 'echo', parameters: { message: 'Hello' } },
        { step_number: 2, action_type: 'llm_prompt', prompt_template: '重复: {step_1_result}' }
      ]
    });

    const context: ExecutionContext = {
      messages: [{ role: 'user', content: '测试' }],
      options: {},
      intermediate_results: new Map()
    };

    const result = await executor.executePlan(plan, context);

    expect(result.success).toBe(true);
    expect(result.steps_completed).toBe(2);
    expect(context.intermediate_results.size).toBe(2);
  });

  it('场景3: 检测反模式，提前终止', async () => {
    const plan = createMockPlan({
      steps: [
        {
          step_number: 1,
          action_type: 'tool_call',
          tool_name: 'data-processor',
          parameters: { limit: 10000 },  // 触发反模式
          anti_patterns: ['不要处理超过 1000 条数据']
        }
      ]
    });

    const context: ExecutionContext = {
      messages: [{ role: 'user', content: '处理数据' }],
      options: {},
      intermediate_results: new Map()
    };

    const result = await executor.executePlan(plan, context);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('anti-pattern-triggered');
  });

  it('场景4: 步骤失败时回退到 ReAct', async () => {
    const plan = createMockPlan({
      steps: [
        { step_number: 1, action_type: 'tool_call', tool_name: 'non-existent-tool', parameters: {} }
      ]
    });

    const context: ExecutionContext = {
      messages: [{ role: 'user', content: '测试' }],
      options: {},
      intermediate_results: new Map()
    };

    const result = await executor.executePlan(plan, context);

    expect(result.success).toBe(false);
    // ChatService 会捕获此失败并回退到 ReAct
  });

  it('场景5: 占位符解析正确', async () => {
    const context: ExecutionContext = {
      messages: [{ role: 'user', content: '测试' }],
      options: {},
      intermediate_results: new Map([[1, 'Step 1 output']])
    };

    const template = '基于 {step_1_result} 生成报告';
    const resolved = (executor as any).resolvePromptTemplate(template, context);

    expect(resolved).toContain('Step 1 output');
  });
});

/**
 * 辅助函数：创建模拟 Plan
 */
function createMockPlan(overrides: any): PlaybookPlan {
  return {
    plan_id: 'plan-test-001',
    playbook_id: 'pb-test-001',
    playbook_name: 'Test Playbook',
    confidence: 0.8,
    steps: [],
    fallback_strategy: 'revert-to-react',
    ...overrides
  };
}
```

### 验收标准

| 场景 | 通过标准 |
|------|---------|
| **场景1** | Playbook 正确转换为 Plan（steps 数量正确，anti_patterns 继承） |
| **场景2** | Plan 强制执行成功，intermediate_results 记录所有步骤输出 |
| **场景3** | 检测到反模式时提前终止（reason='anti-pattern-triggered'） |
| **场景4** | 步骤失败时返回 success=false，ChatService 回退到 ReAct |
| **场景5** | 占位符 `{step_N_result}` 正确解析 |

## ✅ 验收清单

- [ ] PlaybookExecutor 类实现完整
- [ ] `convertPlaybookToPlan()` 方法正确转换
- [ ] `executePlan()` 方法强制执行步骤
- [ ] 占位符解析逻辑（`{step_N_result}`, `{user_input}`）
- [ ] 反模式检测逻辑
- [ ] 集成到 ChatService（高置信度时强制执行）
- [ ] `recordExecution()` 方法更新 Playbook 统计
- [ ] 测试覆盖率 >80%

## ⏱️ 时间估算

| 任务 | 预计时间 |
|------|---------|
| 定义 Plan 相关数据结构 | 30 分钟 |
| 实现 `convertPlaybookToPlan()` 方法 | 45 分钟 |
| 实现 `executePlan()` 主逻辑 | 2 小时 |
| 实现占位符解析（parameters, prompt） | 45 分钟 |
| 实现反模式检测逻辑 | 30 分钟 |
| 集成到 ChatService | 45 分钟 |
| 实现 `recordExecution()` 方法 | 30 分钟 |
| 编写测试用例 | 1.5 小时 |
| 集成测试和调试 | 30 分钟 |
| **总计** | **6 小时** |

## 📅 总结

完成 Stage 3.5 后，Playbook 系统的核心功能已全部实现：

- ✅ Stage 0.5: 任务队列（事件驱动）
- ✅ Stage 0.6: Trajectory 质量提升（ErrorType 分类）
- ✅ Stage 1: Reflector（规则引擎 MVP）
- ✅ Stage 2: Generator（批量聚类）
- ✅ Stage 3: Curator（去重/归档/混合检索）
- ✅ Stage 3.5: 强制执行（Plan 对象）

**总计工作量**：4h + 2h + 16h + 8h + 14h + 6h = **50 小时**

**下一步**：
- **可选 Stage 4**：AFS 基础设施（文件系统抽象）
- **可选 Stage 5**：ACE 层深化（L1-L2 层）

---

**文档版本**: v1.0
**创建日期**: 2025-12-16
