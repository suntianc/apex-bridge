/**
 * AceStrategyManager 模块统一导出
 *
 * 模块结构：
 * - AceStrategyManager: 主协调器（依赖注入模式）
 * - StrategicContextManager: 战略上下文管理
 * - WorldModelUpdater: 世界模型更新
 * - PlaybookSynthesis: Playbook 自动提炼
 * - MemoryManager: TTL 内存管理
 * - types: 类型定义
 */

// ==================== 主服务 ====================

export {
  AceStrategyManager,
  IAceStrategyManager,
  createAceStrategyManager
} from './AceStrategyManager';

// ==================== 子模块 ====================

export {
  StrategicContextManager,
  IStrategicContextManager,
  StrategicGoal,
  createStrategicContextManager
} from './StrategicContextManager';

export {
  WorldModelUpdater,
  IWorldModelUpdater,
  createWorldModelUpdater
} from './WorldModelUpdater';

export {
  PlaybookSynthesis,
  IPlaybookSynthesis,
  createPlaybookSynthesis
} from './PlaybookSynthesis';

export {
  MemoryManager,
  IMemoryManager,
  createMemoryManager
} from './MemoryManager';

// ==================== 类型定义 ====================

export * from './types';

// ==================== 配置常量 ====================

export { ACE_STRATEGY_CONFIG } from './types';
