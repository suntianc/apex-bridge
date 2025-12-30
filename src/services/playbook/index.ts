/**
 * Playbook Matcher 模块 - 统一导出
 *
 * @module playbook
 */

// 主协调器
export { PlaybookMatcher } from './PlaybookMatcher';
export type { IPlaybookMatcher, PlaybookRecommendationConfig, DEFAULT_RECOMMENDATION_CONFIG } from './PlaybookMatcher.types';

// 评分计算器
export { ScoreCalculator } from './ScoreCalculator';
export type { IScoreCalculator } from './PlaybookMatcher.types';

// 动态类型匹配器
export { DynamicTypeMatcher } from './DynamicTypeMatcher';
export type { IDynamicTypeMatcher } from './PlaybookMatcher.types';

// 序列推荐器
export { SequenceRecommender } from './SequenceRecommender';
export type { ISequenceRecommender } from './PlaybookMatcher.types';

// 知识库维护者
export { PlaybookCurator } from './PlaybookCurator';
export type { IPlaybookCurator } from './PlaybookMatcher.types';

// 类型定义
export * from './PlaybookMatcher.types';
