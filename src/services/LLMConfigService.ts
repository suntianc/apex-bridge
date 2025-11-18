/**
 * LLMConfigService - LLM配置管理服务
 * 负责LLM厂商配置的SQLite数据库存储和管理
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import { logger } from '../utils/logger';
import { PathService } from './PathService';
import { LLMProviderConfig } from '../types';

/**
 * LLM厂商配置记录
 */
export interface LLMProviderRecord {
  id: number;
  provider: string;
  name: string;
  config: LLMProviderConfig;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * 创建厂商配置的输入
 */
export interface CreateLLMProviderInput {
  provider: string;
  name: string;
  config: LLMProviderConfig;
  enabled?: boolean;
}

/**
 * 更新厂商配置的输入
 */
export interface UpdateLLMProviderInput {
  name?: string;
  config?: LLMProviderConfig;
  enabled?: boolean;
}

/**
 * LLM配置服务
 */
export class LLMConfigService {
  private static instance: LLMConfigService;
  private db: Database.Database;
  private dbPath: string;

  private constructor() {
    const pathService = PathService.getInstance();
    const dataDir = pathService.getDataDir();
    
    // 确保数据目录存在
    const fs = require('fs');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = path.join(dataDir, 'llm_providers.db');
    this.db = new Database(this.dbPath);
    
    // 启用WAL模式提升性能
    this.db.pragma('journal_mode = WAL');
    
    this.initializeDatabase();
    logger.info(`✅ LLMConfigService initialized (database: ${this.dbPath})`);
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): LLMConfigService {
    if (!LLMConfigService.instance) {
      LLMConfigService.instance = new LLMConfigService();
    }
    return LLMConfigService.instance;
  }

  /**
   * 初始化数据库表结构
   */
  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS llm_providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        config_json TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_provider ON llm_providers(provider);
      CREATE INDEX IF NOT EXISTS idx_enabled ON llm_providers(enabled);
    `);
    
    logger.debug('✅ LLM providers table initialized');
  }

  /**
   * 验证配置格式
   */
  private validateConfig(config: LLMProviderConfig, provider: string): void {
    if (!config.baseURL && provider !== 'claude') {
      throw new Error(`baseURL is required for provider: ${provider}`);
    }
    
    if (typeof config.timeout !== 'undefined' && config.timeout <= 0) {
      throw new Error('timeout must be positive');
    }
    
    if (config.maxRetries !== undefined && config.maxRetries < 0) {
      throw new Error('maxRetries must be non-negative');
    }
  }

  /**
   * 列出所有厂商配置
   */
  public list(): LLMProviderRecord[] {
    const rows = this.db.prepare(`
      SELECT id, provider, name, config_json, enabled, created_at, updated_at
      FROM llm_providers
      ORDER BY id ASC
    `).all() as Array<{
      id: number;
      provider: string;
      name: string;
      config_json: string;
      enabled: number;
      created_at: number;
      updated_at: number;
    }>;

    return rows.map(row => ({
      id: row.id,
      provider: row.provider,
      name: row.name,
      config: JSON.parse(row.config_json) as LLMProviderConfig,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  /**
   * 获取启用的厂商配置
   */
  public listEnabled(): LLMProviderRecord[] {
    const rows = this.db.prepare(`
      SELECT id, provider, name, config_json, enabled, created_at, updated_at
      FROM llm_providers
      WHERE enabled = 1
      ORDER BY id ASC
    `).all() as Array<{
      id: number;
      provider: string;
      name: string;
      config_json: string;
      enabled: number;
      created_at: number;
      updated_at: number;
    }>;

    return rows.map(row => ({
      id: row.id,
      provider: row.provider,
      name: row.name,
      config: JSON.parse(row.config_json) as LLMProviderConfig,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  /**
   * 根据ID获取厂商配置
   */
  public getById(id: number): LLMProviderRecord | null {
    const row = this.db.prepare(`
      SELECT id, provider, name, config_json, enabled, created_at, updated_at
      FROM llm_providers
      WHERE id = ?
    `).get(id) as {
      id: number;
      provider: string;
      name: string;
      config_json: string;
      enabled: number;
      created_at: number;
      updated_at: number;
    } | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      provider: row.provider,
      name: row.name,
      config: JSON.parse(row.config_json) as LLMProviderConfig,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * 根据provider名称获取厂商配置
   */
  public getByProvider(provider: string): LLMProviderRecord | null {
    const row = this.db.prepare(`
      SELECT id, provider, name, config_json, enabled, created_at, updated_at
      FROM llm_providers
      WHERE provider = ?
    `).get(provider) as {
      id: number;
      provider: string;
      name: string;
      config_json: string;
      enabled: number;
      created_at: number;
      updated_at: number;
    } | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      provider: row.provider,
      name: row.name,
      config: JSON.parse(row.config_json) as LLMProviderConfig,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * 创建厂商配置（仅用于初始化，不支持运行时添加）
   */
  public create(input: CreateLLMProviderInput): LLMProviderRecord {
    // 验证provider字段
    const validProviders = ['openai', 'deepseek', 'zhipu', 'claude', 'ollama', 'custom'];
    if (!validProviders.includes(input.provider)) {
      throw new Error(`Invalid provider: ${input.provider}. Must be one of: ${validProviders.join(', ')}`);
    }

    // 验证配置
    this.validateConfig(input.config, input.provider);

    // 检查是否已存在
    const existing = this.getByProvider(input.provider);
    if (existing) {
      throw new Error(`Provider ${input.provider} already exists`);
    }

    const now = Date.now();
    const configJson = JSON.stringify(input.config);

    const result = this.db.prepare(`
      INSERT INTO llm_providers (provider, name, config_json, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      input.provider,
      input.name,
      configJson,
      input.enabled !== false ? 1 : 0,
      now,
      now
    );

    logger.info(`✅ Created LLM provider: ${input.provider} (id: ${result.lastInsertRowid})`);

    return this.getById(Number(result.lastInsertRowid))!;
  }

  /**
   * 更新厂商配置
   */
  public update(id: number, input: UpdateLLMProviderInput): LLMProviderRecord {
    const existing = this.getById(id);
    if (!existing) {
      throw new Error(`Provider with id ${id} not found`);
    }

    // 构建更新数据
    const updates: string[] = [];
    const values: any[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }

    if (input.config !== undefined) {
      // 验证配置
      this.validateConfig(input.config, existing.provider);
      updates.push('config_json = ?');
      values.push(JSON.stringify(input.config));
    }

    if (input.enabled !== undefined) {
      updates.push('enabled = ?');
      values.push(input.enabled ? 1 : 0);
    }

    if (updates.length === 0) {
      // 没有要更新的字段
      return existing;
    }

    // 添加updated_at
    updates.push('updated_at = ?');
    values.push(Date.now());

    // 添加id到values末尾
    values.push(id);

    const sql = `UPDATE llm_providers SET ${updates.join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...values);

    logger.info(`✅ Updated LLM provider: ${existing.provider} (id: ${id})`);

    return this.getById(id)!;
  }

  /**
   * 删除厂商配置（仅用于清理，不支持运行时删除）
   */
  public delete(id: number): void {
    const existing = this.getById(id);
    if (!existing) {
      throw new Error(`Provider with id ${id} not found`);
    }

    this.db.prepare('DELETE FROM llm_providers WHERE id = ?').run(id);
    logger.info(`✅ Deleted LLM provider: ${existing.provider} (id: ${id})`);
  }

  /**
   * 关闭数据库连接
   */
  public close(): void {
    this.db.close();
    logger.info('✅ LLMConfigService database closed');
  }
}

