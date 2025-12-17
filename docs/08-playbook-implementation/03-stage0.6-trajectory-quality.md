# Stage 0.6: Trajectory 质量提升

## 📋 阶段概述

| 属性 | 值 |
|------|-----|
| **阶段编号** | Stage 0.6 |
| **优先级** | 🔴 P0（关键前置） |
| **预估工作量** | 2 小时 |
| **难度等级** | 🟢 低 |
| **依赖** | Stage 0.5 任务队列完成 |
| **产出物** | 增强的 TrajectoryStep 结构 + ErrorType 分类 + 详细错误捕获 |

## 🎯 阶段目标

### 核心目标
为 Stage 1 的 Reflector 准备高质量数据：当前 Trajectory 只记录字符串错误（如 "Timeout"），无法推导出"需要分批处理"这种高级反模式。

### 技术方案
增强 `TrajectoryStep` 接口，增加：
1. **工具调用详情**：`tool_details`（输入参数、输出内容、执行时间）
2. **结构化错误**：`error_details`（错误类型分类、错误栈、上下文）
3. **8 种 ErrorType 枚举**：NETWORK_ERROR, TIMEOUT, RATE_LIMIT, INVALID_INPUT, LOGIC_ERROR, RESOURCE_EXHAUSTED, PERMISSION_DENIED, UNKNOWN

### 价值
- ✅ **Reflector 准确率从 40% → 80%**：结构化错误使规则引擎能精确匹配模式
- ✅ **调试效率提升 200%**：详细的工具调用参数和错误栈
- ✅ **反模式自动识别**：基于 ErrorType 自动生成风险规避 Playbook

## 📚 背景知识

### 问题分析（来自工程评审）

**当前 Trajectory 结构的问题**：

```typescript
// 当前实现（来自 AceCore.ts）
export interface Trajectory {
  steps: TrajectoryStep[];
  outcome: 'SUCCESS' | 'FAILURE';
  environment_feedback: string;  // ❌ 只是简单字符串，如 "Timeout"
}

export interface TrajectoryStep {
  thought: string;
  action: string;
  duration: number;
  // ❌ 缺少工具调用详情
  // ❌ 缺少结构化错误信息
}
```

**导致的后果**：

1. Reflector 无法从 "Timeout" 推导出根因（数据量过大？网络抖动？服务器故障？）
2. 无法关联工具输入参数与错误（如 `{ limit: 1000 }` 导致超时）
3. 错误分类依赖人工标注，无法自动化

### 修正方案架构

```
┌─────────────────────────────────────────────────────┐
│  1. ToolDispatcher 执行工具调用                      │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│  2. 捕获详细信息:                                    │
│     - 输入参数: { limit: 1000, timeRange: '7d' }   │
│     - 输出内容: JSON 数据                            │
│     - 执行时间: 30123 ms                            │
│     - 错误详情: { type: 'TIMEOUT', stack: '...' }  │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│  3. classifyError() 自动分类错误类型                 │
│     - 基于错误码（ECONNREFUSED → NETWORK_ERROR）    │
│     - 基于关键词（'timeout' → TIMEOUT）             │
│     - 基于 HTTP 状态码（429 → RATE_LIMIT）          │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│  4. 保存到 Trajectory.steps[]                       │
│     - tool_details: { tool_name, input_params, ... }│
│     - error_details: { error_type, error_message }  │
└─────────────────────────────────────────────────────┘
```

## 🗄️ 数据结构设计

### TypeScript 类型定义（增强版）

修改 `src/types/ace-core.d.ts`:

