/**
 * AceStrategyManager 模块类型定义
 *
 * 包含 ACE 战略引擎所有核心类型定义：
 * - 战略上下文
 * - 战略学习
 * - Playbook 提炼
 * - 内存管理
 * - 服务状态
 */

// ==================== 战略上下文 ====================

/**
 * 战略上下文
 */
export interface StrategicContext {
  /** 用户 ID */
  userId: string;
  /** 战略目标 */
  goals: string[];
  /** 用户偏好 */
  preferences: Record<string, unknown>;
  /** 过去的战略学习 */
  pastStrategies: StrategicLearning[];
  /** 最后更新时间戳 */
  lastUpdated: number;
}

/**
 * 战略学习结果
 */
export interface LearningOutcome {
  /** 会话 ID */
  sessionId: string;
  /** 用户 ID */
  userId: string;
  /** 摘要 */
  summary: string;
  /** 学习要点 */
  learnings: string[];
  /** 成功/失败/部分成功 */
  outcome: 'success' | 'failure' | 'partial';
  /** 时间戳 */
  timestamp: number;
}

/**
 * 战略学习
 */
export interface StrategicLearning {
  /** 学习 ID */
  id: string;
  /** 摘要 */
  summary: string;
  /** 学习要点 */
  learnings: string[];
  /** 结果 */
  outcome: 'success' | 'failure' | 'partial';
  /** 时间戳 */
  timestamp: number;
  /** 上下文（可选） */
  context?: string;
}

// ==================== 世界模型更新 ====================

/**
 * 世界模型更新
 */
