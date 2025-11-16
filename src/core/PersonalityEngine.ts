/**
 * PersonalityEngine - 人格引擎
 * 负责加载人格配置、构建System Prompt并注入到消息列表
 */

import * as fs from 'fs';
import * as path from 'path';
import { Message } from '../types';
import { PersonalityConfig, PersonalityEngineConfig } from '../types/personality';
import { logger } from '../utils/logger';
import { Cache, createPermanentCache } from '../utils/cache';

export class PersonalityEngine {
  private personalities: Cache<PersonalityConfig>;
  private promptCache: Cache<string>;
  private config: Required<PersonalityEngineConfig>;
  
  constructor(config?: PersonalityEngineConfig) {
    this.config = {
      agentDir: config?.agentDir || './Agent',
      personalityDir: config?.personalityDir || './config/personality',
      cacheEnabled: config?.cacheEnabled !== false, // 默认启用缓存
      defaultAgentId: config?.defaultAgentId || 'default'
    };
    
    // 初始化缓存（使用永久缓存，因为配置文件很少变更）
    // 可以通过 clearCache() 手动刷新
    const cacheMaxSize = 100; // 最多缓存100个人格配置
    this.personalities = createPermanentCache<PersonalityConfig>(cacheMaxSize);
    this.promptCache = createPermanentCache<string>(cacheMaxSize);
    
    logger.info('✅ PersonalityEngine initialized', {
      agentDir: this.config.agentDir,
      personalityDir: this.config.personalityDir,
      cacheEnabled: this.config.cacheEnabled
    });
  }
  
  /**
   * 初始化（预加载默认人格）
   */
  async initialize(): Promise<void> {
    try {
      // 预加载默认人格
      await this.loadAndCache(this.config.defaultAgentId);
      logger.info(`✅ PersonalityEngine initialized with default personality: ${this.config.defaultAgentId}`);
    } catch (error: any) {
      logger.warn(`⚠️ Failed to load default personality: ${error.message}`);
      // 如果默认人格加载失败，创建基本的默认配置
      this.createFallbackDefault();
    }
  }
  
  /**
   * 加载人格配置
   * @param agentId - Agent ID（如"小文"、"default"）
   * @returns PersonalityConfig
   */
  loadPersonality(agentId: string): PersonalityConfig {
    if (!this.config.cacheEnabled) {
      // 缓存被禁用，每次都重新加载
      return this.loadAndCache(agentId);
    }

    // 如果已缓存，直接返回
    const cached = this.personalities.get(agentId);
    if (cached !== undefined) {
      return cached;
    }
    
    // 按需加载并缓存
    return this.loadAndCache(agentId);
  }
  
  /**
   * 从文件加载人格配置并缓存
   */
  private loadAndCache(agentId: string): PersonalityConfig {
    try {
      // 验证agentId格式
      if (!/^[\w\u4e00-\u9fa5-]+$/.test(agentId)) {
        throw new Error(`Invalid agent ID format: ${agentId}`);
      }
      
      // 按优先级查找文件：JSON -> TXT
      const jsonPath = path.join(this.config.personalityDir, `${agentId}.json`);
      const txtPath = path.join(this.config.agentDir, `${agentId}.txt`);
      
      let personality: PersonalityConfig;
      
      if (fs.existsSync(jsonPath)) {
        // 加载JSON配置
        personality = this.loadJsonConfig(jsonPath);
      } else if (fs.existsSync(txtPath)) {
        // 加载TXT配置（向后兼容）
        personality = this.loadTxtConfig(txtPath, agentId);
      } else if (agentId === this.config.defaultAgentId) {
        // 默认人格不存在，创建fallback
        logger.warn(`⚠️ Default personality not found, creating fallback`);
        personality = this.createFallbackDefault();
      } else {
        // 其他人格不存在，使用默认人格
        logger.warn(`⚠️ Personality '${agentId}' not found, using default`);
        return this.loadPersonality(this.config.defaultAgentId);
      }
      
      // 缓存配置（如果启用缓存）
      if (this.config.cacheEnabled) {
        this.personalities.set(agentId, personality);
      }
      
      logger.debug(`✅ Loaded personality: ${agentId}`);
      return personality;
      
    } catch (error: any) {
      logger.error(`❌ Failed to load personality '${agentId}':`, error);
      // 加载失败，返回默认人格
      if (agentId !== this.config.defaultAgentId) {
        return this.loadPersonality(this.config.defaultAgentId);
      }
      // 如果默认人格也失败，创建fallback
      return this.createFallbackDefault();
    }
  }
  
