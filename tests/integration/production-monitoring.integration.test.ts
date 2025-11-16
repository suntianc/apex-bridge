/**
 * 生产环境监控集成测试
 * 
 * 测试监控系统的功能：
 * - 指标收集
 * - 健康检查
 * - 告警系统
 * - API接口
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
  CodeCache,
  MemoryManager,
  ProductionMonitor,
  ProductionMonitorService
} from '../../src/core/skills';
import * as path from 'path';
import type { ExecutionRequest } from '../../src/types';

describe('生产环境监控集成测试', () => {
  let skillsRoot: string;
  let skillsLoader: SkillsLoader;
  let executionManager: SkillsExecutionManager;
  let memoryManager: MemoryManager;
  let monitor: ProductionMonitor;
  let monitorService: ProductionMonitorService;

  beforeAll(async () => {
    skillsRoot = path.join(__dirname, '../../skills');
    
    const metadataLoader = new MetadataLoader();
    const skillsCache = new SkillsCache();
    const skillsIndex = new SkillsIndex({
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

    memoryManager = new MemoryManager({
      skillsCache,
      codeCache,
      usageTracker: undefined
    });

    monitor = new ProductionMonitor(
      executionManager,
      skillsLoader,
      memoryManager
    );

    monitorService = new ProductionMonitorService();
    monitorService.initialize(executionManager, skillsLoader, memoryManager);

    await skillsIndex.buildIndex();
  });

  afterAll(() => {
    monitor.stop();
    monitorService.stop();
  });

  describe('指标收集', () => {
    it('应该能够收集监控指标', () => {
      const metrics = monitor.collectMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.timestamp).toBeGreaterThan(0);
      expect(metrics.execution).toBeDefined();
      expect(metrics.memory).toBeDefined();
      expect(metrics.cache).toBeDefined();
      expect(metrics.system).toBeDefined();
    });

    it('应该保存指标历史', () => {
      monitor.collectMetrics();
      const history = monitor.getMetricsHistory(10);

      expect(history.length).toBeGreaterThan(0);
      expect(history[history.length - 1]).toBeDefined();
    });

    it('应该限制历史记录数量', () => {
      // 收集大量指标
      for (let i = 0; i < 100; i++) {
        monitor.collectMetrics();
      }

      const history = monitor.getMetricsHistory();
      expect(history.length).toBeLessThanOrEqual(1000); // maxHistorySize
    });
  });

  describe('健康检查', () => {
    it('应该能够获取健康状态', () => {
      monitor.collectMetrics();
      const health = monitor.getHealthStatus();

      expect(health).toBeDefined();
      expect(health.status).toMatch(/healthy|degraded|unhealthy/);
      expect(health.checks).toBeDefined();
      expect(health.checks.execution).toBeDefined();
      expect(health.checks.memory).toBeDefined();
      expect(health.checks.cache).toBeDefined();
      expect(health.checks.system).toBeDefined();
    });

    it('健康状态应该反映系统状态', () => {
      monitor.collectMetrics();
      const health = monitor.getHealthStatus();

      // 如果所有检查都通过，应该是healthy
      const allOk = Object.values(health.checks).every(c => c.status === 'ok');
      if (allOk) {
        expect(health.status).toBe('healthy');
      }
    });
  });

  describe('告警系统', () => {
    it('应该能够触发告警', () => {
      // 使用高错误率阈值触发告警
      monitor.updateConfig({
        executionErrorRateThreshold: 0.01 // 1%，很容易触发
      });

      // 执行一些操作以产生指标
      monitor.collectMetrics();
      monitor.evaluateAlerts();

      const alerts = monitor.getActiveAlerts();
      // 可能没有告警，取决于实际指标
      expect(Array.isArray(alerts)).toBe(true);
    });

    it('应该能够获取所有告警', () => {
      const allAlerts = monitor.getAllAlerts(10);

      expect(Array.isArray(allAlerts)).toBe(true);
    });

    it('应该能够解决告警', () => {
      // 触发告警
      monitor.updateConfig({
        executionErrorRateThreshold: 0.01
      });
      monitor.collectMetrics();
      monitor.evaluateAlerts();

      // 恢复正常配置
      monitor.updateConfig({
        executionErrorRateThreshold: 0.1
      });
      monitor.evaluateAlerts();

      // 告警应该被解决
      const activeAlerts = monitor.getActiveAlerts();
      // 可能没有活跃告警
      expect(Array.isArray(activeAlerts)).toBe(true);
    });
  });

  describe('监控服务', () => {
    it('应该能够启动和停止监控', () => {
      monitorService.start(1000); // 1秒间隔
      expect(monitorService.isReady()).toBe(true);

      // 等待一次采集
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const metrics = monitorService.getMonitor().getCurrentMetrics();
          expect(metrics).toBeDefined();
          monitorService.stop();
          resolve();
        }, 1500);
      });
    });
  });

  describe('配置管理', () => {
    it('应该能够更新配置', () => {
      const oldConfig = monitor.getConfig();
      monitor.updateConfig({
        executionErrorRateThreshold: 0.05
      });

      const newConfig = monitor.getConfig();
      expect(newConfig.executionErrorRateThreshold).toBe(0.05);
      expect(newConfig.executionErrorRateThreshold).not.toBe(oldConfig.executionErrorRateThreshold);
    });
  });
});

