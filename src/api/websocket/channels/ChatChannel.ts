/**
 * ChatChannel - 实时对话通道
 * 提供 WebSocket 实时聊天功能，支持普通对话和流式响应
 */

import { WebSocket } from "ws";
import { ChatService } from "../../../services/ChatService";
import { logger } from "../../../utils/logger";
import { Message, ChatOptions } from "../../../types";

/**
 * 扩展 WebSocket 类型以追踪当前请求ID（用于中断）
 */
interface ChatWebSocket extends WebSocket {
  currentRequestId?: string;
  isAlive?: boolean; // 复用 Manager 的定义
}

/**
 * 客户端发送的消息格式
 */
export interface ChatMessage {
  type: "chat" | "stream_chat" | "stop"; // 🆕 新增 stop 类型
  payload?: {
    // 改为可选，因为 stop 不需要 payload
    messages?: Message[];
    options?: ChatOptions;
    requestId?: string; // stop 时可选
  };
}

/**
 * 服务器响应的消息格式
 */
export interface ChatResponse {
  type: "chat_response" | "stream_chunk" | "stream_done" | "error" | "status" | "meta_event";
  payload?: any;
  error?: string;
}

export class ChatChannel {
  constructor(private chatService: ChatService) {}

  /**
   * 处理 WebSocket 连接
   * 注意：API Key 验证已由 WebSocketManager 完成，此处不再重复验证
   */
  handleConnection(ws: ChatWebSocket, _apiKey: string, _request: any): void {
    logger.info("💬 Chat WebSocket connection attached");

    // 监听消息
    ws.on("message", async (data) => {
      try {
        const rawStr = data.toString();

        // 心跳检测 Pong (如果在 Manager 层没处理，这里可以忽略)
        if (rawStr === "pong") {
          return;
        }

        const message = JSON.parse(rawStr) as ChatMessage;

        switch (message.type) {
          case "chat":
            if (message.payload) {
              await this.handleChat(ws, message.payload);
            }
            break;

          case "stream_chat":
            if (message.payload) {
              await this.handleStreamChat(ws, message.payload);
            }
            break;

          case "stop": // 🆕 处理中断请求
            await this.handleStop(ws);
            break;

          default:
            this.sendError(ws, `Unknown message type: ${message.type}`);
        }
      } catch (error: any) {
        // JSON 解析失败或其他同步错误
        logger.error("❌ Chat WebSocket message error:", error);
        this.sendError(ws, "Invalid message format");
      }
    });

    // 监听关闭
    ws.on("close", () => {
      // 连接关闭时，如果有正在进行的请求，尝试自动中断
      if (ws.currentRequestId) {
        logger.info(`🔌 Connection closed, auto-interrupting request: ${ws.currentRequestId}`);
        this.chatService.interruptRequest(ws.currentRequestId).catch(() => {
          // 忽略中断失败的错误，因为连接已经关闭
        });
      }
      logger.info("💬 Chat WebSocket connection closed");
    });

    // 监听错误
    ws.on("error", (error) => {
      logger.error("❌ Chat WebSocket connection error:", error);
    });
  }

  /**
   * 处理普通聊天消息
   */
  private async handleChat(ws: ChatWebSocket, payload: ChatMessage["payload"]): Promise<void> {
    const { messages, options = {} } = payload || {};

    try {
      logger.debug("💬 Processing chat message");

      // 调用 ChatService
      const response = await this.chatService.createChatCompletion({
        messages: messages || [],
        ...options,
      });

      // 发送响应
      this.safeSend(ws, {
        type: "chat_response",
        payload: response,
      });

      logger.info("💬 Chat response sent successfully");
    } catch (error: any) {
      logger.error("💬 Chat processing error:", error);
      this.sendError(ws, error.message || "Internal processing error");
    }
  }

  /**
   * 处理流式聊天消息
   */
  private async handleStreamChat(
    ws: ChatWebSocket,
    payload: ChatMessage["payload"]
  ): Promise<void> {
    const { messages, options = {} } = payload || {};

    try {
      logger.debug("🌊 Processing stream chat message");

      // 调用 ChatService 的流式接口
      const stream = await this.chatService.createStreamChatCompletion({
        messages: messages || [],
        ...options,
        stream: true,
      });

      // 逐块发送响应
      for await (const chunk of stream) {
        // 🆕 修复：不要再次包装 chunk，直接发送
        // ChatService 的 chunk 格式已经是 { type: 'stream_chunk', payload: ... } 或 { type: 'meta_event', payload: ... }

        // 如果 chunk 包含 request_id，记录到 ws
        if (chunk.type === "meta_event" && chunk.payload?.requestId) {
          ws.currentRequestId = chunk.payload.requestId;
          logger.debug(`📌 Request ID captured: ${ws.currentRequestId}`);
        }

        // 直接透传 chunk，不要再次包装
        this.safeSend(ws, chunk);
      }

      // 发送完成标记
      this.safeSend(ws, {
        type: "stream_done",
      });

      // 清理 RequestID
      ws.currentRequestId = undefined;

      logger.info("🌊 Stream chat completed successfully");
    } catch (error: any) {
      logger.error("🌊 Stream chat processing error:", error);
      this.sendError(ws, error.message || "Stream processing error");
      ws.currentRequestId = undefined;
    }
  }

  /**
   * 🆕 处理中断请求
   */
  private async handleStop(ws: ChatWebSocket): Promise<void> {
    if (!ws.currentRequestId) {
      // 如果 ws 上没有记录 ID，说明可能没有正在进行的请求
      // 或者 ChatService 还没来得及返回 ID
      logger.warn("⚠️ Received stop command but no active request ID found on socket");

      this.safeSend(ws, {
        type: "status",
        payload: {
          status: "no_active_request",
          success: false,
        },
      });
      return;
    }

    logger.info(`🛑 Client requested stop for request: ${ws.currentRequestId}`);
    const success = await this.chatService.interruptRequest(ws.currentRequestId);

    this.safeSend(ws, {
      type: "status",
      payload: {
        status: "interrupted",
        success,
        requestId: ws.currentRequestId,
      },
    });

    ws.currentRequestId = undefined;
  }

  /**
   * 安全发送消息（检查连接状态）
   */
  private safeSend(ws: WebSocket, data: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(data));
      } catch (error: any) {
        logger.warn("⚠️ Error sending WebSocket message:", error.message);
      }
    } else {
      logger.warn("⚠️ Attempted to send message to closed socket");
    }
  }

  /**
   * 发送错误消息
   */
  private sendError(ws: WebSocket, error: string): void {
    this.safeSend(ws, {
      type: "error",
      error,
    });
  }
}
