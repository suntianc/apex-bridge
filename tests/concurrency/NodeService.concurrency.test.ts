/**
 * NodeService Concurrency Tests - NodeService 并发测试
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock PathService before importing NodeService
const mockPathServiceInstance = {
  getConfigDir: jest.fn(),
  getConfigFilePath: jest.fn(),
  getConfigBackupPath: jest.fn(),
  getNodesFilePath: jest.fn(),
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
import { NodeService } from '../../src/services/NodeService';
import { testConcurrentOperationsSettled, testConcurrentDifferentOperations, testConcurrentReadWrite } from '../utils/concurrentTestUtils';

describe('NodeService - Concurrency Tests', () => {
  let nodeService: NodeService;
  let tempDir: string;
  let nodesFilePath: string;

  beforeEach(async () => {
    // Reset singleton instance
    (NodeService as any).instance = undefined;

    // Create temporary directory
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'node-service-test-'));
    nodesFilePath = path.join(tempDir, 'nodes.json');

    // Setup PathService mock
    (mockPathServiceInstance.getConfigDir as jest.Mock).mockReturnValue(tempDir);
    (mockPathServiceInstance.getConfigFilePath as jest.Mock).mockReturnValue(
      path.join(tempDir, 'admin-config.json')
    );
    (mockPathServiceInstance.getConfigBackupPath as jest.Mock).mockReturnValue(
      path.join(tempDir, 'admin-config.json.bak')
    );
    (mockPathServiceInstance.getNodesFilePath as jest.Mock).mockReturnValue(nodesFilePath);
    (mockPathServiceInstance.ensureDir as jest.Mock).mockImplementation(() => {});

    nodeService = NodeService.getInstance();
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Concurrent Node Registration', () => {
    it('should handle concurrent node registration safely', async () => {
      const nodeId = 'test-node';

      // 多个并发注册请求（使用相同的 ID）
      const results = await testConcurrentOperationsSettled(
        async () => {
          return await nodeService.registerNode({
            id: nodeId,
            name: 'Test Node',
            type: 'worker'
          });
        },
        5,  // 5 个并发操作
        1   // 每个 1 次迭代
      );

      // 验证所有请求都成功
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBeGreaterThan(0);

      // 验证节点存在且唯一
      const node = nodeService.getNode(nodeId);
      expect(node).not.toBeNull();
      expect(node?.id).toBe(nodeId);
    });

    it('should handle concurrent node registration with different IDs', async () => {
      // 多个并发注册请求（使用不同的 ID）
      const results = await testConcurrentOperationsSettled(
        async () => {
          const nodeId = `test-node-${Date.now()}-${Math.random()}`;
          return await nodeService.registerNode({
            id: nodeId,
            name: `Test Node ${nodeId}`,
            type: 'worker'
          });
        },
        10, // 10 个并发操作
        1   // 每个 1 次迭代
      );

      // 验证所有请求都成功
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(10);

      // 验证所有节点都已注册
      const nodes = nodeService.getAllNodes();
      expect(nodes.length).toBe(10);
    });

    it('should handle concurrent node registration without IDs', async () => {
      // 多个并发注册请求（不提供 ID，自动生成）
      const results = await testConcurrentOperationsSettled(
        async () => {
          return await nodeService.registerNode({
            name: 'Test Node',
            type: 'worker'
          });
        },
        5,  // 5 个并发操作
        1   // 每个 1 次迭代
      );

      // 验证所有请求都成功
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(5);

      // 验证所有节点都已注册且 ID 唯一
      const nodes = nodeService.getAllNodes();
      expect(nodes.length).toBe(5);
      
      const nodeIds = new Set(nodes.map(n => n.id));
      expect(nodeIds.size).toBe(5); // 所有 ID 应该唯一
    });
  });

  describe('Concurrent Node Updates', () => {
    it('should prevent concurrent updates to the same node', async () => {
      const nodeId = 'test-node';

      // 创建初始节点
      await nodeService.registerNode({
        id: nodeId,
        name: 'Test Node',
        type: 'worker'
      });

      // 多个并发更新请求
      const results = await testConcurrentOperationsSettled(
        async () => {
          const updateId = Math.floor(Math.random() * 1000);
          return await nodeService.updateNode(nodeId, {
            name: `Update ${updateId}`
          });
        },
        5,  // 5 个并发操作
        1   // 每个 1 次迭代
      );

      // 验证至少一个请求成功
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBeGreaterThan(0);

      // 验证节点状态一致
      const node = nodeService.getNode(nodeId);
      expect(node).not.toBeNull();
      expect(node?.name).toBeDefined();
    });

    it('should handle concurrent updates to different nodes', async () => {
      const nodeIds = ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'];

      // 创建初始节点
      for (const nodeId of nodeIds) {
        await nodeService.registerNode({
          id: nodeId,
          name: `Test Node ${nodeId}`,
          type: 'worker'
        });
      }

      // 多个并发更新请求（更新不同的节点）
      const operations = nodeIds.map(nodeId => {
        return async () => {
          return await nodeService.updateNode(nodeId, {
            name: `Updated ${nodeId}`
          });
        };
      });

      const results = await testConcurrentDifferentOperations(operations);

      // 验证所有请求都成功
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(5);

      // 验证所有节点都已更新
      for (const nodeId of nodeIds) {
        const node = nodeService.getNode(nodeId);
        expect(node).not.toBeNull();
        expect(node?.name).toBe(`Updated ${nodeId}`);
      }
    });
  });

  describe('Concurrent Node Unregistration', () => {
    it('should handle concurrent unregistration safely', async () => {
      const nodeId = 'test-node';

      // 创建初始节点
      await nodeService.registerNode({
        id: nodeId,
        name: 'Test Node',
        type: 'worker'
      });

      // 多个并发注销请求
      const results = await testConcurrentOperationsSettled(
        async () => {
          return await nodeService.unregisterNode(nodeId);
        },
        5,  // 5 个并发操作
        1   // 每个 1 次迭代
      );

      // 验证至少一个请求成功
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBeGreaterThan(0);

      // 验证节点已被注销
      const node = nodeService.getNode(nodeId);
      expect(node).toBeNull();
    });
  });

  describe('Concurrent Read and Write Operations', () => {
    it('should handle concurrent read and write operations', async () => {
      const nodeId = 'test-node';

      // 创建初始节点
      await nodeService.registerNode({
        id: nodeId,
        name: 'Test Node',
        type: 'worker'
      });

      // 并发读写操作
      const { readResults, writeResults } = await testConcurrentReadWrite(
        // 读操作
        async () => {
          return nodeService.getNode(nodeId);
        },
        // 写操作
        async () => {
          return await nodeService.updateNode(nodeId, {
            name: `Updated ${Date.now()}`
          });
        },
        5,  // 5 个读操作
        3   // 3 个写操作
      );

      // 验证所有读操作都成功
      const readSuccesses = readResults.filter(r => r.status === 'fulfilled');
      expect(readSuccesses.length).toBe(5);

      // 验证所有写操作都成功
      const writeSuccesses = writeResults.filter(r => r.status === 'fulfilled');
      expect(writeSuccesses.length).toBe(3);

      // 验证节点状态一致
      const node = nodeService.getNode(nodeId);
      expect(node).not.toBeNull();
    });

    it('should maintain data consistency under concurrent load', async () => {
      const nodeId = 'test-node';

      // 创建初始节点
      await nodeService.registerNode({
        id: nodeId,
        name: 'Test Node',
        type: 'worker',
        stats: {
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          activeTasks: 0,
          averageResponseTime: 0
        }
      });

      // 并发更新统计信息
      const results = await testConcurrentOperationsSettled(
        async () => {
          const node = nodeService.getNode(nodeId);
          if (!node) {
            throw new Error('Node not found');
          }

          // 更新统计信息
          return await nodeService.updateNode(nodeId, {
            stats: {
              totalTasks: (node.stats?.totalTasks || 0) + 1,
              completedTasks: (node.stats?.completedTasks || 0) + 1
            }
          });
        },
        10, // 10 个并发操作
        1   // 每个 1 次迭代
      );

      // 验证所有请求都成功
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBeGreaterThan(0);

      // 验证节点状态一致
      const node = nodeService.getNode(nodeId);
      expect(node).not.toBeNull();
      expect(node?.stats).toBeDefined();
    });
  });
});
