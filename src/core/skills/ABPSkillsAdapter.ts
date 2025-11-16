/**
 * ABP Skills Adapter
 * 
 * ABP协议Skills适配器，用于处理ABP格式的Skills
 * 
 * @module core/skills
 */

import { SkillMetadata } from '../../types/skills';
import { ABPToolDefinition } from '../../types/abp';
import { logger } from '../../utils/logger';

/**
 * ABP Skills适配器
 * 
 * 提供ABP格式Skills的处理能力：
 * - 格式检测（ABP only，不再支持VCP）
 * - ABP工具定义生成
 * 
 * 注意：VCP协议支持已移除，不再提供VCP到ABP的转换功能
 */
export class ABPSkillsAdapter {
  constructor() {
    // VCP协议支持已移除，不再需要转换器
  }

  /**
   * 检测协议类型
   * 
   * @param metadata - Skill元数据
   * @returns 协议类型（仅返回'abp'，VCP协议已移除）
   */
  detectProtocol(metadata: SkillMetadata): 'abp' {
    // VCP协议支持已移除，所有Skills都被视为ABP格式
    // 如果metadata中明确指定了protocol字段
    if (metadata.protocol === 'vcp') {
      logger.warn(`[ABPSkillsAdapter] Skill ${metadata.name} specified VCP protocol, which is no longer supported. Treating as ABP.`);
    }

    // 如果存在abp配置，返回ABP
    if (metadata.abp || metadata.protocol === 'abp') {
      return 'abp';
    }

    // 默认使用ABP协议（不再支持VCP）
    return 'abp';
  }

  /**
   * 转换为ABP格式
   * 
   * 确保Skill元数据包含ABP格式定义
   * 
   * @param metadata - Skill元数据
   * @returns ABP格式的Skill元数据
   */
  convertToABP(metadata: SkillMetadata): SkillMetadata {
    // 如果已经是ABP格式，直接返回
    if (this.detectProtocol(metadata) === 'abp' && metadata.abp) {
      return metadata;
    }

    // 如果没有ABP配置，生成默认ABP配置
    const abpMetadata: SkillMetadata = {
      ...metadata,
      protocol: 'abp',
      abp: {
        kind: this.inferToolKind(metadata),
        tools: this.generateABPTools(metadata)
      }
    };

    logger.debug(`[ABPSkillsAdapter] Added ABP format to skill ${metadata.name}`);
    return abpMetadata;
  }

  /**
   * 获取ABP工具定义
   * 
   * 从Skill元数据中提取或生成ABP工具定义
   * 
   * @param metadata - Skill元数据
   * @returns ABP工具定义列表
   */
  getABPToolDefinitions(metadata: SkillMetadata): ABPToolDefinition[] {
    // 如果metadata中已经有ABP工具定义，直接返回
    if (metadata.abp?.tools && metadata.abp.tools.length > 0) {
      return metadata.abp.tools.map((tool) => {
        // 转换参数类型
        const parameters: Record<string, any> = {};
        if (tool.parameters) {
          for (const [key, param] of Object.entries(tool.parameters)) {
            parameters[key] = {
              type: (param.type as any) || 'any',
              description: param.description,
              required: param.required !== false,
              default: param.default,
              validation: param.validation
            };
          }
        }

        return {
          name: tool.name,
          description: tool.description || metadata.description,
          kind: metadata.abp?.kind || 'action',
          parameters,
          returns: tool.returns ? {
            type: (tool.returns.type as any) || 'any',
            description: tool.returns.description
          } : undefined,
          version: metadata.version,
          author: metadata.displayName
        };
      });
    }

    // 如果没有ABP工具定义，从Skill元数据生成
    return this.generateABPTools(metadata);
  }

  /**
   * 推断工具类型
   * 
   * 从Skill元数据推断ABP工具类型
   * 
   * @param metadata - Skill元数据
   * @returns ABP工具类型
   */
  private inferToolKind(metadata: SkillMetadata): 'action' | 'query' | 'transform' | 'validate' | 'stream' | 'schedule' {
    // 如果metadata中已经指定了kind，使用该值
    if (metadata.abp?.kind) {
      return metadata.abp.kind;
    }

    // 根据Skill类型推断
    switch (metadata.type) {
      case 'direct':
      case 'service': {
        // 检查关键词和描述
        const name = metadata.name.toLowerCase();
        const description = metadata.description.toLowerCase();
        const keywords = metadata.keywords.map(k => k.toLowerCase());

        if (name.includes('query') || description.includes('查询') || description.includes('获取') || keywords.includes('query')) {
          return 'query';
        }
        if (name.includes('transform') || description.includes('转换') || description.includes('格式化') || keywords.includes('transform')) {
          return 'transform';
        }
        if (name.includes('validate') || description.includes('验证') || description.includes('检查') || keywords.includes('validate')) {
          return 'validate';
        }
        if (name.includes('stream') || description.includes('流') || description.includes('实时') || keywords.includes('stream')) {
          return 'stream';
        }
        if (name.includes('schedule') || description.includes('定时') || description.includes('计划') || keywords.includes('schedule')) {
          return 'schedule';
        }
        // 默认为action
        return 'action';
      }

      case 'static':
        return 'query';

      case 'preprocessor':
        return 'transform';

      case 'internal':
        return 'action';

      default:
        return 'action';
    }
  }

  /**
   * 生成ABP工具定义
   * 
   * 从Skill元数据生成ABP工具定义列表
   * 
   * @param metadata - Skill元数据
   * @returns ABP工具定义列表
   */
  private generateABPTools(metadata: SkillMetadata): ABPToolDefinition[] {
    const kind = this.inferToolKind(metadata);

    // 生成一个默认的工具定义（使用Skill名称）
    const toolDefinition: ABPToolDefinition = {
      name: metadata.name,
      description: metadata.description,
      kind: kind,
      parameters: {}, // 参数可以从代码中推断，这里先留空
      returns: {
        type: 'any' as any,
        description: '执行结果'
      },
      version: metadata.version,
      author: metadata.displayName
    };

    return [toolDefinition];
  }

  /**
   * 验证ABP格式
   * 
   * 验证Skill元数据是否符合ABP格式要求
   * 
   * @param metadata - Skill元数据
   * @returns 验证结果
   */
  validateABPFormat(metadata: SkillMetadata): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 如果协议不是ABP，不需要验证
    if (this.detectProtocol(metadata) !== 'abp') {
      return { valid: true, errors: [] };
    }

    // 验证ABP配置
    if (!metadata.abp) {
      errors.push('ABP协议Skill必须包含abp配置');
      return { valid: false, errors };
    }

    // 验证kind（如果指定）
    if (metadata.abp.kind) {
      const validKinds = ['action', 'query', 'transform', 'validate', 'stream', 'schedule'];
      if (!validKinds.includes(metadata.abp.kind)) {
        errors.push(`无效的ABP工具类型: ${metadata.abp.kind}`);
      }
    }

    // 验证tools（如果指定）
    if (metadata.abp.tools) {
      for (const tool of metadata.abp.tools) {
        if (!tool.name) {
          errors.push('ABP工具定义必须包含name字段');
        }
        if (!tool.description && !metadata.description) {
          errors.push(`ABP工具 ${tool.name} 必须包含description字段`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

