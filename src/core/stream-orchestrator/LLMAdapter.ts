import { LLMManager } from "../LLMManager";
import type { LLMAdapter, LLMOptions } from "./types";
import { logger } from "../../utils/logger";

/**
 * LLMManager适配器
 * 将LLMManager适配为LLMAdapter接口
 *
 * 负责将 LLMManager 返回的 JSON 字符串格式转换为 ReActEngine 期望的事件格式
 */
export class LLMManagerAdapter implements LLMAdapter {
  private llmManager: LLMManager;

  constructor(llmManager: LLMManager) {
    this.llmManager = llmManager;
  }

  async *streamChat(
    messages: any[],
    options?: LLMOptions,
    tools?: any[],
    signal?: AbortSignal
  ): AsyncGenerator<any, void, void> {
    const stream = this.llmManager.streamChat(messages, options || {}, signal);

    for await (const chunk of stream) {
      // BaseAdapter.streamChat 返回的是 JSON 字符串
      // 格式: {"reasoning_content": "...", "content": "...", "tool_calls": [...]}
      if (typeof chunk === "string") {
        try {
          const parsed = JSON.parse(chunk);

          // 处理深度思考内容
          if (parsed.reasoning_content) {
            yield { type: "reasoning", content: parsed.reasoning_content };
          }

          // 处理普通内容
          if (parsed.content) {
            yield { type: "content", content: parsed.content };
          }

          // 处理工具调用
          if (parsed.tool_calls && parsed.tool_calls.length > 0) {
            yield { type: "tool_calls", tool_calls: parsed.tool_calls };
          }
        } catch (e) {
          // JSON 解析失败，可能是普通文本
          logger.debug(
            "[LLMManagerAdapter] Failed to parse chunk as JSON, treating as content:",
            chunk.substring(0, 100)
          );
          yield { type: "content", content: chunk };
        }
      } else {
        // 已经是对象格式，直接返回
        yield chunk;
      }
    }
  }
}
