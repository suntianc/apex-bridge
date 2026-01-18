/**
 * ConversationSaver - 对话历史保存器
 * 负责统一保存对话历史，包含思考过程
 */

import { Message } from "../../types";
import { logger } from "../../utils/logger";
import { ConversationHistoryService } from "../ConversationHistoryService";
import { SessionManager } from "../SessionManager";
import { parseAggregatedContent } from "../../api/utils/stream-parser";

export interface SaveMetadata {
  messageCount: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
}

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

export class ConversationSaver {
  constructor(
    private conversationHistoryService: ConversationHistoryService,
    private sessionManager: SessionManager
  ) {}

  /**
   * 保存对话历史
   */
  async save(
    conversationId: string,
    messages: Message[],
    aiContent: string,
    thinkingProcess?: string[],
    isReAct: boolean = false
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        const count = await this.conversationHistoryService.getMessageCount(conversationId);
        const messagesToSave: Message[] = [];

        const userMessages = messages.filter((m) => m.role === "user");

        if (count === 0) {
          if (userMessages.length > 0) {
            messagesToSave.push(userMessages[userMessages.length - 1]);
          }
        } else {
          if (userMessages.length > 0) {
            messagesToSave.push(userMessages[userMessages.length - 1]);
          }
        }

        const assistantContent = this.formatAssistantContent(aiContent, thinkingProcess, isReAct);

        messagesToSave.push({
          role: "assistant",
          content: assistantContent,
        });

        await this.conversationHistoryService.saveMessages(conversationId, messagesToSave);
        logger.debug(`[ConversationSaver] Saved ${messagesToSave.length} messages to history`);
        return;
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < MAX_RETRY_ATTEMPTS) {
          logger.warn(
            `[ConversationSaver] Failed to save conversation history (attempt ${attempt}/${MAX_RETRY_ATTEMPTS}): ${lastError.message}`
          );
          await this.sleep(RETRY_DELAY_MS * attempt);
        } else {
          logger.error(
            `[ConversationSaver] Failed to save conversation history after ${MAX_RETRY_ATTEMPTS} attempts:`,
            lastError
          );
          this.sendToErrorMonitor(conversationId, lastError);
        }
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private sendToErrorMonitor(conversationId: string, error: Error): void {
    logger.error(`[ConversationSaver] Error monitoring: conversationId=${conversationId}`, {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 格式化AI回复内容
   */
  private formatAssistantContent(
    aiContent: string,
    thinkingProcess?: string[],
    isReAct: boolean = false
  ): string {
    // 先清理错误内容
    const cleanedContent = this.cleanErrorContent(aiContent);

    const parsed = parseAggregatedContent(cleanedContent);

    if (isReAct) {
      const thinkingParts = [];
      if (thinkingProcess?.length > 0) {
        const extractedThinking = this.extractThinkingContent(thinkingProcess);
        thinkingParts.push(`<thinking>${extractedThinking}</thinking>`);
      }
      thinkingParts.push(
        parsed.reasoning
          ? `<thinking>${parsed.reasoning}</thinking> ${parsed.content}`
          : parsed.content
      );
      return thinkingParts.join(" ");
    }

    // 普通模式
    return parsed.reasoning
      ? `<thinking>${parsed.reasoning}</thinking> ${parsed.content}`
      : parsed.content;
  }

  /**
   * 清理错误内容
   * 移除包含错误状态的 tool_output 标签和其他错误信息
   */
  private cleanErrorContent(content: string): string {
    if (!content || typeof content !== "string") {
      return content;
    }

    let cleaned = content;

    // 移除包含错误状态的 tool_output
    // 匹配 <tool_output ... status="error">...</tool_output>
    cleaned = cleaned.replace(
      /<tool_output[^>]*status\s*=\s*["']?error["']?[^>]*>[\s\S]*?<\/tool_output>/gi,
      ""
    );

    // 移除 [SYSTEM_FEEDBACK] 块中的错误内容
    cleaned = cleaned.replace(
      /\[SYSTEM_FEEDBACK\][\s\S]*?status\s*=\s*["']?error["']?[\s\S]*?(?=\[SYSTEM_FEEDBACK\]|$)/gi,
      ""
    );

    // 移除 MCP 错误信息
    cleaned = cleaned.replace(/MCP error[^"\n]*/gi, "");
    cleaned = cleaned.replace(/McpError:[^\n]*/gi, "");
    cleaned = cleaned.replace(/Request timed out/gi, "");

    // 移除错误堆栈相关信息
    cleaned = cleaned.replace(/at McpError\.fromError[^\n]*/gi, "");
    cleaned = cleaned.replace(/at Timeout\.timeoutHandler[^\n]*/gi, "");

    // 清理多余的空白字符
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
    cleaned = cleaned.trim();

    return cleaned;
  }

  /**
   * 提取思考过程内容
   */
  private extractThinkingContent(thinkingProcess: string[]): string {
    const extracted: string[] = [];
    for (const chunk of thinkingProcess) {
      try {
        const cleaned = chunk.replace(/^data:\s*/, "").trim();
        if (cleaned && cleaned !== "[DONE]") {
          if (cleaned.includes("}{")) {
            const jsonObjects = cleaned.split(/\}\{/);
            for (let i = 0; i < jsonObjects.length; i++) {
              let jsonStr = jsonObjects[i];
              if (i > 0) jsonStr = "{" + jsonStr;
              if (i < jsonObjects.length - 1) jsonStr = jsonStr + "}";
              if (jsonStr) {
                const parsed = JSON.parse(jsonStr);
                if (parsed.reasoning_content) {
                  extracted.push(parsed.reasoning_content);
                }
              }
            }
          } else {
            const parsed = JSON.parse(cleaned);
            if (parsed.reasoning_content) {
              extracted.push(parsed.reasoning_content);
            }
          }
        }
      } catch {
        extracted.push(chunk);
      }
    }
    return extracted.join("");
  }

  /**
   * 更新会话元数据
   */
  async updateSessionMetadata(sessionId: string, usage: any): Promise<void> {
    await this.sessionManager.updateMetadata(sessionId, {
      total_tokens: usage.total_tokens,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
    });
  }
}
