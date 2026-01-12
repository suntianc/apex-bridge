/**
 * BatchEmbeddingService - 批量嵌入生成服务
 *
 * 提供高性能的批量嵌入生成，支持：
 * - 智能分批处理
 * - 并发控制
 * - 错误重试（指数退避）
 * - 进度追踪
 * - 性能统计
 */

import { logger } from "../../utils/logger";
import { createHash } from "crypto";

/**
 * 批量嵌入配置
 */
export interface BatchEmbeddingConfig {
  /** 每批数量，默认 100 */
  batchSize?: number;
  /** 最大并发数，默认 5 */
  maxConcurrency?: number;
  /** 超时时间（毫秒），默认 60000 */
  timeoutMs?: number;
  /** 重试次数，默认 3 */
  retryAttempts?: number;
  /** 最小重试延迟（毫秒），默认 1000 */
  minRetryDelayMs?: number;
  /** 最大重试延迟（毫秒），默认 10000 */
  maxRetryDelayMs?: number;
  /** 启用进度回调 */
  enableProgressCallback?: boolean;
}

/**
 * 批量嵌入结果
 */
export interface BatchEmbeddingResult {
  /** 嵌入向量数组 */
  embeddings: number[][];
  /** 总处理数量 */
  totalProcessed: number;
  /** 失败数量 */
  failedCount: number;
  /** 总耗时（毫秒） */
  duration: number;
  /** 每批详情 */
  batches: BatchInfo[];
}

/**
 * 单批信息
 */
export interface BatchInfo {
  /** 批索引 */
  batchIndex: number;
  /** 批大小 */
  batchSize: number;
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
}

/**
 * 进度回调函数类型
 */
export type ProgressCallback = (progress: EmbeddingProgress) => void;

/**
 * 错误回调函数类型
 */
export type ErrorCallback = (error: BatchEmbeddingError) => void;

/**
 * 批量嵌入错误信息
 */
export interface BatchEmbeddingError {
  /** 失败的批次索引 */
  batchIndex: number;
  /** 错误信息 */
  message: string;
  /** 失败数量 */
  failedCount: number;
  /** 是否可重试 */
  retryable: boolean;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 嵌入进度信息
 */
export interface EmbeddingProgress {
  /** 已处理数量 */
  processed: number;
  /** 总数量 */
  total: number;
  /** 当前批次索引 */
  currentBatch: number;
  /** 总批次数 */
  totalBatches: number;
  /** 已失败数量 */
  failed: number;
  /** 耗时（毫秒） */
  elapsedMs: number;
  /** 预估剩余时间（毫秒） */
  estimatedRemainingMs: number;
}

/**
 * 批量嵌入服务
 */
export class BatchEmbeddingService {
  private config: Required<BatchEmbeddingConfig>;
  private progressCallback: ProgressCallback | null = null;
  private errorCallback: ErrorCallback | null = null;

  constructor(config: BatchEmbeddingConfig = {}) {
    this.config = {
      batchSize: config.batchSize ?? 100,
      maxConcurrency: config.maxConcurrency ?? 5,
      timeoutMs: config.timeoutMs ?? 60000,
      retryAttempts: config.retryAttempts ?? 3,
      minRetryDelayMs: config.minRetryDelayMs ?? 1000,
      maxRetryDelayMs: config.maxRetryDelayMs ?? 10000,
      enableProgressCallback: config.enableProgressCallback ?? false,
    };
  }

  /**
   * 设置进度回调
   */
  setProgressCallback(callback: ProgressCallback | null): void {
    this.progressCallback = callback;
  }

  /**
   * 设置错误回调
   */
  setErrorCallback(callback: ErrorCallback | null): void {
    this.errorCallback = callback;
  }

