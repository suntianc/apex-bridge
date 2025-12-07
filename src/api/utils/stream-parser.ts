/**
 * 流式输出解析器
 * 处理LLM返回的嵌套JSON格式，提取推理内容和输出内容
 */

/**
 * 解析LLM的chunk内容（支持嵌套JSON）
 * LLM返回格式：{"content":"{\\"reasoning_content\\":\\"\\n\\"}"}
 * 或 {"content":"输出"} 或 {"reasoning_content":"。","content":null}
 *
 * @param chunkContent chunk中的content字符串
 * @returns 解析结果 { isReasoning: boolean, content: string }
 */
export function parseLLMChunk(chunkContent: string): { isReasoning: boolean; content: string } {
  try {
    // 第一次解析：尝试解析外层的JSON
    const parsed = JSON.parse(chunkContent);

    // 如果包含嵌套JSON字符串（如glm-4的格式）
    if (parsed.content && typeof parsed.content === 'string' && parsed.content.includes('{"')) {
      try {
        // 第二次解析：解析内层JSON
        const nested = JSON.parse(parsed.content);
        
        // 优先判断内层是否有reasoning_content
        if (nested.reasoning_content !== undefined && nested.reasoning_content !== null) {
          return { isReasoning: true, content: nested.reasoning_content };
        }
        if (nested.content !== undefined && nested.content !== null) {
          return { isReasoning: false, content: nested.content };
        }
      } catch {
        // 内层解析失败，使用外层content作为普通文本
        return { isReasoning: false, content: parsed.content };
      }
    }

    // 处理非嵌套格式（如直接返回的JSON）
    if (parsed.reasoning_content !== undefined && parsed.reasoning_content !== null) {
      return { isReasoning: true, content: parsed.reasoning_content };
    }
    
    if (parsed.content !== undefined && parsed.content !== null) {
      return { isReasoning: false, content: parsed.content };
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
 * 支持格式：
 * - {"reasoning_content":"思考","content":"输出"}
 * - {"reasoning_content":"思考"}{"content":"输出"}
 * - 普通文本和代码片段
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

  // 改进的正则：匹配完整的JSON对象，支持两个键值对和null值
  // 支持格式：{"key":"value"} 或 {"key1":"val1","key2":null}
  const jsonPattern = /\{(?:"(?:content|reasoning_content)":(?:"(?:[^"\\]|\\.)*"|null)(?:,(?:"(?:content|reasoning_content)":(?:"(?:[^"\\]|\\.)*"|null)))?)\}/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = jsonPattern.exec(rawContent)) !== null) {
    // 添加JSON之间的内容（代码或普通文本）
    const betweenContent = rawContent.slice(lastIndex, match.index);
    if (betweenContent) {
      contentParts.push(betweenContent);
    }

    // 解析JSON，提取内容
    const parsed = parseLLMChunk(match[0]);
    if (parsed.isReasoning) {
      reasoningParts.push(parsed.content);
    } else {
      contentParts.push(parsed.content);
    }

    lastIndex = jsonPattern.lastIndex;
  }

  // 处理剩余内容
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
 */
export function buildFrontendContent(content: string, isReasoning: boolean): string {
  return isReasoning ? `<thinking>${content}</thinking>` : content;
}

/**
 * 批量处理LLM输出，分离推理历史和对话历史
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