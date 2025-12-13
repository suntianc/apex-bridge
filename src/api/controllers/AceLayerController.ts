/**
 * AceLayerController - ACE层级模型配置 API 控制器
 *
 * 提供ACE架构L1-L6层级模型的管理接口
 */

import { Request, Response } from 'express';
import { AceLayerConfigService, AceLayerType } from '../../services/AceLayerConfigService';
import { logger } from '../../utils/logger';

// 创建AceLayerConfigService实例
const aceLayerService = new AceLayerConfigService();

/**
 * 统一处理服务层错误
 */
function handleServiceError(res: Response, error: any, action: string): boolean {
  logger.error(`❌ Failed to ${action}:`, error);

  const msg = error.message || '';

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

  res.status(500).json({
    error: `Failed to ${action}`,
    message: error.message
  });
  return true;
}

/**
 * 验证层级类型
 */
function isValidLayer(layer: string): layer is AceLayerType {
  return ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'].includes(layer);
}

// ==================== 查询接口 ====================

/**
 * 获取所有层级模型配置
 * GET /api/ace/layers/models
 */
export async function getAllLayerModels(req: Request, res: Response): Promise<void> {
  try {
    const allLayers = aceLayerService.getAllLayerModels();
    const layerConfigs = aceLayerService.getAllLayerConfigs();
    const stats = aceLayerService.getLayerModelStats();
    const validation = aceLayerService.validateAllLayers();

    res.json({
      success: true,
      layers: {
        l1: allLayers.l1 ? {
          id: allLayers.l1.id,
          modelKey: allLayers.l1.modelKey,
          modelName: allLayers.l1.modelName,
          provider: allLayers.l1.provider
        } : null,
        l2: allLayers.l2 ? {
          id: allLayers.l2.id,
          modelKey: allLayers.l2.modelKey,
          modelName: allLayers.l2.modelName,
          provider: allLayers.l2.provider
        } : null,
        l3: allLayers.l3 ? {
          id: allLayers.l3.id,
          modelKey: allLayers.l3.modelKey,
          modelName: allLayers.l3.modelName,
          provider: allLayers.l3.provider
        } : null,
        l4: allLayers.l4 ? {
          id: allLayers.l4.id,
          modelKey: allLayers.l4.modelKey,
          modelName: allLayers.l4.modelName,
          provider: allLayers.l4.provider
        } : null,
        l5: allLayers.l5 ? {
          id: allLayers.l5.id,
          modelKey: allLayers.l5.modelKey,
          modelName: allLayers.l5.modelName,
          provider: allLayers.l5.provider
        } : null,
        l6: allLayers.l6 ? {
          id: allLayers.l6.id,
          modelKey: allLayers.l6.modelKey,
          modelName: allLayers.l6.modelName,
          provider: allLayers.l6.provider
        } : null
      },
      configs: {
        l1: layerConfigs.l1,
        l2: layerConfigs.l2,
        l3: layerConfigs.l3,
        l4: layerConfigs.l4,
        l5: layerConfigs.l5,
        l6: layerConfigs.l6
      },
      stats,
      validation
    });
  } catch (error: any) {
    handleServiceError(res, error, 'get all layer models');
  }
}

/**
 * 获取指定层级模型
 * GET /api/ace/layers/:layer/model
 */
export async function getLayerModel(req: Request, res: Response): Promise<void> {
  try {
    const layer = req.params.layer.toLowerCase();

    if (!isValidLayer(layer)) {
      res.status(400).json({
        error: 'Invalid layer',
        message: `Layer must be one of: l1, l2, l3, l4, l5, l6`,
        validLayers: ['l1', 'l2', 'l3', 'l4', 'l5', 'l6']
      });
      return;
    }

    let model = null;
    const layerConfig = aceLayerService.getLayerConfig(layer);

    switch (layer) {
      case 'l1':
        model = aceLayerService.getL1LayerModel();
        break;
      case 'l2':
        model = aceLayerService.getL2LayerModel();
        break;
      case 'l3':
        model = aceLayerService.getL3LayerModel();
        break;
      case 'l4':
        model = aceLayerService.getL4LayerModel();
        break;
      case 'l5':
        model = aceLayerService.getL5LayerModel();
        break;
      case 'l6':
        model = aceLayerService.getL6LayerModel();
        break;
    }

    res.json({
      success: true,
      layer,
      config: layerConfig,
      model: model ? {
        id: model.id,
        modelKey: model.modelKey,
        modelName: model.modelName,
        modelType: model.modelType,
        provider: model.provider,
        providerName: model.providerName,
        providerEnabled: model.providerEnabled
      } : null
    });
  } catch (error: any) {
    handleServiceError(res, error, 'get layer model');
  }
}

/**
 * 获取层级推荐模型
 * GET /api/ace/layers-models/:layer/recommended
 */
