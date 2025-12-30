/**
 * 配置验证器
 * 负责验证配置的正确性
 */

import { logger } from './logger';
import type {
  AdminConfig,
  AceConfig,
  AceLayersConfig,
  AceLayerL1Config,
  AceLayerL2Config,
  AceLayerL3Config,
  AceLayerL4Config,
  AceLayerL5Config,
  AceLayerL6Config,
  AceMemoryConfig,
  AceOptimizationConfig,
  AceSkillsConfig,
  AceLocalImplementationConfig
} from '../types/config/index';

/**
 * 配置验证结果
 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误列表 */
  errors: string[];
  /** 警告列表 */
  warnings?: string[];
}

export class ConfigValidator {
  /**
   * 验证完整配置
   */
  public validate(config: AdminConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 基础验证
      this.validateAuth(config.auth, errors, warnings);
      this.validateApi(config.api, errors, warnings);

      // ACE 配置验证
      if (config.ace) {
        this.validateAceConfig(config.ace, errors, warnings);
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    } catch (error) {
      logger.error('配置验证失败:', error);
      return {
        valid: false,
        errors: ['配置验证过程中发生错误']
      };
    }
  }

  /**
   * 验证认证配置
   */
  private validateAuth(
    auth: AdminConfig['auth'],
    errors: string[],
    warnings: string[]
  ): void {
    if (!auth || typeof auth.enabled !== 'boolean') {
      errors.push('auth.enabled 必须是布尔值');
    }

    if (auth?.enabled && !auth?.apiKey) {
      errors.push('启用认证时必须提供 apiKey');
    }
  }

  /**
   * 验证 API 配置
   */
  private validateApi(
    api: AdminConfig['api'],
    errors: string[],
    warnings: string[]
  ): void {
    if (!api || typeof api.port !== 'number') {
      errors.push('api.port 必须是数字');
    }

    if (api?.port && (api.port < 1 || api.port > 65535)) {
      errors.push('api.port 必须在 1-65535 范围内');
    }
  }

  /**
   * 验证 ACE 配置
   */
  private validateAceConfig(
    aceConfig: AceConfig,
    errors: string[],
    warnings: string[]
  ): void {
    if (aceConfig.layers) {
      this.validateAceLayers(aceConfig.layers, errors, warnings);
    }

    if (aceConfig.memory) {
      this.validateAceMemory(aceConfig.memory, errors, warnings);
    }

    if (aceConfig.optimization) {
      this.validateAceOptimization(aceConfig.optimization, errors, warnings);
    }

    if (aceConfig.skills) {
      this.validateAceSkills(aceConfig.skills, errors, warnings);
    }

    if (aceConfig.localImplementation) {
      this.validateAceLocalImplementation(
        aceConfig.localImplementation,
        errors,
        warnings
      );
    }
  }

  /**
   * 验证 ACE 层级配置
   */
  private validateAceLayers(
    layers: AceLayersConfig,
    errors: string[],
    warnings: string[]
  ): void {
    const layerNames = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'] as const;

    for (const layerName of layerNames) {
      const layer = layers[layerName];
      if (layer?.enabled) {
        // 验证 L1 层宪法文件路径
        if (layerName === 'l1') {
          const l1Layer = layer as AceLayerL1Config;
          if (l1Layer.constitutionPath) {
            if (typeof l1Layer.constitutionPath !== 'string') {
              errors.push(`ace.layers.${layerName}.constitutionPath 必须是字符串`);
            } else if (!l1Layer.constitutionPath.startsWith('./')) {
              warnings.push(`ace.layers.${layerName}.constitutionPath 建议使用相对路径`);
            }
          }
        }

        // 验证模型来源
        if (layerName === 'l1' || layerName === 'l2' || layerName === 'l3' || layerName === 'l4' || layerName === 'l5') {
          const typedLayer = layer as AceLayerL1Config | AceLayerL2Config | AceLayerL3Config | AceLayerL4Config | AceLayerL5Config;
          if (typedLayer.modelSource && typedLayer.modelSource !== 'sqlite') {
            errors.push(`ace.layers.${layerName}.modelSource 只支持 sqlite`);
          }
        }

        // L5 层 fallbackToEvolution 验证
        if (layerName === 'l5') {
          const l5Layer = layer as AceLayerL5Config;
          if (typeof l5Layer.fallbackToEvolution !== 'boolean') {
            warnings.push(`ace.layers.${layerName}.fallbackToEvolution 建议设置为布尔值`);
          }
        }

        // L6 层 useLLM 验证
        if (layerName === 'l6') {
          const l6Layer = layer as AceLayerL6Config;
          if (typeof l6Layer.useLLM !== 'boolean') {
            warnings.push(`ace.layers.${layerName}.useLLM 建议设置为布尔值`);
          }
        }
      }
    }
  }

