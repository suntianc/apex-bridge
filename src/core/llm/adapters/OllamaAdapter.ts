/**
 * Ollama适配器
 */

import { BaseOpenAICompatibleAdapter } from "./BaseAdapter";
import { LLMProviderConfig, Message } from "../../../types";
import { logger } from "../../../utils/logger";
import { TIMEOUT } from "../../../constants";

export class OllamaAdapter extends BaseOpenAICompatibleAdapter {
  constructor(config: LLMProviderConfig) {
    // 对于本地服务，禁用代理
    const enhancedConfig = {
      ...config,
      // 禁用代理，避免localhost请求被转发到代理服务器
      proxy: false,
      // Ollama处理长提示词需要更长时间，设置5分钟超时
      timeout: config.timeout || TIMEOUT.SKILL_CACHE_TTL,
    };

    super("Ollama", enhancedConfig);

    logger.debug("Ollama adapter initialized", {
      baseURL: enhancedConfig.baseURL,
      timeout: enhancedConfig.timeout,
    });
  }

  /**
   * 过滤Ollama不支持的选项
   */
  protected filterOptions(options: any): any {
    const filtered: any = {};

    // Ollama支持的参数
    if (options.model !== undefined) {
      filtered.model = options.model;
    }
    if (options.temperature !== undefined) {
      filtered.temperature = options.temperature;
    }
    if (options.top_p !== undefined) {
      filtered.top_p = options.top_p;
    }
    if (options.max_tokens !== undefined) {
      filtered.num_predict = options.max_tokens; // Ollama使用num_predict而不是max_tokens
    }
    if (options.stop !== undefined) {
      filtered.stop = options.stop;
    }

    return filtered;
  }

  /**
   * 重写 embed 方法，使用 Ollama 的 /api/embeddings 端点
   */
  async embed(texts: string[], model?: string): Promise<number[][]> {
    try {
      // Ollama 0.13.5 使用 prompt 参数，不支持 input 参数
      const requestBody = {
        model: model || this.config.defaultModel,
        prompt: texts[0] || "", // Ollama 只支持单个文本
      };

      logger.debug(`[${this.providerName}] Embedding request`, {
        model: requestBody.model,
        textCount: texts.length,
        textPreview: (texts[0] || "").substring(0, 50),
      });

      // Ollama 使用 /api/embeddings 端点
      const response = await this.client.post("/api/embeddings", requestBody);

      // Ollama 格式: { embedding: [...] } 或 { embeddings: [[...]] }
      if (response.data?.embedding) {
        return [response.data.embedding];
      }
      if (response.data?.embeddings) {
        return response.data.embeddings;
      }

      // OpenAI 兼容格式
      if (response.data?.data) {
        return response.data.data.map((item: any) => item.embedding);
      }

      throw new Error("Unexpected embedding response format");
    } catch (error: any) {
      logger.error(`❌ ${this.providerName} embed error:`, error.message);
      if (error.response) {
        logger.error(`   HTTP状态: ${error.response.status}`);
        try {
          if (error.response.data && typeof error.response.data === "object") {
            logger.error(`   错误详情: ${JSON.stringify(error.response.data, null, 2)}`);
          }
        } catch (e) {
          // 序列化失败
        }
      }
      throw new Error(`${this.providerName} embedding failed: ${error.message}`);
    }
  }

