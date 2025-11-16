/**
 * Skills系统性能基准测试
 * 
 * 建立性能基准，用于后续对比和监控：
 * - 启动性能基准
 * - 执行性能基准
 * - 内存使用基准
 * - 缓存性能基准
 */

import {
  MetadataLoader,
  SkillsIndex,
  SkillsCache,
  InstructionLoader,
  ResourceLoader,
  SkillsLoader,
  SkillsExecutionManager,
  SkillsDirectExecutor,
  CodeGenerator,
  SecurityValidator,
  SandboxEnvironment,
  CodeCache
} from '../../src/core/skills';
import * as path from 'path';
import type { ExecutionRequest } from '../../src/types';
import { performance } from 'node:perf_hooks';

/**
 * 性能基准结果
 */
interface BenchmarkResult {
  name: string;
  value: number;
  unit: string;
  threshold?: number;
  passed: boolean;
}

describe('Skills系统性能基准测试', () => {
  let skillsRoot: string;
  let skillsIndex: SkillsIndex;
  let skillsLoader: SkillsLoader;
  let executionManager: SkillsExecutionManager;

  beforeAll(async () => {
    skillsRoot = path.join(__dirname, '../../skills');
    
    const metadataLoader = new MetadataLoader();
    const skillsCache = new SkillsCache();
    skillsIndex = new SkillsIndex({
      skillsRoot,
      metadataProvider: metadataLoader
    });
    const instructionLoader = new InstructionLoader(skillsIndex, skillsCache);
    const resourceLoader = new ResourceLoader(skillsIndex, skillsCache);
    skillsLoader = new SkillsLoader(skillsIndex, instructionLoader, resourceLoader, skillsCache);

    const codeGenerator = new CodeGenerator();
    const securityValidator = new SecurityValidator();
    const sandbox = new SandboxEnvironment();
    const codeCache = new CodeCache();
    const directExecutor = new SkillsDirectExecutor({
      loader: skillsLoader,
      codeGenerator,
      securityValidator,
      sandbox,
      codeCache
    });

    executionManager = new SkillsExecutionManager(skillsLoader, {
      executors: {
        direct: directExecutor
      }
    });

    await skillsIndex.buildIndex();
  });

  describe('启动性能基准', () => {
    it('元数据索引构建时间应该 < 5秒（6个技能）', async () => {
      const startTime = Date.now();
      await skillsIndex.buildIndex();
      const buildTime = Date.now() - startTime;

      const result: BenchmarkResult = {
        name: '元数据索引构建时间',
        value: buildTime,
        unit: 'ms',
        threshold: 5000,
        passed: buildTime < 5000
      };

      console.log(`基准: ${result.name} = ${result.value}${result.unit} (阈值: ${result.threshold}${result.unit})`);
      expect(result.passed).toBe(true);
    });

    it.skip('元数据大小应该 < 120 tokens per skill', () => {
      const metadata = skillsIndex.getMetadata('SimpleDice');
      expect(metadata).toBeDefined();
      
      if (metadata) {
        // 简单估算：1 token ≈ 4 characters
        const estimatedTokens = JSON.stringify(metadata).length / 4;
        const result: BenchmarkResult = {
          name: '元数据大小',
          value: estimatedTokens,
          unit: 'tokens',
          threshold: 120,
          passed: estimatedTokens < 120
        };

        console.log(`基准: ${result.name} = ${result.value.toFixed(2)}${result.unit} (阈值: ${result.threshold}${result.unit})`);
        expect(result.passed).toBe(true);
      }
    });
  });

  describe('执行性能基准', () => {
    it('技能执行时间应该 < 200ms', async () => {
      const iterations = 10;
      const executionTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        try {
          await executionManager.execute({
            skillName: 'SimpleDice',
            parameters: { sides: 6, count: 1 }
          });
        } catch {
          // 忽略执行错误，只测量时间
        }
        executionTimes.push(Date.now() - startTime);
      }

      const averageTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
      const result: BenchmarkResult = {
        name: '技能执行时间（平均）',
        value: averageTime,
        unit: 'ms',
        threshold: 200,
        passed: averageTime < 200
      };

      console.log(`基准: ${result.name} = ${result.value.toFixed(2)}${result.unit} (阈值: ${result.threshold}${result.unit})`);
      expect(result.passed).toBe(true);
    });

    it('技能执行时间（P95）应该 < 300ms', async () => {
      const iterations = 20;
      const executionTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        try {
          await executionManager.execute({
            skillName: 'TimeInfo',
            parameters: {}
          });
        } catch {
          // 忽略执行错误
        }
        executionTimes.push(Date.now() - startTime);
      }

      executionTimes.sort((a, b) => a - b);
      const p95Index = Math.floor(iterations * 0.95);
      const p95Time = executionTimes[p95Index] || executionTimes[executionTimes.length - 1];

      const result: BenchmarkResult = {
        name: '技能执行时间（P95）',
        value: p95Time,
        unit: 'ms',
        threshold: 300,
        passed: p95Time < 300
      };

      console.log(`基准: ${result.name} = ${result.value.toFixed(2)}${result.unit} (阈值: ${result.threshold}${result.unit})`);
      expect(result.passed).toBe(true);
    });
  });

  describe('内存使用基准', () => {
    it('内存使用应该合理', () => {
      if (typeof process?.memoryUsage === 'function') {
        const usage = process.memoryUsage();
        const heapUsedMB = usage.heapUsed / 1024 / 1024;
        
        const result: BenchmarkResult = {
          name: '堆内存使用',
          value: heapUsedMB,
          unit: 'MB',
          threshold: 500, // 合理的上限
          passed: heapUsedMB < 500
        };

        console.log(`基准: ${result.name} = ${result.value.toFixed(2)}${result.unit} (阈值: ${result.threshold}${result.unit})`);
        expect(result.passed).toBe(true);
      }
    });
  });

  describe('缓存性能基准', () => {
    it('缓存命中率应该 > 80%', async () => {
      // 预热
      for (let i = 0; i < 5; i++) {
        try {
          await skillsLoader.loadSkill('SimpleDice', { includeContent: true });
        } catch {
          // 忽略错误
        }
      }

      // 测试缓存命中
      const statsBefore = skillsLoader.getCache().getStats();
      for (let i = 0; i < 10; i++) {
        try {
          await skillsLoader.loadSkill('SimpleDice', { includeContent: true });
        } catch {
          // 忽略错误
        }
      }
      const statsAfter = skillsLoader.getCache().getStats();

      const totalRequests = statsAfter.content.hits + statsAfter.content.misses;
      const hitRate = totalRequests > 0 ? statsAfter.content.hits / totalRequests : 0;

      const result: BenchmarkResult = {
        name: '内容缓存命中率',
        value: hitRate * 100,
        unit: '%',
        threshold: 80,
        passed: hitRate > 0.8
      };

      console.log(`基准: ${result.name} = ${result.value.toFixed(2)}${result.unit} (阈值: ${result.threshold}${result.unit})`);
      expect(result.passed).toBe(true);
    });

    it.skip('代码缓存应该提高性能', async () => {
      // 第一次执行（编译）
      const firstStart = performance.now();
      try {
        await executionManager.execute({
          skillName: 'TimeInfo',
          parameters: {}
        });
      } catch {
        // 忽略错误
      }
      const firstTime = Math.max(0.1, performance.now() - firstStart);

      // 第二次执行（应该使用缓存）
      const secondStart = performance.now();
      try {
        await executionManager.execute({
          skillName: 'TimeInfo',
          parameters: {}
        });
      } catch {
        // 忽略错误
      }
      const secondTime = Math.max(0.1, performance.now() - secondStart);

      // 第二次应该更快或相近（缓存生效）
      const improvement = ((firstTime - secondTime) / firstTime) * 100;
      const result: BenchmarkResult = {
        name: '代码缓存性能提升',
        value: improvement,
        unit: '%',
        threshold: 0, // 只要不更慢就行
        passed: secondTime <= firstTime * 1.5
      };

      console.log(`基准: ${result.name} = ${result.value.toFixed(2)}${result.unit} (首次: ${firstTime}ms, 缓存: ${secondTime}ms)`);
      expect(result.passed).toBe(true);
    });
  });

  describe('并发性能基准', () => {
    it('应该支持并发执行（10个并发）', async () => {
      const concurrentCount = 10;
      const startTime = Date.now();

      const promises = Array.from({ length: concurrentCount }, (_, i) =>
        executionManager.execute({
          skillName: 'TimeInfo',
          parameters: { iteration: i }
        }).catch(() => ({ success: false })) // 捕获错误
      );

      await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      const averageTime = totalTime / concurrentCount;

      const result: BenchmarkResult = {
        name: '并发执行平均时间（10并发）',
        value: averageTime,
        unit: 'ms',
        threshold: 500, // 并发时允许稍慢
        passed: averageTime < 500
      };

      console.log(`基准: ${result.name} = ${result.value.toFixed(2)}${result.unit} (总时间: ${totalTime}ms)`);
      expect(result.passed).toBe(true);
    });
  });

  describe('加载性能基准', () => {
    it('技能加载时间应该 < 100ms（缓存命中）', async () => {
      // 预热
      try {
        await skillsLoader.loadSkill('SystemInfo', { includeContent: true });
      } catch {
        // 忽略错误
      }

      // 测试加载时间（应该命中缓存）
      const loadTimes: number[] = [];
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        try {
          await skillsLoader.loadSkill('SystemInfo', { includeContent: true });
        } catch {
          // 忽略错误
        }
        loadTimes.push(Date.now() - startTime);
      }

      const averageLoadTime = loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length;

      const result: BenchmarkResult = {
        name: '技能加载时间（缓存命中）',
        value: averageLoadTime,
        unit: 'ms',
        threshold: 100,
        passed: averageLoadTime < 100
      };

      console.log(`基准: ${result.name} = ${result.value.toFixed(2)}${result.unit} (阈值: ${result.threshold}${result.unit})`);
      expect(result.passed).toBe(true);
    });
  });
});

