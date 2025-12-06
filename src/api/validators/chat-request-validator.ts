/**
 * Chat请求验证器
 * 纯函数式验证，无状态，易于测试
 */

import type { Message, ChatOptions, ToolDefinition } from '../../types';

/**
 * OpenAI标准聊天参数白名单
 */
const STANDARD_CHAT_PARAMS = new Set([
  'model', 'temperature', 'max_tokens', 'top_p',
  'frequency_penalty', 'presence_penalty',
  'stop', 'n', 'stream', 'user', 'top_k', 'user_prompt'
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
      return { success: false, error: 'messages must be a non-empty array' };
    }

    if (messages.length === 0) {
      return { success: false, error: 'messages array cannot be empty' };
    }

    // 验证每条消息的格式
    for (const msg of messages) {
      if (!msg.role || !['system', 'user', 'assistant'].includes(msg.role)) {
        return { success: false, error: `Invalid message role: ${msg.role}` };
      }
      if (typeof msg.content !== 'string') {
        return { success: false, error: 'message content must be a string' };
      }
    }

    // 提取白名单参数
    const options: ChatRequestOptions = {
      provider: body.provider,
      model: body.model
    };

    for (const key of STANDARD_CHAT_PARAMS) {
      if (key in body && key !== 'provider' && key !== 'model') {
        (options as any)[key] = body[key];
      }
    }

    // 确保stream是布尔值
    options.stream = options.stream === true;

    // 提取userId
    options.userId = body.user_id || body.user;

    // 提取agentId
    options.agentId = body.agent_id || body.agentId ||
                      (typeof body.apexMeta === 'object' ? body.apexMeta?.agentId : undefined);

    // 提取或生成conversationId
    options.conversationId = body.conversation_id || body.conversationId ||
                            (typeof body.apexMeta === 'object' ? body.apexMeta?.conversationId : undefined);

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
    }

    return { success: true, data: options };

  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to parse chat request' };
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
    if (typeof selfThinking.enabled !== 'boolean') {
      return { success: false, error: 'selfThinking.enabled must be a boolean' };
    }

    const config: SelfThinkingConfig = {
      enabled: selfThinking.enabled
    };

    // maxIterations必须是正整数（如果提供）
    if (selfThinking.maxIterations !== undefined) {
      if (typeof selfThinking.maxIterations !== 'number' || selfThinking.maxIterations < 1) {
        return { success: false, error: 'selfThinking.maxIterations must be a positive integer' };
      }
      config.maxIterations = selfThinking.maxIterations;
    }

    // includeThoughtsInResponse必须是boolean（如果提供）
    if (selfThinking.includeThoughtsInResponse !== undefined) {
      if (typeof selfThinking.includeThoughtsInResponse !== 'boolean') {
        return { success: false, error: 'selfThinking.includeThoughtsInResponse must be a boolean' };
      }
      config.includeThoughtsInResponse = selfThinking.includeThoughtsInResponse;
    }

    // enableStreamThoughts必须是boolean（如果提供）
    if (selfThinking.enableStreamThoughts !== undefined) {
      if (typeof selfThinking.enableStreamThoughts !== 'boolean') {
        return { success: false, error: 'selfThinking.enableStreamThoughts must be a boolean' };
      }
      config.enableStreamThoughts = selfThinking.enableStreamThoughts;
    }

    // systemPrompt必须是string（如果提供）
    if (selfThinking.systemPrompt !== undefined) {
      if (typeof selfThinking.systemPrompt !== 'string') {
        return { success: false, error: 'selfThinking.systemPrompt must be a string' };
      }
      config.systemPrompt = selfThinking.systemPrompt;
    }

    // additionalPrompts必须是string数组（如果提供）
    if (selfThinking.additionalPrompts !== undefined) {
      if (!Array.isArray(selfThinking.additionalPrompts) ||
          !selfThinking.additionalPrompts.every(p => typeof p === 'string')) {
        return { success: false, error: 'selfThinking.additionalPrompts must be an array of strings' };
      }
      config.additionalPrompts = selfThinking.additionalPrompts;
    }

    // tools验证
    if (selfThinking.tools !== undefined) {
      if (!Array.isArray(selfThinking.tools)) {
        return { success: false, error: 'selfThinking.tools must be an array' };
      }

      for (const tool of selfThinking.tools) {
        if (!tool.name || typeof tool.name !== 'string') {
          return { success: false, error: 'Each tool must have a name (string)' };
        }
        if (!tool.description || typeof tool.description !== 'string') {
          return { success: false, error: `Tool ${tool.name} must have a description (string)` };
        }
      }

      config.tools = selfThinking.tools;
    }

    return { success: true, data: config };

  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to validate selfThinking config' };
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
  [key: string]: any;
}
