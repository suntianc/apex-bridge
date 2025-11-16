import express, { Express } from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRateLimitMiddleware } from '../../src/api/middleware/rateLimitMiddleware';
import { ConfigService } from '../../src/services/ConfigService';
import { RateLimitSettings, createDefaultRateLimitSettings } from '../../src/services/ConfigService';

describe('Rate Limit Integration Tests', () => {
  const originalEnv: Record<string, string | undefined> = {
    root: process.env.APEX_BRIDGE_ROOT_DIR,
    config: process.env.APEX_BRIDGE_CONFIG_DIR,
    data: process.env.APEX_BRIDGE_DATA_DIR,
    autostart: process.env.APEX_BRIDGE_AUTOSTART
  };

  let tmpRoot: string;
  let app: Express;
  let configService: ConfigService;

  beforeAll(() => {
    tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'apex-rate-limit-'));
    process.env.APEX_BRIDGE_ROOT_DIR = tmpRoot;
    process.env.APEX_BRIDGE_CONFIG_DIR = path.join(tmpRoot, 'config');
    process.env.APEX_BRIDGE_DATA_DIR = path.join(tmpRoot, 'data');
    process.env.APEX_BRIDGE_AUTOSTART = 'false';

    // 确保配置目录存在
    const configDir = path.join(tmpRoot, 'config');
    require('fs').mkdirSync(configDir, { recursive: true });

    // 初始化配置服务
    configService = ConfigService.getInstance();
  });

  afterAll(() => {
    if (originalEnv.root !== undefined) {
      process.env.APEX_BRIDGE_ROOT_DIR = originalEnv.root;
    } else {
      delete process.env.APEX_BRIDGE_ROOT_DIR;
    }
    if (originalEnv.config !== undefined) {
      process.env.APEX_BRIDGE_CONFIG_DIR = originalEnv.config;
    } else {
      delete process.env.APEX_BRIDGE_CONFIG_DIR;
    }
    if (originalEnv.data !== undefined) {
      process.env.APEX_BRIDGE_DATA_DIR = originalEnv.data;
    } else {
      delete process.env.APEX_BRIDGE_DATA_DIR;
    }
    if (originalEnv.autostart !== undefined) {
      process.env.APEX_BRIDGE_AUTOSTART = originalEnv.autostart;
    } else {
      delete process.env.APEX_BRIDGE_AUTOSTART;
    }

    if (tmpRoot) {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // 清除配置缓存
    (configService as any).configCache = null;
  });

  const createConfig = (overrides?: Partial<RateLimitSettings>): RateLimitSettings => {
    const defaultSettings = createDefaultRateLimitSettings();
    return {
      ...defaultSettings,
      ...overrides,
      rules: overrides?.rules ?? [
        {
          id: 'chat-api',
          name: 'Chat API',
          windowMs: 60_000,
          maxRequests: 5,
          mode: 'sliding' as const,
          priority: 10,
          matchers: [
            { prefix: '/v1/chat', methods: ['POST'] }
          ],
          strategyOrder: ['apiKey', 'ip'],
          responseHeaders: true
        }
      ]
    };
  };

  const setupApp = (config: RateLimitSettings, apiKeys: Array<{ id: string; key: string; name: string; createdAt: number }> = []) => {
    // 先清除缓存，读取默认配置
    (configService as any).configCache = null;
    const defaultConfig = configService.readConfig();
    
    // 使用updateConfig来更新配置，这样可以确保正确合并
    // updateConfig会调用mergeConfig，但mergeConfig对数组会直接替换
    const updates: any = {
      setup_completed: true,
      server: {
        port: 8088,
        host: '0.0.0.0',
        nodeEnv: 'development',
        debugMode: false
      },
      auth: {
        vcpKey: 'test-vcp-key',
        apiKeys: apiKeys.length > 0 ? apiKeys : [
          {
            id: 'test-key-1',
            key: 'test-api-key-1',
            name: 'Test Key 1',
            createdAt: Date.now()
          }
        ]
      },
      security: {
        rateLimit: config  // 直接替换整个rateLimit配置
      },
      llm: {
        defaultProvider: 'openai'
      },
      plugins: {
        directory: './plugins',
        autoLoad: true
      }
    };

    // 使用updateConfig更新配置（这会合并配置并写入文件）
    configService.updateConfig(updates);
    
    // 再次清除缓存，强制重新读取
    (configService as any).configCache = null;
    
    // 验证配置已正确读取
    const readBackConfig = configService.readConfig();
    if (!readBackConfig.security?.rateLimit) {
      throw new Error('RateLimit config not found after update');
    }
    
    // 验证rules是否正确（应该只有我们设置的规则）
    const rules = readBackConfig.security.rateLimit.rules || [];
    const chatApiRule = rules.find((r: any) => r.id === 'chat-api');
    if (!chatApiRule) {
      throw new Error('chat-api rule not found in config');
    }
    
    // 验证maxRequests是否正确
    if (chatApiRule.maxRequests !== config.rules[0]?.maxRequests) {
      throw new Error(`Expected maxRequests=${config.rules[0]?.maxRequests}, but got ${chatApiRule.maxRequests}. Rules count: ${rules.length}`);
    }

    // 模拟认证中间件（设置res.locals.auth）
    app.use((req, res, next) => {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        // 从配置服务读取API keys
        const currentConfig = configService.readConfig();
        const apiKey = currentConfig.auth.apiKeys.find(k => k.key === token);
        if (apiKey) {
          res.locals.auth = {
            apiKeyId: apiKey.id,
            apiKeyToken: token
          };
        }
      }
      next();
    });

    // 应用限流中间件
    app.use(createRateLimitMiddleware({ configService }));

    // 测试路由
    app.post('/v1/chat/completions', (req, res) => {
      res.json({ message: 'success' });
    });

    app.get('/v1/models', (req, res) => {
      res.json({ models: [] });
    });

    app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });
  };

  describe('Chat API rate limiting', () => {
    it('should allow requests under limit', async () => {
      const config = createConfig({
        rules: [
          {
            id: 'chat-api',
            name: 'Chat API',
            windowMs: 60_000,
            maxRequests: 5,
            mode: 'sliding' as const,
            priority: 10,
            matchers: [{ prefix: '/v1/chat', methods: ['POST'] }],
            strategyOrder: ['apiKey', 'ip']
          }
        ]
      });

      setupApp(config);

      // 发送5个请求，应该都成功
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/v1/chat/completions')
          .set('Authorization', 'Bearer test-api-key-1')
          .send({ messages: [] });

        expect(response.status).toBe(200);
        expect(response.headers['x-ratelimit-limit']).toBe('5');
        expect(response.headers['x-ratelimit-remaining']).toBe(String(5 - i - 1));
      }
    });

    it('should block requests exceeding limit', async () => {
      const config = createConfig({
        rules: [
          {
            id: 'chat-api',
            name: 'Chat API',
            windowMs: 60_000,
            maxRequests: 3,
            mode: 'sliding' as const,
            priority: 10,
            matchers: [{ prefix: '/v1/chat', methods: ['POST'] }],
            strategyOrder: ['apiKey', 'ip']
          }
        ]
      });

      setupApp(config);

      // 发送3个请求，应该都成功
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post('/v1/chat/completions')
          .set('Authorization', 'Bearer test-api-key-1')
          .send({ messages: [] });

        expect(response.status).toBe(200);
      }

      // 第4个请求应该被限流
      const blockedResponse = await request(app)
        .post('/v1/chat/completions')
        .set('Authorization', 'Bearer test-api-key-1')
        .send({ messages: [] });

      expect(blockedResponse.status).toBe(429);
      expect(blockedResponse.body.error).toBeDefined();
      expect(blockedResponse.body.error.type).toBe('rate_limit_exceeded');
      expect(blockedResponse.body.error.code).toBe('rate_limit');
      expect(blockedResponse.headers['x-ratelimit-limit']).toBe('3');
      expect(blockedResponse.headers['x-ratelimit-remaining']).toBe('0');
      expect(blockedResponse.headers['retry-after']).toBeDefined();
    });

    it('should track rate limits per API key', async () => {
      const config = createConfig({
        rules: [
          {
            id: 'chat-api',
            name: 'Chat API',
            windowMs: 60_000,
            maxRequests: 3,
            mode: 'sliding' as const,
            priority: 10,
            matchers: [{ prefix: '/v1/chat', methods: ['POST'] }],
            strategyOrder: ['apiKey', 'ip']
          }
        ]
      });

      // 设置两个API keys
      const apiKeys = [
        {
          id: 'test-key-1',
          key: 'test-api-key-1',
          name: 'Test Key 1',
          createdAt: Date.now()
        },
        {
          id: 'test-key-2',
          key: 'test-api-key-2',
          name: 'Test Key 2',
          createdAt: Date.now()
        }
      ];

      setupApp(config, apiKeys);

      // 使用第一个API key发送3个请求（达到限制）
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post('/v1/chat/completions')
          .set('Authorization', 'Bearer test-api-key-1')
          .send({ messages: [] });

        expect(response.status).toBe(200);
      }

      // 第一个key应该被限流
      const blockedResponse = await request(app)
        .post('/v1/chat/completions')
        .set('Authorization', 'Bearer test-api-key-1')
        .send({ messages: [] });

      expect(blockedResponse.status).toBe(429);

      // 第二个key应该不受影响
      const allowedResponse = await request(app)
        .post('/v1/chat/completions')
        .set('Authorization', 'Bearer test-api-key-2')
        .send({ messages: [] });

      expect(allowedResponse.status).toBe(200);
    });

    it('should track rate limits per IP when API key not provided', async () => {
      const config = createConfig({
        rules: [
          {
            id: 'chat-api',
            name: 'Chat API',
            windowMs: 60_000,
            maxRequests: 3,
            mode: 'sliding' as const,
            priority: 10,
            matchers: [{ prefix: '/v1/chat', methods: ['POST'] }],
            strategyOrder: ['ip']
          }
        ]
      });

      setupApp(config);

      // 不使用API key，应该按IP限流
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post('/v1/chat/completions')
          .send({ messages: [] });

        expect(response.status).toBe(200);
      }

      // 第4个请求应该被限流
      const blockedResponse = await request(app)
        .post('/v1/chat/completions')
        .send({ messages: [] });

      expect(blockedResponse.status).toBe(429);
    });

    it('should skip rate limiting for whitelisted API keys', async () => {
      const config = createConfig({
        whitelist: {
          apiKeys: ['test-api-key-1']
        },
        rules: [
          {
            id: 'chat-api',
            name: 'Chat API',
            windowMs: 60_000,
            maxRequests: 1,
            mode: 'sliding' as const,
            priority: 10,
            matchers: [{ prefix: '/v1/chat', methods: ['POST'] }],
            strategyOrder: ['apiKey', 'ip'],
            responseHeaders: false
          }
        ]
      });

      setupApp(config);

      // 白名单key应该不受限流
      for (let i = 0; i < 10; i++) {
        const response = await request(app)
          .post('/v1/chat/completions')
          .set('Authorization', 'Bearer test-api-key-1')
          .send({ messages: [] });

        expect(response.status).toBe(200);
        // 白名单key不应该有rate limit headers（因为responseHeaders设置为false，或者因为白名单跳过了限流）
        // 注意：即使设置了responseHeaders: false，如果白名单跳过限流，也不应该有headers
      }
    });

    it('should skip rate limiting for unmatched routes', async () => {
      const config = createConfig({
        rules: [
          {
            id: 'chat-api',
            name: 'Chat API',
            windowMs: 60_000,
            maxRequests: 1,
            mode: 'sliding',
            priority: 10,
            matchers: [{ prefix: '/v1/chat', methods: ['POST'] }],
            strategyOrder: ['apiKey', 'ip']
          }
        ]
      });

      setupApp(config);

      // 健康检查端点不应该被限流
      for (let i = 0; i < 10; i++) {
        const response = await request(app).get('/health');

        expect(response.status).toBe(200);
        expect(response.headers['x-ratelimit-limit']).toBeUndefined();
      }
    });
  });

  describe('Rate limit headers', () => {
    it('should include rate limit headers in successful responses', async () => {
      const config = createConfig({
        rules: [
          {
            id: 'chat-api',
            name: 'Chat API',
            windowMs: 60_000,
            maxRequests: 5,
            mode: 'sliding',
            priority: 10,
            matchers: [{ prefix: '/v1/chat', methods: ['POST'] }],
            strategyOrder: ['apiKey', 'ip'],
            responseHeaders: true
          }
        ]
      });

      setupApp(config);

      const response = await request(app)
        .post('/v1/chat/completions')
        .set('Authorization', 'Bearer test-api-key-1')
        .send({ messages: [] });

      expect(response.status).toBe(200);
      expect(response.headers['x-ratelimit-limit']).toBe('5');
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });

    it('should include retry-after header in 429 responses', async () => {
      const config = createConfig({
        rules: [
          {
            id: 'chat-api',
            name: 'Chat API',
            windowMs: 60_000,
            maxRequests: 1,
            mode: 'sliding',
            priority: 10,
            matchers: [{ prefix: '/v1/chat', methods: ['POST'] }],
            strategyOrder: ['apiKey', 'ip'],
            responseHeaders: true
          }
        ]
      });

      setupApp(config);

      // 第一个请求成功
      await request(app)
        .post('/v1/chat/completions')
        .set('Authorization', 'Bearer test-api-key-1')
        .send({ messages: [] });

      // 第二个请求被限流
      const blockedResponse = await request(app)
        .post('/v1/chat/completions')
        .set('Authorization', 'Bearer test-api-key-1')
        .send({ messages: [] });

      expect(blockedResponse.status).toBe(429);
      expect(blockedResponse.headers['retry-after']).toBeDefined();
      expect(parseInt(blockedResponse.headers['retry-after'] as string)).toBeGreaterThan(0);
    });
  });
});
