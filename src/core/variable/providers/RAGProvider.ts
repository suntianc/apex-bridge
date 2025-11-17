/**
 * RAG Variable Provider
 * 
 * 提供RAG搜索相关的变量
 
 */

import { IVariableProvider, VariableContext } from '../../../types/variable';
import { logger } from '../../../utils/logger';

/**
 * RAG模式
 */
export enum RAGMode {
  Basic = 'basic',
  Time = 'time',
  Group = 'group',
  Rerank = 'rerank',
}

/**
 * RAGProvider配置
 */
export interface RAGProviderConfig {
  ragService?: any;
  defaultMode?: RAGMode;
  defaultK?: number;
  maxK?: number;
  maxMultiplier?: number;
  semanticWeight?: number;
  timeWeight?: number;
  semanticGroupManager?: any;
  rerankClient?: any;
}

/**
 * RAG变量提供者
 * 
 * 支持的变量：
 * - {{RAG:query}} - RAG搜索
 * - {{RAG:query:mode}} - 指定模式的RAG搜索
 * - {{RAG:query:k=5}} - 指定topK的RAG搜索
 */
export class RAGProvider implements IVariableProvider {
  readonly name = 'RAGProvider';
  readonly namespace = 'RAG';

  private ragService?: any;
  private defaultMode: RAGMode;
  private defaultK: number;
  private maxK: number;
  private maxMultiplier: number;
  private semanticWeight: number;
  private timeWeight: number;
  private semanticGroupManager?: any;
  private rerankClient?: any;

  constructor(config: RAGProviderConfig = {}) {
    this.ragService = config.ragService;
    this.defaultMode = config.defaultMode ?? RAGMode.Basic;
    this.defaultK = config.defaultK ?? 5;
    this.maxK = config.maxK ?? 20;
    this.maxMultiplier = config.maxMultiplier ?? 5;
    this.semanticWeight = config.semanticWeight ?? 0.7;
    this.timeWeight = config.timeWeight ?? 0.3;
    this.semanticGroupManager = config.semanticGroupManager;
    this.rerankClient = config.rerankClient;
  }

  async resolve(key: string, context?: VariableContext): Promise<string | null> {
    // 支持 {{RAG:query}} 或 {{RAG:query:mode}} 格式
    if (!key.startsWith('RAG:')) {
      return null;
    }

    const queryPart = key.substring(4); // 'RAG:'.length
    if (!queryPart) {
      return null;
    }

    // 解析查询参数（支持 mode 和 k 参数）
    const { query, mode, topK } = this.parseRAGQuery(queryPart);

    if (!this.ragService) {
      logger.warn('[RAGProvider] RAG service not set, cannot resolve RAG queries');
      return null;
    }

    try {
      const results = await this.performRAGSearch(query, mode, topK, context);
      if (results && results.length > 0) {
        // 合并所有结果
        return results.map((r: any) => r.content || r.text || r).join('\n\n---\n\n');
      }
    } catch (error) {
      logger.error(`[RAGProvider] Error performing RAG search:`, error);
    }

    return null;
  }

  getSupportedKeys(): string[] {
    // 动态支持，无法预知所有查询
    return ['RAG:*'];
  }

  /**
   * 解析RAG查询字符串
   */
  private parseRAGQuery(queryPart: string): { query: string; mode?: RAGMode; topK?: number } {
    // 格式：query:mode 或 query:k=5 或 query:mode:k=5
    const parts = queryPart.split(':');
    const query = parts[0];
    let mode: RAGMode | undefined;
    let topK: number | undefined;

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      
      // 检查是否是模式
      if (Object.values(RAGMode).includes(part as RAGMode)) {
        mode = part as RAGMode;
      }
      
      // 检查是否是k参数
      if (part.startsWith('k=')) {
        const kValue = parseInt(part.substring(2), 10);
        if (!isNaN(kValue)) {
          topK = Math.min(kValue, this.maxK);
        }
      }
    }

    return { query, mode, topK };
  }

  /**
   * 执行RAG搜索
   */
  private async performRAGSearch(
    query: string,
    mode?: RAGMode,
    topK?: number,
    context?: VariableContext
  ): Promise<any[]> {
    if (!this.ragService) {
      return [];
    }

    const searchMode = mode || this.defaultMode;
    const k = topK || this.defaultK;

    try {
      switch (searchMode) {
        case RAGMode.Basic:
          return await this.ragService.search?.({
            query,
            userId: context?.userId,
            personaId: context?.personaId,
            topK: k,
          }) || [];

        case RAGMode.Time:
          return await this.ragService.searchWithTime?.({
            query,
            userId: context?.userId,
            personaId: context?.personaId,
            topK: k,
            semanticWeight: this.semanticWeight,
            timeWeight: this.timeWeight,
          }) || [];

        case RAGMode.Group:
          if (this.semanticGroupManager) {
            return await this.ragService.searchWithGroup?.({
              query,
              userId: context?.userId,
              personaId: context?.personaId,
              topK: k,
              semanticGroupManager: this.semanticGroupManager,
            }) || [];
          }
          // fallback to basic
          return await this.ragService.search?.({
            query,
            userId: context?.userId,
            personaId: context?.personaId,
            topK: k,
          }) || [];

        case RAGMode.Rerank:
          if (this.rerankClient) {
            const initialResults = await this.ragService.search?.({
              query,
              userId: context?.userId,
              personaId: context?.personaId,
              topK: k * this.maxMultiplier,
            }) || [];

            // 使用rerank客户端重新排序
            return await this.rerankClient.rerank?.(query, initialResults, k) || [];
          }
          // fallback to basic
          return await this.ragService.search?.({
            query,
            userId: context?.userId,
            personaId: context?.personaId,
            topK: k,
          }) || [];

        default:
          return await this.ragService.search?.({
            query,
            userId: context?.userId,
            personaId: context?.personaId,
            topK: k,
          }) || [];
      }
    } catch (error) {
      logger.error(`[RAGProvider] Error in RAG search (mode: ${searchMode}):`, error);
      return [];
    }
  }
}

