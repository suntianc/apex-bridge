/**
 * RAGMemoryService - RAG记忆服务实现
 * 包装现有的RAG服务，实现IMemoryService接口
 */

import { IMemoryService, Memory, MemoryContext, Preference, TimelineEvent } from '../types/memory';
import { Emotion } from '../types/personality';
import { logger } from '../utils/logger';
import { PreferenceStorage } from '../utils/preferenceStorage';

/**
 * RAGMemoryService配置
 */
export interface RAGMemoryServiceConfig {
  defaultKnowledgeBase?: string;  // 默认知识库名称（如'diary'）
  enableLogging?: boolean;        // 是否启用详细日志
}

export class RAGMemoryService implements IMemoryService {
  private config: RAGMemoryServiceConfig;
  private preferenceStorage: PreferenceStorage;
  private readonly INVALID_KB_CHAR_PATTERN = /[^a-zA-Z0-9_\-]+/g;
  
  constructor(
    private ragService: any,
    config?: RAGMemoryServiceConfig
  ) {
    this.config = {
      defaultKnowledgeBase: config?.defaultKnowledgeBase || 'default',
      enableLogging: config?.enableLogging !== false
    };
    
    if (!ragService) {
      throw new Error('RAG service instance is required');
    }
    
    // 初始化偏好存储
    this.preferenceStorage = new PreferenceStorage();
    
    logger.info('✅ RAGMemoryService initialized', {
      defaultKnowledgeBase: this.config.defaultKnowledgeBase
    });
  }
  
  /**
   * 保存记忆
   * @param memory - 记忆对象
   */
  async save(memory: Memory): Promise<void> {
    try {
      if (!memory.content || memory.content.trim().length === 0) {
        logger.warn('⚠️ Attempted to save empty memory, skipping');
        return;
      }
      
      // 确定知识库名称
      const knowledgeBase = memory.metadata?.knowledgeBase ||
                           this.config.defaultKnowledgeBase;
      const storageKnowledgeBase = this.normalizeKnowledgeBaseName(knowledgeBase);
      
      if (knowledgeBase !== storageKnowledgeBase) {
        logger.debug('[RAGMemoryService] Knowledge base sanitized', {
          original: knowledgeBase,
          sanitized: storageKnowledgeBase
        });
      }
      
      // 构建RAG文档对象
      // RAG服务接口：addDocument({ content, knowledgeBase, metadata })
      const doc: any = {
        content: memory.content,
        knowledgeBase: storageKnowledgeBase,
        metadata: {
          ...memory.metadata,
          userId: memory.userId,
          timestamp: memory.timestamp || Date.now(),
          source: memory.metadata?.source || 'chat',
          knowledgeBase,
          storageKnowledgeBase
        }
      };
      
      // 如果有ID，设置ID（如果RAG服务支持）
      if (memory.id) {
        doc.id = memory.id;
      }
      
      // 调用RAG服务的addDocument方法
      // RAG服务接口定义：addDocument(doc: RAGDocument): Promise<void>
      if (this.ragService.addDocument) {
        await this.ragService.addDocument(doc);
      } else {
        // 如果没有addDocument方法，记录警告但不抛出错误（容错）
        logger.warn('⚠️ RAG service does not have addDocument method, memory not saved');
        return;
      }
      
      if (this.config.enableLogging) {
        logger.debug(`💾 Saved memory to knowledge base: ${knowledgeBase}`, {
          contentLength: memory.content.length,
          userId: memory.userId
        });
      }
      
    } catch (error: any) {
      logger.error(`❌ Failed to save memory:`, error);
      // 不抛出错误，允许系统继续运行（容错设计）
      throw error;
    }
  }
  
  /**
   * 检索记忆
   * @param query - 检索查询文本
   * @param context - 检索上下文
   * @returns 相关记忆数组
   */
  async recall(query: string, context?: MemoryContext): Promise<Memory[]> {
    try {
      if (!query || query.trim().length === 0) {
        return [];
      }
      
      // 确定知识库名称
      const knowledgeBase = context?.knowledgeBase ||
                           this.config.defaultKnowledgeBase;
      const storageKnowledgeBase = this.normalizeKnowledgeBaseName(knowledgeBase);
      
      // 构建RAG搜索选项
      // RAG服务接口：search(options: RAGSearchOptions): Promise<RAGResult[]>
      // RAGSearchOptions: { knowledgeBase, query, k?, threshold? }
      const searchOptions: any = {
        knowledgeBase: storageKnowledgeBase,
        query: query,
        k: context?.limit || 10
      };
      
      // threshold 参数（如果提供）
      if (context?.threshold !== undefined) {
        searchOptions.threshold = context.threshold;
      }
      
      // 如果有用户ID，添加到元数据过滤（如果RAG服务支持）
      if (context?.userId && searchOptions.metadataFilter === undefined) {
        searchOptions.metadataFilter = {
          userId: context.userId
        };
      }
      
      // 调用RAG服务的search方法
      if (!this.ragService.search) {
        logger.warn('⚠️ RAG service does not have search method');
        return [];
      }
      
      const ragResults = await this.ragService.search(searchOptions);
      
      // 转换RAG结果为Memory对象
      const memories: Memory[] = ragResults.map((result: any) => {
        return {
          id: result.id,
          content: result.content || result.text || '',
          userId: result.metadata?.userId,
          timestamp: result.metadata?.timestamp || result.timestamp,
          metadata: {
            ...result.metadata,
            score: result.score,  // 相似度分数
            source: result.metadata?.source || 'rag',
            knowledgeBase: result.metadata?.knowledgeBase || knowledgeBase,
            storageKnowledgeBase: storageKnowledgeBase
          }
        };
      });
      
      if (this.config.enableLogging) {
        logger.debug(`🔍 Recalled ${memories.length} memories`, {
          query: query.substring(0, 50),
          knowledgeBase: knowledgeBase,
          userId: context?.userId
        });
      }
      
      return memories;
      
    } catch (error: any) {
      logger.error(`❌ Failed to recall memories:`, error);
      // 返回空数组而不是抛出错误（容错设计）
      return [];
    }
  }
  
