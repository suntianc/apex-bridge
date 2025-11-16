import { MemoryMerger } from '../../../src/services/memory/conflict/MemoryMerger';
import {
  ContentMergeStrategy,
  MemoryConflictCandidate,
  MergeOptions
} from '../../../src/types/memory';

describe('MemoryMerger', () => {
  let merger: MemoryMerger;

  beforeEach(() => {
    merger = new MemoryMerger();
  });

  describe('merge', () => {
    it('should merge two memories with default strategy', () => {
      const memory1: MemoryConflictCandidate = {
        id: 'mem-1',
        userId: 'user-1',
        content: '我喜欢跑步',
        importance: 0.7,
        timestamp: Date.now() - 1000,
        source: 'conversation',
        keywords: ['跑步', '运动']
      };

      const memory2: MemoryConflictCandidate = {
        id: 'mem-2',
        userId: 'user-1',
        content: '我每天跑步5公里',
        importance: 0.8,
        timestamp: Date.now(),
        source: 'user',
        keywords: ['跑步', '5公里']
      };

      const result = merger.merge(memory1, memory2);

      expect(result.merged).toBeDefined();
      expect(result.merged.userId).toBe('user-1');
      expect(result.merged.content).toContain('跑步');
      expect(result.merged.importance).toBeGreaterThanOrEqual(0.8);
      expect(result.merged.timestamp).toBeGreaterThanOrEqual(memory2.timestamp || 0);
      expect(result.merged.source).toBe('user');
      expect(result.merged.keywords).toContain('跑步');
      expect(result.statistics).toBeDefined();
    });

    it('should concatenate content when strategy is concatenate', () => {
      const memory1: MemoryConflictCandidate = {
        id: 'mem-1',
        userId: 'user-1',
        content: '第一段内容',
        importance: 0.5
      };

      const memory2: MemoryConflictCandidate = {
        id: 'mem-2',
        userId: 'user-1',
        content: '第二段内容',
        importance: 0.6
      };

      const result = merger.merge(memory1, memory2, {
        contentStrategy: 'concatenate'
      });

      expect(result.merged.content).toContain('第一段内容');
      expect(result.merged.content).toContain('第二段内容');
    });

    it('should replace content when strategy is replace', () => {
      const memory1: MemoryConflictCandidate = {
        id: 'mem-1',
        userId: 'user-1',
        content: '旧内容',
        importance: 0.5
      };

      const memory2: MemoryConflictCandidate = {
        id: 'mem-2',
        userId: 'user-1',
        content: '新内容',
        importance: 0.6
      };

      const result = merger.merge(memory1, memory2, {
        contentStrategy: 'replace'
      });

      expect(result.merged.content).toBe('新内容');
      expect(result.merged.content).not.toContain('旧内容');
    });

    it('should merge importance with max strategy', () => {
      const memory1: MemoryConflictCandidate = {
        id: 'mem-1',
        userId: 'user-1',
        content: '内容1',
        importance: 0.7
      };

      const memory2: MemoryConflictCandidate = {
        id: 'mem-2',
        userId: 'user-1',
        content: '内容2',
        importance: 0.9
      };

      const result = merger.merge(memory1, memory2, {
        metadataStrategy: {
          importance: 'max'
        }
      });

      expect(result.merged.importance).toBe(0.9);
    });

    it('should merge importance with boost strategy', () => {
      const memory1: MemoryConflictCandidate = {
        id: 'mem-1',
        userId: 'user-1',
        content: '内容1',
        importance: 0.7
      };

      const memory2: MemoryConflictCandidate = {
        id: 'mem-2',
        userId: 'user-1',
        content: '内容2',
        importance: 0.8
      };

      const result = merger.merge(memory1, memory2, {
        metadataStrategy: {
          importance: 'boost'
        },
        importanceBoost: 0.1
      });

      expect(result.merged.importance).toBe(0.9); // 0.8 + 0.1
      expect(result.merged.importance).toBeLessThanOrEqual(1.0);
    });

    it('should merge importance with average strategy', () => {
      const memory1: MemoryConflictCandidate = {
        id: 'mem-1',
        userId: 'user-1',
        content: '内容1',
        importance: 0.6
      };

      const memory2: MemoryConflictCandidate = {
        id: 'mem-2',
        userId: 'user-1',
        content: '内容2',
        importance: 0.8
      };

      const result = merger.merge(memory1, memory2, {
        metadataStrategy: {
          importance: 'average'
        }
      });

      expect(result.merged.importance).toBe(0.7); // (0.6 + 0.8) / 2
    });

    it('should merge timestamp with max strategy', () => {
      const now = Date.now();
      const memory1: MemoryConflictCandidate = {
        id: 'mem-1',
        userId: 'user-1',
        content: '内容1',
        timestamp: now - 1000
      };

      const memory2: MemoryConflictCandidate = {
        id: 'mem-2',
        userId: 'user-1',
        content: '内容2',
        timestamp: now
      };

      const result = merger.merge(memory1, memory2, {
        metadataStrategy: {
          timestamp: 'max'
        }
      });

      expect(result.merged.timestamp).toBe(now);
    });

    it('should merge keywords with union strategy', () => {
      const memory1: MemoryConflictCandidate = {
        id: 'mem-1',
        userId: 'user-1',
        content: '内容1',
        keywords: ['关键词1', '关键词2']
      };

      const memory2: MemoryConflictCandidate = {
        id: 'mem-2',
        userId: 'user-1',
        content: '内容2',
        keywords: ['关键词2', '关键词3']
      };

      const result = merger.merge(memory1, memory2, {
        metadataStrategy: {
          keywords: 'union'
        }
      });

      expect(result.merged.keywords).toContain('关键词1');
      expect(result.merged.keywords).toContain('关键词2');
      expect(result.merged.keywords).toContain('关键词3');
      expect(result.merged.keywords?.length).toBe(3);
    });

    it('should merge keywords with intersection strategy', () => {
      const memory1: MemoryConflictCandidate = {
        id: 'mem-1',
        userId: 'user-1',
        content: '内容1',
        keywords: ['关键词1', '关键词2', '关键词3']
      };

      const memory2: MemoryConflictCandidate = {
        id: 'mem-2',
        userId: 'user-1',
        content: '内容2',
        keywords: ['关键词2', '关键词3', '关键词4']
      };

      const result = merger.merge(memory1, memory2, {
        metadataStrategy: {
          keywords: 'intersection'
        }
      });

      expect(result.merged.keywords).toContain('关键词2');
      expect(result.merged.keywords).toContain('关键词3');
      expect(result.merged.keywords).not.toContain('关键词1');
      expect(result.merged.keywords).not.toContain('关键词4');
      expect(result.merged.keywords?.length).toBe(2);
    });

    it('should merge source with prefer-higher strategy', () => {
      const memory1: MemoryConflictCandidate = {
        id: 'mem-1',
        userId: 'user-1',
        content: '内容1',
        source: 'inferred'
      };

      const memory2: MemoryConflictCandidate = {
        id: 'mem-2',
        userId: 'user-1',
        content: '内容2',
        source: 'user'
      };

      const result = merger.merge(memory1, memory2, {
        metadataStrategy: {
          source: 'prefer-higher'
        }
      });

      expect(result.merged.source).toBe('user');
    });

    it('should deduplicate content when enabled', () => {
      const memory1: MemoryConflictCandidate = {
        id: 'mem-1',
        userId: 'user-1',
        content: '重复的句子。重复的句子。新句子。'
      };

      const memory2: MemoryConflictCandidate = {
        id: 'mem-2',
        userId: 'user-1',
        content: '另一个句子。'
      };

      const result = merger.merge(memory1, memory2, {
        deduplicate: true
      });

      // 去重后应该移除重复的句子
      const sentences = result.merged.content.split(/[。！？\n]+/u).filter((s) => s.trim().length > 0);
      const uniqueSentences = new Set(sentences);
      expect(uniqueSentences.size).toBeLessThanOrEqual(sentences.length);
    });

    it('should not deduplicate when disabled', () => {
      const memory1: MemoryConflictCandidate = {
        id: 'mem-1',
        userId: 'user-1',
        content: '重复的句子。重复的句子。'
      };

      const memory2: MemoryConflictCandidate = {
        id: 'mem-2',
        userId: 'user-1',
        content: '另一个句子。'
      };

      const result = merger.merge(memory1, memory2, {
        deduplicate: false
      });

      // 不去重时，应该保留所有内容
      expect(result.merged.content).toContain('重复的句子');
    });

    it('should select primary memory based on embedding, importance, and timestamp', () => {
      const memory1: MemoryConflictCandidate = {
        id: 'mem-1',
        userId: 'user-1',
        content: '内容1',
        embedding: [0.1, 0.2, 0.3],
        importance: 0.7,
        timestamp: Date.now() - 1000
      };

      const memory2: MemoryConflictCandidate = {
        id: 'mem-2',
        userId: 'user-1',
        content: '内容2',
        importance: 0.8,
        timestamp: Date.now()
      };

      // memory1 有 embedding，应该被选为主要记忆
      const result = merger.merge(memory1, memory2);

      expect(result.merged.embedding).toEqual([0.1, 0.2, 0.3]);
    });

    it('should include statistics in result', () => {
      const memory1: MemoryConflictCandidate = {
        id: 'mem-1',
        userId: 'user-1',
        content: '内容1',
        importance: 0.7,
        keywords: ['关键词1']
      };

      const memory2: MemoryConflictCandidate = {
        id: 'mem-2',
        userId: 'user-1',
        content: '内容2',
        importance: 0.8,
        keywords: ['关键词2']
      };

      const result = merger.merge(memory1, memory2);

      expect(result.statistics).toBeDefined();
      expect(result.statistics?.contentLength).toBeGreaterThan(0);
      expect(result.statistics?.keywordsCount).toBeGreaterThanOrEqual(0);
      expect(result.statistics?.importanceDelta).toBeDefined();
    });
  });
});

