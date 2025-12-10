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
      selfThinking: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean'
          },
          maxIterations: {
            type: 'integer',
            minimum: 1,
            maximum: 20,
            default: 5
          },
          includeThoughtsInResponse: {
            type: 'boolean',
            default: true
          },
          systemPrompt: {
            type: 'string',
            maxLength: 10000
          },
          additionalPrompts: {
            type: 'array',
            items: {
            type: 'string',
            maxLength: 2000
          },
            maxItems: 10
          },
          tools: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  pattern: '^[a-zA-Z0-9_]+$',
                  maxLength: 50
                },
                description: {
                  type: 'string',
                  maxLength: 500
                },
                parameters: {
                  type: 'object'
                }
              },
              required: ['name', 'description', 'parameters']
            },
            maxItems: 20
          },
          enableStreamThoughts: {
            type: 'boolean',
            default: false
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
 * 简化流式聊天请求验证模式（专为前端看板娘设计）
 */
export const simpleStreamSchema: ValidationSchema = {
  body: {
    type: 'object',
    required: ['messages', 'model'],
    properties: {
      messages: {
        type: 'array',
        minItems: 1,
        maxItems: 50, // 简化接口限制消息数量
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
              maxLength: 50000 // 简化接口限制内容长度
            }
          }
        }
      },
      model: {
        type: 'string',
        pattern: '^[a-zA-Z0-9._-]+$',
        maxLength: 100
      },
      temperature: {
        type: 'number',
        minimum: 0,
        maximum: 2
      },
      max_tokens: {
        type: 'number',
        minimum: 1,
        maximum: 10000
      },
      user: {
        type: 'string',
        maxLength: 100
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

/**
 * 模型预添加验证模式
 */
export const validateModelBeforeAddSchema: ValidationSchema = {
  body: {
    type: 'object',
    required: ['provider', 'baseConfig', 'model'],
    properties: {
      provider: {
        type: 'string',
        enum: ['openai', 'deepseek', 'zhipu', 'claude', 'ollama', 'custom']
      },
      baseConfig: {
        type: 'object',
        required: ['apiKey'],
        properties: {
          apiKey: {
            type: 'string',
            minLength: 1
          },
          baseURL: {
            type: 'string',
            format: 'uri',
            pattern: '^https?://'
          },
          timeout: {
            type: 'integer',
            minimum: 1000,
            maximum: 60000
          },
          maxRetries: {
            type: 'integer',
            minimum: 0,
            maximum: 5
          }
        }
      },
      model: {
        type: 'string',
        pattern: '^[a-zA-Z0-9._-]+$',
        minLength: 1,
        maxLength: 100
      }
    }
  }
};