  /**
   * 记录情感（可选方法）
   * @param userId - 用户ID
   * @param emotion - 情感信息
   * @param context - 上下文信息
   */
  async recordEmotion(userId: string, emotion: Emotion, context: string): Promise<void> {
    try {
      // 构建记忆内容（包含情感和上下文）
      const content = `用户情感记录: 类型=${emotion.type}, 强度=${emotion.intensity.toFixed(2)}`;
      
      // 构建Memory对象
      const memory: Memory = {
        content: context || content,
        userId: userId,
        timestamp: Date.now(),
        metadata: {
          source: 'emotion',
          emotion: {
            type: emotion.type,
            intensity: emotion.intensity,
            confidence: emotion.confidence
          },
          tags: [`emotion:${emotion.type}`]
        }
      };
      
      // 调用save方法保存
      await this.save(memory);
      
      if (this.config.enableLogging) {
        logger.debug(`💭 Recorded emotion: ${emotion.type} (intensity: ${emotion.intensity})`, {
          userId,
          context: context.substring(0, 50)
        });
      }
    } catch (error: any) {
      logger.error(`❌ Failed to record emotion:`, error);
      // 不抛出错误，允许系统继续运行（容错设计）
    }
  }

  /**
   * 学习偏好（可选方法）
   * @param userId - 用户ID
   * @param preference - 偏好信息
   */
  async learnPreference(userId: string, preference: Preference): Promise<void> {
    try {
      if (!userId || !preference || !preference.type) {
        logger.warn('⚠️ Invalid preference data, skipping');
        return;
      }

      // 使用PreferenceStorage保存偏好
      const storedPreference = await this.preferenceStorage.savePreference(userId, preference);

      if (this.config.enableLogging) {
        logger.debug(`📚 Learned preference: ${preference.type} = ${JSON.stringify(preference.value)}`, {
          userId,
          confidence: preference.confidence ?? 0.5,
          storedId: storedPreference.id
        });
      }

      // 可选：同时将偏好作为记忆保存到RAG（用于后续检索）
      // 这样在检索时可以通过偏好信息增强记忆检索
      const preferenceMemory: Memory = {
        content: `用户偏好: ${preference.type} = ${JSON.stringify(preference.value)}${preference.context ? ` (${preference.context})` : ''}`,
        userId: userId,
        timestamp: Date.now(),
        metadata: {
          source: 'preference',
          preferenceType: preference.type,
          preferenceValue: preference.value,
          confidence: preference.confidence ?? 0.5,
          tags: [`preference:${preference.type}`]
        }
      };

      // 保存偏好记忆（不阻塞，容错设计）
      try {
        await this.save(preferenceMemory);
      } catch (error: any) {
        logger.warn(`⚠️ Failed to save preference as memory: ${error.message}`);
        // 继续执行，不影响偏好存储
      }

    } catch (error: any) {
      logger.error(`❌ Failed to learn preference:`, error);
      // 不抛出错误，允许系统继续运行（容错设计）
    }
  }

  /**
   * 获取用户偏好（辅助方法）
   */
  async getUserPreferences(userId: string): Promise<any[]> {
    try {
      return await this.preferenceStorage.getUserPreferences(userId);
    } catch (error: any) {
      logger.error(`❌ Failed to get user preferences:`, error);
      return [];
    }
  }

