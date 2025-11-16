import { SemanticMemoryService } from './SemanticMemoryService';
import { EpisodicMemoryService } from './EpisodicMemoryService';
import { Message } from '../../types';
import { logger } from '../../utils/logger';

/**
 * Prompt 结构规范
 */
export interface PromptStructure {
  /** SYSTEM 部分：Persona prompt, User Profile, Household Profile */
  system?: string;
  /** MEMORY 部分：Semantic Memory, Episodic Memory, Session Memory */
  memory?: string;
  /** USER 部分：当前用户消息 */
  user?: string;
  /** TOOL INSTR 部分：ABP 工具调用格式定义 */
  toolInstr?: string;
}

/**
 * 记忆项接口（用于智能选择）
 */
export interface MemoryItem {
  id?: string;
  content: string;
  importance?: number;
  timestamp?: number;
  similarity?: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 记忆评分结果
 */
export interface MemoryScore {
  item: MemoryItem;
  score: number;
  factors: {
    importance?: number;
    recency?: number;
    relevance?: number;
    source?: number;
  };
}

/**
 * Token 统计
 */
export interface TokenStats {
  total: number;
  system: number;
  memory: number;
  user: number;
  toolInstr: number;
  breakdown: {
    semantic?: number;
    episodic?: number;
    session?: number;
  };
}

/**
 * Prompt 构建选项
 */
export interface PromptBuilderOptions {
  /** 是否包含 User Profile（默认: true） */
  includeUserProfile?: boolean;
  /** 是否包含 Household Profile（默认: true） */
  includeHouseholdProfile?: boolean;
  /** 是否包含 Session Memory（默认: true） */
  includeSessionMemory?: boolean;
  /** Session Memory 消息数量限制（默认: 50） */
  sessionMemoryLimit?: number;
  /** Semantic Memory topK（默认: 3） */
  semanticMemoryTopK?: number;
  /** Episodic Memory topK（默认: 1） */
  episodicMemoryTopK?: number;
  /** 是否包含 TOOL INSTR（默认: true） */
  includeToolInstr?: boolean;
  /** 记忆上下文过滤选项 */
  memoryFilter?: {
    userId?: string;
    personaId?: string;
    householdId?: string;
    minImportance?: number;
  };
  /** Token 限制（默认: 无限制） */
  maxTokens?: number;
  /** 记忆评分权重配置 */
  memoryScoreWeights?: {
    importance?: number;
    recency?: number;
    relevance?: number;
    source?: number;
  };
}

/**
 * Prompt 构建器
 * 
 * 实现标准 Prompt 结构：
 * [SYSTEM]
 * - Persona prompt
 * - User Profile (可选)
 * - Household Profile (可选)
 * 
 * [MEMORY]
 * - Semantic Memory (topK=3)
 * - Episodic Memory (topK=1)
 * - Session Memory (last N)
 * 
 * [USER]
 * - 当前用户消息
 * 
 * [TOOL INSTR]
 * - ABP 工具调用格式定义
 */
export class PromptBuilder {
  private readonly defaultScoreWeights = {
    importance: 0.4,
    recency: 0.3,
    relevance: 0.2,
    source: 0.1
  };

  private readonly sourcePriority: Record<string, number> = {
    user: 10,
    conversation: 8,
    skill: 6,
    system: 4,
    inferred: 2
  };

  constructor(
    private readonly semanticMemoryService?: SemanticMemoryService,
    private readonly episodicMemoryService?: EpisodicMemoryService
  ) {}

