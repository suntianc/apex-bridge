/**
 * StreamHandler - 流式处理器
 *
 * 负责流式消息处理、WebSocket支持和中断处理
 */

import { RequestTracker } from '../RequestTracker';
import type { IWebSocketManager } from '../../api/websocket/WebSocketManager';
import type { ChatStrategy } from '../../strategies/ChatStrategy';
import type { Message, ChatOptions, WebSocketCallbacks } from './types';
import { generateRequestId } from '../../utils/request-id';
import { logger } from '../../utils/logger';

/**
 * 流式处理器接口
 */
export interface IStreamHandler {
  /**
   * 创建流式处理器
   */
  createStream(
    messages: Message[],
    options: ChatOptions,
    abortController?: AbortController
  ): AsyncIterableIterator<string>;

  /**
   * 发送WebSocket数据块
   */
  sendChunk(data: string, callbacks: WebSocketCallbacks): void;

  /**
   * 处理中断
   */
  handleInterrupt(requestId: string, callbacks: WebSocketCallbacks): Promise<boolean>;

  /**
   * 注册请求
   */
  registerRequest(
    requestId: string,
    abortController: AbortController,
    context?: unknown
  ): void;

  /**
   * 取消注册请求
   */
  unregisterRequest(requestId: string): void;

  /**
   * 中断请求
   */
  interruptRequest(requestId: string): Promise<boolean>;

  /**
   * 获取活跃请求数量
   */
  getActiveRequestCount(): number;

  /**
   * 获取请求追踪器
   */
  getRequestTracker(): RequestTracker;
}

/**
 * 流式处理器实现
 */
export class StreamHandler implements IStreamHandler {
  private readonly requestTracker: RequestTracker;

  constructor(requestTracker: RequestTracker);
  constructor(webSocketManager?: IWebSocketManager, timeout?: number);
  constructor(webSocketManager?: IWebSocketManager | RequestTracker, timeout: number = 300000) {
    if (webSocketManager instanceof RequestTracker) {
      this.requestTracker = webSocketManager;
    } else {
      this.requestTracker = new RequestTracker(webSocketManager, timeout);
    }
  }

  /**
   * 创建流式处理器
   */
  createStream(
    messages: Message[],
    options: ChatOptions,
    abortController?: AbortController
  ): AsyncIterableIterator<string> {
    const requestId = options.requestId || generateRequestId();
    const controller = abortController || new AbortController();
    const abortSignal = options.websocketCallbacks ? controller.signal : undefined;

    const generator = this.createStreamGenerator(
      messages,
      options,
      requestId,
      controller,
      abortSignal
    );

    return generator;
  }

  /**
   * 创建流式生成器
   */
  private async *createStreamGenerator(
    _messages: Message[],
    options: ChatOptions,
    requestId: string,
    abortController: AbortController,
    abortSignal?: AbortSignal
  ): AsyncIterableIterator<string> {
    const callbacks = options.websocketCallbacks;

    // 注册请求
    this.registerRequest(requestId, abortController, { messages: _messages, options });

    try {
      // 监听外部中断信号
      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          abortController.abort();
          logger.debug(`[StreamHandler] External abort signal received for ${requestId}`);
        });
      }

      // 发送请求ID
      yield requestId;
    } finally {
      this.unregisterRequest(requestId);
      logger.debug(`[StreamHandler] Stream completed for ${requestId}`);
    }
  }

  /**
   * 发送WebSocket数据块
   */
  sendChunk(data: string, callbacks: WebSocketCallbacks): void {
    try {
      callbacks.send(data);
    } catch (error) {
      logger.error(`[StreamHandler] Failed to send chunk: ${(error as Error).message}`);
      if (callbacks.onError) {
        callbacks.onError(error as Error);
      }
    }
  }

  /**
   * 处理中断
   */
  async handleInterrupt(requestId: string, callbacks: WebSocketCallbacks): Promise<boolean> {
    const success = await this.interruptRequest(requestId);

    if (success) {
      logger.info(`[StreamHandler] Request ${requestId} interrupted successfully`);
      if (callbacks.onInterrupt) {
        callbacks.onInterrupt();
      }
    } else {
      logger.warn(`[StreamHandler] Failed to interrupt request ${requestId}`);
    }

    return success;
  }

  /**
   * 注册请求
   */
  registerRequest(
    requestId: string,
    abortController: AbortController,
    context?: unknown
  ): void {
    this.requestTracker.register(requestId, abortController, context);
  }

  /**
   * 取消注册请求
   */
  unregisterRequest(requestId: string): void {
    this.requestTracker.unregister(requestId);
  }

  /**
   * 中断请求
   */
  async interruptRequest(requestId: string): Promise<boolean> {
    return this.requestTracker.interrupt(requestId);
  }

  /**
   * 获取活跃请求数量
   */
  getActiveRequestCount(): number {
    return this.requestTracker.getActiveRequestCount();
  }

  /**
   * 获取请求追踪器
   */
  getRequestTracker(): RequestTracker {
    return this.requestTracker;
  }
}

/**
 * 流式结果处理器
 */
export class StreamResultHandler {
  private fullContent: string = '';
  private collectedThinking: string[] = [];

  /**
   * 处理单个数据块
   */
  processChunk(chunk: string): { isJson: boolean; content?: string; thinking?: string } {
    this.fullContent += chunk;

    try {
      const parsed = JSON.parse(chunk);
      if (parsed.reasoning_content) {
        this.collectedThinking.push(parsed.reasoning_content);
      }
      return {
        isJson: true,
        content: parsed.content,
        thinking: parsed.reasoning_content
      };
    } catch {
      return { isJson: false, content: chunk };
    }
  }

  /**
   * 获取完整内容
   */
  getFullContent(): string {
    return this.fullContent;
  }

  /**
   * 获取思考过程
   */
  getThinkingProcess(): string[] {
    return this.collectedThinking;
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.fullContent = '';
    this.collectedThinking = [];
  }
}

/**
 * 创建流式处理器
 */
export function createStreamHandler(
  webSocketManager?: IWebSocketManager,
  timeout: number = 300000
): IStreamHandler {
  const requestTracker = new RequestTracker(webSocketManager, timeout);
  return new StreamHandler(requestTracker);
}
