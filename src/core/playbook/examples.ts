/**
 * Playbook System - Type Usage Examples
 * =====================================
 *
 * This file demonstrates how to use the core types defined in types.ts
 * 演示如何在 types.ts 中使用定义的类型
 */

import type {
  // Type Induction Engine
  TypeInductionConfig,
  InducedType,
  TypeInductionResult,

  // Type Vocabulary
  TypeVocabulary,
  TypeSimilarity,
  PlaybookTypeAssignment,

  // Enhanced Playbook Model
  StrategicPlaybook,
  PlaybookAction,
  PlaybookContext,
  PlaybookMetrics,
  GuidanceStep,

  // Clustering Analysis
  PlaybookFeature,
  PlaybookCluster,

  // Template Management
  PromptTemplate,
  TemplateRenderOptions,
  TemplateRenderResult,
  TemplateEffectiveness,

  // Matching
  MatchingContext,
  PlaybookMatch,
  PlaybookRecommendationConfig,

  // Injection
  InjectionContext,
  InjectionResult,
  InjectionOptions
} from './types';

// =============================================================================
// Example 1: Type Induction Configuration
// =============================================================================

export const defaultTypeInductionConfig: TypeInductionConfig = {
  min_samples: 3,
  min_similarity: 0.7,
  confidence_threshold: 0.8,
  decay_threshold: 0.5,
  max_new_types: 10,
  induction_interval: 24 * 60 * 60 * 1000 // 24 hours
};

// =============================================================================
// Example 2: Enhanced Strategic Playbook
// =============================================================================

export const examplePlaybook: StrategicPlaybook = {
  id: 'pb_001',
  name: '快速迭代问题解决方法',
  description: '通过快速迭代和验证来解决问题的方法论',
  type: 'problem_solving',
  version: '1.0.0',
  status: 'active',
  context: {
    domain: 'product_development',
    scenario: '需要快速验证产品想法的场景',
    complexity: 'medium',
    stakeholders: ['产品经理', '开发团队', '用户']
  },
  trigger: {
    type: 'user_request',
    condition: '需要快速迭代的场景'
  },
  actions: [
    {
      step: 1,
      description: '定义最小可行产品(MVP)',
      expectedOutcome: '明确产品核心功能',
      resources: ['用户调研数据', '竞品分析']
    },
    {
      step: 2,
      description: '快速构建原型',
      expectedOutcome: '可测试的原型产品',
      resources: ['原型工具', '开发资源']
    }
  ],
  sourceLearningIds: ['learning_001', 'learning_002'],
  createdAt: Date.now(),
  lastUpdated: Date.now(),
  lastOptimized: Date.now(),
  metrics: {
    usageCount: 45,
    successRate: 0.92,
    avgSatisfaction: 0.88,
    lastUsed: Date.now(),
    avgExecutionTime: 1800000 // 30 minutes
  },
  optimizationCount: 3,
  tags: ['迭代', '验证', 'MVP'],
  author: '产品团队',
  reviewers: ['技术负责人', 'UX设计师'],

  // New fields for type system
  type_tags: ['rapid_iteration', 'data_driven', 'user_centric'],
  type_confidence: {
    rapid_iteration: 0.92,
    data_driven_decision: 0.88,
    user_centric: 0.76
  },
  prompt_template_id: 'rapid_iteration_guidance',
  guidance_level: 'medium',
  guidance_steps: [
    {
      id: 'step_1',
      description: '定义最小可行产品(MVP)',
      expected_outcome: '明确产品核心功能',
      key_points: ['聚焦核心价值', '最小功能集', '快速验证'],
      cautions: ['避免过度设计', '不要追求完美'],
      optional: false
    }
  ]
};

// =============================================================================
// Example 3: Type Vocabulary Entry
// =============================================================================

export const exampleTypeVocabulary: TypeVocabulary = {
  tag_name: 'rapid_iteration',
  keywords: ['快速', '迭代', '实验', '验证', '敏捷', 'MVP'],
  confidence: 0.95,
  first_identified: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
  playbook_count: 23,
  discovered_from: 'historical_clustering',
  created_at: Date.now(),
  updated_at: Date.now(),
  metadata: {
    description: '快速迭代问题解决方法',
    usage_examples: ['MVP开发', 'A/B测试', '原型验证'],
    related_tags: ['agile_execution', 'data_driven_decision'],
    decay_score: 0.1
  }
};

// =============================================================================
// Example 4: Prompt Template
// =============================================================================

