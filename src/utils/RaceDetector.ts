/**
 * RaceDetector - 竞态条件检测器
 * 
 * 用于检测和监控系统中的竞态条件，提供实时监控和日志记录
 */

import { logger } from './logger';

export interface RaceDetectorConfig {
  enabled: boolean;
  monitorPaths?: string[]; // 监控的路径模式（可选）
  logLevel?: 'warn' | 'error' | 'debug'; // 日志级别
  threshold?: number; // 检测阈值（并发操作数）
}

export interface RaceConditionEvent {
  resourceId: string;
  operationId: string;
  activeOperations: string[];
  timestamp: number;
  duration?: number; // 操作持续时间（毫秒）
}

export interface RaceDetectorStats {
  totalDetections: number;
  resources: Map<string, number>; // 资源ID -> 检测次数
  operations: Map<string, number>; // 操作ID -> 检测次数
  lastDetection?: RaceConditionEvent;
}

/**
 * 竞态条件检测器
 * 跟踪活跃操作并检测并发访问
 */
export class RaceDetector {
  private static instance: RaceDetector;
  private activeOperations: Map<string, Set<string>> = new Map();
  private operationStartTimes: Map<string, number> = new Map(); // operationId -> startTime
  private config: RaceDetectorConfig;
  private stats: RaceDetectorStats = {
    totalDetections: 0,
    resources: new Map(),
    operations: new Map()
  };
  private listeners: Array<(event: RaceConditionEvent) => void> = [];

  private constructor(config: RaceDetectorConfig = { enabled: true }) {
    this.config = {
      enabled: config.enabled !== false,
      monitorPaths: config.monitorPaths || [],
      logLevel: config.logLevel || 'warn',
      threshold: config.threshold || 1 // 默认阈值为1，即任何并发操作都会被检测
    };
  }

  /**
   * 获取单例实例
   */
  public static getInstance(config?: RaceDetectorConfig): RaceDetector {
    if (!RaceDetector.instance) {
      RaceDetector.instance = new RaceDetector(config);
    }
    return RaceDetector.instance;
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<RaceDetectorConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }

  /**
   * 开始操作
   * @param resourceId 资源ID
   * @param operationId 操作ID
   */
  public startOperation(resourceId: string, operationId: string): void {
    if (!this.config.enabled) {
      return;
    }

    const startTime = Date.now();
    this.operationStartTimes.set(operationId, startTime);

    if (!this.activeOperations.has(resourceId)) {
      this.activeOperations.set(resourceId, new Set());
    }

    const operations = this.activeOperations.get(resourceId)!;

    // 检查并发操作
    if (operations.size > 0) {
      const activeOps = Array.from(operations);
      const event: RaceConditionEvent = {
        resourceId,
        operationId,
        activeOperations: activeOps,
        timestamp: startTime
      };

      // 更新统计信息
      this.stats.totalDetections++;
      this.stats.resources.set(resourceId, (this.stats.resources.get(resourceId) || 0) + 1);
      this.stats.operations.set(operationId, (this.stats.operations.get(operationId) || 0) + 1);
      this.stats.lastDetection = event;

      // 记录日志
      this.logRaceCondition(event);

      // 触发监听器
      this.listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error: any) {
          logger.error('❌ Race condition listener error:', error);
        }
      });
    }

    // 添加到活跃操作
    operations.add(operationId);
  }

  /**
   * 结束操作
   * @param resourceId 资源ID
   * @param operationId 操作ID
   */
  public endOperation(resourceId: string, operationId: string): void {
    if (!this.config.enabled) {
      return;
    }

    const operations = this.activeOperations.get(resourceId);
    if (operations) {
      operations.delete(operationId);

      // 清理操作开始时间
      const startTime = this.operationStartTimes.get(operationId);
      if (startTime) {
        const duration = Date.now() - startTime;
        this.operationStartTimes.delete(operationId);

        // 如果这是最后一个操作，记录持续时间
        if (operations.size === 0) {
          this.activeOperations.delete(resourceId);
        }

        // 如果存在最后检测事件且匹配，更新持续时间
        if (this.stats.lastDetection && this.stats.lastDetection.operationId === operationId) {
          this.stats.lastDetection.duration = duration;
        }
      }

      // 如果所有操作都完成，清理资源
      if (operations.size === 0) {
        this.activeOperations.delete(resourceId);
      }
    }
  }

  /**
   * 记录竞态条件
   */
  private logRaceCondition(event: RaceConditionEvent): void {
    const logData = {
      resourceId: event.resourceId,
      operationId: event.operationId,
      activeOperations: event.activeOperations,
      timestamp: new Date(event.timestamp).toISOString()
    };

    switch (this.config.logLevel) {
      case 'error':
        logger.error('🚨 Race condition detected', logData);
        break;
      case 'debug':
        logger.debug('🔍 Race condition detected', logData);
        break;
      case 'warn':
      default:
        logger.warn('⚠️ Race condition detected', logData);
        break;
    }
  }

  /**
   * 检查是否有活跃操作
   */
  public hasActiveOperations(resourceId: string): boolean {
    const operations = this.activeOperations.get(resourceId);
    return operations ? operations.size > 0 : false;
  }

  /**
   * 获取活跃操作列表
   */
  public getActiveOperations(resourceId: string): string[] {
    const operations = this.activeOperations.get(resourceId);
    return operations ? Array.from(operations) : [];
  }

  /**
   * 获取所有监控的资源
   */
  public getMonitoredResources(): string[] {
    return Array.from(this.activeOperations.keys());
  }

  /**
   * 获取统计信息
   */
  public getStats(): RaceDetectorStats {
    return {
      ...this.stats,
      resources: new Map(this.stats.resources),
      operations: new Map(this.stats.operations)
    };
  }

  /**
   * 重置统计信息
   */
  public resetStats(): void {
    this.stats = {
      totalDetections: 0,
      resources: new Map(),
      operations: new Map()
    };
  }

  /**
   * 添加事件监听器
   */
  public addListener(listener: (event: RaceConditionEvent) => void): void {
    this.listeners.push(listener);
  }

  /**
   * 移除事件监听器
   */
  public removeListener(listener: (event: RaceConditionEvent) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * 清除所有监听器
   */
  public clearListeners(): void {
    this.listeners = [];
  }

  /**
   * 使用操作包装器（自动跟踪操作）
   */
  public async withOperation<T>(
    resourceId: string,
    operationId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    this.startOperation(resourceId, operationId);
    try {
      const result = await operation();
      return result;
    } finally {
      this.endOperation(resourceId, operationId);
    }
  }

  /**
   * 使用操作包装器（同步版本）
   */
  public withOperationSync<T>(
    resourceId: string,
    operationId: string,
    operation: () => T
  ): T {
    this.startOperation(resourceId, operationId);
    try {
      const result = operation();
      return result;
    } finally {
      this.endOperation(resourceId, operationId);
    }
  }
}

/**
 * 创建操作ID（基于调用栈）
 */
export function createOperationId(prefix: string = 'op'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * 创建资源ID（基于资源类型和ID）
 */
export function createResourceId(type: string, id: string): string {
  return `${type}:${id}`;
}
