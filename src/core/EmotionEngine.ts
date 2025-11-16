/**
 * EmotionEngine - 情感引擎
 * 负责识别用户情感、生成共情响应、记录情感
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { LLMClient } from './LLMClient';
import { PersonalityConfig, Emotion, EmotionType } from '../types/personality';
import { Message } from '../types';
import { logger } from '../utils/logger';
import { Cache, createCache } from '../utils/cache';

/**
 * 情感响应模板配置
 */
export interface EmotionResponseTemplate {
  emotion: EmotionType;
  responses: string[];  // 响应文本列表（随机选择）
  emojis?: string[];    // 可选的表情符号
  tone?: string;        // 语调指示（如"温暖"、"专业"）
}

/**
 * 情感响应模板库（按人格分组）
 */
export interface EmotionTemplateLibrary {
  default: Record<EmotionType, EmotionResponseTemplate>;
  personalities?: Record<string, Record<EmotionType, EmotionResponseTemplate>>;
}

/**
 * EmotionEngine配置
 */
export interface EmotionEngineConfig {
  llmClient?: LLMClient;              // LLM客户端（可选，用于情感识别）
  templateDir?: string;                // 模板目录（默认: ./config/emotion）
  fastModeEnabled?: boolean;            // 是否启用快速模式（默认: true）
  cacheEnabled?: boolean;               // 是否启用缓存（默认: true）
  recordingEnabled?: boolean;           // 是否启用情感记录（默认: false）
  memoryService?: any;                  // 记忆服务接口（可选，用于情感记录）
}

/**
 * 快速模式关键词映射
 */
const FAST_MODE_KEYWORDS: Record<string, EmotionType> = {
  // Happy
  '开心': EmotionType.HAPPY,
  '高兴': EmotionType.HAPPY,
  '快乐': EmotionType.HAPPY,
  '太好了': EmotionType.HAPPY,
  '太棒了': EmotionType.HAPPY,
  '好开心': EmotionType.HAPPY,
  '好高兴': EmotionType.HAPPY,
  
  // Sad
  '难过': EmotionType.SAD,
  '伤心': EmotionType.SAD,
  '沮丧': EmotionType.SAD,
  '不开心': EmotionType.SAD,
  '心情不好': EmotionType.SAD,
  '很难过': EmotionType.SAD,
  
  // Angry
  '生气': EmotionType.ANGRY,
  '愤怒': EmotionType.ANGRY,
  '恼火': EmotionType.ANGRY,
  '烦': EmotionType.ANGRY,
  '讨厌': EmotionType.ANGRY,
  
  // Excited
  '兴奋': EmotionType.EXCITED,
  '激动': EmotionType.EXCITED,
  
  // Anxious
  '焦虑': EmotionType.ANXIOUS,
  '担心': EmotionType.ANXIOUS,
  '紧张': EmotionType.ANXIOUS,
  '不安': EmotionType.ANXIOUS,
  '着急': EmotionType.ANXIOUS
};

export class EmotionEngine {
  private llmClient?: LLMClient;
  private templates: EmotionTemplateLibrary;
  private emotionCache: Cache<Emotion>;
  private config: Required<Omit<EmotionEngineConfig, 'llmClient' | 'memoryService'>> & {
    llmClient?: LLMClient;
    memoryService?: any;
  };
  
  constructor(config?: EmotionEngineConfig) {
    this.config = {
      templateDir: config?.templateDir || './config/emotion',
      fastModeEnabled: config?.fastModeEnabled !== false, // 默认启用
      cacheEnabled: config?.cacheEnabled !== false,       // 默认启用
      recordingEnabled: config?.recordingEnabled || false,
      llmClient: config?.llmClient,
      memoryService: config?.memoryService
    };
    
    this.llmClient = config?.llmClient;
    this.templates = {
      default: {} as Record<EmotionType, EmotionResponseTemplate>
    };
    
    // 初始化缓存（TTL: 1小时，最大500项）
    // 情感检测结果可以缓存较长时间，因为相同消息的情感通常是稳定的
    this.emotionCache = createCache<Emotion>(60 * 60 * 1000, 500);
    
    logger.info('✅ EmotionEngine initialized', {
      templateDir: this.config.templateDir,
      fastModeEnabled: this.config.fastModeEnabled,
      cacheEnabled: this.config.cacheEnabled
    });
  }
  
