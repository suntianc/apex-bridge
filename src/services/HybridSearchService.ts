/**
 * 混合检索服务
 *
 * 职责:
 * - BM25 全文检索
 * - 向量语义检索
 * - RRF 融合排序
 */

import { StrategicPlaybook } from '../core/playbook/types';
import { HybridSearchOptions, BM25IndexEntry, SearchResultItem } from '../types/playbook-maintenance';
import { ToolRetrievalService } from './ToolRetrievalService';
import { logger } from '../utils/logger';

export class HybridSearchService {
  private bm25Index: Map<string, BM25IndexEntry>;

  constructor(private toolRetrievalService: ToolRetrievalService) {
    this.bm25Index = new Map();
  }

  /**
   * 🆕 混合检索
   */
  async search(options: HybridSearchOptions): Promise<StrategicPlaybook[]> {
    const { query, limit, weights = { bm25: 0.4, vector: 0.6 } } = options;

    logger.debug(`[HybridSearch] 查询: ${query}`);

    // 1. BM25 检索
    const bm25Results = await this.bm25Search(query, limit * 2);

    // 2. 向量检索
    const vectorResults = await this.vectorSearch(query, limit * 2);

    // 3. RRF 融合
    const fusedResults = await this.fuseResults(bm25Results, vectorResults, weights);

    // 4. 返回前 N 个
    return fusedResults.slice(0, limit);
  }

