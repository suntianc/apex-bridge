/**
 * PersonalityEngine 人格引擎类型定义
 */

import { Message } from './index';

/**
 * 人格配置接口
 */
export interface PersonalityConfig {
  // 基础身份
  identity: {
    name: string;              // AI名字（如"小文"）
    avatar?: string;           // 头像emoji（如"📁"）
    role?: string;             // 关系定位（如"文件管理助手"）
    age?: number;              // 年龄（可选）
    background?: string;       // 背景故事（可选）
  };
  
  // 性格特质
  traits: {
    core: string[];            // 核心特质（如["细心", "有条理"]）
    interests?: string[];      // 兴趣爱好（可选）
    values?: string[];         // 价值观（可选）
  };
  
  // 交互风格
  style: {
    tone: string;              // 说话方式（如"礼貌"、"亲昵"、"专业"）
    address: string;           // 称呼方式（如"Boss"、"爸爸"、"您"）
    emojiUsage: 'frequent' | 'moderate' | 'rare'; // 表情使用频率
  };
  
  // 行为模式（可选）
  behavior?: {
    onSuccess?: string;       // 成功时的反应
    onFailure?: string;       // 失败时的反应
    onIdle?: string;          // 闲暇时的话题
  };
  
  // 自定义补充内容（用于txt兼容和未来扩展）
  customPrompt?: string;      // 自定义System Prompt补充（可选）
  
  // 元数据（可选）
  metadata?: {
    version?: string;
    author?: string;
    description?: string;
    isTxtMode?: boolean;       // 是否为txt兼容模式
  };
}

/**
 * PersonalityEngine配置选项
 */
export interface PersonalityEngineConfig {
  agentDir?: string;          // Agent目录路径（默认: ./Agent）
  personalityDir?: string;    // 人格配置目录（默认: ./config/personality）
  cacheEnabled?: boolean;     // 是否启用缓存（默认: true）
  defaultAgentId?: string;     // 默认Agent ID（默认: 'default'）
}

/**
 * 情感类型枚举（供EmotionEngine使用，预定义）
 */
export enum EmotionType {
  HAPPY = 'happy',
  SAD = 'sad',
  ANGRY = 'angry',
  EXCITED = 'excited',
  NEUTRAL = 'neutral',
  ANXIOUS = 'anxious'
}

/**
 * 情感信息
 */
export interface Emotion {
  type: EmotionType;
  intensity: number;          // 强度 0-1
  confidence: number;          // 置信度 0-1
  context?: string;           // 上下文信息
}
