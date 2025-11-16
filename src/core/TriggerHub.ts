/**
 * TriggerHub - 触发枢纽
 * 负责触发去重、防抖、静音窗检查、工作日检查
 */

import { TriggerHubConfig } from '../types/proactivity';
import { logger } from '../utils/logger';

export class TriggerHub {
  private config: Required<TriggerHubConfig>;
  private lastTriggerTime: Map<string, number> = new Map();

  constructor(config?: TriggerHubConfig) {
    this.config = {
      debounceMs: config?.debounceMs ?? 30 * 60 * 1000, // 默认30分钟
      timezone: config?.timezone ?? 'Asia/Taipei',
      quietWindow: {
        start: config?.quietWindow?.start ?? '22:00',
        end: config?.quietWindow?.end ?? '08:00'
      }
    };

    logger.debug('✅ TriggerHub initialized', {
      debounceMs: this.config.debounceMs,
      timezone: this.config.timezone,
      quietWindow: this.config.quietWindow
    });
  }

  /**
   * 检查是否应该触发（去重和防抖）
   */
  shouldTrigger(triggerId: string): boolean {
    const now = Date.now();
    const lastTime = this.lastTriggerTime.get(triggerId) || 0;
    const elapsed = now - lastTime;

    if (elapsed < this.config.debounceMs) {
      logger.debug(`⏸️ Trigger debounced: ${triggerId} (${Math.round(elapsed / 1000)}s ago)`);
      return false;
    }

    // 更新最后触发时间
    this.lastTriggerTime.set(triggerId, now);
    return true;
  }

  /**
   * 检查是否在静音窗内
   */
  isInQuietWindow(): boolean {
    const now = this.getTaipeiTime();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const currentTime = hour * 60 + minute;

    // 解析静音窗时间
    const [startHour, startMinute] = this.config.quietWindow.start.split(':').map(Number);
    const [endHour, endMinute] = this.config.quietWindow.end.split(':').map(Number);
    const startTime = startHour * 60 + startMinute;
    const endTime = endHour * 60 + endMinute;

    // 处理跨天的情况（22:00-08:00）
    if (startTime > endTime) {
      // 跨天：22:00-24:00 或 00:00-08:00
      return currentTime >= startTime || currentTime < endTime;
    } else {
      // 同一天内
      return currentTime >= startTime && currentTime < endTime;
    }
  }

  /**
   * 检查是否为工作日（周一到周五）
   */
  isWorkday(): boolean {
    const day = this.getTaipeiTime().getDay();
    return day >= 1 && day <= 5; // 周一到周五
  }

  /**
   * 检查是否在触达窗内（工作日 09:00-20:00）
   */
  isInDeliveryWindow(): boolean {
    if (!this.isWorkday()) {
      return false;
    }

    if (this.isInQuietWindow()) {
      return false;
    }

    const now = this.getTaipeiTime();
    const hour = now.getHours();
    return hour >= 9 && hour < 20;
  }

  /**
   * 获取台北时间（UTC+8）
   * 注意：这是一个简化的实现，实际应该使用时区库如date-fns-tz
   * 但对于Asia/Taipei（固定UTC+8），可以直接计算
   */
  private getTaipeiTime(): Date {
    const now = new Date();
    // Asia/Taipei是UTC+8，所以需要加上8小时
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
    const taipeiTime = new Date(utcTime + (8 * 60 * 60 * 1000));
    return taipeiTime;
  }

  /**
   * 清除触发记录（用于测试或重置）
   */
  clearTriggerHistory(triggerId?: string): void {
    if (triggerId) {
      this.lastTriggerTime.delete(triggerId);
    } else {
      this.lastTriggerTime.clear();
    }
  }

  /**
   * 获取最后触发时间
   */
  getLastTriggerTime(triggerId: string): number | undefined {
    return this.lastTriggerTime.get(triggerId);
  }
}

