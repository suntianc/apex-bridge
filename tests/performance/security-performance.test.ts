/**
 * Security Features Performance Tests
 * 
 * 验证安全功能的性能影响，确保满足 < 5ms/请求 的要求
 */

import { Request, Response, NextFunction } from 'express';
import { createRateLimitMiddleware } from '../../src/api/middleware/rateLimitMiddleware';
import { createValidationMiddleware } from '../../src/api/middleware/validationMiddleware';
import { createSanitizationMiddleware } from '../../src/api/middleware/sanitizationMiddleware';
import { createSecurityHeadersMiddleware } from '../../src/api/middleware/securityHeadersMiddleware';
import { createSecurityLoggerMiddleware } from '../../src/api/middleware/securityLoggerMiddleware';
import { InMemoryRateLimiter } from '../../src/api/middleware/rateLimit/inMemoryRateLimiter';
import { chatCompletionSchema } from '../../src/api/middleware/validationSchemas';

describe('Security Features Performance Tests', () => {
  const iterations = 1000; // 测试迭代次数
  const maxAllowedMs = 5; // 最大允许延迟（毫秒）

  // 创建模拟请求和响应
  function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
    return {
      method: 'POST',
      path: '/v1/chat',
      ip: '127.0.0.1',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer test-api-key'
      },
      body: {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }]
      },
      query: {},
      params: {},
      ...overrides
    } as Partial<Request>;
  }

  function createMockResponse(): Partial<Response> {
    const res: Partial<Response> = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      removeHeader: jest.fn().mockReturnThis(),
      getHeader: jest.fn(),
      locals: {},
      on: jest.fn((event: string, callback: () => void) => {
        // 模拟响应完成事件
        if (event === 'finish' || event === 'close' || event === 'error') {
          setTimeout(callback, 0);
        }
        return res as any;
      }),
      once: jest.fn((event: string, callback: () => void) => {
        // 模拟响应完成事件
        if (event === 'finish' || event === 'close' || event === 'error') {
          setTimeout(callback, 0);
        }
        return res as any;
      })
    };
    return res;
  }

  function createMockNext(): NextFunction {
    return jest.fn();
  }

  describe('Rate Limiting Performance', () => {
    it('should have minimal performance impact (< 5ms per request)', async () => {
      const middleware = createRateLimitMiddleware({
        limiter: new InMemoryRateLimiter()
      });

      const mockRequest = createMockRequest();
      const mockResponse = createMockResponse();
      const mockNext = createMockNext();

      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTimePerRequest = totalTime / iterations;

      console.log(`[Rate Limiting] Total: ${totalTime}ms, Avg: ${avgTimePerRequest.toFixed(3)}ms/request`);

      expect(avgTimePerRequest).toBeLessThan(maxAllowedMs);
    });

    it('should handle high concurrency efficiently', async () => {
      const middleware = createRateLimitMiddleware({
        limiter: new InMemoryRateLimiter()
      });

      const concurrentRequests = 100;
      const promises: Promise<void>[] = [];

      const startTime = Date.now();

      for (let i = 0; i < concurrentRequests; i++) {
        const mockRequest = createMockRequest({ ip: `127.0.0.${i}` });
        const mockResponse = createMockResponse();
        const mockNext = createMockNext();

        promises.push(
          middleware(mockRequest as Request, mockResponse as Response, mockNext)
        );
      }

      await Promise.all(promises);

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTimePerRequest = totalTime / concurrentRequests;

      console.log(`[Rate Limiting Concurrent] Total: ${totalTime}ms, Avg: ${avgTimePerRequest.toFixed(3)}ms/request`);

      expect(avgTimePerRequest).toBeLessThan(maxAllowedMs * 2); // 并发时允许稍高的延迟
    });
  });

  describe('Input Validation Performance', () => {
    it('should have minimal performance impact (< 5ms per request)', async () => {
      const middleware = createValidationMiddleware(chatCompletionSchema);

      const mockRequest = createMockRequest();
      const mockResponse = createMockResponse();
      const mockNext = createMockNext();

      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTimePerRequest = totalTime / iterations;

      console.log(`[Validation] Total: ${totalTime}ms, Avg: ${avgTimePerRequest.toFixed(3)}ms/request`);

      expect(avgTimePerRequest).toBeLessThan(maxAllowedMs);
    });
  });

  describe('Input Sanitization Performance', () => {
    it('should have minimal performance impact (< 5ms per request)', async () => {
      const middleware = createSanitizationMiddleware();

      const mockRequest = createMockRequest({
        body: {
          model: 'gpt-4',
          messages: [{ role: 'user', content: '<script>alert("XSS")</script>Hello' }]
        }
      });
      const mockResponse = createMockResponse();
      const mockNext = createMockNext();

      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTimePerRequest = totalTime / iterations;

      console.log(`[Sanitization] Total: ${totalTime}ms, Avg: ${avgTimePerRequest.toFixed(3)}ms/request`);

      expect(avgTimePerRequest).toBeLessThan(maxAllowedMs);
    });
  });

  describe('Security Headers Performance', () => {
    it('should have minimal performance impact (< 5ms per request)', async () => {
      const middleware = createSecurityHeadersMiddleware();

      const mockRequest = createMockRequest();
      const mockResponse = createMockResponse();
      const mockNext = createMockNext();

      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTimePerRequest = totalTime / iterations;

      console.log(`[Security Headers] Total: ${totalTime}ms, Avg: ${avgTimePerRequest.toFixed(3)}ms/request`);

      expect(avgTimePerRequest).toBeLessThan(maxAllowedMs);
    });
  });

  describe('Security Logger Performance', () => {
    it('should have minimal performance impact (< 5ms per request)', async () => {
      const middleware = createSecurityLoggerMiddleware();

      const mockRequest = createMockRequest();
      const mockResponse = createMockResponse();
      const mockNext = createMockNext();

      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTimePerRequest = totalTime / iterations;

      console.log(`[Security Logger] Total: ${totalTime}ms, Avg: ${avgTimePerRequest.toFixed(3)}ms/request`);

      expect(avgTimePerRequest).toBeLessThan(maxAllowedMs);
    });
  });

  describe('Combined Security Middleware Performance', () => {
    it('should have acceptable combined performance impact (< 10ms per request)', async () => {
      const rateLimitMiddleware = createRateLimitMiddleware({
        limiter: new InMemoryRateLimiter()
      });
      const validationMiddleware = createValidationMiddleware(chatCompletionSchema);
      const sanitizationMiddleware = createSanitizationMiddleware();
      const securityHeadersMiddleware = createSecurityHeadersMiddleware();
      const securityLoggerMiddleware = createSecurityLoggerMiddleware();

      const mockRequest = createMockRequest();
      const mockResponse = createMockResponse();
      const mockNext = createMockNext();

      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        // 模拟中间件链式调用
        await rateLimitMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
        await validationMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
        await sanitizationMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
        await securityHeadersMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
        await securityLoggerMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTimePerRequest = totalTime / iterations;

      console.log(`[Combined Security Middleware] Total: ${totalTime}ms, Avg: ${avgTimePerRequest.toFixed(3)}ms/request`);

      // 组合中间件允许稍高的延迟（< 10ms）
      expect(avgTimePerRequest).toBeLessThan(maxAllowedMs * 2);
    });
  });

  describe('Memory Usage', () => {
    it('should not cause memory leaks in rate limiter', async () => {
      const limiter = new InMemoryRateLimiter();
      const iterations = 10000;

      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < iterations; i++) {
        await limiter.hit(`test-key-${i}`, {
          id: 'test-rule',
          windowMs: 60000,
          maxRequests: 100,
          mode: 'sliding'
        });
      }

      // 等待清理周期
      await new Promise(resolve => setTimeout(resolve, 100));

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryPerRequest = memoryIncrease / iterations;

      console.log(`[Memory Usage] Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB, Per request: ${memoryPerRequest.toFixed(2)} bytes`);

      // 每个请求的内存增长应该很小（< 1KB）
      expect(memoryPerRequest).toBeLessThan(1024);
    });
  });
});

