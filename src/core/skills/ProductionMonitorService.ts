import {
  ProductionMonitor,
  SkillsExecutionManager,
  SkillsLoader,
  MemoryManager
} from './index';
import logger from '../../utils/logger';
import type { AlertConfig } from './ProductionMonitor';

/**
 * 生产环境监控服务
 * 
 * 封装监控系统的初始化和生命周期管理
 */
export class ProductionMonitorService {
  private monitor: ProductionMonitor | null = null;
  private isInitialized = false;

  /**
   * 初始化监控服务
   */
  initialize(
    executionManager: SkillsExecutionManager,
    skillsLoader: SkillsLoader,
    memoryManager: MemoryManager,
    config?: Partial<AlertConfig>
  ): void {
    if (this.isInitialized) {
      logger.warn('[ProductionMonitorService] 监控服务已初始化');
      return;
    }

    this.monitor = new ProductionMonitor(
      executionManager,
      skillsLoader,
      memoryManager,
      config
    );

    this.isInitialized = true;
    logger.info('[ProductionMonitorService] 监控服务已初始化');
  }

  /**
   * 启动监控
   */
  start(interval: number = 30 * 1000): void {
    if (!this.monitor) {
      throw new Error('监控服务未初始化，请先调用 initialize()');
    }

    this.monitor.start(interval);
    logger.info(`[ProductionMonitorService] 监控已启动，采集间隔: ${interval}ms`);
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (this.monitor) {
      this.monitor.stop();
      logger.info('[ProductionMonitorService] 监控已停止');
    }
  }

  /**
   * 获取监控实例
   */
  getMonitor(): ProductionMonitor {
    if (!this.monitor) {
      throw new Error('监控服务未初始化');
    }
    return this.monitor;
  }

  /**
   * 检查是否已初始化
   */
  isReady(): boolean {
    return this.isInitialized && this.monitor !== null;
  }
}

// 单例实例
let instance: ProductionMonitorService | null = null;

/**
 * 获取监控服务单例
 */
export function getProductionMonitorService(): ProductionMonitorService {
  if (!instance) {
    instance = new ProductionMonitorService();
  }
  return instance;
}

