/**
 * 检索相关常量定义
 *
 * 集中管理向量检索相关的魔法数字，提高代码可维护性
 */

// ==================== 向量检索常量 ====================

export const VECTOR_RETRIEVAL = {
  /** 默认向量维度 */
  DEFAULT_DIMENSIONS: 384,

  /** 向量搜索相似度阈值 (过滤噪声) */
  SIMILARITY_THRESHOLD: 0.4,

  /** 相关 Skills 检索阈值 (降低以提高召回率) */
  RELEVANT_SKILLS_THRESHOLD: 0.4,

  /** 向量搜索返回数量限制 */
  SEARCH_LIMIT: 10,

  /** 单次向量搜索的最大结果数 */
  MAX_RESULTS: 10,

  /** 向量索引分区数 */
  INDEX_PARTITIONS: 64,

  /** 向量子向量数 */
  INDEX_SUB_VECTORS: 8,
} as const;

// ==================== 缓存常量 ====================

export const CACHE = {
  /** 默认缓存大小 */
  DEFAULT_SIZE: 1000,

  /** Skills 缓存 TTL (毫秒, 5分钟) */
  SKILL_TTL_MS: 5 * 60 * 1000,

  /** 适配器缓存 TTL (毫秒, 5分钟) */
  ADAPTER_TTL_MS: 5 * 60 * 1000,
} as const;

// ==================== 超时常量 (毫秒) ====================

export const RETRIEVAL_TIMEOUT = {
  /** 默认超时 */
  DEFAULT: 30000,

  /** 工具执行超时 */
  TOOL_EXECUTION: 30000,

  /** LLM 请求超时 */
  LLM_REQUEST: 60000,

  /** Skills 超时 */
  SKILL: 30000,

  /** MCP 工具超时 */
  MCP: 60000,

  /** 内置工具超时 */
  BUILTIN: 10000,

  /** 文件读取超时 */
  FILE_READ: 15000,

  /** 文件写入超时 */
  FILE_WRITE: 15000,

  /** 向量搜索超时 */
  VECTOR_SEARCH: 20000,

  /** 网络搜索超时 */
  WEB_SEARCH: 30000,

  /** 清理定时器间隔 */
  CLEANUP_INTERVAL: 60000,

  /** 技能自动注销时间 (毫秒, 5分钟) */
  SKILL_AUTO_UNREGISTER: 5 * 60 * 1000,
} as const;

// ==================== 导出辅助函数 ====================

/**
 * 获取超时时间
 */
export function getRetrievalTimeout(key: keyof typeof RETRIEVAL_TIMEOUT): number {
  return RETRIEVAL_TIMEOUT[key];
}

/**
 * 获取向量检索配置
 */
export function getVectorRetrievalConfig() {
  return {
    dimensions: VECTOR_RETRIEVAL.DEFAULT_DIMENSIONS,
    similarityThreshold: VECTOR_RETRIEVAL.SIMILARITY_THRESHOLD,
    searchLimit: VECTOR_RETRIEVAL.SEARCH_LIMIT,
  };
}
