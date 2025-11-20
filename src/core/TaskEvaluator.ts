/**
 * TaskEvaluator - 任务评估器
 *
 * 用于评估任务是否完成，支持自我思考循环
 */

import { Message } from '../types';
import { logger } from '../utils/logger';

export interface TaskEvaluatorOptions {
  maxIterations?: number;
  completionPrompt?: string;
}

export interface TaskEvaluation {
  isComplete: boolean;
  reasoning?: string;
  needsMoreWork: boolean;
  suggestedNextAction?: string;
}

const DEFAULT_COMPLETION_PROMPT = `你是一个任务完成度评估助手。请分析以下对话，判断用户的主要任务是否已完成。

评估标准：
1. 如果用户的问题已经得到充分回答，且结果明确 → 任务完成
2. 如果需要进行更多操作才能回答用户问题 → 任务未完成
3. 如果对任务状态不确定 → 任务未完成

请分析对话历史，给出专业评估。

当前对话历史:
{{conversation_history}}

用户原始请求: {{user_query}}

请用以下格式回应：
COMPLETE: [是/否]
REASONING: [你的推理过程]
NEXT_ACTION: [建议的下一步行动]`;

export class TaskEvaluator {
  private maxIterations: number = 5;
  private completionPrompt: string = DEFAULT_COMPLETION_PROMPT;

  constructor(options: TaskEvaluatorOptions = {}) {
    this.maxIterations = options.maxIterations || 5;
    if (options.completionPrompt) {
      this.completionPrompt = options.completionPrompt;
    }
  }

  /**
   * 评估任务是否完成
   *
   * @param messages 完整的对话历史
   * @param userQuery 用户的原始查询
   * @param currentIteration 当前循环次数
   * @returns 评估结果
   */
  async evaluate(messages: Message[], userQuery: string, currentIteration: number): Promise<TaskEvaluation> {
    try {
      // 检查是否达到最大循环次数
      if (currentIteration >= this.maxIterations) {
        logger.warn(`[TaskEvaluator] Max iterations (${this.maxIterations}) reached, forcing completion`);
        return {
          isComplete: true,
          reasoning: `达到最大循环次数(${this.maxIterations})，强制结束`,
          needsMoreWork: false
        };
      }

      // 构建对话历史文本
      const conversationHistory = this.buildConversationHistory(messages);

      // 构建评估提示
      const evalPrompt = this.completionPrompt
        .replace('{{conversation_history}}', conversationHistory)
        .replace('{{user_query}}', userQuery);

      logger.debug(`[TaskEvaluator] Evaluating task completion (iteration ${currentIteration})`);

      // 注意：这里需要调用 LLM 进行评估
      // 但实际实现时，需要传入 llmClient（在调用方传入）
      return {
        isComplete: false,
        reasoning: '需要调用LLM进行详细评估',
        needsMoreWork: true
      };

    } catch (error) {
      logger.error('[TaskEvaluator] Error during evaluation:', error);
      // 出错时保守处理：认为任务未完成
      return {
        isComplete: false,
        reasoning: `评估过程中出错: ${error instanceof Error ? error.message : String(error)}`,
        needsMoreWork: true
      };
    }
  }

  /**
   * 构建对话历史文本
   */
  private buildConversationHistory(messages: Message[]): string {
    return messages
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .map((msg, index) => `${index + 1}. ${msg.role}: ${msg.content}`)
      .join('\n');
  }

  /**
   * 快速评估（不调用 LLM 的轻量级评估）
   * 主要用于流式场景中的快速判断
   */
  quickEvaluate(messages: Message[]): { isLikelyComplete: boolean } {
    const lastMessage = messages[messages.length - 1];
    const lastUserMessage = [...messages].reverse().find(msg => msg.role === 'user');

    // 如果没有用户消息，认为任务未完成
    if (!lastUserMessage) {
      return { isLikelyComplete: false };
    }

    // 如果最后一条消息是 assistant 的回复，且内容足够长（提供了解答）
    // 可以初步判断任务可能完成
    if (
      lastMessage.role === 'assistant' &&
      lastMessage.content &&
      lastMessage.content.length > 50 // 至少有50个字符的回复
    ) {
      return { isLikelyComplete: true };
    }

    return { isLikelyComplete: false };
  }

  getMaxIterations(): number {
    return this.maxIterations;
  }
}
