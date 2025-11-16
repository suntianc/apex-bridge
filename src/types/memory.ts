/**
 * 记忆系统类型定义
 * 统一的记忆服务接口，支持可插拔实现
 */

import { Emotion } from './personality';

/**
 * 记忆对象
 */
export interface Memory {
  id?: string;              // 记忆ID（可选，由服务生成）
  content: string;         // 记忆内容
  userId?: string;          // 用户ID（可选）
  timestamp?: number;       // 时间戳（可选，默认当前时间）
  metadata?: {
    source?: string;        // 来源（如"chat", "diary"）
    tags?: string[];        // 标签
    importance?: number;   // 重要性评分（0-1）
    [key: string]: any;    // 其他元数据
  };
}

/**
 * 记忆检索上下文
 */
export interface MemoryContext {
  userId?: string;         // 用户ID
  knowledgeBase?: string;  // 知识库名称（RAG模式）
  limit?: number;          // 返回结果数量限制（默认: 10）
  threshold?: number;      // 相似度阈值（0-1，默认: 0.5）
  tags?: string[];         // 过滤标签
}

/**
 * 偏好信息（用于learnPreference）
 */
export interface Preference {
  type: string;            // 偏好类型（如"movie_genre", "food_preference"）
  value: any;              // 偏好值
  confidence?: number;     // 置信度（0-1）
  context?: string;        // 上下文信息
}

/**
 * 时间线事件（用于buildTimeline）
 */
export interface TimelineEvent {
  id: string;
  type: string;            // 事件类型（如"chat", "emotion", "preference"）
  content: string;         // 事件内容
  timestamp: number;        // 时间戳
  metadata?: {
    [key: string]: any;
  };
}

/**
 * 关系类型
 */
export type RelationshipType = 'family' | 'friend' | 'colleague' | 'other';

/**
 * 关系信息
 */
export interface Relationship {
  type: RelationshipType;  // 关系类型
  name: string;            // 姓名（必需）
  birthday?: string;       // 生日（可选，格式：YYYY-MM-DD 或 MM-DD）
  anniversary?: string;    // 纪念日（可选，格式：YYYY-MM-DD 或 MM-DD）
  contact?: {              // 联系方式（可选）
    phone?: string;
    email?: string;
    address?: string;
  };
  notes?: string;          // 备注（可选）
}

/**
 * 存储的关系（包含ID和时间戳）
 */
export interface StoredRelationship extends Relationship {
  id: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 关系提醒信息
 */
export interface RelationshipReminder {
  relationshipId: string;
  relationshipName: string;
  eventType: 'birthday' | 'anniversary';
  eventDate: string;
  daysUntil: number;
}

/**
 * 统一的记忆服务接口
 * 
 * 核心方法（必需）:
 * - save(): 保存记忆
 * - recall(): 检索记忆
 * 
 * 扩展方法（可选）:
 * - recordEmotion(): 记录情感
 * - learnPreference(): 学习偏好
 * - buildTimeline(): 构建时间线
 */
export interface IMemoryService {
  /**
   * 保存记忆
   * @param memory - 记忆对象
   */
  save(memory: Memory): Promise<void>;
  
  /**
   * 检索记忆
   * @param query - 检索查询文本
   * @param context - 检索上下文
   * @returns 相关记忆数组
   */
  recall(query: string, context?: MemoryContext): Promise<Memory[]>;
  
  /**
   * 记录情感（可选方法）
   * @param userId - 用户ID
   * @param emotion - 情感信息
   * @param context - 上下文信息
   */
  recordEmotion?(userId: string, emotion: Emotion, context: string): Promise<void>;
  
  /**
   * 学习偏好（可选方法）
   * @param userId - 用户ID
   * @param preference - 偏好信息
   */
  learnPreference?(userId: string, preference: Preference): Promise<void>;
  
