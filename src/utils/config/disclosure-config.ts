/**
 * Disclosure Configuration Loader
 *
 * Phase 2: 三层披露机制配置加载
 * 从 disclosure.yaml 加载披露配置，支持默认值回退
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { logger } from "../logger";
import { PathService } from "../../services/PathService";
import { DisclosureManagerConfigV2 } from "../../services/tool-retrieval/DisclosureManager";
import { DisclosureStrategy } from "../../types/enhanced-skill";

/**
 * 披露配置原始结构
 */
interface DisclosureConfigRaw {
  disclosure: {
    enabled: boolean;
    thresholds: { l2: number; l3: number };
    tokenBudget: {
      l1MaxTokens: number;
      l2MaxTokens: number;
      adaptiveMaxTokens: number;
    };
    cache: {
      enabled: boolean;
      maxSize: number;
      l1TtlMs: number;
      l2TtlMs: number;
      cleanupIntervalMs: number;
    };
    parallelLoad: { enabled: boolean; maxConcurrency: number };
    metrics: { enabled: boolean; sampleRate: number };
  };
}

/**
 * 披露配置加载器
 * 单例模式，带缓存
 */
export class DisclosureConfigLoader {
  private static instance: DisclosureConfigLoader | null = null;
  private configCache: DisclosureManagerConfigV2 | null = null;
  private readonly configPath: string;

  private constructor() {
    const pathService = PathService.getInstance();
    this.configPath = path.join(pathService.getConfigDir(), "disclosure.yaml");
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): DisclosureConfigLoader {
    if (!DisclosureConfigLoader.instance) {
      DisclosureConfigLoader.instance = new DisclosureConfigLoader();
    }
    return DisclosureConfigLoader.instance;
  }

  /**
   * 加载配置（同步）
   */
  public loadSync(): DisclosureManagerConfigV2 {
    if (this.configCache) {
      return this.configCache;
    }

    try {
      if (!fs.existsSync(this.configPath)) {
        logger.info("[DisclosureConfigLoader] Config file not found, using defaults");
        this.configCache = this.getDefaultConfig();
        return this.configCache;
      }

      const content = fs.readFileSync(this.configPath, "utf-8");
      const raw = yaml.load(content) as DisclosureConfigRaw;

      this.configCache = this.parseConfig(raw);
      return this.configCache;
    } catch (error) {
      logger.error("[DisclosureConfigLoader] Failed to load config, using defaults", error);
      this.configCache = this.getDefaultConfig();
      return this.configCache;
    }
  }

  /**
   * 加载配置（异步）
   */
  public async loadAsync(): Promise<DisclosureManagerConfigV2> {
    if (this.configCache) {
      return this.configCache;
    }

    try {
      if (!fs.existsSync(this.configPath)) {
        logger.info("[DisclosureConfigLoader] Config file not found, using defaults");
        this.configCache = this.getDefaultConfig();
        return this.configCache;
      }

      const content = await fs.promises.readFile(this.configPath, "utf-8");
      const raw = yaml.load(content) as DisclosureConfigRaw;

      this.configCache = this.parseConfig(raw);
      return this.configCache;
    } catch (error) {
      logger.error("[DisclosureConfigLoader] Failed to load config, using defaults", error);
      this.configCache = this.getDefaultConfig();
      return this.configCache;
    }
  }

  /**
   * 清除缓存
   */
  public clearCache(): void {
    this.configCache = null;
  }

  /**
   * 获取配置文件路径
   */
  public getConfigPath(): string {
    return this.configPath;
  }

  /**
   * 解析配置
   */
  private parseConfig(raw: DisclosureConfigRaw): DisclosureManagerConfigV2 {
    const disclosure = raw.disclosure;

    return {
      enabled: disclosure.enabled ?? true,
      strategy: DisclosureStrategy.METADATA,
      adaptiveMaxTokens: disclosure.tokenBudget?.adaptiveMaxTokens ?? 3000,
      preferMetadataBelow: 500,
      thresholds: {
        l2: disclosure.thresholds?.l2 ?? 0.7,
        l3: disclosure.thresholds?.l3 ?? 0.85,
      },
      l1MaxTokens: disclosure.tokenBudget?.l1MaxTokens ?? 120,
      l2MaxTokens: disclosure.tokenBudget?.l2MaxTokens ?? 5000,
      cache: {
        enabled: disclosure.cache?.enabled ?? true,
        maxSize: disclosure.cache?.maxSize ?? 2000,
        l1TtlMs: disclosure.cache?.l1TtlMs ?? 300000,
        l2TtlMs: disclosure.cache?.l2TtlMs ?? 300000,
        cleanupIntervalMs: disclosure.cache?.cleanupIntervalMs ?? 300000,
      },
      parallelLoad: {
        enabled: disclosure.parallelLoad?.enabled ?? true,
        maxConcurrency: disclosure.parallelLoad?.maxConcurrency ?? 8,
      },
      metrics: {
        enabled: disclosure.metrics?.enabled ?? true,
        sampleRate: disclosure.metrics?.sampleRate ?? 1.0,
      },
    };
  }

  /**
   * 获取默认配置
   */
  private getDefaultConfig(): DisclosureManagerConfigV2 {
    return {
      enabled: true,
      strategy: DisclosureStrategy.METADATA,
      adaptiveMaxTokens: 3000,
      preferMetadataBelow: 500,
      thresholds: { l2: 0.7, l3: 0.85 },
      l1MaxTokens: 120,
      l2MaxTokens: 5000,
      cache: {
        enabled: true,
        maxSize: 2000,
        l1TtlMs: 300000,
        l2TtlMs: 300000,
        cleanupIntervalMs: 300000,
      },
      parallelLoad: { enabled: true, maxConcurrency: 8 },
      metrics: { enabled: true, sampleRate: 1.0 },
    };
  }
}

/**
 * 获取披露配置（便捷函数）
 */
export function getDisclosureConfig(): DisclosureManagerConfigV2 {
  return DisclosureConfigLoader.getInstance().loadSync();
}

/**
 * 异步获取披露配置（便捷函数）
 */
export async function getDisclosureConfigAsync(): Promise<DisclosureManagerConfigV2> {
  return DisclosureConfigLoader.getInstance().loadAsync();
}
