/**
 * RuntimeConfigService Tests - 包括竞态条件测试
 */

import { RuntimeConfigService } from '../../src/services/RuntimeConfigService';
import { LLMClient } from '../../src/core/LLMClient';
import { ConfigService } from '../../src/services/ConfigService';
import type { AdminConfig } from '../../src/services/ConfigService';

// Mock dependencies
jest.mock('../../src/core/LLMClient');
jest.mock('../../src/services/ConfigService');

describe('RuntimeConfigService', () => {
  let runtimeConfig: RuntimeConfigService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockLLMClient: jest.Mocked<LLMClient>;

  beforeEach(() => {
    // Reset singleton instance
    (RuntimeConfigService as any).instance = undefined;

    // Mock ConfigService
    mockConfigService = {
      readConfig: jest.fn(),
      toVCPConfig: jest.fn(),
      updateConfig: jest.fn()
    } as any;

    (ConfigService.getInstance as jest.Mock) = jest.fn(() => mockConfigService);

    // Mock LLMClient
    mockLLMClient = {
      getAllModels: jest.fn(),
      chat: jest.fn(),
      streamChat: jest.fn()
    } as any;

    (LLMClient as jest.Mock) = jest.fn(() => mockLLMClient);

    // Setup default config (使用类型断言简化测试配置)
    const mockAdminConfig = {
      setup_completed: true,
      server: {
        port: 3000,
        host: 'localhost',
        nodeEnv: 'test' as const,
        debugMode: false
      },
      auth: {
        abpKey: 'test-abp-key',
        apiKeys: []
      },
      llm: {
        defaultProvider: 'openai',
        openai: {
          apiKey: 'test-key',
          baseURL: 'https://api.openai.com',
          defaultModel: 'gpt-4',
          timeout: 30000,
          maxRetries: 3
        }
      },
      plugins: {
        directory: '/plugins',
        autoLoad: true
      }
    } as any;

    const mockVCPConfig: AdminConfig = {
      llm: {
        defaultProvider: 'openai',
        openai: {
          apiKey: 'test-key',
          baseURL: 'https://api.openai.com'
        }
      }
    } as AdminConfig;

    mockConfigService.readConfig.mockReturnValue(mockAdminConfig);

    runtimeConfig = RuntimeConfigService.getInstance();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getLLMClient - Race Condition Tests', () => {
    it('should handle concurrent initialization requests', async () => {
      // 模拟多个并发请求
      const concurrentRequests = 10;
      const promises: Promise<LLMClient | null>[] = [];

      // 创建多个并发请求
      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(runtimeConfig.getLLMClient());
      }

      // 等待所有请求完成
      const results = await Promise.all(promises);

      // 验证所有请求都返回了同一个 LLMClient 实例
      const firstResult = results[0];
      expect(firstResult).not.toBeNull();
      
      for (const result of results) {
        expect(result).toBe(firstResult);
      }

      // 验证 LLMClient 构造函数只被调用一次（不是10次）
      expect(LLMClient).toHaveBeenCalledTimes(1);
    });

    it('should use double-checked locking pattern', async () => {
      // 第一次调用
      const client1 = await runtimeConfig.getLLMClient();
      
      // 第二次调用（应该直接返回，不重新初始化）
      const client2 = await runtimeConfig.getLLMClient();

      expect(client1).toBe(client2);
      expect(LLMClient).toHaveBeenCalledTimes(1);
    });

    it('should wait for in-progress initialization', async () => {
      // 模拟慢速初始化
      let resolveInit: (value: LLMClient) => void;
      const initPromise = new Promise<LLMClient>((resolve) => {
        resolveInit = resolve;
      });

      (LLMClient as jest.Mock).mockImplementationOnce(() => {
        // 延迟返回
        setTimeout(() => {
          resolveInit(mockLLMClient);
        }, 100);
        return mockLLMClient;
      });

      // 启动第一个初始化请求
      const promise1 = runtimeConfig.getLLMClient();
      
      // 立即启动第二个请求（应该等待第一个完成）
      const promise2 = runtimeConfig.getLLMClient();

      // 等待两个请求完成
      const [client1, client2] = await Promise.all([promise1, promise2]);

      // 验证两个请求返回同一个实例
      expect(client1).toBe(client2);
      expect(client1).toBe(mockLLMClient);
    });

    it('should handle initialization errors gracefully', async () => {
      // 模拟初始化失败
      (LLMClient as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Initialization failed');
      });

      const result = await runtimeConfig.getLLMClient();

      expect(result).toBeNull();
    });

    it('should handle multiple concurrent errors', async () => {
      // 模拟多个并发请求都失败
      (LLMClient as jest.Mock).mockImplementation(() => {
        throw new Error('Initialization failed');
      });

      const concurrentRequests = 5;
      const promises: Promise<LLMClient | null>[] = [];

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(runtimeConfig.getLLMClient());
      }

      const results = await Promise.all(promises);

      // 所有请求都应该返回 null
      for (const result of results) {
        expect(result).toBeNull();
      }
    });

    it('should reinitialize after clearLLMClient', async () => {
      // 第一次初始化
      const client1 = await runtimeConfig.getLLMClient();
      expect(client1).not.toBeNull();
      expect(LLMClient).toHaveBeenCalledTimes(1);

      // 清除客户端
      runtimeConfig.clearLLMClient();

      // 第二次初始化（应该重新创建）
      const client2 = await runtimeConfig.getLLMClient();
      expect(client2).not.toBeNull();
      expect(LLMClient).toHaveBeenCalledTimes(2);
    });

    it('should handle concurrent requests after clearLLMClient', async () => {
      // 第一次初始化
      await runtimeConfig.getLLMClient();
      expect(LLMClient).toHaveBeenCalledTimes(1);

      // 清除客户端
      runtimeConfig.clearLLMClient();

      // 多个并发请求（应该只初始化一次）
      const concurrentRequests = 5;
      const promises: Promise<LLMClient | null>[] = [];

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(runtimeConfig.getLLMClient());
      }

      await Promise.all(promises);

      // 应该总共调用2次（第一次 + 清除后的重新初始化）
      expect(LLMClient).toHaveBeenCalledTimes(2);
    });
  });

  describe('getLLMClient - Normal Operation', () => {
    it('should return null when no LLM providers are configured', async () => {
      const noProviderConfig: AdminConfig = {
        setup_completed: true,
        server: { port: 3000, host: 'localhost', nodeEnv: 'test', debugMode: false } as any,
        auth: { apiKey: '', apiKeys: [] },
        llm: { defaultProvider: null as any } as any,
        plugins: { directory: '/plugins', autoLoad: true }
      } as AdminConfig;
      mockConfigService.readConfig.mockReturnValue(noProviderConfig);

      const result = await runtimeConfig.getLLMClient();

      expect(result).toBeNull();
      expect(LLMClient).not.toHaveBeenCalled();
    });

    it('should initialize LLMClient with correct config', async () => {
      const result = await runtimeConfig.getLLMClient();

      expect(result).toBe(mockLLMClient);
      expect(LLMClient).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultProvider: 'openai',
          openai: expect.objectContaining({
            apiKey: 'test-key'
          })
        })
      );
    });
  });
});
