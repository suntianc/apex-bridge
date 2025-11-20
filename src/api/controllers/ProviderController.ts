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
 * 转换为 Provider DTO
 * 统一响应结构，确保所有接口返回格式一致，且绝对安全（脱敏处理）
 * 
 * @param provider - 提供商对象
 * @param modelCount - 模型数量（可选，默认 0）
 * @returns 标准化的 Provider DTO
 */
function toProviderDTO(provider: any, modelCount: number = 0) {
  return {
    id: provider.id,
    provider: provider.provider,
    name: provider.name,
    description: provider.description,
    enabled: provider.enabled,
    modelCount: modelCount, // 统一包含模型数量
    baseConfig: {
      // 🛡️ 统一脱敏逻辑，防止未来新增字段时忘记脱敏
      baseURL: provider.baseConfig?.baseURL,
      timeout: provider.baseConfig?.timeout,
      maxRetries: provider.baseConfig?.maxRetries,
      // Explicitly OMIT apiKey - 确保敏感信息不会泄露
    },
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt
  };
}

/**
 * 列出所有提供商
 * GET /api/llm/providers
 */
export async function listProviders(req: Request, res: Response): Promise<void> {
  try {
    const providers = configService.listProviders();
    
    // 为每个提供商添加模型统计，使用统一的 DTO
    const providersWithStats = providers.map(p => {
      const models = configService.getProviderModels(p.id);
      // ✅ 使用统一 DTO，确保响应结构一致
      return toProviderDTO(p, models.length);
    });

    res.json({
      success: true,
      providers: providersWithStats
    });
  } catch (error: any) {
    handleServiceError(res, error, 'list providers');
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
      // ✅ 使用统一 DTO，确保响应结构一致
      provider: toProviderDTO(provider, models.length)
    });
  } catch (error: any) {
    handleServiceError(res, error, 'get provider');
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
      // ✅ 返回完整的、一致的结构（新创建的 Provider 模型数为 0）
      provider: toProviderDTO(created, 0)
    });
  } catch (error: any) {
    handleServiceError(res, error, 'create provider');
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
    
    // 获取当前模型数以保持一致性
    const models = configService.getProviderModels(id);

    res.json({
      success: true,
      message: 'Provider updated successfully',
      // ✅ 返回完整的、一致的结构
      provider: toProviderDTO(updated, models.length)
    });
  } catch (error: any) {
    handleServiceError(res, error, 'update provider');
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
    handleServiceError(res, error, 'delete provider');
  }
}

