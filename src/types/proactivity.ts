/**
 * 主动性调度系统类型定义
 */

import { PersonalityConfig } from './personality';

/**
 * 触发类型
 */
export type TriggerType = 'schedule' | 'event' | 'condition' | 'random';

/**
 * 场景上下文
 */
export interface ProactiveContext {
  userId?: string;
  timestamp?: number;
  personality?: PersonalityConfig;
  memory?: any;
  emotion?: any;
  [key: string]: any;
}

/**
 * 主动场景定义
 */
export interface ProactiveScene {
  id: string;
  name: string;
  description?: string;
  trigger: TriggerType;
  schedule?: string; // Cron表达式（用于schedule类型）
  condition?: (context: ProactiveContext) => boolean; // 条件函数（用于condition类型）
  generateMessage: (context: ProactiveContext, personality: PersonalityConfig) => Promise<string>;
  enabled?: boolean;
  priority?: number;
  metadata?: {
    [key: string]: any;
  };
}

/**
 * 场景评分结果
 */
export interface SceneScore {
  sceneId: string;
  score: number;
  reason?: string;
  metadata?: {
    [key: string]: any;
  };
}

/**
 * 主动性调度器配置
 */
export interface ProactivitySchedulerConfig {
  enabled?: boolean;
  timezone?: string; // 默认 'Asia/Taipei'
  quietWindow?: {
    start: string; // 默认 '22:00'
    end: string; // 默认 '08:00'
  };
  workdayHours?: {
    start: string; // 默认 '09:00'
    end: string; // 默认 '20:00'
  };
  maxDailyMessages?: number; // 默认 1
  actionThreshold?: number; // 默认 0.6
  debounceMs?: number; // 默认 30分钟
  personalityEngine?: any;
  emotionEngine?: any;
  memoryService?: any;
  chatService?: any;
  eventBus?: any;
}

/**
 * 触发枢纽配置
 */
export interface TriggerHubConfig {
  debounceMs?: number; // 默认 30分钟
  timezone?: string; // 默认 'Asia/Taipei'
  quietWindow?: {
    start: string;
    end: string;
  };
}

/**
 * 政策守门配置
 */
export interface PolicyGuardConfig {
  maxDailyMessages?: number; // 默认 1
  enabled?: boolean;
  scenes?: {
    [sceneId: string]: {
      enabled: boolean;
    };
  };
}

/**
 * 主动消息
 */
export interface ProactiveMessage {
  sceneId: string;
  content: string;
  userId?: string;
  timestamp: number;
  personality?: PersonalityConfig;
  metadata?: {
    [key: string]: any;
  };
}

