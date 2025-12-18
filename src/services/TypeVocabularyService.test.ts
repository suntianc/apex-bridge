/**
 * TypeVocabularyService 测试
 */

import { TypeVocabularyService } from './TypeVocabularyService';
import { TypeVocabulary, InducedType } from '../core/playbook/types';

describe('TypeVocabularyService', () => {
  let service: TypeVocabularyService;

  beforeAll(() => {
    service = TypeVocabularyService.getInstance();
  });

  afterAll(() => {
    service.close();
  });

  describe('createTag', () => {
    it('should create a new type tag', async () => {
      const tag: Omit<TypeVocabulary, 'created_at' | 'updated_at'> = {
        tag_name: 'create_test_tag',
        keywords: ['test', 'keyword'],
        confidence: 0.95,
        first_identified: Date.now(),
        playbook_count: 10,
        discovered_from: 'manual_creation',
        metadata: {
          description: 'Test tag',
          usage_examples: ['example1', 'example2'],
          related_tags: [],
          decay_score: 0
        }
      };

      const result = await service.createTag(tag);

      expect(result.tag_name).toBe(tag.tag_name);
      expect(result.keywords).toEqual(tag.keywords);
      expect(result.confidence).toBe(tag.confidence);
      expect(result.playbook_count).toBe(tag.playbook_count);
      expect(result.discovered_from).toBe(tag.discovered_from);
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();

      // 清理
      await service.deleteTag('create_test_tag');
    });

    it('should throw error for invalid tag name', async () => {
      const tag: any = {
        tag_name: 'invalid tag name!',
        keywords: ['test'],
        confidence: 0.5,
        first_identified: Date.now(),
        playbook_count: 0,
        discovered_from: 'manual_creation'
      };

      await expect(service.createTag(tag)).rejects.toThrow('tag_name must be alphanumeric');
    });

    it('should throw error for invalid confidence', async () => {
      const tag: any = {
        tag_name: 'invalid_confidence_test',
        keywords: ['test'],
        confidence: 1.5,
        first_identified: Date.now(),
        playbook_count: 0,
        discovered_from: 'manual_creation'
      };

      await expect(service.createTag(tag)).rejects.toThrow('confidence must be in [0, 1]');
    });

    it('should throw error for duplicate tag', async () => {
      const tag: Omit<TypeVocabulary, 'created_at' | 'updated_at'> = {
        tag_name: 'duplicate_test_tag',
        keywords: ['test'],
        confidence: 0.5,
        first_identified: Date.now(),
        playbook_count: 0,
        discovered_from: 'manual_creation'
      };

      // 第一次创建
      await service.createTag(tag);

      // 第二次创建应该失败
      await expect(service.createTag(tag)).rejects.toThrow("Tag 'duplicate_test_tag' already exists");

      // 清理
      await service.deleteTag('duplicate_test_tag');
    });
  });

  describe('getTag', () => {
    it('should get existing tag', async () => {
      const tag: Omit<TypeVocabulary, 'created_at' | 'updated_at'> = {
        tag_name: 'get_test_tag',
        keywords: ['test'],
        confidence: 0.5,
        first_identified: Date.now(),
        playbook_count: 0,
        discovered_from: 'manual_creation'
      };
      await service.createTag(tag);

      const result = await service.getTag('get_test_tag');
      expect(result).toBeDefined();
      expect(result?.tag_name).toBe('get_test_tag');

      // 清理
      await service.deleteTag('get_test_tag');
    });

    it('should return null for non-existent tag', async () => {
      const result = await service.getTag('non_existent_tag');
      expect(result).toBeNull();
    });
  });

  describe('getAllTags', () => {
    it('should return all tags', async () => {
      const tag: Omit<TypeVocabulary, 'created_at' | 'updated_at'> = {
        tag_name: 'all_tags_test_tag',
        keywords: ['test'],
        confidence: 0.5,
        first_identified: Date.now(),
        playbook_count: 0,
        discovered_from: 'manual_creation'
      };
      await service.createTag(tag);

      const tags = await service.getAllTags();
      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length).toBeGreaterThan(0);
      expect(tags.some(t => t.tag_name === 'all_tags_test_tag')).toBe(true);

      // 清理
      await service.deleteTag('all_tags_test_tag');
    });
  });

  describe('getTagsByConfidence', () => {
    it('should return tags with confidence >= threshold', async () => {
      const tag: Omit<TypeVocabulary, 'created_at' | 'updated_at'> = {
        tag_name: 'confidence_filter_test',
        keywords: ['test'],
        confidence: 0.95,
        first_identified: Date.now(),
        playbook_count: 0,
        discovered_from: 'manual_creation'
      };
      await service.createTag(tag);

      const tags = await service.getTagsByConfidence(0.9);
      expect(tags.every(tag => tag.confidence >= 0.9)).toBe(true);

      // 清理
      await service.deleteTag('confidence_filter_test');
    });

    it('should throw error for invalid threshold', async () => {
      await expect(service.getTagsByConfidence(-0.1)).rejects.toThrow('minConfidence must be in [0, 1]');
      await expect(service.getTagsByConfidence(1.5)).rejects.toThrow('minConfidence must be in [0, 1]');
    });
  });

  describe('updateConfidence', () => {
    it('should update tag confidence', async () => {
      // 创建测试标签
      const tag: Omit<TypeVocabulary, 'created_at' | 'updated_at'> = {
        tag_name: 'confidence_test_tag',
        keywords: ['test'],
        confidence: 0.5,
        first_identified: Date.now(),
        playbook_count: 0,
        discovered_from: 'manual_creation'
      };
      await service.createTag(tag);

      await service.updateConfidence('confidence_test_tag', 0.8);
      const updatedTag = await service.getTag('confidence_test_tag');
      expect(updatedTag?.confidence).toBe(0.8);

      // 清理
      await service.deleteTag('confidence_test_tag');
    });

    it('should throw error for invalid confidence', async () => {
      const tag: Omit<TypeVocabulary, 'created_at' | 'updated_at'> = {
        tag_name: 'invalid_confidence_tag',
        keywords: ['test'],
        confidence: 0.5,
        first_identified: Date.now(),
        playbook_count: 0,
        discovered_from: 'manual_creation'
      };
      await service.createTag(tag);

      await expect(service.updateConfidence('invalid_confidence_tag', -0.1)).rejects.toThrow('newConfidence must be in [0, 1]');
      await expect(service.updateConfidence('invalid_confidence_tag', 1.5)).rejects.toThrow('newConfidence must be in [0, 1]');

      // 清理
      await service.deleteTag('invalid_confidence_tag');
    });

    it('should throw error for non-existent tag', async () => {
      await expect(service.updateConfidence('non_existent_tag', 0.5)).rejects.toThrow("Tag 'non_existent_tag' not found");
    });
  });

  describe('updatePlaybookCount', () => {
    it('should update playbook count', async () => {
      const tag: Omit<TypeVocabulary, 'created_at' | 'updated_at'> = {
        tag_name: 'count_test_tag',
        keywords: ['test'],
        confidence: 0.5,
        first_identified: Date.now(),
        playbook_count: 0,
        discovered_from: 'manual_creation'
      };
      await service.createTag(tag);

      await service.updatePlaybookCount('count_test_tag', 20);
      const updatedTag = await service.getTag('count_test_tag');
      expect(updatedTag?.playbook_count).toBe(20);

      // 清理
      await service.deleteTag('count_test_tag');
    });

    it('should throw error for negative count', async () => {
      const tag: Omit<TypeVocabulary, 'created_at' | 'updated_at'> = {
        tag_name: 'negative_count_tag',
        keywords: ['test'],
        confidence: 0.5,
        first_identified: Date.now(),
        playbook_count: 0,
        discovered_from: 'manual_creation'
      };
      await service.createTag(tag);

      await expect(service.updatePlaybookCount('negative_count_tag', -1)).rejects.toThrow('count must be non-negative');

      // 清理
      await service.deleteTag('negative_count_tag');
    });
  });

  describe('markAsDecaying', () => {
    it('should mark tag as decaying', async () => {
      const tag: Omit<TypeVocabulary, 'created_at' | 'updated_at'> = {
        tag_name: 'decay_test_tag',
        keywords: ['test'],
        confidence: 0.5,
        first_identified: Date.now(),
        playbook_count: 0,
        discovered_from: 'manual_creation'
      };
      await service.createTag(tag);

      await service.markAsDecaying('decay_test_tag');
      const updatedTag = await service.getTag('decay_test_tag');
      expect(updatedTag?.metadata?.decay_score).toBeGreaterThan(0.7);

      // 清理
      await service.deleteTag('decay_test_tag');
    });
  });

  describe('searchTagsByKeywords', () => {
    it('should search tags by keywords', async () => {
      const tag: Omit<TypeVocabulary, 'created_at' | 'updated_at'> = {
        tag_name: 'search_test_tag',
        keywords: ['search', 'keyword'],
        confidence: 0.5,
        first_identified: Date.now(),
        playbook_count: 0,
        discovered_from: 'manual_creation'
      };
      await service.createTag(tag);

      const tags = await service.searchTagsByKeywords(['search']);
      expect(tags.length).toBeGreaterThan(0);
      expect(tags.some(t => t.tag_name === 'search_test_tag')).toBe(true);

      // 清理
      await service.deleteTag('search_test_tag');
    });

    it('should return empty array for empty keywords', async () => {
      const tags = await service.searchTagsByKeywords([]);
      expect(tags).toEqual([]);
    });
  });

  describe('getDecayingTags', () => {
    it('should return decaying tags', async () => {
      const tag: Omit<TypeVocabulary, 'created_at' | 'updated_at'> = {
        tag_name: 'decay_search_tag',
        keywords: ['decay'],
        confidence: 0.5,
        first_identified: Date.now(),
        playbook_count: 0,
        discovered_from: 'manual_creation'
      };
      await service.createTag(tag);
      await service.markAsDecaying('decay_search_tag');

      const tags = await service.getDecayingTags(0.7);
      expect(Array.isArray(tags)).toBe(true);
      expect(tags.some(t => t.tag_name === 'decay_search_tag')).toBe(true);

      // 清理
      await service.deleteTag('decay_search_tag');
    });

    it('should throw error for invalid threshold', async () => {
      await expect(service.getDecayingTags(-0.1)).rejects.toThrow('threshold must be in [0, 1]');
      await expect(service.getDecayingTags(1.5)).rejects.toThrow('threshold must be in [0, 1]');
    });
  });

  describe('batchCreateTags', () => {
    it('should batch create tags', async () => {
      const inducedTypes: InducedType[] = [
        {
          tag_name: 'batch_tag_1',
          keywords: ['batch', 'test'],
          confidence: 0.85,
          sample_count: 5,
          playbook_examples: ['pb1', 'pb2'],
          rationale: 'Test batch creation',
          discovered_from: 'historical_clustering',
          created_at: Date.now()
        },
        {
          tag_name: 'batch_tag_2',
          keywords: ['batch', 'example'],
          confidence: 0.75,
          sample_count: 3,
          playbook_examples: ['pb3'],
          rationale: 'Another test',
          discovered_from: 'manual',
          created_at: Date.now()
        }
      ];

      const results = await service.batchCreateTags(inducedTypes);
      expect(results.length).toBe(2);
      expect(results[0].tag_name).toBe('batch_tag_1');
      expect(results[1].tag_name).toBe('batch_tag_2');

      // 验证标签确实被创建
      const tag1 = await service.getTag('batch_tag_1');
      const tag2 = await service.getTag('batch_tag_2');
      expect(tag1).toBeDefined();
      expect(tag2).toBeDefined();

      // 清理
      await service.deleteTag('batch_tag_1');
      await service.deleteTag('batch_tag_2');
    });

    it('should skip existing tags', async () => {
      // 先创建一个标签
      const tag: Omit<TypeVocabulary, 'created_at' | 'updated_at'> = {
        tag_name: 'existing_batch_tag',
        keywords: ['existing'],
        confidence: 0.5,
        first_identified: Date.now(),
        playbook_count: 0,
        discovered_from: 'manual_creation'
      };
      await service.createTag(tag);

      const inducedTypes: InducedType[] = [
        {
          tag_name: 'existing_batch_tag', // 已经存在
          keywords: ['existing'],
          confidence: 0.5,
          sample_count: 1,
          playbook_examples: [],
          rationale: 'Existing tag',
          discovered_from: 'manual',
          created_at: Date.now()
        }
      ];

      const results = await service.batchCreateTags(inducedTypes);
      expect(results.length).toBe(0); // 应该跳过已存在的标签

      // 清理
      await service.deleteTag('existing_batch_tag');
    });
  });

  describe('deleteTag', () => {
    it('should delete existing tag', async () => {
      const tag: Omit<TypeVocabulary, 'created_at' | 'updated_at'> = {
        tag_name: 'delete_test_tag',
        keywords: ['delete'],
        confidence: 0.5,
        first_identified: Date.now(),
        playbook_count: 0,
        discovered_from: 'manual_creation'
      };
      await service.createTag(tag);

      await service.deleteTag('delete_test_tag');
      const deletedTag = await service.getTag('delete_test_tag');
      expect(deletedTag).toBeNull();
    });

    it('should throw error for non-existent tag', async () => {
      await expect(service.deleteTag('non_existent_tag')).rejects.toThrow("Tag 'non_existent_tag' not found");
    });

    it('should not throw error for non-existent tag when throwOnNotFound is false', async () => {
      await expect(service.deleteTag('non_existent_tag', false)).resolves.not.toThrow();
    });
  });

  // 清理测试数据
  afterEach(async () => {
    const tags = await service.getAllTags();
    for (const tag of tags) {
      // 匹配所有测试创建的标签
      if (tag.tag_name.includes('test') || tag.tag_name.includes('batch') ||
          tag.tag_name.includes('confidence') || tag.tag_name.includes('count') ||
          tag.tag_name.includes('decay') || tag.tag_name.includes('search') ||
          tag.tag_name.includes('delete') || tag.tag_name.includes('invalid') ||
          tag.tag_name.startsWith('create_') || tag.tag_name.startsWith('duplicate_')) {
        try {
          await service.deleteTag(tag.tag_name, false);
        } catch (error) {
          // 忽略删除错误（可能已被删除）
        }
      }
    }
  });
});
