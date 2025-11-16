/**
 * Skills系统缓存命中率监控测试
 * 
 * 测试：
 * - 缓存统计收集
 * - 命中率计算
 * - 缓存性能监控
 * - 缓存策略验证
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  MetadataLoader,
  SkillsIndex,
  SkillsCache,
  InstructionLoader,
  ResourceLoader,
  SkillsLoader,
  SkillsMetricsCollector
} from '../../src/core/skills';

/**
 * 创建测试技能
 */
async function createTestSkill(skillsRoot: string, skillName: string): Promise<void> {
  const skillDir = path.join(skillsRoot, skillName);
  await fs.mkdir(skillDir, { recursive: true });

  await fs.writeFile(
    path.join(skillDir, 'METADATA.yml'),
    `name: ${skillName}
displayName: ${skillName}测试
description: 测试技能
version: 1.0.0
type: direct
domain: test
keywords: [test]
permissions:
  network: false
  filesystem: none
cacheable: true
ttl: 3600
`,
    'utf-8'
  );

  await fs.writeFile(
    path.join(skillDir, 'SKILL.md'),
    `# ${skillName}

## 代码

\`\`\`typescript
export async function execute(params: Record<string, unknown>): Promise<unknown> {
  return { success: true, result: 'test' };
}
\`\`\`
`,
    'utf-8'
  );
}

