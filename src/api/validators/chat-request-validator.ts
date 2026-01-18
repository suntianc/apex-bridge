/**
 * Chat请求验证器
 * 纯函数式验证，无状态，易于测试
 */

import type { ToolDefinition } from "../../types";

/**
 * OpenAI标准聊天参数白名单
 */
const STANDARD_CHAT_PARAMS = new Set([
  "model",
  "temperature",
  "max_tokens",
  "top_p",
  "frequency_penalty",
  "presence_penalty",
  "stop",
  "n",
  "stream",
  "user",
  "top_k",
  "user_prompt",
]);

/**
 * Self-Thinking配置接口
 */
export interface SelfThinkingConfig {
  enabled: boolean;
  maxIterations?: number;
  includeThoughtsInResponse?: boolean;
  systemPrompt?: string;
  additionalPrompts?: string[];
  tools?: ToolDefinition[];
  enableStreamThoughts?: boolean;
}

/**
 * 验证结果接口
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 解析并验证Chat请求
 * @param body 请求体
 * @returns 验证结果
 */
export function parseChatRequest(body: any): ValidationResult<ChatRequestOptions> {
  try {
    // 验证messages格式
    const messages = body.messages;
    if (!messages || !Array.isArray(messages)) {
      return { success: false, error: "messages must be a non-empty array" };
    }

    if (messages.length === 0) {
      return { success: false, error: "messages array cannot be empty" };
    }

    // 验证每条消息的格式
    for (const msg of messages) {
      if (!msg.role || !["system", "user", "assistant"].includes(msg.role)) {
        return { success: false, error: `Invalid message role: ${msg.role}` };
      }

      // 验证content格式：支持string或ContentPart[]
      if (typeof msg.content === "string") {
        // 文本内容
        if (msg.content.length === 0) {
          return { success: false, error: "message content cannot be empty" };
        }
      } else if (Array.isArray(msg.content)) {
        // 多模态内容
        if (msg.content.length === 0) {
          return { success: false, error: "message content array cannot be empty" };
        }

        // 验证每个ContentPart
        for (const part of msg.content) {
          if (!part.type || !["text", "image_url"].includes(part.type)) {
            return { success: false, error: `Invalid content part type: ${part.type}` };
          }

          if (part.type === "text") {
            if (typeof part.text !== "string" || part.text.length === 0) {
              return { success: false, error: "text part must have non-empty text" };
            }
          } else if (part.type === "image_url") {
            if (!part.image_url) {
              return { success: false, error: "image_url part must have image_url" };
            }
          }
        }
      } else {
        return { success: false, error: "message content must be a string or array" };
      }
    }

    // 提取白名单参数
    const options: ChatRequestOptions = {
      provider: body.provider,
      model: body.model,
    };

    for (const key of STANDARD_CHAT_PARAMS) {
      if (key in body && key !== "provider" && key !== "model") {
        options[key] = body[key];
      }
    }

    // 确保stream是布尔值
    options.stream = options.stream === true;

    // 提取userId
    options.userId = body.user_id || body.user;

    // 提取agentId
    options.agentId =
      body.agent_id ||
      body.agentId ||
      (typeof body.apexMeta === "object" ? body.apexMeta?.agentId : undefined);

    // 提取或生成conversationId
    options.conversationId =
      body.conversation_id ||
      body.conversationId ||
      (typeof body.apexMeta === "object" ? body.apexMeta?.conversationId : undefined);

    if (!options.conversationId) {
      options.conversationId = generateConversationId();
    }

    // 验证selfThinking配置
    if (body.selfThinking) {
      const result = validateSelfThinking(body.selfThinking);
      if (!result.success) {
        return result;
      }
      options.selfThinking = result.data;
    } else {
      options.selfThinking = { enabled: true };
    }

    // 解析contextCompression配置
    if (body.contextCompression) {
      const ccResult = validateContextCompression(body.contextCompression);
      if (!ccResult.success) {
        return { success: false, error: ccResult.error };
      }
      options.contextCompression = ccResult.data;
    }

    return { success: true, data: options };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to parse chat request" };
  }
}

/**
 * 验证上下文压缩配置
 */
