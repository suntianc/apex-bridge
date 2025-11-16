/**
 * Variable Engine
 * 
 * 变量占位符解析引擎，支持递归解析和循环依赖检测
 * 独立于vcp-intellicore-sdk的实现
 * 
 * @module core/variable
 */

import {
  IVariableEngine,
  IVariableProvider,
  VariableEngineOptions,
  VariableContext,
  CircularDependencyError,
} from '../../types/variable';
import { logger } from '../../utils/logger';

/**
 * 变量引擎默认配置
 */
const DEFAULT_OPTIONS: Required<Omit<VariableEngineOptions, 'placeholderPattern'>> & { placeholderPattern: RegExp } = {
  enableRecursion: true,
  maxRecursionDepth: 10,
  detectCircular: true,
  placeholderPattern: /\{\{([a-zA-Z0-9_:]+)\}\}/g,
  enableCache: false,
  cacheTTL: 60000,
};

/**
 * 变量引擎实现
 * 
 * 核心功能：
 * - 解析 {{KEY}} 格式的占位符
 * - 支持递归解析（变量值中可能包含其他变量）
 * - 循环依赖检测
 * - 多提供者支持
 * - 性能优化（正则缓存、批量替换）
 */
export class VariableEngine implements IVariableEngine {
  private providers: Map<string, IVariableProvider>;
  private options: Required<Omit<VariableEngineOptions, 'placeholderPattern'>> & { placeholderPattern: RegExp };
  private cachedPlaceholderRegex: RegExp;
  private regexCache: Map<string, RegExp>;
  private resultCache: Map<string, { value: string; timestamp: number }>;
  private static readonly MAX_PLACEHOLDERS = 100; // 防止DoS攻击

  constructor(options?: VariableEngineOptions) {
    this.providers = new Map();
    this.options = { ...DEFAULT_OPTIONS, ...options };
    // 缓存占位符正则表达式
    this.cachedPlaceholderRegex = new RegExp(this.options.placeholderPattern.source, 'g');
    // RegExp缓存池
    this.regexCache = new Map();
    // 结果缓存
    this.resultCache = new Map();
  }

  /**
   * 解析内容中的所有变量
   * 
   * @param content - 包含变量占位符的内容
   * @param context - 上下文信息
   * @returns 解析后的内容
   */
  async resolveAll(content: string, context?: VariableContext): Promise<string> {
    if (content == null || content === '') {
      return '';
    }

    // 检查缓存
    if (this.options.enableCache) {
      const cacheKey = this.getCacheKey(content, context);
      const cached = this.resultCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.options.cacheTTL) {
        logger.debug('[VariableEngine] Using cached result');
        return cached.value;
      }
    }

    let processedContent = String(content);
    const processingStack = new Set<string>();

    // 如果启用递归，使用递归解析
    if (this.options.enableRecursion) {
      processedContent = await this.resolveRecursive(
        processedContent,
        context,
        processingStack,
        0,
      );
    } else {
      // 单次解析
      processedContent = await this.resolveSinglePass(processedContent, context);
    }

    // 保存到缓存
    if (this.options.enableCache) {
      const cacheKey = this.getCacheKey(content, context);
      this.resultCache.set(cacheKey, {
        value: processedContent,
        timestamp: Date.now(),
      });
    }

