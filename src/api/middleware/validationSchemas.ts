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
              enum: ['system', 'user', 'assistant', 'tool']
            },
            content: {
              type: 'string',
              maxLength: 100000
            },
            name: {
              type: 'string',
              maxLength: 100
            },
            tool_calls: {
              type: 'array',
              items: {
                type: 'object'
              }
            },
            tool_call_id: {
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
 * 人格创建/更新验证模式
 */
export const personalitySchema: ValidationSchema = {
  body: {
    type: 'object',
    required: ['personaId', 'name'],
    properties: {
      personaId: {
        type: 'string',
        pattern: '^[a-zA-Z0-9._-]+$',
        minLength: 3,
        maxLength: 50
      },
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 100
      },
      description: {
        type: 'string',
        maxLength: 500
      },
      systemPrompt: {
        type: 'string',
        maxLength: 50000
      },
      temperature: {
        type: 'number',
        minimum: 0,
        maximum: 2
      },
      metadata: {
        type: 'object'
      }
    }
  }
};

/**
 * 人格 ID 路径参数验证模式
 */
export const personalityIdSchema: ValidationSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: {
        type: 'string',
        pattern: '^[\\w\\u4e00-\\u9fa5-]+$',
        minLength: 3,
        maxLength: 50
      }
    }
  }
};

/**
 * 节点注册验证模式
 */
export const nodeRegistrationSchema: ValidationSchema = {
  body: {
    type: 'object',
    required: ['name', 'type'],
    properties: {
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 100
      },
      type: {
        type: 'string',
        enum: ['companion', 'worker']
      },
      capabilities: {
        type: 'array',
        items: {
          type: 'string'
        },
        maxItems: 50
      },
      tools: {
        type: 'array',
        items: {
          type: 'string'
        },
        maxItems: 100
      },
      metadata: {
        type: 'object'
      }
    }
  }
};

/**
 * 节点 ID 路径参数验证模式
 */
export const nodeIdSchema: ValidationSchema = {
  params: {
    type: 'object',
    required: ['nodeId'],
    properties: {
      nodeId: {
        type: 'string',
        pattern: '^[a-zA-Z0-9._-]+$',
        minLength: 1,
        maxLength: 100
      }
    }
  }
};

/**
 * 配置更新验证模式
 */
export const configUpdateSchema: ValidationSchema = {
  body: {
    type: 'object',
    properties: {
      config: {
        type: 'object'
      }
    },
    required: ['config']
  }
};

/**
 * 通用 ID 路径参数验证模式
 */
export const idParamSchema: ValidationSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: {
        type: 'string',
        pattern: '^[a-zA-Z0-9._-]+$',
        minLength: 1,
        maxLength: 100
      }
    }
  }
};

/**
 * 分页查询参数验证模式
 */
export const paginationQuerySchema: ValidationSchema = {
  query: {
    type: 'object',
    properties: {
      page: {
        type: 'integer',
        minimum: 1,
        default: 1
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 20
      },
      sort: {
        type: 'string',
        pattern: '^[a-zA-Z0-9._-]+$',
        maxLength: 50
      },
      order: {
        type: 'string',
        enum: ['asc', 'desc'],
        default: 'desc'
      }
    }
  }
};

/**
 * 人格创建请求验证模式（包含id和config）
 */
export const personalityCreateSchema: ValidationSchema = {
  body: {
    type: 'object',
    required: ['id', 'config'],
    properties: {
      id: {
        type: 'string',
        pattern: '^[\\w\\u4e00-\\u9fa5-]+$',
        minLength: 3,
        maxLength: 50
      },
      config: {
        type: 'object',
        required: ['personaId', 'name'],
        properties: {
          personaId: {
            type: 'string',
            pattern: '^[\\w\\u4e00-\\u9fa5-]+$',
            minLength: 3,
            maxLength: 50
          },
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 100
          },
          description: {
            type: 'string',
            maxLength: 500
          },
          systemPrompt: {
            type: 'string',
            maxLength: 50000
          },
          temperature: {
            type: 'number',
            minimum: 0,
            maximum: 2
          },
          metadata: {
            type: 'object',
            properties: {
              version: {
                type: 'string',
                maxLength: 20
              }
            }
          }
        }
      }
    }
  }
};

/**
 * 人格更新请求验证模式
 */
