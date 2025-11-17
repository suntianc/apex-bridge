/**
 * ABP Variable Engine Adapter
 * 
 * ABP协议变量引擎适配器（独立变量引擎）
 * 
 * @module core/protocol
 */

import { IVariableEngine, IVariableProvider } from '../../types/variable';
import { logger } from '../../utils/logger';
import { ABPProtocolConfig } from '../../types/abp';

/**
 * ABP变量引擎适配器
 * 
 * 封装通用 VariableEngine，提供 ABP 协议接口
 */
export class ABPVariableEngine {
  private variableEngine: IVariableEngine;
  private config: ABPProtocolConfig['variable'];
  private cache: Map<string, { value: string; timestamp: number }> = new Map();

  constructor(variableEngine: IVariableEngine, config?: ABPProtocolConfig['variable']) {
    this.variableEngine = variableEngine;
    this.config = config || {
      cacheEnabled: true,
      cacheTTL: 60000, // 1分钟
    };
  }

  /**
   * 解析内容中的所有变量
   * 
   * 复用通用变量解析逻辑
   * 
   * @param content - 包含变量占位符的内容
   * @param context - 上下文信息
   * @returns 解析后的内容
   */
  async resolveAll(content: string, context?: any): Promise<string> {
    // 不再进行normalizePlaceholders转换，直接使用原内容
    // VariableEngine 现在直接支持 Var: 和 Tar: 格式
    const originalContent = content ?? '';

    // 如果启用缓存，先检查缓存
    if (this.config?.cacheEnabled) {
      const cacheKey = this.getCacheKey(originalContent, context);
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < (this.config.cacheTTL || 60000)) {
        logger.debug('[ABPVariableEngine] Using cached result');
        return cached.value;
      }
    }

    // 调用VariableEngine解析变量（使用独立实现）
    const resolved = await this.variableEngine.resolveAll(originalContent, context);

    // 如果启用缓存，保存结果
    if (this.config?.cacheEnabled) {
      const cacheKey = this.getCacheKey(originalContent, context);
      this.cache.set(cacheKey, {
        value: resolved,
        timestamp: Date.now(),
      });
    }

    return resolved;
  }

  /**
   * 注册变量提供者
   * 
   * 直接委托给底层 VariableEngine
   * 
   * @param provider - 变量提供者
   */
  registerProvider(provider: IVariableProvider): void {
    this.variableEngine.registerProvider(provider);
    logger.debug(`[ABPVariableEngine] Provider '${provider.name}' registered`);
  }

  /**
   * 移除变量提供者
   * 
   * 直接委托给底层 VariableEngine
   * 
   * @param providerName - 提供者名称
   */
  removeProvider(providerName: string): void {
    this.variableEngine.removeProvider(providerName);
    logger.debug(`[ABPVariableEngine] Provider '${providerName}' removed`);
  }

  /**
   * 获取所有已注册的提供者
   * 
   * 直接委托给底层 VariableEngine
   * 
   * @returns 提供者列表
   */
  getProviders(): IVariableProvider[] {
    return this.variableEngine.getProviders();
  }

  /**
   * 获取底层VariableEngine
   * 
   * 用于直接访问VariableEngine的功能
   * 
   * @returns VariableEngine实例
   */
  getVariableEngine(): IVariableEngine {
    return this.variableEngine;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('[ABPVariableEngine] Cache cleared');
  }

  /**
   * 获取缓存键
   */
  private getCacheKey(content: string, context?: any): string {
    const contextStr = context ? JSON.stringify(context) : '';
    return `${content}:${contextStr}`;
  }

  /**
   * 规范化占位符（已移除转换逻辑）
   * 
   * 注意：现在使用独立的VariableEngine，它直接支持 {{Var:KEY}} 和 {{Tar:KEY}} 格式
   * 不再需要转换为 {{env:KEY}} 格式
   * EnvironmentProvider 现在直接支持 Var: 和 Tar: 前缀
   */
  private normalizePlaceholders(content: string): string {
    // 不再进行转换，直接返回原内容
    // VariableEngine 现在直接支持 Var: 和 Tar: 格式
    return content ?? '';
  }
}