  /**
   * BM25 检索
   */
  private async bm25Search(query: string, limit: number): Promise<SearchResultItem[]> {
    const queryTerms = this.tokenize(query);
    const scores = new Map<string, number>();

    // 简化的 BM25 实现
    for (const [docId, docData] of this.bm25Index.entries()) {
      let score = 0;
      for (const term of queryTerms) {
        if (docData.terms.has(term)) {
          const tf = docData.terms.get(term);
          const idf = this.calculateIDF(term);
          score += idf * ((tf * 2.2) / (tf + 1.2));  // k1=2.2, b=1.2 (简化)
        }
      }
      if (score > 0) {
        scores.set(docId, score);
      }
    }

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, score]) => ({ id, score }));
  }

  /**
   * 向量检索
   */
  private async vectorSearch(query: string, limit: number): Promise<SearchResultItem[]> {
    try {
      // 调用 LanceDB 向量检索
      const results = await this.toolRetrievalService.findRelevantSkills(
        query,
        limit,
        0.4
      );

      return results.map((r: any) => ({
        id: r.tool.metadata?.playbookId || r.tool.name,
        score: r.score
      }));
    } catch (error) {
      logger.error('[HybridSearch] 向量检索失败:', error);
      return [];
    }
  }

  /**
   * RRF 融合
   */
  private async fuseResults(
    bm25Results: SearchResultItem[],
    vectorResults: SearchResultItem[],
    weights: { bm25: number; vector: number }
  ): Promise<StrategicPlaybook[]> {
    const k = 60;  // RRF 参数
    const scoreMap = new Map<string, number>();

    // BM25 贡献
    bm25Results.forEach((result, rank) => {
      const rrfScore = weights.bm25 / (k + rank + 1);
      scoreMap.set(result.id, (scoreMap.get(result.id) || 0) + rrfScore);
    });

    // 向量检索贡献
    vectorResults.forEach((result, rank) => {
      const rrfScore = weights.vector / (k + rank + 1);
      scoreMap.set(result.id, (scoreMap.get(result.id) || 0) + rrfScore);
    });

    // 按融合分数排序
    const sortedIds = Array.from(scoreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, _]) => id);

    // 获取完整 Playbook 对象
    return await this.getPlaybooksByIds(sortedIds);
  }

  /**
   * 索引 Playbook（BM25）
   */
  async indexPlaybook(playbook: StrategicPlaybook): Promise<void> {
    const text = [
      playbook.name,
      playbook.description,
      playbook.type,
      playbook.context.domain,
      playbook.context.scenario,
      ...playbook.tags
    ].join(' ');

    const terms = this.tokenize(text);
    const termFreq = new Map<string, number>();

    terms.forEach(term => {
      termFreq.set(term, (termFreq.get(term) || 0) + 1);
    });

    this.bm25Index.set(playbook.id, {
      terms: termFreq,
      length: terms.length
    });

    logger.debug(`[HybridSearch] 已索引 Playbook: ${playbook.id}`);
  }

  /**
   * 移除 Playbook 索引
   */
  async removeFromIndex(playbookId: string): Promise<void> {
    this.bm25Index.delete(playbookId);
    logger.debug(`[HybridSearch] 已移除索引: ${playbookId}`);
  }

  /**
   * 清空索引
   */
  clearIndex(): void {
    this.bm25Index.clear();
    logger.info('[HybridSearch] 已清空 BM25 索引');
  }

  /**
   * 分词
   */
  private tokenize(text: string): string[] {
    // 对中文字符，按字符分割；对英文和数字，按空格分割
    const tokens: string[] = [];

    // 匹配中文、英文单词和数字的组合
    const matches = text.toLowerCase().match(/[\u4e00-\u9fa5]+|[a-z0-9]+/g);

    if (matches) {
      for (const token of matches) {
        if (token.length > 1) {
          tokens.push(token);
        }
      }
    }

    return tokens;
  }

  /**
   * 计算 IDF
   */
  private calculateIDF(term: string): number {
    const N = this.bm25Index.size;
    if (N === 0) return 0;

    let df = 0;

    for (const [_, docData] of this.bm25Index.entries()) {
      if (docData.terms.has(term)) df++;
    }

    return Math.log((N - df + 0.5) / (df + 0.5) + 1);
  }

  /**
   * 根据 ID 列表获取 Playbook
   */
  private async getPlaybooksByIds(ids: string[]): Promise<StrategicPlaybook[]> {
    if (ids.length === 0) return [];

    try {
      // 批量获取 Playbook
      const results: StrategicPlaybook[] = [];

      for (const id of ids) {
        const searchResult = await this.toolRetrievalService.findRelevantSkills(
          `playbook ${id}`,
          1,
          0.99
        );

        if (searchResult.length > 0) {
          const playbook = this.parsePlaybookFromVector(searchResult[0].tool);
          if (playbook) {
            results.push(playbook);
          }
        }
      }

      return results;
    } catch (error) {
      logger.error('[HybridSearch] 获取 Playbook 失败:', error);
      return [];
    }
  }

  /**
   * 从向量工具解析 Playbook
   */
  private parsePlaybookFromVector(tool: any): StrategicPlaybook | null {
    if (tool.metadata?.type !== 'strategic_playbook') {
      return null;
    }

    const metadata = tool.metadata;
    try {
      const playbook: StrategicPlaybook = {
        id: metadata.playbookId,
        name: metadata.name || tool.name,
        description: metadata.description || tool.description,
        type: metadata.playbookType || 'problem_solving',
        version: metadata.version || '1.0.0',
        status: metadata.status || 'active',
        context: {
          domain: metadata.domain || 'general',
          scenario: metadata.scenario || 'unspecified',
          complexity: 'medium',
          stakeholders: []
        },
        trigger: {
          type: 'event',
          condition: 'Automatically extracted from strategic learning'
        },
        actions: metadata.actions || [],
        sourceLearningIds: metadata.sourceLearningIds || [],
        createdAt: metadata.createdAt || Date.now(),
        lastUpdated: metadata.lastUpdated || Date.now(),
        lastOptimized: metadata.lastOptimized || Date.now(),
        metrics: metadata.metrics || {
          successRate: 0,
          usageCount: 0,
          averageOutcome: 0,
          lastUsed: 0,
          timeToResolution: 0,
          userSatisfaction: 0,
          avgSatisfaction: 0,
          avgExecutionTime: 0
        },
        optimizationCount: metadata.optimizationCount || 0,
        parentId: metadata.parentId,
        tags: tool.tags || ['playbook'],
        author: metadata.author || 'auto-extracted',
        reviewers: metadata.reviewers || []
      };

      return playbook;
    } catch (error) {
      logger.error('[HybridSearch] 解析 Playbook 失败:', error);
      return null;
    }
  }

  /**
   * 获取索引统计信息
   */
  getIndexStats(): { totalDocs: number; totalTerms: number } {
    let totalTerms = 0;
    for (const docData of this.bm25Index.values()) {
      totalTerms += docData.terms.size;
    }

    return {
      totalDocs: this.bm25Index.size,
      totalTerms
    };
  }
}
