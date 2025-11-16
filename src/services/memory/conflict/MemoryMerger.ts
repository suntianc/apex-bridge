import {
  ContentMergeStrategy,
  MemoryConflictCandidate,
  MergeOptions,
  MergeResult,
  MetadataMergeStrategy
} from '../../../types/memory';

export class MemoryMerger {
  private readonly defaultOptions: Required<MergeOptions> = {
    contentStrategy: 'smart',
    metadataStrategy: {
      importance: 'boost',
      timestamp: 'max',
      source: 'prefer-higher',
      keywords: 'union'
    },
    importanceBoost: 0.1,
    deduplicate: true,
    deduplicationThreshold: 0.8,
    preserveHistory: true
  };

  constructor(private readonly options: MergeOptions = {}) {}

  /**
   * 合并两个记忆
   */
  merge(
    memory1: MemoryConflictCandidate,
    memory2: MemoryConflictCandidate,
    overrides?: MergeOptions
  ): MergeResult {
    const config = this.resolveOptions(overrides);
    const primary = this.selectPrimary(memory1, memory2);
    const secondary = primary === memory1 ? memory2 : memory1;

    // 1. 合并内容
    // 对于 'replace' 策略，始终使用 memory2 的内容替换 memory1 的内容
    const mergedContent =
      config.contentStrategy === 'replace'
        ? memory2.content
        : this.mergeContent(primary.content, secondary.content, config.contentStrategy);

    // 2. 合并元数据
    const mergedMetadata = this.mergeMetadata(primary, secondary, config.metadataStrategy, config);

    // 3. 去重优化
    const deduplicatedContent = config.deduplicate
      ? this.deduplicateContent(mergedContent, config.deduplicationThreshold)
      : mergedContent;

    // 4. 构建合并后的记忆
    const merged: MemoryConflictCandidate = {
      id: primary.id || secondary.id,
      userId: primary.userId,
      personaId: primary.personaId || secondary.personaId,
      householdId: primary.householdId || secondary.householdId,
      content: deduplicatedContent,
      embedding: primary.embedding || secondary.embedding,
      keywords: mergedMetadata.keywords,
      timestamp: mergedMetadata.timestamp,
      importance: mergedMetadata.importance,
      source: mergedMetadata.source
    };

    // 5. 保留合并历史（如果启用）
    if (config.preserveHistory) {
      // 在 metadata 中记录合并历史（如果 MemoryConflictCandidate 支持 metadata 字段）
      // 这里暂时不添加，因为 MemoryConflictCandidate 没有 metadata 字段
      // 可以在后续扩展中添加到类型定义
    }

    // 6. 计算统计信息
    const statistics = {
      contentLength: deduplicatedContent.length,
      keywordsCount: mergedMetadata.keywords?.length || 0,
      importanceDelta: mergedMetadata.importance
        ? mergedMetadata.importance - Math.max(primary.importance || 0, secondary.importance || 0)
        : 0,
      deduplicatedCount: config.deduplicate
        ? mergedContent.length - deduplicatedContent.length
        : 0
    };

    return {
      merged,
      statistics
    };
  }

  /**
   * 选择主要记忆（用于确定基础字段）
   */
  private selectPrimary(
    memory1: MemoryConflictCandidate,
    memory2: MemoryConflictCandidate
  ): MemoryConflictCandidate {
    // 优先选择有 embedding 的
    if (memory1.embedding && !memory2.embedding) {
      return memory1;
    }
    if (memory2.embedding && !memory1.embedding) {
      return memory2;
    }

    // 优先选择重要性更高的
    const importance1 = memory1.importance || 0;
    const importance2 = memory2.importance || 0;
    if (importance1 !== importance2) {
      return importance1 > importance2 ? memory1 : memory2;
    }

    // 优先选择时间戳更新的
    const timestamp1 = memory1.timestamp || 0;
    const timestamp2 = memory2.timestamp || 0;
    if (timestamp1 !== timestamp2) {
      return timestamp1 > timestamp2 ? memory1 : memory2;
    }

    // 默认返回第一个
    return memory1;
  }

  /**
   * 合并内容
   * @param primaryContent 主要记忆的内容（来自 selectPrimary）
   * @param secondaryContent 次要记忆的内容
   * @param strategy 合并策略
   */
  private mergeContent(
    primaryContent: string,
    secondaryContent: string,
    strategy: ContentMergeStrategy
  ): string {
    switch (strategy) {
      case 'concatenate':
        return this.concatenateContent(primaryContent, secondaryContent);
      case 'summarize':
        return this.summarizeContent(primaryContent, secondaryContent);
      case 'replace':
        // replace 策略：始终使用次要记忆的内容替换主要记忆的内容
        return secondaryContent;
      case 'smart':
      default:
        return this.smartMergeContent(primaryContent, secondaryContent);
    }
  }

  /**
   * 连接内容
   */
  private concatenateContent(content1: string, content2: string): string {
    if (!content1) return content2;
    if (!content2) return content1;
    return `${content1}\n${content2}`;
  }

  /**
   * 总结内容（简化版：提取关键信息）
   */
  private summarizeContent(content1: string, content2: string): string {
    // 简化版总结：提取共同关键词和主要信息
    // 完整版可以使用 LLM 进行总结，这里先实现基础版本
    const words1 = this.extractWords(content1);
    const words2 = this.extractWords(content2);
    const commonWords = words1.filter((w) => words2.includes(w));

    if (commonWords.length > 0) {
      return `${commonWords.join(' ')}: ${content1.substring(0, 100)}... ${content2.substring(0, 100)}...`;
    }

    // 如果没有共同词，连接两个内容
    return this.concatenateContent(content1, content2);
  }

