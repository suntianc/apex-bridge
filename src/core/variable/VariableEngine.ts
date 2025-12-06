/**
 * Variable Engine Implementation - Simplified Version
 * 
 * 简化版的变量引擎实现
 * 职责：对固定格式{{placeholder}}进行简单的变量替换
 * 特点：无提供者模式、无缓存、无状态、直接替换
 */

import { logger } from '../../utils/logger';

/**
 * 变量引擎实现 - 简化版
 */
export class VariableEngine {
  private options: {
    enableRecursion: boolean;
    maxRecursionDepth: number;
    placeholderPattern: RegExp;
  };

  constructor() {
    // 简化配置，只保留必要的递归控制
    this.options = {
      enableRecursion: true,
      maxRecursionDepth: 10,
      placeholderPattern: /\{\{([^}]+)\}\}/g,
    };
  }

  /**
   * 解析内容中的所有变量占位符
   *
   * @param content - 要解析的内容
   * @param variables - 变量键值对映射
   * @param options - 解析选项
   * @returns 解析后的内容
   */
  async resolveAll(content: string, variables: Record<string, string> = {}, options?: { fillEmptyOnMissing?: boolean }): Promise<string> {
    if (!content || typeof content !== 'string') {
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
    let previousResult = '';

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
  private async resolveOnce(content: string, variables: Record<string, string>, fillEmptyOnMissing: boolean = false): Promise<string> {
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
        const resolvedValue = await this.resolveVariable(variableKey, variables);
        
        if (resolvedValue !== null) {
          // 使用正则全局替换，并使用回调函数防止 '$' 字符解析错误
          // 转义变量键中的特殊字符，构建精确的正则模式
          const keyPattern = new RegExp(
            `\\{\\{\\s*${this.escapeRegex(variableKey)}\\s*\\}\\}`,
            'g'
          );
          
          // 使用回调函数确保替换值被视为纯文本，不会被解析为特殊替换模式
          result = result.replace(keyPattern, () => resolvedValue);
        } else {
          // 如果无法解析
          if (fillEmptyOnMissing) {
            // 自动填充为空字符串
            const keyPattern = new RegExp(
              `\\{\\{\\s*${this.escapeRegex(variableKey)}\\s*\\}\\}`,
              'g'
            );
            result = result.replace(keyPattern, '');
            logger.debug(`[VariableEngine] Variable "${variableKey}" not found, filled with empty string`);
          } else {
            // 保留原始占位符
            logger.debug(`[VariableEngine] Variable "${variableKey}" not resolved, keeping original placeholder`);
          }
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
   * @param content - 要解析的内容
   * @param key - 要解析的变量键
   * @param variables - 变量键值对映射
   * @returns 解析后的值，如果未找到则返回 null
   */
  async resolveSingle(content: string, key: string, variables: Record<string, string> = {}): Promise<string | null> {
    // 检查内容中是否包含该变量
    const pattern = this.options.placeholderPattern;
    const variablePattern = new RegExp(`\\{\\{${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
    
    if (!variablePattern.test(content)) {
      return null;
    }
    
    return this.resolveVariable(key, variables);
  }

  /**
   * 解析变量值（内部方法）
   */
  private async resolveVariable(key: string, variables: Record<string, string>): Promise<string | null> {
    // 直接从variables映射中查找
    if (key in variables) {
      const value = variables[key];
      logger.debug(`[VariableEngine] Variable "${key}" resolved with value: ${value}`);
      return String(value);
    }

    // 变量未找到
    return null;
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 检测文本中是否包含未替换的占位符
   *
   * @param text - 要检测的文本
   * @returns true如果包含占位符，否则false
   */
  hasPlaceholders(text: string): boolean {
    if (!text || typeof text !== 'string') {
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
    if (!text || typeof text !== 'string') {
      return [];
    }
    
    const pattern = new RegExp(this.options.placeholderPattern.source, 'g');
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
    logger.debug('[VariableEngine] Engine reset (no-op in simplified version)');
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
}
