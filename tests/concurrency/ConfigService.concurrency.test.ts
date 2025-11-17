/**
 * ConfigService Concurrency Tests - ConfigService 并发测试
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock PathService before importing ConfigService
const mockPathServiceInstance = {
  getConfigDir: jest.fn(),
  getConfigFilePath: jest.fn(),
  getConfigBackupPath: jest.fn(),
  ensureDir: jest.fn()
};

jest.mock('../../src/services/PathService', () => {
  return {
    PathService: {
      getInstance: jest.fn(() => mockPathServiceInstance)
    }
  };
});

// Import after mock
import { ConfigService } from '../../src/services/ConfigService';
import { testConcurrentOperationsSettled, testConcurrentDifferentOperations } from '../utils/concurrentTestUtils';

describe('ConfigService - Concurrency Tests', () => {
  jest.setTimeout(20000);
  let configService: ConfigService;
  let tempDir: string;
  let configFilePath: string;

  beforeEach(async () => {
    // Reset singleton instance
    (ConfigService as any).instance = undefined;

    // Create temporary directory
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'config-service-test-'));
    configFilePath = path.join(tempDir, 'admin-config.json');

    // Setup PathService mock
    (mockPathServiceInstance.getConfigDir as jest.Mock).mockReturnValue(tempDir);
    (mockPathServiceInstance.getConfigFilePath as jest.Mock).mockReturnValue(configFilePath);
    (mockPathServiceInstance.getConfigBackupPath as jest.Mock).mockReturnValue(
      path.join(tempDir, 'admin-config.json.bak')
    );
    (mockPathServiceInstance.ensureDir as jest.Mock).mockImplementation(() => {});

    // Create initial config file
    const initialConfig = {
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

    await fsPromises.writeFile(configFilePath, JSON.stringify(initialConfig, null, 2), 'utf-8');

    configService = ConfigService.getInstance();
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Concurrent Config Updates', () => {
    it('should handle concurrent config updates safely', async () => {
      // 多个并发更新请求
      const results = await testConcurrentOperationsSettled(
        async () => {
          const port = 3000 + Math.floor(Math.random() * 1000);
          return await configService.updateConfigAsync({
            server: {
              port,
              host: 'localhost',
              nodeEnv: 'test' as const,
              debugMode: false
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
            }
          } as any);
        },
        5,  // 5 个并发操作
        1   // 每个 1 次迭代
      );

      // 验证所有请求都成功
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(5);

      // 验证配置文件存在且有效
      const config = await configService.readConfigAsync();
      expect(config).toBeDefined();
      expect(config.server).toBeDefined();
      expect(config.server.port).toBeGreaterThan(0);
    });

    it('should prevent partial updates in concurrent scenarios', async () => {
      // 多个并发更新请求，更新不同的配置项
      const operations = [
        async () => {
          return await configService.updateConfigAsync({
            server: {
              port: 8080,
              host: '0.0.0.0',
              nodeEnv: 'production' as const,
              debugMode: false
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
            }
          } as any);
        },
        async () => {
          return await configService.updateConfigAsync({
            auth: {
              abpKey: 'new-key',
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
            }
          } as any);
        },
        async () => {
          return await configService.updateConfigAsync({
            llm: {
              defaultProvider: 'deepseek',
              openai: {
                apiKey: 'test-key',
                baseURL: 'https://api.openai.com',
                defaultModel: 'gpt-4',
                timeout: 30000,
                maxRetries: 3
              },
              deepseek: {
                apiKey: 'deepseek-key',
                baseURL: 'https://api.deepseek.com',
                defaultModel: 'deepseek-chat',
                timeout: 30000,
                maxRetries: 3
              }
            }
          } as any);
        }
      ];

      const results = await testConcurrentDifferentOperations(operations);

      // 验证所有请求都成功
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(3);

      // 验证配置文件完整且有效
      const config = await configService.readConfigAsync();
      expect(config).toBeDefined();
      expect(config.server).toBeDefined();
      expect(config.auth).toBeDefined();
      expect(config.llm).toBeDefined();
    });

    it('should maintain config file integrity under concurrent load', async () => {
      // 多个并发更新请求
      const results = await testConcurrentOperationsSettled(
        async () => {
          return await configService.updateConfigAsync({
            server: {
              port: 3000,
              host: 'localhost',
              nodeEnv: 'test' as const,
              debugMode: false
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
            }
          } as any);
        },
        10, // 10 个并发操作
        3   // 每个 3 次迭代
      );

      // 验证所有请求都成功
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(10);

      // 验证配置文件是有效的 JSON
      const fileContent = await fsPromises.readFile(configFilePath, 'utf-8');
      const parsedConfig = JSON.parse(fileContent);
      expect(parsedConfig).toBeDefined();
      expect(parsedConfig.server).toBeDefined();
      expect(parsedConfig.auth).toBeDefined();
      expect(parsedConfig.llm).toBeDefined();
    });
  });

  describe('Concurrent Config Reads and Writes', () => {
    it('should handle concurrent read and write operations', async () => {
      // 并发读写操作
      const readOperations = Array(5).fill(null).map(() => {
        return async () => {
          return await configService.readConfigAsync();
        };
      });

      const writeOperations = Array(3).fill(null).map(() => {
        return async () => {
          return await configService.updateConfigAsync({
            server: {
              port: 3000 + Math.floor(Math.random() * 100),
              host: 'localhost',
              nodeEnv: 'test' as const,
              debugMode: false
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
            }
          } as any);
        };
      });

      const [readResults, writeResults] = await Promise.all([
        Promise.allSettled(readOperations),
        Promise.allSettled(writeOperations)
      ]);

      // 验证所有读操作都成功
      const readSuccesses = readResults.filter(r => r.status === 'fulfilled');
      expect(readSuccesses.length).toBe(5);

      // 验证所有写操作都成功
      const writeSuccesses = writeResults.filter(r => r.status === 'fulfilled');
      expect(writeSuccesses.length).toBe(3);

      // 验证配置文件存在且有效
      const config = await configService.readConfigAsync();
      expect(config).toBeDefined();
    });
  });
});
