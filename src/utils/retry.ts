/**
 * 重试工具
 * 提供指数退避重试机制
 */

import { logger } from './logger';

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数（默认：3） */
  maxRetries?: number;
  /** 初始延迟时间（毫秒，默认：1000） */
  initialDelay?: number;
  /** 最大延迟时间（毫秒，默认：30000） */
  maxDelay?: number;
  /** 退避倍数（默认：2） */
  backoffMultiplier?: number;
  /** 是否对4xx错误重试（默认：false） */
  retryOn4xx?: boolean;
  /** 自定义错误判断函数，返回true表示应该重试 */
  shouldRetry?: (error: any) => boolean;
}

/**
 * 默认重试配置
 */
const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryOn4xx: false,
  shouldRetry: () => true
};

/**
 * 判断错误是否应该重试
 */
function shouldRetryError(error: any, config: Required<RetryConfig>): boolean {
  // 使用自定义判断函数
  if (config.shouldRetry && !config.shouldRetry(error)) {
    return false;
  }

  // 网络错误或超时，应该重试
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || 
      error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' ||
      error.message?.includes('timeout') || error.message?.includes('network')) {
    return true;
  }

  // 5xx服务器错误，应该重试
  if (error.response?.status >= 500 && error.response?.status < 600) {
    return true;
  }

  // 429 Too Many Requests，应该重试
  if (error.response?.status === 429) {
    return true;
  }

  // 4xx客户端错误，默认不重试（除非配置允许）
  if (error.response?.status >= 400 && error.response?.status < 500) {
    return config.retryOn4xx;
  }

  // 其他错误不重试
  return false;
}

/**
 * 计算退避延迟（指数退避）
 */
function calculateBackoffDelay(attempt: number, config: Required<RetryConfig>): number {
  const delay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1);
  return Math.min(delay, config.maxDelay);
}

/**
 * 等待指定时间
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带重试的函数执行器
 * 
 * @param fn - 要执行的函数（返回Promise）
 * @param config - 重试配置
 * @returns 函数执行结果
 */
export async function retry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const finalConfig: Required<RetryConfig> = {
    ...DEFAULT_CONFIG,
    ...config,
    shouldRetry: config.shouldRetry || DEFAULT_CONFIG.shouldRetry
  };

  let lastError: any;
  let attempt = 0;

  while (attempt <= finalConfig.maxRetries) {
    try {
      const result = await fn();
      
      // 如果之前有重试，记录成功
      if (attempt > 0) {
        logger.info(`✅ Retry succeeded after ${attempt} attempt(s)`);
      }
      
      return result;
    } catch (error: any) {
      lastError = error;
      attempt++;

      // 判断是否应该重试
      if (attempt > finalConfig.maxRetries || !shouldRetryError(error, finalConfig)) {
        // 不重试或已达到最大重试次数
        if (attempt > finalConfig.maxRetries) {
          logger.error(`❌ Max retries (${finalConfig.maxRetries}) exceeded`);
        } else {
          logger.debug(`⚠️ Error not retriable: ${error.message}`);
        }
        throw error;
      }

      // 计算延迟并等待
      const delay = calculateBackoffDelay(attempt, finalConfig);
      logger.warn(
        `⚠️ Attempt ${attempt}/${finalConfig.maxRetries} failed: ${error.message}. ` +
        `Retrying in ${delay}ms...`
      );

      await sleep(delay);
    }
  }

  // 理论上不会到达这里
  throw lastError;
}

/**
 * 创建重试包装器
 */
export function withRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  config?: RetryConfig
): T {
  return ((...args: any[]) => {
    return retry(() => fn(...args), config);
  }) as T;
}

