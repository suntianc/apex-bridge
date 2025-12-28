/**
 * Playbook System Core Type Definitions
 * ======================================
 *
 * This file contains all core type definitions for the Playbook system,
 * including type induction, vocabulary management, template system, and matching.
 *
 * Version: 1.0.0
 * Created: 2025-12-18
 */

// =============================================================================
// 1. TYPE INDUCTION ENGINE - 类型归纳引擎相关
// =============================================================================

/**
 * Configuration for the type induction engine
 * 类型归纳引擎配置
 */
export interface TypeInductionConfig {
  /** Minimum number of samples required for type induction */
  min_samples: number;

  /** Minimum similarity threshold for clustering */
  min_similarity: number;

  /** Confidence threshold for accepting induced types */
  confidence_threshold: number;

  /** Threshold for marking types as decaying */
  decay_threshold: number;

  /** Maximum number of new types to induce per cycle */
  max_new_types: number;

  /** Interval between induction cycles (in milliseconds) */
  induction_interval: number;
}

/**
 * Result of type induction from a cluster of playbooks
 * 从 Playbook 簇中归纳出的类型
 */
export interface InducedType {
  /** Unique tag name for the induced type */
  tag_name: string;

  /** Associated keywords for this type */
  keywords: string[];

  /** Confidence score [0-1] */
  confidence: number;

  /** Number of sample playbooks used for induction */
  sample_count: number;

  /** IDs of example playbooks that support this type */
  playbook_examples: string[];

  /** Rationale for why this type was induced */
  rationale: string;

  /** Source of discovery */
  discovered_from: 'historical_clustering' | 'llm_analysis' | 'manual';

  /** Timestamp of creation */
  created_at: number;
}

/**
 * Complete result of a type induction operation
 * 类型归纳操作的完整结果
 */
export interface TypeInductionResult {
  /** Newly induced types */
  induced_types: InducedType[];

  /** Tags that were merged into other tags */
  merged_types: string[];

  /** Tags that were marked as deprecated */
  deprecated_types: string[];

  /** Tag confidence updates */
  confidence_updates: Record<string, number>;
}

// =============================================================================
// 2. TYPE VOCABULARY - 类型词汇表相关
// =============================================================================

/**
 * Type vocabulary entry representing a dynamic type tag
 * 代表动态类型标签的词汇表条目
 */
export interface TypeVocabulary {
  /** Unique tag name (e.g., "rapid_iteration") */
  tag_name: string;

  /** Associated keywords */
  keywords: string[];

  /** Global confidence score [0-1] */
  confidence: number;

  /** First identification timestamp */
  first_identified: number;

  /** Number of associated playbooks */
  playbook_count: number;

  /** How this type was discovered */
  discovered_from: 'historical_clustering' | 'manual_creation' | 'llm_suggestion';

  /** Creation timestamp */
  created_at: number;

  /** Last update timestamp */
  updated_at: number;

  /** Optional metadata */
  metadata?: TypeVocabularyMetadata;
}

/**
 * Extended metadata for type vocabulary
 * 类型词汇表的扩展元数据
 */
export interface TypeVocabularyMetadata {
  /** Human-readable description of the type */
  description?: string;

  /** Usage examples */
  usage_examples?: string[];

  /** Related type tags */
  related_tags?: string[];

  /** Decay score [0-1], higher means more likely to be deprecated */
  decay_score?: number;
}

/**
 * Similarity relationship between two type tags
 * 两个类型标签之间的相似性关系
 */
export interface TypeSimilarity {
  /** First tag name */
  tag1: string;

  /** Second tag name */
  tag2: string;

  /** Similarity score [0-1] */
  similarity_score: number;

  /** Number of times these tags co-occurred */
  co_occurrence_count: number;

  /** Last update timestamp */
  last_updated: number;
}

/**
 * Evolution history for type tag changes
 * 类型标签变更的演进历史
 */
export interface TypeEvolutionHistory {
  /** Record ID */
  id: string;

  /** Type of evolution event */
  event_type: 'created' | 'merged' | 'deprecated' | 'split' | 'confidence_updated';

  /** Tag name involved in the event */
  tag_name: string;

  /** Previous state (as JSON) */
  previous_state?: any;

  /** New state (as JSON) */
  new_state?: any;

  /** Reason for the change */
  reason: string;