export function validateContextCompression(
  config: any
): ValidationResult<ContextCompressionConfig> {
  try {
    const result: ContextCompressionConfig = {};

    if (config.enabled !== undefined && typeof config.enabled !== "boolean") {
      return { success: false, error: "contextCompression.enabled must be a boolean" };
    }
    result.enabled = config.enabled;

    if (config.strategy !== undefined) {
      const validStrategies = ["truncate", "prune", "summary", "hybrid"];
      if (!validStrategies.includes(config.strategy)) {
        return {
          success: false,
          error: `contextCompression.strategy must be one of: ${validStrategies.join(", ")}`,
        };
      }
      result.strategy = config.strategy;
    }

    if (config.contextLimit !== undefined) {
      if (typeof config.contextLimit !== "number" || config.contextLimit < 1) {
        return {
          success: false,
          error: "contextCompression.contextLimit must be a positive number",
        };
      }
      result.contextLimit = config.contextLimit;
    }

    if (config.outputReserve !== undefined) {
      if (typeof config.outputReserve !== "number" || config.outputReserve < 0) {
        return {
          success: false,
          error: "contextCompression.outputReserve must be a non-negative number",
        };
      }
      result.outputReserve = config.outputReserve;
    }

    if (
      config.preserveSystemMessage !== undefined &&
      typeof config.preserveSystemMessage !== "boolean"
    ) {
      return {
        success: false,
        error: "contextCompression.preserveSystemMessage must be a boolean",
      };
    }
    result.preserveSystemMessage = config.preserveSystemMessage;

    if (config.minMessageCount !== undefined) {
      if (typeof config.minMessageCount !== "number" || config.minMessageCount < 0) {
        return {
          success: false,
          error: "contextCompression.minMessageCount must be a non-negative number",
        };
      }
      result.minMessageCount = config.minMessageCount;
    }

    // 验证openCodeConfig
    if (config.openCodeConfig) {
      const openCodeConfig: ContextCompressionConfig["openCodeConfig"] = {};

      if (
        config.openCodeConfig.auto !== undefined &&
        typeof config.openCodeConfig.auto !== "boolean"
      ) {
        return {
          success: false,
          error: "contextCompression.openCodeConfig.auto must be a boolean",
        };
      }
      openCodeConfig.auto = config.openCodeConfig.auto;

      if (
        config.openCodeConfig.prune !== undefined &&
        typeof config.openCodeConfig.prune !== "boolean"
      ) {
        return {
          success: false,
          error: "contextCompression.openCodeConfig.prune must be a boolean",
        };
      }
      openCodeConfig.prune = config.openCodeConfig.prune;

      if (config.openCodeConfig.overflowThreshold !== undefined) {
        if (
          typeof config.openCodeConfig.overflowThreshold !== "number" ||
          config.openCodeConfig.overflowThreshold < 0
        ) {
          return {
            success: false,
            error:
              "contextCompression.openCodeConfig.overflowThreshold must be a non-negative number",
          };
        }
        openCodeConfig.overflowThreshold = config.openCodeConfig.overflowThreshold;
      }

      if (
        config.openCodeConfig.protectTools !== undefined &&
        typeof config.openCodeConfig.protectTools !== "boolean"
      ) {
        return {
          success: false,
          error: "contextCompression.openCodeConfig.protectTools must be a boolean",
        };
      }
      openCodeConfig.protectTools = config.openCodeConfig.protectTools;

      if (
        config.openCodeConfig.summaryOnSevere !== undefined &&
        typeof config.openCodeConfig.summaryOnSevere !== "boolean"
      ) {
        return {
          success: false,
          error: "contextCompression.openCodeConfig.summaryOnSevere must be a boolean",
        };
      }
      openCodeConfig.summaryOnSevere = config.openCodeConfig.summaryOnSevere;

      if (config.openCodeConfig.severeThreshold !== undefined) {
        if (
          typeof config.openCodeConfig.severeThreshold !== "number" ||
          config.openCodeConfig.severeThreshold < 0 ||
          config.openCodeConfig.severeThreshold > 1
        ) {
          return {
            success: false,
            error:
              "contextCompression.openCodeConfig.severeThreshold must be a number between 0 and 1",
          };
        }
        openCodeConfig.severeThreshold = config.openCodeConfig.severeThreshold;
      }

      result.openCodeConfig = openCodeConfig;
    }

    return { success: true, data: result };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to validate context compression config",
    };
  }
}

