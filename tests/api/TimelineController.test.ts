/**
 * TimelineController API测试
 * 测试时间线管理API
 */

import * as timelineController from '../../src/api/controllers/TimelineController';
import { Request, Response } from 'express';
import { RAGMemoryService } from '../../src/services/RAGMemoryService';
import { TimelineEvent } from '../../src/types/memory';

// Mock RAG Service
const mockRAGService = {
  search: jest.fn().mockResolvedValue([])
};

// Mock Express Request和Response
const createMockRequest = (query: any = {}, memoryService?: any): Partial<Request> => {
  const req: any = {
    query,
    memoryService
  };
  return req;
};

const createMockResponse = (): Partial<Response> => {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
};

describe('TimelineController', () => {
  const testUserId = 'test-user-timeline';
  let mockMemoryService: RAGMemoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMemoryService = new RAGMemoryService(mockRAGService, {
      defaultKnowledgeBase: 'test',
      enableLogging: false
    });
  });

  describe('getTimeline', () => {
    it('应该返回用户时间线', async () => {
      // 模拟buildTimeline返回结果
      const mockTimeline: TimelineEvent[] = [
        {
          id: 'event-1',
          type: 'chat',
          content: '测试对话',
          timestamp: Date.now() - 86400000, // 1天前
          metadata: {}
        }
      ];

      mockMemoryService.buildTimeline = jest.fn().mockResolvedValue(mockTimeline);

      const req = createMockRequest({ userId: testUserId }, mockMemoryService) as Request;
      const res = createMockResponse() as Response;

      await timelineController.getTimeline(req, res);

      expect(res.json).toHaveBeenCalled();
      const callArgs = (res.json as jest.Mock).mock.calls[0][0];
      expect(callArgs.success).toBe(true);
      expect(Array.isArray(callArgs.timeline)).toBe(true);
      expect(callArgs.userId).toBe(testUserId);
    });

    it('应该支持days参数', async () => {
      mockMemoryService.buildTimeline = jest.fn().mockResolvedValue([]);

      const req = createMockRequest({ userId: testUserId, days: '7' }, mockMemoryService) as Request;
      const res = createMockResponse() as Response;

      await timelineController.getTimeline(req, res);

      expect(mockMemoryService.buildTimeline).toHaveBeenCalledWith(testUserId, 7);
    });

    it('应该对缺少userId的请求返回400', async () => {
      const req = createMockRequest({}, mockMemoryService) as Request;
      const res = createMockResponse() as Response;

      try {
        await timelineController.getTimeline(req, res);
        expect(true).toBe(false); // 应该抛出错误
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
      }
    });

    it('应该对无效的days参数返回400', async () => {
      const req = createMockRequest({ userId: testUserId, days: '-1' }, mockMemoryService) as Request;
      const res = createMockResponse() as Response;

      try {
        await timelineController.getTimeline(req, res);
        expect(true).toBe(false); // 应该抛出错误
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
      }
    });

    it('应该对缺少memoryService返回500', async () => {
      const req = createMockRequest({ userId: testUserId }, null) as Request;
      const res = createMockResponse() as Response;

      try {
        await timelineController.getTimeline(req, res);
        expect(true).toBe(false); // 应该抛出错误
      } catch (error: any) {
        expect(error.statusCode).toBe(500);
      }
    });
  });

  describe('searchTimeline', () => {
    it('应该搜索时间线事件', async () => {
      const mockTimeline: TimelineEvent[] = [
        {
          id: 'event-1',
          type: 'chat',
          content: '测试对话内容',
          timestamp: Date.now(),
          metadata: {}
        },
        {
          id: 'event-2',
          type: 'emotion',
          content: '情感记录',
          timestamp: Date.now(),
          metadata: {}
        }
      ];

      mockMemoryService.buildTimeline = jest.fn().mockResolvedValue(mockTimeline);

      const req = createMockRequest({ userId: testUserId, query: '测试' }, mockMemoryService) as Request;
      const res = createMockResponse() as Response;

      await timelineController.searchTimeline(req, res);

      expect(res.json).toHaveBeenCalled();
      const callArgs = (res.json as jest.Mock).mock.calls[0][0];
      expect(callArgs.success).toBe(true);
      expect(Array.isArray(callArgs.timeline)).toBe(true);
      expect(callArgs.query).toBe('测试');
    });

    it('应该对缺少query的请求返回400', async () => {
      const req = createMockRequest({ userId: testUserId }, mockMemoryService) as Request;
      const res = createMockResponse() as Response;

      try {
        await timelineController.searchTimeline(req, res);
        expect(true).toBe(false); // 应该抛出错误
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
      }
    });
  });
});

