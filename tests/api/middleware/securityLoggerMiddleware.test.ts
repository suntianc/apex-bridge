/**
 * Security Logger Middleware Tests - 安全日志中间件测试
 */

import { Request, Response, NextFunction } from 'express';
import { createSecurityLoggerMiddleware } from '../../../src/api/middleware/securityLoggerMiddleware';
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

describe('Security Logger Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let finishCallbacks: Array<() => void>;
  let closeCallbacks: Array<() => void>;
  let errorCallbacks: Array<(error: Error) => void>;

  beforeEach(() => {
    finishCallbacks = [];
    closeCallbacks = [];
    errorCallbacks = [];

    mockRequest = {
      path: '/test',
      method: 'GET',
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent'
      },
      body: {},
      query: {},
      params: {},
      socket: {
        remoteAddress: '127.0.0.1'
      } as any
    };
    mockResponse = {
      statusCode: 200,
      statusMessage: 'OK',
      locals: {},
      on: jest.fn((event: string, callback: any) => {
        if (event === 'finish') {
          finishCallbacks.push(callback);
        } else if (event === 'close') {
          closeCallbacks.push(callback);
        } else if (event === 'error') {
          errorCallbacks.push(callback);
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

  describe('Basic Logging', () => {
    it('should log request when enabled', () => {
      const middleware = createSecurityLoggerMiddleware({ enabled: true, logLevel: 'info' });

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证日志被调用
      expect(logger.info).toHaveBeenCalled();
    });

    it('should not log when disabled', () => {
      const middleware = createSecurityLoggerMiddleware({ enabled: false });

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证日志没有被调用
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should skip excluded paths', () => {
      const middleware = createSecurityLoggerMiddleware({
        enabled: true,
        excludePaths: ['/health']
      });

      const req = { ...mockRequest, path: '/health' } as Request;
      middleware(req, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证日志没有被调用
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('Rate Limit Violations', () => {
    it('should log rate limit violations', () => {
      const middleware = createSecurityLoggerMiddleware({
        enabled: true,
        logRateLimitViolations: true
      });

      mockResponse.statusCode = 429;
      (mockResponse.locals as any).rateLimited = true;
      (mockResponse.locals as any).rateLimit = {
        ruleId: 'test-rule',
        limit: 100,
        remaining: 0,
        reset: Date.now() + 60000
      };

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证速率限制违规被记录
      expect(logger.warn).toHaveBeenCalledWith(
        '🚨 Rate limit violation',
        expect.objectContaining({
          ip: '127.0.0.1',
          path: '/test',
          method: 'GET',
          ruleId: 'test-rule'
        })
      );
    });

    it('should not log rate limit violations when disabled', () => {
      const middleware = createSecurityLoggerMiddleware({
        enabled: true,
        logRateLimitViolations: false
      });

      mockResponse.statusCode = 429;
      (mockResponse.locals as any).rateLimited = true;

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证速率限制违规没有被记录
      expect(logger.warn).not.toHaveBeenCalledWith(
        '🚨 Rate limit violation',
        expect.anything()
      );
    });
  });

  describe('Suspicious Requests', () => {
    it('should detect and log suspicious requests', () => {
      const middleware = createSecurityLoggerMiddleware({
        enabled: true,
        logSuspiciousRequests: true,
        suspiciousPatterns: [
          {
            pattern: /<script>/i,
            reason: 'Potential XSS attempt'
          }
        ]
      });

      mockRequest.body = { input: '<script>alert("XSS")</script>' };

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证可疑请求被记录
      expect(logger.warn).toHaveBeenCalledWith(
        '⚠️ Suspicious request detected',
        expect.objectContaining({
          ip: '127.0.0.1',
          path: '/test',
          reasons: expect.arrayContaining(['Potential XSS attempt'])
        })
      );
    });

    it('should not log suspicious requests when disabled', () => {
      const middleware = createSecurityLoggerMiddleware({
        enabled: true,
        logSuspiciousRequests: false
      });

      mockRequest.body = { input: '<script>alert("XSS")</script>' };

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证可疑请求没有被记录
      expect(logger.warn).not.toHaveBeenCalledWith(
        '⚠️ Suspicious request detected',
        expect.anything()
      );
    });
  });

  describe('Error Logging', () => {
    it('should log client errors (4xx)', () => {
      const middleware = createSecurityLoggerMiddleware({
        enabled: true,
        logLevel: 'info'
      });

      mockResponse.statusCode = 400;

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证客户端错误被记录
      expect(logger.warn).toHaveBeenCalledWith(
        '⚠️ Client error',
        expect.objectContaining({
          ip: '127.0.0.1',
          path: '/test',
          statusCode: 400
        })
      );
    });

    it('should log server errors (5xx)', () => {
      const middleware = createSecurityLoggerMiddleware({
        enabled: true,
        logLevel: 'info'
      });

      mockResponse.statusCode = 500;

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证服务器错误被记录
      expect(logger.error).toHaveBeenCalledWith(
        '❌ Server error',
        expect.objectContaining({
          ip: '127.0.0.1',
          path: '/test',
          statusCode: 500
        })
      );
    });
  });

  describe('Log Level Configuration', () => {
    it('should log at debug level when configured', () => {
      const middleware = createSecurityLoggerMiddleware({
        enabled: true,
        logLevel: 'debug'
      });

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 触发 finish 事件
      finishCallbacks.forEach(callback => callback());

      // 验证调试日志被记录
      expect(logger.debug).toHaveBeenCalled();
    });
  });
});
