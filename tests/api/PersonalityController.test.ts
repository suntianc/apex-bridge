/**
 * PersonalityController API测试
 * 测试人格管理API的CRUD操作
 */

import * as personalityController from '../../src/api/controllers/PersonalityController';
import { Request, Response } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PathService } from '../../src/services/PathService';

// Mock Express Request和Response
const createMockRequest = (params: any = {}, body: any = {}): Partial<Request> => ({
  params,
  body
});

const createMockResponse = (): Partial<Response> => {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
};

describe('PersonalityController', () => {
  const pathService = PathService.getInstance();
  const personalityDir = path.join(pathService.getConfigDir(), 'personality');
  
  beforeAll(async () => {
    // 确保测试目录存在
    await fs.mkdir(personalityDir, { recursive: true });
  });

  describe('listPersonalities', () => {
    it('应该返回所有人格配置列表', async () => {
      const req = createMockRequest() as Request;
      const res = createMockResponse() as Response;

      await personalityController.listPersonalities(req, res);

      expect(res.status).not.toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalled();
      const callArgs = (res.json as jest.Mock).mock.calls[0][0];
      expect(callArgs.success).toBe(true);
      expect(Array.isArray(callArgs.personalities)).toBe(true);
    });
  });

  describe('getPersonality', () => {
    it('应该返回指定人格配置', async () => {
      const req = createMockRequest({ id: 'default' }) as Request;
      const res = createMockResponse() as Response;

      await personalityController.getPersonality(req, res);

      expect(res.status).not.toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalled();
      const callArgs = (res.json as jest.Mock).mock.calls[0][0];
      expect(callArgs.success).toBe(true);
      expect(callArgs.personality).toBeDefined();
      expect(callArgs.personality.identity.name).toBeDefined();
    });

    it('应该对不存在的人格返回404', async () => {
      const req = createMockRequest({ id: 'non-existent-personality-12345' }) as Request;
      const res = createMockResponse() as Response;

      try {
        await personalityController.getPersonality(req, res);
        // 如果成功调用，应该抛出错误
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.statusCode).toBe(404);
      }
    });
  });
});
