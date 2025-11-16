/**
 * RAGMemoryService - 时间线功能测试
 */

import { RAGMemoryService } from '../../src/services/RAGMemoryService';
import { TimelineEvent } from '../../src/types/memory';
import { Memory } from '../../src/types/memory';

// Mock RAG Service
const mockRAGService = {
  search: jest.fn().mockResolvedValue([]),
  addDocument: jest.fn().mockResolvedValue(undefined)
};

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('RAGMemoryService - Timeline Building', () => {
  let memoryService: RAGMemoryService;
  const testUserId = 'test-user-timeline';

  beforeEach(() => {
    jest.clearAllMocks();
    memoryService = new RAGMemoryService(mockRAGService, {
      defaultKnowledgeBase: 'test',
      enableLogging: false
    });
  });

  describe('buildTimeline', () => {
    it('应该构建时间线', async () => {
      // 模拟RAG服务返回记忆
      const mockMemories = [
        {
          id: 'memory-1',
          content: '测试记忆1',
          metadata: {
            userId: testUserId,
            timestamp: Date.now() - 86400000, // 1天前
            source: 'chat'
          },
          score: 0.8
        },
        {
          id: 'memory-2',
          content: '测试记忆2',
          metadata: {
            userId: testUserId,
            timestamp: Date.now() - 43200000, // 12小时前
            source: 'emotion',
            emotion: {
              type: 'happy',
              intensity: 0.8
            }
          },
          score: 0.7
        }
      ];

      mockRAGService.search.mockResolvedValue(mockMemories);

      const timeline = await memoryService.buildTimeline(testUserId, 7);

      expect(Array.isArray(timeline)).toBe(true);
      expect(timeline.length).toBeGreaterThan(0);
      expect(timeline[0].type).toBeDefined();
      expect(timeline[0].content).toBeDefined();
      expect(timeline[0].timestamp).toBeDefined();
    });

    it('应该按时间排序（从旧到新）', async () => {
      const now = Date.now();
      const mockMemories = [
        {
          id: 'memory-2',
          content: '新记忆',
          metadata: {
            userId: testUserId,
            timestamp: now - 10000 // 10秒前
          },
          score: 0.8
        },
        {
          id: 'memory-1',
          content: '旧记忆',
          metadata: {
            userId: testUserId,
            timestamp: now - 86400000 // 1天前
          },
          score: 0.7
        }
      ];

      mockRAGService.search.mockResolvedValue(mockMemories);

      const timeline = await memoryService.buildTimeline(testUserId, 7);

      expect(timeline.length).toBe(2);
      expect(timeline[0].timestamp).toBeLessThanOrEqual(timeline[1].timestamp);
    });

    it('应该过滤时间范围外的记忆', async () => {
      const now = Date.now();
      const mockMemories = [
        {
          id: 'memory-recent',
          content: '最近记忆',
          metadata: {
            userId: testUserId,
            timestamp: now - 86400000 // 1天前（在7天范围内）
          },
          score: 0.8
        },
        {
          id: 'memory-old',
          content: '旧记忆',
          metadata: {
            userId: testUserId,
            timestamp: now - 10 * 24 * 60 * 60 * 1000 // 10天前（超出7天范围）
          },
          score: 0.7
        }
      ];

      mockRAGService.search.mockResolvedValue(mockMemories);

      const timeline = await memoryService.buildTimeline(testUserId, 7);

      // 应该只包含1天前的记忆，不包含10天前的
      expect(timeline.length).toBe(1);
      expect(timeline[0].id).toBe('memory-recent');
    });

    it('应该处理不同类型的记忆', async () => {
      const now = Date.now();
      const mockMemories = [
        {
          id: 'memory-chat',
          content: '对话内容',
          metadata: {
            userId: testUserId,
            timestamp: now,
            source: 'chat'
          },
          score: 0.8
        },
        {
          id: 'memory-emotion',
          content: '情感记录',
          metadata: {
            userId: testUserId,
            timestamp: now,
            source: 'emotion',
            emotion: {
              type: 'happy',
              intensity: 0.9
            }
          },
          score: 0.7
        },
        {
          id: 'memory-preference',
          content: '用户偏好',
          metadata: {
            userId: testUserId,
            timestamp: now,
            source: 'preference',
            preferenceType: 'movie_genre',
            preferenceValue: '科幻'
          },
          score: 0.6
        }
      ];

      mockRAGService.search.mockResolvedValue(mockMemories);

      const timeline = await memoryService.buildTimeline(testUserId, 7);

      expect(timeline.length).toBe(3);
      expect(timeline.some(e => e.type === 'chat')).toBe(true);
      expect(timeline.some(e => e.type === 'emotion')).toBe(true);
      expect(timeline.some(e => e.type === 'preference')).toBe(true);
    });

    it('应该对空用户ID返回空数组', async () => {
      const timeline = await memoryService.buildTimeline('', 7);
      expect(timeline.length).toBe(0);
    });
  });
});

