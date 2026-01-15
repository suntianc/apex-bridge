/**
 * ApexBridge API Documentation
 * Swagger/OpenAPI configuration
 */

import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "ApexBridge API",
      version: "2.0.0",
      description: `
# ApexBridge - AI Protocol Server API

ApexBridge is a high-performance AI Agent framework with multi-model support, MCP protocol integration, and intelligent context compression.

## Features
- **Multi-Model Support**: OpenAI, Claude, DeepSeek, Ollama, Zhipu, Custom
- **MCP Protocol**: Full Model Context Protocol integration
- **Smart Context Compression**: 4 strategies (Truncate/Prune/Summary/Hybrid)
- **Real-time Streaming**: WebSocket support for live updates

## Authentication
All API endpoints require authentication via Authorization header:
\`\`\`
Authorization: Bearer <your-api-key>
\`\`\`

## Rate Limits
- Default: 100 requests per minute
- Custom limits can be configured in admin settings
      `,
      contact: {
        name: "ApexBridge Team",
        url: "https://github.com/suntianc/apex-bridge",
      },
      license: {
        name: "Apache-2.0",
        url: "https://opensource.org/licenses/Apache-2.0",
      },
    },
    servers: [
      {
        url: "http://localhost:8088",
        description: "Local development server",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        // Chat schemas
        ChatRequest: {
          type: "object",
          required: ["messages", "model"],
          properties: {
            messages: {
              type: "array",
              description: "Array of conversation messages",
              items: {
                $ref: "#/components/schemas/Message",
              },
            },
            model: {
              type: "string",
              description: "Model identifier to use for completion",
              example: "gpt-4",
            },
            stream: {
              type: "boolean",
              description: "Enable streaming response",
              default: false,
            },
            contextCompression: {
              $ref: "#/components/schemas/ContextCompressionConfig",
            },
            maxTokens: {
              type: "integer",
              description: "Maximum tokens to generate",
            },
            temperature: {
              type: "number",
              description: "Temperature for random generation (0-2)",
              minimum: 0,
              maximum: 2,
            },
          },
        },
        Message: {
          type: "object",
          properties: {
            role: {
              type: "string",
              enum: ["system", "user", "assistant", "tool"],
              description: "Role of the message sender",
            },
            content: {
              oneOf: [
                { type: "string" },
                {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        enum: ["text", "image_url"],
                      },
                      text: { type: "string" },
                      image_url: {
                        type: "object",
                        properties: {
                          url: { type: "string" },
                        },
                      },
                    },
                  },
                },
              ],
              description: "Message content (string or multimodal array)",
            },
            name: {
              type: "string",
              description: "Optional name for the message sender",
            },
          },
        },
        ChatResponse: {
          type: "object",
          properties: {
            id: { type: "string" },
            object: { type: "string", example: "chat.completion" },
            created: { type: "integer" },
            model: { type: "string" },
            choices: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  index: { type: "integer" },
                  message: { $ref: "#/components/schemas/Message" },
                  finish_reason: { type: "string" },
                },
              },
            },
            usage: {
              $ref: "#/components/schemas/Usage",
            },
          },
        },
        Usage: {
          type: "object",
          properties: {
            prompt_tokens: { type: "integer" },
            completion_tokens: { type: "integer" },
            total_tokens: { type: "integer" },
          },
        },
        ContextCompressionConfig: {
          type: "object",
          properties: {
            enabled: {
              type: "boolean",
              description: "Enable context compression",
              default: true,
            },
            strategy: {
              type: "string",
              enum: ["truncate", "prune", "summary", "hybrid"],
              description: "Compression strategy",
              default: "hybrid",
            },
            auto: {
              type: "boolean",
              description: "Auto-detect when compression is needed",
              default: true,
            },
            preserveSystemMessage: {
              type: "boolean",
              description: "Keep system message unchanged",
              default: true,
            },
          },
        },
        // Session schemas
        Session: {
          type: "object",
          properties: {
            conversationId: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            messageCount: { type: "integer" },
            status: { type: "string" },
          },
        },
        // Provider schemas
        Provider: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            adapter: { type: "string" },
            apiKey: { type: "string" },
            baseUrl: { type: "string" },
            enabled: { type: "boolean" },
            models: {
              type: "array",
              items: { $ref: "#/components/schemas/Model" },
            },
          },
        },
        Model: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            providerId: { type: "string" },
            type: { type: "string" },
            contextLength: { type: "integer" },
            capabilities: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
        // Skill schemas
        Skill: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            version: { type: "string" },
            category: { type: "string" },
            enabled: { type: "boolean" },
          },
        },
        // MCP schemas
        MCPServer: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            command: { type: "string" },
            args: {
              type: "array",
              items: { type: "string" },
            },
            env: {
              type: "object",
              additionalProperties: { type: "string" },
            },
            enabled: { type: "boolean" },
            status: { type: "string" },
          },
        },
        // Error schema
        Error: {
          type: "object",
          properties: {
            code: { type: "string" },
            message: { type: "string" },
            details: { type: "object" },
          },
        },
        // Health schema
        Health: {
          type: "object",
          properties: {
            status: { type: "string", example: "ok" },
            version: { type: "string" },
            uptime: { type: "number" },
            plugins: { type: "integer" },
            activeRequests: { type: "integer" },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
    tags: [
      { name: "Chat", description: "Chat completion and streaming endpoints" },
      { name: "Sessions", description: "Conversation session management" },
      { name: "Models", description: "LLM model management" },
      { name: "Providers", description: "LLM provider management" },
      { name: "Skills", description: "Skill management" },
      { name: "MCP", description: "Model Context Protocol servers" },
      { name: "System", description: "Health checks and system info" },
    ],
  },
  // Path to files with JSDoc comments
  apis: ["./src/api/controllers/*.ts", "./src/api/routes/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
