/**
 * PlaybookMatcher 类型定义
 *
 * 包含 Playbook 推荐系统所有核心类型定义
 */

// 导入核心类型
import type {
  StrategicPlaybook,
  PlaybookContext,
  PlaybookMetrics,
  PlaybookAction,
  TypeVocabulary,
  TypeSimilarity,
  GuidanceStep,
} from '../../core/playbook/types';

// ==================== 匹配上下文 ====================

/**
 * Playbook 匹配上下文
 */
export interface MatchingContext {
  /** 用户查询 */
  userQuery: string;
  /** 可选的会话历史 */
  sessionHistory?: string[];
  /** 可选的域上下文 */
  domain?: string;
  /** 可选的场景上下文 */
  scenario?: string;
  /** 可选的复杂度偏好 */
  complexity?: 'low' | 'medium' | 'high';
  /** 匹配的元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 遗留匹配上下文（兼容性）
 */
export interface LegacyMatchingContext {
  userQuery: string;
  sessionHistory?: string[];
  currentState?: string;
  userProfile?: {
    userId: string;
    preferences?: Record<string, unknown>;
    pastSuccessPatterns?: string[];
  };
  constraints?: {
    maxSteps?: number;
    timeLimit?: number;
    requiredResources?: string[];
  };
}

// ==================== 匹配结果 ====================

/**
 * Playbook 匹配结果
 */
export interface PlaybookMatch {
  /** 匹配的 playbook */
  playbook: StrategicPlaybook;
  /** 匹配分数 [0-1] */
  matchScore: number;
  /** 匹配原因列表 */
  matchReasons: string[];
  /** 适用的步骤索引 */
  applicableSteps: number[];
  /** 每个标签的匹配分数（可选） */
  tagScores?: Array<{
    tag: string;
    score: number;
    matchType?: 'exact' | 'similar' | 'cooccurrence';
  }>;
}

/**
 * 匹配类型枚举
 */
export enum MatchType {
  EXACT = 'exact',
  SIMILAR = 'similar',
  RELATED = 'related',
  DYNAMIC = 'dynamic',
  RECOMMENDED = 'recommended',
}

/**
 * 匹配结果排序选项
 */
export interface MatchSortingOptions {
  /** 排序字段 */
  field: 'score' | 'confidence' | 'relevance';
  /** 排序方向 */
  order: 'asc' | 'desc';
}

// ==================== 推荐配置 ====================

/**
 * Playbook 推荐配置
 */
export interface PlaybookRecommendationConfig {
  /** 最大返回数量 */
  maxRecommendations?: number;
  /** 最小分数阈值 */
  minMatchScore?: number;
  /** 是否使用动态类型匹配 */
  useDynamicTypes?: boolean;
  /** 是否使用相似度匹配 */
  useSimilarityMatching?: boolean;
  /** 相似度阈值 */
  similarityThreshold?: number;
  /** 类型信号权重 */
  typeSignalWeight?: number;
  /** 相似度权重 */
  similarityWeight?: number;
}

/**
 * 默认配置
 */
export const DEFAULT_RECOMMENDATION_CONFIG: PlaybookRecommendationConfig = {
  maxRecommendations: 5,
  minMatchScore: 0.5,
  useDynamicTypes: false,
  useSimilarityMatching: true,
  similarityThreshold: 0.7,
  typeSignalWeight: 0.5,
  similarityWeight: 0.3,
};

// ==================== 序列推荐 ====================

/**
 * 序列推荐结果
 */
export interface SequenceResult {
  /** 推荐序列 */
  sequence: PlaybookMatch[];
  /** 执行顺序理由 */
  rationale: string;
  /** 估计成功率 */
  estimatedSuccessRate: number;
}

/**
 * 依赖节点
 */
export interface DependencyNode {
  /** Playbook ID */
  playbookId: string;
  /** 层级 */
  level: number;
  /** 依赖数量 */
  dependencyCount: number;
}

/**
 * 依赖边
 */
export interface DependencyEdge {
  /** 源 Playbook ID */
  from: string;
  /** 目标 Playbook ID */
  to: string;
  /** 依赖类型 */
  type: DependencyType;
}

/**
 * 依赖类型枚举
 */
export enum DependencyType {
  PREREQUISITE = 'prerequisite',
  SEQUENTIAL = 'sequential',
  ALTERNATIVE = 'alternative',
  ENHANCES = 'enhances',
}

/**
 * 依赖关系图
 */
export interface DependencyGraph {
  /** 节点列表 */
  nodes: DependencyNode[];
  /** 边列表 */
  edges: DependencyEdge[];
}

// ==================== 动态类型匹配 ====================

/**
 * 类型信号
 */
export interface TypeSignal {
  /** 类型标签名 */
  tag: string;
  /** 信号强度 [0-1] */
  strength: number;
  /** 匹配的关键词 */
  matchedKeywords: string[];
}

/**
 * 类型匹配配置
 */
export interface TypeMatchingConfig {
  /** 启用类型推断 */
  enableInference: boolean;
  /** 最大推断深度 */
  maxInferenceDepth: number;
  /** 类型匹配阈值 */
  threshold: number;
}

// ==================== 知识库维护 ====================

/**
 * 知识库维护结果
 */
export interface CuratorResult {
  /** 新增的 playbook 数量 */
  addedCount: number;
  /** 合并的 playbook 数量 */
  mergedCount: number;
  /** 删除的 playbook 数量 */
  deletedCount: number;
  /** 发现的重复项 */
  duplicates: DuplicateInfo[];
  /** 操作详情 */
  details: string[];
}

/**
 * 重复信息
 */
export interface DuplicateInfo {
  /** Playbook ID */
  playbookId: string;
  /** 重复的 playbook ID */
  duplicateId: string;
  /** 相似度 */
  similarity: number;
  /** 建议操作 */
  suggestedAction: 'keep' | 'merge' | 'delete';
}

/**
 * 归档候选
 */
export interface ArchiveCandidate {
  /** Playbook */
  playbook: StrategicPlaybook;
  /** 归档原因 */
  reason: string;
  /** 距离上次使用天数 */
  days_since_last_used: number;
  /** 成功率 */
  success_rate: number;
}

// ==================== 工具检索结果 ====================

/**
 * 工具检索结果
 */
export interface ToolRetrievalResult {
  /** 工具/技能 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 相似度分数 */
  score: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

// ==================== 接口定义 ====================

/**
 * PlaybookMatcher 主接口
 */
export interface IPlaybookMatcher {
  /**
   * 匹配 Playbook
   */
  matchPlaybooks(
    context: MatchingContext,
    config?: PlaybookRecommendationConfig
  ): Promise<PlaybookMatch[]>;

