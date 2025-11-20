/**
 * ModelController - 模型管理 API 控制器
 * 
 * 管理 LLM 模型的 CRUD 操作
 */

import { Request, Response } from 'express';
import { LLMConfigService } from '../../services/LLMConfigService';
import { ModelRegistry } from '../../services/ModelRegistry';
import { CreateModelInput, UpdateModelInput, LLMModelType } from '../../types/llm-models';
import { logger } from '../../utils/logger';

const configService = LLMConfigService.getInstance();
const modelRegistry = ModelRegistry.getInstance();

/**
 * 列出提供商的所有模型
 * GET /api/llm/providers/:providerId/models
 */
export async function listProviderModels(req: Request, res: Response): Promise<void> {
  try {
    const providerId = parseInt(req.params.providerId, 10);
    
    if (isNaN(providerId)) {
      res.status(400).json({
        error: 'Invalid provider ID',
        message: 'Provider ID must be a number'
      });
      return;
    }

    // 验证提供商存在
    const provider = configService.getProvider(providerId);
    if (!provider) {
      res.status(404).json({
        error: 'Provider not found',
        message: `Provider with id ${providerId} not found`
      });
      return;
    }

    const models = configService.listModels({ providerId });

    res.json({
      success: true,
      provider: {
        id: provider.id,
        provider: provider.provider,
        name: provider.name
      },
      models: models.map(m => ({
        id: m.id,
        modelKey: m.modelKey,
        modelName: m.modelName,
        modelType: m.modelType,
        apiEndpointSuffix: m.apiEndpointSuffix,
        enabled: m.enabled,
        isDefault: m.isDefault,
        displayOrder: m.displayOrder,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt
      }))
    });
  } catch (error: any) {
    logger.error('❌ Failed to list models:', error);
    res.status(500).json({
      error: 'Failed to list models',
      message: error.message
    });
  }
}

/**
 * 获取模型详情
 * GET /api/llm/providers/:providerId/models/:modelId
 */
export async function getModel(req: Request, res: Response): Promise<void> {
  try {
    const providerId = parseInt(req.params.providerId, 10);
    const modelId = parseInt(req.params.modelId, 10);
    
    if (isNaN(providerId) || isNaN(modelId)) {
      res.status(400).json({
        error: 'Invalid ID',
        message: 'Provider ID and Model ID must be numbers'
      });
      return;
    }

    const model = configService.getModel(modelId);
    
    if (!model || model.providerId !== providerId) {
      res.status(404).json({
        error: 'Model not found',
        message: `Model with id ${modelId} not found for provider ${providerId}`
      });
      return;
    }

    res.json({
      success: true,
      model: {
        id: model.id,
        providerId: model.providerId,
        provider: model.provider,
        providerName: model.providerName,
        modelKey: model.modelKey,
        modelName: model.modelName,
        modelType: model.modelType,
        modelConfig: model.modelConfig,
        apiEndpointSuffix: model.apiEndpointSuffix,
        enabled: model.enabled,
        isDefault: model.isDefault,
        displayOrder: model.displayOrder,
        createdAt: model.createdAt,
        updatedAt: model.updatedAt
      }
    });
  } catch (error: any) {
    logger.error('❌ Failed to get model:', error);
    res.status(500).json({
      error: 'Failed to get model',
      message: error.message
    });
  }
}

/**
 * 创建模型
 * POST /api/llm/providers/:providerId/models
 */
export async function createModel(req: Request, res: Response): Promise<void> {
  try {
    const providerId = parseInt(req.params.providerId, 10);
    
    if (isNaN(providerId)) {
      res.status(400).json({
        error: 'Invalid provider ID',
        message: 'Provider ID must be a number'
      });
      return;
    }

    const input: CreateModelInput = req.body;

    // 基本验证
    if (!input.modelKey || !input.modelName || !input.modelType) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'modelKey, modelName, and modelType are required'
      });
      return;
    }

    const created = configService.createModel(providerId, input);
    
    // 刷新缓存
    modelRegistry.forceRefresh();

    res.status(201).json({
      success: true,
      message: 'Model created successfully',
      model: {
        id: created.id,
        providerId: created.providerId,
        modelKey: created.modelKey,
        modelName: created.modelName,
        modelType: created.modelType,
        enabled: created.enabled,
        isDefault: created.isDefault,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt
      }
    });
  } catch (error: any) {
    logger.error('❌ Failed to create model:', error);
    
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Provider not found',
        message: error.message
      });
      return;
    }

    if (error.message.includes('already exists')) {
      res.status(409).json({
        error: 'Model already exists',
        message: error.message
      });
      return;
    }

    if (error.message.includes('required') || error.message.includes('Invalid')) {
      res.status(400).json({
        error: 'Validation failed',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to create model',
      message: error.message
    });
  }
}

/**
 * 更新模型
 * PUT /api/llm/providers/:providerId/models/:modelId
 */