export const examplePromptTemplate: PromptTemplate = {
  template_id: 'rapid_iteration_guidance',
  template_type: 'guidance',
  name: '快速迭代指导模板',
  content: `根据以下最佳实践指导本次任务：

【目标】{goal}
【关键步骤】{steps}
【注意事项】{cautions}
【预期结果】{expected_outcome}

请在思考和行动中参考以上指导。`,
  variables: ['goal', 'steps', 'cautions', 'expected_outcome'],
  applicable_tags: ['rapid_iteration', 'agile_execution'],
  guidance_level: 'medium',
  created_at: Date.now(),
  updated_at: Date.now(),
  usage_count: 156,
  effectiveness_score: 0.88,
  metadata: {
    language: 'zh',
    tone: 'professional',
    max_length: 500
  }
};

// =============================================================================
// Example 5: Matching Context and Result
// =============================================================================

export const exampleMatchingContext: MatchingContext = {
  userQuery: '我需要快速验证一个产品想法，应该怎么迭代？',
  domain: 'product_development',
  scenario: '产品验证',
  complexity: 'medium'
};

export const examplePlaybookMatch: PlaybookMatch = {
  playbook: examplePlaybook,
  matchScore: 0.92,
  matchReasons: [
    '标签 "rapid_iteration" 完全匹配 (92%)',
    '场景匹配度 85%',
    '复杂度适中匹配'
  ],
  applicableSteps: [0, 1],
  tagScores: [
    { tag: 'rapid_iteration', score: 0.92, matchType: 'exact' },
    { tag: 'data_driven', score: 0.88, matchType: 'similar' }
  ]
};

// =============================================================================
// Example 6: Injection Context and Result
// =============================================================================

export const exampleInjectionContext: InjectionContext = {
  playbook: examplePlaybook,
  template: examplePromptTemplate,
  rendered_content: '根据以下最佳实践指导本次任务：\n\n【目标】快速验证产品想法\n【关键步骤】1. 定义MVP 2. 快速构建原型',
  guidance_level: 'medium',
  injection_point: 'user_message'
};

export const exampleInjectionResult: InjectionResult = {
  success: true,
  injected_content: '【任务指导】\n\n根据以下最佳实践指导本次任务：\n\n【目标】快速验证产品想法\n【关键步骤】1. 定义MVP 2. 快速构建原型',
  guidance_applied: true,
  fallback_triggered: false
};

// =============================================================================
// Example 7: Playbook Cluster for Analysis
// =============================================================================

export const examplePlaybookFeature: PlaybookFeature = {
  playbookId: 'pb_001',
  playbook: examplePlaybook,
  name: '快速迭代问题解决方法',
  description: '通过快速迭代和验证来解决问题的方法论',
  scenario: '需要快速验证产品想法的场景',
  keywords: ['快速', '迭代', '验证', 'MVP', '产品'],
  tools: ['原型工具', '用户调研'],
  complexity: 'medium',
  created_at: Date.now()
};

export const examplePlaybookCluster: PlaybookCluster = {
  cluster_id: 'cluster_001',
  playbooks: [examplePlaybook],
  center: examplePlaybookFeature,
  similarity_sum: 1.0
};

// =============================================================================
// Example 8: Type Similarity Matrix
// =============================================================================

export const exampleTypeSimilarity: TypeSimilarity = {
  tag1: 'rapid_iteration',
  tag2: 'agile_execution',
  similarity_score: 0.85,
  co_occurrence_count: 18,
  last_updated: Date.now()
};

// =============================================================================
// Example 9: Playbook Type Assignment
// =============================================================================

export const exampleTypeAssignment: PlaybookTypeAssignment = {
  playbook_id: 'pb_001',
  tag_name: 'rapid_iteration',
  confidence: 0.92,
  assigned_method: 'automatic',
  assigned_at: Date.now(),
  verified: true,
  verified_at: Date.now(),
  verified_by: 'system'
};

// =============================================================================
// Example 10: Template Rendering
// =============================================================================

export const exampleTemplateRenderOptions: TemplateRenderOptions = {
  variables: {
    goal: '快速验证产品想法',
    steps: '1. 定义MVP 2. 快速构建原型',
    cautions: '避免过度设计',
    expected_outcome: '可测试的原型产品'
  },
  guidance_level: 'medium',
  language: 'zh',
  tone: 'professional',
  max_length: 500
};

export const exampleTemplateRenderResult: TemplateRenderResult = {
  content: `根据以下最佳实践指导本次任务：

【目标】快速验证产品想法
【关键步骤】1. 定义MVP 2. 快速构建原型
【注意事项】避免过度设计
【预期结果】可测试的原型产品

请在思考和行动中参考以上指导。`,
  variables_used: ['goal', 'steps', 'cautions', 'expected_outcome'],
  token_count: 85
};