  /** What triggered this change */
  triggered_by: 'automatic' | 'manual' | 'llm_analysis';

  /** Event timestamp */
  created_at: number;
}

/**
 * Assignment of a type tag to a playbook
 * 类型标签到 Playbook 的分配
 */
export interface PlaybookTypeAssignment {
  /** Playbook ID */
  playbook_id: string;

  /** Type tag name */
  tag_name: string;

  /** Assignment confidence [0-1] */
  confidence: number;

  /** How this assignment was made */
  assigned_method: 'automatic' | 'manual';

  /** Assignment timestamp */
  assigned_at: number;

  /** Whether this assignment has been verified */
  verified: boolean;

  /** Verification timestamp */
  verified_at?: number;

  /** Who verified this assignment */
  verified_by?: string;
}

// =============================================================================
// 3. PLAYBOOK MODEL - Playbook 模型相关（扩展版）
// =============================================================================

/**
 * Legacy playbook type enum
 * 旧版 Playbook 类型枚举
 */
export type PlaybookType =
  | 'growth'           // 增长类
  | 'crisis'           // 危机响应类
  | 'negotiation'      // 谈判类
  | 'problem_solving'  // 问题解决类
  | 'product_launch'   // 产品发布类
  | 'customer_success'; // 客户成功类

/**
 * Individual action within a playbook
 * Playbook 中的单个动作
 */
export interface PlaybookAction {
  /** Step number */
  step: number;

  /** Action description */
  description: string;

  /** Expected outcome of this action */
  expectedOutcome: string;

  /** Required resources (optional) */
  resources?: string[];

  /** Fallback strategy (optional) */
  fallbackStrategy?: string;
}

/**
 * Context information for a playbook
 * Playbook 的上下文信息
 */
export interface PlaybookContext {
  /** Domain of application */
  domain: string;

  /** Scenario description */
  scenario: string;

  /** Complexity level */
  complexity: 'low' | 'medium' | 'high';

  /** Stakeholders involved */
  stakeholders: string[];
}

/**
 * Performance metrics for a playbook
 * Playbook 的性能指标
 */
export interface PlaybookMetrics {
  /** Number of times used */
  usageCount: number;

  /** Success rate [0-1] */
  successRate: number;

  /** Average satisfaction score [0-1] */
  avgSatisfaction: number;

  /** Average satisfaction score [0-10] - legacy field */
  userSatisfaction?: number;

  /** Last usage timestamp */
  lastUsed: number;

  /** Average execution time (ms) */
  avgExecutionTime: number;

  /** Average execution time (ms) - legacy field */
  timeToResolution?: number;

  /** Average outcome score [0-10] - legacy field */
  averageOutcome?: number;
}

/**
 * Enhanced strategic playbook with type tags
 * 带有类型标签的增强战略 Playbook
 */
export interface StrategicPlaybook {
  /** Unique identifier */
  id: string;

  /** Playbook name */
  name: string;

  /** Description */
  description: string;

  /** Playbook type */
  type: PlaybookType | string;

  /** Version string */
  version: string;

  /** Current status */
  status: 'active' | 'archived' | 'deprecated' | 'testing';

  /** Context information */
  context: PlaybookContext;

  /** Trigger configuration */
  trigger: {
    type: string;
    condition: string;
  };

  /** Action steps (deprecated: use guidance_steps instead) */
  actions: PlaybookAction[];

  /** IDs of source learning materials */
  sourceLearningIds: string[];

  /** IDs of source trajectories (for batch extraction) */
  sourceTrajectoryIds?: string[];

  /** Creation timestamp */
  createdAt: number;

  /** Last update timestamp */
  lastUpdated: number;

  /** Last optimization timestamp */
  lastOptimized: number;

  /** Performance metrics */
  metrics: PlaybookMetrics;

  /** Number of optimizations performed */
  optimizationCount: number;

  /** Parent playbook ID (for versioning) */
  parentId?: string;

  /** Legacy tags (use type_tags for new system) */
  tags: string[];

  /** Author */
  author: string;

  /** Reviewers */
  reviewers: string[];

  /** Dynamic type tags (new system) */
  type_tags?: string[];

  /** Type confidence scores */
  type_confidence?: Record<string, number>;

  /** Associated prompt template ID */
  prompt_template_id?: string;

  /** Guidance intensity level */
  guidance_level?: 'light' | 'medium' | 'intensive';

