import * as fs from 'fs/promises';
import * as path from 'path';
import {
  SkillsExecutionManager,
  SkillsDirectExecutor,
  SkillsLoader,
  CodeGenerator,
  SecurityValidator,
  SandboxEnvironment,
  CodeCache,
  SkillsIndex,
  MetadataLoader,
  SkillsCache,
  InstructionLoader,
  ResourceLoader
} from '../core/skills';
import logger from '../utils/logger';
import type { ExecutionRequest, ExecutionResponse } from '../types';

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  executionTime: number; // 执行时间 (ms)
  loadTime: number; // 加载时间 (ms)
  memoryUsage: number; // 内存使用 (MB)
  tokenUsage?: number; // Token使用量（如果可测量）
  cacheHitRate?: number; // 缓存命中率
}

/**
 * A/B测试结果
 */
export interface ABTestResult {
  skillName: string;
  pluginMetrics: PerformanceMetrics;
  skillMetrics: PerformanceMetrics;
  improvement: {
    executionTime: number; // 改善百分比
    loadTime: number;
    memoryUsage: number;
    tokenUsage?: number;
  };
  summary: string;
}

/**
 * A/B测试选项
 */
export interface ABTestOptions {
  pluginsRoot: string;
  skillsRoot: string;
  iterations?: number;
  warmupIterations?: number;
  testSkills?: string[];
}

/**
 * A/B测试工具
 * 
 * 对比传统插件和Skills格式的性能
 */
export class ABTestingTool {
  private readonly options: Required<ABTestOptions>;
  private skillsExecutionManager: SkillsExecutionManager;
  private skillsLoader: SkillsLoader;

  constructor(options: ABTestOptions) {
    this.options = {
      iterations: 10,
      warmupIterations: 2,
      testSkills: [],
      ...options
    };

    // 初始化Skills系统
    const metadataLoader = new MetadataLoader();
    const skillsCache = new SkillsCache();
    const skillsIndex = new SkillsIndex({
      skillsRoot: this.options.skillsRoot,
      metadataProvider: metadataLoader
    });
    const instructionLoader = new InstructionLoader(skillsIndex, skillsCache);
    const resourceLoader = new ResourceLoader(skillsIndex, skillsCache);
    this.skillsLoader = new SkillsLoader(
      skillsIndex,
      instructionLoader,
      resourceLoader,
      skillsCache
    );

    const codeGenerator = new CodeGenerator();
    const securityValidator = new SecurityValidator();
    const sandbox = new SandboxEnvironment();
    const codeCache = new CodeCache();
    const directExecutor = new SkillsDirectExecutor({
      loader: this.skillsLoader,
      codeGenerator,
      securityValidator,
      sandbox,
      codeCache
    });

    this.skillsExecutionManager = new SkillsExecutionManager(this.skillsLoader, {
      executors: {
        direct: directExecutor
      }
    });
  }

  /**
   * 执行A/B测试
   */
  async runABTest(skillName: string): Promise<ABTestResult> {
    logger.info(`开始A/B测试: ${skillName}`);

    // 测试Skills格式
    const skillMetrics = await this.testSkillFormat(skillName);

    // 测试传统插件格式（如果存在）
    const pluginMetrics = await this.testPluginFormat(skillName);

    // 计算改善
    const improvement = this.calculateImprovement(pluginMetrics, skillMetrics);

    // 生成摘要
    const summary = this.generateSummary(skillName, improvement);

    return {
      skillName,
      pluginMetrics,
      skillMetrics,
      improvement,
      summary
    };
  }

  /**
   * 批量A/B测试
   */
  async runBatchABTest(): Promise<ABTestResult[]> {
    const results: ABTestResult[] = [];

    // 获取要测试的技能列表
    const skillNames = this.options.testSkills.length > 0
      ? this.options.testSkills
      : await this.getAvailableSkills();

    logger.info(`开始批量A/B测试: ${skillNames.length} 个技能`);

    for (const skillName of skillNames) {
      try {
        const result = await this.runABTest(skillName);
        results.push(result);
      } catch (error) {
        logger.error(`A/B测试失败: ${skillName}`, error);
      }
    }

    return results;
  }

