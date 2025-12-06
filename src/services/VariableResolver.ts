/**
 * VariableResolver - 变量解析服务
 * 职责：批量解析消息中的变量占位符，支持缓存机制
 */

import { ProtocolEngine } from '../core/ProtocolEngine';
import type { Message } from '../types';
import { logger } from '../utils/logger';

interface CacheEntry {
  resolved: string;
  timestamp: number;
}

export class VariableResolver {
  private cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs: number;

  constructor(
    private protocolEngine: ProtocolEngine,
    cacheTtlMs = 30000 // 默认30秒缓存
  ) {
    this.cacheTtlMs = cacheTtlMs;
  }

  /**
   * 批量解析消息中的变量
   * @param messages 消息数组
   * @param variables 变量键值对映射
   * @returns 解析后的消息数组
   */
  async resolve(messages: Message[], variables: Record<string, string> = {}): Promise<Message[]> {
    if (!messages || messages.length === 0) {
      return [];
    }

    logger.debug(`[VariableResolver] Resolving variables in ${messages.length} messages`);

    return Promise.all(
      messages.map(msg => this.resolveSingle(msg, variables))
    );
  }

  /**
   * 解析单条消息（带缓存）
   */
  private async resolveSingle(msg: Message, variables: Record<string, string>): Promise<Message> {
    if (!msg.content || typeof msg.content !== 'string') {
      return msg;
    }

    const originalContent = msg.content;
    const originalLength = originalContent.length;
    const cacheKey = `${originalContent}:${JSON.stringify(variables)}`;

    // 检查缓存
    const cached = this.cache.get(cacheKey);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < this.cacheTtlMs) {
        logger.debug(`[VariableResolver] Cache hit (${msg.role}, ${age}ms old)`);
        return { ...msg, content: cached.resolved };
      } else {
        // 缓存过期，删除
        this.cache.delete(cacheKey);
      }
    }

    try {
      // 使用ProtocolEngine的VariableEngine进行变量替换
      const resolvedContent = await this.protocolEngine.variableEngine.resolveAll(
        originalContent,
        variables
      );

      // 调试日志：显示解析前后的长度变化
      if (originalLength !== resolvedContent.length) {
        logger.debug(
          `[VariableResolver] Variable resolved (${msg.role}): ${originalLength} → ${resolvedContent.length} chars (+${resolvedContent.length - originalLength})`
        );
      }

      // 存入缓存
      this.cache.set(cacheKey, {
        resolved: resolvedContent,
        timestamp: Date.now()
      });

      return { ...msg, content: resolvedContent };
    } catch (error: any) {
      // 变量解析失败时降级使用原始文本，确保请求不会因变量解析错误而失败
      logger.warn(
        `[VariableResolver] Variable resolution failed for message (${msg.role}), using original content: ${error.message || error}`
      );

      // 降级：返回原始消息内容
      return { ...msg, content: originalContent };
    }
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.debug(`[VariableResolver] Cache cleared (${size} entries)`);
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { size: number; ttlMs: number } {
    return {
      size: this.cache.size,
      ttlMs: this.cacheTtlMs
    };
  }

  /**
   * 清理过期缓存条目
   */
  cleanupExpiredCache(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.cacheTtlMs) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug(`[VariableResolver] Cleaned ${cleanedCount} expired cache entries`);
    }

    return cleanedCount;
  }

  /**
   * 获取缓存中的条目数
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}