  /**
   * 初始化（加载模板）
   */
  async initialize(): Promise<void> {
    try {
      await this.loadTemplates();
      logger.info(`✅ EmotionEngine initialized with templates`);
    } catch (error: any) {
      logger.warn(`⚠️ Failed to load emotion templates: ${error.message}`);
      // 创建默认模板
      this.createDefaultTemplates();
    }
  }
  
  /**
   * 检测用户情感
   * @param userMessage - 用户消息
   * @returns 检测到的情感
   */
  async detectEmotion(userMessage: string): Promise<Emotion> {
    try {
      // 检查缓存
      if (this.config.cacheEnabled) {
        const cacheKey = this.getMessageHash(userMessage);
        const cached = this.emotionCache.get(cacheKey);
        if (cached !== undefined) {
          logger.debug(`📦 Using cached emotion: ${cached.type}`);
          return cached;
        }
      }
      
      let emotion: Emotion;
      
      // 快速模式：关键词匹配
      if (this.config.fastModeEnabled) {
        const fastResult = this.detectEmotionFast(userMessage);
        if (fastResult) {
          logger.debug(`⚡ Fast mode detected emotion: ${fastResult.type}`);
          emotion = fastResult;
          
          // 缓存结果（如果启用缓存）
          if (this.config.cacheEnabled) {
            const cacheKey = this.getMessageHash(userMessage);
            this.emotionCache.set(cacheKey, emotion);
          }
          
          return emotion;
        }
      }
      
      // LLM模式：调用LLM分析
      if (this.llmClient) {
        emotion = await this.detectEmotionWithLLM(userMessage);
      } else {
        // 如果LLM客户端未设置，使用快速模式或默认neutral
        logger.warn('⚠️ LLM client not available, using fast mode or neutral');
        emotion = this.detectEmotionFast(userMessage) || this.createNeutralEmotion();
      }
      
      // 缓存结果（如果启用缓存）
      if (this.config.cacheEnabled) {
        const cacheKey = this.getMessageHash(userMessage);
        this.emotionCache.set(cacheKey, emotion);
      }
      
      return emotion;
      
    } catch (error: any) {
      logger.error(`❌ Emotion detection failed:`, error);
      // Fallback到neutral（spec要求）
      return this.createNeutralEmotion();
    }
  }
  
