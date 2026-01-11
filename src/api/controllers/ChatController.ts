/**
 * ApexBridge (ABP-only, no ACE) - 聊天控制器
 * 处理HTTP聊天请求
 */

import { Request, Response } from "express";
import { ChatService } from "../../services/ChatService";
import { LLMManager as LLMClient } from "../../core/LLMManager";
import { InterruptRequest, InterruptResponse } from "../../types/request-abort";
import { LLMModelType } from "../../types/llm-models";
import { Message } from "../../types";
import { logger } from "../../utils/logger";
import { parseChatRequest } from "../../api/validators/chat-request-validator";
import type { ChatRequestOptions } from "../../api/validators/chat-request-validator";
import { normalizeUsage, buildChatResponse } from "../../api/utils/response-formatter";
import { parseLLMChunk } from "../../api/utils/stream-parser";

export class ChatController {
  private chatService: ChatService;
  private llmClient: LLMClient | null;

  constructor(chatService: ChatService, llmClient: LLMClient | null) {
    this.chatService = chatService;
    this.llmClient = llmClient;
  }

  /**
   * POST /v1/chat/completions
   * OpenAI兼容的聊天API
   */
  async chatCompletions(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body;

      // DEBUG: 检查原始请求中的消息格式
      if (body.messages && Array.isArray(body.messages)) {
        const multimodalCount = body.messages.filter(
          (m: any) => Array.isArray(m.content) && m.content.some((p: any) => p.type === "image_url")
        ).length;
        if (multimodalCount > 0) {
          logger.debug(`[ChatController] Received ${multimodalCount} multimodal messages`);
          body.messages.forEach((msg: any, idx: number) => {
            if (Array.isArray(msg.content)) {
              logger.debug(
                `[ChatController] Message[${idx}] has array content with ${msg.content.length} parts`
              );
              msg.content.forEach((part: any, pIdx: number) => {
                if (part.type === "image_url") {
                  const url =
                    typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
                  if (url) {
                    logger.debug(
                      `[ChatController] Message[${idx}].content[${pIdx}]: image_url with ${url.length} chars, has ;base64,: ${url.includes(";base64,")}`
                    );
                  }
                }
              });
            }
          });
        }
      }

      const validation = parseChatRequest(body);
      if (!validation.success) {
        logger.warn("[ChatController] Invalid request:", validation.error);
        res.status(400).json({
          error: {
            message: validation.error || "Invalid request parameters",
            type: "invalid_request",
          },
        });
        return;
      }

      const options = validation.data;
      const messages = body.messages;

      // DEBUG: 检查验证后的消息格式
      const multimodalAfterValidation = messages.filter(
        (m: any) => Array.isArray(m.content) && m.content.some((p: any) => p.type === "image_url")
      ).length;
      if (multimodalAfterValidation > 0) {
        logger.debug(
          `[ChatController] After validation: ${multimodalAfterValidation} multimodal messages`
        );
      } else if (body.messages.some((m: any) => Array.isArray(m.content))) {
        logger.warn("[ChatController] Multimodal messages lost after validation!");
      }

      // 深度思考模式：强制流式输出思考过程
      await this.handleStreamResponse(res, messages, options);
    } catch (error: any) {
      logger.error("Error in chatCompletions:", error);

      res.status(500).json({
        error: {
          message: error.message || "Internal server error",
          type: "server_error",
        },
      });
    }
  }

  /**
   * 获取实际使用的模型（处理回退逻辑）
   */
  private async getActualModel(options: ChatRequestOptions): Promise<string> {
    logger.debug(
      `[ChatController.getActualModel] Input options.model: ${options.model}, options.provider: ${options.provider}`
    );

    if (options.model) {
      logger.debug(`[ChatController.getActualModel] Using specified model: ${options.model}`);
      return options.model;
    }

    logger.debug(
      "[ChatController.getActualModel] No model specified, getting default from LLMManager"
    );
    try {
      const llmClient = await this.getLLMClient();
      const models = llmClient.getAllModels();
      const defaultModel = models.find((m) => m.type === LLMModelType.NLP);
      if (defaultModel) {
        logger.debug(`[ChatController.getActualModel] Using default model: ${defaultModel.id}`);
        return defaultModel.id;
      }
    } catch (error) {
      logger.warn("[ChatController] Failed to get default model, using fallback");
    }

    logger.debug("[ChatController.getActualModel] Using fallback model: gpt-4");
    return "gpt-4";
  }

  /**
   * 处理流式响应
   */
  private async handleStreamResponse(
    res: Response,
    messages: Message[],
    options: ChatRequestOptions
  ): Promise<void> {
    const actualModel = await this.getActualModel(options);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const responseId = `chatcmpl-${Date.now()}`;
    let chunkIndex = 0;

    // 检查是否启用思考过程流式输出
    const enableStreamThoughts = options.selfThinking?.enableStreamThoughts ?? false;

    try {
      for await (const chunk of this.chatService.streamMessage(messages, options)) {
        // 处理元数据标记（必须完全匹配，避免误拦截）
        if (chunk.startsWith("__META__:")) {
          const metaJson = chunk.substring(9);
          try {
            const metaData = JSON.parse(metaJson);

            if (metaData.type === "requestId") {
              res.write(`data: ${JSON.stringify({ requestId: metaData.value })}\n\n`);
            } else if (metaData.type === "interrupted") {
              const interruptedChunk = {
                id: responseId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: actualModel,
                choices: [
                  {
                    index: 0,
                    delta: { content: "" },
                    finish_reason: "stop",
                  },
                ],
              };
              res.write(`data: ${JSON.stringify(interruptedChunk)}\n\n`);
              res.write("data: [DONE]\n\n");
              res.end();
              logger.info(`Stream interrupted for request ${responseId}`);
              return;
            }
            continue;
          } catch (parseError) {
            logger.warn("[ChatController] Failed to parse meta chunk:", metaJson);
            continue;
          }
        }

        if (chunk.startsWith("__META__")) {
          logger.warn(
            "[ChatController] Unhandled META chunk detected, skipping:",
            chunk.substring(0, 50)
          );
          continue;
        }

        // 如果未启用思考流式输出，跳过思考过程标记
        if (
          !enableStreamThoughts &&
          (chunk.startsWith("__THOUGHT") ||
            chunk.startsWith("__ACTION") ||
            chunk.startsWith("__OBSERVATION") ||
            chunk.startsWith("__ANSWER"))
        ) {
          continue;
        }

        // 处理思考过程元数据（仅当启用时）
        if (chunk.startsWith("__THOUGHT_START__:")) {
          try {
            const data = JSON.parse(chunk.substring(18).trim());
            res.write(`event: thought_start\n`);
            res.write(
              `data: ${JSON.stringify({
                iteration: data.iteration,
                timestamp: data.timestamp,
              })}\n\n`
            );
            chunkIndex++;
          } catch (e) {
            logger.warn("[ChatController] Failed to parse thought_start:", e);
          }
          continue;
        }

        if (chunk.startsWith("__THOUGHT__:")) {
          try {
            const data = JSON.parse(chunk.substring(12).trim());
            const sseData = {
              id: responseId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: actualModel,
              choices: [
                {
                  index: 0,
                  delta: {
                    content: data.content,
                    role: "assistant",
                  },
                  finish_reason: null,
                },
              ],
              _type: "thought",
              _iteration: data.iteration,
            };
            res.write(`data: ${JSON.stringify(sseData)}\n\n`);
            chunkIndex++;
          } catch (e) {
            logger.warn("[ChatController] Failed to parse thought:", e);
          }
          continue;
        }

        if (chunk.startsWith("__THOUGHT_END__:")) {
          try {
            const data = JSON.parse(chunk.substring(16).trim());
            res.write(`event: thought_end\n`);
            res.write(`data: ${JSON.stringify({ iteration: data.iteration })}\n\n`);
            chunkIndex++;
          } catch (e) {
            logger.warn("[ChatController] Failed to parse thought_end:", e);
          }
          continue;
        }

        if (chunk.startsWith("__ACTION_START__:")) {
          try {
            const data = JSON.parse(chunk.substring(17).trim());
            res.write(`event: action_start\n`);
            res.write(
              `data: ${JSON.stringify({
                iteration: data.iteration,
                tool: data.tool,
                params: data.params,
              })}\n\n`
            );
            chunkIndex++;
          } catch (e) {
            logger.warn("[ChatController] Failed to parse action_start:", e);
          }
          continue;
        }

        if (chunk.startsWith("__OBSERVATION__:")) {
          try {
            const data = JSON.parse(chunk.substring(16).trim());
            res.write(`event: observation\n`);
            res.write(
              `data: ${JSON.stringify({
                iteration: data.iteration,
                tool: data.tool,
                result: data.result,
                error: data.error,
              })}\n\n`
            );
            chunkIndex++;
          } catch (e) {
            logger.warn("[ChatController] Failed to parse observation:", e);
          }
          continue;
        }

        if (chunk.startsWith("__ANSWER_START__:")) {
          res.write(`event: answer_start\n`);
          res.write(`data: {}\n\n`);
          chunkIndex++;
          continue;
        }

        if (chunk.startsWith("__ANSWER__:")) {
          try {
            const data = JSON.parse(chunk.substring(11).trim());
            const sseData = {
              id: responseId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: actualModel,
              choices: [
                {
                  index: 0,
                  delta: { content: data.content },
                  finish_reason: null,
                },
              ],
              _type: "answer",
            };
            res.write(`data: ${JSON.stringify(sseData)}\n\n`);
            chunkIndex++;
          } catch (e) {
            logger.warn("[ChatController] Failed to parse answer:", e);
          }
          continue;
        }

        if (chunk.startsWith("__ANSWER_END__:")) {
          res.write(`event: answer_end\n`);
          res.write(`data: {}\n\n`);
          chunkIndex++;
          continue;
        }

        // 解析LLM的嵌套JSON格式
        const parsedChunk = parseLLMChunk(chunk);

        if (parsedChunk.isReasoning) {
          const sseData = {
            id: responseId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: actualModel,
            choices: [
              {
                index: 0,
                delta: {
                  reasoning_content: parsedChunk.content,
                  content: null,
                },
                finish_reason: null,
              },
            ],
          };
          res.write(`data: ${JSON.stringify(sseData)}\n\n`);
        } else {
          const sseData = {
            id: responseId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: actualModel,
            choices: [
              {
                index: 0,
                delta: {
                  reasoning_content: null,
                  content: parsedChunk.content,
                },
                finish_reason: null,
              },
            ],
          };
          res.write(`data: ${JSON.stringify(sseData)}\n\n`);
        }
        chunkIndex++;
      }

      res.write("data: [DONE]\n\n");

      // 发送 conversationId 事件（方便前端保存）
      if (options.conversationId) {
        res.write(`event: conversation_id\n`);
        res.write(`data: ${JSON.stringify({ conversationId: options.conversationId })}\n\n`);
      }

      res.end();

      logger.info(`Streamed ${chunkIndex} chunks for request ${responseId}`);
    } catch (streamError: any) {
      logger.error("Error during streaming:", streamError);

      res.write(
        `data: ${JSON.stringify({
          error: {
            message: streamError.message,
            type: "server_error",
          },
        })}\n\n`
      );
      res.end();
    }
  }

  /**
   * 处理普通响应
   */
  private async handleNormalResponse(
    res: Response,
    messages: Message[],
    options: ChatRequestOptions
  ): Promise<void> {
    const result = await this.chatService.processMessage(messages, options);
    const actualModel = await this.getActualModel(options);

    const usage = normalizeUsage(result.usage);
    const response = buildChatResponse(result.content, actualModel, usage, options.conversationId);

    res.json(response);
    logger.info("Completed non-stream chat request");
  }

  /**
   * 获取 LLM 客户端（支持懒加载）
   */
  private async getLLMClient(): Promise<LLMClient> {
    if (this.llmClient) {
      return this.llmClient;
    }

    try {
      const { LLMManager } = await import("../../core/LLMManager");
      const client = new LLMManager() as LLMClient;
      if (!client) {
        throw new Error("LLMClient not available. Please configure LLM providers in admin panel.");
      }
      this.llmClient = client;
      return client;
    } catch (error: any) {
      throw new Error(`Failed to initialize LLMClient: ${error.message || error}`);
    }
  }

  /**
   * GET /v1/models
   * 获取可用模型列表
   */
  async getModels(req: Request, res: Response): Promise<void> {
    try {
      const llmClient = await this.getLLMClient();
      const models = await llmClient.getAllModels();

      res.json({
        object: "list",
        data: models.map((m) => ({
          id: m.id,
          object: "model",
          owned_by: m.provider,
          created: Math.floor(Date.now() / 1000),
        })),
      });

      logger.info(`Returned ${models.length} models`);
    } catch (error: any) {
      logger.error("Error in getModels:", error);

      const statusCode =
        error.message?.includes("not available") || error.message?.includes("Failed to initialize")
          ? 503
          : 500;

      res.status(statusCode).json({
        error: {
          message: error.message || "Failed to fetch models",
          type: statusCode === 503 ? "service_unavailable" : "server_error",
        },
      });
    }
  }

  /**
   * POST /v1/interrupt
   * 中断正在进行的请求
   */
  async interruptRequest(req: Request, res: Response): Promise<void> {
    try {
      const body: InterruptRequest = req.body;
      const { requestId } = body;

      if (!requestId || typeof requestId !== "string") {
        res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Missing or invalid requestId",
        });
        return;
      }

      logger.info(`[ChatController] Interrupt request for: ${requestId}`);

      const interrupted = await this.chatService.interruptRequest(requestId);

      if (interrupted) {
        const response: InterruptResponse = {
          success: true,
          message: "Request interrupted successfully",
          requestId: requestId,
          interrupted: true,
        };

        logger.info(`Request interrupted: ${requestId}`);
        res.json(response);
      } else {
        const response: InterruptResponse = {
          success: false,
          message: "Request not found or already completed",
          requestId: requestId,
          reason: "not_found",
        };

        logger.warn(`Request not found for interrupt: ${requestId}`);
        res.status(404).json(response);
      }
    } catch (error: any) {
      logger.error("Error in interruptRequest:", error);

      const response: InterruptResponse = {
        success: false,
        message: error.message || "Failed to interrupt request",
        error: error.toString(),
      };

      res.status(500).json(response);
    }
  }

  /**
   * DELETE /v1/chat/sessions/:conversationId
   * 删除会话
   */
  async deleteSession(req: Request, res: Response): Promise<void> {
    try {
      const conversationId = req.params.conversationId;

      if (!conversationId) {
        res.status(400).json({
          error: {
            message: "conversationId is required",
            type: "invalid_request",
          },
        });
        return;
      }

      await this.chatService.endSession(conversationId);

      res.json({
        success: true,
        message: "Session deleted successfully",
      });
    } catch (error: any) {
      logger.error("Error in deleteSession:", error);
      res.status(500).json({
        error: {
          message: error.message || "Internal server error",
          type: "server_error",
        },
      });
    }
  }

  /**
   * GET /v1/chat/sessions/:conversationId
   * 获取会话状态（简化版，无ACE）
   */
  async getSession(req: Request, res: Response): Promise<void> {
    try {
      const conversationId = req.params.conversationId;

      if (!conversationId) {
        res.status(400).json({
          error: {
            message: "conversationId is required",
            type: "invalid_request",
          },
        });
        return;
      }

      // 获取会话ID
      const sessionId = this.chatService.getSessionIdByConversationId(conversationId);

      if (!sessionId) {
        res.status(404).json({
          error: {
            message: "Session not found",
            type: "not_found",
          },
        });
        return;
      }

      // 获取消息数量
      const messageCount = await this.chatService.getConversationMessageCount(conversationId);
      const lastMessage = await this.chatService.getConversationLastMessage(conversationId);

      const sessionState = {
        sessionId,
        conversationId,
        status: "active",
        messageCount,
        lastActivityAt: lastMessage?.created_at || Date.now(),
        metadata: {
          hasHistory: messageCount > 0,
        },
      };

      res.json({
        success: true,
        data: sessionState,
      });
    } catch (error: any) {
      logger.error("Error in getSession:", error);
      res.status(500).json({
        error: {
          message: error.message || "Internal server error",
          type: "server_error",
        },
      });
    }
  }

  /**
   * GET /v1/chat/sessions/active
   * 获取会话列表（简化版，无ACE）
   */
  async getActiveSessions(req: Request, res: Response): Promise<void> {
    try {
      // 获取所有有对话历史的会话
      const conversationIds = await this.chatService.getAllConversationsWithHistory();

      // 获取会话详细信息
      const sessions = await Promise.all(
        conversationIds.map(async (sessionId) => {
          try {
            const messageCount = await this.chatService.getConversationMessageCount(sessionId);
            const lastMessage = await this.chatService.getConversationLastMessage(sessionId);
            const firstMessage = await this.chatService.getConversationFirstMessage(sessionId);

            return {
              sessionId,
              conversationId: sessionId,
              status: "active",
              messageCount,
              lastActivityAt: lastMessage?.created_at || 0,
              lastMessage: lastMessage?.content?.substring(0, 100) || "",
              firstMessage: firstMessage?.content?.substring(0, 100) || "",
            };
          } catch (error: any) {
            logger.warn(
              `[ChatController] Failed to get session info for ${sessionId}: ${error.message}`
            );
            return null;
          }
        })
      );

      const activeSessions = sessions.filter((s) => s !== null);

      res.json({
        success: true,
        data: {
          sessions: activeSessions,
          total: activeSessions.length,
        },
      });
    } catch (error: any) {
      logger.error("Error in getActiveSessions:", error);
      res.status(500).json({
        error: {
          message: error.message || "Internal server error",
          type: "server_error",
        },
      });
    }
  }

  /**
   * GET /v1/chat/sessions/:conversationId/history
   * 获取会话历史（简化版，无ACE）
   */
  async getSessionHistory(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const { type = "all", limit = "100" } = req.query;

      if (!conversationId) {
        res.status(400).json({
          error: {
            message: "conversationId is required",
            type: "invalid_request",
          },
        });
        return;
      }

      // 验证会话是否存在
      const sessionId = this.chatService.getSessionIdByConversationId(conversationId);
      if (!sessionId) {
        res.status(404).json({
          error: {
            message: "Session not found",
            type: "not_found",
          },
        });
        return;
      }

      const history: any = {};
      const limitNum = parseInt(limit as string) || 100;

      // 获取会话基本信息
      if (type === "all" || type === "state") {
        const messageCount = await this.chatService.getConversationMessageCount(conversationId);
        const lastMessage = await this.chatService.getConversationLastMessage(conversationId);

        history.sessionState = {
          sessionId,
          conversationId,
          status: "active",
          messageCount,
          lastActivityAt: lastMessage?.created_at || Date.now(),
        };
      }

      // 基础历史（无ACE遥测）
      if (type === "all" || type === "telemetry") {
        history.telemetry = []; // 无ACE，无遥测数据
        history.note = "ACE telemetry not available";
      }

      if (type === "all" || type === "directives") {
        history.directives = []; // 无ACE，无指令日志
        history.note = "ACE directives not available";
      }

      res.json({
        success: true,
        data: history,
      });
    } catch (error: any) {
      logger.error("Error in getSessionHistory:", error);
      res.status(500).json({
        error: {
          message: error.message || "Internal server error",
          type: "server_error",
        },
      });
    }
  }

  /**
   * GET /v1/chat/sessions/:conversationId/messages
   * 获取对话消息历史
   */
  async getConversationMessages(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const { limit = "100", offset = "0" } = req.query;

      if (!conversationId) {
        res.status(400).json({
          error: {
            message: "conversationId is required",
            type: "invalid_request",
          },
        });
        return;
      }

      const messages = await this.chatService.getConversationHistory(
        conversationId,
        parseInt(limit as string) || 100,
        parseInt(offset as string) || 0
      );

      const total = await this.chatService.getConversationMessageCount(conversationId);

      res.json({
        success: true,
        data: {
          messages,
          total,
          limit: parseInt(limit as string) || 100,
          offset: parseInt(offset as string) || 0,
        },
      });
    } catch (error: any) {
      logger.error("Error in getConversationMessages:", error);
      res.status(500).json({
        error: {
          message: error.message || "Internal server error",
          type: "server_error",
        },
      });
    }
  }

  /**
   * POST /v1/chat/simple-stream
   * 简化版流式聊天接口（专为前端看板娘设计）
   */
  async simpleChatStream(req: Request, res: Response): Promise<void> {
    try {
      const { messages } = req.body;
      const body = req.body;

      if (!messages || !Array.isArray(messages)) {
        res.status(400).json({
          error: {
            message: "messages is required and must be an array",
            type: "validation_error",
          },
        });
        return;
      }

      const options: ChatRequestOptions = {
        provider: body.provider,
        model: body.model,
        temperature: body.temperature,
        max_tokens: body.max_tokens,
        stream: true,
        user: body.user,
      };

      if (!options.model) {
        res.status(400).json({
          error: {
            message: "model is required",
            type: "validation_error",
          },
        });
        return;
      }

      await this.handleStreamResponse(res, messages, options);
    } catch (error: any) {
      logger.error("Error in simpleChatStream:", error);

      if (!res.headersSent) {
        res.status(500).json({
          error: {
            message: error.message || "Internal server error",
            type: "server_error",
          },
        });
      }
    }
  }
}
