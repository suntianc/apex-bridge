/**
 * Diary Variable Provider
 * 
 * 提供日记相关的变量
 * 独立于vcp-intellicore-sdk的实现
 */

import { IVariableProvider, VariableContext } from '../../../types/variable';
import { logger } from '../../../utils/logger';

/**
 * DiaryProvider配置
 */
export interface DiaryProviderConfig {
  ragService?: any;
  diaryService?: any;
  enableCache?: boolean;
  cacheTTL?: number;
}

/**
 * 日记变量提供者
 * 
 * 支持的变量：
 * - {{Diary:date}} - 获取指定日期的日记
 * - {{Diary:today}} - 获取今天的日记
 */
export class DiaryProvider implements IVariableProvider {
  readonly name = 'DiaryProvider';
  readonly namespace = 'Diary';

  private ragService?: any;
  private diaryService?: any;
  private enableCache: boolean;
  private cacheTTL: number;
  private cache: Map<string, { value: string; timestamp: number }>;

  constructor(config: DiaryProviderConfig = {}) {
    this.ragService = config.ragService;
    this.diaryService = config.diaryService;
    this.enableCache = config.enableCache ?? true;
    this.cacheTTL = config.cacheTTL ?? 60000; // 默认1分钟
    this.cache = new Map();
  }

  async resolve(key: string, context?: VariableContext): Promise<string | null> {
    // 支持 {{Diary:date}} 或 {{Diary:today}} 格式
    if (!key.startsWith('Diary:')) {
      return null;
    }

    const dateKey = key.substring(6); // 'Diary:'.length
    if (!dateKey) {
      return null;
    }

    // 检查缓存
    if (this.enableCache) {
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.value;
      }
    }

    try {
      let diaryContent: string | null = null;

      // 确定日期
      let targetDate: string;
      if (dateKey === 'today') {
        const now = new Date();
        targetDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
      } else {
        targetDate = dateKey;
      }

      // 从diaryService或ragService获取日记
      if (this.diaryService) {
        diaryContent = await this.diaryService.getDiary?.(targetDate, context);
      } else if (this.ragService) {
        // 使用RAG服务搜索日记
        diaryContent = await this.searchDiaryFromRAG(targetDate, context);
      }

      if (diaryContent) {
        // 保存到缓存
        if (this.enableCache) {
          this.cache.set(key, {
            value: diaryContent,
            timestamp: Date.now(),
          });
        }
        return diaryContent;
      }
    } catch (error) {
      logger.error(`[DiaryProvider] Error resolving diary '${key}':`, error);
    }

    return null;
  }

  getSupportedKeys(): string[] {
    return ['Diary:today'];
  }

  /**
   * 从RAG服务搜索日记
   */
  private async searchDiaryFromRAG(date: string, context?: VariableContext): Promise<string | null> {
    if (!this.ragService) {
      return null;
    }

    try {
      // 使用RAG服务搜索包含日期的内容
      const results = await this.ragService.search?.({
        query: `日记 ${date}`,
        userId: context?.userId,
        personaId: context?.personaId,
        topK: 5,
      });

      if (results && results.length > 0) {
        // 合并所有结果
        return results.map((r: any) => r.content || r.text).join('\n\n');
      }
    } catch (error) {
      logger.debug(`[DiaryProvider] Error searching diary from RAG:`, error);
    }

    return null;
  }

  /**
   * 设置日记服务
   */
  setDiaryService(diaryService: any): void {
    this.diaryService = diaryService;
    logger.info('[DiaryProvider] Diary service set');
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('[DiaryProvider] Cache cleared');
  }
}

