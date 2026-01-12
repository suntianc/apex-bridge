/**
 * Variable Engine Types - Unified Version
 *
 * 统一版的变量引擎类型定义
 */

import type { Message } from "./index";

/**
 * 变量上下文信息（简化版，现为可选）
 * @deprecated 简化版中不再使用，保留用于向后兼容
 */
export interface VariableContext {
  userId?: string;
  personaId?: string;
  sessionId?: string;
  messageId?: string;
  [key: string]: any;
}

/**
 * 变量引擎接口（统一版）
 */
export interface IVariableEngine {
  /** 解析内容中的所有变量 */
  resolveAll(
    content: string,
    variables?: Record<string, string>,
    options?: { fillEmptyOnMissing?: boolean }
  ): Promise<string>;

  /** 批量解析消息中的变量（带缓存） */
  resolveMessages?(messages: Message[], variables?: Record<string, string>): Promise<Message[]>;

  /** 解析单个变量（可选实现） */
  resolveSingle?(
    content: string,
    key: string,
    variables?: Record<string, string>
  ): Promise<string | null>;

  /** 重置引擎（清理缓存） */
  reset(): void;

  /** 清理缓存 */
  clearCache?(): void;

  /** 获取缓存统计信息 */
  getCacheStats?(): { size: number; ttlMs: number; enabled: boolean };
}

/**
 * 变量引擎配置选项（简化版）
 */
export interface VariableEngineOptions {
  /** 是否启用递归解析（变量值中可能包含其他变量） */
  enableRecursion?: boolean;

  /** 最大递归深度 */
  maxRecursionDepth?: number;

  /** 占位符正则表达式模式 */
  placeholderPattern?: RegExp;
}

/**
 * @deprecated 提供者模式已移除，此接口不再使用
 */
export interface IVariableProvider {
  name: string;
  resolve(key: string, context?: VariableContext): Promise<string | null>;
  getSupportedKeys(): string[];
  getDescription?(): string;
}

/**
 * @deprecated 循环依赖检测已移除，此类不再使用
 */
export class CircularDependencyError extends Error {
  constructor(public readonly path: string[]) {
    super(`Circular dependency detected: ${path.join(" -> ")}`);
    this.name = "CircularDependencyError";
  }
}
