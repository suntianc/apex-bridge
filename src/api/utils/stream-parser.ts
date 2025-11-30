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

  // 遍历并解析每一段内容
  // 注意：这里假设rawContent是通过累加chunk得到的，每个chunk可能是一个JSON字符串
  let buffer = '';
  let inJson = false;
  let braceCount = 0;

  for (let i = 0; i < rawContent.length; i++) {
    const char = rawContent[i];

    if (char === '{') {
      if (braceCount === 0) {
        // 开始新的JSON
        buffer = char;
        inJson = true;
      } else {
        buffer += char;
      }
      braceCount++;
    } else if (char === '}' && inJson) {
      braceCount--;
      buffer += char;

      if (braceCount === 0) {
        // JSON完成，解析它
        try {
          const parsed = parseLLMChunk(buffer);
          if (parsed.isReasoning) {
            reasoningParts.push(parsed.content);
          } else {
            contentParts.push(parsed.content);
          }
        } catch (error) {
          // 解析失败，作为普通内容
          contentParts.push(buffer);
        }
        buffer = '';
        inJson = false;
      }
    } else if (inJson) {
      buffer += char;
    }
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