  /**
   * 加载JSON格式配置文件
   */
  private loadJsonConfig(filePath: string): PersonalityConfig {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const config: PersonalityConfig = JSON.parse(content);
      
      // 验证必需字段
      if (!config.identity?.name) {
        throw new Error('Missing required field: identity.name');
      }
      if (!config.traits?.core || !Array.isArray(config.traits.core) || config.traits.core.length === 0) {
        throw new Error('Missing or invalid field: traits.core');
      }
      if (!config.style?.tone || !config.style?.address || !config.style?.emojiUsage) {
        throw new Error('Missing required field: style.tone, style.address, or style.emojiUsage');
      }
      
      return config;
    } catch (error: any) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON format in ${filePath}: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * 加载TXT格式配置文件（向后兼容）
   */
  private loadTxtConfig(filePath: string, agentId: string): PersonalityConfig {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // 简单提取基本信息（名字和头像）
    const nameMatch = content.match(/你是(.+?)[，,。]/) || content.match(/^你是(.+?)$/m);
    const avatarMatch = content.match(/([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}])/u);
    
    // 提取名字（去除emoji）
    let name = nameMatch ? nameMatch[1].trim() : agentId;
    // 如果名字中包含emoji，分离出来
    const nameEmojiMatch = name.match(/([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}])/u);
    if (nameEmojiMatch) {
      name = name.replace(nameEmojiMatch[0], '').trim();
    }
    
    // 优先使用名字中的emoji，否则使用全文中的第一个emoji
    const avatar = nameEmojiMatch ? nameEmojiMatch[0] : (avatarMatch ? avatarMatch[0] : '🤖');
    
    // 构建兼容的PersonalityConfig
    return {
      identity: {
        name,
        avatar,
        role: 'AI助手'
      },
      traits: {
        core: ['兼容模式']
      },
      style: {
        tone: '自然',
        address: '您',
        emojiUsage: 'moderate'
      },
      customPrompt: content, // 保存原始txt内容
      metadata: {
        isTxtMode: true,
        description: '兼容模式：来自Agent目录的txt文件'
      }
    };
  }
  
  /**
   * 创建fallback默认人格
   */
  private createFallbackDefault(): PersonalityConfig {
    const defaultConfig: PersonalityConfig = {
      identity: {
        name: '助手',
        avatar: '🤖',
        role: 'AI助手'
      },
      traits: {
        core: ['友好', '专业'],
        interests: [],
        values: ['帮助用户']
      },
      style: {
        tone: '专业',
        address: '您',
        emojiUsage: 'moderate'
      },
      behavior: {
        onSuccess: '确认完成',
        onFailure: '说明问题并提供解决方案',
        onIdle: '询问是否需要帮助'
      },
      metadata: {
        version: '1.0',
        description: '默认AI助手人格'
      }
    };
    
    // 缓存fallback配置
    this.personalities.set(this.config.defaultAgentId, defaultConfig);
    return defaultConfig;
  }
  
  /**
   * 构建System Prompt
   * @param personality - 人格配置
   * @param agentId - Agent ID（用于缓存）
   * @returns 格式化的System Prompt字符串
   */
  buildSystemPrompt(personality: PersonalityConfig, agentId: string): string {
    // 检查缓存
    if (this.config.cacheEnabled && this.promptCache.has(agentId)) {
      return this.promptCache.get(agentId)!;
    }
    
    let prompt: string;
    
    // 判断是否为txt兼容模式
    if (personality.metadata?.isTxtMode && personality.customPrompt) {
      // TXT模式：简单包装
      prompt = this.buildPromptForTxt(personality);
    } else {
      // JSON模式：使用固定模板
      prompt = this.buildPromptFromJson(personality);
    }
    
    // 缓存
    if (this.config.cacheEnabled) {
      this.promptCache.set(agentId, prompt);
    }
    
    return prompt;
  }
  
  /**
   * 从JSON配置构建System Prompt（固定模板）
   */
  private buildPromptFromJson(personality: PersonalityConfig): string {
    const parts: string[] = [];
    
    // 1. 身份介绍
    let identityLine = `你是${personality.identity.name}`;
    if (personality.identity.avatar) {
      identityLine += ` ${personality.identity.avatar}`;
    }
    identityLine += '。';
    parts.push(identityLine);
    
    if (personality.identity.role) {
      parts.push(`你是用户的${personality.identity.role}。`);
    }
    
    if (personality.identity.background) {
      parts.push(personality.identity.background);
    }
    
    // 2. 性格特质
    parts.push(`\n你的性格特点：`);
    parts.push(`- 核心特质：${personality.traits.core.join('、')}`);
    
    if (personality.traits.interests && personality.traits.interests.length > 0) {
      parts.push(`- 兴趣爱好：${personality.traits.interests.join('、')}`);
    }
    
    if (personality.traits.values && personality.traits.values.length > 0) {
      parts.push(`- 价值观：${personality.traits.values.join('、')}`);
    }
    
    // 3. 交互风格
    parts.push(`\n交互风格：`);
    parts.push(`- 说话方式：${personality.style.tone}`);
    parts.push(`- 称呼用户为：${personality.style.address}`);
    parts.push(`- 表情使用：${this.getEmojiUsageDesc(personality.style.emojiUsage)}`);
    
    // 4. 行为模式（可选）
    if (personality.behavior) {
      parts.push(`\n行为模式：`);
      if (personality.behavior.onSuccess) {
        parts.push(`- 成功时：${personality.behavior.onSuccess}`);
      }
      if (personality.behavior.onFailure) {
        parts.push(`- 失败时：${personality.behavior.onFailure}`);
      }
      if (personality.behavior.onIdle) {
        parts.push(`- 闲暇时：${personality.behavior.onIdle}`);
      }
    }
    
    // 5. 自定义补充（如果有）
    if (personality.customPrompt) {
      parts.push(`\n${personality.customPrompt}`);
    }
    
    // 6. 结尾
    parts.push(`\n请始终保持你的人格特质，用你独特的风格与用户交流。`);
    
    return parts.join('\n');
  }
  
  /**
   * 从TXT配置构建System Prompt（兼容模式）
   */
  private buildPromptForTxt(personality: PersonalityConfig): string {
    let prompt = `你是${personality.identity.name}`;
    if (personality.identity.avatar) {
      prompt += ` ${personality.identity.avatar}`;
    }
    prompt += '。\n\n';
    
    // 直接使用txt内容
    if (personality.customPrompt) {
      prompt += personality.customPrompt;
    }
    
    return prompt;
  }
  
  /**
   * 获取表情使用描述
   */
  private getEmojiUsageDesc(emojiUsage: 'frequent' | 'moderate' | 'rare'): string {
    const map = {
      frequent: '频繁使用',
      moderate: '适度使用',
      rare: '很少使用'
    };
    return map[emojiUsage] || '适度使用';
  }
  
  /**
   * 将人格注入到消息列表
   * @param messages - 原始消息列表
   * @param personality - 人格配置
   * @param agentId - Agent ID（用于缓存）
   * @returns 注入人格后的消息列表（第一条为system message）
   */
  injectIntoMessages(messages: Message[], personality: PersonalityConfig, agentId: string): Message[] {
    const systemPrompt = this.buildSystemPrompt(personality, agentId);
    
    // 分离system和普通消息
    const systemMessages: Message[] = [];
    const otherMessages: Message[] = [];
    
    messages.forEach(msg => {
      if (msg.role === 'system') {
        systemMessages.push(msg);
      } else {
        otherMessages.push(msg);
      }
    });
    
    // 构建新的消息列表：
    // 1. 人格system（最前，最高优先级）
    // 2. 用户system（如果有，作为补充）
    // 3. 其他消息
    return [
      { role: 'system', content: systemPrompt },
      ...systemMessages,  // 用户的system message保留
      ...otherMessages    // 普通消息
    ];
  }
  
  /**
   * 清空缓存
   */
  clearCache(agentId?: string): void {
    if (agentId) {
      this.personalities.delete(agentId);
      this.promptCache.delete(agentId);
      logger.debug(`Cleared cache for personality: ${agentId}`);
    } else {
      this.personalities.clear();
      this.promptCache.clear();
      logger.debug('Cleared all personality caches');
    }
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { personalities: any; prompts: any } {
    return {
      personalities: this.personalities.getStats(),
      prompts: this.promptCache.getStats()
    };
  }
  
  /**
   * 手动刷新人格（清除缓存并重新加载）
   */
  refreshPersonality(agentId: string): void {
    this.clearCache(agentId);
    this.loadPersonality(agentId); // 触发重新加载
    logger.info(`Refreshed personality: ${agentId}`);
  }
  
  /**
   * 获取已加载的人格列表
   */
  getLoadedPersonalities(): string[] {
    return Array.from(this.personalities.keys());
  }
}

