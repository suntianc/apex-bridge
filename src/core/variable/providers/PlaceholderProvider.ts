/**
 * Placeholder Variable Provider
 * 
 * 提供静态占位符管理
 * 独立于vcp-intellicore-sdk的实现
 */

import { IVariableProvider, VariableContext } from '../../../types/variable';
import { logger } from '../../../utils/logger';

/**
 * 占位符提供者
 * 
 * 允许动态注册和管理静态占位符
 * 用于插件系统提供的静态内容
 */
export class PlaceholderProvider implements IVariableProvider {
  readonly name = 'PlaceholderProvider';

  private placeholders: Map<string, string>;
  
  constructor() {
    this.placeholders = new Map();
  }

  async resolve(key: string, context?: VariableContext): Promise<string | null> {
    // 先从本地Map查找
    if (this.placeholders.has(key)) {
      return this.placeholders.get(key) || null;
    }

    return null;
  }

  getSupportedKeys(): string[] {
    return Array.from(this.placeholders.keys());
  }

  /**
   * 设置占位符值
   */
  setPlaceholder(key: string, value: string): void {
    this.placeholders.set(key, value);
    logger.debug(`[PlaceholderProvider] Set placeholder: ${key}`);
  }

  /**
   * 批量设置占位符
   */
  setPlaceholders(placeholders: Map<string, string> | Record<string, string>): void {
    if (placeholders instanceof Map) {
      placeholders.forEach((value, key) => {
        this.placeholders.set(key, value);
      });
    } else {
      Object.entries(placeholders).forEach(([key, value]) => {
        this.placeholders.set(key, value);
      });
    }
    logger.info(`[PlaceholderProvider] Set ${this.placeholders.size} placeholders`);
  }

  /**
   * 获取占位符值
   */
  getPlaceholder(key: string): string | undefined {
    return this.placeholders.get(key);
  }

  /**
   * 删除占位符
   */
  deletePlaceholder(key: string): boolean {
    return this.placeholders.delete(key);
  }

  /**
   * 清空所有占位符
   */
  clearPlaceholders(): void {
    this.placeholders.clear();
    logger.info('[PlaceholderProvider] All placeholders cleared');
  }

  /**
   * 获取所有占位符
   */
  getAllPlaceholders(): Map<string, string> {
    return new Map(this.placeholders);
  }
}