  /**
   * 构建标准 Prompt 结构
   */
  async buildPrompt(
    messages: Message[],
    options: PromptBuilderOptions = {}
  ): Promise<PromptStructure> {
    const config = {
      includeUserProfile: options.includeUserProfile !== false,
      includeHouseholdProfile: options.includeHouseholdProfile !== false,
      includeSessionMemory: options.includeSessionMemory !== false,
      sessionMemoryLimit: options.sessionMemoryLimit || 50,
      semanticMemoryTopK: options.semanticMemoryTopK ?? 3,
      episodicMemoryTopK: options.episodicMemoryTopK ?? 1,
      includeToolInstr: options.includeToolInstr !== false,
      memoryFilter: options.memoryFilter || {},
      maxTokens: options.maxTokens,
      memoryScoreWeights: {
        ...this.defaultScoreWeights,
        ...options.memoryScoreWeights
      }
    };

    const structure: PromptStructure = {};

    // 1. 构建 SYSTEM 部分
    structure.system = await this.buildSystemSection(messages, config);

    // 2. 构建 MEMORY 部分
    structure.memory = await this.buildMemorySection(messages, config);

    // 3. 构建 USER 部分
    structure.user = this.buildUserSection(messages);

    // 4. 构建 TOOL INSTR 部分
    if (config.includeToolInstr) {
      structure.toolInstr = this.buildToolInstrSection();
    }

    return structure;
  }

  /**
   * 构建 SYSTEM 部分
   */
  private async buildSystemSection(
    messages: Message[],
    config: PromptBuilderOptions & { memoryFilter: NonNullable<PromptBuilderOptions['memoryFilter']>; memoryScoreWeights: NonNullable<PromptBuilderOptions['memoryScoreWeights']> }
  ): Promise<string> {
    const sections: string[] = [];

    // 提取现有的 system message（Persona prompt）
    const systemMessages = messages.filter((msg) => msg.role === 'system');
    if (systemMessages.length > 0) {
      sections.push(systemMessages[0].content);
    }

    // User Profile（如果启用且存在）
    if (config.includeUserProfile && config.memoryFilter.userId) {
      // 注意：User Profile 应该从 MemoryService 获取，这里暂时跳过
      // 实际实现时应该调用 memoryService.recall('user profile', ...)
    }

    // Household Profile（如果启用且存在）
    if (config.includeHouseholdProfile && config.memoryFilter.householdId) {
      // 注意：Household Profile 应该从 MemoryService 获取，这里暂时跳过
      // 实际实现时应该调用 memoryService.recall('household profile', ...)
    }

    return sections.join('\n\n');
  }

  /**
   * 构建 MEMORY 部分
   */
  private async buildMemorySection(
    messages: Message[],
    config: PromptBuilderOptions & { memoryFilter: NonNullable<PromptBuilderOptions['memoryFilter']>; memoryScoreWeights: NonNullable<PromptBuilderOptions['memoryScoreWeights']> }
  ): Promise<string> {
    const sections: string[] = [];
    const allMemories: MemoryItem[] = [];
    const lastUserMessage = this.getLastUserMessage(messages);
    const query = lastUserMessage?.content;

    // 1. 收集 Semantic Memory
    if (this.semanticMemoryService && config.memoryFilter.userId) {
      try {
        const semanticMemories = await this.recallSemanticMemory(
          query || '',
          config
        );
        allMemories.push(
          ...semanticMemories.map((mem) => ({
            id: mem.id,
            content: mem.content,
            importance: mem.importance,
            similarity: mem.similarity,
            source: 'semantic',
            metadata: { type: 'semantic' }
          } as MemoryItem))
        );
      } catch (error: any) {
        logger.debug(`[PromptBuilder] Failed to retrieve Semantic Memory: ${error.message}`);
      }
    }

    // 2. 收集 Episodic Memory
    if (this.episodicMemoryService && config.memoryFilter.userId) {
      try {
        const episodicMemories = await this.recallEpisodicMemory(config);
        allMemories.push(
          ...episodicMemories.map((mem) => ({
            id: mem.id,
            content: mem.content,
            timestamp: mem.timestamp,
            importance: mem.importance,
            source: 'episodic',
            metadata: { type: 'episodic' }
          } as MemoryItem))
        );
      } catch (error: any) {
        logger.debug(`[PromptBuilder] Failed to retrieve Episodic Memory: ${error.message}`);
      }
    }

    // 3. 智能记忆选择和排序
    const selectedMemories = this.selectMemories(allMemories, query, config);

    // 4. 按类型分组并格式化
    const semanticMemories = selectedMemories.filter((m) => m.metadata?.type === 'semantic');
    const episodicMemories = selectedMemories.filter((m) => m.metadata?.type === 'episodic');

    if (semanticMemories.length > 0) {
      const topK = config.semanticMemoryTopK ?? 3;
      const semanticContent = this.formatMemoriesForInjection(
        semanticMemories.slice(0, topK),
        '语义记忆',
        { numbered: true }
      );
      sections.push(semanticContent);
    }

    if (episodicMemories.length > 0) {
      const topK = config.episodicMemoryTopK ?? 1;
      const episodicContent = this.formatMemoriesForInjection(
        episodicMemories.slice(0, topK),
        '情景记忆',
        { numbered: true }
      );
      sections.push(episodicContent);
    }

    // 5. Session Memory (last N) - 不受 Token 限制影响（会话上下文）
    if (config.includeSessionMemory !== false) {
      const sessionMessages = this.extractSessionMemory(messages, config.sessionMemoryLimit || 50);
      if (sessionMessages.length > 0) {
        const sessionContent = sessionMessages
          .map((msg, index) => {
            const role = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? '助手' : '系统';
            return `${index + 1}. ${role}: ${msg.content}`;
          })
          .join('\n');
        sections.push(`[会话历史]\n${sessionContent}`);
      }
    }

    return sections.join('\n\n');
  }

