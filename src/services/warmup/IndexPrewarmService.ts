/**
 * IndexPrewarmService - 向量索引预热服务
 *
 * 负责预热 LanceDB 向量索引，减少首次查询延迟
 */

import { logger } from "../../utils/logger";
import { getToolRetrievalService } from "../tool-retrieval/ToolRetrievalService";
import { ToolRetrievalConfig } from "../tool-retrieval/types";

/**
 * 预热配置
 */
export interface IndexPrewarmConfig {
  queryCount: number;
  queryTimeoutMs: number;
}

/**
 * 预热结果
 */
export interface IndexPrewarmResult {
  success: boolean;
  queriesExecuted: number;
  errors: string[];
  duration: number;
}

/**
 * 预热查询样例
 */
const SAMPLE_QUERIES = [
  "search tools",
  "find skills",
  "retrieve functions",
  "get capabilities",
  "query assistants",
  "list functions",
  "search agents",
  "find executors",
  "get tools",
  "retrieve skills",
  "query plugins",
  "list agents",
  "search capabilities",
  "find helpers",
  "get functions",
  "retrieve executors",
  "query assistants",
  "list tools",
  "search skills",
  "find plugins",
];

/**
 * IndexPrewarmService - 向量索引预热
 */
export class IndexPrewarmService {
  private config: IndexPrewarmConfig;
  private hasWarmed = false;
  private toolRetrievalService: ReturnType<typeof getToolRetrievalService> | null = null;

  constructor(config?: Partial<IndexPrewarmConfig>) {
    this.config = {
      queryCount: 100,
      queryTimeoutMs: 5000,
      ...config,
    };
    logger.info("[IndexPrewarmService] Initialized");
  }

  /**
   * 预热向量索引
   */
  async prewarm(options?: Partial<IndexPrewarmConfig>): Promise<IndexPrewarmResult> {
    const config = { ...this.config, ...options };
    const startTime = Date.now();
    const errors: string[] = [];
    let queriesExecuted = 0;

    if (this.hasWarmed) {
      logger.debug("[IndexPrewarmService] Already warmed up, skipping");
      return {
        success: true,
        queriesExecuted: 0,
        errors: [],
        duration: Date.now() - startTime,
      };
    }

    try {
      logger.info(
        `[IndexPrewarmService] Starting index prewarm with ${config.queryCount} queries...`
      );

      // 初始化 ToolRetrievalService
      if (!this.toolRetrievalService) {
        const retrievalConfig: ToolRetrievalConfig = {
          vectorDbPath: "./.data/skills.lance",
          model: "nomic-embed-text:latest",
          dimensions: 768,
          similarityThreshold: 0.4,
          maxResults: 10,
          cacheSize: 1000,
        };
        this.toolRetrievalService = getToolRetrievalService(retrievalConfig);
      }

      // 初始化服务
      await this.toolRetrievalService.initialize();

      // 执行预热查询
      const queries = this.generateQueries(config.queryCount);

      for (const query of queries) {
        try {
          const result = await this.executeQueryWithTimeout(
            this.toolRetrievalService,
            query,
            config.queryTimeoutMs
          );
          if (result) {
            queriesExecuted++;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          errors.push(`Query "${query.substring(0, 30)}..." failed: ${errorMessage}`);
        }
      }

      this.hasWarmed = true;

      logger.info(
        `[IndexPrewarmService] Index prewarm completed: ${queriesExecuted} queries successful, ${errors.length} failed`
      );

      return {
        success: errors.length === 0,
        queriesExecuted,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error("[IndexPrewarmService] Index prewarm failed:", error);

      return {
        success: false,
        queriesExecuted,
        errors: [error instanceof Error ? error.message : "Unknown error"],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 生成预热查询
   */
  private generateQueries(count: number): string[] {
    const queries: string[] = [];

    for (let i = 0; i < count; i++) {
      const baseQuery = SAMPLE_QUERIES[i % SAMPLE_QUERIES.length];
      const variant = `${baseQuery} ${i}`;
      queries.push(variant);
    }

    return queries;
  }

  /**
   * 带超时的查询执行
   */
  private async executeQueryWithTimeout(
    service: ReturnType<typeof getToolRetrievalService>,
    query: string,
    timeoutMs: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn(`[IndexPrewarmService] Query timeout: "${query.substring(0, 30)}..."`);
        resolve(false);
      }, timeoutMs);

      service
        .findRelevantSkills(query, 5)
        .then(() => {
          clearTimeout(timeout);
          resolve(true);
        })
        .catch(() => {
          clearTimeout(timeout);
          resolve(false);
        });
    });
  }

  /**
   * 检查是否已预热
   */
  isReady(): boolean {
    return this.hasWarmed;
  }

  /**
   * 重置预热状态（用于测试）
   */
  reset(): void {
    this.hasWarmed = false;
  }
}
