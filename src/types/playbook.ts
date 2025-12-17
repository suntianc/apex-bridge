/**
 * Playbook核心数据模型
 * 基于ACE架构L2战略层的战略手册实现
 */

import type { StrategicLearning } from '../services/AceStrategyManager';

export type PlaybookType =
  | 'growth'           // 增长类
  | 'crisis'           // 危机响应类
  | 'negotiation'      // 谈判类
  | 'problem_solving'  // 问题解决类
  | 'product_launch'   // 产品发布类
  | 'customer_success'; // 客户成功类

export interface PlaybookTrigger {
  type: 'event' | 'state' | 'pattern';
  condition: string;        // 触发条件描述
  threshold?: number;       // 阈值（如成功率 > 80%）
  contextPattern?: string;  // 上下文模式匹配
}

export interface PlaybookAction {
  step: number;
  description: string;
  expectedOutcome: string;
  resources?: string[];     // 所需资源（工具、技能等）
  fallbackStrategy?: string; // 备用策略
}

export interface PlaybookContext {
  domain: string;           // 应用领域
  scenario: string;         // 具体场景
  complexity: 'low' | 'medium' | 'high';
  stakeholders: string[];   // 涉及角色
}

export interface PlaybookMetrics {
  successRate: number;      // 成功率
  usageCount: number;       // 使用次数
  averageOutcome: number;   // 平均效果评分 (1-10)
  lastUsed: number;         // 最后使用时间
  timeToResolution: number; // 平均解决时间（毫秒）
  userSatisfaction: number; // 用户满意度 (1-10)
}

export interface StrategicPlaybook {
  id: string;

  // 基本信息
  name: string;
  description: string;
  type: PlaybookType;
  version: string;
  status: 'active' | 'deprecated' | 'archived' | 'testing';

  // 核心组件
  context: PlaybookContext;
  trigger: PlaybookTrigger;
  actions: PlaybookAction[];

  // 知识来源
  sourceLearningIds: string[]; // 来源的StrategicLearning IDs
  sourceTrajectoryIds?: string[]; // 来源的Trajectory IDs（批量提取使用）
  createdAt: number;
  lastUpdated: number;
  lastOptimized: number;

  // 性能指标
  metrics: PlaybookMetrics;

  // 版本控制
  parentId?: string;        // 父版本ID
  optimizationCount: number; // 优化次数

  // 元数据
  tags: string[];
  author: string;
  reviewers: string[];
}

/**
 * 从战略学习提炼Playbook的请求
 */
export interface PlaybookExtractionRequest {
  learningId: string;
  minSuccessRate?: number;      // 最低成功率阈值
  minUsageCount?: number;       // 最少使用次数
  contextSimilarity?: number;   // 上下文相似度阈值 (0-1)
}

/**
 * Playbook匹配结果
 */
export interface PlaybookMatch {
  playbook: StrategicPlaybook;
  matchScore: number;           // 匹配分数 (0-1)
  matchReasons: string[];       // 匹配原因
  applicableSteps: number[];    // 适用的步骤
}

/**
 * Playbook执行记录
 */
export interface PlaybookExecution {
  playbookId: string;
  sessionId: string;
  startedAt: number;
  completedAt?: number;
  outcome: 'success' | 'failure' | 'partial' | 'abandoned';
  actualSteps: number;          // 实际执行步骤数
  totalSteps: number;           // 总步骤数
  notes: string;                // 执行备注
  userFeedback?: {
    rating: number;             // 1-10评分
    comments: string;
  };
}

/**
 * Playbook优化建议
 */
export interface PlaybookOptimization {
  playbookId: string;
  type: 'trigger_refinement' | 'action_update' | 'context_expansion' | 'merge' | 'split';
  suggestion: string;
  rationale: string;
  expectedImprovement: {
    successRateDelta: number;
    usageIncreaseEstimate: number;
  };
  confidence: number;           // 建议置信度 (0-1)
}

/**
 * Playbook推荐引擎配置
 */
export interface PlaybookRecommendationConfig {
  maxRecommendations: number;
  minMatchScore: number;
  considerMetrics: boolean;
  considerRecency: boolean;
  considerSimilarity: boolean;
}

// ========== Stage 2: Generator 批量升级类型 ==========

/**
 * Trajectory 聚类结果
 */
export interface TrajectoryCluster {
  cluster_id: string;
  trajectories: any[];  // Trajectory from ace-core.d.ts
  common_keywords: string[];
  common_tools: string[];
  representative_input: string;  // 代表性用户输入
  confidence: number;  // 0-1，基于簇内相似度
}

/**
 * 批量提取配置
 */
export interface BatchExtractionOptions {
  minClusterSize: number;  // 最小簇大小（默认 3）
  minSimilarity: number;   // 最小相似度（默认 0.7）
  maxClusters: number;     // 最大簇数量（默认 10）
  lookbackDays: number;    // 回溯天数（默认 7）
}
