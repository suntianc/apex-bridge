/**
 * ACE层级模型配置路由
 * 提供ACE架构L1-L6层级模型管理的RESTful API路由
 */

import { Router } from 'express';
import {
  getAllLayerModels,
  getLayerModel,
  getRecommendedModels,
  validateLayers,
  setModelAsLayer,
  removeModelFromLayer,
  resetAllLayers,
  quickConfigLayer
} from '../controllers/AceLayerController';

const router = Router();

// ==================== 查询接口 ====================

/**
 * @route   GET /api/ace/layers/models
 * @desc    获取所有层级模型配置
 * @access  Private (需要API Key)
 */
router.get('/models', getAllLayerModels);

/**
 * @route   GET /api/ace/layers/:layer/model
 * @desc    获取指定层级模型
 * @access  Private (需要API Key)
 * @params  layer - 层级类型 (l1, l2, l3, l4, l5, l6)
 */
router.get('/:layer/model', getLayerModel);

/**
 * @route   GET /api/ace/layers/:layer/recommended
 * @desc    获取层级推荐模型
 * @access  Private (需要API Key)
 * @params  layer - 层级类型 (l1, l2, l3, l4, l5, l6)
 */
router.get('/:layer/recommended', getRecommendedModels);

/**
 * @route   GET /api/ace/layers/validate
 * @desc    验证所有层级配置
 * @access  Private (需要API Key)
 */
router.get('/validate', validateLayers);

// ==================== 设置接口 ====================

/**
 * @route   POST /api/ace/layers/:layer/models
 * @desc    设置模型为指定层级
 * @access  Private (需要API Key)
 * @params  layer - 层级类型 (l1, l2, l3, l4, l5, l6)
 * @body    { modelId: number }
 */
router.post('/:layer/models', setModelAsLayer);

/**
 * @route   DELETE /api/ace/layers/:layer/models
 * @desc    从指定层级移除模型
 * @access  Private (需要API Key)
 * @params  layer - 层级类型 (l1, l2, l3, l4, l5, l6)
 */
router.delete('/:layer/models', removeModelFromLayer);

/**
 * @route   POST /api/ace/layers/reset
 * @desc    重置所有层级模型配置
 * @access  Private (需要API Key，建议仅限管理员）
 */
router.post('/reset', resetAllLayers);

// ==================== 便捷接口 ====================

/**
 * @route   POST /api/ace/layers/:layer/quick-config
 * @desc    快速配置层级模型（使用模型键）
 * @access  Private (需要API Key)
 * @params  layer - 层级类型 (l1, l2, l3, l4, l5, l6)
 * @body    { modelKey: string }
 */
router.post('/:layer/quick-config', quickConfigLayer);

export default router;
