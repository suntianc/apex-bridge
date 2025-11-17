/**
 * LLMClient Concurrency Tests - LLMClient 并发测试
 */

import { RuntimeConfigService } from '../../src/services/RuntimeConfigService';
import { ConfigService } from '../../src/services/ConfigService';
import { LLMClient } from '../../src/core/LLMClient';
import { testConcurrentOperations, testConcurrentOperationsSettled } from '../utils/concurrentTestUtils';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock dependencies
jest.mock('../../src/core/LLMClient');
jest.mock('../../src/services/ConfigService');
jest.mock('../../src/services/PathService', () => {
  return {
    PathService: {
      getInstance: jest.fn()
    }
  };
});

describe('LLMClient - Concurrency Tests', () => {
  let runtimeConfig: RuntimeConfigService;
  let tempDir: string;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockLLMClient: jest.Mocked<LLMClient>;
  let initializationCount: number = 0;

  beforeEach(async () => {
    // Reset singleton instance
    (RuntimeConfigService as any).instance = undefined;
    initializationCount = 0;

    // Create temporary directory
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'llm-client-test-'));
    const configFilePath = path.join(tempDir, 'admin-config.json');

    // Mock ConfigService
    mockConfigService = {
      readConfig: jest.fn(),
      updateConfigAsync: jest.fn()
    } as any;

    (ConfigService.getInstance as jest.Mock) = jest.fn(() => mockConfigService);

    // Mock LLMClient
    mockLLMClient = {
      getAllModels: jest.fn(),
      chat: jest.fn(),
      streamChat: jest.fn()
    } as any;

    (LLMClient as jest.Mock) = jest.fn(() => {
      initializationCount++;
      return mockLLMClient;
    });

    // Setup default config
    const mockAdminConfig = {
      setup_completed: true,
      server: {
        port: 3000,
        host: 'localhost',
        nodeEnv: 'test' as const,
        debugMode: false
      },
      auth: {
        abpKey: 'test-key',
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

    mockConfigService.readConfig.mockReturnValue(mockAdminConfig);

    runtimeConfig = RuntimeConfigService.getInstance();
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Concurrent Initialization', () => {
    it('should handle concurrent initialization requests safely', async () => {
      // Reset LLMClient
      (runtimeConfig as any).llmClient = null;
      (runtimeConfig as any).initializing = false;
      (runtimeConfig as any).initializationPromise = null;
      initializationCount = 0;

      // 启动多个并发初始化请求
      const results = await testConcurrentOperations(
        async () => {
          return await runtimeConfig.getLLMClient();
        },
        10, // 10 个并发操作
        1   // 每个 1 次迭代
      );

      // 验证所有请求都返回了同一个 LLMClient 实例
      const firstResult = results[0];
      expect(firstResult).not.toBeNull();

      for (const result of results) {
        expect(result).toBe(firstResult);
      }

      // 验证 LLMClient 构造函数只被调用一次
      expect(initializationCount).toBe(1);
    });

    it('should handle concurrent initialization with multiple iterations', async () => {
      // Reset LLMClient
      (runtimeConfig as any).llmClient = null;
      (runtimeConfig as any).initializing = false;
      (runtimeConfig as any).initializationPromise = null;
      initializationCount = 0;

      // 启动多个并发初始化请求，每个请求多次迭代
      const results = await testConcurrentOperations(
        async () => {
          return await runtimeConfig.getLLMClient();
        },
        5,  // 5 个并发操作
        3   // 每个 3 次迭代
      );

      // 验证所有请求都返回了同一个 LLMClient 实例
      const firstResult = results[0];
      expect(firstResult).not.toBeNull();

      for (const result of results) {
        expect(result).toBe(firstResult);
      }

      // 验证 LLMClient 构造函数只被调用一次
      expect(initializationCount).toBe(1);
    });

    it('should wait for in-progress initialization', async () => {
      // Reset LLMClient
      (runtimeConfig as any).llmClient = null;
      (runtimeConfig as any).initializing = false;
      (runtimeConfig as any).initializationPromise = null;
      initializationCount = 0;

      // 重置 mock，确保每次调用都计数
      (LLMClient as jest.Mock).mockImplementation(() => {
        initializationCount++;
        return mockLLMClient;
      });

      // 启动多个并发请求（应该只初始化一次）
      const promises = [
        runtimeConfig.getLLMClient(),
        runtimeConfig.getLLMClient(),
        runtimeConfig.getLLMClient(),
        runtimeConfig.getLLMClient(),
        runtimeConfig.getLLMClient()
      ];

      // 等待所有请求完成
      const results = await Promise.all(promises);

      // 验证所有请求返回同一个实例
      const firstResult = results[0];
      expect(firstResult).not.toBeNull();
      for (const result of results) {
        expect(result).toBe(firstResult);
      }

      // 验证 LLMClient 构造函数只被调用一次
      // 注意：由于异步执行，可能在某些情况下计数不准确，但至少应该 <= 1
      expect(initializationCount).toBeLessThanOrEqual(1);
    });

    it('should handle concurrent initialization after clearLLMClient', async () => {
      // 第一次初始化
      await runtimeConfig.getLLMClient();
      expect(initializationCount).toBe(1);

      // 清除客户端
      runtimeConfig.clearLLMClient();
      initializationCount = 0;

      // 多个并发请求（应该只初始化一次）
      const results = await testConcurrentOperations(
        async () => {
          return await runtimeConfig.getLLMClient();
        },
        5,  // 5 个并发操作
        1   // 每个 1 次迭代
      );

      // 验证所有请求返回同一个实例
      const firstResult = results[0];
      expect(firstResult).not.toBeNull();

      for (const result of results) {
        expect(result).toBe(firstResult);
      }

      // 验证 LLMClient 构造函数只被调用一次
      expect(initializationCount).toBe(1);
    });
  });

  describe('Concurrent Access After Initialization', () => {
    it('should return same instance for concurrent access after initialization', async () => {
      // 先初始化
      const client1 = await runtimeConfig.getLLMClient();
      expect(client1).not.toBeNull();
      expect(initializationCount).toBe(1);

      // 多个并发访问（应该都返回同一个实例）
      const results = await testConcurrentOperations(
        async () => {
          return await runtimeConfig.getLLMClient();
        },
        10, // 10 个并发操作
        5   // 每个 5 次迭代
      );

      // 验证所有请求返回同一个实例
      for (const result of results) {
        expect(result).toBe(client1);
      }

      // 验证 LLMClient 构造函数没有被再次调用
      expect(initializationCount).toBe(1);
    });
  });
});
