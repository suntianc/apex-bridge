/**
 * ProactivityConfigService - 主动性调度配置管理服务
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ProactivitySchedulerConfig } from '../types/proactivity';
import { PathService } from './PathService';
import { logger } from '../utils/logger';

export class ProactivityConfigService {
  private static instance: ProactivityConfigService;
  private configPath: string;
  private config: ProactivitySchedulerConfig | null = null;

  private constructor() {
    const pathService = PathService.getInstance();
    this.configPath = path.join(pathService.getConfigDir(), 'proactivity.json');
  }

  static getInstance(): ProactivityConfigService {
    if (!ProactivityConfigService.instance) {
      ProactivityConfigService.instance = new ProactivityConfigService();
    }
    return ProactivityConfigService.instance;
  }

  /**
   * 加载配置
   */
  async loadConfig(): Promise<ProactivitySchedulerConfig> {
    try {
      // 确保目录存在
      const dir = path.dirname(this.configPath);
      await fs.mkdir(dir, { recursive: true });

      // 尝试读取配置文件
      const data = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(data);
      logger.info('✅ Proactivity config loaded');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // 文件不存在，使用默认配置
        logger.info('ℹ️ Proactivity config not found, using defaults');
        this.config = this.getDefaultConfig();
        await this.saveConfig();
      } else {
        logger.error('❌ Failed to load proactivity config:', error);
        this.config = this.getDefaultConfig();
      }
    }

    return this.config!;
  }

  /**
   * 保存配置
   */
  async saveConfig(): Promise<void> {
    try {
      if (!this.config) {
        this.config = this.getDefaultConfig();
      }

      // 确保目录存在
      const dir = path.dirname(this.configPath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
      logger.info('✅ Proactivity config saved');
    } catch (error: any) {
      logger.error('❌ Failed to save proactivity config:', error);
      throw error;
    }
  }

  /**
   * 获取默认配置
   */
  getDefaultConfig(): ProactivitySchedulerConfig {
    return {
      enabled: true,
      timezone: 'Asia/Taipei',
      quietWindow: {
        start: '22:00',
        end: '08:00'
      },
      workdayHours: {
        start: '09:00',
        end: '20:00'
      },
      maxDailyMessages: 1,
      actionThreshold: 0.62, // Phase 2标准阈值
      debounceMs: 30 * 60 * 1000 // 30分钟
    };
  }

  /**
   * 获取当前配置
   */
  getConfig(): ProactivitySchedulerConfig | null {
    return this.config;
  }

  /**
   * 更新配置
   */
  async updateConfig(updates: Partial<ProactivitySchedulerConfig>): Promise<void> {
    if (!this.config) {
      await this.loadConfig();
    }

    this.config = {
      ...this.config!,
      ...updates
    };

    await this.saveConfig();
  }

  /**
   * 获取配置路径
   */
  getConfigPath(): string {
    return this.configPath;
  }
}