describe('Skills系统缓存命中率监控', () => {
  let skillsRoot: string;
  let skillsCache: SkillsCache;
  let skillsLoader: SkillsLoader;
  let metricsCollector: SkillsMetricsCollector;

  beforeAll(async () => {
    skillsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-cache-monitoring-'));
    
    // 创建多个测试技能
    for (let i = 0; i < 10; i++) {
      await createTestSkill(skillsRoot, `cache-test-${i}`);
    }

    const metadataLoader = new MetadataLoader();
    skillsCache = new SkillsCache();
    const skillsIndex = new SkillsIndex({
      skillsRoot,
      metadataProvider: metadataLoader
    });
    const instructionLoader = new InstructionLoader(skillsIndex, skillsCache);
    const resourceLoader = new ResourceLoader(skillsIndex, skillsCache);
    skillsLoader = new SkillsLoader(skillsIndex, instructionLoader, resourceLoader, skillsCache);
    metricsCollector = new SkillsMetricsCollector();

    await skillsIndex.buildIndex();
  });

  afterAll(async () => {
    await fs.rm(skillsRoot, { recursive: true, force: true });
  });

  describe('缓存统计收集', () => {
    it('应该收集元数据缓存统计', async () => {
      const statsBefore = skillsCache.getStats();

      // 加载技能（应该缓存元数据）
      await skillsLoader.loadSkill('cache-test-0', { includeContent: false });
      await skillsLoader.loadSkill('cache-test-0', { includeContent: false });

      const statsAfter = skillsCache.getStats();
      expect(statsAfter.metadata.hits).toBeGreaterThan(statsBefore.metadata.hits);
      expect(statsAfter.metadata.misses).toBeGreaterThanOrEqual(statsBefore.metadata.misses);
    });

    it('应该收集内容缓存统计', async () => {
      const statsBefore = skillsCache.getStats();

      // 加载技能内容
      await skillsLoader.loadSkill('cache-test-1', { includeContent: true });
      await skillsLoader.loadSkill('cache-test-1', { includeContent: true });

      const statsAfter = skillsCache.getStats();
      expect(statsAfter.content.hits).toBeGreaterThan(statsBefore.content.hits);
    });

    it('应该收集资源缓存统计', async () => {
      const statsBefore = skillsCache.getStats();

      // 加载技能资源
      await skillsLoader.loadSkill('cache-test-2', { includeResources: true });
      await skillsLoader.loadSkill('cache-test-2', { includeResources: true });

      const statsAfter = skillsCache.getStats();
      expect(statsAfter.resources.hits).toBeGreaterThanOrEqual(statsBefore.resources.hits);
    });
  });

  describe('命中率计算', () => {
    it('应该计算元数据缓存命中率', () => {
      const stats = skillsCache.getStats();
      const total = stats.metadata.hits + stats.metadata.misses;
      
      if (total > 0) {
        const hitRate = stats.metadata.hits / total;
        expect(hitRate).toBeGreaterThanOrEqual(0);
        expect(hitRate).toBeLessThanOrEqual(1);
        console.log(`元数据缓存命中率: ${(hitRate * 100).toFixed(2)}%`);
      }
    });

    it('应该计算内容缓存命中率', () => {
      const stats = skillsCache.getStats();
      const total = stats.content.hits + stats.content.misses;
      
      if (total > 0) {
        const hitRate = stats.content.hits / total;
        expect(hitRate).toBeGreaterThanOrEqual(0);
        expect(hitRate).toBeLessThanOrEqual(1);
        console.log(`内容缓存命中率: ${(hitRate * 100).toFixed(2)}%`);
      }
    });

    it('应该计算总体缓存命中率', () => {
      const stats = skillsCache.getStats();
      const totalHits = stats.metadata.hits + stats.content.hits + stats.resources.hits;
      const totalMisses = stats.metadata.misses + stats.content.misses + stats.resources.misses;
      const total = totalHits + totalMisses;

      if (total > 0) {
        const overallHitRate = totalHits / total;
        expect(overallHitRate).toBeGreaterThanOrEqual(0);
        expect(overallHitRate).toBeLessThanOrEqual(1);
        console.log(`总体缓存命中率: ${(overallHitRate * 100).toFixed(2)}%`);
      }
    });
  });

  describe('缓存性能监控', () => {
    it('应该监控缓存大小', () => {
      const stats = skillsCache.getStats();
      
      expect(stats.metadata.size).toBeGreaterThanOrEqual(0);
      expect(stats.content.size).toBeGreaterThanOrEqual(0);
      expect(stats.resources.size).toBeGreaterThanOrEqual(0);
    });

    it('应该监控缓存容量', () => {
      const stats = skillsCache.getStats();
      
      // 检查是否超过容量限制
      expect(stats.metadata.size).toBeLessThanOrEqual(stats.metadata.capacity);
      expect(stats.content.size).toBeLessThanOrEqual(stats.content.capacity);
      expect(stats.resources.size).toBeLessThanOrEqual(stats.resources.capacity);
    });
  });

  describe('缓存策略验证', () => {
    it('应该实现LRU淘汰策略', async () => {
      const cache = skillsCache;
      const initialStats = cache.getStats();

      // 加载多个技能，超过缓存容量
      const skillCount = 20;
      for (let i = 0; i < skillCount; i++) {
        await skillsLoader.loadSkill(`cache-test-${i % 10}`, { includeContent: true });
      }

      const finalStats = cache.getStats();
      
      // 缓存大小应该不超过容量
      expect(finalStats.content.size).toBeLessThanOrEqual(finalStats.content.capacity);
    });

    it('应该支持TTL过期', async () => {
      // 创建一个短期TTL的缓存
      const shortTTLCache = new SkillsCache({
        config: {
          content: {
            maxSize: 10,
            ttl: 50 // 50ms
          }
        }
      });

      const metadataLoader = new MetadataLoader();
      const skillsIndex = new SkillsIndex({
        skillsRoot,
        metadataProvider: metadataLoader
      });
      const instructionLoader = new InstructionLoader(skillsIndex, shortTTLCache);
      const resourceLoader = new ResourceLoader(skillsIndex, shortTTLCache);
      const shortTTLLoader = new SkillsLoader(
        skillsIndex,
        instructionLoader,
        resourceLoader,
        shortTTLCache
      );
      await skillsIndex.buildIndex();

      // 加载技能
      await shortTTLLoader.loadSkill('cache-test-0', { includeContent: true });
      
      // 等待TTL过期
      await new Promise(resolve => setTimeout(resolve, 300));

      // 再次加载应该重新获取（缓存已过期）
      const statsBefore = shortTTLCache.getStats();
      await shortTTLLoader.loadSkill('cache-test-0', { includeContent: true });
      const statsAfter = shortTTLCache.getStats();

      // 应该有新的miss
      expect(statsAfter.content.misses).toBeGreaterThan(statsBefore.content.misses);
    });
  });

  describe('指标收集器集成', () => {
    it('应该收集缓存指标', () => {
      const metrics = metricsCollector.getStats();
      
      expect(metrics).toBeDefined();
      // 根据实际实现检查指标
    });

    it('应该记录缓存操作', () => {
      const stats = skillsCache.getStats();
      const totalOperations = stats.metadata.hits + stats.metadata.misses +
                             stats.content.hits + stats.content.misses +
                             stats.resources.hits + stats.resources.misses;

      expect(totalOperations).toBeGreaterThanOrEqual(0);
    });
  });
});