  /**
   * 智能合并内容
   */
  private smartMergeContent(content1: string, content2: string): string {
    // 如果内容相似度高，使用总结策略
    const similarity = this.computeContentSimilarity(content1, content2);
    if (similarity > 0.7) {
      return this.summarizeContent(content1, content2);
    }

    // 如果内容差异大，使用连接策略
    return this.concatenateContent(content1, content2);
  }

  /**
   * 计算内容相似度（简化版：基于词汇重叠）
   */
  private computeContentSimilarity(content1: string, content2: string): number {
    const words1 = this.extractWords(content1);
    const words2 = this.extractWords(content2);

    if (words1.length === 0 || words2.length === 0) {
      return 0;
    }

    const set1 = new Set(words1);
    const set2 = new Set(words2);
    let overlap = 0;

    for (const word of set1) {
      if (set2.has(word)) {
        overlap++;
      }
    }

    const union = new Set([...words1, ...words2]).size;
    return union > 0 ? overlap / union : 0;
  }

  /**
   * 提取单词
   */
  private extractWords(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/u)
      .filter((w) => w.length > 1);
  }

  /**
   * 合并元数据
   */
  private mergeMetadata(
    primary: MemoryConflictCandidate,
    secondary: MemoryConflictCandidate,
    strategy: MetadataMergeStrategy,
    options: Required<MergeOptions>
  ): {
    importance?: number;
    timestamp?: number;
    source?: string;
    keywords?: string[];
  } {
    const result: {
      importance?: number;
      timestamp?: number;
      source?: string;
      keywords?: string[];
    } = {};

    // 合并重要性
    if (strategy.importance) {
      result.importance = this.mergeImportance(
        primary.importance,
        secondary.importance,
        strategy.importance,
        options.importanceBoost
      );
    }

    // 合并时间戳
    if (strategy.timestamp) {
      result.timestamp = this.mergeTimestamp(
        primary.timestamp,
        secondary.timestamp,
        strategy.timestamp
      );
    }

    // 合并来源
    if (strategy.source) {
      result.source = this.mergeSource(primary.source, secondary.source, strategy.source);
    }

    // 合并关键词
    if (strategy.keywords) {
      result.keywords = this.mergeKeywords(
        primary.keywords,
        secondary.keywords,
        strategy.keywords
      );
    }

    return result;
  }

  /**
   * 合并重要性
   */
  private mergeImportance(
    importance1: number | undefined,
    importance2: number | undefined,
    strategy: 'max' | 'average' | 'boost',
    boost: number
  ): number {
    const imp1 = importance1 || 0;
    const imp2 = importance2 || 0;

    switch (strategy) {
      case 'max':
        return Math.max(imp1, imp2);
      case 'average':
        return (imp1 + imp2) / 2;
      case 'boost':
        return Math.min(1, Math.max(imp1, imp2) + boost);
      default:
        return Math.max(imp1, imp2);
    }
  }

  /**
   * 合并时间戳
   */
  private mergeTimestamp(
    timestamp1: number | undefined,
    timestamp2: number | undefined,
    strategy: 'max' | 'min' | 'average'
  ): number {
    const ts1 = timestamp1 || 0;
    const ts2 = timestamp2 || 0;

    switch (strategy) {
      case 'max':
        return Math.max(ts1, ts2);
      case 'min':
        return Math.min(ts1, ts2);
      case 'average':
        return (ts1 + ts2) / 2;
      default:
        return Math.max(ts1, ts2);
    }
  }

  /**
   * 合并来源
   */
  private mergeSource(
    source1: string | undefined,
    source2: string | undefined,
    strategy: 'prefer-higher' | 'combine'
  ): string {
    if (!source1) return source2 || '';
    if (!source2) return source1;

    if (strategy === 'combine') {
      return `${source1},${source2}`;
    }

    // prefer-higher: 根据优先级选择（这里简化处理，实际可以使用 sourcePriority 映射）
    const priority: Record<string, number> = {
      user: 10,
      conversation: 8,
      skill: 6,
      system: 4,
      inferred: 2
    };

    const priority1 = priority[source1] || 0;
    const priority2 = priority[source2] || 0;

    return priority1 >= priority2 ? source1 : source2;
  }

  /**
   * 合并关键词
   */
  private mergeKeywords(
    keywords1: string[] | undefined,
    keywords2: string[] | undefined,
    strategy: 'union' | 'intersection' | 'prefer-more'
  ): string[] {
    const kw1 = keywords1 || [];
    const kw2 = keywords2 || [];

    switch (strategy) {
      case 'union': {
        const union = new Set([...kw1, ...kw2]);
        return Array.from(union);
      }
      case 'intersection': {
        const set1 = new Set(kw1);
        const set2 = new Set(kw2);
        return kw1.filter((k) => set2.has(k));
      }
      case 'prefer-more':
        return kw1.length >= kw2.length ? kw1 : kw2;
      default:
        return Array.from(new Set([...kw1, ...kw2]));
    }
  }

  /**
   * 去重内容
   */
  private deduplicateContent(content: string, threshold: number): string {
    // 简化版去重：移除重复的句子
    const sentences = content.split(/[。！？\n]+/u).filter((s) => s.trim().length > 0);
    const unique: string[] = [];
    const seen = new Set<string>();

    for (const sentence of sentences) {
      const normalized = sentence.trim().toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        unique.push(sentence);
      }
    }

    return unique.join('。');
  }

  /**
   * 解析选项
   */
  private resolveOptions(overrides?: MergeOptions): Required<MergeOptions> {
    const merged = {
      ...this.defaultOptions,
      ...this.options,
      ...overrides,
      metadataStrategy: {
        ...this.defaultOptions.metadataStrategy,
        ...this.options.metadataStrategy,
        ...overrides?.metadataStrategy
      }
    };
    return merged as Required<MergeOptions>;
  }
}