    return processedContent;
  }

  /**
   * 递归解析变量
   * 
   * @param content - 内容
   * @param context - 上下文
   * @param processingStack - 处理栈（用于检测循环依赖）
   * @param depth - 当前递归深度
   * @returns 解析后的内容
   */
  private async resolveRecursive(
    content: string,
    context: VariableContext | undefined,
    processingStack: Set<string>,
    depth: number,
  ): Promise<string> {
    // 检查递归深度
    if (depth >= this.options.maxRecursionDepth) {
      logger.warn(
        `[VariableEngine] Max recursion depth (${this.options.maxRecursionDepth}) reached`,
      );
      throw new Error(
        `Maximum recursion depth of ${this.options.maxRecursionDepth} exceeded`,
      );
    }

    let processedContent = content;

    // 提取所有占位符
    const placeholders = this.extractPlaceholders(processedContent);
    
    // 安全检查：限制占位符数量，防止DoS攻击
    if (placeholders.length > VariableEngine.MAX_PLACEHOLDERS) {
      logger.warn(
        `[VariableEngine] Too many placeholders (${placeholders.length}), limit is ${VariableEngine.MAX_PLACEHOLDERS}`,
      );
      throw new Error(
        `Too many placeholders: ${placeholders.length} (max: ${VariableEngine.MAX_PLACEHOLDERS})`,
      );
    }

    // 优化：收集所有需要替换的占位符（批量处理）
    const replacements = new Map<string, string>();

    // 遍历所有占位符，收集替换值
    for (const placeholder of placeholders) {
      const key = placeholder.key;
      const fullPlaceholder = placeholder.full;

      // 循环依赖检测
      if (this.options.detectCircular && processingStack.has(key)) {
        const stack = Array.from(processingStack);
        logger.error(
          `[VariableEngine] Circular dependency detected! Stack: [${stack.join(' -> ')} -> ${key}]`,
        );
        throw new CircularDependencyError(stack);
      }

      // 尝试从所有提供者解析
      let resolved: string | null = null;
      for (const provider of this.providers.values()) {
        try {
          resolved = await provider.resolve(key, context);
          if (resolved !== null) {
            // 如果解析成功，递归解析结果中可能包含的变量
            processingStack.add(key);
            resolved = await this.resolveRecursive(
              resolved,
              context,
              processingStack,
              depth + 1,
            );
            processingStack.delete(key);
            break; // 找到第一个能解析的提供者就停止
          }
        } catch (error) {
          // 如果是循环依赖错误，直接抛出
          if (error instanceof CircularDependencyError) {
            throw error;
          }
          logger.error(
            `[VariableEngine] Error resolving variable '${key}' with provider '${provider.name}':`,
            error,
          );
          // 其他错误继续尝试下一个提供者
        }
      }

      // 收集需要替换的占位符
      if (resolved !== null) {
        replacements.set(fullPlaceholder, resolved);
      } else {
        logger.debug(`[VariableEngine] Variable '${key}' not resolved, keeping original`);
      }
    }

    // 批量替换所有占位符（优化：减少字符串操作次数）
    for (const [placeholder, value] of replacements) {
      const regex = this.getOrCreateRegex(placeholder);
      processedContent = processedContent.replace(regex, value);
    }

    return processedContent;
  }

  /**
   * 单次解析（不递归）- 内部方法
   * 
   * @param content - 内容
   * @param context - 上下文
   * @returns 解析后的内容
   */
  private async resolveSinglePass(content: string, context: VariableContext | undefined): Promise<string> {
    let processedContent = content;
    const placeholders = this.extractPlaceholders(processedContent);
    
    // 优化：收集所有需要替换的占位符
    const replacements = new Map<string, string>();

    for (const placeholder of placeholders) {
      const key = placeholder.key;
      const fullPlaceholder = placeholder.full;

      let resolved: string | null = null;
      for (const provider of this.providers.values()) {
        try {
          resolved = await provider.resolve(key, context);
          if (resolved !== null) {
            break;
          }
        } catch (error) {
          logger.error(
            `[VariableEngine] Error resolving variable '${key}' with provider '${provider.name}':`,
            error,
          );
        }
      }

      if (resolved !== null) {
        replacements.set(fullPlaceholder, resolved);
      }
    }
    
    // 批量替换
    for (const [placeholder, value] of replacements) {
      const regex = this.getOrCreateRegex(placeholder);
      processedContent = processedContent.replace(regex, value);
    }

    return processedContent;
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 获取或创建缓存的正则表达式
   */
  private getOrCreateRegex(placeholder: string): RegExp {
    const cacheKey = placeholder;
    
    if (this.regexCache.has(cacheKey)) {
      return this.regexCache.get(cacheKey)!;
    }
    
    const regex = new RegExp(this.escapeRegex(placeholder), 'g');
    
    // 限制缓存大小，防止内存泄漏
    if (this.regexCache.size > 200) {
      // 清空缓存（简单策略，可以改为LRU）
      this.regexCache.clear();
      logger.debug('[VariableEngine] RegExp cache cleared (size limit reached)');
    }
    
    this.regexCache.set(cacheKey, regex);
    return regex;
  }

  /**
   * 提取占位符
   */
  private extractPlaceholders(content: string): Array<{ key: string; full: string }> {
    const placeholders: Array<{ key: string; full: string }> = [];
    // 使用缓存的正则表达式
    const regex = new RegExp(this.cachedPlaceholderRegex.source, 'g');
    
    let match;
    while ((match = regex.exec(content)) !== null) {
      placeholders.push({
        key: match[1],
        full: match[0],
      });
    }

    // 去重
    const seen = new Set<string>();
    return placeholders.filter(p => {
      if (seen.has(p.key)) {
        return false;
      }
      seen.add(p.key);
      return true;
    });
  }

  /**
   * 注册变量提供者
   */
  registerProvider(provider: IVariableProvider): void {
    if (this.providers.has(provider.name)) {
      logger.warn(`[VariableEngine] Provider '${provider.name}' already registered, replacing`);
    }
    this.providers.set(provider.name, provider);
    logger.info(`[VariableEngine] Provider '${provider.name}' registered`);
  }

  /**
   * 移除变量提供者
   */
  removeProvider(providerName: string): void {
    if (this.providers.delete(providerName)) {
      logger.info(`[VariableEngine] Provider '${providerName}' removed`);
    } else {
      logger.warn(`[VariableEngine] Provider '${providerName}' not found`);
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
    this.regexCache.clear();
    this.resultCache.clear();
    logger.debug('[VariableEngine] Engine reset');
  }

  /**
   * 获取缓存键
   */
  private getCacheKey(content: string, context?: VariableContext): string {
    const contextStr = context ? JSON.stringify(context) : '';
    return `${content}:${contextStr}`;
  }

  /**
   * 清空RegExp缓存
   */
  clearRegexCache(): void {
    this.regexCache.clear();
    logger.debug('[VariableEngine] RegExp cache cleared manually');
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { regexCacheSize: number; resultCacheSize: number; providerCount: number } {
    return {
      regexCacheSize: this.regexCache.size,
      resultCacheSize: this.resultCache.size,
      providerCount: this.providers.size,
    };
  }

  /**
   * 获取内部providers Map（用于兼容性访问）
   */
  get providersMap(): Map<string, IVariableProvider> {
    return this.providers;
  }
}

