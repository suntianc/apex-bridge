import { SkillsIndex } from './SkillsIndex';
import { SkillMetadata, ExecutionRequest, ExecutionResponse, ToolRequest } from '../../types';
import logger from '../../utils/logger';

export interface SkillsToToolMapperOptions {
  caseSensitive?: boolean;
}

export class SkillsToToolMapper {
  private readonly index: SkillsIndex;
  private readonly caseSensitive: boolean;

  constructor(index: SkillsIndex, options: SkillsToToolMapperOptions = {}) {
    this.index = index;
    this.caseSensitive = options.caseSensitive ?? false;
  }

  /**
   * 将工具名称映射到技能（优先匹配 ABP 工具定义，其次匹配技能名）
   */
  async mapToolToSkill(toolName: string): Promise<SkillMetadata | null> {
    if (!toolName || !toolName.trim()) {
      return null;
    }
    const all = this.index.getAllMetadata();
    const target = this.normalize(toolName);

    // 1) 优先匹配 ABP 工具定义
    for (const meta of all) {
      const tools = meta.abp?.tools ?? [];
      for (const tool of tools) {
        if (this.normalize(tool.name) === target) {
          return meta;
        }
      }
    }

    // 2) 次级匹配：技能名
    for (const meta of all) {
      if (this.normalize(meta.name) === target || this.normalize(meta.displayName || '') === target) {
        return meta;
      }
    }

    return null;
  }

  /**
   * 将工具调用转换为 Skills 执行请求
   */
  async convertToolCallToExecutionRequest(tool: ToolRequest): Promise<ExecutionRequest> {
    const params = (tool.args && typeof tool.args === 'object') ? tool.args : {};
    return {
      skillName: tool.name,
      parameters: params
    };
  }

  /**
   * 将工具调用转换为执行请求，并用偏好作为参数默认值进行补全
   * 偏好键优先级低于显式传入的参数与元数据中的默认值。
   */
  async convertToolCallToExecutionRequestWithDefaults(
    tool: ToolRequest,
    preferences?: Record<string, unknown>
  ): Promise<ExecutionRequest> {
    const base = await this.convertToolCallToExecutionRequest(tool);
    if (!preferences || Object.keys(preferences).length === 0) {
      return base;
    }

    try {
      const meta = await this.mapToolToSkill(tool.name);
      if (!meta) {
        // 无匹配元数据时，仅用偏好补足缺失参数
        const filled = { ...base.parameters };
        for (const [k, v] of Object.entries(preferences)) {
          if (filled[k] === undefined) filled[k] = v as any;
        }
        return { ...base, parameters: filled };
      }

      // 找到具体的 ABP 工具定义
      const toolDef = (meta.abp?.tools ?? []).find(t => this.normalize(t.name) === this.normalize(tool.name)) 
        || (meta.abp?.tools ?? [])[0];

      const filled = { ...base.parameters };
      if (toolDef?.parameters) {
        for (const [paramName, paramSchema] of Object.entries(toolDef.parameters)) {
          // 如果调用未提供，且 schema 没有默认值，则尝试用偏好补全
          const hasArg = filled[paramName] !== undefined;
          const hasSchemaDefault = (paramSchema as any)?.default !== undefined;
          if (!hasArg && !hasSchemaDefault && preferences[paramName] !== undefined) {
            filled[paramName] = preferences[paramName] as any;
          }
        }
      } else {
        // 无 schema 时，宽松补全
        for (const [k, v] of Object.entries(preferences)) {
          if (filled[k] === undefined) filled[k] = v as any;
        }
      }

      return { ...base, parameters: filled };
    } catch (e) {
      logger.debug(`[SkillsToToolMapper] convert with defaults fallback: ${(e as Error).message}`);
      const filled = { ...base.parameters };
      for (const [k, v] of Object.entries(preferences)) {
        if (filled[k] === undefined) filled[k] = v as any;
      }
      return { ...base, parameters: filled };
    }
  }

  /**
   * 将 Skills 执行响应转换成工具调用返回结果
   */
  async convertExecutionResponseToToolResult(response: ExecutionResponse): Promise<any> {
    if (!response.success) {
      const err = response.error ?? { code: 'EXECUTION_FAILED', message: '技能执行失败' };
      return {
        success: false,
        error: err,
        metadata: response.metadata
      };
    }
    return response.result?.data ?? null;
  }

  private normalize(input: string): string {
    return this.caseSensitive ? input : input.toLowerCase();
  }
}


