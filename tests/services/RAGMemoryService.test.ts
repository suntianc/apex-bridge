/**
 * RAGMemoryService单元测试
 */

import { RAGMemoryService } from '../../src/services/RAGMemoryService';
import { Memory, MemoryContext } from '../../src/types/memory';
import { Emotion, EmotionType } from '../../src/types/personality';

describe('RAGMemoryService', () => {
  let ragService: any;
  let memoryService: RAGMemoryService;

  beforeEach(() => {
    // 创建模拟RAG服务
    ragService = {
      addDocument: jest.fn().mockResolvedValue(undefined),
      search: jest.fn().mockResolvedValue([])
    };
    
    memoryService = new RAGMemoryService(ragService, {
      defaultKnowledgeBase: 'test-kb',
      enableLogging: false
    });
  });

  describe('构造函数', () => {
    it('应该使用提供的RAG服务初始化', () => {
      expect(memoryService).toBeDefined();
      expect(memoryService.getRAGService()).toBe(ragService);
    });

    it('应该在RAG服务缺失时抛出错误', () => {
      expect(() => {
        new RAGMemoryService(null as any);
      }).toThrow('RAG service instance is required');
    });

    it('应该使用默认配置', () => {
      const service = new RAGMemoryService(ragService);
      expect(service).toBeDefined();
    });
  });

  describe('save()方法', () => {
    it('应该保存记忆到RAG服务', async () => {
      const memory: Memory = {
        content: '这是一个测试记忆',
        userId: 'user123',
        timestamp: Date.now(),
        metadata: {
          source: 'test',
          knowledgeBase: 'test-kb'
        }
      };

      await memoryService.save(memory);

      expect(ragService.addDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '这是一个测试记忆',
          knowledgeBase: 'test-kb',
          metadata: expect.objectContaining({
            userId: 'user123',
            source: 'test'
          })
        })
      );
    });

    it('应该使用默认知识库如果没有指定', async () => {
      const memory: Memory = {
        content: '测试内容'
      };

      await memoryService.save(memory);

      expect(ragService.addDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          knowledgeBase: 'test-kb'
        })
      );
    });

    it('应该跳过空内容', async () => {
      const memory: Memory = {
        content: ''
      };

      await memoryService.save(memory);

      expect(ragService.addDocument).not.toHaveBeenCalled();
    });

    it('应该跳过仅包含空白字符的内容', async () => {
      const memory: Memory = {
        content: '   \n\t  '
      };

      await memoryService.save(memory);

      expect(ragService.addDocument).not.toHaveBeenCalled();
    });

    it('应该处理RAG服务错误', async () => {
      ragService.addDocument.mockRejectedValue(new Error('RAG service error'));

      const memory: Memory = {
        content: '测试内容'
      };

      await expect(memoryService.save(memory)).rejects.toThrow('RAG service error');
    });

    it('应该在没有addDocument方法时记录警告并返回', async () => {
      const serviceWithoutAdd = new RAGMemoryService({ search: jest.fn() });
      
      const memory: Memory = {
        content: '测试内容'
      };

      // 不应该抛出错误，应该静默返回
      await expect(serviceWithoutAdd.save(memory)).resolves.toBeUndefined();
    });
  });

  describe('recall()方法', () => {
    it('应该从RAG服务检索记忆', async () => {
      const mockResults = [
        {
          id: '1',
          content: '相关记忆1',
          score: 0.9,
          metadata: { source: 'test', timestamp: Date.now() }
        },
        {
          id: '2',
          content: '相关记忆2',
          score: 0.8,
          metadata: { source: 'test' }
        }
      ];

      ragService.search.mockResolvedValue(mockResults);

      const memories = await memoryService.recall('查询文本');

      expect(ragService.search).toHaveBeenCalledWith(
        expect.objectContaining({
          knowledgeBase: 'test-kb',
          query: '查询文本',
          k: 10
        })
      );

      expect(memories).toHaveLength(2);
      expect(memories[0]).toMatchObject({
        id: '1',
        content: '相关记忆1',
        metadata: expect.objectContaining({
          score: 0.9,
          source: 'test'
        })
      });
    });

    it('应该使用提供的上下文参数', async () => {
      const context: MemoryContext = {
        knowledgeBase: 'custom-kb',
        limit: 5,
        threshold: 0.7,
        userId: 'user123'
      };

      await memoryService.recall('查询', context);

      expect(ragService.search).toHaveBeenCalledWith(
        expect.objectContaining({
          knowledgeBase: 'custom-kb',
          k: 5,
          threshold: 0.7,
          metadataFilter: {
            userId: 'user123'
          }
        })
      );
    });

    it('应该返回空数组对于空查询', async () => {
      const memories = await memoryService.recall('');

      expect(ragService.search).not.toHaveBeenCalled();
      expect(memories).toEqual([]);
    });

    it('应该返回空数组对于空白查询', async () => {
      const memories = await memoryService.recall('   \n\t  ');

      expect(ragService.search).not.toHaveBeenCalled();
      expect(memories).toEqual([]);
    });

    it('应该在RAG服务错误时返回空数组', async () => {
      ragService.search.mockRejectedValue(new Error('RAG service error'));

      const memories = await memoryService.recall('查询');

      expect(memories).toEqual([]);
    });

    it('应该在没有search方法时返回空数组', async () => {
      const serviceWithoutSearch = new RAGMemoryService({
        addDocument: jest.fn()
      });

      const memories = await serviceWithoutSearch.recall('查询');

      expect(memories).toEqual([]);
    });

    it('应该转换不同格式的RAG结果', async () => {
      const mockResults = [
        {
          id: '1',
          text: '使用text字段的记忆', // 某些RAG实现可能使用text而非content
          score: 0.9
        },
        {
          id: '2',
          content: '使用content字段的记忆',
          score: 0.8,
          timestamp: 1234567890 // 顶层timestamp
        }
      ];

      ragService.search.mockResolvedValue(mockResults);

      const memories = await memoryService.recall('查询');

      expect(memories[0].content).toBe('使用text字段的记忆');
      expect(memories[1].content).toBe('使用content字段的记忆');
      expect(memories[1].timestamp).toBe(1234567890);
    });
  });

  describe('getRAGService()方法', () => {
    it('应该返回RAG服务实例', () => {
      const returnedService = memoryService.getRAGService();
      expect(returnedService).toBe(ragService);
    });
  });

  describe('配置选项', () => {
    it('应该使用自定义默认知识库', async () => {
      const service = new RAGMemoryService(ragService, {
        defaultKnowledgeBase: 'custom-default'
      });

      await service.recall('查询');

      expect(ragService.search).toHaveBeenCalledWith(
        expect.objectContaining({
          knowledgeBase: 'custom-default'
        })
      );
    });
  });

  describe('recordEmotion()方法', () => {
    it('应该记录情感到RAG服务', async () => {
      const emotion: Emotion = {
        type: EmotionType.HAPPY,
        intensity: 0.9,
        confidence: 0.95,
        context: '用户很开心'
      };

      await memoryService.recordEmotion('user123', emotion, '测试上下文');

      expect(ragService.addDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.any(String),
          knowledgeBase: 'test-kb',
          metadata: expect.objectContaining({
            userId: 'user123',
            source: 'emotion',
            emotion: {
              type: EmotionType.HAPPY,
              intensity: 0.9,
              confidence: 0.95
            },
            tags: ['emotion:happy']
          })
        })
      );
    });

    it('应该将context作为记忆内容', async () => {
      const emotion: Emotion = {
        type: EmotionType.SAD,
        intensity: 0.8,
        confidence: 0.9,
        context: '用户很伤心'
      };

      await memoryService.recordEmotion('user456', emotion, '这是我的心里话');

      expect(ragService.addDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '这是我的心里话',
          metadata: expect.objectContaining({
            emotion: expect.objectContaining({
              type: EmotionType.SAD,
              intensity: 0.8
            })
          })
        })
      );
    });

    it('应该处理空context', async () => {
      const emotion: Emotion = {
        type: EmotionType.ANXIOUS,
        intensity: 0.7,
        confidence: 0.85,
        context: '用户焦虑'
      };

      await memoryService.recordEmotion('user789', emotion, '');

      // 应该使用默认内容
      expect(ragService.addDocument).toHaveBeenCalled();
    });

    it('应该包含timestamp在metadata中', async () => {
      const emotion: Emotion = {
        type: EmotionType.EXCITED,
        intensity: 0.95,
        confidence: 0.98,
        context: '用户很兴奋'
      };

      await memoryService.recordEmotion('user999', emotion, 'test');

      const callArgs = ragService.addDocument.mock.calls[0][0];
      expect(callArgs.metadata.timestamp).toBeDefined();
      expect(typeof callArgs.metadata.timestamp).toBe('number');
    });
  });
});

