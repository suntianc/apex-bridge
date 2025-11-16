import { Request, Response, NextFunction } from 'express';
import { createRateLimitMiddleware, RateLimitMiddlewareOptions } from '../../../src/api/middleware/rateLimitMiddleware';
import { ConfigService, RateLimitSettings, createDefaultRateLimitSettings } from '../../../src/services/ConfigService';
import { InMemoryRateLimiter } from '../../../src/api/middleware/rateLimit/inMemoryRateLimiter';
import { RateLimiterHitResult } from '../../../src/api/middleware/rateLimit/types';

describe('RateLimitMiddleware', () => {
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockLimiter: jest.Mocked<InMemoryRateLimiter>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;
  let clock: { now: number; advance: (ms: number) => void };

  beforeEach(() => {
    clock = { now: 1000, advance: (ms: number) => { clock.now += ms; } };
    const getNow = () => clock.now;

    mockConfigService = {
      readConfig: jest.fn()
    } as any;

    mockLimiter = {
      hit: jest.fn(),
      undo: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockRequest = {
      path: '/v1/chat/completions',
      method: 'POST',
      ip: '127.0.0.1',
      headers: {
        authorization: 'Bearer test-api-key'
      },
      get: jest.fn(),
      body: {}
    };

    mockResponse = {
      statusCode: 200,
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      once: jest.fn(),
      locals: {}
    } as any;

    mockNext = jest.fn();

    jest.clearAllMocks();
  });

  const createMiddleware = (options?: RateLimitMiddlewareOptions) => {
    return createRateLimitMiddleware({
      configService: mockConfigService,
      limiter: mockLimiter,
      clock: options?.clock || (() => clock.now),
      ...options
    });
  };

  const createConfig = (overrides?: Partial<RateLimitSettings>): RateLimitSettings => {
    const defaultRules: RateLimitSettings['rules'] = [
      {
        id: 'test-rule',
        name: 'Test Rule',
        windowMs: 60_000,
        maxRequests: 10,
        mode: 'sliding' as const,
        priority: 10,
        matchers: [
          { prefix: '/v1/chat', methods: ['POST'] }
        ],
        strategyOrder: ['apiKey', 'ip']
      }
    ];

    return {
      ...createDefaultRateLimitSettings(),
      ...overrides,
      rules: overrides?.rules ?? defaultRules
    };
  };

  describe('Middleware behavior', () => {
    it('should skip when rate limiting is disabled', async () => {
      const config = createConfig({ enabled: false });
      mockConfigService.readConfig.mockReturnValue({
        security: { rateLimit: config }
      } as any);

      const middleware = createMiddleware();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockLimiter.hit).not.toHaveBeenCalled();
    });

    it('should skip when no rule matches', async () => {
      const config = createConfig({
        rules: [
          {
            id: 'other-rule',
            name: 'Other Rule',
            windowMs: 60_000,
            maxRequests: 10,
            mode: 'sliding',
            priority: 10,
            matchers: [
              { prefix: '/other/path' }
            ]
          }
        ]
      });
      mockConfigService.readConfig.mockReturnValue({
        security: { rateLimit: config }
      } as any);

      const unmatchedRequest = {
        ...mockRequest,
        path: '/unmatched/path'
      };

      const middleware = createMiddleware();
      await middleware(unmatchedRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockLimiter.hit).not.toHaveBeenCalled();
    });

    it('should allow request when under limit', async () => {
      const config = createConfig();
      mockConfigService.readConfig.mockReturnValue({
        security: { rateLimit: config },
        auth: {
          apiKeys: [
            { id: 'key-1', key: 'test-api-key', name: 'Test', createdAt: Date.now() }
          ]
        }
      } as any);

      const hitResult: RateLimiterHitResult = {
        allowed: true,
        limit: 10,
        remaining: 9,
        reset: clock.now + 60_000,
        context: {
          ruleId: 'test-rule',
          key: 'apiKey:test-api-key',
          timestamp: clock.now,
          mode: 'sliding'
        }
      };

      mockLimiter.hit.mockResolvedValue(hitResult);

      const middleware = createMiddleware();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockLimiter.hit).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 10);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 9);
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockResponse.locals.rateLimit).toBeDefined();
      expect(mockResponse.locals.rateLimit?.exceeded).toBe(false);
    });

    it('should block request when limit exceeded', async () => {
      const config = createConfig();
      mockConfigService.readConfig.mockReturnValue({
        security: { rateLimit: config },
        auth: {
          apiKeys: [
            { id: 'key-1', key: 'test-api-key', name: 'Test', createdAt: Date.now() }
          ]
        }
      } as any);

      const hitResult: RateLimiterHitResult = {
        allowed: false,
        limit: 10,
        remaining: 0,
        reset: clock.now + 30_000
      };

      mockLimiter.hit.mockResolvedValue(hitResult);

      const middleware = createMiddleware();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockLimiter.hit).toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          message: 'Rate limit exceeded',
          type: 'rate_limit_exceeded',
          code: 'rate_limit',
          retry_after: expect.any(Number),
          limit: 10,
          remaining: 0,
          reset: expect.any(Number),
          rule_id: 'test-rule',
          strategy: 'apiKey'
        }
      });
      expect(mockResponse.locals.rateLimited).toBe(true);
    });

    it('should identify client by IP when API key not available', async () => {
      const config = createConfig({
        rules: [
          {
            id: 'ip-rule',
            name: 'IP Rule',
            windowMs: 60_000,
            maxRequests: 5,
            mode: 'sliding',
            priority: 10,
            matchers: [{ prefix: '/v1/chat' }],
            strategyOrder: ['ip']
          }
        ]
      });
      mockConfigService.readConfig.mockReturnValue({
        security: { rateLimit: config }
      } as any);

      const ipRequest = {
        ...mockRequest,
        headers: {},
        ip: '192.168.1.1'
      };

      const hitResult: RateLimiterHitResult = {
        allowed: true,
        limit: 5,
        remaining: 4,
        reset: clock.now + 60_000,
        context: {
          ruleId: 'ip-rule',
          key: 'ip:192.168.1.1',
          timestamp: clock.now,
          mode: 'sliding'
        }
      };

      mockLimiter.hit.mockResolvedValue(hitResult);

      const middleware = createMiddleware();
      await middleware(ipRequest as Request, mockResponse as Response, mockNext);

      expect(mockLimiter.hit).toHaveBeenCalledWith(
        'ip:192.168.1.1',
        expect.objectContaining({
          id: 'ip-rule',
          maxRequests: 5
        })
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip whitelisted clients', async () => {
      const config = createConfig({
        whitelist: {
          apiKeys: ['test-api-key']
        }
      });
      mockConfigService.readConfig.mockReturnValue({
        security: { rateLimit: config },
        auth: {
          apiKeys: [
            { id: 'key-1', key: 'test-api-key', name: 'Test', createdAt: Date.now() }
          ]
        }
      } as any);

      const middleware = createMiddleware();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockLimiter.hit).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should undo hit on failed requests when skipFailedRequests is true', async () => {
      const config = createConfig({
        rules: [
          {
            id: 'test-rule',
            name: 'Test Rule',
            windowMs: 60_000,
            maxRequests: 10,
            mode: 'sliding',
            priority: 10,
            matchers: [{ prefix: '/v1/chat' }],
            skipFailedRequests: true
          }
        ]
      });
      mockConfigService.readConfig.mockReturnValue({
        security: { rateLimit: config },
        auth: {
          apiKeys: [
            { id: 'key-1', key: 'test-api-key', name: 'Test', createdAt: Date.now() }
          ]
        }
      } as any);

      const hitResult: RateLimiterHitResult = {
        allowed: true,
        limit: 10,
        remaining: 9,
        reset: clock.now + 60_000,
        context: {
          ruleId: 'test-rule',
          key: 'apiKey:test-api-key',
          timestamp: clock.now,
          mode: 'sliding'
        }
      };

      mockLimiter.hit.mockResolvedValue(hitResult);
      mockResponse.statusCode = 500;

      const middleware = createMiddleware();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 模拟finish事件
      const finishCallbacks = (mockResponse.once as jest.Mock).mock.calls.filter(
        (call) => call[0] === 'finish'
      );
      
      expect(finishCallbacks.length).toBeGreaterThan(0);
      const finishCallback = finishCallbacks[0]?.[1];
      
      if (finishCallback) {
        finishCallback();
        // 等待异步undo完成
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(mockLimiter.undo).toHaveBeenCalledWith(hitResult.context);
      }
    });

    it('should undo hit on successful requests when skipSuccessfulRequests is true', async () => {
      const config = createConfig({
        rules: [
          {
            id: 'test-rule',
            name: 'Test Rule',
            windowMs: 60_000,
            maxRequests: 10,
            mode: 'sliding',
            priority: 10,
            matchers: [{ prefix: '/v1/chat' }],
            skipSuccessfulRequests: true
          }
        ]
      });
      mockConfigService.readConfig.mockReturnValue({
        security: { rateLimit: config },
        auth: {
          apiKeys: [
            { id: 'key-1', key: 'test-api-key', name: 'Test', createdAt: Date.now() }
          ]
        }
      } as any);

      const hitResult: RateLimiterHitResult = {
        allowed: true,
        limit: 10,
        remaining: 9,
        reset: clock.now + 60_000,
        context: {
          ruleId: 'test-rule',
          key: 'apiKey:test-api-key',
          timestamp: clock.now,
          mode: 'sliding'
        }
      };

      mockLimiter.hit.mockResolvedValue(hitResult);
      mockResponse.statusCode = 200;

      const middleware = createMiddleware();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // 模拟finish事件
      const finishCallbacks = (mockResponse.once as jest.Mock).mock.calls.filter(
        (call) => call[0] === 'finish'
      );
      
      expect(finishCallbacks.length).toBeGreaterThan(0);
      const finishCallback = finishCallbacks[0]?.[1];
      
      if (finishCallback) {
        finishCallback();
        // 等待异步undo完成
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(mockLimiter.undo).toHaveBeenCalledWith(hitResult.context);
      }
    });

    it('should handle limiter errors gracefully', async () => {
      const config = createConfig();
      mockConfigService.readConfig.mockReturnValue({
        security: { rateLimit: config },
        auth: {
          apiKeys: [
            { id: 'key-1', key: 'test-api-key', name: 'Test', createdAt: Date.now() }
          ]
        }
      } as any);

      const limiterError = new Error('Limiter error');
      mockLimiter.hit.mockRejectedValue(limiterError);

      const middleware = createMiddleware();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // 中间件应该捕获错误并通过next传递
      expect(mockNext).toHaveBeenCalledWith(limiterError);
    });

    it('should cache runtime config', async () => {
      const config = createConfig();
      mockConfigService.readConfig.mockReturnValue({
        security: { rateLimit: config },
        auth: {
          apiKeys: [
            { id: 'key-1', key: 'test-api-key', name: 'Test', createdAt: Date.now() }
          ]
        }
      } as any);

      const hitResult: RateLimiterHitResult = {
        allowed: true,
        limit: 10,
        remaining: 9,
        reset: clock.now + 60_000,
        context: {
          ruleId: 'test-rule',
          key: 'apiKey:test-api-key',
          timestamp: clock.now,
          mode: 'sliding'
        }
      };

      mockLimiter.hit.mockResolvedValue(hitResult);

      const middleware = createMiddleware();
      
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockConfigService.readConfig).toHaveBeenCalledTimes(2);
      expect(mockLimiter.hit).toHaveBeenCalledTimes(2);
    });
  });

  describe('Identity resolution', () => {
    it('should prioritize API key over IP', async () => {
      const config = createConfig();
      mockConfigService.readConfig.mockReturnValue({
        security: { rateLimit: config },
        auth: {
          apiKeys: [
            { id: 'key-1', key: 'test-api-key', name: 'Test', createdAt: Date.now() }
          ]
        }
      } as any);

      const apiKeyRequest = {
        ...mockRequest,
        ip: '192.168.1.1',
        headers: {
          authorization: 'Bearer test-api-key'
        }
      };

      const hitResult: RateLimiterHitResult = {
        allowed: true,
        limit: 10,
        remaining: 9,
        reset: clock.now + 60_000,
        context: {
          ruleId: 'test-rule',
          key: 'apiKey:test-api-key',
          timestamp: clock.now,
          mode: 'sliding'
        }
      };

      mockLimiter.hit.mockResolvedValue(hitResult);

      const middleware = createMiddleware();
      await middleware(apiKeyRequest as Request, mockResponse as Response, mockNext);

      expect(mockLimiter.hit).toHaveBeenCalledWith(
        'apiKey:test-api-key',
        expect.anything()
      );
    });

    it('should fallback to IP when API key not found', async () => {
      const config = createConfig();
      mockConfigService.readConfig.mockReturnValue({
        security: { rateLimit: config }
      } as any);

      const ipOnlyRequest = {
        ...mockRequest,
        ip: '192.168.1.1',
        headers: {}
      };

      const hitResult: RateLimiterHitResult = {
        allowed: true,
        limit: 10,
        remaining: 9,
        reset: clock.now + 60_000,
        context: {
          ruleId: 'test-rule',
          key: 'ip:192.168.1.1',
          timestamp: clock.now,
          mode: 'sliding'
        }
      };

      mockLimiter.hit.mockResolvedValue(hitResult);

      const middleware = createMiddleware();
      await middleware(ipOnlyRequest as Request, mockResponse as Response, mockNext);

      expect(mockLimiter.hit).toHaveBeenCalledWith(
        'ip:192.168.1.1',
        expect.anything()
      );
    });
  });
});
