/**
 * ProviderController - 提供商管理 API 控制器
 * 
 * 管理 LLM 提供商的 CRUD 操作
 */

import { Request, Response } from 'express';
import { LLMConfigService } from '../../services/LLMConfigService';
import { ModelRegistry } from '../../services/ModelRegistry';
import { CreateProviderInput, UpdateProviderInput } from '../../types/llm-models';
import { logger } from '../../utils/logger';

const configService = LLMConfigService.getInstance();
const modelRegistry = ModelRegistry.getInstance();

/**
 * 列出所有提供商
 * GET /api/llm/providers
 */
export async function listProviders(req: Request, res: Response): Promise<void> {
  try {
    const providers = configService.listProviders();
    
    // 为每个提供商添加模型统计
    const providersWithStats = providers.map(p => {
      const models = configService.getProviderModels(p.id);
      return {
        id: p.id,
        provider: p.provider,
        name: p.name,
        description: p.description,
        enabled: p.enabled,
        modelCount: models.length,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
        // 不返回 baseConfig 中的敏感信息
      };
    });

    res.json({
      success: true,
      providers: providersWithStats
    });
  } catch (error: any) {
    logger.error('❌ Failed to list providers:', error);
    res.status(500).json({
      error: 'Failed to list providers',
      message: error.message
    });
  }
}

/**
 * 获取提供商详情
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

    const provider = configService.getProvider(id);
    
    if (!provider) {
      res.status(404).json({
        error: 'Provider not found',
        message: `Provider with id ${id} not found`
      });
      return;
    }

    // 获取该提供商的所有模型
    const models = configService.getProviderModels(id);

    res.json({
      success: true,
      provider: {
        id: provider.id,
        provider: provider.provider,
        name: provider.name,
        description: provider.description,
        baseConfig: {
          // 隐藏 API Key
          baseURL: provider.baseConfig.baseURL,
          timeout: provider.baseConfig.timeout,
          maxRetries: provider.baseConfig.maxRetries
        },
        enabled: provider.enabled,
        modelCount: models.length,
        createdAt: provider.createdAt,
        updatedAt: provider.updatedAt
      }
    });
  } catch (error: any) {
    logger.error('❌ Failed to get provider:', error);
    res.status(500).json({
      error: 'Failed to get provider',
      message: error.message
    });
  }
}

/**
 * 创建提供商
 * POST /api/llm/providers
 */
export async function createProvider(req: Request, res: Response): Promise<void> {
  try {
    const input: CreateProviderInput = req.body;

    // 基本验证
    if (!input.provider || !input.name || !input.baseConfig) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'provider, name, and baseConfig are required'
      });
      return;
    }

    const created = configService.createProvider(input);
    
    // 刷新缓存
    modelRegistry.forceRefresh();

    res.status(201).json({
      success: true,
      message: 'Provider created successfully',
      provider: {
        id: created.id,
        provider: created.provider,
        name: created.name,
        description: created.description,
        enabled: created.enabled,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt
      }
    });
  } catch (error: any) {
    logger.error('❌ Failed to create provider:', error);
    
    if (error.message.includes('already exists')) {
      res.status(409).json({
        error: 'Provider already exists',
        message: error.message
      });
      return;
    }

    if (error.message.includes('required')) {
      res.status(400).json({
        error: 'Validation failed',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to create provider',
      message: error.message
    });
  }
}

/**
 * 更新提供商
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

    const input: UpdateProviderInput = req.body;

    if (Object.keys(input).length === 0) {
      res.status(400).json({
        error: 'No updates provided',
        message: 'At least one field must be provided'
      });
      return;
    }

    const updated = configService.updateProvider(id, input);
    
    // 刷新缓存
    modelRegistry.forceRefresh();

    res.json({
      success: true,
      message: 'Provider updated successfully',
      provider: {
        id: updated.id,
        provider: updated.provider,
        name: updated.name,
        description: updated.description,
        enabled: updated.enabled,
        updatedAt: updated.updatedAt
      }
    });
  } catch (error: any) {
    logger.error('❌ Failed to update provider:', error);
    
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Provider not found',
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

/**
 * 删除提供商
 * DELETE /api/llm/providers/:id
 */
export async function deleteProvider(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    
    if (isNaN(id)) {
      res.status(400).json({
        error: 'Invalid provider ID',
        message: 'Provider ID must be a number'
      });
      return;
    }

    configService.deleteProvider(id);
    
    // 刷新缓存
    modelRegistry.forceRefresh();

    res.json({
      success: true,
      message: 'Provider and associated models deleted successfully'
    });
  } catch (error: any) {
    logger.error('❌ Failed to delete provider:', error);
    
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Provider not found',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to delete provider',
      message: error.message
    });
  }
}