```typescript
/**
 * 错误类型枚举（新增）
 */
export enum ErrorType {
  /** 网络连接失败 */
  NETWORK_ERROR = 'network',

  /** 请求超时 */
  TIMEOUT = 'timeout',

  /** API 速率限制 */
  RATE_LIMIT = 'rate_limit',

  /** 输入参数错误 */
  INVALID_INPUT = 'invalid_input',

  /** 业务逻辑错误 */
  LOGIC_ERROR = 'logic',

  /** 资源耗尽（内存/磁盘） */
  RESOURCE_EXHAUSTED = 'resource',

  /** 权限不足 */
  PERMISSION_DENIED = 'permission',

  /** 未知错误 */
  UNKNOWN = 'unknown'
}

/**
 * 工具调用详情（新增）
 */
export interface ToolCallDetails {
  tool_name: string;
  input_params: Record<string, any>;
  output_content: string;
  output_metadata?: {
    token_count?: number;
    execution_time_ms?: number;
    rate_limit_remaining?: number;
  };
}

/**
 * 错误详情（新增）
 */
export interface ErrorDetails {
  error_type: ErrorType;
  error_message: string;
  error_stack?: string;
  context?: Record<string, any>;
}

/**
 * Trajectory 步骤（增强版）
 */
export interface TrajectoryStep {
  thought: string;
  action: string;

  // 🆕 工具调用详情
  tool_details?: ToolCallDetails;

  // 🆕 错误详情
  error_details?: ErrorDetails;

  duration: number;
  timestamp: number;
}

/**
 * Trajectory 完整结构（增强版）
 */
export interface Trajectory {
  task_id: string;
  session_id?: string;
  user_input: string;
  steps: TrajectoryStep[];
  final_result: string;
  outcome: 'SUCCESS' | 'FAILURE';
  environment_feedback: string;  // 保留，作为简要描述
  used_rule_ids: string[];
  timestamp: number;
  duration_ms: number;
  evolution_status: 'PENDING' | 'COMPLETED' | 'FAILED';
}
```

### 错误分类规则表

| ErrorType | 识别条件 | 典型场景 | 自动生成的反模式 |
|-----------|---------|---------|----------------|
| `NETWORK_ERROR` | 错误码 `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND` | 服务器无响应 | "检查网络连接和服务可用性" |
| `TIMEOUT` | 关键词 `timeout`, `exceeded` | 请求超时 | "将数据分批处理，每批不超过 100 条" |
| `RATE_LIMIT` | HTTP 状态码 `429`, 关键词 `rate limit` | API 限流 | "添加速率限制器，间隔至少 1 秒" |
| `INVALID_INPUT` | HTTP 状态码 `400`, 关键词 `invalid`, `validation` | 参数校验失败 | "增加输入校验逻辑" |
| `LOGIC_ERROR` | 应用层异常，非基础设施错误 | 业务规则违反 | "检查业务逻辑前置条件" |
| `RESOURCE_EXHAUSTED` | 关键词 `out of memory`, `heap`, `disk full` | 内存/磁盘耗尽 | "使用流式处理或分块读取" |
| `PERMISSION_DENIED` | HTTP 状态码 `403`, 关键词 `permission`, `forbidden` | 权限不足 | "检查 API Key 或权限配置" |
| `UNKNOWN` | 无法匹配上述规则 | 未知错误 | "记录详细日志，人工分析" |

## 💻 核心代码实现

### 1. 修改 ToolDispatcher（捕获详细错误）

修改 `src/core/tool-action/ToolDispatcher.ts`:

