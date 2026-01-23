/**
 * ModelController - 模型管理 API 控制器
 *
 * 管理 LLM 模型的 CRUD 操作
 *
 * @swagger
 * tags:
 *   name: Models
 *   description: LLM model management
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
import { parseIdParam, parseBooleanParam, toString } from "../../utils/request-parser";

const configService = LLMConfigService.getInstance();
const modelRegistry = ModelRegistry.getInstance();

/**
 * 列出提供商的所有模型
 * GET /api/llm/providers/:providerId/models
 *
 * @swagger
 * /api/llm/providers/{providerId}/models:
 *   get:
 *     summary: List models for a provider
 *     description: Returns all models configured for a specific provider
 *     tags: [Models]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: providerId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Provider ID
 *     responses:
 *       200:
 *         description: List of models for the provider
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 provider:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     provider:
 *                       type: string
 *                     name:
 *                       type: string
 *                 models:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       modelKey:
 *                         type: string
 *                       modelName:
 *                         type: string
 *                       modelType:
 *                         type: string
 *                       enabled:
 *                         type: boolean
 *                       isDefault:
 *                         type: boolean
 *       404:
 *         description: Provider not found
 */
export async function listProviderModels(req: Request, res: Response): Promise<void> {
  try {
    const providerId = parseIdParam(req, "providerId");

    if (providerId === null) {
      badRequest(res, "Provider ID must be a number");
      return;
    }

    // 验证提供商存在
    const provider = await configService.getProvider(providerId);
    if (!provider) {
      notFound(res, `Provider with id ${providerId} not found`);
      return;
    }

    const models = await configService.listModels({ providerId });

    ok(res, {
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
 *
 * @swagger
 * /api/llm/providers/{providerId}/models/{modelId}:
 *   get:
 *     summary: Get model details
 *     description: Returns detailed information about a specific model
 *     tags: [Models]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: providerId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Provider ID
 *       - in: path
 *         name: modelId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Model ID
 *     responses:
 *       200:
 *         description: Model details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 model:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     providerId:
 *                       type: integer
 *                     provider:
 *                       type: string
 *                     providerName:
 *                       type: string
 *                     modelKey:
 *                       type: string
 *                     modelName:
 *                       type: string
 *                     modelType:
 *                       type: string
 *                     enabled:
 *                       type: boolean
 *                     isDefault:
 *                       type: boolean
 *       404:
 *         description: Model not found
 */
export async function getModel(req: Request, res: Response): Promise<void> {
  try {
    const providerId = parseInt(toString(req.params.providerId), 10);
    const modelId = parseInt(toString(req.params.modelId), 10);

    if (isNaN(providerId) || isNaN(modelId)) {
      badRequest(res, "Provider ID and Model ID must be numbers", { code: "INVALID_ID" });
      return;
    }

    const model = await configService.getModel(modelId);

    if (!model || model.providerId !== providerId) {
      notFound(res, `Model with id ${modelId} not found for provider ${providerId}`);
      return;
    }

    ok(res, {
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
  } catch (error: any) {
    logger.error("❌ Failed to get model:", error);
    serverError(res, error, "Failed to get model");
  }
}

/**
 * 创建模型
 * POST /api/llm/providers/:providerId/models
 *
 * @swagger
 * /api/llm/providers/{providerId}/models:
 *   post:
 *     summary: Create a new model
 *     description: Creates a new model configuration for a provider
 *     tags: [Models]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: providerId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Provider ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - modelKey
 *               - modelName
 *               - modelType
 *             properties:
 *               modelKey:
 *                 type: string
 *                 description: Model identifier key
 *               modelName:
 *                 type: string
 *                 description: Display name for the model
 *               modelType:
 *                 type: string
 *                 enum: [nlp, embedding, rerank, tts, vision]
 *                 description: Type of model
 *               modelConfig:
 *                 type: object
 *                 description: Model-specific configuration
 *               apiEndpointSuffix:
 *                 type: string
 *                 description: Suffix for API endpoint
 *               enabled:
 *                 type: boolean
 *                 description: Whether the model is enabled
 *     responses:
 *       201:
 *         description: Model created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 id:
 *                   type: integer
 *                 providerId:
 *                   type: integer
 *                 modelKey:
 *                   type: string
 *                 modelName:
 *                   type: string
 *                 modelType:
 *                   type: string
 *       400:
 *         description: Invalid request
 */
export async function createModel(req: Request, res: Response): Promise<void> {
  try {
    const providerId = parseInt(toString(req.params.providerId), 10);

    if (isNaN(providerId)) {
      badRequest(res, "Provider ID must be a number");
      return;
    }

    const input: CreateModelInput = req.body;

    if (!input.modelKey || !input.modelName || !input.modelType) {
      badRequest(res, "modelKey, modelName, and modelType are required");
      return;
    }

    const newModel = await configService.createModel(providerId, input);

    modelRegistry.forceRefresh();

    created(res, {
      id: newModel.id,
      providerId: newModel.providerId,
      modelKey: newModel.modelKey,
      modelName: newModel.modelName,
      modelType: newModel.modelType,
      modelConfig: newModel.modelConfig,
      apiEndpointSuffix: newModel.apiEndpointSuffix,
      enabled: newModel.enabled,
      isDefault: newModel.isDefault,
      displayOrder: newModel.displayOrder,
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
 *
 * @swagger
 * /api/llm/providers/{providerId}/models/{modelId}:
 *   put:
 *     summary: Update a model
 *     description: Updates an existing model configuration
 *     tags: [Models]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: providerId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Provider ID
 *       - in: path
 *         name: modelId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Model ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               modelName:
 *                 type: string
 *                 description: Updated display name
 *               modelConfig:
 *                 type: object
 *                 description: Updated model configuration
 *               apiEndpointSuffix:
 *                 type: string
 *                 description: Updated API endpoint suffix
 *               enabled:
 *                 type: boolean
 *                 description: Whether the model is enabled
 *     responses:
 *       200:
 *         description: Model updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 id:
 *                   type: integer
 *                 providerId:
 *                   type: integer
 *                 modelKey:
 *                   type: string
 *                 modelName:
 *                   type: string
 *                 modelType:
 *                   type: string
 *       404:
 *         description: Model not found
 */
export async function updateModel(req: Request, res: Response): Promise<void> {
  try {
    const providerId = parseInt(toString(req.params.providerId), 10);
    const modelId = parseInt(toString(req.params.modelId), 10);

    if (isNaN(providerId) || isNaN(modelId)) {
      badRequest(res, "Provider ID and Model ID must be numbers", { code: "INVALID_ID" });
      return;
    }

    const input: UpdateModelInput = req.body;

    if (Object.keys(input).length === 0) {
      badRequest(res, "At least one field must be provided", { code: "NO_UPDATES" });
      return;
    }

    // 验证模型属于该提供商
    const existing = await configService.getModel(modelId);
    if (!existing || existing.providerId !== providerId) {
      notFound(res, `Model with id ${modelId} not found for provider ${providerId}`);
      return;
    }

    const updatedModel = await configService.updateModel(modelId, input);

    modelRegistry.forceRefresh();

    ok(res, {
      id: updatedModel.id,
      providerId: updatedModel.providerId,
      modelKey: updatedModel.modelKey,
      modelName: updatedModel.modelName,
      modelType: updatedModel.modelType,
      modelConfig: updatedModel.modelConfig,
      apiEndpointSuffix: updatedModel.apiEndpointSuffix,
      enabled: updatedModel.enabled,
      isDefault: updatedModel.isDefault,
      displayOrder: updatedModel.displayOrder,
      updatedAt: updatedModel.updatedAt,
    });
  } catch (error: any) {
    handleErrorWithAutoDetection(res, error, "update model");
  }
}

/**
 * 删除模型
 * DELETE /api/llm/providers/:providerId/models/:modelId
 *
 * @swagger
 * /api/llm/providers/{providerId}/models/{modelId}:
 *   delete:
 *     summary: Delete a model
 *     description: Deletes a model configuration
 *     tags: [Models]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: providerId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Provider ID
 *       - in: path
 *         name: modelId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Model ID
 *     responses:
 *       200:
 *         description: Model deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Model not found
 */
export async function deleteModel(req: Request, res: Response): Promise<void> {
  try {
    const providerId = parseInt(toString(req.params.providerId), 10);
    const modelId = parseInt(toString(req.params.modelId), 10);

    if (isNaN(providerId) || isNaN(modelId)) {
      badRequest(res, "Provider ID and Model ID must be numbers");
      return;
    }

    const existing = await configService.getModel(modelId);
    if (!existing || existing.providerId !== providerId) {
      notFound(res, `Model with id ${modelId} not found for provider ${providerId}`);
      return;
    }

    await configService.deleteModel(modelId);

    modelRegistry.forceRefresh();

    ok(res, { message: "Model deleted successfully" });
  } catch (error: any) {
    handleErrorWithAutoDetection(res, error, "delete model");
  }
}

/**
 * 查询模型（跨提供商）
 * GET /api/llm/models?type=nlp&enabled=true
 *
 * @swagger
 * /api/llm/models:
 *   get:
 *     summary: Query models across providers
 *     description: Returns models filtered by type and other criteria
 *     tags: [Models]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [nlp, embedding, rerank, tts, vision]
 *         description: Filter by model type
 *       - in: query
 *         name: enabled
 *         schema:
 *           type: boolean
 *         description: Filter by enabled status
 *       - in: query
 *         name: default
 *         schema:
 *           type: boolean
 *         description: Filter by default model status
 *     responses:
 *       200:
 *         description: List of models matching the query
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: number
 *                 models:
 *                   type: array
 *                   items:
 *                     type: object
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

    const models = await configService.listModels(params);

    ok(res, {
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
  } catch (error: any) {
    logger.error("❌ Failed to query models:", error);
    serverError(res, error, "Failed to query models");
  }
}

/**
 * 获取默认模型
 * GET /api/llm/models/default?type=embedding
 *
 * @swagger
 * /api/llm/models/default:
 *   get:
 *     summary: Get default model for a type
 *     description: Returns the default model configured for a specific type
 *     tags: [Models]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [nlp, embedding, rerank, tts, vision]
 *         description: Model type
 *     responses:
 *       200:
 *         description: Default model details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 model:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     providerId:
 *                       type: integer
 *                     provider:
 *                       type: string
 *                     providerName:
 *                       type: string
 *                     modelKey:
 *                       type: string
 *                     modelName:
 *                       type: string
 *                     modelType:
 *                       type: string
 *       400:
 *         description: Type parameter required
 *       404:
 *         description: No default model configured
 */
export async function getDefaultModel(req: Request, res: Response): Promise<void> {
  try {
    const type = req.query.type as string;

    if (!type) {
      badRequest(res, "type query parameter is required");
      return;
    }

    if (!Object.values(LLMModelType).includes(type as LLMModelType)) {
      badRequest(res, `Model type must be one of: ${Object.values(LLMModelType).join(", ")}`);
      return;
    }

    const model = modelRegistry.getDefaultModel(type as LLMModelType);

    if (!model) {
      notFound(res, `No default model configured for type: ${type}`);
      return;
    }

    ok(res, {
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
  } catch (error: any) {
    logger.error("❌ Failed to get default model:", error);
    serverError(res, error, "Failed to get default model");
  }
}
