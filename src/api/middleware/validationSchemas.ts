/**
 * Validation Schemas - API 端点验证模式定义
 * 
 * 为所有 API 端点定义 JSON Schema 验证模式
 */

import { ValidationSchema } from './validationMiddleware';

/**
 * 聊天补全请求验证模式
 */
export const chatCompletionSchema: ValidationSchema = {
  body: {
    type: 'object',
    required: ['messages'],
    properties: {
      model: {
        type: 'string',
        pattern: '^[a-zA-Z0-9._-]+$',
        maxLength: 100
      },
      messages: {
        type: 'array',
        minItems: 1,
        maxItems: 100,
        items: {
          type: 'object',
          required: ['role', 'content'],
          properties: {
            role: {
              type: 'string',
              enum: ['system', 'user', 'assistant']
            },
            content: {
              type: 'string',
              maxLength: 100000
            },
            name: {
              type: 'string',
              maxLength: 100
            }
          }
        }
      },
      temperature: {
        type: 'number',
        minimum: 0,
        maximum: 2,
        default: 1
      },
      max_tokens: {
        type: 'integer',
        minimum: 1,
        maximum: 4096
      },
      top_p: {
        type: 'number',
        minimum: 0,
        maximum: 1
      },
      frequency_penalty: {
        type: 'number',
        minimum: -2,
        maximum: 2
      },
      presence_penalty: {
        type: 'number',
        minimum: -2,
        maximum: 2
      },
      stop: {
        oneOf: [
          {
            type: 'string',
            maxLength: 100
          },
          {
            type: 'array',
            items: {
              type: 'string',
              maxLength: 100
            },
            maxItems: 4
          }
        ]
      },
      n: {
        type: 'integer',
        minimum: 1,
        maximum: 10
      },
      stream: {
        type: 'boolean',
        default: false
      },
      user: {
        type: 'string',
        maxLength: 100
      },
      agent_id: {
        type: 'string',
        pattern: '^[a-zA-Z0-9._-]+$',
        maxLength: 100
      },
      apexMeta: {
        type: 'object',
        properties: {
          conversationId: {
            type: 'string',
            maxLength: 200
          },
          sessionType: {
            type: 'string',
            enum: ['private', 'group']
          },
          target: {
            type: 'object'
          },
          mentions: {
            type: 'array',
            items: {
              type: 'string'
            }
          }
        }
      }
    }
  }
};

/**
 * 模型列表请求验证模式
 */
export const modelsListSchema: ValidationSchema = {
  query: {
    type: 'object',
    properties: {
      provider: {
        type: 'string',
        pattern: '^[a-zA-Z0-9._-]+$',
        maxLength: 50
      }
    }
  }
};


/**
 * 中断请求验证模式
 */
export const interruptRequestSchema: ValidationSchema = {
  body: {
    type: 'object',
    required: ['requestId'],
    properties: {
      requestId: {
        type: 'string',
        pattern: '^[a-zA-Z0-9._-]+$',
        minLength: 1,
        maxLength: 200
      }
    }
  }
};
