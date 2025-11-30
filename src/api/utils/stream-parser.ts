/**
 * 流式输出解析器
 * 处理LLM返回的嵌套JSON格式，提取推理内容和输出内容
 */

/**
 * 解析LLM的chunk内容
 * LLM返回格式：{"content":"{\\"reasoning_content\\":\\"\\n\\"}"}
 * 或 {"content":"{\\"content\\":\\"输出\\"}"}
 *
 * @param chunkContent chunk中的content字符串
 * @returns 解析结果 { isReasoning: boolean, content: string }
 */
export function parseLLMChunk(chunkContent: string): { isReasoning: boolean; content: string } {
  try {
    // 如果内容已经是纯文本（不是JSON），直接返回
    if (!chunkContent.includes('{"') && !chunkContent.includes('{}')) {
      return { isReasoning: false, content: chunkContent };
    }

    // 解析嵌套的JSON字符串
    const parsed = JSON.parse(chunkContent);

    // 如果包含reasoning_content，说明是推理内容
    if (parsed.reasoning_content !== undefined) {
      return {
        isReasoning: true,
        content: parsed.reasoning_content
      };
    }

    // 如果包含content，说明是输出内容
    if (parsed.content !== undefined) {
      return {
        isReasoning: false,
        content: parsed.content
      };
    }

    // 未知格式，返回原字符串
    return { isReasoning: false, content: chunkContent };
  } catch (error) {
    // JSON解析失败，说明是纯文本内容
    return { isReasoning: false, content: chunkContent };
  }
}

/**
 * 解析聚合的LLM输出（用于对话历史存储）
 * 将fullContent字符串解析为推理内容和输出内容
 * 修复: 正确处理代码中的大括号，避免误解析
 * 关键改进: 使用正则表达式完整匹配JSON模板，而非逐字符扫描
 *
 * @param rawContent 收集的原始内容（可能包含多个JSON）
 * @returns 解析后的内容对象 { reasoning: string, content: string }
 */
export function parseAggregatedContent(rawContent: string): {
  reasoning: string;
  content: string;
} {
  const reasoningParts: string[] = [];
  const contentParts: string[] = [];

  // 使用正则表达式匹配完整的JSON模式：
  // {"content":"..."} 或 {"reasoning_content":"..."}
  // 关键点: 字符串内部可以有任意字符，包括代码中的{和}，只要正确转义"
  // 模式解释:
  //   \{  - 匹配{
  //   "(?:content|reasoning_content)":"  - 匹配键名和:"
  //   (?:[^"\\]|\\.)*  - 匹配字符串值: 非"字符或转义序列（包括\", \\, \/等）
  //   "\}  - 匹配闭合的"
  const jsonPattern = /\{"(?:content|reasoning_content)":"(?:[^"\\]|\\.)*"\}/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = jsonPattern.exec(rawContent)) !== null) {
    // 两个JSON之间的内容（原始文本或代码）
    const betweenContent = rawContent.slice(lastIndex, match.index);
    if (betweenContent) {
      // 这是代码或普通文本，直接添加到content
      contentParts.push(betweenContent);
    }

    // 解析匹配的JSON
    try {
      const chunkContent = match[0]; // 完整的JSON字符串
      const parsed = parseLLMChunk(chunkContent);

      if (parsed.isReasoning) {
        reasoningParts.push(parsed.content);
      } else {
        contentParts.push(parsed.content);
      }
    } catch (error) {
      // 解析失败，作为普通内容
      contentParts.push(match[0]);
    }

    lastIndex = jsonPattern.lastIndex;
  }

  // 处理剩余的内容（如果有）
  const remainingContent = rawContent.slice(lastIndex);
  if (remainingContent) {
    contentParts.push(remainingContent);
  }

  return {
    reasoning: reasoningParts.join(''),
    content: contentParts.join('')
  };
}

/**
 * 构建前端渲染格式的内容
 * 推理内容包裹在<thinking>标签中
 *
 * @param content 内容字符串
 * @param isReasoning 是否为推理内容
 * @returns 格式化后的内容
 */
export function buildFrontendContent(content: string, isReasoning: boolean): string {
  if (isReasoning) {
    return `<thinking>${content}</thinking>`;
  }
  return content;
}

/**
 * 批量处理LLM输出，分离推理历史和对话历史
 *
 * @param chunks LLM输出的chunk数组
 * @returns 分离后的结果 { reasoningHistory: string[], contentHistory: string[] }
 */
export function splitLLMOutput(chunks: string[]): {
  reasoningHistory: string[];
  contentHistory: string[];
} {
  const reasoningHistory: string[] = [];
  const contentHistory: string[] = [];

  for (const chunk of chunks) {
    const parsed = parseLLMChunk(chunk);

    if (parsed.isReasoning) {
      reasoningHistory.push(parsed.content);
    } else {
      contentHistory.push(parsed.content);
    }
  }

  return { reasoningHistory, contentHistory };
}
