/**
 * Tool Description Variable Provider
 * 
 * 提供工具描述变量解析
 
 */

import { IVariableProvider, VariableContext } from '../../../types/variable';
import { logger } from '../../../utils/logger';

/**
 * 工具描述提供者
 * 
 * 支持的变量：
 * - {{ABPAllTools}} - 所有工具描述列表
 * - {{ToolName}} - 单个工具描述（如 {{Calculator}}）
 */
export class ToolDescriptionProvider implements IVariableProvider {
  readonly name = 'ToolDescriptionProvider';

  private skillsGenerator: any | null = null; // SkillsToolDescriptionGenerator，避免循环依赖

  constructor() {}

  /**
   * 设置Skills工具描述生成器
   */
  setSkillsGenerator(generator: any): void {
    this.skillsGenerator = generator;
    logger.info('[ToolDescriptionProvider] Skills generator set');
  }

  async resolve(key: string, context?: VariableContext): Promise<string | null> {
    // 若提供了Skills生成器，则优先使用渐进式披露机制
    if (this.skillsGenerator) {
      // 处理 {{ABPAllTools}}
      if (key === 'ABPAllTools') {
        return this.resolveAllToolsViaSkills(context);
      }
      // 单个工具：按置信度阶段返回
      const confidence =
        (context && typeof (context as any).confidence === 'number'
          ? (context as any).confidence
          : undefined);
      const prefPhase =
        (context as any)?.toolsDisclosure ||
        (context as any)?.preferences?.toolsDisclosure;
      try {
        if (prefPhase === 'full' || prefPhase === 'brief' || prefPhase === 'metadata') {
          return await this.skillsGenerator.getDescriptionByPhase(key, prefPhase);
        }
        return await this.skillsGenerator.getDescriptionByConfidence(key, confidence);
      } catch (error) {
        logger.warn('[ToolDescriptionProvider] Skills generator failed, fallback to plugin runtime if available:', error);
        // 继续尝试插件运行时（若可用）
      }
    }

    logger.warn('[ToolDescriptionProvider] Skills generator not available');
    return null;
  }

  /**
   * 使用Skills生成器解析所有工具描述（按默认元数据阶段拼接）
   */
  private async resolveAllToolsViaSkills(context?: VariableContext): Promise<string> {
    // 由于变量提供者无法直接获取Skills索引列表，这里仅按需暴露接口：
    // 约定：context.skillsList 可传入需要展示的技能名称数组；否则返回提示。
    const skillsList: string[] | undefined = Array.isArray((context as any)?.skillsList)
      ? (context as any).skillsList
      : undefined;
    if (!skillsList || skillsList.length === 0) {
      return '没有可用的工具描述信息';
    }
    const prefPhase =
      (context as any)?.toolsDisclosure ||
      (context as any)?.preferences?.toolsDisclosure;
    const parts: string[] = [];
    for (const name of skillsList) {
      try {
        if (prefPhase === 'full' || prefPhase === 'brief' || prefPhase === 'metadata') {
          parts.push(await this.skillsGenerator.getDescriptionByPhase(name, prefPhase));
        } else {
          const metaDesc = await this.skillsGenerator.getMetadataDescription(name);
          parts.push(metaDesc);
        }
      } catch {
        // 忽略单个失败，继续下一个
      }
    }
    return parts.length > 0 ? parts.join('\n\n---\n\n') : '没有可用的工具描述信息';
  }

  getSupportedKeys(): string[] {
    return ['ABPAllTools'];
  }
}

