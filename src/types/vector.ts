/**
 * Vector Search 相关类型定义
 */

export interface VectorToolResult {
  id: string;
  tool: any;
  score: number;
  metadata?: Record<string, any>;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata?: Record<string, any>;
}
