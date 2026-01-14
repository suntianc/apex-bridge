/**
 * ApexBridge 聊天控制器
 * Playbook 和 ACE 功能已删除 (2026-01-11)
 * 处理HTTP聊天请求
 */

import { Request, Response } from "express";
import { ChatService } from "../../services/ChatService";
import { LLMManager as LLMClient } from "../../core/LLMManager";
import { InterruptRequest, InterruptResponse } from "../../types/request-abort";
import { LLMModelType } from "../../types/llm-models";
import { Message } from "../../types";
import { logger } from "../../utils/logger";
import { badRequest, notFound, serverError } from "../../utils/http-response";
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
   * 提取多模态消息（包含图片URL的消息）
   * @param messages 消息数组
   * @returns 包含多模态内容的消息数组
   */
  private extractMultimodalMessages(messages: any[]): any[] {
    return messages.filter(
      (m: any) => Array.isArray(m.content) && m.content.some((p: any) => p.type === "image_url")
    );
  }

  /**
   * 记录多模态消息的调试信息
   * @param messages 消息数组
   */
  private logMultimodalMessages(messages: any[]): void {
    const multimodalMessages = this.extractMultimodalMessages(messages);
    if (multimodalMessages.length === 0) {
      return;
    }

    logger.debug(`[ChatController] Received ${multimodalMessages.length} multimodal messages`);

    messages.forEach((msg: any, idx: number) => {
      if (Array.isArray(msg.content)) {
        logger.debug(
          `[ChatController] Message[${idx}] has array content with ${msg.content.length} parts`
        );
        msg.content.forEach((part: any, pIdx: number) => {
          if (part.type === "image_url") {
            const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
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

  /**
   * POST /v1/chat/completions
   * OpenAI兼容的聊天API
   */
  async chatCompletions(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body;

      // DEBUG: 检查原始请求中的消息格式
      if (body.messages && Array.isArray(body.messages)) {
        this.logMultimodalMessages(body.messages);
      }

      const validation = parseChatRequest(body);
      if (!validation.success) {
        logger.warn("[ChatController] Invalid request:", validation.error);
        badRequest(res, validation.error || "Invalid request parameters");
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
      serverError(res, error);
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
        res.json(response);
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
      serverError(res, error, "Failed to interrupt request");
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
        badRequest(res, "conversationId is required");
        return;
      }

      await this.chatService.endSession(conversationId);

      res.json({
        success: true,
        message: "Session deleted successfully",
      });
    } catch (error: any) {
      logger.error("Error in deleteSession:", error);
      serverError(res, error);
    }
  }

  /**
   * GET /v1/chat/sessions/:conversationId
   * 获取会话状态
   */
  async getSession(req: Request, res: Response): Promise<void> {
    try {
      const conversationId = req.params.conversationId;

      if (!conversationId) {
        badRequest(res, "conversationId is required");
        return;
      }

      // 获取会话ID
      const sessionId = this.chatService.getSessionIdByConversationId(conversationId);

      if (!sessionId) {
        notFound(res, "Session not found");
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
      serverError(res, error);
    }
  }

  /**
   * GET /v1/chat/sessions/active
   * 获取会话列表
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
      serverError(res, error);
    }
  }

  /**
   * GET /v1/chat/sessions/:conversationId/history
   * 获取会话历史
   */
  async getSessionHistory(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const { type = "all", limit = "100" } = req.query;

      if (!conversationId) {
        badRequest(res, "conversationId is required");
        return;
      }

      // 验证会话是否存在
      const sessionId = this.chatService.getSessionIdByConversationId(conversationId);
      if (!sessionId) {
        notFound(res, "Session not found");
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

      // 基础历史（ACE遥测已删除）
      if (type === "all" || type === "telemetry") {
        history.telemetry = [];
        history.note = "ACE telemetry deleted (2026-01-11)";
      }

      if (type === "all" || type === "directives") {
        history.directives = [];
        history.note = "ACE directives deleted (2026-01-11)";
      }

      res.json({
        success: true,
        data: history,
      });
    } catch (error: any) {
      logger.error("Error in getSessionHistory:", error);
      serverError(res, error);
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
        badRequest(res, "conversationId is required");
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
      serverError(res, error);
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

      await this.handleStreamResponse(res, messages, options);
    } catch (error: any) {
      logger.error("Error in simpleChatStream:", error);

      if (!res.headersSent) {
        serverError(res, error);
      }
    }
  }

  /**
   * 发送 SSE 事件数据
   * @param res 响应对象
   * @param data 要发送的数据
   * @param eventType 事件类型（可选）
   */
  private sendSSEData(res: Response, data: object, eventType?: string): void {
    if (eventType) {
      res.write(`event: ${eventType}\n`);
    }
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  /**
   * 处理元数据块（requestId, interrupted 等）
   * @param res 响应对象
   * @param chunk 数据块
   * @param responseId 响应ID
   * @param actualModel 实际使用的模型
   * @returns 是否成功处理
   */
  private async handleMetaChunk(
    res: Response,
    chunk: string,
    responseId: string,
    actualModel: string
  ): Promise<boolean> {
    const metaJson = chunk.substring(9);
    try {
      const metaData = JSON.parse(metaJson);

      if (metaData.type === "requestId") {
        this.sendSSEData(res, { requestId: metaData.value });
        return true;
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
        return true;
      }
      return false;
    } catch (parseError) {
      logger.warn("[ChatController] Failed to parse meta chunk:", metaJson);
      return false;
    }
  }

  /**
   * 处理思考过程事件
   * @param res 响应对象
   * @param chunk 数据块
   * @param chunkIndex 块索引
   * @param responseId 响应ID
   * @param actualModel 实际使用的模型
   * @param eventType 事件类型：start/content/end
   * @returns 处理后的块索引
   */
  private handleThoughtEvent(
    res: Response,
    chunk: string,
    chunkIndex: number,
    responseId: string,
    actualModel: string,
    eventType: "start" | "content" | "end"
  ): number {
    try {
      let data: any;
      let eventName: string;

      if (eventType === "start") {
        const jsonStr = chunk.substring(18).trim();
        data = JSON.parse(jsonStr);
        eventName = "thought_start";
        this.sendSSEData(
          res,
          {
            iteration: data.iteration,
            timestamp: data.timestamp,
          },
          eventName
        );
      } else if (eventType === "content") {
        const jsonStr = chunk.substring(12).trim();
        data = JSON.parse(jsonStr);
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
      } else if (eventType === "end") {
        const jsonStr = chunk.substring(16).trim();
        data = JSON.parse(jsonStr);
        eventName = "thought_end";
        this.sendSSEData(res, { iteration: data.iteration }, eventName);
      }

      return chunkIndex + 1;
    } catch (e) {
      logger.warn(`[ChatController] Failed to parse thought ${eventType}:`, e);
      return chunkIndex;
    }
  }

  /**
   * 处理动作开始事件
   * @param res 响应对象
   * @param chunk 数据块
   * @param chunkIndex 块索引
   * @returns 处理后的块索引
   */
  private handleActionStartEvent(res: Response, chunk: string, chunkIndex: number): number {
    try {
      const jsonStr = chunk.substring(17).trim();
      const data = JSON.parse(jsonStr);
      this.sendSSEData(
        res,
        {
          iteration: data.iteration,
          tool: data.tool,
          params: data.params,
        },
        "action_start"
      );
      return chunkIndex + 1;
    } catch (e) {
      logger.warn("[ChatController] Failed to parse action_start:", e);
      return chunkIndex;
    }
  }

  /**
   * 处理观察事件
   * @param res 响应对象
   * @param chunk 数据块
   * @param chunkIndex 块索引
   * @returns 处理后的块索引
   */
  private handleObservationEvent(res: Response, chunk: string, chunkIndex: number): number {
    try {
      const jsonStr = chunk.substring(16).trim();
      const data = JSON.parse(jsonStr);
      this.sendSSEData(
        res,
        {
          iteration: data.iteration,
          tool: data.tool,
          result: data.result,
          error: data.error,
        },
        "observation"
      );
      return chunkIndex + 1;
    } catch (e) {
      logger.warn("[ChatController] Failed to parse observation:", e);
      return chunkIndex;
    }
  }

  /**
   * 处理答案事件
   * @param res 响应对象
   * @param chunk 数据块
   * @param chunkIndex 块索引
   * @param responseId 响应ID
   * @param actualModel 实际使用的模型
   * @param eventType 事件类型：start/content/end
   * @returns 处理后的块索引
   */
  private handleAnswerEvent(
    res: Response,
    chunk: string,
    chunkIndex: number,
    responseId: string,
    actualModel: string,
    eventType: "start" | "content" | "end"
  ): number {
    try {
      if (eventType === "start") {
        res.write(`event: answer_start\n`);
        res.write(`data: {}\n\n`);
      } else if (eventType === "content") {
        const jsonStr = chunk.substring(11).trim();
        const data = JSON.parse(jsonStr);
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
      } else if (eventType === "end") {
        res.write(`event: answer_end\n`);
        res.write(`data: {}\n\n`);
      }

      return chunkIndex + 1;
    } catch (e) {
      logger.warn(`[ChatController] Failed to parse answer ${eventType}:`, e);
      return chunkIndex;
    }
  }

  /**
   * 发送流结束事件
   * @param res 响应对象
   * @param responseId 响应ID
   * @param conversationId 会话ID（可选）
   * @param chunkIndex 块索引
   * @returns 处理后的块索引
   */
  private sendStreamEndEvents(
    res: Response,
    responseId: string,
    conversationId?: string,
    chunkIndex?: number
  ): number {
    res.write("data: [DONE]\n\n");

    if (conversationId) {
      res.write(`event: conversation_id\n`);
      res.write(`data: ${JSON.stringify({ conversationId })}\n\n`);
    }

    res.end();
    logger.info(`Streamed ${chunkIndex || 0} chunks for request ${responseId}`);
    return -1; // 表示流已结束
  }

  /**
   * 路由数据块到对应的处理方法
   * @param chunk 数据块
   * @param res 响应对象
   * @param responseId 响应ID
   * @param actualModel 实际使用的模型
   * @param enableStreamThoughts 是否启用思考流式输出
   * @param chunkIndex 块索引
   * @returns -1 表示流已结束，0 表示未处理，正数表示处理后的索引
   */
  private routeChunk(
    chunk: string,
    res: Response,
    responseId: string,
    actualModel: string,
    enableStreamThoughts: boolean,
    chunkIndex: number
  ): number {
    // 处理元数据块
    if (chunk.startsWith("__META__:")) {
      const handled = this.handleMetaChunk(res, chunk, responseId, actualModel);
      if (handled) return 0;
    }

    // 处理思考过程事件（如果未启用思考流式输出则跳过）
    if (!enableStreamThoughts) {
      if (chunk.startsWith("__THOUGHT_START__:")) {
        return this.handleThoughtEvent(res, chunk, chunkIndex, responseId, actualModel, "start");
      }
      if (chunk.startsWith("__THOUGHT__:")) {
        return this.handleThoughtEvent(res, chunk, chunkIndex, responseId, actualModel, "content");
      }
      if (chunk.startsWith("__THOUGHT_END__:")) {
        return this.handleThoughtEvent(res, chunk, chunkIndex, responseId, actualModel, "end");
      }
      if (chunk.startsWith("__ACTION")) return chunkIndex;
      if (chunk.startsWith("__OBSERVATION")) return chunkIndex;
      if (chunk.startsWith("__ANSWER")) return chunkIndex;
    } else {
      if (chunk.startsWith("__THOUGHT_START__:")) {
        return this.handleThoughtEvent(res, chunk, chunkIndex, responseId, actualModel, "start");
      }
      if (chunk.startsWith("__THOUGHT__:")) {
        return this.handleThoughtEvent(res, chunk, chunkIndex, responseId, actualModel, "content");
      }
      if (chunk.startsWith("__THOUGHT_END__:")) {
        return this.handleThoughtEvent(res, chunk, chunkIndex, responseId, actualModel, "end");
      }
      if (chunk.startsWith("__ACTION_START__:")) {
        return this.handleActionStartEvent(res, chunk, chunkIndex);
      }
      if (chunk.startsWith("__OBSERVATION__:")) {
        return this.handleObservationEvent(res, chunk, chunkIndex);
      }
      if (chunk.startsWith("__ANSWER_START__:")) {
        return this.handleAnswerEvent(res, chunk, chunkIndex, responseId, actualModel, "start");
      }
      if (chunk.startsWith("__ANSWER__:")) {
        return this.handleAnswerEvent(res, chunk, chunkIndex, responseId, actualModel, "content");
      }
      if (chunk.startsWith("__ANSWER_END__:")) {
        return this.handleAnswerEvent(res, chunk, chunkIndex, responseId, actualModel, "end");
      }
    }

    return -2; // 表示需要作为普通块处理
  }
}
