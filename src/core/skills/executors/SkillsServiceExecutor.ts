import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import {
  ExecutionRequest,
  SkillExecutionOutcome,
  SkillMetadata,
  ValidationResult
} from '../../../types';
import { SkillsLoader } from '../SkillsLoader';
import { BaseSkillsExecutor, BaseSkillsExecutorOptions } from './BaseSkillsExecutor';

interface ServiceSkillConfig {
  endpoint: string;
  method?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  cacheable?: boolean;
}

export interface SkillsServiceExecutorOptions extends Omit<BaseSkillsExecutorOptions, 'executionType'> {
  loader: SkillsLoader;
  httpClient?: AxiosInstance;
}

export class SkillsServiceExecutor extends BaseSkillsExecutor {
  private readonly loader: SkillsLoader;
  private readonly httpClient: AxiosInstance;

  constructor(options: SkillsServiceExecutorOptions) {
    super({ ...options, executionType: 'service' });
    this.loader = options.loader;
    this.httpClient = options.httpClient ?? axios.create();
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
    const config = metadata ? this.getServiceConfig(metadata) : undefined;

    if (metadata && metadata.type !== 'service') {
      warnings.push(`技能类型为 ${metadata.type}，建议使用 service 执行器`);
    }

    if (!config?.endpoint) {
      errors.push('Service 技能缺少 endpoint 配置');
    }

    if (request.parameters !== undefined && typeof request.parameters !== 'object') {
      errors.push('Service 技能参数必须是对象');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata
    };
  }

  protected override shouldUseCache(
    request: ExecutionRequest,
    metadata?: SkillMetadata
  ): boolean {
    const config = metadata ? this.getServiceConfig(metadata) : undefined;
    return super.shouldUseCache(request, metadata) && (config?.cacheable ?? metadata?.cacheable ?? false);
  }

  protected override async executeSkill(
    request: ExecutionRequest,
    metadata?: SkillMetadata
  ): Promise<SkillExecutionOutcome> {
    if (!metadata) {
      throw new Error(`技能 ${request.skillName} 缺少元数据`);
    }

    const config = this.getServiceConfig(metadata);
    if (!config?.endpoint) {
      throw new Error(`技能 ${metadata.name} 缺少服务端点配置`);
    }

    const method = (config.method ?? 'POST').toUpperCase();
    const axiosConfig: AxiosRequestConfig = {
      url: config.endpoint,
      method,
      headers: config.headers,
      timeout: request.timeout ?? config.timeoutMs
    };

    const params = request.parameters ?? {};

    if (method === 'GET' || method === 'DELETE') {
      axiosConfig.params = params;
    } else {
      axiosConfig.data = params;
    }

    const response = await this.httpClient.request(axiosConfig);

    return {
      output: response.data,
      tokenUsage: 0
    };
  }

  private getServiceConfig(metadata: SkillMetadata): ServiceSkillConfig | undefined {
    if (!metadata.config || typeof metadata.config !== 'object') {
      return undefined;
    }
    const config = metadata.config as Record<string, unknown>;
    const endpoint = typeof config.endpoint === 'string' ? config.endpoint : undefined;
    const method = typeof config.method === 'string' ? config.method : undefined;
    const headers =
      config.headers && typeof config.headers === 'object'
        ? (config.headers as Record<string, string>)
        : undefined;
    const timeoutMs = typeof config.timeoutMs === 'number' ? config.timeoutMs : undefined;
    const cacheable = typeof config.cacheable === 'boolean' ? config.cacheable : undefined;

    if (!endpoint) {
      return undefined;
    }

    return { endpoint, method, headers, timeoutMs, cacheable };
  }
}
