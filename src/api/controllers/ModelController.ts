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
 * 解析布尔值查询参数
 * 支持多种格式：'true', '1', true, 'TRUE' 等
 * 
 * @param value - 查询参数值
 * @returns 布尔值或 undefined（如果未提供）
 */
function parseBooleanQuery(value: any): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  
  // 处理字符串
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    return lower === 'true' || lower === '1' || lower === 'yes';
  }
  
  // 处理布尔值
  if (typeof value === 'boolean') {
    return value;
  }
  
  // 处理数字
  if (typeof value === 'number') {
    return value === 1;
  }
  
  return undefined;
}

/**
 * 统一处理服务层错误
 * 将字符串匹配的错误转换为合适的 HTTP 状态码
 * 
 * @param res - Express 响应对象
 * @param error - 错误对象
 * @param action - 操作名称（用于日志）
 * @returns 是否已处理错误
 */
function handleServiceError(res: Response, error: any, action: string): boolean {
  logger.error(`❌ Failed to ${action}:`, error);
  
  const msg = error.message || '';
  
  // 使用字符串匹配（如果 Service 层没有使用 AppError）
  // 注意：这是临时方案，理想情况下 Service 层应该抛出 AppError
  if (msg.includes('not found') || msg.toLowerCase().includes('not found')) {
    res.status(404).json({
      error: 'Resource not found',
      message: error.message
    });
    return true;
  }
  
  if (msg.includes('already exists') || msg.toLowerCase().includes('already exists')) {
    res.status(409).json({
      error: 'Resource already exists',
      message: error.message
    });
    return true;
  }
  
  if (msg.includes('required') || msg.includes('Invalid') || msg.toLowerCase().includes('validation')) {
    res.status(400).json({
      error: 'Validation failed',
      message: error.message
    });
    return true;
  }
  
  // 默认返回 500
  res.status(500).json({
    error: `Failed to ${action}`,
    message: error.message
  });
  return true;
}

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
    handleServiceError(res, error, 'create model');
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
    handleServiceError(res, error, 'update model');
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
    handleServiceError(res, error, 'delete model');
  }
}

/**
 * 查询模型（跨提供商）
 * GET /api/llm/models?type=nlp&enabled=true
 */
export async function queryModels(req: Request, res: Response): Promise<void> {
  try {
    const type = req.query.type as string;
    // ⚡️ 优化：更健壮的布尔值解析
    const enabled = parseBooleanQuery(req.query.enabled);
    const isDefault = parseBooleanQuery(req.query.default);

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

    // 只有当值明确为 true 时才设置参数
    if (enabled !== undefined) {
      params.enabled = enabled;
    }

    if (isDefault !== undefined) {
      params.isDefault = isDefault;
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

