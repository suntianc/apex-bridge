/**
 * 配置写入器
 * 负责配置的更新和合并
 */

import type { AdminConfig } from '../types/config/index';
import { ConfigLoader } from './config-loader';

export class ConfigWriter {
  private readonly loader: ConfigLoader;

  constructor() {
    this.loader = ConfigLoader.getInstance();
  }

  /**
   * 更新配置（异步）
   */
  public async updateAsync(updates: Partial<AdminConfig>): Promise<AdminConfig> {
    const currentConfig = await this.loader.loadAsync();
    const updatedConfig = this.mergeConfig(currentConfig, updates);
    await this.loader.writeAsync(updatedConfig);
    return updatedConfig;
  }

  /**
   * 更新配置（同步）
   */
  public update(updates: Partial<AdminConfig>): AdminConfig {
    const currentConfig = this.loader.loadSync();
    const updatedConfig = this.mergeConfig(currentConfig, updates);
    this.loader.writeSync(updatedConfig);
    return updatedConfig;
  }

  /**
   * 重载配置
   */
  public reload(): AdminConfig {
    this.loader.clearCache();
    return this.loader.loadSync();
  }

  /**
   * 递归合并配置对象
   */
  private mergeConfig(base: AdminConfig, updates: Partial<AdminConfig>): AdminConfig {
    const result: AdminConfig = { ...base };

    for (const key of Object.keys(updates)) {
      const updateValue = updates[key as keyof Partial<AdminConfig>];
      const baseValue = base[key as keyof AdminConfig];

      // 如果更新值和基础值都是对象（非数组），进行递归合并
      if (
        updateValue !== undefined &&
        updateValue !== null &&
        typeof updateValue === 'object' &&
        !Array.isArray(updateValue) &&
        baseValue !== undefined &&
        baseValue !== null &&
        typeof baseValue === 'object' &&
        !Array.isArray(baseValue)
      ) {
        result[key as keyof AdminConfig] = this.mergeConfig(
          baseValue as AdminConfig,
          updateValue as Partial<AdminConfig>
        ) as AdminConfig[keyof AdminConfig];
      } else if (updateValue !== undefined) {
        result[key as keyof AdminConfig] = updateValue as AdminConfig[keyof AdminConfig];
      }
    }

    return result;
  }
}
