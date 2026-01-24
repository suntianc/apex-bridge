/**
 * Variable Engine Implementation - Unified Version
 *
 * 统一的变量引擎实现
 * 职责：对固定格式{{placeholder}}进行变量替换
 * 特点：支持缓存、批量处理、递归解析
 *
 * 修复内容：
 * - M-004: 添加 MAX_CACHE_SIZE = 10000 限制
 * - 实现 LRU 缓存淘汰策略
 */

import { logger } from "../../utils/logger";
import type { Message } from "../../types";

/** M-004: 缓存最大大小限制 */
const MAX_CACHE_SIZE = 10000;

interface CacheEntry {
  resolved: string;
  timestamp: number;
  /** LRU: 最近访问时间 */
  lastAccessed: number;
}

export interface VariableEngineConfig {
  /** 是否启用缓存（默认true） */
  enableCache?: boolean;
  /** 缓存TTL毫秒数（默认30000ms） */
  cacheTtlMs?: number;
  /** 是否启用递归解析（默认true） */
  enableRecursion?: boolean;
  /** 最大递归深度（默认10） */
  maxRecursionDepth?: number;
}

/**
 * 变量引擎实现 - 统一版
 */
export class VariableEngine {
  private options: {
    enableRecursion: boolean;
    maxRecursionDepth: number;
    placeholderPattern: RegExp;
  };

  // M-004: 缓存相关 - 添加 LRU 支持
  private cache = new Map<string, CacheEntry>();
  private enableCache: boolean;
  private cacheTtlMs: number;

  constructor(config?: VariableEngineConfig) {
    // 配置选项
    this.options = {
      enableRecursion: config?.enableRecursion ?? true,
      maxRecursionDepth: config?.maxRecursionDepth ?? 10,
      placeholderPattern: /\{\{([^}]+)\}\}/g,
    };