  /**
   * 重写streamChat方法以正确处理多模态消息
   */
  async *streamChat(
    messages: Message[],
    options: any,
    tools?: any[],
    signal?: AbortSignal
  ): AsyncIterableIterator<string> {
    try {
      const { provider, ...apiOptions } = options;
      const filteredOptions = this.filterOptions(apiOptions);

      // 🐾 处理多模态消息（保持OpenAI标准格式）
      // Ollama 0.13.3+ 的 /chat/completions 端点支持 OpenAI 标准的 content 数组格式
      const processedMessages = messages.map((msg) => {
        if (Array.isArray(msg.content)) {
          return {
            role: msg.role,
            content: msg.content.map((part) => {
              if (part.type === "image_url") {
                // 规范化 image_url 格式，确保是 {url: string} 结构
                let imageUrl: string;
                if (typeof part.image_url === "string") {
                  imageUrl = part.image_url;
                } else if (part.image_url?.url) {
                  imageUrl = part.image_url.url;
                } else {
                  imageUrl = "";
                }

                return {
                  type: "image_url",
                  image_url: {
                    url: imageUrl,
                  },
                };
              }
              // text 类型
              return {
                type: "text",
                text: part.text || "",
              };
            }),
          };
        }
        // 普通字符串消息
        return {
          role: msg.role,
          content: msg.content,
        };
      });

      // 🐾 构建请求体 - 明确列出支持的参数
      const requestBody: any = {
        model: filteredOptions.model || options.model || this.config.defaultModel,
        messages: processedMessages,
        stream: true,
      };

      // ✅ 只添加明确支持的参数
      if (filteredOptions.temperature !== undefined) {
        requestBody.temperature = filteredOptions.temperature;
      }
      if (filteredOptions.top_p !== undefined) {
        requestBody.top_p = filteredOptions.top_p;
      }
      if (filteredOptions.num_predict !== undefined) {
        requestBody.num_predict = filteredOptions.num_predict;
      }
      if (filteredOptions.stop !== undefined) {
        requestBody.stop = filteredOptions.stop;
      }

      // ✅ 传递工具列表
      if (tools && tools.length > 0) {
        requestBody.tools = tools;
        requestBody.tool_choice = "auto";
      }

      // 打印请求详情（截断base64图片以避免日志过长）
      const debugRequestBody = JSON.parse(JSON.stringify(requestBody));
      let imageDetails: Array<{
        index: number;
        length: number;
        truncated: boolean;
        prefix: string;
      }> = [];

      if (debugRequestBody.messages) {
        debugRequestBody.messages = debugRequestBody.messages.map((msg: any) => {
          if (Array.isArray(msg.content)) {
            return {
              ...msg,
              content: msg.content.map((part: any, partIndex: number) => {
                if (part.type === "image_url" && part.image_url?.url) {
                  const url = part.image_url.url;
                  const isTruncated = url.length > 100;

                  imageDetails.push({
                    index: partIndex,
                    length: url.length,
                    truncated: isTruncated,
                    prefix: url.substring(0, 50),
                  });

                  return {
                    ...part,
                    image_url: {
                      url: isTruncated
                        ? `${url.substring(0, 100)}... (truncated, total ${url.length} chars)`
                        : url,
                    },
                  };
                }
                return part;
              }),
            };
          }
          return msg;
        });
      }

      logger.info(`[${this.providerName}] Stream request details:`, {
        model: requestBody.model,
        messageCount: messages.length,
        hasTools: !!tools,
        toolCount: tools?.length,
        hasImages: imageDetails.length > 0,
        imageDetails: imageDetails.map((img) => ({
          index: img.index,
          length: img.length,
          truncated: img.truncated,
          prefix: img.prefix,
        })),
      });

      logger.debug(
        `[${this.providerName}] Full request body (images truncated):`,
        JSON.stringify(debugRequestBody, null, 2)
      );

      // 🔍 额外验证：检查实际请求体中的图片数据是否完整
      if (imageDetails.length > 0) {
        console.log("\n==================== 🔍 调试信息 ====================");
        console.log(`消息总数: ${requestBody.messages.length}`);
        requestBody.messages.forEach((msg: any, idx: number) => {
          console.log(`\n消息 #${idx}:`);
          console.log(`  role: ${msg.role}`);
          console.log(
            `  content类型: ${Array.isArray(msg.content) ? "Array" : typeof msg.content}`
          );

          if (Array.isArray(msg.content)) {
            console.log(`  content数组长度: ${msg.content.length}`);
            msg.content.forEach((part: any, partIdx: number) => {
              console.log(`    Part #${partIdx}: type=${part.type}`);
              if (part.type === "text") {
                console.log(`      text: ${part.text?.substring(0, 50)}...`);
              } else if (part.type === "image_url" && part.image_url?.url) {
                const actualUrl = part.image_url.url;
                console.log(`      url长度: ${actualUrl.length}`);
                console.log(`      url前缀: ${actualUrl.substring(0, 50)}`);
                console.log(`      hasDataPrefix: ${actualUrl.startsWith("data:image/")}`);
                console.log(`      hasBase64: ${actualUrl.includes(";base64,")}`);
              }
            });
          } else if (typeof msg.content === "string") {
            console.log(`  content: ${msg.content.substring(0, 100)}...`);
          }
        });
        console.log("====================================================\n");
      }

      const response = await this.client.post("/chat/completions", requestBody, {
        responseType: "stream",
        signal,
      });

      // OpenAI兼容API响应格式：SSE事件流
      for await (const chunk of response.data) {
        const lines = chunk
          .toString()
          .split("\n")
          .filter((line: string) => line.trim());

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.substring(6);

            if (data === "[DONE]") {
              return;
            }

            try {
              const parsed = JSON.parse(data);

              // 提取 reasoning_content (深度思考)
              const reasoning = parsed.choices?.[0]?.delta?.reasoning_content;

              // 提取 content (回答内容)
              const content = parsed.choices?.[0]?.delta?.content;

              // 提取 tool_calls (工具调用)
              const toolCalls = parsed.choices?.[0]?.delta?.tool_calls;

              // 只要有内容就 yield JSON 字符串
              if (reasoning || content || toolCalls) {
                yield JSON.stringify({
                  reasoning_content: reasoning,
                  content: content,
                  tool_calls: toolCalls,
                });
              }
            } catch (e) {
              // 跳过解析错误
            }
          }
        }
      }
    } catch (error: any) {
      logger.error(`❌ ${this.providerName} stream error:`, error.message);
      if (error.response) {
        logger.error(`   HTTP状态: ${error.response.status}`);

        // 尝试读取流式错误响应
        if (error.response.data) {
          try {
            // 如果是流，尝试读取所有数据
            if (
              typeof error.response.data === "object" &&
              typeof error.response.data.on === "function"
            ) {
              let errorData = "";
              error.response.data.on("data", (chunk: Buffer) => {
                errorData += chunk.toString();
              });
              error.response.data.on("end", () => {
                logger.error(`   错误详情 (stream): ${errorData}`);
              });
            } else if (typeof error.response.data === "string") {
              logger.error(`   错误详情: ${error.response.data}`);
            } else if (typeof error.response.data === "object") {
              logger.error(`   错误详情: ${JSON.stringify(error.response.data, null, 2)}`);
            } else {
              logger.error(`   错误详情类型: ${typeof error.response.data}`);
            }
          } catch (e) {
            logger.error(`   错误详情: [解析失败: ${(e as Error).message}]`);
          }
        }

        // 打印请求配置以便调试
        if (error.config) {
          logger.error(`   请求URL: ${error.config.baseURL}${error.config.url}`);
          logger.error(`   请求方法: ${error.config.method}`);
        }
      }
      throw new Error(`${this.providerName} stream request failed: ${error.message}`);
    }
  }
}
