/**
 * ⚠️ DEPRECATED - ACE 配置接口定义
 *
 * 此文件定义了 ACE (Agent Configuration/Execution) 架构的配置接口。
 * 当前状态：配置类型已定义但未被实际实例化使用
 *
 * 保留此文件以保持类型完整性，同时标记为废弃。
 * @deprecated since 2024-01-11
 */
export interface AceConfig {
  /** 是否启用 */
  enabled?: boolean;
  /** 编排配置 */
  orchestration?: AceOrchestrationConfig;
  /** 层级配置 */
  layers?: AceLayersConfig;
  /** 内存配置 */
  memory?: AceMemoryConfig;
  /** 优化配置 */
  optimization?: AceOptimizationConfig;
  /** 技能系统配置 */
  skills?: AceSkillsConfig;
  /** 本地化实现配置 */
  localImplementation?: AceLocalImplementationConfig;
}

/**
 * ACE 编排配置
 */
export interface AceOrchestrationConfig {
  /** 是否启用 */
  enabled?: boolean;
  /** 编排模式 */
  mode?: "full" | "minimal" | "custom";
}

/**
 * ACE 层级配置（L1-L6）
 */
export interface AceLayersConfig {
  /** L1 层级配置（渴望层 - 道德约束） */
  l1?: AceLayerL1Config;
  /** L2 层级配置（全球战略层） */
  l2?: AceLayerL2Config;
  /** L3 层级配置（代理模型层） */
  l3?: AceLayerL3Config;
  /** L4 层级配置（执行功能层） */
  l4?: AceLayerL4Config;
  /** L5 层级配置（认知控制层） */
  l5?: AceLayerL5Config;
  /** L6 层级配置（任务执行层） */
  l6?: AceLayerL6Config;
}

/**
 * L1 层级配置（渴望层 - 道德约束）
 */
export interface AceLayerL1Config {
  /** 是否启用 */
  enabled?: boolean;
  /** 宪法文件路径 */
  constitutionPath?: string;
  /** 模型来源 */
  modelSource?: "sqlite";
}

/**
 * L2 层级配置（全球战略层）
 */
export interface AceLayerL2Config {
  /** 是否启用 */
  enabled?: boolean;
  /** 模型来源 */
  modelSource?: "sqlite";
}

/**
 * L3 层级配置（代理模型层）
 */
export interface AceLayerL3Config {
  /** 是否启用 */
  enabled?: boolean;
  /** 模型来源 */
  modelSource?: "sqlite";
}

/**
 * L4 层级配置（执行功能层）
 */
export interface AceLayerL4Config {
  /** 是否启用 */
  enabled?: boolean;
  /** 模型来源 */
  modelSource?: "sqlite";
}

/**
 * L5 层级配置（认知控制层）
 */
export interface AceLayerL5Config {
  /** 是否启用 */
  enabled?: boolean;
  /** 模型来源 */
  modelSource?: "sqlite";
  /** 是否回退到进化模式 */
  fallbackToEvolution?: boolean;
}

/**
 * L6 层级配置（任务执行层）
 */
export interface AceLayerL6Config {
  /** 是否启用 */
  enabled?: boolean;
  /** 是否使用 LLM */
  useLLM?: boolean;
}

/**
 * ACE 内存配置
 */
export interface AceMemoryConfig {
  /** 提供商类型 */
  provider?: "lancedb" | "memory" | "custom";
  /** 向量数据库路径 */
  vectorDbPath?: string;
  /** 集合前缀 */
  collectionPrefix?: string;
}

/**
 * ACE 优化配置
 */
export interface AceOptimizationConfig {
  /** 简单任务快速通道 */
  fastTrackSimpleTasks?: boolean;
  /** L5 草稿纸压缩 */
  l5ScratchpadCompression?: boolean;
  /** L6 非 LLM 执行 */
  l6NonLLMExecution?: boolean;
}

/**
 * ACE 技能系统配置
 */
export interface AceSkillsConfig {
  /** 自动清理是否启用 */
  autoCleanupEnabled?: boolean;
  /** 清理超时（毫秒） */
  cleanupTimeoutMs?: number;
  /** 最大活动技能数 */
  maxActiveSkills?: number;
}

/**
 * ACE 本地化实现配置
 */
export interface AceLocalImplementationConfig {
  /** 是否启用 */
  enabled?: boolean;
  /** ACE 核心配置 */
  aceCore?: {
    /** 反思周期间隔（毫秒） */
    reflectionCycleInterval?: number;
    /** 最大会话时长（毫秒） */
    maxSessionAge?: number;
  };
  /** 是否使用事件总线 */
  useEventBus?: boolean;
  /** 是否使用 LLM 管理器 */
  useLLMManager?: boolean;
  /** 是否使用 SQLite 配置 */
  useSQLiteConfig?: boolean;
}
