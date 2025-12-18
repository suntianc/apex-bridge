/**
 * SimilarityService 单元测试
 */

import { SimilarityService } from '../../src/services/SimilarityService';
import { TypeVocabularyService } from '../../src/services/TypeVocabularyService';

describe('SimilarityService', () => {
  let similarityService: SimilarityService;
  let vocabularyService: TypeVocabularyService;

  beforeAll(async () => {
    similarityService = SimilarityService.getInstance();
    vocabularyService = TypeVocabularyService.getInstance();

    // 创建测试标签
    const testTags = [
      {
        tag_name: 'test_tag_1',
        keywords: ['快速', '迭代', '敏捷'],
        confidence: 0.9,
        first_identified: Date.now(),
        playbook_count: 10,
        discovered_from: 'manual_creation' as const
      },
      {
        tag_name: 'test_tag_2',
        keywords: ['敏捷', '执行', '灵活'],
        confidence: 0.85,
        first_identified: Date.now(),
        playbook_count: 8,
        discovered_from: 'manual_creation' as const
      },
      {
        tag_name: 'test_tag_3',
        keywords: ['数据分析', '决策', '监控'],
        confidence: 0.88,
        first_identified: Date.now(),
        playbook_count: 12,
        discovered_from: 'manual_creation' as const
      }
    ];

    for (const tag of testTags) {
      try {
        await vocabularyService.createTag(tag);
      } catch (error: any) {
        // 忽略已存在的标签
        if (!error.message.includes('already exists')) {
          throw error;
        }
      }
    }
  });

  afterAll(() => {
    // 清理测试数据
    similarityService.close();
    vocabularyService.close();
  });

  describe('calculateSimilarity', () => {
    it('应该计算两个标签的相似度', async () => {
      const similarity = await similarityService.calculateSimilarity(
        'test_tag_1',
        'test_tag_2'
      );

      expect(similarity).toBeGreaterThanOrEqual(0);
      expect(similarity).toBeLessThanOrEqual(1);
      expect(typeof similarity).toBe('number');
    });

    it('应该返回相同的相似度无论标签顺序', async () => {
      const similarity1 = await similarityService.calculateSimilarity(
        'test_tag_1',
        'test_tag_2'
      );
      const similarity2 = await similarityService.calculateSimilarity(
        'test_tag_2',
        'test_tag_1'
      );

      expect(similarity1).toBe(similarity2);
    });

    it('应该缓存相似度结果', async () => {
      const similarity1 = await similarityService.calculateSimilarity(
        'test_tag_1',
        'test_tag_3'
      );

      const similarity2 = await similarityService.calculateSimilarity(
        'test_tag_1',
        'test_tag_3'
      );

      expect(similarity1).toBe(similarity2);
    });
  });

  describe('getSimilarTags', () => {
    it('应该返回相似标签列表', async () => {
      const similarTags = await similarityService.getSimilarTags(
        'test_tag_1',
        0.0
      );

      expect(Array.isArray(similarTags)).toBe(true);
      expect(similarTags.length).toBeGreaterThan(0);

      for (const tag of similarTags) {
        expect(tag).toHaveProperty('tag1');
        expect(tag).toHaveProperty('tag2');
        expect(tag).toHaveProperty('similarity_score');
        expect(tag.similarity_score).toBeGreaterThanOrEqual(0);
        expect(tag.similarity_score).toBeLessThanOrEqual(1);
      }
    });

    it('应该按相似度降序排列', async () => {
      const similarTags = await similarityService.getSimilarTags(
        'test_tag_1',
        0.0
      );

      for (let i = 0; i < similarTags.length - 1; i++) {
        expect(similarTags[i].similarity_score).toBeGreaterThanOrEqual(
          similarTags[i + 1].similarity_score
        );
      }
    });

    it('应该根据阈值过滤结果', async () => {
      const allTags = await similarityService.getSimilarTags(
        'test_tag_1',
        0.0
      );
      const highSimilarityTags = await similarityService.getSimilarTags(
        'test_tag_1',
        0.7
      );

      expect(highSimilarityTags.length).toBeLessThanOrEqual(allTags.length);
    });
  });

  describe('updateSimilarity', () => {
    it('应该更新相似度分数', async () => {
      const newScore = 0.75;

      await similarityService.updateSimilarity(
        'test_tag_1',
        'test_tag_2',
        newScore
      );

      const similarity = await similarityService.calculateSimilarity(
        'test_tag_1',
        'test_tag_2'
      );

      expect(similarity).toBeCloseTo(newScore, 2);
    });

    it('应该拒绝无效的分数', async () => {
      await expect(
        similarityService.updateSimilarity('test_tag_1', 'test_tag_2', 1.5)
      ).rejects.toThrow('Similarity score must be in range [0, 1]');

      await expect(
        similarityService.updateSimilarity('test_tag_1', 'test_tag_2', -0.1)
      ).rejects.toThrow('Similarity score must be in range [0, 1]');
    });
  });

  describe('incrementCoOccurrence', () => {
    it('应该增加共现次数', async () => {
      await similarityService.incrementCoOccurrence(
        'test_tag_1',
        'test_tag_3'
      );

      const similarTags = await similarityService.getSimilarTags(
        'test_tag_1',
        0.0
      );

      const targetTag = similarTags.find(
        tag => tag.tag2 === 'test_tag_3' || tag.tag1 === 'test_tag_3'
      );

      expect(targetTag).toBeDefined();
      expect(targetTag!.co_occurrence_count).toBeGreaterThan(0);
    });

    it('不应该增加同一标签的共现', async () => {
      const initialSimilarTags = await similarityService.getSimilarTags(
        'test_tag_1',
        0.0
      );

      await similarityService.incrementCoOccurrence('test_tag_1', 'test_tag_1');

      const afterSimilarTags = await similarityService.getSimilarTags(
        'test_tag_1',
        0.0
      );

      expect(initialSimilarTags.length).toBe(afterSimilarTags.length);
    });
  });

  describe('calculateJaccardSimilarity', () => {
    it('应该正确计算 Jaccard 相似度', () => {
      const set1 = ['a', 'b', 'c'];
      const set2 = ['b', 'c', 'd'];
      const intersection = 2; // b, c
      const union = 4; // a, b, c, d
      const expected = intersection / union;

      const result = similarityService.calculateJaccardSimilarity(set1, set2);

      expect(result).toBe(expected);
    });

    it('应该处理空集合', () => {
      const result = similarityService.calculateJaccardSimilarity([], ['a', 'b']);
      expect(result).toBe(0);
    });

    it('应该处理相同集合', () => {
      const set1 = ['a', 'b', 'c'];
      const result = similarityService.calculateJaccardSimilarity(set1, set1);
      expect(result).toBe(1);
    });
  });

  describe('calculateKeywordSimilarity', () => {
    it('应该计算关键词相似度', () => {
      const keywords1 = ['快速', '迭代', '敏捷'];
      const keywords2 = ['敏捷', '执行', '灵活'];

      const result = similarityService.calculateKeywordSimilarity(
        keywords1,
        keywords2
      );

      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('应该处理大小写', () => {
      const keywords1 = ['Fast', 'Iteration'];
      const keywords2 = ['fast', 'iteration'];

      const result = similarityService.calculateKeywordSimilarity(
        keywords1,
        keywords2
      );

      expect(result).toBeGreaterThan(0);
    });
  });

  describe('缓存机制', () => {
    it('应该提供缓存统计信息', () => {
      const stats = similarityService.getCacheStats();

      expect(stats).toHaveProperty('similarityCacheSize');
      expect(stats).toHaveProperty('similarTagsCacheSize');
      expect(stats).toHaveProperty('cacheTTL');
      expect(stats.cacheTTL).toBe(5 * 60 * 1000); // 5分钟
    });

    it('应该清除过期缓存', () => {
      const beforeClear = similarityService.getCacheStats();

      similarityService.clearExpiredCache();

      const afterClear = similarityService.getCacheStats();

      // 缓存大小应该减少或保持不变
      expect(afterClear.similarityCacheSize).toBeLessThanOrEqual(
        beforeClear.similarityCacheSize
      );
    });
  });

  describe('统计信息', () => {
    it('应该提供矩阵统计信息', () => {
      const stats = similarityService.getMatrixStats();

      expect(stats).toHaveProperty('totalPairs');
      expect(stats).toHaveProperty('avgSimilarity');
      expect(stats).toHaveProperty('minSimilarity');
      expect(stats).toHaveProperty('maxSimilarity');
      expect(stats).toHaveProperty('pairsAboveThreshold');

      expect(stats.totalPairs).toBeGreaterThanOrEqual(0);
      expect(stats.avgSimilarity).toBeGreaterThanOrEqual(0);
    });
  });

  describe('错误处理', () => {
    it('应该处理不存在的标签', async () => {
      await expect(
        similarityService.calculateSimilarity('nonexistent', 'test_tag_1')
      ).rejects.toThrow();
    });

    it('应该处理相同标签的比较', async () => {
      await expect(
        similarityService.calculateSimilarity('test_tag_1', 'test_tag_1')
      ).rejects.toThrow();
    });
  });
});