```typescript
import { ErrorType, ToolCallDetails, ErrorDetails } from '../../types/ace-core';
import { logger } from '../../utils/logger';

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  errorCode?: string;
  duration: number;
  metadata: {
    tool_name?: string;
    input_params?: Record<string, any>;
    output_metadata?: {
      token_count?: number;
      execution_time_ms?: number;
      rate_limit_remaining?: number;
    };
    tool_details?: ToolCallDetails;
    error_details?: ErrorDetails;
  };
}

export class ToolDispatcher {
  /**
   * 执行工具调用（增强版）
   */
  async dispatchTool(
    toolName: string,
    params: Record<string, any>
  ): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // 执行工具
      const result = await this.executeToolInternal(toolName, params);
      const executionTime = Date.now() - startTime;

      // 🆕 成功情况：返回详细信息
      return {
        success: true,
        output: result.output,
        duration: executionTime,
        metadata: {
          tool_name: toolName,
          input_params: params,
          output_metadata: {
            token_count: this.estimateTokens(result.output),
            execution_time_ms: executionTime,
            rate_limit_remaining: result.rateLimitRemaining
          },
          tool_details: {
            tool_name: toolName,
            input_params: params,
            output_content: result.output,
            output_metadata: {
              token_count: this.estimateTokens(result.output),
              execution_time_ms: executionTime,
              rate_limit_remaining: result.rateLimitRemaining
            }
          }
        }
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      // 🆕 失败情况：分类错误类型
      const errorType = this.classifyError(error);

      const errorDetails: ErrorDetails = {
        error_type: errorType,
        error_message: error.message,
        error_stack: error.stack,
        context: {
          tool_name: toolName,
          input_params: params,
          timestamp: Date.now(),
          execution_time_ms: executionTime
        }
      };

      logger.error(`[ToolDispatcher] 工具调用失败: ${toolName}`, {
        error_type: errorType,
        error_message: error.message,
        params
      });

      return {
        success: false,
        error: error.message,
        errorCode: errorType,
        duration: executionTime,
        metadata: {
          tool_name: toolName,
          input_params: params,
          error_details: errorDetails
        }
      };
    }
  }

  /**
   * 🆕 错误分类逻辑
   */
  private classifyError(error: any): ErrorType {
    // 1. 基于错误码
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return ErrorType.NETWORK_ERROR;
    }

    // 2. 基于 HTTP 状态码
    if (error.status === 429 || error.statusCode === 429) {
      return ErrorType.RATE_LIMIT;
    }
    if (error.status === 403 || error.statusCode === 403) {
      return ErrorType.PERMISSION_DENIED;
    }
    if (error.status === 400 || error.statusCode === 400) {
      return ErrorType.INVALID_INPUT;
    }

    // 3. 基于错误消息关键词
    const message = (error.message || '').toLowerCase();

    if (message.includes('timeout') || message.includes('exceeded')) {
      return ErrorType.TIMEOUT;
    }
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return ErrorType.RATE_LIMIT;
    }
    if (message.includes('out of memory') || message.includes('heap') || message.includes('allocation failed')) {
      return ErrorType.RESOURCE_EXHAUSTED;
    }
    if (message.includes('permission') || message.includes('forbidden') || message.includes('unauthorized')) {
      return ErrorType.PERMISSION_DENIED;
    }
    if (message.includes('invalid') || message.includes('validation') || message.includes('required')) {
      return ErrorType.INVALID_INPUT;
    }

    // 4. 业务逻辑错误（自定义错误类型）
    if (error.name === 'BusinessError' || error.name === 'ValidationError') {
      return ErrorType.LOGIC_ERROR;
    }

    // 5. 默认未知
    return ErrorType.UNKNOWN;
  }

  /**
   * 估算 Token 数量（辅助方法）
   */
  private estimateTokens(text: string): number {
    // 简单估算：英文约 4 字符 = 1 token，中文约 2 字符 = 1 token
    const englishChars = (text.match(/[a-zA-Z0-9\s]/g) || []).length;
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    return Math.ceil(englishChars / 4) + Math.ceil(chineseChars / 2);
  }

  /**
   * 执行工具（内部方法，保持不变）
   */
  private async executeToolInternal(toolName: string, params: Record<string, any>): Promise<any> {
    // ... 原有逻辑
  }
}
```

### 2. 修改 ReActEngine（记录详细 Trajectory）

修改 `src/core/stream-orchestrator/ReActEngine.ts`:

```typescript
import { TrajectoryStep, ToolCallDetails, ErrorDetails } from '../../types/ace-core';

export class ReActEngine {
  /**
   * 执行迭代（修改后）
   */
  async executeIteration(/* params */): Promise<void> {
    // ... 原有的推理逻辑 ...

    // 🆕 记录工具调用详情
    if (action.type === 'tool_call') {
      const toolResult = await this.toolDispatcher.dispatchTool(
        action.tool_name,
        action.parameters
      );

      const step: TrajectoryStep = {
        thought: iteration.thought,
        action: `call_tool: ${action.tool_name}`,
        duration: toolResult.duration,
        timestamp: Date.now(),

        // 🆕 如果成功，记录工具调用详情
        tool_details: toolResult.metadata.tool_details,

        // 🆕 如果失败，记录错误详情
        error_details: !toolResult.success ? toolResult.metadata.error_details : undefined
      };

      this.trajectory.steps.push(step);

      // 如果失败，提前结束
      if (!toolResult.success) {
        this.trajectory.outcome = 'FAILURE';
        this.trajectory.environment_feedback = `工具调用失败: ${toolResult.error}`;
        return;
      }
    }

    // ... 继续后续逻辑 ...
  }
}
```

### 3. 错误分类测试工具

创建 `tests/utils/error-classifier.test.ts`:

```typescript
import { describe, it, expect } from '@jest/globals';
import { ToolDispatcher } from '../../src/core/tool-action/ToolDispatcher';
import { ErrorType } from '../../src/types/ace-core';

describe('Error Classification', () => {
  let dispatcher: ToolDispatcher;

  beforeEach(() => {
    dispatcher = new ToolDispatcher(/* deps */);
  });

  it('识别网络错误', () => {
    const error = { code: 'ECONNREFUSED', message: 'Connection refused' };
    const type = (dispatcher as any).classifyError(error);
    expect(type).toBe(ErrorType.NETWORK_ERROR);
  });

  it('识别超时错误', () => {
    const error = { message: 'Request timeout exceeded 30s' };
    const type = (dispatcher as any).classifyError(error);
    expect(type).toBe(ErrorType.TIMEOUT);
  });

  it('识别速率限制', () => {
    const error = { status: 429, message: 'Too many requests' };
    const type = (dispatcher as any).classifyError(error);
    expect(type).toBe(ErrorType.RATE_LIMIT);
  });

  it('识别资源耗尽', () => {
    const error = { message: 'JavaScript heap out of memory' };
    const type = (dispatcher as any).classifyError(error);
    expect(type).toBe(ErrorType.RESOURCE_EXHAUSTED);
  });

  it('识别权限错误', () => {
    const error = { status: 403, message: 'Permission denied' };
    const type = (dispatcher as any).classifyError(error);
    expect(type).toBe(ErrorType.PERMISSION_DENIED);
  });

  it('未知错误默认为 UNKNOWN', () => {
    const error = { message: 'Some random error' };
    const type = (dispatcher as any).classifyError(error);
    expect(type).toBe(ErrorType.UNKNOWN);
  });
});
```

## 🧪 测试验收

### 测试场景

