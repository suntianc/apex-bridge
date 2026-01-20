/**
 * BaseAdapter - LLM适配器基类
 * 提供通用的OpenAI兼容适配器实现
 */

import axios, { AxiosInstance } from "axios";
import { Message, ChatOptions, LLMResponse, LLMProviderConfig } from "../../../types";
import { logger } from "../../../utils/logger";
import { retry, RetryConfig } from "../../../utils/retry";
import { logErrorResponse, createErrorMessage } from "../../../utils/error-serializer";

/**
 * Axios 请求配置接口
 */
export interface AxiosRequestConfig {
  baseURL: string;
  headers: Record<string, string>;
  timeout: number;
  proxy?:
    | false
    | {
        host: string;
        port: number;
        protocol?: string;
        auth?: {
          username: string;
          password: string;
        };
      };
}

/**
 * OpenAI 兼容 API 请求体接口
 */
export interface OpenAIRequestBody {
  model: string;
  messages: Array<{
    role: string;
    content:
      | string
      | Array<{
          type: string;
          text?: string;
          image_url?: string | { url: string };
        }>;
    name?: string;
  }>;
  stream: boolean;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  repetition_penalty?: number;
  seed?: number;
  logit_bias?: Record<string, number>;
  max_tokens?: number;
  response_format?: { type: string };
  stop?: string[];
  tools?: unknown[];
  tool_choice?: string;
}

/**
 * OpenAI 兼容 API 响应接口
 */
export interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message?: {
      role: string;
      content: string;
      tool_calls?: unknown[];
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * LLM适配器接口
 */
export interface ILLMAdapter {
  chat(messages: Message[], options: ChatOptions, signal?: AbortSignal): Promise<LLMResponse>;
  streamChat(
    messages: Message[],
    options: ChatOptions,
    tools?: any[],
    signal?: AbortSignal
  ): AsyncIterableIterator<string>;
  getModels(): Promise<string[]>;
  embed?(texts: string[], model?: string): Promise<number[][]>;
}

/**
 * OpenAI兼容适配器基类
 */
export abstract class BaseOpenAICompatibleAdapter implements ILLMAdapter {
  protected client: AxiosInstance;
  protected providerName: string;
  protected config: LLMProviderConfig;

  constructor(providerName: string, config: LLMProviderConfig) {
    this.providerName = providerName;
    this.config = config;

    // 构建axios配置
    const axiosConfig: AxiosRequestConfig = {
      baseURL: config.baseURL,
      headers: {
        ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
        "Content-Type": "application/json",
      },
      timeout: config.timeout || 60000,
    };

    // 如果配置中指定了proxy，使用它
    if (config.proxy !== undefined) {
      axiosConfig.proxy = config.proxy;
    }

    this.client = axios.create(axiosConfig);

    logger.debug(
      `${providerName} adapter initialized (${config.baseURL}${config.proxy === false ? ", proxy disabled" : ""})`
    );
  }

  /**
   * 过滤选项（子类可覆盖）
   */
  protected filterOptions(options: ChatOptions): ChatOptions {
    return options;
  }

  /**
   * 构建请求体（子类可覆盖）
   * 🆕 支持新的配置结构
   * 🆕 支持多模态消息（文本+图像）
   */
  protected buildRequestBody(messages: Message[], options: ChatOptions): OpenAIRequestBody {
    const { provider, ...apiOptions } = options;
    const filteredOptions = this.filterOptions(apiOptions);

    // 🐾 处理消息格式（支持多模态）
    const processedMessages = messages.map((msg) => {
      if (Array.isArray(msg.content)) {
        // 多模态消息：转换为OpenAI兼容格式
        return {
          ...msg,
          content: msg.content.map((part) => {
            if (part.type === "image_url") {
              return {
                type: "image_url",
                image_url: part.image_url,
              };
            }
            return {
              type: "text",
              text: part.text || "",
            };
          }),
        };
      }
      // 纯文本消息
      return {
        ...msg,
        content: msg.content,
      };
    });

    // 🐾 构建基础请求体
    const requestBody: OpenAIRequestBody = {
      model: options.model || this.config.defaultModel,
      messages: processedMessages as OpenAIRequestBody["messages"],
      stream: false,
      temperature: options.temperature,
    };

    // 🐾 处理温度参数（基础配置）
    if (options.temperature !== undefined) {
      requestBody.temperature = options.temperature;
    }

    // 🐾 处理生成配置（GenerationConfig）
    if (options.generationConfig) {
      const gc = options.generationConfig;

      // Top-P 采样
      if (gc.topP !== undefined) {
        requestBody.top_p = gc.topP;
      }

      // 频率惩罚
      if (gc.frequencyPenalty !== undefined) {
        requestBody.frequency_penalty = gc.frequencyPenalty;
      }

      // 存在惩罚
      if (gc.presencePenalty !== undefined) {
        requestBody.presence_penalty = gc.presencePenalty;
      }

      // 重复惩罚
      if (gc.repetitionPenalty !== undefined) {
        requestBody.repetition_penalty = gc.repetitionPenalty;
      }

      // 随机种子
      if (gc.seed !== undefined) {
        requestBody.seed = gc.seed;
      }

      // Logit 偏差
      if (gc.logitBias) {
        requestBody.logit_bias = gc.logitBias;
      }
    }

    // 🐾 处理输出配置（OutputConfig）
    if (options.outputConfig) {
      const oc = options.outputConfig;

      // 最大输出 tokens
      if (oc.maxOutputTokens !== undefined) {
        requestBody.max_tokens = oc.maxOutputTokens;
      }

      // 输出格式
      if (oc.outputFormat === "json") {
        requestBody.response_format = { type: "json_object" };
      } else if (oc.outputFormat === "text") {
        requestBody.response_format = { type: "text" };
      }

      // 停止序列
      if (oc.stopSequences && oc.stopSequences.length > 0) {
        requestBody.stop = oc.stopSequences;
      }
    }

    return requestBody;
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
        const requestBody = this.buildRequestBody(messages, options);

        logger.debug(`[${this.providerName}] Request body`, {
          model: requestBody.model,
          messageCount: messages.length,
        });

        const response = await this.client.post("/chat/completions", requestBody, {
          signal,
        });

        return response.data;
      } catch (error: any) {
        if (signal?.aborted || error.name === "AbortError" || error.code === "ERR_CANCELED") {
          throw error;
        }

        logErrorResponse(this.providerName, error, "chat");
        throw new Error(createErrorMessage(this.providerName, error));
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
      const { provider, ...apiOptions } = options;
      const filteredOptions = this.filterOptions(apiOptions);

      // 🐾 处理消息格式（支持多模态）
      const processedMessages = messages.map((msg) => {
        if (Array.isArray(msg.content)) {
          return {
            ...msg,
            content: msg.content.map((part) => {
              if (part.type === "image_url") {
                return {
                  type: "image_url",
                  image_url: part.image_url,
                };
              }
              return {
                type: "text",
                text: part.text || "",
              };
            }),
          };
        }
        return {
          ...msg,
          content: msg.content,
        };
      });

      // 🐾 构建基础请求体（与 buildRequestBody 保持一致）
      const requestBody: OpenAIRequestBody = {
        model: options.model || this.config.defaultModel,
        messages: processedMessages,
        stream: true,
        ...filteredOptions,
      };

      // ✅ 新增：传递给LLM的工具列表
      if (tools && tools.length > 0) {
        requestBody.tools = tools;
        requestBody.tool_choice = "auto";
      }

      // 🐾 处理温度参数
      if (options.temperature !== undefined) {
        requestBody.temperature = options.temperature;
      }

      // 🐾 处理生成配置
      if (options.generationConfig) {
        const gc = options.generationConfig;
        if (gc.topP !== undefined) requestBody.top_p = gc.topP;
        if (gc.frequencyPenalty !== undefined) requestBody.frequency_penalty = gc.frequencyPenalty;
        if (gc.presencePenalty !== undefined) requestBody.presence_penalty = gc.presencePenalty;
        if (gc.repetitionPenalty !== undefined)
          requestBody.repetition_penalty = gc.repetitionPenalty;
        if (gc.seed !== undefined) requestBody.seed = gc.seed;
        if (gc.logitBias) requestBody.logit_bias = gc.logitBias;
      }

      // 🐾 处理输出配置
      if (options.outputConfig) {
        const oc = options.outputConfig;
        if (oc.maxOutputTokens !== undefined) requestBody.max_tokens = oc.maxOutputTokens;
        if (oc.outputFormat === "json") {
          requestBody.response_format = { type: "json_object" };
        } else if (oc.outputFormat === "text") {
          requestBody.response_format = { type: "text" };
        }
        if (oc.stopSequences && oc.stopSequences.length > 0) {
          requestBody.stop = oc.stopSequences;
        }
      }

      logger.debug(`[${this.providerName}] Stream request`, {
        model: requestBody.model,
        messageCount: messages.length,
        hasTools: !!tools,
        toolCount: tools?.length,
      });

      const response = await this.client.post("/chat/completions", requestBody, {
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
              logger.warn(
                `[${this.providerName}] Failed to parse stream chunk:`,
                e instanceof Error ? e.message : String(e)
              );
            }
          }
        }
      }
    } catch (error: any) {
      logger.error(`❌ ${this.providerName} stream error:`, error.message);
      if (error.response) {
        logger.error(`   HTTP状态: ${error.response.status}`);
        // 🐛 修复：安全序列化，避免循环引用
        try {
          if (error.response.data && typeof error.response.data === "object") {
            // 只序列化 data 字段，避免序列化整个 response 对象
            logger.error(`   错误详情: ${JSON.stringify(error.response.data, null, 2)}`);
          } else {
            logger.error(`   错误详情: ${error.response.data || "无详细信息"}`);
          }
        } catch (e) {
          // 如果序列化失败，只记录错误消息
          logger.error(`   错误详情: [无法序列化响应数据]`);
        }
      }
      throw new Error(`${this.providerName} stream request failed: ${error.message}`);
    }
  }

  async getModels(): Promise<string[]> {
    try {
      const response = await this.client.get("/models");
      const models = response.data.data || response.data.models || [];
      return models.map((m: any) => m.id || m.name);
    } catch (error: any) {
      logger.warn(`⚠️  Failed to get models from ${this.providerName}:`, error.message);
      throw error;
    }
  }

  /**
   * 生成文本向量嵌入（OpenAI 兼容格式）
   */
  async embed(texts: string[], model?: string): Promise<number[][]> {
    try {
      const requestBody = {
        model: model || this.config.defaultModel,
        input: texts,
      };

      logger.debug(`[${this.providerName}] Embedding request`, {
        model: requestBody.model,
        textCount: texts.length,
      });

      const response = await this.client.post("/embeddings", requestBody);

      // OpenAI 格式: { data: [{ embedding: [...] }] }
      if (response.data?.data) {
        return response.data.data.map((item: any) => item.embedding);
      }

      // Ollama 格式: { embedding: [...] } 或 { embeddings: [[...]] }
      if (response.data?.embedding) {
        return [response.data.embedding];
      }
      if (response.data?.embeddings) {
        return response.data.embeddings;
      }

      throw new Error("Unexpected embedding response format");
    } catch (error: any) {
      logErrorResponse(this.providerName, error, "embed");
      throw new Error(`${this.providerName} embedding failed: ${error.message}`);
    }
  }
}
