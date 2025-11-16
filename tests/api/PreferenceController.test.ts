/**
 * PreferenceController API测试
 * 测试偏好管理API的CRUD操作
 */

import * as preferenceController from '../../src/api/controllers/PreferenceController';
import { Request, Response } from 'express';
import { PreferenceStorage } from '../../src/utils/preferenceStorage';

// Mock Express Request和Response
const createMockRequest = (params: any = {}, query: any = {}, body: any = {}): Partial<Request> => ({
  params,
  query,
  body
});

const createMockResponse = (): Partial<Response> => {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
};

describe('PreferenceController', () => {
  const testUserId = 'test-user-123';

  describe('listPreferences', () => {
    it('应该返回用户偏好列表', async () => {
      const req = createMockRequest({}, { userId: testUserId }) as Request;
      const res = createMockResponse() as Response;

      await preferenceController.listPreferences(req, res);

      expect(res.status).not.toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalled();
      const callArgs = (res.json as jest.Mock).mock.calls[0][0];
      expect(callArgs.success).toBe(true);
      expect(Array.isArray(callArgs.preferences)).toBe(true);
    });

    it('应该对缺少userId的请求返回400', async () => {
      const req = createMockRequest({}, {}) as Request;
      const res = createMockResponse() as Response;

      try {
        await preferenceController.listPreferences(req, res);
        expect(true).toBe(false); // 应该抛出错误
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
      }
    });
  });

  describe('createPreference', () => {
    it('应该创建新偏好', async () => {
      const req = createMockRequest({}, {}, {
        userId: testUserId,
        preference: {
          type: 'movie_genre',
          value: '科幻',
          confidence: 0.8
        }
      }) as Request;
      const res = createMockResponse() as Response;

      await preferenceController.createPreference(req, res);

      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalled();
      const callArgs = (res.json as jest.Mock).mock.calls[0][0];
      expect(callArgs.success).toBe(true);
      expect(callArgs.preference).toBeDefined();
      expect(callArgs.preference.type).toBe('movie_genre');
    });
  });
});

