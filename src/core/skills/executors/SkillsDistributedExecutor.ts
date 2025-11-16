import {
  ExecutionRequest,
  SkillExecutionOutcome,
  SkillMetadata,
  ValidationResult
} from '../../../types';
import { SkillsLoader } from '../SkillsLoader';
import { BaseSkillsExecutor, BaseSkillsExecutorOptions } from './BaseSkillsExecutor';

interface DistributedSkillConfig {
  serverId: string;
  toolName?: string;
}

export type DistributedExecutorFn = (
  serverId: string,
  toolName: string,
  args: Record<string, unknown>
) => Promise<unknown>;

export interface SkillsDistributedExecutorOptions extends Omit<BaseSkillsExecutorOptions, 'executionType'> {
  loader: SkillsLoader;
  executor: DistributedExecutorFn;
}

export class SkillsDistributedExecutor extends BaseSkillsExecutor {
  private readonly loader: SkillsLoader;
  private readonly executor: DistributedExecutorFn;

  constructor(options: SkillsDistributedExecutorOptions) {
    super({ ...options, executionType: 'distributed' });
    this.loader = options.loader;
    this.executor = options.executor;
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
    const config = metadata ? this.getDistributedConfig(metadata) : undefined;

    if (metadata && metadata.type !== 'distributed') {
      warnings.push(`技能类型为 ${metadata.type}，建议使用 distributed 执行器`);
    }

    if (!config?.serverId) {
      errors.push('Distributed 技能缺少 serverId 配置');
    }

    if (request.parameters !== undefined && typeof request.parameters !== 'object') {
      errors.push('Distributed 技能参数必须是对象');
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

    const config = this.getDistributedConfig(metadata);
    if (!config?.serverId) {
      throw new Error(`技能 ${metadata.name} 缺少分布式执行配置`);
    }

    const toolName = config.toolName ?? metadata.name;
    const result = await this.executor(config.serverId, toolName, request.parameters ?? {});

    return {
      output: result,
      tokenUsage: 0
    };
  }

  private getDistributedConfig(metadata: SkillMetadata): DistributedSkillConfig | undefined {
    if (!metadata.config || typeof metadata.config !== 'object') {
      return undefined;
    }
    const config = metadata.config as Record<string, unknown>;
    const serverId = typeof config.serverId === 'string' ? config.serverId : undefined;
    const toolName = typeof config.toolName === 'string' ? config.toolName : undefined;

    if (!serverId) {
      return undefined;
    }

    return { serverId, toolName };
  }
}
