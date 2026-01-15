/**
 * ProviderController - 提供商管理 API 控制器
 *
 * 管理 LLM 提供商的 CRUD 操作
 */

import { Request, Response } from "express";
import { LLMConfigService } from "../../services/LLMConfigService";
import { ModelRegistry } from "../../services/ModelRegistry";
import { CreateProviderInput, UpdateProviderInput } from "../../types/llm-models";
import { logger } from "../../utils/logger";
import { LLMAdapterFactory } from "../../core/llm/adapters/LLMAdapterFactory";
import {
  badRequest,
  notFound,
  created,
  ok,
  serverError,
  handleErrorWithAutoDetection,
} from "../../utils/http-response";

const configService = LLMConfigService.getInstance();
const modelRegistry = ModelRegistry.getInstance();

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
    updatedAt: provider.updatedAt,
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
    const providersWithStats = providers.map((p) => {
      const models = configService.getProviderModels(p.id);
      // ✅ 使用统一 DTO，确保响应结构一致
      return toProviderDTO(p, models.length);
    });

    res.json({
      success: true,
      providers: providersWithStats,
    });
  } catch (error: any) {
    handleErrorWithAutoDetection(res, error, "list providers");
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
      badRequest(res, "Provider ID must be a number");
      return;
    }

    const provider = configService.getProvider(id);

    if (!provider) {
      notFound(res, `Provider with id ${id} not found`);
      return;
    }

    const models = configService.getProviderModels(id);

    ok(res, {
      provider: toProviderDTO(provider, models.length),
    });
  } catch (error: any) {
    handleErrorWithAutoDetection(res, error, "get provider");
  }
}

/**
 * 创建提供商
 * POST /api/llm/providers
 */
export async function createProvider(req: Request, res: Response): Promise<void> {
  try {
    const input: CreateProviderInput = req.body;

    if (!input.provider || !input.name || !input.baseConfig) {
      badRequest(res, "provider, name, and baseConfig are required");
      return;
    }

    const newProvider = configService.createProvider(input);

    modelRegistry.forceRefresh();

    created(res, {
      provider: toProviderDTO(newProvider, 0),
    });
  } catch (error: any) {
    handleErrorWithAutoDetection(res, error, "create provider");
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
      badRequest(res, "Provider ID must be a number");
      return;
    }

    const input: UpdateProviderInput = req.body;

    if (Object.keys(input).length === 0) {
      badRequest(res, "At least one field must be provided");
      return;
    }

    const updatedProvider = configService.updateProvider(id, input);

    modelRegistry.forceRefresh();

    const models = configService.getProviderModels(id);

    ok(res, {
      provider: toProviderDTO(updatedProvider, models.length),
    });
  } catch (error: any) {
    handleErrorWithAutoDetection(res, error, "update provider");
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
      badRequest(res, "Provider ID must be a number");
      return;
    }

    configService.deleteProvider(id);

    modelRegistry.forceRefresh();

    ok(res, { message: "Provider and associated models deleted successfully" });
  } catch (error: any) {
    handleErrorWithAutoDetection(res, error, "delete provider");
  }
}

/**
 * 获取支持的适配器供应商列表
 * GET /api/llm/providers/adapters
 */
export async function listAdapters(req: Request, res: Response): Promise<void> {
  try {
    const adapters = LLMAdapterFactory.getSupportedAdapters();

    ok(res, { adapters });
  } catch (error: any) {
    logger.error("Failed to list adapters:", error);
    serverError(res, error, "Failed to list adapters");
  }
}

/**
 * 测试LLM提供商连接（仅测试服务商连通性）
 * POST /api/llm/providers/test-connect
 */
export async function testProviderConnection(req: Request, res: Response) {
  try {
    // 1. 直接从 Body 获取配置 (此时数据未入库)
    const { provider, baseConfig } = req.body;

    // 2. 基础校验
    if (!provider || !baseConfig) {
      badRequest(res, "Missing required parameters: provider or baseConfig");
      return;
    }

    // 3. 实例化适配器 (使用前端传来的临时配置)
    // 注意：这里不需要 defaultModel，因为我们只测服务连通性
    const adapter = LLMAdapterFactory.create(provider, baseConfig);

    const start = Date.now();

    // 4. 执行核心测试 (拉取模型列表)
    // 这一步能同时验证：网络通畅 + API Key 正确 + BaseURL 正确
    await adapter.getModels();

    // 5. 成功返回
    res.json({
      success: true,
      latency: Date.now() - start,
      message: "连接成功",
      details: {
        provider,
        testedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    // 6. 错误处理与智能提示
    const status = parseErrorStatus(error);
    const hint = getFailureHint(status, req.body.provider, req.body.baseConfig?.baseURL);

    res.status(status).json({
      success: false,
      message: error.message || "Connection failed",
      hint, //这字段可以让前端展示给用户，例如 "请检查 Ollama 是否启动"
    });
  }
}

/**
 * 新增模型前验证模型是否可用（使用临时配置进行测试）
 * POST /api/llm/providers/validate-model
 * 请求体: { provider: "openai", baseConfig: { apiKey: "xxx", baseURL: "xxx" }, model: "gpt-4" }
 */
export async function validateModelBeforeAdd(req: Request, res: Response) {
  const { provider, baseConfig, model } = req.body;

  // 1. 守卫语句：一行代码完成所有必填校验
  if (!provider || !baseConfig || !model) {
    return res
      .status(400)
      .json({ success: false, message: "Missing: provider, baseConfig, or model" });
  }

  try {
    // 2. 实例化 (仅内存操作，无网络请求)
    // 假设 Factory 内部已有简单的 provider 校验，报错会直接抛出进入 catch
    const adapter = LLMAdapterFactory.create(provider, { ...baseConfig, defaultModel: model });

    const start = Date.now();

    // 3. 唯一的网络交互 (Core)
    // 优化：max_tokens=1。只要模型能吐出 1 个字，就证明网络通、Key 对、模型存在。
    // 无需判断返回内容具体是什么，不报错就是成功。
    await adapter.chat([{ role: "user", content: "Hi" }], {
      model,
      max_tokens: 1,
      temperature: 0,
    });

    // 4. 成功返回
    res.json({
      success: true,
      latency: Date.now() - start,
      message: "连接成功",
    });
  } catch (error: any) {
    // 5. 错误收敛：将所有异常统一由辅助函数解析状态码
    const status = parseErrorStatus(error);
    res.status(status).json({ success: false, message: "Connection failed" });
  }
}

// --- 辅助函数：保持主逻辑干净 ---

function parseErrorStatus(error: any): number {
  const msg = error.message?.toLowerCase() || "";
  if (msg.includes("401") || msg.includes("auth")) return 401;
  if (msg.includes("403") || msg.includes("permission")) return 403;
  if (msg.includes("404") || msg.includes("not found")) return 404;
  if (msg.includes("429") || msg.includes("quota")) return 429;
  if (msg.includes("timeout")) return 504;
  return 500;
}

// --- 辅助函数：生成排查建议 (可选) ---
function getFailureHint(status: number, provider: string, url: string = ""): string | undefined {
  if (status === 502) {
    if (provider === "ollama") {
      return "无法连接到 Ollama。请检查：1. Ollama 是否已启动？ 2. 若在 Docker 中，请使用 http://host.docker.internal:11434/v1";
    }
    return "无法连接到服务器，请检查 Base URL 是否正确，或网络是否通畅。";
  }
  if (status === 401) return "鉴权失败，请检查 API Key 是否正确。";
  if (status === 404) return "接口路径错误。请检查 Base URL (通常应以 /v1 结尾)。";
  return undefined;
}
