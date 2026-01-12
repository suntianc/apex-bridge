/**
 * RequestTracker - 活动请求生命周期管理
 * 职责：注册、中断、清理活动请求，支持超时自动清理
 *
 * 修复内容：
 * - M-003: 优化清理逻辑确保请求完整中断
 * - 添加等待机制确保 destroy() 等待完成
 */

import { EventEmitter } from "events";
import type { IWebSocketManager } from "../api/websocket/WebSocketManager";
import { logger } from "../utils/logger";

/**
 * 活动请求接口
 */
interface ActiveRequest {
  requestId: string;
  abortController: AbortController;
  startTime: number;
  context?: any;
}

export class RequestTracker extends EventEmitter {
  private activeRequests = new Map<string, ActiveRequest>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private timeoutMs: number;
  private destroyPromise: Promise<void> | null = null;
  private isDestroying = false;

  constructor(
    private wsManager: IWebSocketManager | null,
    timeoutMs = 300000 // 默认5分钟超时
  ) {
    super();
    this.timeoutMs = timeoutMs;
    this.startCleanupTimer();
  }

  /**
   * 注册请求
   */
  register(requestId: string, abortController: AbortController, context?: any): void {
    if (this.isDestroying) {
      logger.warn(`[RequestTracker] Ignoring register request during destroy: ${requestId}`);
      return;
    }

    this.activeRequests.set(requestId, {
      requestId,
      abortController,
      startTime: Date.now(),
      context,
    });

    this.emit("request:registered", requestId, context);
    logger.debug(
      `[RequestTracker] Registered request: ${requestId} (total: ${this.activeRequests.size})`
    );
  }

  /**
   * 中断请求
   */
  async interrupt(requestId: string): Promise<boolean> {
    if (this.isDestroying) {
      logger.warn(`[RequestTracker] Ignoring interrupt request during destroy: ${requestId}`);
      return false;
    }

    const request = this.activeRequests.get(requestId);
    if (!request) {
      logger.warn(`[RequestTracker] Request not found for interrupt: ${requestId}`);
      return false;
    }

    logger.debug(`[RequestTracker] Interrupting request: ${requestId}`);

    // 触发中断
    request.abortController.abort();

    // 发送事件
    this.emit("request:interrupted", requestId, request);

    // WebSocket通知
    this.notifyWebSocket(requestId, "interrupted", request);

    // 清理请求
    this.cleanup(requestId);

    return true;
  }

  /**
   * 清理单个请求
   */
  cleanup(requestId: string): void {
    const request = this.activeRequests.get(requestId);

    if (request) {
      const duration = Date.now() - request.startTime;
      logger.debug(`[RequestTracker] Cleaning up request: ${requestId} (duration: ${duration}ms)`);

      this.activeRequests.delete(requestId);
      this.emit("request:cleanup", requestId, duration);
    }
  }

  /**
   * 启动定期清理定时器（每分钟检查一次）
   *
   * M-003 修复：优化清理逻辑确保请求完整中断
   */
  private startCleanupTimer(): void {
    // 每分钟检查一次
    this.cleanupTimer = setInterval(async () => {
      if (this.isDestroying) {
        return;
      }

      const now = Date.now();
      let cleanedCount = 0;

      for (const [id, request] of this.activeRequests.entries()) {
        const age = now - request.startTime;

        if (age > this.timeoutMs) {
          logger.warn(`[RequestTracker] Auto-cleaning timeout request: ${id} (age: ${age}ms)`);

          // 确保请求被完整中断
          request.abortController.abort();

          // 等待一小段时间确保中断生效
          await new Promise((resolve) => setTimeout(resolve, 100));

          this.cleanup(id);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.debug(`[RequestTracker] Cleaned ${cleanedCount} timeout request(s)`);
      }
    }, 60000);

    logger.debug(`[RequestTracker] Cleanup timer started (timeout: ${this.timeoutMs}ms)`);
  }

  /**
   * 停止清理定时器
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.debug("[RequestTracker] Cleanup timer stopped");
    }
  }

  /**
   * 获取活动请求数量
   */
  getCount(): number {
    return this.activeRequests.size;
  }

  /**
   * 🆕 获取活动请求数量（兼容方法）
   */
  getActiveRequestCount(): number {
    return this.activeRequests.size;
  }

  /**
   * 🆕 注销请求（兼容方法）
   */
  unregister(requestId: string): void {
    this.cleanup(requestId);
  }

  /**
   * 检查请求是否存在
   */
  hasRequest(requestId: string): boolean {
    return this.activeRequests.has(requestId);
  }

  /**
   * 获取请求（用于调试）
   */
  getRequest(requestId: string): ActiveRequest | undefined {
    return this.activeRequests.get(requestId);
  }

  /**
   * 获取所有活动请求（用于监控）
   */
  getAllRequests(): Map<string, ActiveRequest> {
    return new Map(this.activeRequests);
  }

  /**
   * WebSocket通知
   */
  private notifyWebSocket(requestId: string, status: string, request: ActiveRequest): void {
    if (!this.wsManager) {
      return;
    }

    try {
      const channel = this.wsManager.getChannel?.("ABPLog");
      if (
        channel &&
        typeof (channel as { pushLog?: (data: unknown) => void }).pushLog === "function"
      ) {
        (channel as { pushLog: (data: unknown) => void }).pushLog({
          status,
          content: `请求已${status === "interrupted" ? "中断" : status}: ${requestId}`,
          source: "request_interrupt",
          metadata: {
            requestId,
            timestamp: new Date().toISOString(),
            duration: Date.now() - request.startTime,
            context: request.context,
          },
        });

        logger.debug(`[RequestTracker] Pushed ${status} notification to ABPLog`);
      }
    } catch (wsError) {
      logger.warn(`[RequestTracker] WebSocket push failed (non-critical):`, wsError);
    }
  }

  /**
   * 销毁（清理所有请求和定时器）
   *
   * M-003 修复：添加等待机制确保 destroy() 等待完成
   */
  async destroy(): Promise<void> {
    // 防止重复调用
    if (this.isDestroying) {
      return this.destroyPromise ?? undefined;
    }

    this.isDestroying = true;

    this.destroyPromise = (async () => {
      // 停止定时器
      this.stopCleanupTimer();

      // 中断所有活动请求
      let interruptedCount = 0;
      const requestsToInterrupt = Array.from(this.activeRequests.entries());

      for (const [id, request] of requestsToInterrupt) {
        try {
          request.abortController.abort();
          interruptedCount++;
          this.emit("request:interrupted", id, request);

          // 等待一小段时间确保中断生效
          await new Promise((resolve) => setTimeout(resolve, 50));
        } catch (error) {
          logger.warn(`[RequestTracker] Error interrupting request ${id}:`, error);
        }
      }

      // 清空请求列表
      this.activeRequests.clear();

      logger.info(`[RequestTracker] Destroyed (interrupted ${interruptedCount} active requests)`);

      this.isDestroying = false;
    })();

    return this.destroyPromise;
  }
}
