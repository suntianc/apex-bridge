/**
 * PathService - 路径管理服务
 * 统一管理项目中的所有路径，支持环境变量覆盖
 */

import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../utils/logger';

export interface PathConfig {
  /** 项目根目录（默认为 process.cwd()） */
  rootDir?: string;
  /** 配置目录（默认为 {rootDir}/config） */
  configDir?: string;
  /** 数据目录（默认为 {rootDir}/data） */
  dataDir?: string;
  /** 日志目录（默认为 {rootDir}/logs） */
  logDir?: string;
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
        process.env.APEX_BRIDGE_DATA_DIR || path.join(rootDir, '.data')
      ),
      logDir: path.resolve(
        process.env.APEX_BRIDGE_LOG_DIR || path.join(rootDir, 'logs')
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
   * 获取日志目录
   */
  public getLogDir(): string {
    return this.config.logDir;
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
   * 确保目录存在（如果不存在则创建）
   * 
   * @param dirPath - 目录路径
   * @throws 如果创建目录失败（非 EEXIST 错误）
   */
  public ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      try {
        fs.mkdirSync(dirPath, { recursive: true, mode: 0o755 });
        logger.debug(`✅ Created directory: ${dirPath}`);
      } catch (error: any) {
        // 如果并发创建导致 EEXIST，通常可以忽略
        // 但如果是 EACCES 等权限错误，需要记录并抛出
        if (error.code !== 'EEXIST') {
          logger.error(`❌ Failed to create directory ${dirPath}:`, error);
          throw error;
        }
        // EEXIST 错误通常表示目录已存在（可能是并发创建），可以安全忽略
        logger.debug(`⚠️ Directory already exists (concurrent creation?): ${dirPath}`);
      }
    }
  }

  /**
   * 确保所有必要的目录都存在
   * 
   * @throws 如果关键目录创建失败，应阻断启动
   */
  public ensureAllDirs(): void {
    try {
      this.ensureDir(this.config.configDir);
      this.ensureDir(this.config.dataDir);
      this.ensureDir(this.config.logDir);
      // vectorStoreDir 可能从配置读取，在需要时确保
    } catch (error) {
      logger.error('❌ Failed to initialize project directories', error);
      throw error; // 关键目录创建失败应阻断启动
    }
  }

  /**
   * 更新配置（从ConfigService读取的配置）
   */
  public updateFromConfig(config: { rag?: { storagePath?: string } }): void {
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