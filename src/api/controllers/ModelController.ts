/**
 * ModelController - 模型管理 API 控制器
 *
 * 管理 LLM 模型的 CRUD 操作
 */

import { Request, Response } from "express";
import { LLMConfigService } from "../../services/LLMConfigService";
import { ModelRegistry } from "../../services/ModelRegistry";
import { CreateModelInput, UpdateModelInput, LLMModelType } from "../../types/llm-models";
import { logger } from "../../utils/logger";
import {
  badRequest,
  notFound,
  serverError,
  created,
  ok,
  handleErrorWithAutoDetection,
} from "../../utils/http-response";
import { parseIdParam, parseBooleanParam } from "../../utils/request-parser";

const configService = LLMConfigService.getInstance();
const modelRegistry = ModelRegistry.getInstance();

/**
 * 列出提供商的所有模型
 * GET /api/llm/providers/:providerId/models
 */
export async function listProviderModels(req: Request, res: Response): Promise<void> {
  try {
    const providerId = parseIdParam(req, "providerId");

    if (providerId === null) {
      badRequest(res, "Provider ID must be a number");
      return;
    }

    // 验证提供商存在
    const provider = configService.getProvider(providerId);
    if (!provider) {
      notFound(res, `Provider with id ${providerId} not found`);
      return;
    }

    const models = configService.listModels({ providerId });

    res.json({
      success: true,
      provider: {
        id: provider.id,
        provider: provider.provider,
        name: provider.name,
      },
      models: models.map((m) => ({
        id: m.id,
        modelKey: m.modelKey,
        modelName: m.modelName,
        modelType: m.modelType,
        modelConfig: m.modelConfig,
        apiEndpointSuffix: m.apiEndpointSuffix,
        enabled: m.enabled,
        isDefault: m.isDefault,
        displayOrder: m.displayOrder,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
    });
  } catch (error: any) {
    logger.error("❌ Failed to list models:", error);
    serverError(res, error, "Failed to list models");
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
      badRequest(res, "Provider ID and Model ID must be numbers");
      return;
    }

    const model = configService.getModel(modelId);

    if (!model || model.providerId !== providerId) {
      notFound(res, `Model with id ${modelId} not found for provider ${providerId}`);
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
        updatedAt: model.updatedAt,
      },
    });
  } catch (error: unknown) {
    logger.error("Failed to get model:", error);
    serverError(res, error);
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
      badRequest(res, "Provider ID must be a number");
      return;
    }

    const input: CreateModelInput = req.body;

    if (!input.modelKey || !input.modelName || !input.modelType) {
      badRequest(res, "modelKey, modelName, and modelType are required");
      return;
    }

    const newModel = configService.createModel(providerId, input);

    modelRegistry.forceRefresh();

    created(res, {
      id: newModel.id,
      providerId: newModel.providerId,
      modelKey: newModel.modelKey,
      modelName: newModel.modelName,
      modelType: newModel.modelType,
      enabled: newModel.enabled,
      isDefault: newModel.isDefault,
      createdAt: newModel.createdAt,
      updatedAt: newModel.updatedAt,
    });
  } catch (error: any) {
    handleErrorWithAutoDetection(res, error, "create model");
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
      badRequest(res, "Provider ID and Model ID must be numbers");
      return;
    }

    const input: UpdateModelInput = req.body;

    if (Object.keys(input).length === 0) {
      badRequest(res, "At least one field must be provided");
      return;
    }

    // 验证模型属于该提供商
    const existing = configService.getModel(modelId);
    if (!existing || existing.providerId !== providerId) {
      notFound(res, `Model with id ${modelId} not found for provider ${providerId}`);
      return;
    }

    const updatedModel = configService.updateModel(modelId, input);

    modelRegistry.forceRefresh();

    ok(res, {
      id: updatedModel.id,
      providerId: updatedModel.providerId,
      modelKey: updatedModel.modelKey,
      modelName: updatedModel.modelName,
      modelType: updatedModel.modelType,
      enabled: updatedModel.enabled,
      isDefault: updatedModel.isDefault,
      updatedAt: updatedModel.updatedAt,
    });
  } catch (error: any) {
    handleErrorWithAutoDetection(res, error, "update model");
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
      badRequest(res, "Provider ID and Model ID must be numbers");
      return;
    }

    const existing = configService.getModel(modelId);
    if (!existing || existing.providerId !== providerId) {
      notFound(res, `Model with id ${modelId} not found for provider ${providerId}`);
      return;
    }

    configService.deleteModel(modelId);

    modelRegistry.forceRefresh();

    ok(res, { message: "Model deleted successfully" });
  } catch (error: any) {
    handleErrorWithAutoDetection(res, error, "delete model");
  }
}

/**
 * 查询模型（跨提供商）
 * GET /api/llm/models?type=nlp&enabled=true
 */
export async function queryModels(req: Request, res: Response): Promise<void> {
  try {
    const type = req.query.type as string;
    const enabled = parseBooleanParam(req.query.enabled as string | undefined, true);
    const isDefault = parseBooleanParam(req.query.default as string | undefined, true);

    const params: any = {};

    if (type) {
      if (!Object.values(LLMModelType).includes(type as LLMModelType)) {
        badRequest(res, `Model type must be one of: ${Object.values(LLMModelType).join(", ")}`);
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
      models: models.map((m) => ({
        id: m.id,
        providerId: m.providerId,
        provider: m.provider,
        providerName: m.providerName,
        modelKey: m.modelKey,
        modelName: m.modelName,
        modelType: m.modelType,
        modelConfig: m.modelConfig,
        apiEndpointSuffix: m.apiEndpointSuffix,
        enabled: m.enabled,
        isDefault: m.isDefault,
        displayOrder: m.displayOrder,
      })),
    });
  } catch (error: unknown) {
    logger.error("Failed to query models:", error);
    serverError(res, error);
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
      badRequest(res, "type query parameter is required");
      return;
    }

    // 验证模型类型
    if (!Object.values(LLMModelType).includes(type as LLMModelType)) {
      badRequest(res, `Model type must be one of: ${Object.values(LLMModelType).join(", ")}`);
      return;
    }

    const model = modelRegistry.getDefaultModel(type as LLMModelType);

    if (!model) {
      notFound(res, `No default model configured for type: ${type}`);
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
          maxRetries: model.providerBaseConfig.maxRetries,
        },
      },
    });
  } catch (error: unknown) {
    logger.error("Failed to get default model:", error);
    serverError(res, error);
  }
}