  /**
   * 生成批量嵌入向量
   *
   * @param texts 文本列表
   * @param embedFn 嵌入函数 (texts) => Promise<number[][]>
   * @returns 批量结果
   */
  async generateBatch(
    texts: string[],
    embedFn: (texts: string[]) => Promise<number[][]>
  ): Promise<BatchEmbeddingResult> {
    const startTime = Date.now();
    const totalTexts = texts.length;

    if (totalTexts === 0) {
      return {
        embeddings: [],
        totalProcessed: 0,
        failedCount: 0,
        duration: 0,
        batches: [],
      };
    }

    logger.info(`[BatchEmbeddingService] Starting batch embedding for ${totalTexts} texts`);

    // 分批
    const batches = this.createBatches(texts);
    const totalBatches = batches.length;
    const results: (number[] | null)[] = new Array(totalTexts).fill(null);
    const batchInfos: BatchInfo[] = [];
    let processedCount = 0;
    let failedCount = 0;

    // 使用信号量控制并发
    const semaphore = new Semaphore(this.config.maxConcurrency);

    // 处理所有批次
    const batchPromises = batches.map(async (batch, batchIndex) => {
      const batchStartIndex = batchIndex * this.config.batchSize;

      return semaphore.acquire(async () => {
        const batchStartTime = Date.now();
        let success = true;
        let errorMessage: string | undefined;

        try {
          // 执行嵌入（带重试）
          const embeddings = await this.executeWithRetry(
            () => embedFn(batch),
            `Batch ${batchIndex + 1}/${totalBatches}`
          );

          // 验证结果
          if (embeddings.length !== batch.length) {
            throw new Error(
              `Embedding count mismatch: expected ${batch.length}, got ${embeddings.length}`
            );
          }

          // 填充结果（使用预计算的起始索引）
          for (let i = 0; i < batch.length; i++) {
            const globalIndex = batchStartIndex + i;
            if (embeddings[i] && embeddings[i].length > 0) {
              results[globalIndex] = embeddings[i];
            } else {
              success = false;
              failedCount++;
              logger.warn(
                `[BatchEmbeddingService] Empty embedding at index ${globalIndex} in batch ${batchIndex + 1}`
              );
              // 报告部分失败
              this.reportError(batchIndex, `Empty embedding at index ${globalIndex}`, failedCount);
            }
          }
        } catch (err) {
          success = false;
          errorMessage = err instanceof Error ? err.message : "Unknown error";
          failedCount += batch.length;
          logger.error(`[BatchEmbeddingService] Batch ${batchIndex + 1} failed:`, errorMessage);

          // 报告错误到回调
          this.reportError(batchIndex, errorMessage, failedCount);
        }

        const batchEndTime = Date.now();
        const batchInfo: BatchInfo = {
          batchIndex,
          batchSize: batch.length,
          startTime: batchStartTime,
          endTime: batchEndTime,
          success,
          error: errorMessage,
        };
        batchInfos.push(batchInfo);

        processedCount += batch.length;

        // 报告进度
        this.reportProgress(
          processedCount,
          totalTexts,
          batchIndex,
          totalBatches,
          failedCount,
          startTime
        );
      });
    });

    await Promise.all(batchPromises);

    const duration = Date.now() - startTime;

    // 过滤掉空结果
    const validEmbeddings = results.filter((e): e is number[] => e !== null && e.length > 0);

    logger.info(
      `[BatchEmbeddingService] Completed: ${validEmbeddings.length}/${totalTexts} embeddings in ${duration}ms`
    );

    return {
      embeddings: validEmbeddings,
      totalProcessed: validEmbeddings.length,
      failedCount,
      duration,
      batches: batchInfos,
    };
  }

