import { PromptBuilder, MemoryItem, MemoryScore } from '../../../src/services/memory/PromptBuilder';

describe('PromptBuilder - Memory Injection Logic', () => {
  let builder: PromptBuilder;

  beforeEach(() => {
    builder = new PromptBuilder();
  });

  describe('selectMemories', () => {
    it('should select memories based on scoring', () => {
      const memories: MemoryItem[] = [
        {
          content: 'High importance memory',
          importance: 0.9,
          timestamp: Date.now() - 1000,
          source: 'user'
        },
        {
          content: 'Low importance memory',
          importance: 0.3,
          timestamp: Date.now() - 10000,
          source: 'inferred'
        },
        {
          content: 'Medium importance memory',
          importance: 0.6,
          timestamp: Date.now() - 5000,
          source: 'conversation'
        }
      ];

      const selected = builder.selectMemories(memories, 'test query');

      expect(selected.length).toBe(3);
      // 应该按分数排序，高重要性记忆应该在前面
      expect(selected[0].content).toBe('High importance memory');
    });

    it('should prioritize recency when importance is similar', () => {
      const now = Date.now();
      const memories: MemoryItem[] = [
        {
          content: 'Old memory',
          importance: 0.5,
          timestamp: now - 30 * 24 * 60 * 60 * 1000, // 30天前
          source: 'user'
        },
        {
          content: 'Recent memory',
          importance: 0.5,
          timestamp: now - 1 * 24 * 60 * 60 * 1000, // 1天前
          source: 'user'
        }
      ];

      const selected = builder.selectMemories(memories, 'test query');

      expect(selected[0].content).toBe('Recent memory');
    });

    it('should apply token limit when specified', () => {
      const memories: MemoryItem[] = [
        {
          content: 'Short memory',
          importance: 0.8,
          timestamp: Date.now()
        },
        {
          content: 'Very long memory content that exceeds token limit and should be truncated or excluded',
          importance: 0.9,
          timestamp: Date.now()
        }
      ];

      const selected = builder.selectMemories(memories, 'test query', {
        maxTokens: 50 // 限制 Token 数量
      });

      // 应该根据 Token 限制选择记忆
      expect(selected.length).toBeLessThanOrEqual(memories.length);
    });
  });

  describe('scoreMemories', () => {
    it('should calculate scores based on multiple factors', () => {
      const memories: MemoryItem[] = [
        {
          content: 'High importance, recent, user source',
          importance: 0.9,
          timestamp: Date.now() - 1000,
          source: 'user'
        },
        {
          content: 'Low importance, old, inferred source',
          importance: 0.2,
          timestamp: Date.now() - 100 * 24 * 60 * 60 * 1000, // 100天前
          source: 'inferred'
        }
      ];

      const scored = builder.scoreMemories(memories, 'test query');

      expect(scored.length).toBe(2);
      expect(scored[0].score).toBeGreaterThan(scored[1].score);
      expect(scored[0].factors.importance).toBe(0.9);
      expect(scored[0].factors.recency).toBeGreaterThan(scored[1].factors.recency);
      expect(scored[0].factors.source).toBeGreaterThan(scored[1].factors.source);
    });

    it('should use custom weights when provided', () => {
      const memories: MemoryItem[] = [
        {
          content: 'Medium importance, old',
          importance: 0.5,
          timestamp: Date.now() - 100 * 24 * 60 * 60 * 1000, // 100天前
          source: 'user'
        },
        {
          content: 'Medium importance, recent',
          importance: 0.5,
          timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000, // 1天前
          source: 'user'
        }
      ];

      // 使用高新近度权重（忽略其他因素）
      const scoredWithRecencyWeight = builder.scoreMemories(memories, 'test query', {
        memoryScoreWeights: {
          importance: 0.0,
          recency: 1.0,
          relevance: 0.0,
          source: 0.0
        }
      });

      // 验证新近度评分（新记忆应该有更高的新近度分数）
      const recentScore = scoredWithRecencyWeight.find((s) => s.item.content.includes('recent'));
      const oldScore = scoredWithRecencyWeight.find((s) => s.item.content.includes('old'));

      expect(recentScore?.factors.recency).toBeGreaterThan(oldScore?.factors.recency || 0);
      // 高新近度权重时，新记忆应该有更高的综合分数
      expect(recentScore?.score).toBeGreaterThan(oldScore?.score || 0);
    });

    it('should calculate relevance score based on query', () => {
      const memories: MemoryItem[] = [
        {
          content: 'This is about running and exercise',
          importance: 0.5,
          timestamp: Date.now()
        },
        {
          content: 'This is about cooking and recipes',
          importance: 0.5,
          timestamp: Date.now()
        }
      ];

      const scored = builder.scoreMemories(memories, 'running exercise');

      // 与查询相关的记忆应该有更高的相关性分数
      const runningMemory = scored.find((s) => s.item.content.includes('running'));
      const cookingMemory = scored.find((s) => s.item.content.includes('cooking'));

      expect(runningMemory?.factors.relevance).toBeGreaterThan(cookingMemory?.factors.relevance || 0);
    });

    it('should use similarity score when available', () => {
      const memories: MemoryItem[] = [
        {
          content: 'Memory with similarity',
          importance: 0.5,
          similarity: 0.9,
          timestamp: Date.now()
        },
        {
          content: 'Memory without similarity',
          importance: 0.5,
          timestamp: Date.now()
        }
      ];

      const scored = builder.scoreMemories(memories, 'test query');

      const withSimilarity = scored.find((s) => s.item.similarity !== undefined);
      const withoutSimilarity = scored.find((s) => s.item.similarity === undefined);

      expect(withSimilarity?.factors.relevance).toBe(0.9);
      expect(withoutSimilarity?.factors.relevance).toBeLessThan(0.9);
    });
  });

  describe('truncateMemoriesByTokens', () => {
    it('should truncate memories to fit within token limit', () => {
      const memories: MemoryItem[] = [
        {
          content: 'Short memory',
          importance: 0.8
        },
        {
          content: 'Another short memory',
          importance: 0.7
        },
        {
          content: 'Very long memory content that should be excluded or truncated due to token limit',
          importance: 0.9
        }
      ];

      const truncated = builder.truncateMemoriesByTokens(memories, 100, {});

      expect(truncated.length).toBeLessThanOrEqual(memories.length);
      const totalTokens = truncated.reduce((sum, mem) => sum + builder.estimateTokens(mem.content), 0);
      expect(totalTokens).toBeLessThanOrEqual(100);
    });

    it('should preserve reserved tokens for other sections', () => {
      const memories: MemoryItem[] = [
        {
          content: 'Memory content',
          importance: 0.8
        }
      ];

      const truncated = builder.truncateMemoriesByTokens(memories, 500, {
        includeToolInstr: true
      });

      // 应该预留 system, user, toolInstr 的 Token
      const memoryTokens = truncated.reduce((sum, mem) => sum + builder.estimateTokens(mem.content), 0);
      expect(memoryTokens).toBeLessThan(500);
    });

    it('should truncate individual memory content when needed', () => {
      const memories: MemoryItem[] = [
        {
          content: 'This is a very long memory content that exceeds the token limit and should be truncated at sentence boundaries',
          importance: 0.9
        }
      ];

      const truncated = builder.truncateMemoriesByTokens(memories, 50, {});

      if (truncated.length > 0) {
        const tokens = builder.estimateTokens(truncated[0].content);
        expect(tokens).toBeLessThanOrEqual(50);
        expect(truncated[0].content.length).toBeLessThan(memories[0].content.length);
      }
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens for Chinese text', () => {
      const text = '这是一个中文测试文本';
      const tokens = builder.estimateTokens(text);

      // 中文字符按 2 tokens 计算
      expect(tokens).toBeGreaterThan(text.length);
    });

    it('should estimate tokens for English text', () => {
      const text = 'This is an English test text';
      const tokens = builder.estimateTokens(text);

      // 英文字符按 0.25 tokens 计算
      expect(tokens).toBeLessThan(text.length);
    });

    it('should estimate tokens for mixed text', () => {
      const text = 'This is a mixed 中文 and English text';
      const tokens = builder.estimateTokens(text);

      expect(tokens).toBeGreaterThan(0);
    });

    it('should return 0 for empty text', () => {
      const tokens = builder.estimateTokens('');
      expect(tokens).toBe(0);
    });
  });

  describe('formatMemoriesForInjection', () => {
    it('should format memories with numbering', () => {
      const memories: MemoryItem[] = [
        { content: 'Memory 1' },
        { content: 'Memory 2' },
        { content: 'Memory 3' }
      ];

      const formatted = builder.formatMemoriesForInjection(memories, '测试记忆', {
        numbered: true
      });

      expect(formatted).toContain('[测试记忆]');
      expect(formatted).toContain('1. Memory 1');
      expect(formatted).toContain('2. Memory 2');
      expect(formatted).toContain('3. Memory 3');
    });

    it('should format memories without numbering', () => {
      const memories: MemoryItem[] = [
        { content: 'Memory 1' },
        { content: 'Memory 2' }
      ];

      const formatted = builder.formatMemoriesForInjection(memories, '测试记忆', {
        numbered: false
      });

      expect(formatted).toContain('[测试记忆]');
      expect(formatted).not.toContain('1. Memory 1');
      expect(formatted).toContain('Memory 1');
    });

    it('should include metadata when enabled', () => {
      const memories: MemoryItem[] = [
        {
          content: 'Memory with metadata',
          importance: 0.8,
          timestamp: Date.now(),
          source: 'user'
        }
      ];

      const formatted = builder.formatMemoriesForInjection(memories, '测试记忆', {
        includeMetadata: true
      });

      expect(formatted).toContain('重要性: 0.80');
      expect(formatted).toContain('来源: user');
      expect(formatted).toContain('时间:');
    });

    it('should return empty string for empty memories', () => {
      const formatted = builder.formatMemoriesForInjection([], '测试记忆');
      expect(formatted).toBe('');
    });
  });

  describe('getTokenStats', () => {
    it('should calculate token statistics for prompt structure', () => {
      const structure = {
        system: 'System content',
        memory: 'Memory content with some text',
        user: 'User message',
        toolInstr: 'Tool instruction content'
      };

      const stats = builder.getTokenStats(structure);

      expect(stats.total).toBeGreaterThan(0);
      expect(stats.system).toBeGreaterThan(0);
      expect(stats.memory).toBeGreaterThan(0);
      expect(stats.user).toBeGreaterThan(0);
      expect(stats.toolInstr).toBeGreaterThan(0);
      expect(stats.total).toBe(stats.system + stats.memory + stats.user + stats.toolInstr);
    });

    it('should handle missing sections', () => {
      const structure = {
        user: 'User message only'
      };

      const stats = builder.getTokenStats(structure);

      expect(stats.total).toBe(stats.user);
      expect(stats.system).toBe(0);
      expect(stats.memory).toBe(0);
      expect(stats.toolInstr).toBe(0);
    });
  });

  describe('recency score computation', () => {
    it('should give high score for recent memories (within 7 days)', () => {
      const now = Date.now();
      const recentTimestamp = now - 1 * 24 * 60 * 60 * 1000; // 1天前
      const memory: MemoryItem = {
        content: 'Recent memory',
        timestamp: recentTimestamp
      };

      const scored = builder.scoreMemories([memory], 'test');
      expect(scored[0].factors.recency).toBe(1.0);
    });

    it('should give medium score for memories within 30 days', () => {
      const now = Date.now();
      const mediumTimestamp = now - 15 * 24 * 60 * 60 * 1000; // 15天前
      const memory: MemoryItem = {
        content: 'Medium memory',
        timestamp: mediumTimestamp
      };

      const scored = builder.scoreMemories([memory], 'test');
      expect(scored[0].factors.recency).toBeGreaterThan(0.5);
      expect(scored[0].factors.recency).toBeLessThan(1.0);
    });

    it('should give low score for old memories (over 90 days)', () => {
      const now = Date.now();
      const oldTimestamp = now - 100 * 24 * 60 * 60 * 1000; // 100天前
      const memory: MemoryItem = {
        content: 'Old memory',
        timestamp: oldTimestamp
      };

      const scored = builder.scoreMemories([memory], 'test');
      expect(scored[0].factors.recency).toBeLessThan(0.1);
    });
  });

  describe('source score computation', () => {
    it('should give highest score for user source', () => {
      const memories: MemoryItem[] = [
        { content: 'User memory', source: 'user' },
        { content: 'Conversation memory', source: 'conversation' },
        { content: 'Inferred memory', source: 'inferred' }
      ];

      const scored = builder.scoreMemories(memories, 'test');

      const userMemory = scored.find((s) => s.item.source === 'user');
      const conversationMemory = scored.find((s) => s.item.source === 'conversation');
      const inferredMemory = scored.find((s) => s.item.source === 'inferred');

      expect(userMemory?.factors.source).toBeGreaterThan(conversationMemory?.factors.source || 0);
      expect(conversationMemory?.factors.source).toBeGreaterThan(inferredMemory?.factors.source || 0);
    });
  });
});

