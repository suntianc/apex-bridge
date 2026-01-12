/**
 * ChatController - Chat Controller Coordinator
 *
 * Main controller coordinating all chat-related operations.
 */

import { Request, Response } from "express";
import { ChatService } from "../../../services/ChatService";
import { LLMManager } from "../../../core/LLMManager";
import { logger } from "../../../utils/logger";
import { ChatCompletionsHandler, createChatCompletionsHandler } from "./ChatCompletionsHandler";
import { StreamResponseHandler, createStreamResponseHandler } from "./StreamResponseHandler";
import { MessageValidation, createMessageValidation } from "./MessageValidation";
import { normalizeUsage, buildChatResponse } from "../../utils/response-formatter";
import type { Message } from "../../../types";
import type { ChatRequestOptions } from "../../validators/chat-request-validator";
import { LLMModelType } from "../../../types/llm-models";
import { InterruptRequest, InterruptResponse } from "../../../types/request-abort";

export interface SessionInfo {
  sessionId: string;
  conversationId: string;
  status: string;
  messageCount: number;
  lastActivityAt: number;
}

export interface SessionListResult {
  sessions: SessionInfo[];
  total: number;
}

/**
 * ChatController - Main Chat Controller Coordinator
 *
 * Orchestrates all chat-related operations including completions,
 * streaming, session management, and message handling.
 */
export class ChatController {
  private chatService: ChatService;
  private completionsHandler: ChatCompletionsHandler;
  private streamHandler: StreamResponseHandler;
  private messageValidation: MessageValidation;
  private llmClient: LLMManager | null;

  constructor(chatService: ChatService) {
    this.chatService = chatService;
    this.completionsHandler = createChatCompletionsHandler(chatService);
    this.streamHandler = createStreamResponseHandler(chatService);
    this.messageValidation = createMessageValidation();
    this.llmClient = null;

    logger.info("ChatController initialized");
  }

  /**
   * Handle chat completions (POST /v1/chat/completions)
   */
  async chatCompletions(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.completionsHandler.handleCompletions(req, res);

      if (!result.success) {
        res.status(400).json({
          error: {
            message: result.error || "Invalid request",
            type: "invalid_request",
          },
        });
        return;
      }

      if (result.response?.stream) {
        // Handle streaming
        const messages = this.completionsHandler.extractMessages(req.body);
        const options = result.response.options;
        await this.streamHandler.handleStream(res, messages, options);
      } else {
        // Handle non-streaming
        const actualModel = await this.getActualModel(req.body);
        const usage = normalizeUsage(result.response.usage);
        const response = buildChatResponse(result.response.content, actualModel, usage);
        res.json(response);
      }
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
   * Get available models (GET /v1/models)
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
   * Interrupt a request (POST /v1/interrupt)
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
   * Delete session (DELETE /v1/chat/sessions/:conversationId)
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
   * Get session (GET /v1/chat/sessions/:conversationId)
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
   * Get active sessions (GET /v1/chat/sessions/active)
   */
  async getActiveSessions(req: Request, res: Response): Promise<void> {
    try {
      const conversationIds = await this.chatService.getAllConversationsWithHistory();

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
   * Get session history (GET /v1/chat/sessions/:conversationId/history)
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
   * Get conversation messages (GET /v1/chat/sessions/:conversationId/messages)
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
   * Simple chat stream (POST /v1/chat/simple-stream)
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

      await this.streamHandler.handleStream(res, messages, options);
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

  /**
   * Get actual model
   */
  private async getActualModel(body: any): Promise<string> {
    if (body.model) {
      return body.model;
    }

    try {
      const llmClient = await this.getLLMClient();
      const models = llmClient.getAllModels();
      const defaultModel = models.find((m) => m.type === LLMModelType.NLP);
      if (defaultModel) {
        return defaultModel.id;
      }
    } catch (error) {
      logger.warn("[ChatController] Failed to get default model, using fallback");
    }

    return "gpt-4";
  }

  /**
   * Get LLM client
   */
  private async getLLMClient(): Promise<LLMManager> {
    if (this.llmClient) {
      return this.llmClient;
    }

    try {
      const { LLMManager } = await import("../../../core/LLMManager");
      const client = new LLMManager() as LLMManager;
      if (!client) {
        throw new Error("LLMClient not available");
      }
      this.llmClient = client;
      return client;
    } catch (error: any) {
      throw new Error(`Failed to initialize LLMClient: ${error.message || error}`);
    }
  }
}

/**
 * Create ChatController instance
 */
export function createChatController(chatService: ChatService): ChatController {
  return new ChatController(chatService);
}