  /** Enhanced guidance steps (replaces actions) */
  guidance_steps?: GuidanceStep[];
}

/**
 * Enhanced guidance step
 * 增强的指导步骤
 */
export interface GuidanceStep {
  /** Step identifier */
  id: string;

  /** Step description */
  description: string;

  /** Expected outcome (optional) */
  expected_outcome?: string;

  /** Key points to remember */
  key_points?: string[];

  /** Important cautions */
  cautions?: string[];

  /** Whether this step is optional */
  optional?: boolean;
}

// =============================================================================
// 4. CLUSTERING ANALYSIS - 聚类分析相关
// =============================================================================

/**
 * Feature vector extracted from a playbook for clustering
 * 从 Playbook 中提取的用于聚类的特征向量
 */
export interface PlaybookFeature {
  /** Playbook ID */
  playbookId: string;

  /** Reference to the full playbook */
  playbook: StrategicPlaybook;

  /** Playbook name */
  name: string;

  /** Playbook description */
  description: string;

  /** Scenario text */
  scenario: string;

  /** Extracted keywords */
  keywords: string[];

  /** Tools used */
  tools: string[];

  /** Complexity level */
  complexity: string;

  /** Creation timestamp */
  created_at: number;
}

/**
 * Cluster of similar playbooks
 * 相似 Playbook 的簇
 */
export interface PlaybookCluster {
  /** Unique cluster ID */
  cluster_id: string;

  /** Playbooks in this cluster */
  playbooks: StrategicPlaybook[];

  /** Cluster center (feature vector) */
  center: PlaybookFeature;

  /** Sum of similarities within cluster */
  similarity_sum: number;
}

// =============================================================================
// 5. TEMPLATE MANAGEMENT - 模板管理相关
// =============================================================================

/**
 * Prompt template for playbook guidance
 * Playbook 指导的提示词模板
 */
export interface PromptTemplate {
  /** Unique template ID */
  template_id: string;

  /** Template type */
  template_type: 'guidance' | 'constraint' | 'framework' | 'example';

  /** Template name */
  name: string;

  /** Template content with variable placeholders */
  content: string;

  /** Supported variable names */
  variables: string[];

  /** Applicable type tags */
  applicable_tags: string[];

  /** Guidance intensity level */
  guidance_level?: 'light' | 'medium' | 'intensive';

  /** Creation timestamp */
  created_at: number;

  /** Last update timestamp */
  updated_at: number;

  /** Usage count */
  usage_count: number;

  /** Effectiveness score [0-1] */
  effectiveness_score?: number;

  /** Additional metadata */
  metadata?: PromptTemplateMetadata;
}

/**
 * Extended metadata for prompt templates
 * 提示词模板的扩展元数据
 */
export interface PromptTemplateMetadata {
  /** Language preference */
  language?: 'zh' | 'en';

  /** Tone of the template */
  tone?: 'professional' | 'friendly' | 'concise';

  /** Maximum content length */
  max_length?: number;
}

/**
 * Options for rendering a template
 * 模板渲染选项
 */
export interface TemplateRenderOptions {
  /** Variables to substitute */
  variables: Record<string, any>;

  /** Guidance intensity level */
  guidance_level?: 'light' | 'medium' | 'intensive';

  /** Output language */
  language?: 'zh' | 'en';

  /** Tone preference */
  tone?: 'professional' | 'friendly' | 'concise';

  /** Maximum content length */
  max_length?: number;
}

/**
 * Result of template rendering
 * 模板渲染结果
 */
export interface TemplateRenderResult {
  /** Rendered content */
  content: string;

  /** Variables that were actually used */
  variables_used: string[];

  /** Estimated token count */
  token_count: number;
}

/**
 * Effectiveness metrics for a template
 * 模板的有效性指标
 */
export interface TemplateEffectiveness {
  /** Template ID */
  template_id: string;

  /** Total usage count */
  usage_count: number;

  /** Average satisfaction score [0-1] */
  avg_satisfaction: number;

  /** Success rate [0-1] */
  success_rate: number;

  /** Average response time (ms) */
  avg_response_time: number;

  /** Last evaluation timestamp */
  last_evaluated: number;
}

// =============================================================================
// 6. MATCHING - 匹配相关
// =============================================================================

/**
 * Context for playbook matching
 * Playbook 匹配的上下文
 */
