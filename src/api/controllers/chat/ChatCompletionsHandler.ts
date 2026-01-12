/**
 * ChatCompletionsHandler - Chat Completions Handling
 *
 * Handles the main chat completions API endpoint.
 */

import { Request, Response } from "express";
import { logger } from "../../../utils/logger";
import { ChatService } from "../../../services/ChatService";
import { parseChatRequest } from "../../validators/chat-request-validator";
import type { ChatRequestOptions } from "../../validators/chat-request-validator";

export interface CompletionsResult {
  success: boolean;
  response?: any;
  error?: string;
}

/**
 * ChatCompletionsHandler - Chat Completions Handling
 *
 * Responsible for processing chat completion requests.
 */
export class ChatCompletionsHandler {
  private chatService: ChatService;

  constructor(chatService: ChatService) {
    this.chatService = chatService;
    logger.info("ChatCompletionsHandler initialized");
  }

  /**
   * Handle chat completions request
   */
  async handleCompletions(req: Request, res: Response): Promise<CompletionsResult> {
    try {
      const body = req.body;

      // DEBUG: Check multimodal messages in original request
      if (body.messages && Array.isArray(body.messages)) {
        const multimodalCount = body.messages.filter(
          (m: any) => Array.isArray(m.content) && m.content.some((p: any) => p.type === "image_url")
        ).length;
        if (multimodalCount > 0) {
          logger.debug(`[ChatCompletionsHandler] Received ${multimodalCount} multimodal messages`);
        }
      }

      // Validate request
      const validation = parseChatRequest(body);
      if (!validation.success) {
        logger.warn("[ChatCompletionsHandler] Invalid request:", validation.error);
        res.status(400).json({
          error: {
            message: validation.error || "Invalid request parameters",
            type: "invalid_request",
          },
        });
        return { success: false, error: validation.error };
      }

      const options = validation.data;
      const messages = body.messages;

      // Check if stream is enabled
      if (options.stream) {
        // Stream handling will be done by StreamResponseHandler
        return { success: true, response: { stream: true, options, messages } };
      }

      // Non-streaming response
      const result = await this.chatService.processMessage(messages, options);

      return {
        success: true,
        response: result,
      };
    } catch (error) {
      logger.error("Error in chat completions:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Validate request
   */
  validateRequest(body: any): { valid: boolean; error?: string; data?: ChatRequestOptions } {
    const validation = parseChatRequest(body);

    if (!validation.success) {
      return { valid: false, error: validation.error };
    }

    return { valid: true, data: validation.data };
  }

  /**
   * Extract messages from request
   */
  extractMessages(body: any): any[] {
    return body.messages || [];
  }

  /**
   * Get actual model to use
   */
  async getActualModel(options: ChatRequestOptions): Promise<string> {
    if (options.model) {
      return options.model;
    }

    // Default to gpt-4 if no model specified
    return "gpt-4";
  }
}

/**
 * Create ChatCompletionsHandler instance
 */
export function createChatCompletionsHandler(chatService: ChatService): ChatCompletionsHandler {
  return new ChatCompletionsHandler(chatService);
}
