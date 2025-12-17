/**
 * Playbook 执行器
 *
 * 职责:
 * - 将 Playbook 转换为可执行的 Plan
 * - 强制执行 Plan 步骤
 * - 验证每步输出
 * - 检测反模式并提前终止
 */

import { StrategicPlaybook } from '../types/playbook';
import {
  PlaybookPlan,
  PlanStep,
  ExecutionContext,
  ExecutionResult
} from '../types/playbook-execution';
import { ToolDispatcher } from '../core/tool-action/ToolDispatcher';
import { LLMManager } from '../core/LLMManager';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

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
      action_type: 'llm_prompt', // 默认使用 LLM prompt
      tool_name: action.resources?.[0], // 使用第一个资源作为工具名
      parameters: {},
      prompt_template: `${action.description}\n\n预期结果: ${action.expectedOutcome}`,
      expected_output_format: undefined,
      expected_duration_ms: undefined,
      anti_patterns: (playbook as any).anti_patterns || [],
      retry_on_failure: false
    }));

    return {
      plan_id: randomUUID(),
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
    if (step.action_type === 'tool_call' && step.tool_name) {
      // 工具调用
      const params = this.resolveParameters(step.parameters || {}, context);
      const result = await this.toolDispatcher.dispatch({
        name: step.tool_name,
        type: 'BUILTIN' as any, // 简化为内置工具
        parameters: params,
        rawText: `<tool_action name="${step.tool_name}">`,
        startIndex: 0,
        endIndex: 100
      } as any);

      if (!result.success) {
        throw new Error(`工具调用失败: ${result.error}`);
      }

      return (result as any).output;

    } else if (step.action_type === 'llm_prompt' && step.prompt_template) {
      // LLM 调用
      const prompt = this.resolvePromptTemplate(step.prompt_template, context);
      const response = await this.llmManager.chat([
        { role: 'user', content: prompt }
      ], { stream: false });

      return response.choices[0]?.message?.content || '';

    } else if (step.action_type === 'conditional_branch') {
      // 条件分支（简化实现）
      return null;
    }

    // 默认使用 LLM 处理
    const response = await this.llmManager.chat([
      { role: 'user', content: step.description }
    ], { stream: false });

    return response.choices[0]?.message?.content || '';
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
    const userInput = typeof userMessage.content === 'string'
      ? userMessage.content
      : JSON.stringify(userMessage.content);
    resolved = resolved.replace(/\{user_input\}/g, userInput);

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