export interface MatchingContext {
  /** User's query or request */
  userQuery: string;

  /** Optional session history for context */
  sessionHistory?: string[];

  /** Optional domain context */
  domain?: string;

  /** Optional scenario context */
  scenario?: string;

  /** Optional complexity preference */
  complexity?: 'low' | 'medium' | 'high';

  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Match result for a playbook
 * Playbook 的匹配结果
 */
export interface PlaybookMatch {
  /** Matched playbook */
  playbook: StrategicPlaybook;

  /** Overall match score [0-1] */
  matchScore: number;

  /** Reasons for this match */
  matchReasons: string[];

  /** Applicable step indices */
  applicableSteps: number[];

  /** Per-tag match scores */
  tagScores?: Array<{
    tag: string;
    score: number;
    matchType?: 'exact' | 'similar' | 'cooccurrence';
  }>;
}

/**
 * Configuration for playbook recommendations
 * Playbook 推荐配置
 */
export interface PlaybookRecommendationConfig {
  /** Minimum match score threshold */
  minMatchScore: number;

  /** Maximum number of recommendations */
  maxRecommendations: number;

  /** Whether to use dynamic type matching */
  useDynamicTypes: boolean;

  /** Whether to consider similarity-based matches */
  useSimilarityMatching: boolean;

  /** Similarity threshold for semantic matching */
  similarityThreshold: number;
}

// =============================================================================
// 7. INJECTION - 注入相关
// =============================================================================

/**
 * Context for playbook injection
 * Playbook 注入的上下文
 */
export interface InjectionContext {
  /** Playbook to inject */
  playbook: StrategicPlaybook;

  /** Template being used */
  template: PromptTemplate;

  /** Rendered template content */
  rendered_content: string;

  /** Guidance intensity level */
  guidance_level: 'light' | 'medium' | 'intensive';

  /** Where to inject the guidance */
  injection_point: 'system_prompt' | 'user_message' | 'thinking_chain';
}

/**
 * Result of playbook injection
 * Playbook 注入结果
 */
export interface InjectionResult {
  /** Whether injection was successful */
  success: boolean;

  /** Content that was injected */
  injected_content: string;

  /** Whether guidance was applied */
  guidance_applied: boolean;

  /** Whether fallback was triggered */
  fallback_triggered: boolean;

  /** Reason for failure or additional info */
  reason?: string;

  /** Variables generated for injection (供 variableEngine.resolveMessages 使用) */
  variables?: Record<string, string>;
}

/**
 * Options for playbook injection
 * Playbook 注入选项
 */
export interface InjectionOptions {
  /** Guidance intensity level */
  guidance_level?: 'light' | 'medium' | 'intensive';

  /** Maximum retry attempts */
  max_retry?: number;

  /** Whether to enable fallback mechanism */
  fallback_enabled?: boolean;

  /** Preferred injection point */
  injection_point?: 'system_prompt' | 'user_message' | 'thinking_chain';
}

// =============================================================================
// 8. ADDITIONAL HELPER TYPES
// =============================================================================

/**
 * Tag score for detailed matching analysis
 * 详细匹配分析的标签分数
 */
export interface TagScore {
  /** Tag name */
  tag: string;

  /** Match score [0-1] */
  score: number;

  /** Match type */
  matchType: 'exact' | 'similar' | 'cooccurrence';
}

/**
 * Type signal extracted from user query
 * 从用户查询中提取的类型信号
 */
export interface TypeSignal {
  /** Type tag name */
  tag: string;

  /** Signal strength [0-1] */
  strength: number;

  /** Matching keywords */
  matchedKeywords: string[];
}

/**
 * Validation result for type definitions
 * 类型定义的验证结果
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;

  /** Validation errors */
  errors: string[];

  /** Validation warnings */
  warnings?: string[];
}

/**
 * Operation status for async operations
 * 异步操作的状态
 */
export interface OperationStatus {
  /** Operation ID */
  operationId: string;

  /** Current status */
  status: 'pending' | 'running' | 'completed' | 'failed';

  /** Progress percentage [0-100] */
  progress: number;

  /** Status message */
  message: string;

  /** Result (if completed) */
  result?: any;

  /** Error (if failed) */
  error?: string;

  /** Start timestamp */
  startedAt: number;

  /** End timestamp (if completed) */
  completedAt?: number;
}
