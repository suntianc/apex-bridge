/**
 * Variable Engine Types
 * 
 * 变量引擎相关的类型定义
 * 独立于vcp-intellicore-sdk的实现
 */

/**
 * 变量上下文信息
 */
export interface VariableContext {
  userId?: string;
  personaId?: string;
  sessionId?: string;
  messageId?: string;
  [key: string]: any;
}

/**
 * 变量提供者接口
 */
export interface IVariableProvider {
  /** 提供者名称 */
  name: string;
  
  /** 解析变量值 */
  resolve(key: string, context?: VariableContext): Promise<string | null>;
  
  /** 获取支持的变量键列表 */
  getSupportedKeys(): string[];
  
  /** 可选：获取提供者描述 */
  getDescription?(): string;
}

/**
 * 变量引擎接口
 */
export interface IVariableEngine {
  /** 解析内容中的所有变量 */
  resolveAll(content: string, context?: VariableContext): Promise<string>;
  
  /** 解析单个变量（可选实现） */
  resolveSingle?(content: string, key: string, context?: VariableContext): Promise<string | null>;
  
  /** 注册变量提供者 */
  registerProvider(provider: IVariableProvider): void;
  
  /** 移除变量提供者 */
  removeProvider(providerName: string): void;
  
  /** 获取所有已注册的提供者 */
  getProviders(): IVariableProvider[];
  
  /** 获取特定提供者 */
  getProvider?(providerName: string): IVariableProvider | undefined;
  
  /** 重置引擎（清除缓存等） */
  reset(): void;
}

/**
 * 变量引擎配置选项
 */
export interface VariableEngineOptions {
  /** 是否启用递归解析（变量值中可能包含其他变量） */
  enableRecursion?: boolean;
  
  /** 最大递归深度 */
  maxRecursionDepth?: number;
  
  /** 是否检测循环依赖 */
  detectCircular?: boolean;
  
  /** 占位符正则表达式模式 */
  placeholderPattern?: RegExp;
  
  /** 是否启用缓存 */
  enableCache?: boolean;
  
  /** 缓存TTL（毫秒） */
  cacheTTL?: number;
}

/**
 * 循环依赖错误
 */
export class CircularDependencyError extends Error {
  constructor(public readonly path: string[]) {
    super(`Circular dependency detected: ${path.join(' -> ')}`);
    this.name = 'CircularDependencyError';
  }
}