    // 缓存配置
    this.enableCache = config?.enableCache ?? true;
    this.cacheTtlMs = config?.cacheTtlMs ?? 30000; // 默认30秒
  }

  /**
   * 解析内容中的所有变量占位符
   *
   * @param content - 要解析的内容
   * @param variables - 变量键值对映射
   * @param options - 解析选项
   * @returns 解析后的内容
   */
  async resolveAll(
    content: string,
    variables: Record<string, string> = {},
    options?: { fillEmptyOnMissing?: boolean }
  ): Promise<string> {
    if (!content || typeof content !== "string") {
      return content;
    }

    const fillEmptyOnMissing = options?.fillEmptyOnMissing ?? false;

    // 如果禁用递归，直接解析一次
    if (!this.options.enableRecursion) {
      return this.resolveOnce(content, variables, fillEmptyOnMissing);
    }

    // 启用递归解析
    let result = content;
    let depth = 0;
    let previousResult = "";

    // 最多递归 maxRecursionDepth 次，或直到结果不再变化
    while (depth < this.options.maxRecursionDepth) {
      previousResult = result;
      result = await this.resolveOnce(result, variables, fillEmptyOnMissing);

      // 如果结果不再变化，说明没有更多变量需要解析
      if (result === previousResult) {
        break;
      }

      depth++;
    }

    if (depth >= this.options.maxRecursionDepth) {
      logger.warn(
        `[VariableEngine] Max recursion depth (${this.options.maxRecursionDepth}) reached.`
      );
    }

    return result;
  }

  /**
   * 单次解析（不递归）
   */
  private async resolveOnce(
    content: string,
    variables: Record<string, string>,
    fillEmptyOnMissing: boolean = false
  ): Promise<string> {
    // 确保使用全局标志
    const pattern = new RegExp(this.options.placeholderPattern.source, "g");
    const matches = Array.from(content.matchAll(pattern));

    if (matches.length === 0) {
      return content;
    }

    // 提取唯一的变量键，避免重复解析
    const uniqueKeys = new Set<string>();
    for (const match of matches) {
      const key = match[1]?.trim();
      if (key) {
        uniqueKeys.add(key);
      }
    }

    let result = content;

    // 对每个唯一的变量键进行解析和替换
    for (const variableKey of uniqueKeys) {
      try {
        const resolvedValue = await this.resolveVariable(variableKey, variables);

        if (resolvedValue !== null) {
          // 使用正则全局替换，并使用回调函数防止 '$' 字符解析错误
          // 转义变量键中的特殊字符，构建精确的正则模式
          const keyPattern = new RegExp(
            `\\{\\{\\s*${this.escapeRegex(variableKey)}\\s*\\}\\}`,
            "g"
          );

          // 使用回调函数确保替换值被视为纯文本，不会被解析为特殊替换模式
          result = result.replace(keyPattern, () => resolvedValue);
        } else {
          // 如果无法解析
          if (fillEmptyOnMissing) {
            // 自动填充为空字符串
            const keyPattern = new RegExp(
              `\\{\\{\\s*${this.escapeRegex(variableKey)}\\s*\\}\\}`,
              "g"
            );
            result = result.replace(keyPattern, "");
            logger.debug(
              `[VariableEngine] Variable "${variableKey}" not found, filled with empty string`
            );
          } else {
            // 保留原始占位符
            logger.debug(
              `[VariableEngine] Variable "${variableKey}" not resolved, keeping original placeholder`
            );
          }
        }
      } catch (error: any) {
        logger.warn(
          `[VariableEngine] Failed to resolve variable "${variableKey}": ${error.message || error}`
        );
        // 解析失败时保留原始占位符
      }
    }

    return result;
  }

  /**
   * 解析单个变量
   *
   * @param content - 要解析的内容
   * @param key - 要解析的变量键
   * @param variables - 变量键值对映射
   * @returns 解析后的值，如果未找到则返回 null
   */
  async resolveSingle(
    content: string,
    key: string,
    variables: Record<string, string> = {}
  ): Promise<string | null> {
    // 检查内容中是否包含该变量
    const pattern = this.options.placeholderPattern;
    const variablePattern = new RegExp(
      `\\{\\{${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}\\}`,
      "g"
    );

    if (!variablePattern.test(content)) {
      return null;
    }

    return this.resolveVariable(key, variables);
  }

  /**
   * 解析变量值（内部方法）
   */
  private async resolveVariable(
    key: string,
    variables: Record<string, string>
  ): Promise<string | null> {
    // 直接从variables映射中查找
    if (key in variables) {
      const value = variables[key];
      return String(value);
    }

    // 变量未找到
    return null;
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * 检测文本中是否包含未替换的占位符
   *
   * @param text - 要检测的文本
   * @returns true如果包含占位符，否则false
   */
  hasPlaceholders(text: string): boolean {
    if (!text || typeof text !== "string") {
      return false;
    }
    return this.options.placeholderPattern.test(text);
  }

  /**
   * 提取文本中所有的占位符key
   *
   * @param text - 要提取的文本
   * @returns 占位符key数组
   */
  getPlaceholderKeys(text: string): string[] {
    if (!text || typeof text !== "string") {
      return [];
    }

    const pattern = new RegExp(this.options.placeholderPattern.source, "g");
    const matches = Array.from(text.matchAll(pattern));
    const keys = new Set<string>();

    for (const match of matches) {
      const key = match[1]?.trim();
      if (key) {
        keys.add(key);
      }
    }

    return Array.from(keys);
  }

  /**
   * 重置引擎（保持接口兼容，简化版无实际操作）
   */
  reset(): void {
    this.clearCache();
    logger.debug("[VariableEngine] Engine reset");
  }

  /**
   * 获取配置选项
   */
  getOptions(): Readonly<{
    enableRecursion: boolean;
    maxRecursionDepth: number;
    placeholderPattern: RegExp;
  }> {
    return { ...this.options };
  }

  // ==================== 批量处理方法 ====================

  /**
   * 批量解析消息中的变量（带缓存）
   * @param messages 消息数组
   * @param variables 变量键值对映射
   * @returns 解析后的消息数组
   */
  async resolveMessages(
    messages: Message[],
    variables: Record<string, string> = {}
  ): Promise<Message[]> {
    if (!messages || messages.length === 0) {
      return [];
    }

    logger.debug(`[VariableEngine] Resolving variables in ${messages.length} messages`);

    return Promise.all(messages.map((msg) => this.resolveMessage(msg, variables)));
  }

  /**
   * 解析单条消息（带缓存）
   */
  private async resolveMessage(msg: Message, variables: Record<string, string>): Promise<Message> {
    // 🐾 多模态消息直接返回，不做任何处理
    if (!msg.content || typeof msg.content !== "string") {
      return msg;
    }

    const originalContent = msg.content;
    const originalLength = originalContent.length;

    // 如果启用缓存，检查缓存
    if (this.enableCache) {
      const cacheKey = `${originalContent}:${JSON.stringify(variables)}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        const age = Date.now() - cached.timestamp;
        logger.debug(`[VariableEngine] Cache hit (${msg.role}, ${age}ms old)`);
        return { ...msg, content: cached.resolved };
      }
    }

    try {
      const resolvedContent = await this.resolveAll(originalContent, variables);

      if (originalLength !== resolvedContent.length) {
        logger.debug(
          `[VariableEngine] Variable resolved (${msg.role}): ${originalLength} → ${resolvedContent.length} chars`
        );
      }

      // M-004: 存入缓存（带 LRU 策略）
      if (this.enableCache) {
        const cacheKey = `${originalContent}:${JSON.stringify(variables)}`;
        this.addToCache(cacheKey, resolvedContent);
      }

      return { ...msg, content: resolvedContent };
    } catch (error: any) {
      logger.warn(
        `[VariableEngine] Variable resolution failed for message (${msg.role}), using original: ${error.message || error}`
      );
      return { ...msg, content: originalContent };
    }
  }

  // ==================== 缓存管理方法 ====================

  /**
   * M-004: 添加缓存条目（带 LRU 淘汰策略）
   */
  private addToCache(key: string, value: string): void {
    if (!this.enableCache) return;

    // 如果缓存已满，执行 LRU 淘汰
    if (this.cache.size >= MAX_CACHE_SIZE) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(key, {
      resolved: value,
      timestamp: now,
      lastAccessed: now,
    });
  }

  /**
   * M-004: LRU 缓存淘汰 - 移除最近最少使用的条目
   */
  private evictLRU(): void {
    let oldestEntry: [string, CacheEntry] | null = null;

    for (const entry of this.cache.entries()) {
      if (!oldestEntry || entry[1].lastAccessed < oldestEntry[1].lastAccessed) {
        oldestEntry = entry;
      }
    }

    if (oldestEntry) {
      this.cache.delete(oldestEntry[0]);
      logger.debug(
        `[VariableEngine] LRU cache eviction: removed "${oldestEntry[0].substring(0, 50)}..."`
      );
    }
  }

  /**
   * 获取缓存条目（更新访问时间）
   */
  private getFromCache(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    const age = now - entry.timestamp;

    if (age > this.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }

    // 更新访问时间（用于 LRU）
    entry.lastAccessed = now;
    return entry;
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    const size = this.cache.size;
    this.cache.clear();
    if (size > 0) {
      logger.debug(`[VariableEngine] Cache cleared (${size} entries)`);
    }
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { size: number; ttlMs: number; enabled: boolean; maxSize: number } {
    return {
      size: this.cache.size,
      ttlMs: this.cacheTtlMs,
      enabled: this.enableCache,
      maxSize: MAX_CACHE_SIZE,
    };
  }

  /**
   * 清理过期缓存条目
   */
  cleanupExpiredCache(): number {
    if (!this.enableCache) return 0;

    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.cacheTtlMs) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug(`[VariableEngine] Cleaned ${cleanedCount} expired cache entries`);
    }

    return cleanedCount;
  }
}
