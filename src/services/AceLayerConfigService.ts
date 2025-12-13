/**
 * AceLayerConfigService - ACE架构层级模型配置管理服务
 *
 * 扩展LLMConfigService，支持ACE架构的L1-L6层级模型配置。
 * 每个层级配置不同的模型，以实现最优的性能和成本平衡。
 *
 * 层级说明：
 * - L1: 渴望层（道德约束）- 伦理判断和道德约束
 * - L2: 全球战略层 - 长期规划和世界模型维护
 * - L3: 代理模型层 - 自我认知和能力边界管理
 * - L4: 执行功能层 - 任务拆解和流程控制
 * - L5: 认知控制层 - 快速推理和Scratchpad管理
 * - L6: 任务执行层 - 工具执行和直接操作
 */

import { LLMConfigService } from './LLMConfigService';
import { LLMModelFull } from '../types/llm-models';
import { logger } from '../utils/logger';

/**
 * ACE层级类型
 */
export type AceLayerType = 'l1' | 'l2' | 'l3' | 'l4' | 'l5' | 'l6';

/**
 * ACE层级配置信息
 */
export interface AceLayerConfig {
  layer: AceLayerType;
  description: string;
  recommendedModels: string[];
}

/**
 * 所有层级模型配置
 */
export interface AllLayerModels {
  l1: LLMModelFull | null;
  l2: LLMModelFull | null;
  l3: LLMModelFull | null;
  l4: LLMModelFull | null;
  l5: LLMModelFull | null;
  l6: LLMModelFull | null;
}

/**
 * ACE层级配置服务
 */
export class AceLayerConfigService {
  // ACE层级定义
  private static readonly ACE_LAYERS: Record<AceLayerType, AceLayerConfig> = {
    l1: {
      layer: 'l1',
      description: '渴望层（道德约束）',
      recommendedModels: ['gpt-4', 'claude-3-5-sonnet', 'claude-3-opus']
    },
    l2: {
      layer: 'l2',
      description: '全球战略层',
      recommendedModels: ['gpt-4-turbo', 'claude-3-opus']
    },
    l3: {
      layer: 'l3',
      description: '代理模型层',
      recommendedModels: ['gpt-4', 'claude-3-haiku']
    },
    l4: {
      layer: 'l4',
      description: '执行功能层',
      recommendedModels: ['gpt-4-turbo', 'claude-3-sonnet']
    },
    l5: {
      layer: 'l5',
      description: '认知控制层',
      recommendedModels: ['llama-3-8b-instruct', 'gpt-3.5-turbo', 'claude-3-haiku']
    },
    l6: {
      layer: 'l6',
      description: '任务执行层',
      recommendedModels: [] // 通常不使用LLM
    }
  };

  private llmConfigService: LLMConfigService;

  constructor() {
    this.llmConfigService = LLMConfigService.getInstance();
  }

  // ==================== 层级模型获取接口 ====================

  /**
   * 获取L1层模型（渴望层 - 道德约束）
   * 特点：强大的推理能力，用于伦理判断
   */
  public getL1LayerModel(): LLMModelFull | null {
    return this.getModelByLayer('l1');
  }

  /**
   * 获取L2层模型（全球战略层）
   * 特点：长期规划能力，世界模型维护
   */
  public getL2LayerModel(): LLMModelFull | null {
    return this.getModelByLayer('l2');
  }

  /**
   * 获取L3层模型（代理模型层）
   * 特点：自我认知，能力边界管理
   */
  public getL3LayerModel(): LLMModelFull | null {
    return this.getModelByLayer('l3');
  }

  /**
   * 获取L4层模型（执行功能层）
   * 特点：任务拆解，流程控制
   */
  public getL4LayerModel(): LLMModelFull | null {
    return this.getModelByLayer('l4');
  }

  /**
   * 获取L5层模型（认知控制层）
   * 特点：快速推理，Scratchpad管理
   */
  public getL5LayerModel(): LLMModelFull | null {
    return this.getModelByLayer('l5');
  }