export async function getRecommendedModels(req: Request, res: Response): Promise<void> {
  try {
    const layer = req.params.layer.toLowerCase();

    if (!isValidLayer(layer)) {
      res.status(400).json({
        error: 'Invalid layer',
        message: `Layer must be one of: l1, l2, l3, l4, l5, l6`,
        validLayers: ['l1', 'l2', 'l3', 'l4', 'l5', 'l6']
      });
      return;
    }

    const layerConfig = aceLayerService.getLayerConfig(layer);
    const recommendedModels = aceLayerService.getRecommendedModels(layer);

    res.json({
      success: true,
      layer,
      description: layerConfig.description,
      recommendedModels
    });
  } catch (error: any) {
    handleServiceError(res, error, 'get recommended models');
  }
}

/**
 * 验证所有层级配置
 * GET /api/ace/layers/validate
 */
export async function validateLayers(req: Request, res: Response): Promise<void> {
  try {
    const validation = aceLayerService.validateAllLayers();
    const stats = aceLayerService.getLayerModelStats();
    const configs = aceLayerService.getAllLayerConfigs();

    res.json({
      success: true,
      isValid: validation.isValid,
      missingLayers: validation.missingLayers,
      configuredLayers: validation.configuredLayers,
      stats,
      configs
    });
  } catch (error: any) {
    handleServiceError(res, error, 'validate layers');
  }
}

// ==================== 设置接口 ====================

/**
 * 设置模型为指定层级
 * POST /api/ace/layers/:layer/models
 */
export async function setModelAsLayer(req: Request, res: Response): Promise<void> {
  try {
    const layer = req.params.layer.toLowerCase();
    const { modelId } = req.body;

    if (!isValidLayer(layer)) {
      res.status(400).json({
        error: 'Invalid layer',
        message: `Layer must be one of: l1, l2, l3, l4, l5, l6`
      });
      return;
    }

    if (!modelId || isNaN(Number(modelId))) {
      res.status(400).json({
        error: 'Invalid modelId',
        message: 'modelId is required and must be a number'
      });
      return;
    }

    aceLayerService.setModelAsLayer(Number(modelId), layer);

    res.json({
      success: true,
      message: `Model ${modelId} set as ${layer.toUpperCase()} layer`,
      layer,
      modelId: Number(modelId)
    });
  } catch (error: any) {
    handleServiceError(res, error, 'set model as layer');
  }
}

/**
 * 从指定层级移除模型
 * DELETE /api/ace/layers/:layer/models
 */
export async function removeModelFromLayer(req: Request, res: Response): Promise<void> {
  try {
    const layer = req.params.layer.toLowerCase();

    if (!isValidLayer(layer)) {
      res.status(400).json({
        error: 'Invalid layer',
        message: `Layer must be one of: l1, l2, l3, l4, l5, l6`
      });
      return;
    }

    aceLayerService.removeModelFromLayer(layer);

    res.json({
      success: true,
      message: `Model removed from ${layer.toUpperCase()} layer`,
      layer
    });
  } catch (error: any) {
    handleServiceError(res, error, 'remove model from layer');
  }
}

/**
 * 重置所有层级模型配置
 * POST /api/ace/layers/reset
 */
export async function resetAllLayers(req: Request, res: Response): Promise<void> {
  try {
    aceLayerService.resetAllLayers();

    res.json({
      success: true,
      message: 'All ACE layer model configurations have been reset'
    });
  } catch (error: any) {
    handleServiceError(res, error, 'reset all layers');
  }
}

// ==================== 便捷接口 ====================

/**
 * 快速配置层级模型（使用模型键而非ID）
 * POST /api/ace/layers/:layer/quick-config
 */
export async function quickConfigLayer(req: Request, res: Response): Promise<void> {
  try {
    const layer = req.params.layer.toLowerCase();
    const { modelKey } = req.body;

    if (!isValidLayer(layer)) {
      res.status(400).json({
        error: 'Invalid layer',
        message: `Layer must be one of: l1, l2, l3, l4, l5, l6`
      });
      return;
    }

    if (!modelKey) {
      res.status(400).json({
        error: 'Invalid modelKey',
        message: 'modelKey is required'
      });
      return;
    }

    // 通过模型键查找模型ID
    // 这里需要使用LLMConfigService的listModels方法
    const allModels = aceLayerService.listModels({ enabled: true });
    const model = allModels.find(m => m.modelKey === modelKey);

    if (!model) {
      res.status(404).json({
        error: 'Model not found',
        message: `Model with key "${modelKey}" not found or disabled`
      });
      return;
    }

    aceLayerService.setModelAsLayer(model.id, layer);

    res.json({
      success: true,
      message: `Model ${modelKey} set as ${layer.toUpperCase()} layer`,
      layer,
      model: {
        id: model.id,
        modelKey: model.modelKey,
        modelName: model.modelName,
        provider: model.provider
      }
    });
  } catch (error: any) {
    handleServiceError(res, error, 'quick config layer');
  }
}
