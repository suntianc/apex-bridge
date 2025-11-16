/**
 * PolicyGuard - 政策守门
 * 负责频次限制、场景开关、时段检查
 */

import { PolicyGuardConfig } from '../types/proactivity';
import { logger } from '../utils/logger';

export class PolicyGuard {
  private config: Required<PolicyGuardConfig>;
  private dailyMessageCount: Map<string, number> = new Map();
  private lastResetDate: string = '';

  constructor(config?: PolicyGuardConfig) {
    this.config = {
      maxDailyMessages: config?.maxDailyMessages ?? 1,
      enabled: config?.enabled ?? true,
      scenes: config?.scenes ?? {}
    };

    // 初始化重置日期
    this.lastResetDate = new Date().toDateString();

    logger.debug('✅ PolicyGuard initialized', {
      maxDailyMessages: this.config.maxDailyMessages,
      enabled: this.config.enabled
    });
  }

  /**
   * 检查是否可以发送消息（频次限制）
   */
  canSendMessage(userId: string = 'default'): boolean {
    if (!this.config.enabled) {
      logger.debug('⏸️ PolicyGuard is disabled');
      return false;
    }

    // 检查日期是否变更，如果变更则重置计数
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      this.dailyMessageCount.clear();
      this.lastResetDate = today;
      logger.debug('🔄 Daily message count reset (new day)');
    }

    const key = userId;
    const count = this.dailyMessageCount.get(key) || 0;

    if (count >= this.config.maxDailyMessages) {
      logger.debug(`⏸️ Daily message limit reached for user ${userId}: ${count}/${this.config.maxDailyMessages}`);
      return false;
    }

    // 增加计数
    this.dailyMessageCount.set(key, count + 1);
    logger.debug(`✅ Message allowed for user ${userId}: ${count + 1}/${this.config.maxDailyMessages}`);
    return true;
  }

  /**
   * 检查场景是否启用
   */
  isEnabled(sceneId: string): boolean {
    if (!this.config.enabled) {
      return false;
    }

    // 如果场景配置中没有指定，默认启用
    const sceneConfig = this.config.scenes[sceneId];
    return sceneConfig?.enabled ?? true;
  }

  /**
   * 启用场景
   */
  enableScene(sceneId: string): void {
    if (!this.config.scenes[sceneId]) {
      this.config.scenes[sceneId] = { enabled: true };
    } else {
      this.config.scenes[sceneId].enabled = true;
    }
    logger.info(`✅ Scene enabled: ${sceneId}`);
  }

  /**
   * 禁用场景
   */
  disableScene(sceneId: string): void {
    if (!this.config.scenes[sceneId]) {
      this.config.scenes[sceneId] = { enabled: false };
    } else {
      this.config.scenes[sceneId].enabled = false;
    }
    logger.info(`⏸️ Scene disabled: ${sceneId}`);
  }

  /**
   * 获取今日消息计数
   */
  getDailyMessageCount(userId: string = 'default'): number {
    return this.dailyMessageCount.get(userId) || 0;
  }

  /**
   * 重置消息计数（用于测试或手动重置）
   */
  resetDailyMessageCount(userId?: string): void {
    if (userId) {
      this.dailyMessageCount.delete(userId);
    } else {
      this.dailyMessageCount.clear();
    }
    logger.debug('🔄 Daily message count reset');
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<PolicyGuardConfig>): void {
    if (config.maxDailyMessages !== undefined) {
      this.config.maxDailyMessages = config.maxDailyMessages;
    }
    if (config.enabled !== undefined) {
      this.config.enabled = config.enabled;
    }
    if (config.scenes) {
      this.config.scenes = { ...this.config.scenes, ...config.scenes };
    }
    logger.info('✅ PolicyGuard config updated');
  }

  /**
   * 获取当前配置
   */
  getConfig(): PolicyGuardConfig {
    return { ...this.config };
  }
}

