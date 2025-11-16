/**
 * PathService - 路径管理服务
 * 统一管理项目中的所有路径，支持环境变量覆盖
 */

import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger';

export interface PathConfig {
  /** 项目根目录（默认为 process.cwd()） */
  rootDir?: string;
  /** 配置目录（默认为 {rootDir}/config） */
  configDir?: string;
  /** 数据目录（默认为 {rootDir}/data） */
  dataDir?: string;
  /** Agent目录（默认为 {rootDir}/Agent） */
  agentDir?: string;
  /** 插件目录（从配置读取） */
  pluginDir?: string;
  /** 日志目录（默认为 {rootDir}/logs） */
  logDir?: string;
  /** 异步结果目录（默认为 {rootDir}/async_results） */
  asyncResultDir?: string;
  /** 日记根目录（默认为 {rootDir}/dailynote） */
  diaryRootDir?: string;
  /** 向量存储目录（从配置读取） */
  vectorStoreDir?: string;
}

/**
 * 路径服务单例
 */
export class PathService {
  private static instance: PathService;
  private config: Required<PathConfig>;

  private constructor() {
    // 从环境变量或默认值初始化配置
    const rootDir = process.env.APEX_BRIDGE_ROOT_DIR || process.cwd();
    
    this.config = {
      rootDir: path.resolve(rootDir),
      configDir: path.resolve(
        process.env.APEX_BRIDGE_CONFIG_DIR || path.join(rootDir, 'config')
      ),
      dataDir: path.resolve(
        process.env.APEX_BRIDGE_DATA_DIR || path.join(rootDir, 'data')
      ),
      agentDir: path.resolve(
        process.env.APEX_BRIDGE_AGENT_DIR || path.join(rootDir, 'Agent')
      ),
      pluginDir: path.resolve(
        process.env.APEX_BRIDGE_PLUGIN_DIR || path.join(rootDir, 'plugins')
      ),
      logDir: path.resolve(
        process.env.APEX_BRIDGE_LOG_DIR || path.join(rootDir, 'logs')
      ),
      asyncResultDir: path.resolve(
        process.env.APEX_BRIDGE_ASYNC_RESULT_DIR || path.join(rootDir, 'async_results')
      ),
      diaryRootDir: path.resolve(
        process.env.APEX_BRIDGE_DIARY_ROOT_DIR || path.join(rootDir, 'dailynote')
      ),
      vectorStoreDir: path.resolve(
        process.env.APEX_BRIDGE_VECTOR_STORE_DIR || path.join(rootDir, 'vector_store')
      )
    };

    logger.debug('✅ PathService initialized:', {
      rootDir: this.config.rootDir,
      configDir: this.config.configDir
    });
  }

  public static getInstance(): PathService {
    if (!PathService.instance) {
      PathService.instance = new PathService();
    }
    return PathService.instance;
  }

  /**
   * 获取项目根目录
   */
  public getRootDir(): string {
    return this.config.rootDir;
  }

  /**
   * 获取配置目录
   */
  public getConfigDir(): string {
    return this.config.configDir;
  }

  /**
   * 获取数据目录
   */
  public getDataDir(): string {
    return this.config.dataDir;
  }

  /**
   * 获取Agent目录
   */
  public getAgentDir(): string {
    return this.config.agentDir;
  }

  /**
   * 获取插件目录（可动态更新）
   */
  public getPluginDir(): string {
    return this.config.pluginDir;
  }

  /**
   * 设置插件目录（从配置读取）
   */
  public setPluginDir(pluginDir: string): void {
    this.config.pluginDir = path.resolve(pluginDir);
  }

  /**
   * 获取日志目录
   */
  public getLogDir(): string {
    return this.config.logDir;
  }

  /**
   * 获取异步结果目录
   */
  public getAsyncResultDir(): string {
    return this.config.asyncResultDir;
  }

  /**
   * 获取日记根目录
   */
  public getDiaryRootDir(): string {
    return this.config.diaryRootDir;
  }

  /**
   * 获取向量存储目录（可动态更新）
   */
  public getVectorStoreDir(): string {
    return this.config.vectorStoreDir;
  }

  /**
   * 设置向量存储目录（从配置读取）
   */
  public setVectorStoreDir(vectorStoreDir: string): void {
    this.config.vectorStoreDir = path.resolve(vectorStoreDir);
  }

  /**
   * 获取配置文件路径
   */
  public getConfigFilePath(): string {
    return path.join(this.config.configDir, 'admin-config.json');
  }

  /**
   * 获取配置文件备份路径
   */
  public getConfigBackupPath(): string {
    return path.join(this.config.configDir, 'admin-config.json.backup');
  }

  /**
   * 获取节点配置文件路径
   */
  public getNodesFilePath(): string {
    return path.join(this.config.configDir, 'nodes.json');
  }

  /**
   * 获取偏好存储目录
   */
  public getPreferencesDir(): string {
    return path.join(this.config.configDir, 'preferences');
  }

  /**
   * 获取管理后台静态文件目录
   */
  public getAdminDistDir(): string {
    return path.join(this.config.rootDir, 'admin', 'dist');
  }

  /**
   * 确保目录存在（如果不存在则创建）
   */
  public ensureDir(dirPath: string): void {
    const fs = require('fs');
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true, mode: 0o755 });
      logger.debug(`✅ Created directory: ${dirPath}`);
    }
  }

  /**
   * 确保所有必要的目录都存在
   */
  public ensureAllDirs(): void {
    this.ensureDir(this.config.configDir);
    this.ensureDir(this.config.dataDir);
    this.ensureDir(this.config.agentDir);
    this.ensureDir(this.config.logDir);
    this.ensureDir(this.config.asyncResultDir);
    // pluginDir 和 vectorStoreDir 可能从配置读取，在需要时确保
  }

  /**
   * 更新配置（从ConfigService读取的配置）
   */
  public updateFromConfig(config: { plugins?: { directory?: string }; rag?: { storagePath?: string } }): void {
    if (config.plugins?.directory) {
      this.setPluginDir(config.plugins.directory);
    }
    if (config.rag?.storagePath) {
      this.setVectorStoreDir(config.rag.storagePath);
    }
  }

  /**
   * 获取所有路径配置（用于调试）
   */
  public getAllPaths(): PathConfig {
    return { ...this.config };
  }
}

