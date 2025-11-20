/**
 * Variable Engine Implementation
 * 
 * 变量引擎实现类
 * 负责解析内容中的变量占位符，支持多提供者、递归解析、缓存等功能
 */

import {
  IVariableEngine,
  IVariableProvider,
  VariableContext,
  VariableEngineOptions
} from '../../types/variable';
import { logger } from '../../utils/logger';
import * as crypto from 'crypto';

/**
 * 缓存条目
 */
interface CacheEntry {
  value: string;
  timestamp: number;
}

/**
 * 变量引擎实现
 */
export class VariableEngine implements IVariableEngine {
  private providers: Map<string, IVariableProvider>;
  private options: Required<VariableEngineOptions>;
  private cache: Map<string, CacheEntry>;

  constructor(options?: VariableEngineOptions) {
    this.providers = new Map();
    this.cache = new Map();

    // 设置默认配置
    this.options = {
      enableRecursion: options?.enableRecursion ?? true,
      maxRecursionDepth: options?.maxRecursionDepth ?? 10,
      detectCircular: options?.detectCircular ?? true,
      placeholderPattern: options?.placeholderPattern ?? /\{\{([^}]+)\}\}/g,
      enableCache: options?.enableCache ?? false,
      cacheTTL: options?.cacheTTL ?? 60000, // 默认 60 秒
    };
  }

  /**
   * 解析内容中的所有变量
   */
  async resolveAll(content: string, context?: VariableContext): Promise<string> {
    if (!content || typeof content !== 'string') {
      return content;
    }

    // 如果禁用递归，直接解析一次
    if (!this.options.enableRecursion) {
      return this.resolveOnce(content, context);
    }

    // 启用递归解析
    let result = content;
    let depth = 0;
    let previousResult = '';

    // 最多递归 maxRecursionDepth 次，或直到结果不再变化
    while (depth < this.options.maxRecursionDepth) {
      previousResult = result;
      result = await this.resolveOnce(result, context);
      
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
  private async resolveOnce(content: string, context?: VariableContext): Promise<string> {
    // 确保使用全局标志
    const pattern = new RegExp(this.options.placeholderPattern.source, 'g');
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
        const resolvedValue = await this.resolveVariable(variableKey, context);
        
        if (resolvedValue !== null) {
          // ✅ 修复1: 使用正则全局替换，并使用回调函数防止 '$' 字符解析错误
          // ✅ 修复2: 转义变量键中的特殊字符，构建精确的正则模式
          const keyPattern = new RegExp(
            `\\{\\{\\s*${this.escapeRegex(variableKey)}\\s*\\}\\}`,
            'g'
          );
          
          // 使用回调函数确保替换值被视为纯文本，不会被解析为特殊替换模式
          result = result.replace(keyPattern, () => resolvedValue);
        } else {
          // 如果无法解析，保留原始占位符
          logger.debug(`[VariableEngine] Variable "${variableKey}" not resolved, keeping original placeholder`);
        }
      } catch (error: any) {
        logger.warn(`[VariableEngine] Failed to resolve variable "${variableKey}": ${error.message || error}`);
        // 解析失败时保留原始占位符
      }
    }

    return result;
  }

  /**
   * 解析单个变量
   * 
   * @param content - 包含变量的内容
   * @param key - 要解析的变量键
   * @param context - 变量上下文
   * @returns 解析后的值，如果未找到则返回 null
   */
  async resolveSingle(content: string, key: string, context?: VariableContext): Promise<string | null> {
    // 检查内容中是否包含该变量
    const pattern = this.options.placeholderPattern;
    const variablePattern = new RegExp(`\\{\\{${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
    
    if (!variablePattern.test(content)) {
      return null;
    }
    
    return this.resolveVariable(key, context);
  }

  /**
   * 解析变量值（内部方法）
   */
  private async resolveVariable(key: string, context?: VariableContext): Promise<string | null> {
    // 检查缓存
    if (this.options.enableCache) {
      const cacheKey = this.getCacheKey(key, context);
      const cached = this.cache.get(cacheKey);
      
      if (cached) {
        const now = Date.now();
        if (now - cached.timestamp < this.options.cacheTTL) {
          logger.debug(`[VariableEngine] Cache hit for variable "${key}"`);
          return cached.value;
        } else {
          // 缓存过期，删除
          this.cache.delete(cacheKey);
        }
      }
    }

    // 遍历所有提供者，按注册顺序尝试解析
    for (const provider of this.providers.values()) {
      try {
        const value = await provider.resolve(key, context);
        
        if (value !== null && value !== undefined) {
          // 缓存结果
          if (this.options.enableCache) {
            const cacheKey = this.getCacheKey(key, context);
            this.cache.set(cacheKey, {
              value,
              timestamp: Date.now()
            });
          }
          
          logger.debug(`[VariableEngine] Variable "${key}" resolved by ${provider.name}`);
          return value;
        }
      } catch (error: any) {
        logger.warn(`[VariableEngine] Provider "${provider.name}" failed to resolve "${key}": ${error.message || error}`);
        // 继续尝试下一个提供者
      }
    }

    // 所有提供者都无法解析
    return null;
  }

  /**
   * 生成缓存键
   * 
   * ✅ 修复3: 缓存键必须包含上下文信息，避免不同上下文的数据串扰
   */
  private getCacheKey(key: string, context?: VariableContext): string {
    if (!context || Object.keys(context).length === 0) {
      return key;
    }

    try {
      // 序列化上下文作为缓存键的一部分
      // 生产环境建议：只提取关键的 ID (userId, sessionId 等) 避免 Key 过大
      const ctxString = JSON.stringify(context);
      
      // 如果上下文字符串太长，使用 Hash 压缩
      if (ctxString.length > 100) {
        const hash = crypto.createHash('md5').update(ctxString).digest('hex');
        return `${key}:${hash}`;
      }
      
      return `${key}:${ctxString}`;
    } catch (error) {
      // 如果序列化失败，回退到只使用 key（可能丢失缓存精度，但不会导致错误）
      logger.warn(`[VariableEngine] Failed to serialize context for cache key: ${error}`);
      return key;
    }
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 注册变量提供者
   */
  registerProvider(provider: IVariableProvider): void {
    if (!provider || !provider.name) {
      throw new Error('Invalid provider: provider must have a name');
    }

    if (this.providers.has(provider.name)) {
      logger.warn(`[VariableEngine] Provider "${provider.name}" already registered, replacing...`);
    }

    this.providers.set(provider.name, provider);
    logger.debug(`[VariableEngine] Provider "${provider.name}" registered`);
  }

  /**
   * 移除变量提供者
   */
  removeProvider(providerName: string): void {
    if (this.providers.delete(providerName)) {
      logger.debug(`[VariableEngine] Provider "${providerName}" removed`);
      
      // 清除相关缓存
      if (this.options.enableCache) {
        // 简单实现：清除所有缓存（可以优化为只清除相关缓存）
        this.cache.clear();
      }
    } else {
      logger.warn(`[VariableEngine] Provider "${providerName}" not found`);
    }
  }

  /**
   * 获取所有已注册的提供者
   */
  getProviders(): IVariableProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * 获取特定提供者
   */
  getProvider(providerName: string): IVariableProvider | undefined {
    return this.providers.get(providerName);
  }

  /**
   * 重置引擎（清除缓存等）
   */
  reset(): void {
    this.cache.clear();
    logger.debug('[VariableEngine] Engine reset');
  }

  /**
   * 获取配置选项
   */
  getOptions(): Readonly<Required<VariableEngineOptions>> {
    return { ...this.options };
  }

  /**
   * 更新配置选项
   */
  updateOptions(options: Partial<VariableEngineOptions>): void {
    this.options = {
      ...this.options,
      ...options
    };
    
    // 如果禁用缓存，清除现有缓存
    if (!this.options.enableCache) {
      this.cache.clear();
    }
    
    logger.debug('[VariableEngine] Options updated');
  }
}

