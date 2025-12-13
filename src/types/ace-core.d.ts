/**
 * 本地化AceCore类型定义
 * 替代ace-engine-core的类型定义
 */

// 轨迹步骤
export interface TrajectoryStep {
  thought: string;
  action: string;
  output: string;
}

// 轨迹接口
export interface Trajectory {
  task_id: string;
  session_id?: string;
  user_input: string;
  steps: TrajectoryStep[];
  final_result: string;
  outcome: 'SUCCESS' | 'FAILURE';
  environment_feedback: string;
  used_rule_ids: string[];
  timestamp: number;
  duration_ms: number;
  evolution_status: 'PENDING' | 'COMPLETED' | 'FAILED';
}

// 反思触发器
export interface ReflectionTrigger {
  type: string;
  level: string;
  sessionId: string;
  traceId: string;
  timestamp: number;
  context?: any;
}

// AceCore配置
export interface AceCoreConfig {
  agentId: string;
  reflectionCycleInterval?: number;
  maxSessionAge?: number;
  storage?: {
    mode: 'memory' | 'sqlite';
    sqlitePath?: string;
    logsPath?: string;
  };
  memory?: {
    provider: 'memory' | 'lancedb';
    endpoint?: string;
    collectionPrefix?: string;
  };
  llm?: {
    driver: any;
    modelMap?: Record<string, string>;
  };
  reflectionTrigger?: {
    predictionErrorThreshold?: number;
    loopDetectionWindow?: number;
    loopDetectionThreshold?: number;
    stagnationTimeWindow?: number;
    stagnationProgressThreshold?: number;
    maxTokens?: number;
    maxSteps?: number;
    maxTime?: number;
    cooldownMs?: number;
    contextWindowThreshold?: number;
  };
}
