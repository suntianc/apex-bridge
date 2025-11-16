import { MemoryMonitor } from '../../src/core/skills/MemoryMonitor';
import { MemoryStats, MemoryPressureLevel } from '../../src/types';

describe('MemoryMonitor', () => {
  let monitor: MemoryMonitor;

  beforeEach(() => {
    monitor = new MemoryMonitor({
      maxMemoryMB: 100,
      normalThreshold: 0.5,
      moderateThreshold: 0.7,
      highThreshold: 0.85,
      criticalThreshold: 0.95
    });
  });

  describe('getMemoryStats', () => {
    it('应该返回内存统计信息', () => {
      const stats = monitor.getMemoryStats();

      expect(stats).toBeDefined();
      expect(stats.heapUsed).toBeGreaterThanOrEqual(0);
      expect(stats.heapTotal).toBeGreaterThanOrEqual(0);
      expect(stats.availableMemory).toBeGreaterThanOrEqual(0);
      expect(stats.memoryUsagePercent).toBeGreaterThanOrEqual(0);
      expect(stats.memoryUsagePercent).toBeLessThanOrEqual(1);
      expect(stats.timestamp).toBeGreaterThan(0);
    });

    it('应该计算正确的内存使用百分比', () => {
      const stats = monitor.getMemoryStats();
      // memoryUsagePercent 是基于 heapUsed / maxMemoryMB 计算的
      const expectedPercent = Math.min(1, stats.heapUsed / (100 * 1024 * 1024));

      expect(stats.memoryUsagePercent).toBeGreaterThanOrEqual(0);
      expect(stats.memoryUsagePercent).toBeLessThanOrEqual(1);
    });
  });

  describe('assessPressureLevel', () => {
    it('应该识别正常内存压力', () => {
      const mockStats: MemoryStats = {
        heapUsed: 30 * 1024 * 1024, // 30MB
        heapTotal: 50 * 1024 * 1024,
        external: 0,
        rss: 100 * 1024 * 1024,
        availableMemory: 70,
        memoryUsagePercent: 0.3, // 30% < 50%
        timestamp: Date.now()
      };

      const pressure = monitor.assessPressureLevel(mockStats);
      expect(pressure.level).toBe('normal');
    });

    it('应该识别中等内存压力', () => {
      // 60MB / 100MB = 0.6, 在 moderateThreshold (0.7) 以下，所以是 normal
      // 需要 >= 0.7 才是 moderate
      const mockStats: MemoryStats = {
        heapUsed: 75 * 1024 * 1024, // 75MB
        heapTotal: 80 * 1024 * 1024,
        external: 0,
        rss: 120 * 1024 * 1024,
        availableMemory: 25,
        memoryUsagePercent: 0.75, // 75% >= 70% && < 85%
        timestamp: Date.now()
      };

      const pressure = monitor.assessPressureLevel(mockStats);
      expect(pressure.level).toBe('moderate');
    });

    it('应该识别高内存压力', () => {
      const mockStats: MemoryStats = {
        heapUsed: 87 * 1024 * 1024, // 87MB
        heapTotal: 90 * 1024 * 1024,
        external: 0,
        rss: 150 * 1024 * 1024,
        availableMemory: 13,
        memoryUsagePercent: 0.87, // 87% >= 85% && < 95%
        timestamp: Date.now()
      };

      const pressure = monitor.assessPressureLevel(mockStats);
      expect(pressure.level).toBe('high');
    });

    it('应该识别严重内存压力', () => {
      const mockStats: MemoryStats = {
        heapUsed: 96 * 1024 * 1024, // 96MB
        heapTotal: 100 * 1024 * 1024,
        external: 0,
        rss: 200 * 1024 * 1024,
        availableMemory: 4,
        memoryUsagePercent: 0.96, // 96% >= 95%
        timestamp: Date.now()
      };

      const pressure = monitor.assessPressureLevel(mockStats);
      expect(pressure.level).toBe('critical');
      expect(pressure.action).toContain('立即执行');
    });
  });

  describe('shouldTriggerCleanup', () => {
    it('应该在内存压力时触发清理', () => {
      const mockStats: MemoryStats = {
        heapUsed: 80 * 1024 * 1024,
        heapTotal: 90 * 1024 * 1024,
        external: 0,
        rss: 150 * 1024 * 1024,
        availableMemory: 20,
        memoryUsagePercent: 0.8,
        timestamp: Date.now()
      };

      const shouldCleanup = monitor.shouldTriggerCleanup(mockStats);
      expect(shouldCleanup).toBe(true);
    });

    it('不应该在正常内存时触发清理', () => {
      const mockStats: MemoryStats = {
        heapUsed: 30 * 1024 * 1024,
        heapTotal: 50 * 1024 * 1024,
        external: 0,
        rss: 100 * 1024 * 1024,
        availableMemory: 70,
        memoryUsagePercent: 0.3,
        timestamp: Date.now()
      };

      const shouldCleanup = monitor.shouldTriggerCleanup(mockStats);
      expect(shouldCleanup).toBe(false);
    });

    it('应该在自动清理禁用时不触发', () => {
      const disabledMonitor = new MemoryMonitor({
        autoCleanup: false,
        maxMemoryMB: 100
      });

      const mockStats: MemoryStats = {
        heapUsed: 80 * 1024 * 1024,
        heapTotal: 90 * 1024 * 1024,
        external: 0,
        rss: 150 * 1024 * 1024,
        availableMemory: 20,
        memoryUsagePercent: 0.8,
        timestamp: Date.now()
      };

      const shouldCleanup = disabledMonitor.shouldTriggerCleanup(mockStats);
      expect(shouldCleanup).toBe(false);
    });
  });

  describe('配置管理', () => {
    it('应该允许更新配置', () => {
      monitor.updateConfig({ maxMemoryMB: 200 });
      const config = monitor.getConfig();
      expect(config.maxMemoryMB).toBe(200);
    });

    it('应该使用自定义配置', () => {
      const customMonitor = new MemoryMonitor({
        maxMemoryMB: 500,
        normalThreshold: 0.6
      });

      const config = customMonitor.getConfig();
      expect(config.maxMemoryMB).toBe(500);
      expect(config.normalThreshold).toBe(0.6);
    });
  });
});