  /**
   * 构建时间线（可选方法）
   * @param userId - 用户ID
   * @param days - 时间范围（天数）
   * @returns 时间线事件数组
   */
  buildTimeline?(userId: string, days: number): Promise<TimelineEvent[]>;
}

/**
 * 记忆服务配置
 */
export interface MemoryServiceConfig {
  type: 'rag' | 'memory';   // 服务类型
  ragService?: any;          // RAG服务实例（rag模式）
  remoteUrl?: string;        // 远程服务URL（memory模式，后续实现）
}

/**
 * 记忆写入建议
 * 用于Skills执行结果中建议写入记忆系统的内容
 */
export interface MemoryWriteSuggestion {
  /** 记忆所有者类型 */
  ownerType: 'user' | 'household' | 'task' | 'group';
  /** 记忆所有者ID */
  ownerId: string;
  /** 记忆类型 */
  type: 'preference' | 'fact' | 'event' | 'summary';
  /** 重要性评分（1-5） */
  importance: number;
  /** 记忆内容 */
  content: string;
  /** 可选的元数据 */
  metadata?: Record<string, any>;
}

/**
 * 步骤追踪
 * 用于追踪Skills执行过程中的中间步骤，支持调试和可观测性
 */
export interface StepTrace {
  /** 步骤唯一标识符 */
  stepId: string;
  /** 步骤名称（人类可读） */
  stepName: string;
  /** 步骤输入数据 */
  input: any;
  /** 步骤输出数据 */
  output: any;
  /** 步骤执行耗时（毫秒） */
  duration: number;
  /** 步骤执行错误（如果有） */
  error?: Error;
  /** 步骤执行时间戳（可选） */
  timestamp?: number;
}

/**
 * 语义记忆检索选项（第二阶段实现）
 * 用于检索语义相关的记忆
 */
export type EmbeddingVector = number[];

/**
 * 语义记忆元数据
 */
export interface SemanticMemoryMetadata {
  source?: string;
  tags?: string[];
  importance?: number;
  [key: string]: any;
}

/**
 * 语义记忆记录
 */
export interface SemanticMemoryRecord {
  id?: string;
  userId: string;
  householdId?: string;
  personaId?: string;
  content: string;
  summary?: string;
  embedding: EmbeddingVector;
  importance?: number; // 0-1
  metadata?: SemanticMemoryMetadata;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * 语义记忆查询窗口
 */
export interface SemanticMemoryTimeWindow {
  from?: number;
  to?: number;
  lastDays?: number;
}

/**
 * 语义记忆查询参数
 */
export interface SemanticMemoryQuery {
  vector: EmbeddingVector;
  topK?: number;
  minSimilarity?: number;
  userId?: string;
  householdId?: string;
  personaId?: string;
  timeWindow?: SemanticMemoryTimeWindow;
  includeDiagnostics?: boolean;
}

/**
 * 语义记忆检索结果
 */
export interface SemanticMemoryResult {
  id: string;
  userId: string;
  householdId?: string;
  personaId?: string;
  content: string;
  summary?: string;
  metadata?: SemanticMemoryMetadata;
  similarity: number;
  embedding?: EmbeddingVector;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * 语义记忆检索诊断信息
 */
export interface SemanticMemoryDiagnostics {
  totalCandidates: number;
  filteredByContext: number;
  filteredByThreshold: number;
  returned: number;
  durationMs?: number;
}

/**
 * 情景记忆元数据
 */
export interface EpisodicMemoryMetadata {
  source?: string;
  location?: string;
  tags?: string[];
  importance?: number;
  [key: string]: any;
}

export type EpisodicEventType =
  | 'conversation'
  | 'task'
  | 'reminder'
  | 'emotion'
  | 'preference'
  | 'custom';

/**
 * 情景记忆事件（写入）
 */
export interface EpisodicMemoryEvent {
  id?: string;
  userId: string;
  householdId?: string;
  personaId?: string;
  eventType: EpisodicEventType;
  content: string;
  context?: string;
  importance?: number;
  timestamp: number;
  metadata?: EpisodicMemoryMetadata;
}

/**
 * 时间窗口定义
 */
export interface TimelineWindow {
  from?: number;
  to?: number;
  lastDays?: number;
}

/**
 * 情景记忆查询
 */
export interface EpisodicMemoryQuery {
  userId?: string;
  householdId?: string;
  personaId?: string;
  eventTypes?: EpisodicEventType[];
  topK?: number;
  window?: TimelineWindow;
  includeDiagnostics?: boolean;
}

/**
 * 情景记忆结果
 */
export interface EpisodicMemoryResult {
  id: string;
  userId: string;
  householdId?: string;
  personaId?: string;
  eventType: EpisodicEventType;
  content: string;
  context?: string;
  importance?: number;
  timestamp: number;
  metadata?: EpisodicMemoryMetadata;
}

export interface EpisodicMemoryDiagnostics {
  totalEvents: number;
  filteredByContext: number;
  filteredByWindow: number;
  returned: number;
  durationMs?: number;
}

export interface EpisodicMemorySummary {
  earliest: number | null;
  latest: number | null;
  eventTypes: Record<string, number>;
  total: number;
}

export interface EpisodicMemoryOptions {
  maxEventsPerUser?: number;
  retentionMs?: number;
  defaultWindowDays?: number;
}

export interface EpisodicTimelineDiagnostics {
  segmentId?: string;
  segmentCount?: number;
  retentionMs?: number;
  latestTimestamp?: number;
  storeType?: string;
  timelineLagMs?: number;
}

export interface MemoryConflictCandidate {
  id?: string;
  userId: string;
  personaId?: string;
  householdId?: string;
  content: string;
  embedding?: EmbeddingVector;
  keywords?: string[];
  timestamp?: number;
  importance?: number;
  source?: string;
}

export type ConflictSignalType = 'semantic' | 'keyword' | 'time' | 'importance';

export interface ConflictSignal {
  type: ConflictSignalType;
  score: number;
  targetId?: string;
  details?: Record<string, any>;
}

export interface ConflictDetectionOptions {
  semanticThreshold?: number;
  keywordOverlapThreshold?: number;
  timeWindowMs?: number;
  importanceDelta?: number;
}

export interface ConflictDetectionResult {
  candidate: MemoryConflictCandidate;
  conflicts: ConflictSignal[];
  matchedRecords: MemoryConflictCandidate[];
}

/**
 * 仲裁动作类型
 */
export type ArbitrationAction = 'keep' | 'merge' | 'reject';

/**
 * 仲裁结果
 */
export interface ArbitrationResult {
  action: ArbitrationAction;
  winner?: MemoryConflictCandidate;
  loser?: MemoryConflictCandidate;
  reason: string;
  confidence?: number;
  factors?: Record<string, number>;
}

/**
 * 仲裁策略配置
 */
export interface ArbitrationOptions {
  /** 优先基于重要性评分（默认: true） */
  priorityImportance?: boolean;
  /** 优先基于时间戳（默认: true） */
  priorityRecency?: boolean;
  /** 优先基于来源类型（默认: true） */
  prioritySource?: boolean;
  /** 多因素综合评分权重（默认: { importance: 0.4, recency: 0.3, source: 0.2, semantic: 0.1 }） */
  factorWeights?: {
    importance?: number;
    recency?: number;
    source?: number;
    semantic?: number;
  };
  /** 来源优先级映射（source -> priority，数值越大优先级越高） */
  sourcePriority?: Record<string, number>;
  /** 是否允许合并（默认: true） */
  allowMerge?: boolean;
  /** 合并阈值（综合评分差异 < 阈值时合并，默认: 0.2） */
  mergeThreshold?: number;
  /** 默认策略（当所有策略都无法决定时，默认: 'keep-candidate'） */
  defaultStrategy?: 'keep-candidate' | 'keep-existing' | 'reject';
}

/**
 * 内容合并策略
 */
export type ContentMergeStrategy = 'concatenate' | 'summarize' | 'replace' | 'smart';

/**
 * 元数据合并策略
 */
export interface MetadataMergeStrategy {
  /** 重要性合并策略：'max' | 'average' | 'boost' */
  importance?: 'max' | 'average' | 'boost';
  /** 时间戳合并策略：'max' | 'min' | 'average' */
  timestamp?: 'max' | 'min' | 'average';
  /** 来源合并策略：'prefer-higher' | 'combine' */
  source?: 'prefer-higher' | 'combine';
  /** 关键词合并策略：'union' | 'intersection' | 'prefer-more' */
  keywords?: 'union' | 'intersection' | 'prefer-more';
}

/**
 * 合并选项
 */
export interface MergeOptions {
  /** 内容合并策略（默认: 'smart'） */
  contentStrategy?: ContentMergeStrategy;
  /** 元数据合并策略 */
  metadataStrategy?: MetadataMergeStrategy;
  /** 重要性提升幅度（默认: 0.1，仅在 importance='boost' 时生效） */
  importanceBoost?: number;
  /** 是否去重（默认: true） */
  deduplicate?: boolean;
  /** 去重相似度阈值（默认: 0.8） */
  deduplicationThreshold?: number;
  /** 是否保留合并历史（默认: true） */
  preserveHistory?: boolean;
}

/**
 * 合并结果
 */
export interface MergeResult {
  /** 合并后的记忆 */
  merged: MemoryConflictCandidate;
  /** 合并统计信息 */
  statistics?: {
    contentLength?: number;
    keywordsCount?: number;
    importanceDelta?: number;
    deduplicatedCount?: number;
  };
}

/**
 * 合并规则配置（完整配置，包含仲裁和合并选项）
 */
export interface MergeRuleConfig {
  /** 规则名称 */
  name: string;
  /** 规则描述 */
  description?: string;
  /** 继承的规则名称（可选） */
  extends?: string;
  /** 仲裁选项 */
  arbitration?: ArbitrationOptions;
  /** 合并选项 */
  merge?: MergeOptions;
  /** 规则优先级（数值越大优先级越高，默认: 0） */
  priority?: number;
  /** 规则是否启用（默认: true） */
  enabled?: boolean;
  /** 规则匹配条件（可选，用于条件规则） */
  conditions?: {
    /** 匹配的用户ID（可选） */
    userId?: string | string[];
    /** 匹配的人格ID（可选） */
    personaId?: string | string[];
    /** 匹配的来源类型（可选） */
    source?: string | string[];
    /** 匹配的重要性范围（可选） */
    importanceRange?: { min?: number; max?: number };
  };
}

/**
 * 规则配置集合
 */
export interface MergeRuleRegistry {
  /** 规则映射（name -> config） */
  rules: Map<string, MergeRuleConfig>;
  /** 默认规则名称 */
  defaultRule?: string;
  /** 规则版本（用于变更追踪） */
  version?: number;
  /** 最后更新时间 */
  lastUpdated?: number;
}

/**
 * 记忆注入配置（用于Chat Pipeline）
 */
export interface MemoryInjectionConfig {
  /** 是否注入UserProfile（默认: true） */
  includeUserProfile?: boolean;
  /** 是否注入HouseholdProfile（默认: true） */
  includeHouseholdProfile?: boolean;
  /** 是否注入Session Memory（默认: true） */
  includeSessionMemory?: boolean;
  /** Session Memory消息数量限制（默认: 50） */
  sessionMemoryLimit?: number;
  /** 是否预留Semantic Memory位置（默认: true，第二阶段实现） */
  reserveSemanticMemory?: boolean;
  /** 是否预留Episodic Memory位置（默认: true，第二阶段实现） */
  reserveEpisodicMemory?: boolean;
}

