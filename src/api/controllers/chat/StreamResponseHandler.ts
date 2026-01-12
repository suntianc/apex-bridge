/**
 * StreamResponseHandler - Streaming Response Handling
 *
 * Handles SSE (Server-Sent Events) streaming responses for chat.
 */

import { Response } from "express";
import { ChatService } from "../../../services/ChatService";
import { parseLLMChunk } from "../../utils/stream-parser";
import { logger } from "../../../utils/logger";
import type { Message } from "../../../types";
import type { ChatRequestOptions } from "../../validators/chat-request-validator";

export interface StreamConfig {
  enableStreamThoughts?: boolean;
  conversationId?: string;
}

/**
 * StreamResponseHandler - Streaming Response Handling
 *
 * Responsible for handling SSE streaming responses.
 */
export class StreamResponseHandler {
  private chatService: ChatService;

  constructor(chatService: ChatService) {
    this.chatService = chatService;
    logger.info("StreamResponseHandler initialized");
  }

  /**
   * Handle streaming response
   */
  async handleStream(
    res: Response,
    messages: Message[],
    options: ChatRequestOptions
  ): Promise<void> {
    const actualModel = options.model || "gpt-4";

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const responseId = `chatcmpl-${Date.now()}`;
    let chunkIndex = 0;

    // Check if thinking process streaming is enabled
    const enableStreamThoughts = options.selfThinking?.enableStreamThoughts ?? false;

    try {
      for await (const chunk of this.chatService.streamMessage(messages, options)) {
        // Handle metadata markers
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
          } catch (parseError) {
            const truncatedJson =
              metaJson.length > 200 ? metaJson.substring(0, 200) + "..." : metaJson;
            logger.warn("[StreamResponseHandler] Failed to parse meta chunk:", truncatedJson);
            res.write(
              `data: ${JSON.stringify({
                error: {
                  message: "Failed to parse meta chunk",
                  type: "parse_error",
                },
              })}\n\n`
            );
          }
          continue;
        }

        // Skip thought markers if not enabled
        if (
          !enableStreamThoughts &&
          (chunk.startsWith("__THOUGHT") ||
            chunk.startsWith("__ACTION") ||
            chunk.startsWith("__OBSERVATION") ||
            chunk.startsWith("__ANSWER"))
        ) {
          continue;
        }

        // Handle thought process metadata
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
            logger.warn("[StreamResponseHandler] Failed to parse thought_start:", e);
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
            logger.warn("[StreamResponseHandler] Failed to parse thought:", e);
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
            logger.warn("[StreamResponseHandler] Failed to parse thought_end:", e);
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
            logger.warn("[StreamResponseHandler] Failed to parse action_start:", e);
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
            logger.warn("[StreamResponseHandler] Failed to parse observation:", e);
          }
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
            logger.warn("[StreamResponseHandler] Failed to parse answer:", e);
          }
          continue;
        }

        // Parse LLM chunk
        const parsedChunk = parseLLMChunk(chunk);

        const sseData = {
          id: responseId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: actualModel,
          choices: [
            {
              index: 0,
              delta: {
                reasoning_content: parsedChunk.isReasoning ? parsedChunk.content : null,
                content: parsedChunk.isReasoning ? null : parsedChunk.content,
              },
              finish_reason: null,
            },
          ],
        };

        res.write(`data: ${JSON.stringify(sseData)}\n\n`);
        chunkIndex++;
      }

      // Send done signal
      res.write("data: [DONE]\n\n");

      // Send conversationId event if available
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
   * Create SSE data for chunk
   */
  createChunkData(
    responseId: string,
    model: string,
    content: string,
    isReasoning: boolean = false
  ): object {
    return {
      id: responseId,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: {
            reasoning_content: isReasoning ? content : null,
            content: isReasoning ? null : content,
          },
          finish_reason: null,
        },
      ],
    };
  }

  /**
   * Create SSE event
   */
  createEvent(eventType: string, data: object): string {
    return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  }
}

/**
 * Create StreamResponseHandler instance
 */
export function createStreamResponseHandler(chatService: ChatService): StreamResponseHandler {
  return new StreamResponseHandler(chatService);
}