export interface WorldModelUpdate {
  /** 领域 */
  domain: string;
  /** 知识 */
  knowledge: string;
  /** 置信度 */
  confidence: number;
  /** 来源 */
  source: string;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 世界模型统计
 */
export interface WorldModelStats {
  /** 总更新数 */
  totalUpdates: number;
  /** 领域分布 */
  domainDistribution: Record<string, number>;
  /** 平均置信度 */
  averageConfidence: number;
}

// ==================== Playbook 提炼 ====================

/**
 * 战略 Playbook（复用 core/playbook/types 中的 StrategicPlaybook）
 */
export type StrategicPlaybook = {
  /** 唯一标识符 */
  id: string;
  /** Playbook 名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 类型 */
  type: string;
  /** 版本 */
  version: string;
  /** 状态 */
  status: 'active' | 'archived' | 'deprecated' | 'testing';
  /** 上下文 */
  context: {
    /** 应用领域 */
    domain: string;
    /** 场景 */
    scenario: string;
    /** 复杂度 */
    complexity: 'low' | 'medium' | 'high';
    /** 利益相关者 */
    stakeholders: string[];
  };
  /** 触发器 */
  trigger: {
    /** 触发类型 */
    type: string;
    /** 触发条件 */
    condition: string;
  };
  /** 操作步骤 */
  actions: Array<{
    /** 步骤号 */
    step: number;
    /** 描述 */
    description: string;
    /** 预期结果 */
    expectedOutcome: string;
    /** 资源（可选） */
    resources?: string[];
  }>;
  /** 来源学习 ID */
  sourceLearningIds: string[];
  /** 创建时间戳 */
  createdAt: number;
  /** 最后更新时间戳 */
  lastUpdated: number;
  /** 最后优化时间戳 */
  lastOptimized: number;
  /** 性能指标 */
  metrics: {
    /** 使用次数 */
    usageCount: number;
    /** 成功率 [0-1] */
    successRate: number;
    /** 平均满意度 [0-1] */
    avgSatisfaction: number;
    /** 用户满意度 [0-10] */
    userSatisfaction?: number;
    /** 最后使用时间戳 */
    lastUsed: number;
    /** 平均执行时间（毫秒） */
    avgExecutionTime: number;
    /** 平均结果 [0-10] */
    averageOutcome?: number;
    /** 解决时间（毫秒） */
    timeToResolution?: number;
  };
  /** 优化次数 */
  optimizationCount: number;
  /** 父 Playbook ID（用于版本控制） */
  parentId?: string;
  /** 标签 */
  tags: string[];
  /** 作者 */
  author: string;
  /** 审核者 */
  reviewers: string[];
  /** 动态类型标签 */
  type_tags?: string[];
  /** 类型置信度分数 */
  type_confidence?: Record<string, number>;
  /** 提示模板 ID */
  prompt_template_id?: string;
  /** 指导强度级别 */
  guidance_level?: 'light' | 'medium' | 'intensive';
  /** 增强指导步骤 */
  guidance_steps?: Array<{
    /** 步骤 ID */
    id: string;
    /** 描述 */
    description: string;
    /** 预期结果（可选） */
    expected_outcome?: string;
    /** 关键点（可选） */
    key_points?: string[];
    /** 注意事项（可选） */
    cautions?: string[];
    /** 是否可选 */
    optional?: boolean;
  }>;
};

// ==================== 内存管理 ====================

/**
 * 缓存条目
 */
export interface CacheEntry<T> {
  /** 数据 */
  data: T;
  /** 创建时间 */
  createdAt: number;
  /** 过期时间 */
  expiresAt: number;
  /** 访问次数 */
  accessCount: number;
  /** 最后访问时间 */
  lastAccessedAt: number;
}

/**
 * 内存配置
 */
export interface MemoryConfig {
  /** 上下文 TTL（毫秒） */
  contextTTL: number;
  /** 世界模型 TTL（毫秒） */
  worldModelTTL: number;
  /** 战略学习 TTL（毫秒） */
  learningTTL: number;
  /** 清理间隔（毫秒） */
  cleanupInterval: number;
  /** 最大缓存条目数 */
  maxEntries: number;
}

/**
 * 清理统计
 */
export interface CleanupStats {
  /** 清理时间 */
  cleanedAt: Date;
  /** 移除的条目数 */
  removedCount: number;
  /** 当前缓存大小 */
  currentSize: number;
  /** 清理耗时（毫秒） */
  duration: number;
}

/**
 * 缓存统计
 */
export interface CacheStats {
  /** 缓存项数量 */
  size: number;
  /** 最大缓存大小 */
  maxSize: number;
  /** 命中次数 */
  hits: number;
  /** 未命中次数 */
  misses: number;
  /** 命中率 */
  hitRate: number;
}

// ==================== 服务状态 ====================

/**
 * 服务状态
 */
export interface ServiceStatus {
  /** 是否已初始化 */
  initialized: boolean;
  /** 缓存状态 */
  cacheStatus: {
    /** 上下文数量 */
    contextCount: number;
    /** 世界模型数量 */
    worldModelCount: number;
    /** 学习数量 */
    learningCount: number;
  };
  /** 最后清理时间（可选） */
  lastCleanup?: Date;
  /** 健康状态 */
  healthy: boolean;
}

// ==================== 检索配置 ====================

/**
 * 战略知识检索配置
 */
export interface StrategicRetrievalConfig {
  /** 最大返回数量 */
  maxResults: number;
  /** 最小相似度阈值 */
  minSimilarity: number;
  /** 启用过滤 */
  enableFiltering: boolean;
  /** 过滤条件（可选） */
  filters?: StrategicRetrievalFilter[];
}

/**
 * 战略检索过滤条件
 */
export interface StrategicRetrievalFilter {
  /** 字段名 */
  field: 'success' | 'confidence' | 'applicableScenarios';
  /** 操作符 */
  operator: 'eq' | 'gt' | 'lt' | 'contains';
  /** 值 */
  value: unknown;
}

// ==================== 匹配上下文 ====================

/**
 * Playbook 匹配上下文
 */
export interface MatchingContext {
  /** 用户查询 */
  userQuery: string;
  /** 会话历史（可选） */
  sessionHistory?: string[];
  /** 域上下文（可选） */
  domain?: string;
  /** 场景上下文（可选） */
  scenario?: string;
  /** 复杂度偏好（可选） */
  complexity?: 'low' | 'medium' | 'high';
  /** 额外元数据（可选） */
  metadata?: Record<string, unknown>;
}

/**
 * Playbook 匹配结果
 */
export interface PlaybookMatch {
  /** 匹配的 Playbook */
  playbook: StrategicPlaybook;
  /** 匹配分数 [0-1] */
  matchScore: number;
  /** 匹配原因 */
  matchReasons: string[];
  /** 适用的步骤索引 */
  applicableSteps: number[];
  /** 每个标签的匹配分数（可选） */
  tagScores?: Array<{
    /** 标签 */
    tag: string;
    /** 分数 */
    score: number;
    /** 匹配类型（可选） */
    matchType?: 'exact' | 'similar' | 'cooccurrence';
  }>;
}

// ==================== 配置常量 ====================

/**
 * AceStrategyManager 配置常量
 */
export const ACE_STRATEGY_CONFIG = {
  /** 最大上下文过期时间（毫秒）- 30天 */
  MAX_CONTEXT_AGE_MS: 30 * 24 * 60 * 60 * 1000,
  /** 世界模型更新最大条目数 */
  MAX_WORLD_MODEL_UPDATES: 500,
  /** 清理间隔（毫秒）- 1小时 */
  CLEANUP_INTERVAL_MS: 60 * 60 * 1000,
  /** 最大战略上下文数 */
  MAX_STRATEGIC_CONTEXTS: 1000,
  /** Playbook 缓存 TTL（毫秒）- 24小时 */
  PLAYBOOK_CACHE_TTL: 24 * 60 * 60 * 1000,
  /** 最大 Playbook 数 */
  MAX_PLAYBOOKS_PER_USER: 1000,
  /** 最低成功率阈值 */
  MIN_SUCCESS_RATE: 0.6,
} as const;
