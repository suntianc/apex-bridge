/**
 * ChatChannel - 实时对话通道
 * 提供 WebSocket 实时聊天功能，支持普通对话和流式响应
 */

import { WebSocket } from 'ws';
import { ChatService } from '../../../services/ChatService';
import { logger } from '../../../utils/logger';
import { Message, ChatOptions } from '../../../types';

export interface ChatMessage {
  type: 'chat' | 'stream_chat';
  payload: {
    messages: Message[];
    options?: ChatOptions;
  };
}

export interface ChatResponse {
  type: 'chat_response' | 'stream_chunk' | 'stream_done' | 'error';
  payload?: any;
  error?: string;
}

export class ChatChannel {
  constructor(private chatService: ChatService) {}

  /**
   * 处理 WebSocket 连接
   */
  handleConnection(ws: WebSocket, apiKey: string, request: any): void {
    // 验证 API Key
    if (!this.validateApiKey(apiKey)) {
      ws.close(1008, 'Invalid API key');
      return;
    }

    logger.info('💬 Chat WebSocket connection established');

    // 监听消息
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString()) as ChatMessage;

        switch (message.type) {
          case 'chat':
            await this.handleChat(ws, message.payload);
            break;

          case 'stream_chat':
            await this.handleStreamChat(ws, message.payload);
            break;

          default:
            this.sendError(ws, `Unknown message type: ${message.type}`);
        }
      } catch (error: any) {
        logger.error('❌ Chat WebSocket error:', error);
        this.sendError(ws, error.message);
      }
    });

    // 监听关闭
    ws.on('close', () => {
      logger.info('💬 Chat WebSocket connection closed');
    });

    // 监听错误
    ws.on('error', (error) => {
      logger.error('💬 Chat WebSocket error:', error);
    });
  }

  /**
   * 处理普通聊天消息
   */
  private async handleChat(ws: WebSocket, payload: ChatMessage['payload']): Promise<void> {
    const { messages, options = {} } = payload;

    try {
      logger.debug('💬 Processing chat message:', { messageCount: messages.length, model: options.model });

      // 调用 ChatService
      const response = await this.chatService.createChatCompletion({
        messages,
        ...options
      });

      // 发送响应
      const chatResponse: ChatResponse = {
        type: 'chat_response',
        payload: response
      };

      ws.send(JSON.stringify(chatResponse));
      logger.info('💬 Chat response sent successfully');

    } catch (error: any) {
      logger.error('💬 Chat processing error:', error);
      this.sendError(ws, `Chat processing failed: ${error.message}`);
    }
  }

  /**
   * 处理流式聊天消息
   */
  private async handleStreamChat(ws: WebSocket, payload: ChatMessage['payload']): Promise<void> {
    const { messages, options = {} } = payload;

    try {
      logger.debug('🌊 Processing stream chat message:', { messageCount: messages.length, model: options.model });

      // 调用 ChatService 的流式接口
      const stream = await this.chatService.createStreamChatCompletion({
        messages,
        ...options,
        stream: true
      });

      // 逐块发送响应
      for await (const chunk of stream) {
        const streamResponse: ChatResponse = {
          type: 'stream_chunk',
          payload: chunk
        };
        ws.send(JSON.stringify(streamResponse));
      }

      // 发送完成标记
      const doneResponse: ChatResponse = {
        type: 'stream_done'
      };
      ws.send(JSON.stringify(doneResponse));

      logger.info('🌊 Stream chat completed successfully');

    } catch (error: any) {
      logger.error('🌊 Stream chat processing error:', error);
      this.sendError(ws, `Stream chat processing failed: ${error.message}`);
    }
  }

  /**
   * 发送错误消息
   */
  private sendError(ws: WebSocket, error: string): void {
    const errorResponse: ChatResponse = {
      type: 'error',
      error
    };

    ws.send(JSON.stringify(errorResponse));
  }

  /**
   * 验证 API Key
   */
  private validateApiKey(apiKey: string): boolean {
    // 从配置或环境变量获取预期的 API Key
    const expectedKey = process.env.API_KEY || '';
    return apiKey === expectedKey;
  }
}