export async function updateModel(req: Request, res: Response): Promise<void> {
  try {
    const providerId = parseInt(req.params.providerId, 10);
    const modelId = parseInt(req.params.modelId, 10);
    
    if (isNaN(providerId) || isNaN(modelId)) {
      res.status(400).json({
        error: 'Invalid ID',
        message: 'Provider ID and Model ID must be numbers'
      });
      return;
    }

    const input: UpdateModelInput = req.body;

    if (Object.keys(input).length === 0) {
      res.status(400).json({
        error: 'No updates provided',
        message: 'At least one field must be provided'
      });
      return;
    }

    // 验证模型属于该提供商
    const existing = configService.getModel(modelId);
    if (!existing || existing.providerId !== providerId) {
      res.status(404).json({
        error: 'Model not found',
        message: `Model with id ${modelId} not found for provider ${providerId}`
      });
      return;
    }

    const updated = configService.updateModel(modelId, input);
    
    // 刷新缓存
    modelRegistry.forceRefresh();

    res.json({
      success: true,
      message: 'Model updated successfully',
      model: {
        id: updated.id,
        providerId: updated.providerId,
        modelKey: updated.modelKey,
        modelName: updated.modelName,
        modelType: updated.modelType,
        enabled: updated.enabled,
        isDefault: updated.isDefault,
        updatedAt: updated.updatedAt
      }
    });
  } catch (error: any) {
    logger.error('❌ Failed to update model:', error);
    
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Model not found',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to update model',
      message: error.message
    });
  }
}

/**
 * 删除模型
 * DELETE /api/llm/providers/:providerId/models/:modelId
 */
export async function deleteModel(req: Request, res: Response): Promise<void> {
  try {
    const providerId = parseInt(req.params.providerId, 10);
    const modelId = parseInt(req.params.modelId, 10);
    
    if (isNaN(providerId) || isNaN(modelId)) {
      res.status(400).json({
        error: 'Invalid ID',
        message: 'Provider ID and Model ID must be numbers'
      });
      return;
    }

    // 验证模型属于该提供商
    const existing = configService.getModel(modelId);
    if (!existing || existing.providerId !== providerId) {
      res.status(404).json({
        error: 'Model not found',
        message: `Model with id ${modelId} not found for provider ${providerId}`
      });
      return;
    }

    configService.deleteModel(modelId);
    
    // 刷新缓存
    modelRegistry.forceRefresh();

    res.json({
      success: true,
      message: 'Model deleted successfully'
    });
  } catch (error: any) {
    logger.error('❌ Failed to delete model:', error);
    
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Model not found',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to delete model',
      message: error.message
    });
  }
}

/**
 * 查询模型（跨提供商）
 * GET /api/llm/models?type=nlp&enabled=true
 */
export async function queryModels(req: Request, res: Response): Promise<void> {
  try {
    const type = req.query.type as string;
    const enabled = req.query.enabled === 'true';
    const isDefault = req.query.default === 'true';

    const params: any = {};
    
    if (type) {
      // 验证模型类型
      if (!Object.values(LLMModelType).includes(type as LLMModelType)) {
        res.status(400).json({
          error: 'Invalid model type',
          message: `Model type must be one of: ${Object.values(LLMModelType).join(', ')}`
        });
        return;
      }
      params.modelType = type as LLMModelType;
    }

    if (enabled) {
      params.enabled = true;
    }

    if (isDefault) {
      params.isDefault = true;
    }

    const models = configService.listModels(params);

    res.json({
      success: true,
      count: models.length,
      models: models.map(m => ({
        id: m.id,
        providerId: m.providerId,
        provider: m.provider,
        providerName: m.providerName,
        modelKey: m.modelKey,
        modelName: m.modelName,
        modelType: m.modelType,
        apiEndpointSuffix: m.apiEndpointSuffix,
        enabled: m.enabled,
        isDefault: m.isDefault,
        displayOrder: m.displayOrder
      }))
    });
  } catch (error: any) {
    logger.error('❌ Failed to query models:', error);
    res.status(500).json({
      error: 'Failed to query models',
      message: error.message
    });
  }
}

/**
 * 获取默认模型
 * GET /api/llm/models/default?type=embedding
 */
export async function getDefaultModel(req: Request, res: Response): Promise<void> {
  try {
    const type = req.query.type as string;

    if (!type) {
      res.status(400).json({
        error: 'Missing type parameter',
        message: 'type query parameter is required'
      });
      return;
    }

    // 验证模型类型
    if (!Object.values(LLMModelType).includes(type as LLMModelType)) {
      res.status(400).json({
        error: 'Invalid model type',
        message: `Model type must be one of: ${Object.values(LLMModelType).join(', ')}`
      });
      return;
    }

    const model = modelRegistry.getDefaultModel(type as LLMModelType);

    if (!model) {
      res.status(404).json({
        error: 'No default model found',
        message: `No default model configured for type: ${type}`
      });
      return;
    }

    res.json({
      success: true,
      model: {
        id: model.id,
        providerId: model.providerId,
        provider: model.provider,
        providerName: model.providerName,
        modelKey: model.modelKey,
        modelName: model.modelName,
        modelType: model.modelType,
        modelConfig: model.modelConfig,
        apiEndpointSuffix: model.apiEndpointSuffix,
        baseConfig: {
          baseURL: model.providerBaseConfig.baseURL,
          timeout: model.providerBaseConfig.timeout,
          maxRetries: model.providerBaseConfig.maxRetries
        }
      }
    });
  } catch (error: any) {
    logger.error('❌ Failed to get default model:', error);
    res.status(500).json({
      error: 'Failed to get default model',
      message: error.message
    });
  }
}

