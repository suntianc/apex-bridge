/**
 * Async Result Variable Provider
 * 
 * 提供异步结果变量解析
 
 */

import { IVariableProvider, VariableContext } from '../../../types/variable';
import { AsyncResultData, CleanupStats } from '../../../types/async-result';
import { logger } from '../../../utils/logger';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

/**
 * AsyncResultProvider配置
 */
export interface AsyncResultProviderConfig {
  asyncResultDirectory: string;
}

/**
 * 异步结果提供者
 * 
 * 支持的变量：
 * - {{AsyncResult:requestId}} - 获取异步结果
 */
export class AsyncResultProvider implements IVariableProvider {
  readonly name = 'AsyncResultProvider';
  readonly namespace = 'AsyncResult';

  private asyncResultDirectory: string;

  constructor(config: AsyncResultProviderConfig) {
    this.asyncResultDirectory = config.asyncResultDirectory;
  }

  async resolve(key: string, context?: VariableContext): Promise<string | null> {
    // 支持 {{AsyncResult:requestId}} 格式
    if (!key.startsWith('AsyncResult:')) {
      return null;
    }

    const requestId = key.substring(12); // 'AsyncResult:'.length
    if (!requestId) {
      return null;
    }

    try {
      const resultData = await this.loadAsyncResult(requestId);
      if (resultData) {
        // 根据状态返回不同的内容
        if (resultData.status === 'Succeed') {
          return resultData.content || resultData.message || '执行成功';
        } else if (resultData.status === 'Failed') {
          return `执行失败: ${resultData.reason || resultData.message || '未知错误'}`;
        } else {
          return '执行中...';
        }
      }
    } catch (error) {
      logger.error(`[AsyncResultProvider] Error loading async result '${requestId}':`, error);
    }

    return null;
  }

  getSupportedKeys(): string[] {
    // 动态获取所有可用的requestId
    return this.listAsyncResults();
  }

  /**
   * 加载异步结果
   */
  private async loadAsyncResult(requestId: string): Promise<AsyncResultData | null> {
    try {
      const resultPath = path.join(this.asyncResultDirectory, requestId, 'result.json');
      const content = await fs.readFile(resultPath, 'utf-8');
      return JSON.parse(content) as AsyncResultData;
    } catch (error) {
      logger.debug(`[AsyncResultProvider] Async result '${requestId}' not found`);
      return null;
    }
  }

  /**
   * 列出所有可用的异步结果
   */
  private listAsyncResults(): string[] {
    try {
      const entries = fsSync.readdirSync(this.asyncResultDirectory, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => `AsyncResult:${entry.name}`);
    } catch (error) {
      logger.debug(`[AsyncResultProvider] Error listing async results:`, error);
      return [];
    }
  }

  /**
   * 保存异步结果
   */
  async saveAsyncResult(pluginName: string, taskId: string, resultData: AsyncResultData): Promise<void> {
    try {
      const resultDir = path.join(this.asyncResultDirectory, taskId);
      await fs.mkdir(resultDir, { recursive: true });
      
      const resultPath = path.join(resultDir, 'result.json');
      await fs.writeFile(resultPath, JSON.stringify(resultData, null, 2), 'utf-8');
      
      logger.info(`[AsyncResultProvider] Saved async result: ${taskId}`);
    } catch (error) {
      logger.error(`[AsyncResultProvider] Error saving async result:`, error);
      throw error;
    }
  }

  /**
   * 清理过期的异步结果
   * 
   * @param maxAgeDays 最大保留天数
   * @param strategy 清理策略：'directory' 按目录删除，'file' 按文件删除
   * @returns 清理统计信息
   */
  async cleanupOldResults(maxAgeDays: number, strategy: 'directory' | 'file'): Promise<CleanupStats> {
    const stats: CleanupStats = {
      deletedDirs: 0,
      deletedFiles: 0,
      timestamp: Date.now()
    };

    try {
      // 计算过期时间阈值（毫秒）
      const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
      const thresholdTime = Date.now() - maxAgeMs;

      // 检查目录是否存在
      try {
        await fs.access(this.asyncResultDirectory);
      } catch {
        logger.debug(`[AsyncResultProvider] Async result directory does not exist: ${this.asyncResultDirectory}`);
        return stats;
      }

      // 读取所有目录
      const entries = await fs.readdir(this.asyncResultDirectory, { withFileTypes: true });
      const directories = entries.filter(entry => entry.isDirectory());

      logger.info(`[AsyncResultProvider] Starting cleanup: ${directories.length} directories to check, maxAge: ${maxAgeDays} days, strategy: ${strategy}`);

      for (const dir of directories) {
        const dirPath = path.join(this.asyncResultDirectory, dir.name);
        
        try {
          if (strategy === 'directory') {
            // 按目录策略：检查目录的修改时间
            const dirStats = await fs.stat(dirPath);
            if (dirStats.mtimeMs < thresholdTime) {
              // 删除整个目录
              await fs.rm(dirPath, { recursive: true, force: true });
              stats.deletedDirs++;
              logger.debug(`[AsyncResultProvider] Deleted old directory: ${dir.name}`);
            }
          } else {
            // 按文件策略：检查 result.json 文件的修改时间
            const resultFilePath = path.join(dirPath, 'result.json');
            try {
              const fileStats = await fs.stat(resultFilePath);
              if (fileStats.mtimeMs < thresholdTime) {
                // 只删除 result.json 文件，保留目录
                await fs.unlink(resultFilePath);
                stats.deletedFiles++;
                logger.debug(`[AsyncResultProvider] Deleted old file: ${dir.name}/result.json`);
              }
            } catch (fileError) {
              // 文件不存在，跳过
              logger.debug(`[AsyncResultProvider] Result file not found: ${resultFilePath}`);
            }
          }
        } catch (error) {
          logger.warn(`[AsyncResultProvider] Error processing directory ${dir.name}:`, error);
          // 继续处理其他目录
        }
      }

      logger.info(`[AsyncResultProvider] Cleanup completed: deleted ${stats.deletedDirs} dirs, ${stats.deletedFiles} files`);
    } catch (error) {
      logger.error(`[AsyncResultProvider] Error during cleanup:`, error);
      throw error;
    }

    return stats;
  }
}

