/**
 * ChatController - Chat Controller Coordinator
 *
 * Main controller coordinating all chat-related operations.
 */

import { Request, Response } from "express";
import { ChatService } from "../../../services/ChatService";
import { LLMManager } from "../../../core/LLMManager";
import { logger } from "../../../utils/logger";
import {
  sendOk,
  badRequest,
  notFound,
  serverError,
  serviceUnavailable,
} from "../../../utils/http-response";
import { toString } from "../../../utils/request-parser";
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
        badRequest(res, result.error || "Invalid request");
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
        sendOk(res, response);
      }
    } catch (error: any) {
      logger.error("Error in chatCompletions:", error);
      serverError(res, error, "Chat completions");
    }
  }

  /**
   * Get available models (GET /v1/models)
   */
  async getModels(req: Request, res: Response): Promise<void> {
    try {
      const llmClient = await this.getLLMClient();
      const models = await llmClient.getAllModels();

      sendOk(res, {
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
      const type = statusCode === 503 ? "service_unavailable" : "server_error";

      if (statusCode === 503) {
        serviceUnavailable(res, error.message || "Failed to fetch models");
      } else {
        serverError(res, error, "Get models");
      }
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
        badRequest(res, "Missing or invalid requestId");
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
        sendOk(res, response);
      } else {
        const response: InterruptResponse = {
          success: false,
          message: "Request not found or already completed",
          requestId: requestId,
          reason: "not_found",
        };

        logger.warn(`Request not found for interrupt: ${requestId}`);
        notFound(res, "Request not found or already completed");
      }
    } catch (error: any) {
      logger.error("Error in interruptRequest:", error);

      const response: InterruptResponse = {
        success: false,
        message: error.message || "Failed to interrupt request",
        error: error.toString(),
      };

      serverError(res, error, "Interrupt request");
    }
  }

  /**
   * Delete session (DELETE /v1/chat/sessions/:conversationId)
   */
  async deleteSession(req: Request, res: Response): Promise<void> {
    try {
      const conversationId = toString(toString(req.params.conversationId));

      if (!conversationId) {
        badRequest(res, "conversationId is required");
        return;
      }

      await this.chatService.endSession(conversationId);

      sendOk(res, {
        success: true,
        message: "Session deleted successfully",
      });
    } catch (error: any) {
      logger.error("Error in deleteSession:", error);
      serverError(res, error, "Delete session");
    }
  }

  /**
   * Get session (GET /v1/chat/sessions/:conversationId)
   */
  async getSession(req: Request, res: Response): Promise<void> {
    try {
      const conversationId = toString(req.params.conversationId);

      if (!conversationId) {
        badRequest(res, "conversationId is required");
        return;
      }

      const sessionId = this.chatService.getSessionIdByConversationId(conversationId);

      if (!sessionId) {
        notFound(res, "Session not found");
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

      sendOk(res, {
        success: true,
        data: sessionState,
      });
    } catch (error: any) {
      logger.error("Error in getSession:", error);
      serverError(res, error, "Get session");
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

      sendOk(res, {
        success: true,
        data: {
          sessions: activeSessions,
          total: activeSessions.length,
        },
      });
    } catch (error: any) {
      logger.error("Error in getActiveSessions:", error);
      serverError(res, error, "Get active sessions");
    }
  }

  /**
   * Get session history (GET /v1/chat/sessions/:conversationId/history)
   */
  async getSessionHistory(req: Request, res: Response): Promise<void> {
    try {
      const conversationId = toString(req.params.conversationId);
      const type = toString(req.query.type) || "all";
      const limit = toString(req.query.limit) || "100";

      if (!conversationId) {
        badRequest(res, "conversationId is required");
        return;
      }

      const sessionId = this.chatService.getSessionIdByConversationId(conversationId);
      if (!sessionId) {
        notFound(res, "Session not found");
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

      sendOk(res, {
        success: true,
        data: history,
      });
    } catch (error: any) {
      logger.error("Error in getSessionHistory:", error);
      serverError(res, error, "Get session history");
    }
  }

  /**
   * Get conversation messages (GET /v1/chat/sessions/:conversationId/messages)
   */
  async getConversationMessages(req: Request, res: Response): Promise<void> {
    try {
      const conversationId = toString(req.params.conversationId);
      const limitStr = toString(req.query.limit) || "100";
      const offsetStr = toString(req.query.offset) || "0";

      if (!conversationId) {
        badRequest(res, "conversationId is required");
        return;
      }

      const messages = await this.chatService.getConversationHistory(
        conversationId,
        parseInt(limitStr) || 100,
        parseInt(offsetStr) || 0
      );

      const total = await this.chatService.getConversationMessageCount(conversationId);

      sendOk(res, {
        success: true,
        data: {
          messages,
          total,
          limit: parseInt(limitStr) || 100,
          offset: parseInt(offsetStr) || 0,
        },
      });
    } catch (error: any) {
      logger.error("Error in getConversationMessages:", error);
      serverError(res, error, "Get conversation messages");
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
        badRequest(res, "messages is required and must be an array");
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
        badRequest(res, "model is required");
        return;
      }

      await this.streamHandler.handleStream(res, messages, options);
    } catch (error: any) {
      logger.error("Error in simpleChatStream:", error);

      if (!res.headersSent) {
        serverError(res, error, "Simple chat stream");
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
