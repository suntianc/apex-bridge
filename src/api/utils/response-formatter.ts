/**
 * 响应格式化工具函数
 * 纯函数，无状态，易于测试
 */

/**
 * 规范化 Usage 统计
 * 支持多种格式的 usage 数据（snake_case 和 camelCase）
 * @param usage 原始的usage数据
 * @returns 规范化的usage对象或null
 */
export function normalizeUsage(usage: any): { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null {
  if (!usage || typeof usage !== 'object') {
    return null;
  }

  const prompt =
    typeof usage.prompt_tokens === 'number'
      ? usage.prompt_tokens
      : typeof usage.promptTokens === 'number'
        ? usage.promptTokens
        : undefined;

  const completion =
    typeof usage.completion_tokens === 'number'
      ? usage.completion_tokens
      : typeof usage.completionTokens === 'number'
        ? usage.completionTokens
        : undefined;

  let total =
    typeof usage.total_tokens === 'number'
      ? usage.total_tokens
      : typeof usage.totalTokens === 'number'
        ? usage.totalTokens
        : undefined;

  // 如果 total 不存在，尝试计算
  if (typeof total !== 'number' && typeof prompt === 'number' && typeof completion === 'number') {
    total = prompt + completion;
  }

  // 验证所有字段都是数字
  if (
    typeof prompt !== 'number' ||
    typeof completion !== 'number' ||
    typeof total !== 'number'
  ) {
    return null;
  }

  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: total
  };
}

/**
 * 构建OpenAI兼容的响应对象
 * @param content 响应内容
 * @param model 使用的模型
 * @param usage usage统计（可选）
 * @returns OpenAI格式的响应对象
 */
export function buildChatResponse(
  content: string,
  model: string,
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null
): any {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant' as const,
        content: content
      },
      finish_reason: 'stop' as const
    }],
    usage: usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };
}