  /**
   * 构建 USER 部分
   */
  private buildUserSection(messages: Message[]): string {
    const lastUserMessage = this.getLastUserMessage(messages);
    return lastUserMessage?.content || '';
  }

  /**
   * 构建 TOOL INSTR 部分
   */
  private buildToolInstrSection(): string {
    return `[工具调用格式]

你可以通过以下格式调用工具：

\`\`\`abp
{
  "tools": [
    {
      "name": "tool_name",
      "arguments": {
        "arg1": "value1",
        "arg2": "value2"
      }
    }
  ]
}
\`\`\`

工具调用规则：
1. 工具调用必须包含在 \`\`\`abp 代码块中
2. tools 是一个数组，可以包含多个工具调用
3. 每个工具调用必须包含 name 和 arguments
4. 参数值可以是字符串、数字、布尔值或对象`;
  }

  /**
   * 检索 Semantic Memory
   * 
   * 注意：实际实现需要生成 embedding，这里暂时返回空数组
   * 后续可以通过 VectorizerEmbeddingProvider 生成 embedding
   */
  private async recallSemanticMemory(
    query: string,
    config: PromptBuilderOptions & { memoryFilter: NonNullable<PromptBuilderOptions['memoryFilter']> }
  ): Promise<Array<{ id?: string; content: string; importance?: number; similarity?: number }>> {
    if (!this.semanticMemoryService || !config.memoryFilter.userId) {
      return [];
    }

    try {
      // TODO: 需要从 query 生成 embedding
      // 暂时返回空数组，等待 embedding 生成功能实现
      // const embedding = await this.generateEmbedding(query);
      // const results = await this.semanticMemoryService.searchSimilar(
      //   {
      //     vector: embedding,
      //     topK: config.semanticMemoryTopK,
      //     userId: config.memoryFilter.userId,
      //     personaId: config.memoryFilter.personaId,
      //     householdId: config.memoryFilter.householdId,
      //     minSimilarity: config.memoryFilter.minImportance || 0.7
      //   },
      //   {}
      // );
      // return results.results.map((result) => ({
      //   id: result.id,
      //   content: result.content,
      //   importance: (result.metadata as any)?.importance,
      //   similarity: result.similarity
      // }));
      
      return [];
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[PromptBuilder] Semantic Memory search failed: ${message}`);
      return [];
    }
  }

  /**
   * 检索 Episodic Memory
   */
  private async recallEpisodicMemory(
    config: PromptBuilderOptions & { memoryFilter: NonNullable<PromptBuilderOptions['memoryFilter']> }
  ): Promise<Array<{ id: string; content: string; timestamp: number; importance?: number }>> {
    if (!this.episodicMemoryService || !config.memoryFilter.userId) {
      return [];
    }

    try {
      const results = await this.episodicMemoryService.queryWindow(
        {
          userId: config.memoryFilter.userId,
          personaId: config.memoryFilter.personaId,
          householdId: config.memoryFilter.householdId,
          topK: config.episodicMemoryTopK ?? 1,
          window: {
            lastDays: 7 // 最近7天
          }
        },
        {}
      );

      // 应用上下文过滤
      const filtered = this.filterMemoriesByContext(results.events, config.memoryFilter);

      return filtered.map((event) => ({
        id: event.id,
        content: event.content,
        timestamp: event.timestamp,
        importance: event.importance
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[PromptBuilder] Episodic Memory query failed: ${message}`);
      return [];
    }
  }