  /**
   * 验证 ACE 内存配置
   */
  private validateAceMemory(
    memory: AceMemoryConfig,
    errors: string[],
    warnings: string[]
  ): void {
    const validProviders = ['lancedb', 'memory', 'custom'];
    if (memory.provider && !validProviders.includes(memory.provider)) {
      errors.push(`ace.memory.provider 必须是: ${validProviders.join(', ')} 中的一个`);
    }

    if (memory.vectorDbPath && typeof memory.vectorDbPath !== 'string') {
      errors.push('ace.memory.vectorDbPath 必须是字符串');
    }

    if (memory.collectionPrefix && typeof memory.collectionPrefix !== 'string') {
      errors.push('ace.memory.collectionPrefix 必须是字符串');
    }
  }

  /**
   * 验证 ACE 优化配置
   */
  private validateAceOptimization(
    optimization: AceOptimizationConfig,
    errors: string[],
    warnings: string[]
  ): void {
    if (typeof optimization.fastTrackSimpleTasks !== 'boolean') {
      warnings.push('ace.optimization.fastTrackSimpleTasks 建议设置为布尔值');
    }

    if (typeof optimization.l5ScratchpadCompression !== 'boolean') {
      warnings.push('ace.optimization.l5ScratchpadCompression 建议设置为布尔值');
    }

    if (typeof optimization.l6NonLLMExecution !== 'boolean') {
      warnings.push('ace.optimization.l6NonLLMExecution 建议设置为布尔值');
    }
  }

  /**
   * 验证 ACE 技能配置
   */
  private validateAceSkills(
    skills: AceSkillsConfig,
    errors: string[],
    warnings: string[]
  ): void {
    if (typeof skills.autoCleanupEnabled !== 'boolean') {
      warnings.push('ace.skills.autoCleanupEnabled 建议设置为布尔值');
    }

    if (skills.cleanupTimeoutMs !== undefined) {
      if (typeof skills.cleanupTimeoutMs !== 'number') {
        errors.push('ace.skills.cleanupTimeoutMs 必须是数字');
      } else if (skills.cleanupTimeoutMs < 0) {
        errors.push('ace.skills.cleanupTimeoutMs 必须大于0');
      }
    }

    if (skills.maxActiveSkills !== undefined) {
      if (typeof skills.maxActiveSkills !== 'number') {
        errors.push('ace.skills.maxActiveSkills 必须是数字');
      } else if (skills.maxActiveSkills < 1) {
        errors.push('ace.skills.maxActiveSkills 必须大于0');
      }
    }
  }

  /**
   * 验证 ACE 本地化实现配置
   */
  private validateAceLocalImplementation(
    localImpl: AceLocalImplementationConfig,
    errors: string[],
    warnings: string[]
  ): void {
    if (typeof localImpl.enabled !== 'boolean') {
      warnings.push('ace.localImplementation.enabled 建议设置为布尔值');
    }

    if (localImpl.aceCore) {
      if (localImpl.aceCore.reflectionCycleInterval !== undefined) {
        if (typeof localImpl.aceCore.reflectionCycleInterval !== 'number') {
          errors.push('ace.localImplementation.aceCore.reflectionCycleInterval 必须是数字');
        } else if (localImpl.aceCore.reflectionCycleInterval < 1000) {
          warnings.push('ace.localImplementation.aceCore.reflectionCycleInterval 建议大于1000毫秒');
        }
      }

      if (localImpl.aceCore.maxSessionAge !== undefined) {
        if (typeof localImpl.aceCore.maxSessionAge !== 'number') {
          errors.push('ace.localImplementation.aceCore.maxSessionAge 必须是数字');
        } else if (localImpl.aceCore.maxSessionAge < 60000) {
          warnings.push('ace.localImplementation.aceCore.maxSessionAge 建议大于60000毫秒');
        }
      }
    }

    if (typeof localImpl.useEventBus !== 'boolean') {
      warnings.push('ace.localImplementation.useEventBus 建议设置为布尔值');
    }

    if (typeof localImpl.useLLMManager !== 'boolean') {
      warnings.push('ace.localImplementation.useLLMManager 建议设置为布尔值');
    }

    if (typeof localImpl.useSQLiteConfig !== 'boolean') {
      warnings.push('ace.localImplementation.useSQLiteConfig 建议设置为布尔值');
    }
  }
}