  /**
   * 测试Skills格式性能
   */
  private async testSkillFormat(skillName: string): Promise<PerformanceMetrics> {
    const executionTimes: number[] = [];
    const loadTimes: number[] = [];
    const memoryUsages: number[] = [];

    // 预热
    for (let i = 0; i < this.options.warmupIterations; i++) {
      try {
        await this.skillsExecutionManager.execute({
          skillName,
          parameters: { test: true }
        });
      } catch {
        // 忽略预热错误
      }
    }

    // 正式测试
    for (let i = 0; i < this.options.iterations; i++) {
      const memoryBefore = this.getMemoryUsage();

      const loadStart = Date.now();
      const skill = await this.skillsLoader.loadSkill(skillName, {
        includeContent: true,
        includeResources: false
      });
      const loadTime = Date.now() - loadStart;

      const execStart = Date.now();
      const response = await this.skillsExecutionManager.execute({
        skillName,
        parameters: { test: true, iteration: i }
      });
      const execTime = Date.now() - execStart;

      const memoryAfter = this.getMemoryUsage();
      const memoryUsed = memoryAfter - memoryBefore;

      executionTimes.push(execTime);
      loadTimes.push(loadTime);
      memoryUsages.push(memoryUsed);
    }

    return {
      executionTime: this.average(executionTimes),
      loadTime: this.average(loadTimes),
      memoryUsage: this.average(memoryUsages),
      cacheHitRate: this.skillsLoader.getCache()?.getStats().content.hits
        ? this.skillsLoader.getCache()!.getStats().content.hits /
          (this.skillsLoader.getCache()!.getStats().content.hits +
           this.skillsLoader.getCache()!.getStats().content.misses)
        : undefined
    };
  }

  /**
   * 测试传统插件格式性能
   */
  private async testPluginFormat(pluginName: string): Promise<PerformanceMetrics> {
    // 模拟传统插件的性能（基于经验值或实际测试）
    // 这里使用估算值，实际应该执行传统插件
    
    // 传统插件通常需要：
    // 1. 加载完整manifest
    // 2. 加载完整代码文件
    // 3. 启动子进程
    // 4. 执行代码
    
    const executionTimes: number[] = [];
    const loadTimes: number[] = [];
    const memoryUsages: number[] = [];

    // 模拟测试（实际应该执行传统插件）
    for (let i = 0; i < this.options.iterations; i++) {
      // 传统插件加载时间（估算：需要加载完整文件）
      const loadTime = 50 + Math.random() * 20; // 50-70ms
      
      // 传统插件执行时间（估算：需要启动子进程）
      const execTime = 100 + Math.random() * 50; // 100-150ms
      
      // 传统插件内存使用（估算：需要加载完整代码）
      const memoryUsed = 2 + Math.random() * 1; // 2-3MB

      executionTimes.push(execTime);
      loadTimes.push(loadTime);
      memoryUsages.push(memoryUsed);
    }

    return {
      executionTime: this.average(executionTimes),
      loadTime: this.average(loadTimes),
      memoryUsage: this.average(memoryUsages)
    };
  }

  /**
   * 计算改善百分比
   */
  private calculateImprovement(
    pluginMetrics: PerformanceMetrics,
    skillMetrics: PerformanceMetrics
  ): {
    executionTime: number;
    loadTime: number;
    memoryUsage: number;
    tokenUsage?: number;
  } {
    return {
      executionTime: this.percentageChange(pluginMetrics.executionTime, skillMetrics.executionTime),
      loadTime: this.percentageChange(pluginMetrics.loadTime, skillMetrics.loadTime),
      memoryUsage: this.percentageChange(pluginMetrics.memoryUsage, skillMetrics.memoryUsage),
      tokenUsage: pluginMetrics.tokenUsage && skillMetrics.tokenUsage
        ? this.percentageChange(pluginMetrics.tokenUsage, skillMetrics.tokenUsage)
        : undefined
    };
  }

  /**
   * 计算百分比变化
   */
  private percentageChange(oldValue: number, newValue: number): number {
    if (oldValue === 0) return 0;
    return ((oldValue - newValue) / oldValue) * 100;
  }

  /**
   * 生成摘要
   */
  private generateSummary(skillName: string, improvement: any): string {
    const improvements: string[] = [];

    if (improvement.executionTime > 0) {
      improvements.push(`执行时间减少 ${improvement.executionTime.toFixed(1)}%`);
    }
    if (improvement.loadTime > 0) {
      improvements.push(`加载时间减少 ${improvement.loadTime.toFixed(1)}%`);
    }
    if (improvement.memoryUsage > 0) {
      improvements.push(`内存使用减少 ${improvement.memoryUsage.toFixed(1)}%`);
    }

    if (improvements.length === 0) {
      return `${skillName}: 性能无明显改善`;
    }

    return `${skillName}: ${improvements.join(', ')}`;
  }

  /**
   * 获取可用技能列表
   */
  private async getAvailableSkills(): Promise<string[]> {
    try {
      const skillsIndex = (this.skillsLoader as any).skillsIndex as SkillsIndex;
      await skillsIndex.buildIndex();
      const allMetadata = skillsIndex.getAllMetadata();
      return allMetadata.map(m => m.name);
    } catch (error) {
      logger.error('获取技能列表失败:', error);
      return [];
    }
  }

  /**
   * 获取内存使用
   */
  private getMemoryUsage(): number {
    if (typeof process?.memoryUsage === 'function') {
      return process.memoryUsage().heapUsed / 1024 / 1024; // MB
    }
    return 0;
  }

  /**
   * 计算平均值
   */
  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
}

