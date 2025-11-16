import { promises as fs } from 'fs';
import * as pathModule from 'path';
import {
  ExecutionRequest,
  SkillExecutionOutcome,
  SkillMetadata,
  ValidationResult
} from '../../../types';
import { SkillsLoader } from '../SkillsLoader';
import { BaseSkillsExecutor, BaseSkillsExecutorOptions } from './BaseSkillsExecutor';

interface StaticSkillConfig {
  dataPath: string;
  format?: 'json' | 'text';
  cacheable?: boolean;
}

export interface SkillsStaticExecutorOptions extends Omit<BaseSkillsExecutorOptions, 'executionType'> {
  loader: SkillsLoader;
  baseDir?: string;
}

export class SkillsStaticExecutor extends BaseSkillsExecutor {
  private readonly loader: SkillsLoader;
  private readonly baseDir: string;

  constructor(options: SkillsStaticExecutorOptions) {
    super({ ...options, executionType: 'static' });
    this.loader = options.loader;
    this.baseDir = options.baseDir ?? process.cwd();
  }

  protected override async validateRequest(request: ExecutionRequest): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!request.skillName) {
      errors.push('技能名称不能为空');
    }

    const skill = request.skillName
      ? await this.loader.loadSkill(request.skillName)
      : undefined;

    if (!skill) {
      errors.push(`未找到技能: ${request.skillName}`);
    }

    const metadata = skill?.metadata;
    const config = metadata ? this.getStaticConfig(metadata) : undefined;

    if (metadata && metadata.type !== 'static') {
      warnings.push(`技能类型为 ${metadata.type}，建议使用 static 执行器`);
    }

    if (!config?.dataPath) {
      errors.push('Static 技能缺少 dataPath 配置');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata
    };
  }

  protected override async executeSkill(
    request: ExecutionRequest,
    metadata?: SkillMetadata
  ): Promise<SkillExecutionOutcome> {
    if (!metadata) {
      throw new Error(`技能 ${request.skillName} 缺少元数据`);
    }

    const config = this.getStaticConfig(metadata);
    if (!config?.dataPath) {
      throw new Error(`技能 ${metadata.name} 缺少静态数据配置`);
    }

    const resolvedPath = this.resolveDataPath(metadata, config.dataPath);
    const rawContent = await fs.readFile(resolvedPath, 'utf-8');

    let output: unknown = rawContent;
    if ((config.format ?? 'json') === 'json') {
      try {
        output = JSON.parse(rawContent);
      } catch (error) {
        throw new Error(`静态数据解析失败: ${(error as Error).message}`);
      }
    }

    return {
      output,
      tokenUsage: 0,
      securityReport: {
        passed: true,
        riskLevel: 'safe',
        issues: [],
        recommendations: ['静态数据加载完成'],
        durationMs: 0
      }
    };
  }

  protected override shouldUseCache(
    request: ExecutionRequest,
    metadata?: SkillMetadata
  ): boolean {
    const config = metadata ? this.getStaticConfig(metadata) : undefined;
    return super.shouldUseCache(request, metadata) && (config?.cacheable ?? true);
  }

  private resolveDataPath(metadata: SkillMetadata, dataPath: string): string {
    if (pathModule.isAbsolute(dataPath)) {
      return dataPath;
    }
    const base = pathModule.dirname(metadata.path ?? this.baseDir);
    return pathModule.resolve(base, dataPath);
  }

  private getStaticConfig(metadata: SkillMetadata): StaticSkillConfig | undefined {
    if (!metadata.config || typeof metadata.config !== 'object') {
      return undefined;
    }
    const config = metadata.config as Record<string, unknown>;
    const dataPath = typeof config.dataPath === 'string' ? config.dataPath : undefined;
    const format =
      typeof config.format === 'string' && (config.format === 'json' || config.format === 'text')
        ? config.format
        : undefined;
    const cacheable = typeof config.cacheable === 'boolean' ? config.cacheable : undefined;

    if (!dataPath) {
      return undefined;
    }

    return { dataPath, format, cacheable };
  }
}
