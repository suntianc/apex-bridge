/**
 * TaskEvaluator - 任务评估器
 *
 * 用于评估任务是否完成，支持自我思考循环
 * 负责 Agent 自主运行的大脑前额叶（负责判断）
 */

import { Message, ChatOptions, LLMResponse } from '../types';
import { logger } from '../utils/logger';

/**
 * LLM 客户端接口（用于解耦）
 */
export interface ILLMClient {
  chat(messages: Message[], options?: ChatOptions): Promise<LLMResponse>;
}

export interface TaskEvaluatorOptions {
  maxIterations?: number;
  completionPrompt?: string;
  model?: string; // 🆕 允许指定用于评估的模型（通常用轻量级模型，如 gpt-4o-mini）
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
  private maxIterations: number;
  private completionPrompt: string;
  private evalModel?: string;

  constructor(options: TaskEvaluatorOptions = {}) {
    this.maxIterations = options.maxIterations || 5;
    this.completionPrompt = options.completionPrompt || DEFAULT_COMPLETION_PROMPT;
    this.evalModel = options.model;
  }

  /**
   * 评估任务是否完成
   * 
   * ✅ 修复：注入 LLM 客户端，实现真正的评估逻辑
   *
   * @param llmClient - LLM 客户端（注入依赖，保持解耦）
   * @param messages - 完整的对话历史
   * @param userQuery - 用户的原始查询
   * @param currentIteration - 当前循环次数
   * @returns 评估结果
   */
  async evaluate(
    llmClient: ILLMClient,
    messages: Message[],
    userQuery: string,
    currentIteration: number
  ): Promise<TaskEvaluation> {
    try {
      // 1. 硬性终止条件
      if (currentIteration >= this.maxIterations) {
        logger.warn(`[TaskEvaluator] Max iterations (${this.maxIterations}) reached, forcing completion`);
        return {
          isComplete: true,
          reasoning: `达到最大循环次数(${this.maxIterations})，强制终止`,
          needsMoreWork: false
        };
      }

      // 2. 构建对话历史文本（限制长度防止 Token 溢出）
      const conversationHistory = this.buildConversationHistory(messages);

      // 3. 构建评估提示
      // ✅ 修复：使用 replaceAll 或确保替换安全
      const promptContent = this.completionPrompt
        .split('{{conversation_history}}').join(conversationHistory)
        .split('{{user_query}}').join(userQuery);

      logger.debug(`[TaskEvaluator] Evaluating task completion (iteration ${currentIteration})`);

      // 4. 调用 LLM 进行"判题"
      // 建议使用 temperature: 0 以获得稳定的判断
      const response = await llmClient.chat([
        { role: 'system', content: promptContent }
      ], {
        temperature: 0, // 稳定的判断
        model: this.evalModel, // 如果指定了专用评估模型则使用
        max_tokens: 500
      });

      const evalText = response.choices[0]?.message?.content || '';
      logger.debug(`[TaskEvaluator] Raw Output: ${evalText.substring(0, 100)}...`);

      // 5. 解析结果
      return this.parseEvaluationResponse(evalText);

    } catch (error) {
      logger.error('[TaskEvaluator] Evaluation failed:', error);
      // 发生错误时，为了防止死循环，保守地认为"未完成"，但在 reasoning 中注明错误
      return {
        isComplete: false,
        reasoning: `评估器故障: ${error instanceof Error ? error.message : 'Unknown error'}`,
        needsMoreWork: true
      };
    }
  }

  /**
   * 解析 LLM 返回的结构化文本
   * 
   * 格式预期：
   * COMPLETE: [是/否]
   * REASONING: ...
   * NEXT_ACTION: ...
   */
  private parseEvaluationResponse(text: string): TaskEvaluation {
    const isCompleteMatch = text.match(/COMPLETE:\s*(是|Yes|True|Ok|完成)/i);
    const reasoningMatch = text.match(/REASONING:\s*([\s\S]*?)(?=NEXT_ACTION:|$)/i);
    const nextActionMatch = text.match(/NEXT_ACTION:\s*([\s\S]*?)$/i);

    const isComplete = !!isCompleteMatch;

    return {
      isComplete,
      needsMoreWork: !isComplete,
      reasoning: reasoningMatch ? reasoningMatch[1].trim() : undefined,
      suggestedNextAction: nextActionMatch ? nextActionMatch[1].trim() : undefined
    };
  }

  /**
   * 构建对话历史文本
   * 
   * ✅ 修复：限制历史长度，防止 Token 溢出（例如只取最后 10 轮）
   */
  private buildConversationHistory(messages: Message[]): string {
    // 限制历史长度，防止 Token 溢出
    const recentMessages = messages.slice(-10);

    return recentMessages
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n');
  }

  /**
   * 快速评估（不调用 LLM 的轻量级评估）
   * 主要用于流式场景中的快速判断
   * 
   * ✅ 修复：使用关键词匹配而不是长度判断，提高准确性
   */
  quickEvaluate(messages: Message[]): { isLikelyComplete: boolean } {
    const lastMessage = messages[messages.length - 1];

    if (lastMessage?.role === 'assistant' && lastMessage.content) {
      const content = lastMessage.content;

      // 简单的关键词启发式检查
      // 检测任务完成的信号词
      const completionKeywords = [
        '任务已完成',
        '任务完成',
        '已完成',
        '完成',
        'Final Answer:',
        'Final Answer',
        '答案：',
        '答案是',
        '结论：',
        '总结：'
      ];

      // 检测未完成的信号词
      const incompleteKeywords = [
        '正在',
        '请稍候',
        '正在处理',
        '正在搜索',
        '正在查询',
        '需要',
        '还需要',
        '下一步',
        '继续'
      ];

      // 如果包含完成关键词，且不包含未完成关键词，则可能完成
      const hasCompletionKeyword = completionKeywords.some(keyword => 
        content.includes(keyword)
      );
      const hasIncompleteKeyword = incompleteKeywords.some(keyword => 
        content.includes(keyword)
      );

      if (hasCompletionKeyword && !hasIncompleteKeyword) {
        return { isLikelyComplete: true };
      }
    }

    return { isLikelyComplete: false };
  }

  getMaxIterations(): number {
    return this.maxIterations;
  }
}
