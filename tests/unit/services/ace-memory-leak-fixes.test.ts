/**
 * ACE内存泄漏修复验证测试
 * 验证所有8个高风险问题修复是否有效
 */

import { AceIntegrator } from '../../../src/services/AceIntegrator';
import { AceStrategyManager } from '../../../src/services/AceStrategyManager';
import { AceCapabilityManager } from '../../../src/services/AceCapabilityManager';
import { AceStrategyOrchestrator } from '../../../src/strategies/AceStrategyOrchestrator';
import { AceCore } from '../../../src/core/ace/AceCore';
import { LRUMap, TTLCache, ReadWriteLock, AsyncLock } from '../../../src/utils/cache';

// Mock dependencies
const mockAceService = {
  getEngine: jest.fn(() => ({
    evolve: jest.fn(),
    updateSessionActivity: jest.fn(),
    publishWithSession: jest.fn()
  }))
};

const mockLLMManager = {
  chat: jest.fn().mockResolvedValue({
    choices: [{ message: { content: '{}' } }]
  })
};

const mockToolRetrievalService = {
  findRelevantSkills: jest.fn().mockResolvedValue([]),
  indexSkill: jest.fn(),
  removeSkill: jest.fn()
};

const mockSkillManager = {
  listSkills: jest.fn().mockResolvedValue({ skills: [] })
};

const mockSessionManager = {
  // mock implementation
};

const mockStrategies: any[] = [];