  /**
   * 获取L6层模型（任务执行层）
   * 特点：工具执行，直接操作
   */
  public getL6LayerModel(): LLMModelFull | null {
    return this.getModelByLayer('l6');
  }

  // ==================== 层级模型设置接口 ====================

  /**
   * 设置模型为指定层级
   * @param modelId 模型ID
   * @param layer 层级类型（l1-l6）
   */
  public setModelAsLayer(modelId: number, layer: AceLayerType): void {
    // 验证模型是否存在
    const model = this.llmConfigService.getModel(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    // 验证层级类型
    if (!this.isValidLayer(layer)) {
      throw new Error(`Invalid layer type: ${layer}`);
    }

    const now = Date.now();

    // 使用事务确保原子性
    const transaction = (this.llmConfigService as any).db.transaction(() => {
      // 1. 清除该层级现有配置
      (this.llmConfigService as any).db.prepare(`
        UPDATE llm_models
        SET is_ace_layer_${layer} = 0, updated_at = ?
        WHERE is_ace_layer_${layer} = 1
      `).run(now);

      // 2. 设置新模型
      (this.llmConfigService as any).db.prepare(`
        UPDATE llm_models
        SET is_ace_layer_${layer} = 1, updated_at = ?
        WHERE id = ?
      `).run(now, modelId);
    });

    transaction();

    logger.info(`✅ Set model ${model.modelName} (${model.modelKey}) as ACE layer ${layer.toUpperCase()}`);
  }

  /**
   * 从指定层级移除模型
   * @param layer 层级类型
   */
  public removeModelFromLayer(layer: AceLayerType): void {
    const now = Date.now();

    (this.llmConfigService as any).db.prepare(`
      UPDATE llm_models
      SET is_ace_layer_${layer} = 0, updated_at = ?
      WHERE is_ace_layer_${layer} = 1
    `).run(now);

    logger.info(`✅ Removed model from ACE layer ${layer.toUpperCase()}`);
  }

  /**
   * 获取所有层级模型配置
   */
  public getAllLayerModels(): AllLayerModels {
    return {
      l1: this.getL1LayerModel(),
      l2: this.getL2LayerModel(),
      l3: this.getL3LayerModel(),
      l4: this.getL4LayerModel(),
      l5: this.getL5LayerModel(),
      l6: this.getL6LayerModel()
    };
  }

  /**
   * 获取层级配置信息
   * @param layer 层级类型
   */
  public getLayerConfig(layer: AceLayerType): AceLayerConfig {
    return AceLayerConfigService.ACE_LAYERS[layer];
  }

  /**
   * 获取所有层级配置
   */
  public getAllLayerConfigs(): Record<AceLayerType, AceLayerConfig> {
    return { ...AceLayerConfigService.ACE_LAYERS };
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 根据层级获取模型
   * @param layer 层级类型
   */
  private getModelByLayer(layer: AceLayerType): LLMModelFull | null {
    const row = (this.llmConfigService as any).db.prepare(`
      SELECT
        m.id, m.provider_id, m.model_key, m.model_name, m.model_type,
        m.model_config, m.api_endpoint_suffix, m.enabled, m.is_default, m.is_ace_evolution,
        m.display_order, m.created_at, m.updated_at,
        m.is_ace_layer_l1, m.is_ace_layer_l2, m.is_ace_layer_l3,
        m.is_ace_layer_l4, m.is_ace_layer_l5, m.is_ace_layer_l6,
        p.provider, p.name as provider_name, p.base_config, p.enabled as provider_enabled
      FROM llm_models m
      JOIN llm_providers p ON m.provider_id = p.id
      WHERE m.is_ace_layer_${layer} = 1
        AND m.enabled = 1
        AND p.enabled = 1
      LIMIT 1
    `).get() as any;

    return row ? this.mapModelFullRow(row) : null;
  }

  /**
   * 映射完整模型行数据（包含ACE层级字段）
   */
  private mapModelFullRow(row: any): LLMModelFull {
    return {
      id: row.id,
      providerId: row.provider_id,
      modelKey: row.model_key,
      modelName: row.model_name,
      modelType: row.model_type,
      modelConfig: JSON.parse(row.model_config),
      apiEndpointSuffix: row.api_endpoint_suffix,
      enabled: row.enabled === 1,
      isDefault: row.is_default === 1,
      isAceEvolution: row.is_ace_evolution === 1,
      displayOrder: row.display_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      provider: row.provider,
      providerName: row.provider_name,
      providerBaseConfig: JSON.parse(row.base_config),
      providerEnabled: row.provider_enabled === 1,
      // ACE层级标记字段
      isAceLayerL1: row.is_ace_layer_l1 === 1,
      isAceLayerL2: row.is_ace_layer_l2 === 1,
      isAceLayerL3: row.is_ace_layer_l3 === 1,
      isAceLayerL4: row.is_ace_layer_l4 === 1,
      isAceLayerL5: row.is_ace_layer_l5 === 1,
      isAceLayerL6: row.is_ace_layer_l6 === 1
    };
  }

  /**
   * 验证层级类型是否有效
   * @param layer 层级类型
   */
  private isValidLayer(layer: string): layer is AceLayerType {
    return ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'].includes(layer);
  }

  // ==================== 验证和统计方法 ====================

  /**
   * 检查指定层级是否已配置模型
   * @param layer 层级类型
   */
  public hasLayerModel(layer: AceLayerType): boolean {
    const row = (this.llmConfigService as any).db.prepare(`
      SELECT COUNT(*) as count
      FROM llm_models
      WHERE is_ace_layer_${layer} = 1
    `).get() as any;

    return row.count > 0;
  }

  /**
   * 获取层级模型统计信息
   */
  public getLayerModelStats(): Record<AceLayerType, boolean> {
    const stats = {} as Record<AceLayerType, boolean>;

    for (const layer of Object.keys(AceLayerConfigService.ACE_LAYERS) as AceLayerType[]) {
      stats[layer] = this.hasLayerModel(layer);
    }

    return stats;
  }

  /**
   * 验证所有层级模型配置
   * 返回验证结果和缺失的层级
   */
  public validateAllLayers(): {
    isValid: boolean;
    missingLayers: AceLayerType[];
    configuredLayers: AceLayerType[];
  } {
    const configuredLayers: AceLayerType[] = [];
    const missingLayers: AceLayerType[] = [];

    for (const layer of Object.keys(AceLayerConfigService.ACE_LAYERS) as AceLayerType[]) {
      if (this.hasLayerModel(layer)) {
        configuredLayers.push(layer);
      } else {
        missingLayers.push(layer);
      }
    }

    return {
      isValid: missingLayers.length === 0,
      missingLayers,
      configuredLayers
    };
  }

  /**
   * 重置所有层级模型配置
   * 警告：此操作将清除所有ACE层级配置
   */
  public resetAllLayers(): void {
    const now = Date.now();

    const transaction = (this.llmConfigService as any).db.transaction(() => {
      for (let i = 1; i <= 6; i++) {
        (this.llmConfigService as any).db.prepare(`
          UPDATE llm_models
          SET is_ace_layer_l${i} = 0, updated_at = ?
          WHERE is_ace_layer_l${i} = 1
        `).run(now);
      }
    });

    transaction();

    logger.warn('⚠️ Reset all ACE layer model configurations');
  }

  /**
   * 获取层级推荐模型
   * @param layer 层级类型
   * @returns 推荐模型列表
   */
  public getRecommendedModels(layer: AceLayerType): string[] {
    return AceLayerConfigService.ACE_LAYERS[layer].recommendedModels;
  }

  // ==================== 委托方法 ====================

  /**
   * 列出模型（委托给LLMConfigService）
   */
  public listModels(params: any = {}): LLMModelFull[] {
    return this.llmConfigService.listModels(params);
  }

  /**
   * 获取模型（委托给LLMConfigService）
   */
  public getModel(id: number): LLMModelFull | null {
    return this.llmConfigService.getModel(id);
  }
}
