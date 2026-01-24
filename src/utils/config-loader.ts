/**
 * 配置加载器
 * 负责从文件系统读取和缓存配置
 */

import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as path from "path";
import { logger } from "./logger";
import type { AdminConfig } from "../types/config/index";
import { DEFAULT_CONFIG } from "./config-constants";
import { PathService } from "../services/PathService";

export class ConfigLoader {
  private static instance: ConfigLoader | null = null;
  private configCache: AdminConfig | null = null;
  private readonly configPath: string;

  private constructor() {
    const pathService = PathService.getInstance();
    this.configPath = pathService.getConfigFilePath();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  /**
   * 读取配置（同步）
   */
  public loadSync(): AdminConfig {
    if (this.configCache) {
      return this.configCache;
    }

    try {
      const configData = fs.readFileSync(this.configPath, "utf-8");
      const config = JSON.parse(configData) as AdminConfig;
      this.configCache = config;
      return config;
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err.code === "ENOENT") {
        logger.warn(`配置文件不存在: ${this.configPath}，创建默认配置`);
        this.writeSync(DEFAULT_CONFIG);
        return DEFAULT_CONFIG;
      }
      logger.error(`配置文件损坏: ${this.configPath}`, err.message);
      throw new Error(`Configuration load failed: ${err.message}`);
    }
  }

  /**
   * 读取配置（异步）
   */
  public async loadAsync(): Promise<AdminConfig> {
    if (this.configCache) {
      return this.configCache;
    }

    try {
      const configData = await fsPromises.readFile(this.configPath, "utf-8");
      const config = JSON.parse(configData) as AdminConfig;
      this.configCache = config;
      return config;
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err.code === "ENOENT") {
        logger.warn(`配置文件不存在: ${this.configPath}，创建默认配置`);
        await this.writeAsync(DEFAULT_CONFIG);
        return DEFAULT_CONFIG;
      }
      logger.error(`配置文件损坏: ${this.configPath}`, err.message);
      throw new Error(`Configuration load failed: ${err.message}`);
    }
  }

  /**
   * 写入配置（同步 - 原子写入）
   */
  public writeSync(config: AdminConfig): void {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const configData = JSON.stringify(config, null, 2);
      const tempPath = `${this.configPath}.tmp`;

      fs.writeFileSync(tempPath, configData, "utf-8");
      fs.renameSync(tempPath, this.configPath);

      this.configCache = config;
      logger.info(`配置已保存: ${this.configPath}`);
    } catch (error) {
      logger.error(`写入配置失败: ${this.configPath}`, error);
      // 清理可能的临时文件
      try {
        const tempPath = `${this.configPath}.tmp`;
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (error) {
        logger.warn(
          `[ConfigLoader] Failed to cleanup temp config file: ${this.configPath}.tmp`,
          error
        );
      }
      throw error;
    }
  }

  /**
   * 写入配置（异步 - 原子写入）
   */
  public async writeAsync(config: AdminConfig): Promise<void> {
    try {
      const configDir = path.dirname(this.configPath);
      await fsPromises.mkdir(configDir, { recursive: true });

      const configData = JSON.stringify(config, null, 2);
      const tempPath = `${this.configPath}.tmp`;

      await fsPromises.writeFile(tempPath, configData, "utf-8");
      await fsPromises.rename(tempPath, this.configPath);

      this.configCache = config;
      logger.info(`配置已保存: ${this.configPath}`);
    } catch (error) {
      logger.error(`写入配置失败: ${this.configPath}`, error);
      // 清理可能的临时文件
      try {
        const tempPath = `${this.configPath}.tmp`;
        await fsPromises.unlink(tempPath).catch((error) => {
          logger.warn(`Failed to cleanup temp config file: ${tempPath}`, error);
        });
      } catch (error) {
        logger.warn(`Failed to cleanup temp config file: ${this.configPath}.tmp`, error);
      }
      throw error;
    }
  }

  /**
   * 清除缓存
   */
  public clearCache(): void {
    this.configCache = null;
  }

  /**
   * 获取缓存的配置
   */
  public getCached(): AdminConfig | null {
    return this.configCache;
  }
}
