/**
 * Playbook 强制执行相关类型定义
 * Stage 3.5: Playbook 强制执行
 */

import type { Message, ChatOptions } from './index';

export type FallbackStrategy = 'revert-to-react' | 'abort';

/**
 * Playbook 执行计划
 */
export interface PlaybookPlan {
  plan_id: string;
  playbook_id: string;
  playbook_name: string;
  confidence: number;  // 来自 Playbook 的 successRate
  steps: PlanStep[];
  fallback_strategy: FallbackStrategy;
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

/**
 * 记录执行参数（用于 PlaybookManager.recordExecution）
 */
export interface RecordExecutionParams {
  playbookId: string;
  sessionId: string;
  outcome: 'success' | 'failure';
  duration: number;
  reason?: string;
}