  /**
   * 创建文本批次
   */
  private createBatches(texts: string[]): string[][] {
    const batches: string[][] = [];
    const batchSize = this.config.batchSize;

    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize));
    }

    return batches;
  }

  /**
   * 带重试的执行
   */
  private async executeWithRetry<T>(fn: () => Promise<T>, operationName: string): Promise<T> {
    let lastError: Error | undefined;
    const { retryAttempts, minRetryDelayMs, maxRetryDelayMs } = this.config;

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        return await this.withTimeout(fn(), operationName);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < retryAttempts) {
          // 指数退避
          const delay = this.calculateExponentialBackoff(attempt, minRetryDelayMs, maxRetryDelayMs);
          logger.warn(
            `[BatchEmbeddingService] ${operationName} failed (attempt ${attempt}/${retryAttempts}), retrying in ${delay}ms: ${lastError.message}`
          );
          await this.sleep(delay);
        } else {
          logger.error(
            `[BatchEmbeddingService] ${operationName} failed after ${retryAttempts} attempts:`,
            lastError.message
          );
        }
      }
    }

    throw lastError!;
  }

  /**
   * 计算指数退避延迟
   */
  private calculateExponentialBackoff(attempt: number, minDelay: number, maxDelay: number): number {
    const delay = Math.min(minDelay * Math.pow(2, attempt - 1), maxDelay);
    // 添加随机抖动（±25%）
    const jitter = delay * 0.25 * (Math.random() - 0.5) * 2;
    return Math.max(minDelay, Math.min(maxDelay, delay + jitter));
  }

  /**
   * 带超时的执行
   */
  private async withTimeout<T>(promise: Promise<T>, operationName: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(`Operation "${operationName}" timed out after ${this.config.timeoutMs}ms`)
          );
        }, this.config.timeoutMs);
      }),
    ]);
  }

  /**
   * 睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 报告进度
   */
  private reportProgress(
    processed: number,
    total: number,
    currentBatch: number,
    totalBatches: number,
    failed: number,
    startTime: number
  ): void {
    if (!this.progressCallback && !this.config.enableProgressCallback) {
      return;
    }

    const elapsedMs = Date.now() - startTime;
    const progressPercent = total > 0 ? (processed / total) * 100 : 0;
    const estimatedRemainingMs =
      progressPercent > 0 ? (elapsedMs / processed) * (total - processed) : 0;

    const progress: EmbeddingProgress = {
      processed,
      total,
      currentBatch: currentBatch + 1,
      totalBatches,
      failed,
      elapsedMs,
      estimatedRemainingMs,
    };

    if (processed % 100 === 0 || processed === total) {
      logger.debug(
        `[BatchEmbeddingService] Progress: ${progressPercent.toFixed(1)}% (${processed}/${total}), ` +
          `failed: ${failed}, elapsed: ${(elapsedMs / 1000).toFixed(1)}s`
      );
    }

    if (this.progressCallback) {
      try {
        this.progressCallback(progress);
      } catch (err) {
        logger.warn("[BatchEmbeddingService] Progress callback error:", err);
      }
    }
  }

  /**
   * 报告错误
   */
  private reportError(batchIndex: number, message: string, failedCount: number): void {
    if (!this.errorCallback) {
      return;
    }

    const error: BatchEmbeddingError = {
      batchIndex,
      message,
      failedCount,
      retryable: failedCount < this.config.retryAttempts * this.config.batchSize,
      timestamp: Date.now(),
    };

    try {
      this.errorCallback(error);
    } catch (err) {
      logger.warn("[BatchEmbeddingService] Error callback error:", err);
    }
  }

  /**
   * 生成批次键（用于缓存）
   */
  static generateBatchKey(texts: string[]): string {
    const content = texts.join("|||");
    return createHash("md5").update(content).digest("hex");
  }

  /**
   * 估算处理时间
   */
  static estimateDuration(textCount: number, avgProcessingTimeMs: number = 100): number {
    // 考虑并发和批次开销
    const batchOverhead = Math.ceil(textCount / 100) * 50;
    const concurrencyFactor = Math.ceil(textCount / 1000);
    return (textCount * avgProcessingTimeMs) / concurrencyFactor + batchOverhead;
  }
}

/**
 * 信号量实现（用于并发控制）
 */
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(private readonly maxPermits: number) {
    this.permits = maxPermits;
  }

  async acquire<T>(fn: () => Promise<T>): Promise<T> {
    // 获取许可
    await this.acquirePermit();

    try {
      return await fn();
    } finally {
      this.releasePermit();
    }
  }

  private acquirePermit(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  private releasePermit(): void {
    this.permits++;

    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      if (next) {
        this.permits--;
        next();
      }
    }
  }
}

export { Semaphore };
