/**
 * Async Result Variable Provider
 * 
 * 提供异步结果变量解析
 * 独立于vcp-intellicore-sdk的实现
 */

import { IVariableProvider, VariableContext } from '../../../types/variable';
import { AsyncResultData } from '../../../types/async-result';
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
}