  /**
   * 快速模式：关键词匹配
   */
  private detectEmotionFast(message: string): Emotion | null {
    const lowerMessage = message.toLowerCase();
    
    for (const [keyword, emotionType] of Object.entries(FAST_MODE_KEYWORDS)) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        return {
          type: emotionType,
          intensity: 0.7,  // 快速模式给固定强度
          confidence: 0.8,  // 快速模式置信度稍低
          context: `Fast mode: matched keyword "${keyword}"`
        };
      }
    }
    
    return null;
  }
  
  /**
   * LLM模式：使用LLM分析情感
   */
  private async detectEmotionWithLLM(message: string): Promise<Emotion> {
    // 懒加载LLMClient（线程安全）
    if (!this.llmClient) {
      const { RuntimeConfigService } = await import('../services/RuntimeConfigService');
      const runtimeConfig = RuntimeConfigService.getInstance();
      this.llmClient = await runtimeConfig.getLLMClient();
      
      if (!this.llmClient) {
        // LLM未配置，使用快速模式或返回中性情绪
        logger.warn('⚠️ LLMClient not available, falling back to fast mode or neutral emotion');
        return this.createNeutralEmotion();
      }
    }
    
    // 优化的提示词（简短、结构化）
    const prompt = `分析以下用户消息的情感，返回JSON格式：
{
  "type": "happy|sad|angry|excited|neutral|anxious",
  "intensity": 0.0-1.0,
  "confidence": 0.0-1.0
}

用户消息：${message.substring(0, 500)}  // 限制长度

只返回JSON，不要其他文字：`;
    
    const messages: Message[] = [
      {
        role: 'system',
        content: '你是一个情感分析助手。只返回JSON格式的结果，不要添加任何解释。'
      },
      {
        role: 'user',
        content: prompt
      }
    ];
    
    try {
      const response = await this.llmClient.chat(messages, {
        temperature: 0.3,  // 低温度，更确定
        max_tokens: 100    // 只需要简短JSON
      });
      
      const content = response.choices[0]?.message?.content || '{}';
      
      // 解析JSON（可能包含markdown代码块）
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : content;
      const result = JSON.parse(jsonStr);
      
      // 验证和规范化
      const emotionType = this.parseEmotionType(result.type);
      const intensity = Math.max(0, Math.min(1, result.intensity || 0.5));
      const confidence = Math.max(0, Math.min(1, result.confidence || 0.8));
      
      return {
        type: emotionType,
        intensity,
        confidence,
        context: message.substring(0, 100)
      };
      
    } catch (error: any) {
      logger.error(`❌ LLM emotion detection failed:`, error);
      // Fallback到neutral
      return this.createNeutralEmotion();
    }
  }
  
  /**
   * 解析情感类型字符串
   */
  private parseEmotionType(typeStr: string): EmotionType {
    const normalized = typeStr.toLowerCase().trim();
    const typeMap: Record<string, EmotionType> = {
      'happy': EmotionType.HAPPY,
      'sad': EmotionType.SAD,
      'angry': EmotionType.ANGRY,
      'excited': EmotionType.EXCITED,
      'neutral': EmotionType.NEUTRAL,
      'anxious': EmotionType.ANXIOUS
    };
    
    return typeMap[normalized] || EmotionType.NEUTRAL;
  }
  
  /**
   * 创建neutral情感（fallback）
   */
  private createNeutralEmotion(): Emotion {
    return {
      type: EmotionType.NEUTRAL,
      intensity: 0.5,
      confidence: 1.0,
      context: 'Fallback to neutral'
    };
  }
  
  /**
   * 生成共情响应
   * @param emotion - 检测到的情感
   * @param personality - 人格配置
   * @returns 共情响应文本（可选，用于注入到System Prompt）
   */
  generateEmpatheticResponse(emotion: Emotion, personality: PersonalityConfig): string | null {
    // 如果是neutral，不生成特殊响应
    if (emotion.type === EmotionType.NEUTRAL) {
      return null;
    }
    
    try {
      // 查找模板（优先人格化模板，其次默认模板）
      const template = this.findTemplate(emotion.type, personality);
      
      if (!template || !template.responses || template.responses.length === 0) {
        return null;
      }
      
      // 随机选择响应
      const responseIndex = Math.floor(Math.random() * template.responses.length);
      let response = template.responses[responseIndex];
      
      // 根据人格调整（替换占位符）
      response = this.personalizeResponse(response, personality);
      
      return response;
      
    } catch (error: any) {
      logger.error(`❌ Failed to generate empathetic response:`, error);
      return null;
    }
  }
  
  /**
   * 查找响应模板
   */
  private findTemplate(emotionType: EmotionType, personality: PersonalityConfig): EmotionResponseTemplate | null {
    // 1. 尝试人格化模板
    if (this.templates.personalities && personality.identity.name) {
      const personalityTemplates = this.templates.personalities[personality.identity.name];
      if (personalityTemplates && personalityTemplates[emotionType]) {
        return personalityTemplates[emotionType];
      }
    }
    
    // 2. 使用默认模板
    return this.templates.default[emotionType] || null;
  }
  
  /**
   * 个性化响应（替换占位符）
   */
  private personalizeResponse(response: string, personality: PersonalityConfig): string {
    // 替换称呼占位符
    response = response.replace(/\{address\}/g, personality.style.address);
    
    // 替换名字占位符
    if (personality.identity.name) {
      response = response.replace(/\{name\}/g, personality.identity.name);
    }
    
    return response;
  }
  
  /**
   * 记录情感（可选）
   */
  async recordEmotion(userId: string, emotion: Emotion, context: string): Promise<void> {
    if (!this.config.recordingEnabled) {
      return; // 未启用，直接返回
    }
    
    // 只记录强烈情感（intensity > 0.7）
    if (emotion.intensity <= 0.7) {
      return;
    }
    
    try {
      if (this.config.memoryService && this.config.memoryService.recordEmotion) {
        await this.config.memoryService.recordEmotion(userId, emotion, context);
        logger.debug(`✅ Recorded emotion: ${emotion.type} (intensity: ${emotion.intensity})`);
      } else {
        // 如果记忆服务未设置，仅日志记录
        logger.debug(`📝 Emotion to record: ${emotion.type} (intensity: ${emotion.intensity})`);
      }
    } catch (error: any) {
      // 记录失败不中断对话流程（spec要求）
      logger.error(`❌ Failed to record emotion:`, error);
    }
  }
  
  /**
   * 加载情感响应模板
   */
  private async loadTemplates(): Promise<void> {
    const templateDir = this.config.templateDir;
    
    if (!fs.existsSync(templateDir)) {
      logger.warn(`⚠️ Emotion template directory not found: ${templateDir}`);
      this.createDefaultTemplates();
      return;
    }
    
    // 加载默认模板
    const defaultTemplatePath = path.join(templateDir, 'default.json');
    if (fs.existsSync(defaultTemplatePath)) {
      const content = fs.readFileSync(defaultTemplatePath, 'utf-8');
      const parsed = JSON.parse(content);
      // 转换格式：JSON对象 → Record<EmotionType, EmotionResponseTemplate>
      this.templates.default = this.convertTemplateFormat(parsed);
    } else {
      this.createDefaultTemplates();
    }
    
    // 加载人格化模板
    const personalitiesDir = path.join(templateDir, 'personalities');
    if (fs.existsSync(personalitiesDir)) {
      this.templates.personalities = {};
      const files = fs.readdirSync(personalitiesDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const personalityName = path.basename(file, '.json');
          const filePath = path.join(personalitiesDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const parsed = JSON.parse(content);
          // 转换格式
          this.templates.personalities![personalityName] = this.convertTemplateFormat(parsed);
        }
      }
    }
    
    logger.info(`✅ Loaded emotion templates: ${Object.keys(this.templates.default).length} default, ${this.templates.personalities ? Object.keys(this.templates.personalities).length : 0} personality-specific`);
  }
  
  /**
   * 转换模板格式（从JSON对象转换为内部格式）
   */
  private convertTemplateFormat(jsonTemplates: any): Record<EmotionType, EmotionResponseTemplate> {
    const result: any = {};
    
    for (const [key, value] of Object.entries(jsonTemplates)) {
      const emotionType = this.parseEmotionType(key);
      result[emotionType] = value as EmotionResponseTemplate;
    }
    
    return result as Record<EmotionType, EmotionResponseTemplate>;
  }
  
  /**
   * 创建默认模板（fallback）
   */
  private createDefaultTemplates(): void {
    this.templates.default = {
      [EmotionType.HAPPY]: {
        emotion: EmotionType.HAPPY,
        responses: [
          '看到{address}这么开心，我也很高兴！',
          '太好了！{address}的心情很棒呢！',
          '真为{address}感到开心！'
        ],
        emojis: ['😊', '🎉', '✨'],
        tone: 'positive'
      },
      [EmotionType.SAD]: {
        emotion: EmotionType.SAD,
        responses: [
          '{address}别难过，我会陪着你的。',
          '我理解{address}的感受，有什么我可以帮你的吗？',
          '虽然现在可能不太好，但一切都会好起来的。'
        ],
        emojis: ['💙', '🤗'],
        tone: 'comforting'
      },
      [EmotionType.ANGRY]: {
        emotion: EmotionType.ANGRY,
        responses: [
          '我理解{address}的感受，冷静一下。',
          '有什么事情让{address}生气了吗？可以跟我说说。',
          '让我们一起想办法解决这个问题。'
        ],
        emojis: ['😤', '💪'],
        tone: 'calming'
      },
      [EmotionType.EXCITED]: {
        emotion: EmotionType.EXCITED,
        responses: [
          '{address}这么兴奋，一定是有什么好消息！',
          '真为{address}感到激动！',
          '太棒了！{address}的兴奋也感染了我！'
        ],
        emojis: ['🎉', '🚀', '✨'],
        tone: 'enthusiastic'
      },
      [EmotionType.NEUTRAL]: {
        emotion: EmotionType.NEUTRAL,
        responses: [], // neutral不需要特殊响应
        tone: 'neutral'
      },
      [EmotionType.ANXIOUS]: {
        emotion: EmotionType.ANXIOUS,
        responses: [
          '{address}别担心，我们一起面对。',
          '我理解{address}的焦虑，深呼吸，慢慢来。',
          '不要过于焦虑，一切都会有办法解决的。'
        ],
        emojis: ['🤝', '💙'],
        tone: 'reassuring'
      }
    };
  }
  
  /**
   * 获取消息hash（用于缓存）
   */
  private getMessageHash(message: string): string {
    return crypto.createHash('md5').update(message).digest('hex');
  }
  
  /**
   * 清空缓存
   */
  clearCache(): void {
    this.emotionCache.clear();
    logger.debug('Cleared emotion cache');
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): any {
    return this.emotionCache.getStats();
  }
  
  /**
   * 设置LLM客户端
   */
  setLLMClient(llmClient: LLMClient): void {
    this.llmClient = llmClient;
    logger.info('✅ LLM client set for EmotionEngine');
  }
  
  /**
   * 设置记忆服务（用于情感记录）
   */
  setMemoryService(memoryService: any): void {
    this.config.memoryService = memoryService;
    logger.info('✅ Memory service set for EmotionEngine');
  }
}