  /**
   * 提取 Session Memory
   */
  private extractSessionMemory(messages: Message[], limit: number): Message[] {
    const nonSystemMessages = messages.filter(
      (msg) => msg.role === 'user' || msg.role === 'assistant'
    );
    return nonSystemMessages.slice(-limit);
  }

  /**
   * 获取最后一条用户消息
   */
  private getLastUserMessage(messages: Message[]): Message | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i];
      }
    }
    return undefined;
  }

  /**
   * 过滤记忆（基于上下文条件）
   */
  private filterMemoriesByContext<T extends { userId?: string; personaId?: string; householdId?: string; importance?: number }>(
    memories: T[],
    filter: PromptBuilderOptions['memoryFilter']
  ): T[] {
    if (!filter) {
      return memories;
    }

    return memories.filter((mem) => {
      // 过滤 userId
      if (filter.userId && mem.userId !== filter.userId) {
        return false;
      }

      // 过滤 personaId
      if (filter.personaId && mem.personaId !== filter.personaId) {
        return false;
      }

      // 过滤 householdId
      if (filter.householdId && mem.householdId !== filter.householdId) {
        return false;
      }

      // 过滤重要性
      if (filter.minImportance !== undefined) {
        const importance = mem.importance ?? 0;
        if (importance < filter.minImportance) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * 将 Prompt 结构转换为消息数组
   */
  toMessages(structure: PromptStructure): Message[] {
    const messages: Message[] = [];

    // SYSTEM 部分
    if (structure.system) {
      messages.push({
        role: 'system',
        content: structure.system
      });
    }

    // MEMORY 部分（追加到 system message）
    if (structure.memory) {
      if (messages.length > 0 && messages[0].role === 'system') {
        messages[0].content += `\n\n[MEMORY]\n${structure.memory}`;
      } else {
        messages.push({
          role: 'system',
          content: `[MEMORY]\n${structure.memory}`
        });
      }
    }

    // TOOL INSTR 部分（追加到 system message）
    if (structure.toolInstr) {
      if (messages.length > 0 && messages[0].role === 'system') {
        messages[0].content += `\n\n${structure.toolInstr}`;
      } else {
        messages.push({
          role: 'system',
          content: structure.toolInstr
        });
      }
    }

    // USER 部分
    if (structure.user) {
      messages.push({
        role: 'user',
        content: structure.user
      });
    }

    return messages;
  }

  /**
   * 智能记忆选择算法
   * 
   * 基于多因素评分选择最相关的记忆
   */
  selectMemories(
    memories: MemoryItem[],
    query?: string,
    options: PromptBuilderOptions = {}
  ): MemoryItem[] {
    if (memories.length === 0) {
      return [];
    }

    // 1. 评分记忆
    const scored = this.scoreMemories(memories, query, options);

    // 2. 按分数排序
    scored.sort((a, b) => b.score - a.score);

    // 3. 应用 Token 限制（如果指定）
    const maxTokens = options.maxTokens;
    if (maxTokens) {
      return this.truncateMemoriesByTokens(
        scored.map((s) => s.item),
        maxTokens,
        options
      );
    }

    // 4. 返回排序后的记忆
    return scored.map((s) => s.item);
  }

  /**
   * 记忆优先级排序
   * 
   * 基于重要性、新近度、相关性、来源类型计算综合评分
   */
  scoreMemories(
    memories: MemoryItem[],
    query?: string,
    options: PromptBuilderOptions = {}
  ): MemoryScore[] {
    const weights = {
      ...this.defaultScoreWeights,
      ...options.memoryScoreWeights
    };

    return memories.map((item) => {
      const factors: MemoryScore['factors'] = {};

      // 1. 重要性评分（0-1）
      factors.importance = item.importance ?? 0.5;

      // 2. 新近度评分（0-1，越新分数越高）
      factors.recency = this.computeRecencyScore(item.timestamp);

      // 3. 相关性评分（0-1，基于相似度或关键词匹配）
      factors.relevance = this.computeRelevanceScore(item, query);

      // 4. 来源类型评分（0-1）
      factors.source = this.computeSourceScore(item.source);

      // 5. 综合评分
      const score =
        factors.importance * weights.importance +
        factors.recency * weights.recency +
        factors.relevance * weights.relevance +
        factors.source * weights.source;

      return {
        item,
        score: Math.max(0, Math.min(1, score)),
        factors
      };
    });
  }

  /**
   * 计算新近度评分
   */
  private computeRecencyScore(timestamp?: number): number {
    if (!timestamp) {
      return 0.5; // 无时间戳时使用中等分数
    }

    const now = Date.now();
    const age = now - timestamp;
    const days = age / (1000 * 60 * 60 * 24);

    // 指数衰减：7天内为1.0，30天内为0.5，90天内为0.1，超过90天为0.05
    if (days <= 7) {
      return 1.0;
    } else if (days <= 30) {
      return 0.5 + 0.5 * Math.exp(-(days - 7) / 10);
    } else if (days <= 90) {
      return 0.1 + 0.4 * Math.exp(-(days - 30) / 30);
    } else {
      return 0.05;
    }
  }

  /**
   * 计算相关性评分
   */
  private computeRelevanceScore(item: MemoryItem, query?: string): number {
    // 如果有相似度分数，直接使用
    if (item.similarity !== undefined) {
      return item.similarity;
    }

    // 如果没有查询，使用中等分数
    if (!query) {
      return 0.5;
    }

    // 基于关键词匹配计算相关性（简化版）
    const queryWords = this.extractKeywords(query);
    const contentWords = this.extractKeywords(item.content);

    if (queryWords.size === 0 || contentWords.size === 0) {
      return 0.3;
    }

    let overlap = 0;
    for (const word of queryWords) {
      if (contentWords.has(word)) {
        overlap++;
      }
    }

    return overlap / Math.max(queryWords.size, contentWords.size);
  }

  /**
   * 计算来源类型评分
   */
  private computeSourceScore(source?: string): number {
    if (!source) {
      return 0.5;
    }

    const priority = this.sourcePriority[source] ?? 0;
    const maxPriority = Math.max(...Object.values(this.sourcePriority), 1);
    return priority / maxPriority;
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/u)
        .filter((w) => w.length > 1)
    );
  }

  /**
   * Token 控制：根据 Token 限制截断记忆
   */
  truncateMemoriesByTokens(
    memories: MemoryItem[],
    maxTokens: number,
    options: PromptBuilderOptions = {}
  ): MemoryItem[] {
    const selected: MemoryItem[] = [];
    let usedTokens = 0;

    // 预留其他部分的 Token（system, user, toolInstr 等）
    const reservedTokens = this.estimateReservedTokens(options);
    const availableTokens = maxTokens - reservedTokens;

    if (availableTokens <= 0) {
      return [];
    }

    for (const memory of memories) {
      const memoryTokens = this.estimateTokens(memory.content);
      if (usedTokens + memoryTokens <= availableTokens) {
        selected.push(memory);
        usedTokens += memoryTokens;
      } else {
        // 如果单个记忆超出限制，尝试截断
        if (usedTokens < availableTokens) {
          const remainingTokens = availableTokens - usedTokens;
          const truncated = this.truncateContentByTokens(memory.content, remainingTokens);
          if (truncated) {
            selected.push({
              ...memory,
              content: truncated
            });
          }
        }
        break;
      }
    }

    return selected;
  }

  /**
   * 估算文本的 Token 数量（简化版：使用字符数 / 4 作为近似值）
   */
  estimateTokens(text: string): number {
    if (!text) {
      return 0;
    }

    // 简化估算：中文字符按 2 tokens，英文字符按 0.25 tokens
    let tokens = 0;
    for (const char of text) {
      if (/[\u4e00-\u9fa5]/.test(char)) {
        tokens += 2;
      } else {
        tokens += 0.25;
      }
    }

    return Math.ceil(tokens);
  }

  /**
   * 估算预留 Token（system, user, toolInstr 等）
   */
  private estimateReservedTokens(options: PromptBuilderOptions): number {
    let tokens = 0;

    // System section (estimated 200 tokens)
    tokens += 200;

    // User message (estimated 100 tokens)
    tokens += 100;

    // Tool instruction (estimated 150 tokens)
    if (options.includeToolInstr !== false) {
      tokens += 150;
    }

    return tokens;
  }

  /**
   * 根据 Token 限制截断内容
   */
  private truncateContentByTokens(content: string, maxTokens: number): string {
    if (this.estimateTokens(content) <= maxTokens) {
      return content;
    }

    // 二分查找合适的截断点
    let left = 0;
    let right = content.length;
    let result = '';

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const truncated = content.substring(0, mid);
      const tokens = this.estimateTokens(truncated);

      if (tokens <= maxTokens) {
        result = truncated;
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    // 尝试在句子边界截断
    const sentenceEndRegex = /[。！？\n]/;
    let lastSentenceEnd = -1;
    for (let i = result.length - 1; i >= 0; i--) {
      if (sentenceEndRegex.test(result[i])) {
        lastSentenceEnd = i;
        break;
      }
    }
    if (lastSentenceEnd > result.length * 0.8) {
      return result.substring(0, lastSentenceEnd + 1) + '...';
    }

    return result + '...';
  }

  /**
   * 格式化记忆用于注入
   */
  formatMemoriesForInjection(
    memories: MemoryItem[],
    sectionTitle: string,
    options: {
      numbered?: boolean;
      includeMetadata?: boolean;
    } = {}
  ): string {
    if (memories.length === 0) {
      return '';
    }

    const formatted = memories.map((mem, index) => {
      let line = '';
      if (options.numbered) {
        line += `${index + 1}. `;
      }
      line += mem.content;

      if (options.includeMetadata) {
        const metadata: string[] = [];
        if (mem.importance !== undefined) {
          metadata.push(`重要性: ${mem.importance.toFixed(2)}`);
        }
        if (mem.timestamp) {
          const date = new Date(mem.timestamp);
          metadata.push(`时间: ${date.toLocaleDateString()}`);
        }
        if (mem.source) {
          metadata.push(`来源: ${mem.source}`);
        }
        if (metadata.length > 0) {
          line += ` (${metadata.join(', ')})`;
        }
      }

      return line;
    });

    return `[${sectionTitle}]\n${formatted.join('\n')}`;
  }

  /**
   * 获取 Token 统计
   */
  getTokenStats(structure: PromptStructure): TokenStats {
    const stats: TokenStats = {
      total: 0,
      system: 0,
      memory: 0,
      user: 0,
      toolInstr: 0,
      breakdown: {}
    };

    if (structure.system) {
      stats.system = this.estimateTokens(structure.system);
    }

    if (structure.memory) {
      stats.memory = this.estimateTokens(structure.memory);
      // 尝试分解记忆部分的 Token（简化版）
      // 实际实现可能需要更复杂的解析
    }

    if (structure.user) {
      stats.user = this.estimateTokens(structure.user);
    }

    if (structure.toolInstr) {
      stats.toolInstr = this.estimateTokens(structure.toolInstr);
    }

    stats.total = stats.system + stats.memory + stats.user + stats.toolInstr;

    return stats;
  }
}

