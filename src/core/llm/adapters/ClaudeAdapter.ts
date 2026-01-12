/**
 * Claude适配器（Anthropic API）
 */

import axios, { AxiosInstance } from "axios";
import { Message, ChatOptions, LLMResponse, LLMProviderConfig } from "../../../types";
import { logger } from "../../../utils/logger";
import { retry, RetryConfig } from "../../../utils/retry";
import { ILLMAdapter } from "./BaseAdapter";

export class ClaudeAdapter implements ILLMAdapter {
  private client: AxiosInstance;

  constructor(private config: LLMProviderConfig) {
    this.client = axios.create({
      baseURL: this.config.baseURL,
      headers: {
        "x-api-key": this.config.apiKey || "",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      timeout: this.config.timeout || 60000,
    });

    logger.debug(`Claude adapter initialized (${this.config.baseURL})`);
  }

  async chat(
    messages: Message[],
    options: ChatOptions,
    signal?: AbortSignal
  ): Promise<LLMResponse> {
    const maxRetries = this.config.maxRetries || 3;
    const retryConfig: RetryConfig = {
      maxRetries,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      retryOn4xx: false,
      shouldRetry: (error: any) => {
        if (signal?.aborted || error.name === "AbortError" || error.code === "ERR_CANCELED") {
          return false;
        }
        if (
          error.response?.status === 400 ||
          error.response?.status === 401 ||
          error.response?.status === 403 ||
          error.response?.status === 404
        ) {
          return false;
        }
        return true;
      },
    };

    return retry(async () => {
      try {
        const systemMessages = messages.filter((m) => m.role === "system");
        const otherMessages = messages.filter((m) => m.role !== "system");

        const response = await this.client.post(
          "/messages",
          {
            model: options.model || this.config.defaultModel,
            max_tokens: options.max_tokens || 4096,
            temperature: options.temperature ?? 0.7,
            system: systemMessages.map((m) => m.content).join("\n\n") || undefined,
            messages: otherMessages.map((m) => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: m.content,
            })),
            stream: false,
          },
          {
            signal,
          }
        );

        // 转换为OpenAI格式
        return {
          id: response.data.id,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: response.data.model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: response.data.content[0]?.text || "",
              },
              finish_reason: response.data.stop_reason,
            },
          ],
        };
      } catch (error: any) {
        if (signal?.aborted || error.name === "AbortError" || error.code === "ERR_CANCELED") {
          throw error;
        }

        logger.error("❌ Claude chat error:", error.message);
        throw new Error(`Claude request failed: ${error.message}`);
      }
    }, retryConfig);
  }

  async *streamChat(
    messages: Message[],
    options: ChatOptions,
    tools?: any[],
    signal?: AbortSignal
  ): AsyncIterableIterator<string> {
    try {
      const systemMessages = messages.filter((m) => m.role === "system");
      const otherMessages = messages.filter((m) => m.role !== "system");

      // 构建请求体
      const requestBody: any = {
        model: options.model || this.config.defaultModel,
        max_tokens: options.max_tokens || 4096,
        temperature: options.temperature ?? 0.7,
        system: systemMessages.map((m) => m.content).join("\n\n") || undefined,
        messages: otherMessages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
        stream: true,
      };

      // Claude目前不直接支持tools参数，需要特殊处理
      // 将工具描述添加到system message中
      if (tools && tools.length > 0) {
        const toolsDescription = tools
          .map((tool: any) => {
            const func = tool.function || {};
            return `
## Tool: ${func.name}
Description: ${func.description}
Parameters: ${JSON.stringify(func.parameters, null, 2)}
`;
          })
          .join("\n");

        if (requestBody.system) {
          requestBody.system += `\n\n# Available Tools\n${toolsDescription}`;
        } else {
          requestBody.system = `# Available Tools\n${toolsDescription}`;
        }
      }

      const response = await this.client.post("/messages", requestBody, {
        responseType: "stream",
        signal,
      });

      for await (const chunk of response.data) {
        const lines = chunk
          .toString()
          .split("\n")
          .filter((line: string) => line.trim());

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.substring(6);

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === "content_block_delta") {
                const content = parsed.delta?.text;
                if (content) {
                  yield content;
                }
              }
            } catch (e) {
              // Skip parse errors
            }
          }
        }
      }
    } catch (error: any) {
      logger.error("❌ Claude stream error:", error.message);
      throw new Error(`Claude stream request failed: ${error.message}`);
    }
  }

  async getModels(): Promise<string[]> {
    // Claude不提供模型列表API，返回常用模型
    return [
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
      "claude-3-sonnet-20240229",
      "claude-3-haiku-20240307",
    ];
  }
}