  /**
   * 查找相似的 Playbook
   */
  findSimilarPlaybooks(playbookId: string, limit?: number): Promise<PlaybookMatch[]>;

  /**
   * 推荐 Playbook 序列
   */
  recommendPlaybookSequence(
    context: MatchingContext,
    targetOutcome: string
  ): Promise<SequenceResult>;
}

/**
 * 评分计算器接口
 */
export interface IScoreCalculator {
  /**
   * 计算 Playbook 匹配分数
   */
  calculateMatchScore(
    playbook: StrategicPlaybook,
    context: LegacyMatchingContext
  ): Promise<PlaybookMatch>;

  /**
   * 计算相似度分数
   */
  calculateSimilarityScore(
    playbook: StrategicPlaybook,
    target: StrategicPlaybook
  ): Promise<PlaybookMatch>;

  /**
   * 计算多标签匹配分数
   */
  calculateMultiTagMatchScore(
    playbook: StrategicPlaybook,
    context: MatchingContext,
    typeSignals: Map<string, number>
  ): Promise<PlaybookMatch>;
}

/**
 * 动态类型匹配器接口
 */
export interface IDynamicTypeMatcher {
  /**
   * 匹配 Playbook（动态类型）
   */
  matchPlaybooksDynamic(
    context: LegacyMatchingContext,
    config: PlaybookRecommendationConfig
  ): Promise<PlaybookMatch[]>;

  /**
   * 提取类型信号
   */
  extractTypeSignals(
    query: string,
    typeVocabulary: TypeVocabulary[]
  ): Promise<Map<string, number>>;

  /**
   * 计算类型兼容性
   */
  calculateTypeCompatibility(sourceType: string, targetType: string): Promise<number>;
}

/**
 * 序列推荐器接口
 */
export interface ISequenceRecommender {
  /**
   * 推荐执行序列
   */
  recommendSequence(
    context: MatchingContext,
    targetOutcome: string,
    matches: PlaybookMatch[]
  ): Promise<SequenceResult>;

  /**
   * 构建依赖关系图
   */
  buildDependencyGraph(playbookIds: string[]): Promise<DependencyGraph>;

  /**
   * 计算最优执行顺序
   */
  calculateOptimalOrder(
    graph: DependencyGraph,
    targetOutcome: string
  ): Promise<string[]>;
}

/**
 * Playbook Curator 接口
 */
export interface IPlaybookCurator {
  /**
   * 维护知识库
   */
  maintainPlaybookKnowledgeBase(): Promise<{ merged: number; archived: number }>;

  /**
   * 查找重复项
   */
  findDuplicates(threshold?: number): Promise<DuplicateInfo[]>;

  /**
   * 合并重复的 Playbook
   */
  mergePlaybooks(
    pb1: StrategicPlaybook,
    pb2: StrategicPlaybook
  ): Promise<void>;

  /**
   * 归档不活跃的 Playbook
   */
  archiveInactivePlaybooks(daysInactive: number): Promise<number>;
}

// ==================== 从现有类型文件导入 ====================

// 重新导出 core/playbook/types 中的类型以保持一致性
export type {
  StrategicPlaybook,
  PlaybookContext,
  PlaybookMetrics,
  PlaybookAction,
  TypeVocabulary,
  TypeSimilarity,
  GuidanceStep,
} from '../../core/playbook/types';
