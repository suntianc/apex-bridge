/**
 * 重试工具
 * 提供指数退避重试机制
 */

import { logger } from "./logger";
import { TIMEOUT, DOOM_LOOP } from "../constants";

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数（默认：3，表示初始1次 + 重试3次 = 总共4次尝试） */
  maxRetries?: number;
  /** 初始延迟时间（毫秒，默认：1000） */
  initialDelay?: number;
  /** 最大延迟时间（毫秒，默认：30000） */
  maxDelay?: number;
  /** 退避倍数（默认：2） */
  backoffMultiplier?: number;
  /** 是否启用随机抖动（默认：true）- 防止惊群效应 */
  jitter?: boolean;
  /** 是否对4xx错误重试（默认：false） */
  retryOn4xx?: boolean;
  /**
   * 自定义错误判断函数
   * 注意：如果提供此函数，将完全接管重试判断逻辑，内置的 5xx/网络错误判断将失效
   * 如果希望基于内置逻辑扩展，请使用 defaultShouldRetry 并在函数内部自行组合
   */
  shouldRetry?: (error: unknown) => boolean;
}

/**
 * 默认重试配置
 */
const DEFAULT_CONFIG: Required<Omit<RetryConfig, "shouldRetry">> = {
  maxRetries: DOOM_LOOP.THRESHOLD,
  initialDelay: 1000,
  maxDelay: TIMEOUT.TOOL_EXECUTION,
  backoffMultiplier: 2,
  jitter: true,
  retryOn4xx: false,
};

/**
 * 默认的重试判断逻辑
 * 可以被导出供用户组合使用
 *
 * @param error - 错误对象
 * @param retryOn4xx - 是否对4xx错误重试
 * @returns 是否应该重试
 */
export function defaultShouldRetry(error: unknown, retryOn4xx: boolean = false): boolean {
  // Extract error properties safely
  const errorObj = error instanceof Error ? error : null;
  const errorMessage = errorObj?.message ?? String(error);
  const errorCode = (errorObj as { code?: string })?.code ?? "";
  const errorResponse = (error as { response?: { status?: number } })?.response;
  const responseStatus = errorResponse?.status;

  // 1. 网络错误或超时，应该重试
  if (
    errorCode === "ECONNABORTED" ||
    errorCode === "ETIMEDOUT" ||
    errorCode === "ENOTFOUND" ||
    errorCode === "ECONNREFUSED" ||
    errorMessage.includes("timeout") ||
    errorMessage.includes("network")
  ) {
    return true;
  }

  // 2. 429 Too Many Requests（无论 retryOn4xx 如何都应该重试）
  if (responseStatus === 429) {
    return true;
  }

  // 3. 5xx服务器错误，应该重试
  if (responseStatus !== undefined && responseStatus >= 500 && responseStatus < 600) {
    return true;
  }

  // 4. 4xx客户端错误，默认不重试（除非配置允许）
  if (responseStatus !== undefined && responseStatus >= 400 && responseStatus < 500) {
    return retryOn4xx;
  }

  // 其他错误不重试
  return false;
}

/**
 * 计算退避延迟（指数退避 + Jitter）
 *
 * @param attempt - 当前尝试次数（从1开始）
 * @param config - 重试配置
 * @returns 延迟时间（毫秒）
 */
function calculateBackoffDelay(
  attempt: number,
  config: Required<Omit<RetryConfig, "shouldRetry">>
): number {
  let delay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1);

  // 限制最大延迟
  delay = Math.min(delay, config.maxDelay);

  // 🛡️ 添加抖动 (Jitter): 随机增加 0-20% 的时间
  // Full Jitter 策略更为复杂，这里采用简单的 Decorrelated Jitter 变体
  // 防止高并发场景下的惊群效应（Thundering Herd）
  if (config.jitter) {
    const jitterFactor = 1 + Math.random() * 0.2; // 1.0 - 1.2
    delay = Math.floor(delay * jitterFactor);
  }

  return delay;
}

/**
 * 等待指定时间
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 带重试的函数执行器
 *
 * @param fn - 要执行的函数（返回Promise）
 * @param config - 重试配置
 * @returns 函数执行结果
 */
export async function retry<T>(fn: () => Promise<T>, config: RetryConfig = {}): Promise<T> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  let lastError: unknown;
  let attempt = 0;

  // 循环条件：尝试次数 <= 最大重试次数
  // attempt 0 是首次执行，attempt 1-N 是重试
  // maxRetries=3 表示：初始1次 + 重试3次 = 总共4次尝试
  while (attempt <= finalConfig.maxRetries) {
    try {
      const result = await fn();

      // 如果之前有重试，记录成功
      if (attempt > 0) {
        logger.info(`✅ Retry succeeded after ${attempt} retry(s)`);
      }

      return result;
    } catch (error: unknown) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 检查是否达到最大重试次数
      if (attempt >= finalConfig.maxRetries) {
        logger.warn(
          `❌ Max retries (${finalConfig.maxRetries}) exceeded. Last error: ${errorMessage}`
        );
        throw error;
      }

      // 🛠️ 修复：判断是否应该重试
      // 如果用户提供了自定义逻辑，完全信任用户（Override 模式）
      // 否则使用默认逻辑
      let shouldRetry = false;
      if (config.shouldRetry) {
        // 用户自定义逻辑完全接管
        shouldRetry = config.shouldRetry(error);
      } else {
        // 使用默认逻辑
        shouldRetry = defaultShouldRetry(error, finalConfig.retryOn4xx);
      }

      if (!shouldRetry) {
        logger.debug(`⚠️ Error not retriable: ${errorMessage}`);
        throw error;
      }

      attempt++;

      // 计算延迟（带 Jitter）
      const delay = calculateBackoffDelay(attempt, finalConfig);

      logger.warn(
        `⚠️ Request failed: ${errorMessage}. ` +
          `Retrying attempt ${attempt}/${finalConfig.maxRetries} in ${delay}ms...`
      );

      await sleep(delay);
    }
  }

  // 理论上不会到达这里（所有错误都应该在循环内处理）
  throw lastError;
}

/**
 * 创建重试包装器
 */
export function withRetry<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  config?: RetryConfig
): T {
  return ((...args: unknown[]) => {
    return retry(() => fn(...args), config);
  }) as T;
}