export const personalityUpdateSchema: ValidationSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: {
        type: 'string',
        pattern: '^[\\w\\u4e00-\\u9fa5-]+$',
        minLength: 3,
        maxLength: 50
      }
    }
  },
  body: {
    type: 'object',
    properties: {
      personaId: {
        type: 'string',
        pattern: '^[\\w\\u4e00-\\u9fa5-]+$',
        minLength: 3,
        maxLength: 50
      },
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 100
      },
      description: {
        type: 'string',
        maxLength: 500
      },
      systemPrompt: {
        type: 'string',
        maxLength: 50000
      },
      temperature: {
        type: 'number',
        minimum: 0,
        maximum: 2
      },
      metadata: {
        type: 'object'
      }
    }
  }
};

/**
 * 节点更新验证模式
 */
export const nodeUpdateSchema: ValidationSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: {
        type: 'string',
        pattern: '^[a-zA-Z0-9._-]+$',
        minLength: 1,
        maxLength: 100
      }
    }
  },
  body: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 100
      },
      type: {
        type: 'string',
        enum: ['companion', 'worker', 'custom', 'hub']
      },
      capabilities: {
        type: 'array',
        items: {
          type: 'string'
        },
        maxItems: 50
      },
      tools: {
        type: 'array',
        items: {
          type: 'string'
        },
        maxItems: 100
      },
      config: {
        type: 'object'
      },
      personality: {
        type: 'object'
      },
      stats: {
        type: 'object'
      },
      boundPersona: {
        type: 'string',
        maxLength: 50
      },
      boundPersonas: {
        type: 'array',
        items: {
          type: 'string',
          maxLength: 50
        },
        maxItems: 10
      }
    }
  }
};

/**
 * 关系创建验证模式
 */
export const relationshipCreateSchema: ValidationSchema = {
  body: {
    type: 'object',
    required: ['sourceId', 'targetId', 'type'],
    properties: {
      sourceId: {
        type: 'string',
        pattern: '^[a-zA-Z0-9._-]+$',
        minLength: 1,
        maxLength: 100
      },
      targetId: {
        type: 'string',
        pattern: '^[a-zA-Z0-9._-]+$',
        minLength: 1,
        maxLength: 100
      },
      type: {
        type: 'string',
        enum: ['friend', 'enemy', 'neutral', 'family', 'romantic']
      },
      metadata: {
        type: 'object'
      }
    }
  }
};

/**
 * 偏好创建验证模式
 */
export const preferenceCreateSchema: ValidationSchema = {
  body: {
    type: 'object',
    required: ['key', 'value'],
    properties: {
      key: {
        type: 'string',
        pattern: '^[a-zA-Z0-9._-]+$',
        minLength: 1,
        maxLength: 100
      },
      value: {
        oneOf: [
          { type: 'string', maxLength: 1000 },
          { type: 'number' },
          { type: 'boolean' },
          { type: 'object' },
          { type: 'array' }
        ]
      },
      metadata: {
        type: 'object'
      }
    }
  }
};

/**
 * 偏好更新验证模式
 */
export const preferenceUpdateSchema: ValidationSchema = {
  params: {
    type: 'object',
    required: ['key'],
    properties: {
      key: {
        type: 'string',
        pattern: '^[a-zA-Z0-9._-]+$',
        minLength: 1,
        maxLength: 100
      }
    }
  },
  body: {
    type: 'object',
    required: ['value'],
    properties: {
      value: {
        oneOf: [
          { type: 'string', maxLength: 1000 },
          { type: 'number' },
          { type: 'boolean' },
          { type: 'object' },
          { type: 'array' }
        ]
      },
      metadata: {
        type: 'object'
      }
    }
  }
};

/**
 * 设置向导验证模式
 */
export const setupSchema: ValidationSchema = {
  body: {
    type: 'object',
    required: ['auth', 'llm'],
    properties: {
      auth: {
        type: 'object',
        required: ['admin'],
        properties: {
          admin: {
            type: 'object',
            required: ['username', 'password'],
            properties: {
              username: {
                type: 'string',
                minLength: 3,
                maxLength: 50
              },
              password: {
                type: 'string',
                minLength: 6,
                maxLength: 100
              }
            }
          }
        }
      },
      llm: {
        type: 'object',
        required: ['defaultProvider'],
        properties: {
          defaultProvider: {
            type: 'string',
            enum: ['openai', 'deepseek', 'zhipu', 'claude', 'ollama', 'custom']
          }
        }
      },
      server: {
        type: 'object',
        properties: {
          port: {
            type: 'integer',
            minimum: 1,
            maximum: 65535
          },
          host: {
            type: 'string',
            maxLength: 100
          }
        }
      },
      rag: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean'
          }
        }
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
