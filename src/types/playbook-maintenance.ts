/**
 * Playbook 知识库维护类型定义
 * Stage 3: Curator 自动去重、归档和混合检索
 */

import type { StrategicPlaybook } from './playbook';

/**
 * 重复 Playbook 对
 */
export interface DuplicatePlaybookPair {
  playbook1: StrategicPlaybook;
  playbook2: StrategicPlaybook;
  similarity: number;  // 0-1
  recommendation: 'merge' | 'keep_both';
}

/**
 * 归档候选
 */
export interface ArchiveCandidate {
  playbook: StrategicPlaybook;
  reason: string;
  days_since_last_used: number;
  success_rate: number;
}

/**
 * 混合检索选项
 */
export interface HybridSearchOptions {
  query: string;
  limit: number;
  weights: {
    bm25: number;    // 默认 0.4
    vector: number;  // 默认 0.6
  };
  filters?: {
    tags?: string[];
    type?: string;
    status?: 'active' | 'archived';
  };
}

/**
 * 维护结果统计
 */
export interface MaintenanceResult {
  merged: number;
  archived: number;
  details?: {
    duplicatesFound?: number;
    archiveCandidatesFound?: number;
    errors?: string[];
  };
}

/**
 * BM25 文档索引项
 */
export interface BM25IndexEntry {
  terms: Map<string, number>;
  length: number;
}

/**
 * 检索结果项
 */
export interface SearchResultItem {
  id: string;
  score: number;
}