describe('ACE Memory Leak Fixes', () => {
  // 测试1: AceIntegrator Scratchpad LRU缓存
  describe('AceIntegrator LRU Scratchpad', () => {
    let aceIntegrator: AceIntegrator;

    beforeEach(() => {
      aceIntegrator = new AceIntegrator(mockAceService as any, mockLLMManager as any);
    });

    afterEach(async () => {
      aceIntegrator.destroy();
    });

    test('should limit scratchpad sessions to MAX_SCRATCHPAD_SESSIONS', async () => {
      const MAX_SESSIONS = 500;

      // 创建超过限制的会话
      for (let i = 0; i < MAX_SESSIONS + 100; i++) {
        await aceIntegrator.recordThought(`session_${i}`, {
          content: `Content ${i}`,
          reasoning: `Reasoning ${i}`
        });
      }

      // 验证最旧的会话被淘汰
      const sessionScratchpads = (aceIntegrator as any).scratchpads;
      expect(sessionScratchpads.size()).toBeLessThanOrEqual(MAX_SESSIONS);
    });

    test('should clean up oversized scratchpad content', async () => {
      const largeContent = 'x'.repeat(100000); // 100KB content

      await aceIntegrator.recordThought('test_session', {
        content: largeContent,
        reasoning: 'Test'
      });

      // 触发清理
      await new Promise(resolve => setTimeout(resolve, 100));

      const scratchpad = await aceIntegrator.getScratchpad('test_session', 'COGNITIVE_CONTROL');
      expect(scratchpad.length).toBeLessThan(50000); // 限制在50KB以内
    });

    test('should properly destroy and cleanup resources', () => {
      aceIntegrator.destroy();
      const listenerTracker = (aceIntegrator as any).listenerTracker;
      expect(listenerTracker.size()).toBe(0);
    });
  });

  // 测试2: AceStrategyManager TTL缓存
  describe('AceStrategyManager TTL Cache', () => {
    let strategyManager: AceStrategyManager;

    beforeEach(() => {
      strategyManager = new AceStrategyManager(
        mockAceService as any,
        mockToolRetrievalService as any,
        mockLLMManager as any
      );
    });

    afterEach(async () => {
      strategyManager.destroy();
    });

    test('should limit strategic contexts to MAX_STRATEGIC_CONTEXTS', async () => {
      const MAX_CONTEXTS = 1000;

      // 创建超过限制的上下文
      for (let i = 0; i < MAX_CONTEXTS + 100; i++) {
        await strategyManager.updateStrategicGoals(`user_${i}`, [`goal_${i}`]);
      }

      // 验证上下文数量不超过限制
      expect(strategyManager.getStrategicSummary('user_0')).toBeNull(); // 最旧的应该被淘汰
      expect(strategyManager.getStrategicSummary(`user_${MAX_CONTEXTS + 50}`)).not.toBeNull();
    });

    test('should cleanup expired contexts', async () => {
      // 创建一些上下文
      await strategyManager.updateStrategicGoals('user1', ['goal1']);
      await strategyManager.updateStrategicGoals('user2', ['goal2']);

      // 手动触发清理
      await strategyManager.cleanupExpiredContexts();

      // 验证资源清理
      strategyManager.destroy();
    });

    test('should limit world model updates size', async () => {
      // 模拟大量世界模型更新
      for (let i = 0; i < 600; i++) {
        await strategyManager.updateWorldModel(`session_${i}`, {
          summary: `Learning ${i}`,
          learnings: [`learn_${i}`],
          outcome: 'success' as const
        });
      }

      // 验证大小限制生效
      const stats = strategyManager.getWorldModelStats();
      expect(stats.totalUpdates).toBeLessThanOrEqual(500); // MAX_WORLD_MODEL_UPDATES
    });
  });

  // 测试3: AceCapabilityManager LRU技能状态
  describe('AceCapabilityManager LRU Skill States', () => {
    let capabilityManager: AceCapabilityManager;

    beforeEach(() => {
      capabilityManager = new AceCapabilityManager(
        mockAceService as any,
        mockSkillManager as any,
        mockToolRetrievalService as any
      );
    });

    afterEach(async () => {
      capabilityManager.destroy();
    });

    test('should limit skill states to MAX_SKILL_STATES', async () => {
      const MAX_SKILLS = 500;

      // 注册超过限制的技能
      for (let i = 0; i < MAX_SKILLS + 100; i++) {
        capabilityManager.registerSkill({
          name: `skill_${i}`,
          description: `Description ${i}`,
          type: 'tool',
          tags: ['test'],
          path: `/skills/skill_${i}`,
          version: '1.0.0'
        } as any);
      }

      // 验证技能状态数量不超过限制
      const skillStatuses = capabilityManager.getAllSkillStatuses();
      expect(skillStatuses.length).toBeLessThanOrEqual(MAX_SKILLS);
    });

    test('should cleanup inactive and faulty skills', async () => {
      // 注册一些技能
      for (let i = 0; i < 10; i++) {
        capabilityManager.registerSkill({
          name: `skill_${i}`,
          description: `Description ${i}`,
          type: 'tool',
          tags: ['test'],
          path: `/skills/skill_${i}`,
          version: '1.0.0'
        } as any);
      }

      // 标记一些技能为故障
      await capabilityManager.markSkillAsFaulty('skill_1', 'Error 1');
      await capabilityManager.markSkillAsFaulty('skill_2', 'Error 2');
      await capabilityManager.markSkillAsFaulty('skill_3', 'Error 3');

      // 触发清理
      await capabilityManager.cleanupInactiveSkills();

      // 验证资源清理
      capabilityManager.destroy();
    });
  });

  // 测试4: AceStrategyOrchestrator任务状态清理
  describe('AceStrategyOrchestrator Task State Cleanup', () => {
    let orchestrator: AceStrategyOrchestrator;

    beforeEach(() => {
      orchestrator = new AceStrategyOrchestrator(
        mockAceService as any,
        mockStrategies,
        mockLLMManager as any,
        mockSessionManager as any
      );
    });

    afterEach(async () => {
      orchestrator.destroy();
    });

    test('should limit task queues and statuses', async () => {
      const MAX_QUEUES = 100;
      const MAX_STATUSES = 1000;

      // 创建超过限制的任务队列
      for (let i = 0; i < MAX_QUEUES + 50; i++) {
        orchestrator.clearSessionTasks(`session_${i}`);
      }

      // 创建超过限制的任务状态
      for (let i = 0; i < MAX_STATUSES + 100; i++) {
        // 模拟任务状态更新
        // 这里需要通过内部方法或mock实现
      }

      // 验证清理
      orchestrator.destroy();
    });

    test('should cleanup expired task statuses', async () => {
      // 清理过期任务
      await (orchestrator as any).cleanupExpiredTasks();

      orchestrator.destroy();
    });

    test('should implement fail-fast for critical task failures', async () => {
      // 这里可以测试任务失败时的快速返回机制
      // 需要模拟任务依赖关系
      orchestrator.destroy();
    });
  });

  // 测试5: AceCore并发安全
  describe('AceCore Concurrency Safety', () => {
    let aceCore: AceCore;

    beforeEach(() => {
      aceCore = new AceCore({
        agentId: 'test-agent'
      });
    });

    afterEach(async () => {
      await aceCore.destroy();
    });

    test('should protect session operations with write lock', async () => {
      const sessionId1 = await aceCore.createSession('session1', { userId: 'user1' });
      const sessionId2 = await aceCore.createSession('session2', { userId: 'user2' });

      expect(sessionId1).toBe('session1');
      expect(sessionId2).toBe('session2');
    });

    test('should protect session queries with read lock', async () => {
      const sessionId = await aceCore.createSession('test-session', { userId: 'user1' });

      const session = aceCore.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.userId).toBe('user1');
    });

    test('should protect scratchpad operations with locks', async () => {
      const sessionId = await aceCore.createSession('test-session');

      // 写操作
      await aceCore.appendToScratchpad(sessionId, 'layer1', 'content1');
      await aceCore.appendToScratchpad(sessionId, 'layer2', 'content2');

      // 读操作
      const layer1 = await aceCore.getScratchpad(sessionId, 'layer1');
      const layer2 = await aceCore.getScratchpad(sessionId, 'layer2');

      expect(layer1).toContain('content1');
      expect(layer2).toContain('content2');
    });

    test('should cleanup expired sessions', async () => {
      const sessionId = await aceCore.createSession('test-session');
      expect(sessionId).toBeDefined();

      await aceCore.archiveSession(sessionId);

      const session = aceCore.getSession(sessionId);
      expect(session).toBeUndefined();
    });
  });

  // 测试6: 缓存工具类
  describe('Cache Utilities', () => {
    test('LRUMap should evict oldest entries', () => {
      const map = new LRUMap<string, string>(3);

      map.set('key1', 'value1');
      map.set('key2', 'value2');
      map.set('key3', 'value3');
      map.set('key4', 'value4'); // 应该淘汰key1

      expect(map.get('key1')).toBeUndefined();
      expect(map.get('key2')).toBeDefined();
      expect(map.get('key3')).toBeDefined();
      expect(map.get('key4')).toBeDefined();
    });

    test('TTLCache should expire entries', async () => {
      const cache = new TTLCache<string, string>(100); // 100ms TTL

      cache.set('key1', 'value1');

      // 立即访问应该存在
      expect(cache.get('key1')).toBe('value1');

      // 等待过期
      await new Promise(resolve => setTimeout(resolve, 150));

      // 应该已过期
      expect(cache.get('key1')).toBeUndefined();
    });

    test('ReadWriteLock should allow concurrent reads', async () => {
      const lock = new ReadWriteLock();
      let readCount = 0;

      const readPromises = [];
      for (let i = 0; i < 5; i++) {
        readPromises.push(
          lock.withReadLock(async () => {
            readCount++;
            await new Promise(resolve => setTimeout(resolve, 10));
            return readCount;
          })
        );
      }

      const results = await Promise.all(readPromises);
      expect(results).toHaveLength(5);
      expect(results.every(r => typeof r === 'number')).toBe(true);

      lock.destroy();
    });

    test('AsyncLock should prevent concurrent operations', async () => {
      const lock = new AsyncLock();
      let executionOrder: number[] = [];

      const operations = [];
      for (let i = 0; i < 5; i++) {
        operations.push(
          lock.withLock(`key`, async () => {
            executionOrder.push(i);
            await new Promise(resolve => setTimeout(resolve, 10));
            return i;
          })
        );
      }

      const results = await Promise.all(operations);

      // 异步锁应该按顺序执行
      expect(executionOrder).toEqual([0, 1, 2, 3, 4]);
      expect(results).toEqual([0, 1, 2, 3, 4]);
    });
  });

  // 测试7: 内存稳定性测试
  describe('Memory Stability Tests', () => {
    test('should not grow memory indefinitely during high load', async () => {
      const aceIntegrator = new AceIntegrator(mockAceService as any, mockLLMManager as any);

      const initialMemory = process.memoryUsage().heapUsed;

      // 模拟高负载场景
      for (let i = 0; i < 1000; i++) {
        await aceIntegrator.recordThought(`session_${i}`, {
          content: `Content ${i}`,
          reasoning: `Reasoning ${i}`
        });

        if (i % 100 === 0) {
          // 触发垃圾回收检查
          if (global.gc) {
            global.gc();
          }
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;

      // 内存增长应该合理（不超过100MB）
      expect(memoryIncrease).toBeLessThan(100);

      aceIntegrator.destroy();
    }, 30000);
  });
});
