/**
 * Audit Logger Middleware Tests - 审计日志中间件测试
 */

import { Request, Response, NextFunction } from 'express';
import { createAuditLoggerMiddleware, logAuditEvent } from '../../../src/api/middleware/auditLoggerMiddleware';
import { logger } from '../../../src/utils/logger';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  }
}));

describe('Audit Logger Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let finishCallbacks: Array<() => void>;

  beforeEach(() => {
    finishCallbacks = [];

    mockRequest = {
      path: '/api/admin/config',
      method: 'PUT',
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent'
      },
      body: { config: { test: 'value' } },
      query: {},
      params: {},
      socket: {
        remoteAddress: '127.0.0.1'
      } as any
    } as Request;
    mockResponse = {
      statusCode: 200,
      statusMessage: 'OK',
      locals: {
        auth: {
          userId: 'test-user',
          apiKeyId: 'test-key'
        }
      },
      on: jest.fn((event: string, callback: any) => {
        if (event === 'finish') {
          finishCallbacks.push(callback);
        }
        return mockResponse as Response;
      }) as any,
      headersSent: false
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Critical Operations Detection', () => {
    it('should log config update operations', () => {
      const middleware = createAuditLoggerMiddleware({
        enabled: true,
        logSuccessfulOperations: true
      });

      const req = { ...mockRequest, path: '/api/admin/config', method: 'PUT' } as Request;

      middleware(req, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证审计日志被记录
      expect(logger.info).toHaveBeenCalledWith(
        '✅ Audit log: Operation succeeded',
        expect.objectContaining({
          eventType: 'config_update',
          path: '/api/admin/config',
          method: 'PUT',
          result: 'success'
        })
      );
    });

    it('should log node register operations', () => {
      const middleware = createAuditLoggerMiddleware({
        enabled: true,
        logSuccessfulOperations: true
      });

      const req = { ...mockRequest, path: '/api/admin/nodes', method: 'POST' } as Request;

      middleware(req, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证审计日志被记录
      expect(logger.info).toHaveBeenCalledWith(
        '✅ Audit log: Operation succeeded',
        expect.objectContaining({
          eventType: 'node_register',
          path: '/api/admin/nodes',
          method: 'POST',
          result: 'success'
        })
      );
    });

    it('should log node update operations', () => {
      const middleware = createAuditLoggerMiddleware({
        enabled: true,
        logSuccessfulOperations: true
      });

      const req = {
        ...mockRequest,
        path: '/api/admin/nodes/test-node',
        method: 'PUT',
        params: { id: 'test-node' }
      } as Request;

      middleware(req, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证审计日志被记录
      expect(logger.info).toHaveBeenCalledWith(
        '✅ Audit log: Operation succeeded',
        expect.objectContaining({
          eventType: 'node_update',
          path: '/api/admin/nodes/test-node',
          method: 'PUT',
          resourceId: 'test-node',
          result: 'success'
        })
      );
    });

    it('should log node unregister operations', () => {
      const middleware = createAuditLoggerMiddleware({
        enabled: true,
        logSuccessfulOperations: true
      });

      const req = {
        ...mockRequest,
        path: '/api/admin/nodes/test-node',
        method: 'DELETE',
        params: { id: 'test-node' }
      } as Request;

      middleware(req, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证审计日志被记录
      expect(logger.info).toHaveBeenCalledWith(
        '✅ Audit log: Operation succeeded',
        expect.objectContaining({
          eventType: 'node_unregister',
          path: '/api/admin/nodes/test-node',
          method: 'DELETE',
          resourceId: 'test-node',
          result: 'success'
        })
      );
    });

    it('should log authentication operations', () => {
      const middleware = createAuditLoggerMiddleware({
        enabled: true,
        logSuccessfulOperations: true
      });

      const req = { ...mockRequest, path: '/api/admin/auth/login', method: 'POST' } as Request;

      middleware(req, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证审计日志被记录
      expect(logger.info).toHaveBeenCalledWith(
        '✅ Audit log: Operation succeeded',
        expect.objectContaining({
          eventType: 'auth_login',
          path: '/api/admin/auth/login',
          method: 'POST',
          result: 'success'
        })
      );
    });

    it('should log personality operations', () => {
      const middleware = createAuditLoggerMiddleware({
        enabled: true,
        logSuccessfulOperations: true
      });

      const req = { ...mockRequest, path: '/api/admin/personalities', method: 'POST' } as Request;

      middleware(req, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证审计日志被记录
      expect(logger.info).toHaveBeenCalledWith(
        '✅ Audit log: Operation succeeded',
        expect.objectContaining({
          eventType: 'personality_create',
          path: '/api/admin/personalities',
          method: 'POST',
          result: 'success'
        })
      );
    });
  });

  describe('Failed Operations', () => {
    it('should log failed operations', () => {
      const middleware = createAuditLoggerMiddleware({
        enabled: true,
        logFailedOperations: true
      });

      const req = { ...mockRequest, path: '/api/admin/config', method: 'PUT' } as Request;
      mockResponse.statusCode = 400;
      mockResponse.statusMessage = 'Bad Request';

      middleware(req, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证失败的审计日志被记录
      expect(logger.warn).toHaveBeenCalledWith(
        '⚠️ Audit log: Operation failed',
        expect.objectContaining({
          eventType: 'config_update',
          path: '/api/admin/config',
          method: 'PUT',
          result: 'failure',
          error: 'Bad Request'
        })
      );
    });

    it('should not log failed operations when disabled', () => {
      const middleware = createAuditLoggerMiddleware({
        enabled: true,
        logFailedOperations: false
      });

      const req = { ...mockRequest, path: '/api/admin/config', method: 'PUT' } as Request;
      mockResponse.statusCode = 400;

      middleware(req, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证失败的审计日志没有被记录
      expect(logger.warn).not.toHaveBeenCalledWith(
        '⚠️ Audit log: Operation failed',
        expect.anything()
      );
    });
  });

  describe('Non-Critical Operations', () => {
    it('should skip non-critical operations', () => {
      const middleware = createAuditLoggerMiddleware({
        enabled: true,
        logSuccessfulOperations: true
      });

      const req = { ...mockRequest, path: '/api/non-critical', method: 'GET' } as Request;

      middleware(req, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证审计日志没有被记录
      expect(logger.info).not.toHaveBeenCalledWith(
        '✅ Audit log: Operation succeeded',
        expect.anything()
      );
    });
  });

  describe('Excluded Paths', () => {
    it('should skip excluded paths', () => {
      const middleware = createAuditLoggerMiddleware({
        enabled: true,
        excludePaths: ['/health']
      });

      const req = { ...mockRequest, path: '/health' } as Request;

      middleware(req, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证审计日志没有被记录
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('Resource ID Extraction', () => {
    it('should extract resource ID from path parameters', () => {
      const middleware = createAuditLoggerMiddleware({
        enabled: true,
        logSuccessfulOperations: true
      });

      const req = {
        ...mockRequest,
        path: '/api/admin/nodes/test-node',
        method: 'PUT',
        params: { id: 'test-node' }
      } as Request;

      middleware(req, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证资源ID被提取
      expect(logger.info).toHaveBeenCalledWith(
        '✅ Audit log: Operation succeeded',
        expect.objectContaining({
          resourceId: 'test-node',
          resourceType: 'node'
        })
      );
    });

    it('should extract resource ID from request body', () => {
      const middleware = createAuditLoggerMiddleware({
        enabled: true,
        logSuccessfulOperations: true
      });

      const req = {
        ...mockRequest,
        path: '/api/admin/config',
        method: 'PUT',
        body: { id: 'test-config' }
      } as Request;

      middleware(req, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证资源ID被提取
      expect(logger.info).toHaveBeenCalledWith(
        '✅ Audit log: Operation succeeded',
        expect.objectContaining({
          resourceId: 'test-config'
        })
      );
    });
  });

  describe('Sensitive Data Sanitization', () => {
    it('should sanitize sensitive fields in request body', () => {
      const middleware = createAuditLoggerMiddleware({
        enabled: true,
        logSuccessfulOperations: true
      });

      const req = {
        ...mockRequest,
        path: '/api/admin/config',
        method: 'PUT',
        body: {
          password: 'secret',
          apiKey: 'key-123',
          config: { test: 'value' }
        }
      } as Request;

      middleware(req, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证敏感字段被清理
      expect(logger.info).toHaveBeenCalledWith(
        '✅ Audit log: Operation succeeded',
        expect.objectContaining({
          metadata: expect.objectContaining({
            requestBody: expect.objectContaining({
              password: '***REDACTED***',
              apiKey: '***REDACTED***',
              config: { test: 'value' }
            })
          })
        })
      );
    });
  });

  describe('Manual Audit Logging', () => {
    it('should log audit events manually', () => {
      logAuditEvent({
        eventType: 'config_update',
        userId: 'test-user',
        ip: '127.0.0.1',
        path: '/api/admin/config',
        method: 'PUT',
        action: 'update',
        result: 'success'
      });

      expect(logger.info).toHaveBeenCalledWith(
        '✅ Audit log: Operation succeeded',
        expect.objectContaining({
          eventType: 'config_update',
          userId: 'test-user',
          ip: '127.0.0.1',
          path: '/api/admin/config',
          method: 'PUT',
          action: 'update',
          result: 'success'
        })
      );
    });

    it('should log failed audit events manually', () => {
      logAuditEvent({
        eventType: 'config_update',
        userId: 'test-user',
        ip: '127.0.0.1',
        path: '/api/admin/config',
        method: 'PUT',
        action: 'update',
        result: 'failure',
        error: 'Validation failed'
      });

      expect(logger.warn).toHaveBeenCalledWith(
        '⚠️ Audit log: Operation failed',
        expect.objectContaining({
          eventType: 'config_update',
          userId: 'test-user',
          ip: '127.0.0.1',
          path: '/api/admin/config',
          method: 'PUT',
          action: 'update',
          result: 'failure',
          error: 'Validation failed'
        })
      );
    });
  });

  describe('Configuration', () => {
    it('should not log when disabled', () => {
      const middleware = createAuditLoggerMiddleware({
        enabled: false
      });

      const req = { ...mockRequest, path: '/api/admin/config', method: 'PUT' } as Request;

      middleware(req, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证审计日志没有被记录
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should not log successful operations when disabled', () => {
      const middleware = createAuditLoggerMiddleware({
        enabled: true,
        logSuccessfulOperations: false
      });

      const req = { ...mockRequest, path: '/api/admin/config', method: 'PUT' } as Request;

      middleware(req, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证成功的审计日志没有被记录
      expect(logger.info).not.toHaveBeenCalledWith(
        '✅ Audit log: Operation succeeded',
        expect.anything()
      );
    });
  });
});