  /**
   * 构建时间线（可选方法）
   * @param userId - 用户ID
   * @param days - 时间范围（天数，默认30天）
   * @returns 时间线事件数组
   */
  async buildTimeline(userId: string, days: number = 30): Promise<TimelineEvent[]> {
    try {
      if (!userId) {
        logger.warn('⚠️ User ID is required for timeline building');
        return [];
      }

      // 计算时间范围
      const now = Date.now();
      const startTime = now - (days * 24 * 60 * 60 * 1000);

      // 使用通用查询词来检索该用户的所有记忆
      // 注意：RAG服务可能不支持直接的时间范围过滤，所以我们需要检索更多结果，然后在内存中过滤
      // 使用多个通用查询词来尽可能获取更多记忆
      const searchQueries = ['记忆', '对话', '用户', '今天', '昨天']; // 使用多个查询词
      const searchOptions: any = {
        knowledgeBase: this.normalizeKnowledgeBaseName(this.config.defaultKnowledgeBase),
        k: 500, // 每次查询检索足够多的结果
        metadataFilter: {
          userId: userId
        }
      };

      // 尝试检索记忆（使用多个查询词合并结果）
      let memories: Memory[] = [];
      const memoryMap = new Map<string, Memory>(); // 用于去重
      
      if (this.ragService.search) {
        // 使用多个查询词来获取尽可能多的记忆
        for (const query of searchQueries) {
          try {
            const searchOpts = {
              ...searchOptions,
              query: query
            };
            
            const ragResults = await this.ragService.search(searchOpts);
            
            ragResults.forEach((result: any) => {
              const memoryId = result.id || `${result.timestamp || Date.now()}-${result.content?.substring(0, 20)}`;
              
              // 去重：如果已存在，跳过或更新
              if (!memoryMap.has(memoryId)) {
                const memory: Memory = {
                  id: result.id || memoryId,
                  content: result.content || result.text || '',
                  userId: result.metadata?.userId,
                  timestamp: result.metadata?.timestamp || result.timestamp || 0,
                  metadata: {
                    ...result.metadata,
                    score: result.score,
                    source: result.metadata?.source || 'rag'
                  }
                };
                memoryMap.set(memoryId, memory);
              }
            });
          } catch (error: any) {
            // 某个查询失败，继续下一个
            logger.debug(`⚠️ Search query "${query}" failed: ${error.message}`);
          }
        }
        
        // 转换为数组
        memories = Array.from(memoryMap.values());
        
        if (memories.length === 0) {
          logger.debug(`⚠️ No memories found for user ${userId} with any query`);
          return [];
        }
      } else {
        logger.warn('⚠️ RAG service does not have search method');
        return [];
      }

      // 过滤时间范围
      memories = memories.filter(memory => {
        const timestamp = memory.timestamp || 0;
        return timestamp >= startTime && timestamp <= now;
      });

      // 按时间戳排序（从旧到新）
      memories.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      // 转换为TimelineEvent格式
      const timelineEvents: TimelineEvent[] = memories.map((memory, index) => {
        // 确定事件类型（基于metadata.source或其他标识）
        let eventType = 'chat'; // 默认类型
        
        if (memory.metadata?.source === 'emotion') {
          eventType = 'emotion';
        } else if (memory.metadata?.source === 'preference') {
          eventType = 'preference';
        } else if (memory.metadata?.source) {
          eventType = memory.metadata.source;
        }

        // 构建事件内容
        let eventContent = memory.content;
        
        // 如果是情感事件，添加情感信息到内容
        if (memory.metadata?.emotion) {
          const emotion = memory.metadata.emotion;
          eventContent = `情感: ${emotion.type} (强度: ${emotion.intensity?.toFixed(2) || 'N/A'})`;
          if (memory.content && memory.content !== eventContent) {
            eventContent += ` - ${memory.content}`;
          }
        }

        // 如果是偏好事件，格式化偏好信息
        if (memory.metadata?.preferenceType) {
          eventContent = `偏好: ${memory.metadata.preferenceType} = ${JSON.stringify(memory.metadata.preferenceValue)}`;
          if (memory.content && !memory.content.startsWith('用户偏好')) {
            eventContent += ` - ${memory.content}`;
          }
        }

        return {
          id: memory.id || `timeline-${memory.timestamp || Date.now()}-${index}`,
          type: eventType,
          content: eventContent,
          timestamp: memory.timestamp || Date.now(),
          metadata: {
            ...memory.metadata,
            userId: memory.userId,
            originalContent: memory.content
          }
        };
      });

      if (this.config.enableLogging) {
        logger.debug(`📅 Built timeline with ${timelineEvents.length} events`, {
          userId,
          days,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(now).toISOString()
        });
      }

      return timelineEvents;

    } catch (error: any) {
      logger.error(`❌ Failed to build timeline:`, error);
      // 返回空数组而不是抛出错误（容错设计）
      return [];
    }
  }

  /**
   * 获取RAG服务实例（供需要直接访问的场景使用）
   */
  getRAGService(): any {
    return this.ragService;
  }

  /**
   * 将知识库名称转换为文件系统安全的形式
   */
  private normalizeKnowledgeBaseName(name?: string): string {
    const fallback = this.config.defaultKnowledgeBase || 'default';
    if (!name || name.trim().length === 0) {
      return fallback;
    }

    const sanitized = name.replace(this.INVALID_KB_CHAR_PATTERN, '_').trim();
    return sanitized.length > 0 ? sanitized : fallback;
  }
}

