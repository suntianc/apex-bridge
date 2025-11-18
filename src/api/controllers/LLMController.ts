/**
 * LLMController - LLM配置管理API控制器
 */

import { Request, Response } from 'express';
import { LLMConfigService, UpdateLLMProviderInput } from '../../services/LLMConfigService';
import { LLMManager } from '../../core/LLMManager';
// RuntimeConfigService 已迁移到 ConfigService
import { logger } from '../../utils/logger';

const configService = LLMConfigService.getInstance();
let llmManagerInstance: LLMManager | null = null;

/**
 * 设置LLMManager实例（用于更新内存）
 */
export function setLLMManager(manager: LLMManager | null): void {
  llmManagerInstance = manager;
}

/**
 * 列出所有LLM厂商配置
 * GET /api/llm/providers
 */
export async function listProviders(req: Request, res: Response): Promise<void> {
  try {
    const providers = configService.list();
    
    res.json({
      success: true,
      providers: providers.map(p => ({
        id: p.id,
        provider: p.provider,
        name: p.name,
        enabled: p.enabled,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
        // 不返回config中的敏感信息（如apiKey）
      }))
    });
  } catch (error: any) {
    logger.error('❌ Failed to list LLM providers:', error);
    res.status(500).json({
      error: 'Failed to list providers',
      message: error.message
    });
  }
}

/**
 * 获取单个厂商配置详情
 * GET /api/llm/providers/:id
 */
export async function getProvider(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    
    if (isNaN(id)) {
      res.status(400).json({
        error: 'Invalid provider ID',
        message: 'Provider ID must be a number'
      });
      return;
    }

    const provider = configService.getById(id);
    
    if (!provider) {
      res.status(404).json({
        error: 'Provider not found',
        message: `Provider with id ${id} not found`
      });
      return;
    }

    res.json({
      success: true,
      provider: {
        id: provider.id,
        provider: provider.provider,
        name: provider.name,
        config: {
          // 隐藏敏感信息
          baseURL: provider.config.baseURL,
          defaultModel: provider.config.defaultModel,
          timeout: provider.config.timeout,
          maxRetries: provider.config.maxRetries
          // 不返回apiKey
        },
        enabled: provider.enabled,
        createdAt: provider.createdAt,
        updatedAt: provider.updatedAt
      }
    });
  } catch (error: any) {
    logger.error('❌ Failed to get LLM provider:', error);
    res.status(500).json({
      error: 'Failed to get provider',
      message: error.message
    });
  }
}

/**
 * 更新现有厂商配置
 * PUT /api/llm/providers/:id
 */
export async function updateProvider(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    
    if (isNaN(id)) {
      res.status(400).json({
        error: 'Invalid provider ID',
        message: 'Provider ID must be a number'
      });
      return;
    }

    const { name, config, enabled } = req.body;

    // 验证输入
    const updateInput: UpdateLLMProviderInput = {};
    
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({
          error: 'Invalid name',
          message: 'Name must be a non-empty string'
        });
        return;
      }
      updateInput.name = name.trim();
    }

    if (config !== undefined) {
      if (typeof config !== 'object' || config === null) {
        res.status(400).json({
          error: 'Invalid config',
          message: 'Config must be an object'
        });
        return;
      }
      updateInput.config = config;
    }

    if (enabled !== undefined) {
      if (typeof enabled !== 'boolean') {
        res.status(400).json({
          error: 'Invalid enabled',
          message: 'Enabled must be a boolean'
        });
        return;
      }
      updateInput.enabled = enabled;
    }

    if (Object.keys(updateInput).length === 0) {
      res.status(400).json({
        error: 'No updates provided',
        message: 'At least one field (name, config, enabled) must be provided'
      });
      return;
    }

    // 更新配置（先更新SQLite，再更新内存）
    // 1. 先更新SQLite
    const updated = configService.update(id, updateInput);
    logger.debug(`✅ SQLite updated for provider ${updated.provider} (id: ${id})`);

    // 2. 如果LLMManager已初始化，更新内存中的适配器
    if (llmManagerInstance) {
      try {
        await llmManagerInstance.updateProvider(id, updateInput);
        logger.info(`✅ Updated provider in memory: ${updated.provider} (id: ${id})`);
      } catch (memoryError: any) {
        // 内存更新失败，但SQLite已更新
        logger.error(`❌ Failed to update provider in memory (SQLite already updated):`, memoryError.message);
        // 继续返回成功，但添加警告
        res.json({
          success: true,
          message: 'Provider updated in database, but memory update failed',
          warning: 'Memory update failed. Consider reloading LLMManager.',
          provider: {
            id: updated.id,
            provider: updated.provider,
            name: updated.name,
            enabled: updated.enabled,
            updatedAt: updated.updatedAt
          }
        });
        return;
      }
    } else {
      // LLMManager未初始化，下次懒加载时会使用新配置
      logger.debug('ℹ️  LLMManager not initialized, memory will be updated on next use');
    }

    res.json({
      success: true,
      message: 'Provider updated successfully',
      provider: {
        id: updated.id,
        provider: updated.provider,
        name: updated.name,
        enabled: updated.enabled,
        updatedAt: updated.updatedAt
      }
    });
  } catch (error: any) {
    logger.error('❌ Failed to update LLM provider:', error);
    
    if (error.message && error.message.includes('not found')) {
      res.status(404).json({
        error: 'Provider not found',
        message: error.message
      });
      return;
    }

    if (error.message && (error.message.includes('Invalid') || error.message.includes('required'))) {
      res.status(400).json({
        error: 'Validation failed',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to update provider',
      message: error.message
    });
  }
}