/**
 * 验证Self-Thinking配置
 * @param selfThinking 配置对象
 * @returns 验证结果
 */
export function validateSelfThinking(selfThinking: any): ValidationResult<SelfThinkingConfig> {
  try {
    // enabled必须是boolean
    if (typeof selfThinking.enabled !== "boolean") {
      return { success: false, error: "selfThinking.enabled must be a boolean" };
    }

    const config: SelfThinkingConfig = {
      enabled: selfThinking.enabled,
    };

    // maxIterations必须是正整数（如果提供）
    if (selfThinking.maxIterations !== undefined) {
      if (typeof selfThinking.maxIterations !== "number" || selfThinking.maxIterations < 1) {
        return { success: false, error: "selfThinking.maxIterations must be a positive integer" };
      }
      config.maxIterations = selfThinking.maxIterations;
    }

    // includeThoughtsInResponse必须是boolean（如果提供）
    if (selfThinking.includeThoughtsInResponse !== undefined) {
      if (typeof selfThinking.includeThoughtsInResponse !== "boolean") {
        return {
          success: false,
          error: "selfThinking.includeThoughtsInResponse must be a boolean",
        };
      }
      config.includeThoughtsInResponse = selfThinking.includeThoughtsInResponse;
    }

    // enableStreamThoughts必须是boolean（如果提供）
    if (selfThinking.enableStreamThoughts !== undefined) {
      if (typeof selfThinking.enableStreamThoughts !== "boolean") {
        return { success: false, error: "selfThinking.enableStreamThoughts must be a boolean" };
      }
      config.enableStreamThoughts = selfThinking.enableStreamThoughts;
    }

    // systemPrompt必须是string（如果提供）
    if (selfThinking.systemPrompt !== undefined) {
      if (typeof selfThinking.systemPrompt !== "string") {
        return { success: false, error: "selfThinking.systemPrompt must be a string" };
      }
      config.systemPrompt = selfThinking.systemPrompt;
    }

    // additionalPrompts必须是string数组（如果提供）
    if (selfThinking.additionalPrompts !== undefined) {
      if (
        !Array.isArray(selfThinking.additionalPrompts) ||
        !selfThinking.additionalPrompts.every((p: string) => typeof p === "string")
      ) {
        return {
          success: false,
          error: "selfThinking.additionalPrompts must be an array of strings",
        };
      }
      config.additionalPrompts = selfThinking.additionalPrompts;
    }

    // tools验证
    if (selfThinking.tools !== undefined) {
      if (!Array.isArray(selfThinking.tools)) {
        return { success: false, error: "selfThinking.tools must be an array" };
      }

      for (const tool of selfThinking.tools) {
        if (!tool.name || typeof tool.name !== "string") {
          return { success: false, error: "Each tool must have a name (string)" };
        }
        if (!tool.description || typeof tool.description !== "string") {
          return { success: false, error: `Tool ${tool.name} must have a description (string)` };
        }
      }

      config.tools = selfThinking.tools;
    }

    return { success: true, data: config };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to validate selfThinking config" };
  }
}

/**
 * 生成Conversation ID
 * @returns 格式化的ID
 */
export function generateConversationId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `conv_${timestamp}_${random}`;
}

/**
 * Chat请求选项接口
 */
export interface ChatRequestOptions {
  provider?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  n?: number;
  stream?: boolean;
  user?: string;
  top_k?: number;
  agentId?: string;
  userId?: string;
  conversationId?: string;
  selfThinking?: SelfThinkingConfig;
  contextCompression?: ContextCompressionConfig;
  [key: string]: any;
}

/**
 * 上下文压缩配置接口
 */
export interface ContextCompressionConfig {
  enabled?: boolean;
  strategy?: "truncate" | "prune" | "summary" | "hybrid";
  contextLimit?: number;
  outputReserve?: number;
  preserveSystemMessage?: boolean;
  minMessageCount?: number;
  openCodeConfig?: {
    auto?: boolean;
    prune?: boolean;
    overflowThreshold?: number;
    protectTools?: boolean;
    summaryOnSevere?: boolean;
    severeThreshold?: number;
  };
}
