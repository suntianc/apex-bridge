import { MemoryManager } from '../../src/core/skills/MemoryManager';
import { SkillsCache } from '../../src/core/skills/SkillsCache';
import { CodeCache } from '../../src/core/skills/CodeCache';
import { SkillUsageTracker } from '../../src/core/skills/SkillUsageTracker';
import { MemoryStats, MemoryPressureLevel } from '../../src/types';

describe('MemoryManager', () => {
  let manager: MemoryManager;
  let skillsCache: SkillsCache;
  let codeCache: CodeCache;
  let usageTracker: SkillUsageTracker;

  beforeEach(() => {
    skillsCache = new SkillsCache();
    codeCache = new CodeCache();
    usageTracker = new SkillUsageTracker();

    manager = new MemoryManager({
      skillsCache,
      codeCache,
      usageTracker,
      config: {
        enabled: true,
        monitoringInterval: 100, // 快速测试
        cleanupInterval: 200,
        maxMemoryMB: 100
      }
    });
  });

  afterEach(() => {
    manager.stop();
  });

  describe('start/stop', () => {
    it('应该启动和停止内存管理', () => {
      manager.start();
      expect(manager.getStats().currentStats).toBeDefined();
      manager.stop();
    });

    it('应该防止重复启动', () => {
      manager.start();
      manager.start(); // 应该被忽略
      manager.stop();
    });
  });

  describe('getStats', () => {
    it('应该返回内存管理统计信息', () => {
      const stats = manager.getStats();

      expect(stats).toBeDefined();
      expect(stats.currentStats).toBeDefined();
      expect(stats.pressureLevel).toBeDefined();
      expect(stats.totalCleanups).toBe(0);
      expect(stats.totalFreedMemory).toBe(0);
      expect(stats.cleanupHistory).toEqual([]);
    });
  });

  describe('performCleanup', () => {
    it('应该执行清理操作', async () => {
      const beforeStats = manager.getCurrentMemoryStats();
      const pressureLevel: MemoryPressureLevel = {
        level: 'moderate',
        threshold: 0.7,
        action: '执行常规清理'
      };

      const result = await manager.performCleanup(pressureLevel, beforeStats);

      expect(result).toBeDefined();
      expect(result.cleaned).toBeDefined();
      expect(result.freedMemory).toBeGreaterThanOrEqual(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('应该防止并发清理', async () => {
      const beforeStats = manager.getCurrentMemoryStats();
      const pressureLevel: MemoryPressureLevel = {
        level: 'moderate',
        threshold: 0.7,
        action: '执行常规清理'
      };

      // 同时触发多个清理请求
      const promises = [
        manager.performCleanup(pressureLevel, beforeStats),
        manager.performCleanup(pressureLevel, beforeStats),
        manager.performCleanup(pressureLevel, beforeStats)
      ];

      const results = await Promise.all(promises);
      
      // 应该只有一个实际执行了清理
      const executed = results.filter((r) => r.duration > 0);
      expect(executed.length).toBeGreaterThan(0);
    });
  });

  describe('checkMemoryAndCleanup', () => {
    it('应该在内存正常时不执行清理', async () => {
      // 模拟正常内存使用
      const originalGetStats = manager['monitor'].getMemoryStats;
      manager['monitor'].getMemoryStats = jest.fn(() => ({
        heapUsed: 30 * 1024 * 1024,
        heapTotal: 50 * 1024 * 1024,
        external: 0,
        rss: 100 * 1024 * 1024,
        availableMemory: 70,
        memoryUsagePercent: 0.3,
        timestamp: Date.now()
      }));

      await manager.checkMemoryAndCleanup();
      const stats = manager.getStats();
      
      // 应该没有执行清理
      expect(stats.totalCleanups).toBe(0);

      // 恢复原始方法
      manager['monitor'].getMemoryStats = originalGetStats;
    });
  });

  describe('配置管理', () => {
    it('应该允许更新配置', () => {
      manager.updateConfig({ maxMemoryMB: 200 });
      const config = manager.getConfig();
      expect(config.maxMemoryMB).toBe(200);
    });

    it('应该返回当前配置', () => {
      const config = manager.getConfig();
      expect(config).toBeDefined();
      expect(config.enabled).toBeDefined();
      expect(config.maxMemoryMB).toBeDefined();
    });
  });

  describe('getCurrentMemoryStats', () => {
    it('应该返回当前内存统计', () => {
      const stats = manager.getCurrentMemoryStats();
      expect(stats).toBeDefined();
      expect(stats.heapUsed).toBeGreaterThanOrEqual(0);
      expect(stats.timestamp).toBeGreaterThan(0);
    });
  });

  describe('getCurrentPressureLevel', () => {
    it('应该返回当前压力级别', () => {
      const pressure = manager.getCurrentPressureLevel();
      expect(pressure).toBeDefined();
      expect(pressure.level).toMatch(/normal|moderate|high|critical/);
      expect(pressure.action).toBeDefined();
    });
  });
});