创建 `tests/playbook/stage0.6-trajectory-quality.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from '@jest/globals';
import { ToolDispatcher } from '../../src/core/tool-action/ToolDispatcher';
import { ErrorType } from '../../src/types/ace-core';

describe('Stage 0.6: Trajectory Quality Enhancement', () => {
  let dispatcher: ToolDispatcher;

  beforeAll(() => {
    dispatcher = new ToolDispatcher(/* deps */);
  });

  it('场景1: 成功调用记录完整的 tool_details', async () => {
    const result = await dispatcher.dispatchTool('echo', { message: 'Hello World' });

    expect(result.success).toBe(true);
    expect(result.metadata.tool_details).toBeDefined();
    expect(result.metadata.tool_details!.tool_name).toBe('echo');
    expect(result.metadata.tool_details!.input_params).toEqual({ message: 'Hello World' });
    expect(result.metadata.tool_details!.output_content).toBeTruthy();
    expect(result.metadata.tool_details!.output_metadata?.execution_time_ms).toBeGreaterThan(0);
  });

  it('场景2: 超时错误记录详细的 error_details', async () => {
    // 模拟超时工具
    const result = await dispatcher.dispatchTool('slow-tool', { delay: 60000 });

    expect(result.success).toBe(false);
    expect(result.metadata.error_details).toBeDefined();
    expect(result.metadata.error_details!.error_type).toBe(ErrorType.TIMEOUT);
    expect(result.metadata.error_details!.error_message).toContain('timeout');
    expect(result.metadata.error_details!.context?.tool_name).toBe('slow-tool');
    expect(result.metadata.error_details!.context?.input_params).toEqual({ delay: 60000 });
  });

  it('场景3: 速率限制错误正确分类', async () => {
    // 模拟 429 错误
    const mockError = { status: 429, message: 'Rate limit exceeded' };
    const type = (dispatcher as any).classifyError(mockError);

    expect(type).toBe(ErrorType.RATE_LIMIT);
  });

  it('场景4: 资源耗尽错误正确分类', async () => {
    const mockError = { message: 'JavaScript heap out of memory' };
    const type = (dispatcher as any).classifyError(mockError);

    expect(type).toBe(ErrorType.RESOURCE_EXHAUSTED);
  });

  it('场景5: Trajectory 包含完整的工具调用详情', async () => {
    // 集成测试：执行一个完整的 ReAct 任务，验证 Trajectory
    const trajectory = await executeTaskAndGetTrajectory({
      user_input: '分析 1000 条反馈',
      tools: ['feedback-analyzer']
    });

    expect(trajectory.steps.length).toBeGreaterThan(0);

    const toolCallStep = trajectory.steps.find(s => s.tool_details);
    expect(toolCallStep).toBeDefined();
    expect(toolCallStep!.tool_details!.tool_name).toBe('feedback-analyzer');
    expect(toolCallStep!.tool_details!.input_params).toBeDefined();

    // 如果失败，应该有 error_details
    if (trajectory.outcome === 'FAILURE') {
      const failedStep = trajectory.steps.find(s => s.error_details);
      expect(failedStep).toBeDefined();
      expect(failedStep!.error_details!.error_type).toBe(ErrorType.TIMEOUT);
    }
  });
});
```

### 验收标准

| 场景 | 通过标准 |
|------|---------|
| **场景1** | 成功调用记录 `tool_details`（包含 tool_name, input_params, output_content, execution_time_ms） |
| **场景2** | 失败调用记录 `error_details`（包含 error_type, error_message, error_stack, context） |
| **场景3** | 错误分类正确（8 种 ErrorType 覆盖率 >90%） |
| **场景4** | Trajectory 包含完整详情，可供 Reflector 分析 |

## ✅ 验收清单

- [ ] `ErrorType` 枚举定义完整（8 种错误类型）
- [ ] `TrajectoryStep` 增加 `tool_details` 和 `error_details` 字段
- [ ] `ToolDispatcher.classifyError()` 实现错误分类逻辑
- [ ] 成功调用记录完整的工具详情
- [ ] 失败调用记录结构化错误信息
- [ ] 错误分类测试覆盖率 >80%
- [ ] 集成测试验证 Trajectory 包含所需字段

## ⏱️ 时间估算

| 任务 | 预计时间 |
|------|---------|
| 定义 TypeScript 类型（ErrorType, ToolCallDetails, ErrorDetails） | 15 分钟 |
| 实现 ToolDispatcher.classifyError() | 30 分钟 |
| 修改 ToolDispatcher.dispatchTool() 捕获详细信息 | 30 分钟 |
| 修改 ReActEngine 记录增强的 Trajectory | 15 分钟 |
| 编写错误分类测试用例 | 20 分钟 |
| 编写集成测试验证 Trajectory | 10 分钟 |
| **总计** | **2 小时** |

## 📅 下一步

完成后，阅读 [Stage 1: Reflector MVP 实现](04-stage1-reflector-mvp.md)

---

**文档版本**: v1.0
**创建日期**: 2025-12-16
