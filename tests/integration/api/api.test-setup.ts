/**
 * API Integration Test Setup
 * Test configuration, mocks, and utilities for API testing
 */

import express, { Express, Request, Response, NextFunction } from "express";
import supertest from "supertest";
import { sendOk, sendCreated } from "@/utils/http-response";

const request = supertest;

process.env.NODE_ENV = "test";
process.env.APEX_BRIDGE_AUTOSTART = "false";
process.env.LOG_LEVEL = "error";

export const TEST_API_KEY = "test-api-key-12345";
export const TEST_API_KEY_ID = "test-key-id";

export interface TestConfig {
  port: number;
  authEnabled: boolean;
  apiKeys: Array<{ id: string; key: string; name: string; enabled: boolean }>;
}

export const defaultTestConfig: TestConfig = {
  port: 0,
  authEnabled: true,
  apiKeys: [
    {
      id: TEST_API_KEY_ID,
      key: TEST_API_KEY,
      name: "Test API Key",
      enabled: true,
    },
  ],
};

export function createMockConfig(overrides: Partial<TestConfig> = {}): TestConfig {
  return { ...defaultTestConfig, ...overrides };
}

function mockRateLimitMiddleware(_req: Request, _res: Response, next: NextFunction): void {
  next();
}

function mockSecurityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
}

function mockSanitizationMiddleware(_req: Request, _res: Response, next: NextFunction): void {
  next();
}

function mockSecurityLoggerMiddleware(_req: Request, _res: Response, next: NextFunction): void {
  next();
}

function mockAuditLoggerMiddleware(_req: Request, _res: Response, next: NextFunction): void {
  next();
}

function mockMetricsMiddleware(_req: Request, _res: Response, next: NextFunction): void {
  next();
}

export function mockAuthMiddleware(config: TestConfig) {
  return function (req: Request, res: Response, next: NextFunction): void {
    if (!config.authEnabled) {
      return next();
    }

    const publicPaths = ["/health", "/metrics", "/openapi.json", "/api-docs", "/api/mcp/health"];
    if (publicPaths.includes(req.path)) {
      return next();
    }

    if (/\.(svg|ico|png|jpg|jpeg|gif|css|js|woff|woff2|ttf|eot)$/i.test(req.path)) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({
        error: {
          message: "Missing Authorization header",
          type: "authentication_error",
          code: "UNAUTHORIZED",
        },
      });
      return;
    }

    const tsendOken = authHeader.replace("Bearer ", "");
    const matchedKey = config.apiKeys.find((apiKey) => apiKey.key === tsendOken);

    if (!matchedKey || !matchedKey.enabled) {
      res.status(401).json({
        error: {
          message: "Invalid API key",
          type: "authentication_error",
          code: "UNAUTHORIZED",
        },
      });
      return;
    }

    (req as any).auth = { apiKeyId: matchedKey.id };
    next();
  };
}

function mockErrorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const errorMessage = err instanceof Error ? err.message : "Unknown error";
  const statusCode = (err as any)?.statusCode || 500;

  res.status(statusCode).json({
    error: {
      message: errorMessage,
      type: statusCode >= 500 ? "server_error" : "invalid_request",
      code: (err as any)?.code || "INTERNAL_ERROR",
    },
  });
}

export function createMockChatService() {
  return {
    processMessage: async () => ({
      content: "Test response",
      usage: { prompt_tsendOkens: 10, completion_tsendOkens: 20, total_tsendOkens: 30 },
    }),
    streamMessage: async function* () {
      yield '__ANSWER__:{"content":"Test"}\n\n';
      yield "data: [DONE]\n\n";
    },
    interruptRequest: async () => true,
    endSession: async () => undefined,
    getSessionIdByConversationId: () => "test-session-id",
    getConversationMessageCount: async () => 5,
    getConversationLastMessage: async () => ({
      content: "Last message",
      sendCreated_at: Date.now(),
    }),
    getConversationFirstMessage: async () => ({
      content: "First message",
      sendCreated_at: Date.now() - 10000,
    }),
    getAllConversationsWithHistory: async () => ["conv-1", "conv-2"],
    getConversationHistory: async () => [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ],
    getActiveRequestCount: () => 0,
    setWebSocketManager: () => {},
    stopCleanupTimer: () => {},
  };
}

export function createMockLLMConfigService() {
  const providers: Map<number, any> = new Map();
  const models: Map<number, any[]> = new Map();
  let providerIdCounter = 1;
  let modelIdCounter = 1;

  return {
    listProviders: async () => [],
    getProvider: async () => null,
    createProvider: (input: any) => {
      const provider = {
        id: providerIdCounter++,
        ...input,
        sendCreatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      providers.set(provider.id, provider);
      models.set(provider.id, []);
      return provider;
    },
    updateProvider: (id: number, input: any) => {
      const provider = providers.get(id);
      if (!provider) return null;
      const updated = { ...provider, ...input, updatedAt: new Date().toISOString() };
      providers.set(id, updated);
      return updated;
    },
    deleteProvider: async () => true,
    getProviderModels: (providerId: number) => models.get(providerId) || [],
    listModels: async () => [],
    getModel: async () => null,
    createModel: (providerId: number, input: any) => {
      const model = {
        id: modelIdCounter++,
        providerId,
        ...input,
        sendCreatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const providerModels = models.get(providerId) || [];
      providerModels.push(model);
      models.set(providerId, providerModels);
      return model;
    },
    updateModel: (id: number, input: any) => {
      for (const [providerId, providerModels] of models.entries()) {
        const modelIndex = providerModels.findIndex((m) => m.id === id);
        if (modelIndex !== -1) {
          const updated = {
            ...providerModels[modelIndex],
            ...input,
            updatedAt: new Date().toISOString(),
          };
          providerModels[modelIndex] = updated;
          return updated;
        }
      }
      return null;
    },
    deleteModel: async () => true,
    initializeDefaultProviders: () => {},
  };
}

export function createMockSkillManager() {
  return {
    listSkills: async () => ({
      skills: [],
      total: 0,
      page: 1,
      limit: 50,
      totalPages: 0,
    }),
    getSkillByName: async () => null,
    isSkillExist: async () => false,
    getStatistics: async () => ({
      totalSkills: 0,
      enabledSkills: 0,
      disabledSkills: 0,
    }),
    installSkill: async () => ({
      skillName: "test-skill",
      installedAt: new Date().toISOString(),
      duration: 100,
      vectorized: true,
    }),
    uninstallSkill: async () => ({
      skillName: "test-skill",
      uninstalledAt: new Date().toISOString(),
      duration: 50,
    }),
    updateSkill: async () => ({
      skillName: "test-skill",
      updatedAt: new Date().toISOString(),
      duration: 30,
      reindexed: true,
    }),
    waitForInitialization: async () => undefined,
    refreshIndex: async () => undefined,
  };
}

export function createMockMCPIntegration() {
  return {
    getServers: () => [],
    getServer: () => null,
    registerServer: async () => ({ success: true, serverId: "test-server" }),
    unregisterServer: async () => true,
    restartServer: async () => true,
    getServerStatus: () => null,
    callTool: async () => ({ result: "test-result" }),
    getStatistics: () => ({
      totalServers: 0,
      runningServers: 0,
      totalTools: 0,
    }),
    healthCheck: async () => ({ healthy: true, details: {} }),
    loadServersFromDatabase: async () => undefined,
    shutdown: async () => undefined,
  };
}

export function createMockModelRegistry() {
  return {
    getDefaultModel: () => null,
    getAllModels: () => [],
    forceRefresh: () => {},
    refresh: () => {},
  };
}

export function createMockLLMManager() {
  return {
    getAllModels: async () => [],
    getDefaultModel: () => null,
    chat: async () => ({
      id: "test-id",
      object: "chat.completion",
      sendCreated: Date.now(),
      model: "test-model",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Test response" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tsendOkens: 10, completion_tsendOkens: 20, total_tsendOkens: 30 },
    }),
  };
}

export function createMockLLMAdapterFactory() {
  return {
    getSupportedAdapters: () => [
      { id: "openai", name: "OpenAI", features: ["streaming", "function-calling"] },
      { id: "claude", name: "Claude", features: ["streaming", "function-calling"] },
      { id: "deepseek", name: "DeepSeek", features: ["streaming"] },
      { id: "ollama", name: "Ollama", features: ["local", "streaming"] },
    ],
    create: () => ({
      chat: async () => ({
        id: "test-id",
        choices: [{ message: { content: "Test" } }],
      }),
      getModels: async () => [],
      embed: async () => [0.1, 0.2, 0.3],
    }),
  };
}

export interface TestApp {
  app: Express;
  request: any;
  config: TestConfig;
  mocks: {
    chatService: ReturnType<typeof createMockChatService>;
    llmConfigService: ReturnType<typeof createMockLLMConfigService>;
    skillManager: ReturnType<typeof createMockSkillManager>;
    mcpIntegration: ReturnType<typeof createMockMCPIntegration>;
    modelRegistry: ReturnType<typeof createMockModelRegistry>;
    llmManager: ReturnType<typeof createMockLLMManager>;
    adapterFactory: ReturnType<typeof createMockLLMAdapterFactory>;
  };
}

export function createTestApp(config: TestConfig = defaultTestConfig): TestApp {
  const app = express();

  app.use(express.json());
  app.use(mockSecurityHeadersMiddleware);
  app.use(mockRateLimitMiddleware);
  app.use(mockSanitizationMiddleware);
  app.use(mockSecurityLoggerMiddleware);
  app.use(mockAuditLoggerMiddleware);
  app.use(mockMetricsMiddleware);
  app.use(mockAuthMiddleware(config));

  const mocks = {
    chatService: createMockChatService(),
    llmConfigService: createMockLLMConfigService(),
    skillManager: createMockSkillManager(),
    mcpIntegration: createMockMCPIntegration(),
    modelRegistry: createMockModelRegistry(),
    llmManager: createMockLLMManager(),
    adapterFactory: createMockLLMAdapterFactory(),
  };

  app.set("chatService", mocks.chatService);
  app.set("llmConfigService", mocks.llmConfigService);
  app.set("skillManager", mocks.skillManager);
  app.set("mcpIntegration", mocks.mcpIntegration);
  app.set("modelRegistry", mocks.modelRegistry);
  app.set("llmManager", mocks.llmManager);
  app.set("adapterFactory", mocks.adapterFactory);

  function badRequest(res: Response, message: string) {
    res.status(400).json({
      error: { message, type: "invalid_request", code: "BAD_REQUEST" },
    });
  }

  function notFound(res: Response, message: string) {
    res.status(404).json({
      error: { message, type: "invalid_request", code: "NOT_FOUND" },
    });
  }

  function unauthorized(res: Response, message: string) {
    res.status(401).json({
      error: { message, type: "authentication_error", code: "UNAUTHORIZED" },
    });
  }

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      version: "2.0.0",
      uptime: 0,
      plugins: 0,
      activeRequests: 0,
    });
  });

  app.get("/openapi.json", (_req, res) => {
    res.json({ openapi: "3.0.0", paths: {}, info: { title: "ApexBridge", version: "2.0.0" } });
  });

  app.post("/v1/chat/completions", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    const { messages, model } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return badRequest(res, "messages is required and must be an array");
    }
    sendOk(res, {
      id: "chatcmpl-test",
      object: "chat.completion",
      sendCreated: Date.now(),
      model: model || "gpt-4",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Test response" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tsendOkens: 10, completion_tsendOkens: 20, total_tsendOkens: 30 },
    });
  });

  app.get("/v1/models", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    sendOk(res, { object: "list", data: [] });
  });

  app.post("/v1/interrupt", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    const { requestId } = req.body;
    if (!requestId) {
      return badRequest(res, "Missing requestId");
    }
    sendOk(res, { requestId, interrupted: true, success: true });
  });

  app.get("/v1/chat/sessions/active", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    sendOk(res, { sessions: [], total: 0 });
  });

  app.get("/v1/chat/sessions/:conversationId", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    const { conversationId } = req.params;
    if (!conversationId) {
      return badRequest(res, "conversationId is required");
    }
    sendOk(res, {
      conversationId,
      sessionId: "test-session-id",
      status: "active",
      messageCount: 5,
    });
  });

  app.get("/v1/chat/sessions/:conversationId/messages", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    const { conversationId } = req.params;
    const { limit = 100, offset = 0 } = req.query;
    if (!conversationId) {
      return badRequest(res, "conversationId is required");
    }
    sendOk(res, {
      messages: [],
      total: 0,
      limit: Number(limit),
      offset: Number(offset),
    });
  });

  app.delete("/v1/chat/sessions/:conversationId", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    const { conversationId } = req.params;
    if (!conversationId) {
      return badRequest(res, "conversationId is required");
    }
    sendOk(res, { success: true, message: "Session deleted" });
  });

  app.get("/api/llm/providers", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    sendOk(res, { providers: [] });
  });

  app.get("/api/llm/providers/adapters", (_req, res) => {
    sendOk(res, { adapters: mocks.adapterFactory.getSupportedAdapters() });
  });

  app.get("/api/llm/providers/:id", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return badRequest(res, "Provider ID must be a number");
    }
    if (id === 99999) {
      return notFound(res, `Provider with id ${id} not found`);
    }
    sendOk(res, { provider: { id, name: "Test Provider" } });
  });

  app.post("/api/llm/providers", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    const { provider, name, baseConfig } = req.body;
    if (!provider || !name || !baseConfig) {
      return badRequest(res, "provider, name, and baseConfig are required");
    }
    const newProvider = mocks.llmConfigService.createProvider(req.body);
    sendCreated(res, { provider: newProvider });
  });

  app.put("/api/llm/providers/:id", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return badRequest(res, "Provider ID must be a number");
    }
    if (Object.keys(req.body).length === 0) {
      return badRequest(res, "At least one field must be provided");
    }
    sendOk(res, { provider: { id, ...req.body } });
  });

  app.delete("/api/llm/providers/:id", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return badRequest(res, "Provider ID must be a number");
    }
    if (id === 99999) {
      return notFound(res, `Provider with id ${id} not found`);
    }
    sendOk(res, { message: "Provider deleted" });
  });

  app.post("/api/llm/providers/test-connect", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    const { provider, baseConfig } = req.body;
    if (!provider || !baseConfig) {
      return badRequest(res, "Missing required parameters: provider or baseConfig");
    }
    sendOk(res, { success: true, latency: 100, message: "Connection successful" });
  });

  app.get("/api/llm/models", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    sendOk(res, { models: [], count: 0 });
  });

  app.get("/api/llm/models/default", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    const { type } = req.query;
    if (!type) {
      return badRequest(res, "type query parameter is required");
    }
    const validTypes = ["nlp", "embedding", "rerank"];
    if (!validTypes.includes(type as string)) {
      return badRequest(res, `Model type must be one of: ${validTypes.join(", ")}`);
    }
    sendOk(res, { model: null });
  });

  app.get("/api/llm/providers/:providerId/models", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    const providerId = parseInt(req.params.providerId, 10);
    if (isNaN(providerId)) {
      return badRequest(res, "Provider ID must be a number");
    }
    if (providerId === 99999) {
      return notFound(res, `Provider with id ${providerId} not found`);
    }
    sendOk(res, { models: [] });
  });

  app.get("/api/llm/providers/:providerId/models/:modelId", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    const providerId = parseInt(req.params.providerId, 10);
    const modelId = parseInt(req.params.modelId, 10);
    if (isNaN(providerId) || isNaN(modelId)) {
      return badRequest(res, "Provider ID and Model ID must be numbers");
    }
    if (modelId === 99999) {
      return notFound(res, `Model with id ${modelId} not found`);
    }
    sendOk(res, { model: { id: modelId, providerId } });
  });

  app.post("/api/llm/providers/:providerId/models", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    const providerId = parseInt(req.params.providerId, 10);
    if (isNaN(providerId)) {
      return badRequest(res, "Provider ID must be a number");
    }
    const { modelKey, modelName, modelType } = req.body;
    if (!modelKey || !modelName || !modelType) {
      return badRequest(res, "modelKey, modelName, and modelType are required");
    }
    if (providerId === 99999) {
      return notFound(res, `Provider with id ${providerId} not found`);
    }
    const newModel = mocks.llmConfigService.createModel(providerId, req.body);
    sendCreated(res, newModel);
  });

  app.put("/api/llm/providers/:providerId/models/:modelId", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    const providerId = parseInt(req.params.providerId, 10);
    const modelId = parseInt(req.params.modelId, 10);
    if (isNaN(providerId) || isNaN(modelId)) {
      return badRequest(res, "Provider ID and Model ID must be numbers");
    }
    if (Object.keys(req.body).length === 0) {
      return badRequest(res, "At least one field must be provided");
    }
    sendOk(res, { id: modelId, providerId, ...req.body });
  });

  app.delete("/api/llm/providers/:providerId/models/:modelId", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    const providerId = parseInt(req.params.providerId, 10);
    const modelId = parseInt(req.params.modelId, 10);
    if (isNaN(providerId) || isNaN(modelId)) {
      return badRequest(res, "Provider ID and Model ID must be numbers");
    }
    if (modelId === 99999) {
      return notFound(res, `Model with id ${modelId} not found`);
    }
    sendOk(res, { message: "Model deleted" });
  });

  app.get("/api/skills", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    const { page = 1, limit = 50, name } = req.query;
    sendOk(res, {
      skills: [],
      pagination: { total: 0, page: Number(page), limit: Number(limit), totalPages: 0 },
    });
  });

  app.get("/api/skills/stats", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    sendOk(res, { totalSkills: 0, enabledSkills: 0, disabledSkills: 0 });
  });

  app.get("/api/skills/:name/exists", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    sendOk(res, { name: req.params.name, exists: true });
  });

  app.get("/api/skills/:name", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    const { name } = req.params;
    if (name === "non-existent-skill") {
      return notFound(res, `Skill '${name}' not found`);
    }
    sendOk(res, { name, description: "Test skill" });
  });

  app.post("/api/skills/reindex", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    sendOk(res, { message: "All skills reindexed successfully" });
  });

  app.delete("/api/skills/:name", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    const { name } = req.params;
    if (name === "non-existent-skill") {
      return notFound(res, `Skill '${name}' not found`);
    }
    sendOk(res, { skillName: name });
  });

  app.put("/api/skills/:name/description", (req, res) => {
    if (!req.headers.authorization) {
      return unauthorized(res, "Missing Authorization header");
    }
    const { description } = req.body;
    if (!description) {
      return badRequest(res, "Description is required and must be a string");
    }
    sendOk(res, { skillName: req.params.name, reindexed: true });
  });

  app.get("/api/mcp/servers", (_req, res) => {
    sendOk(res, { servers: [], meta: { total: 0, timestamp: new Date().toISOString() } });
  });

  app.get("/api/mcp/servers/:serverId", (req, res) => {
    const { serverId } = req.params;
    if (serverId === "non-existent") {
      return notFound(res, `Server ${serverId} not found`);
    }
    sendOk(res, { server: { id: serverId } });
  });

  app.post("/api/mcp/servers", (req, res) => {
    const { id, type, command } = req.body;
    if (!id || !type || !command) {
      return badRequest(res, "Missing required fields: id, type, command");
    }
    sendCreated(res, { serverId: id });
  });

  app.delete("/api/mcp/servers/:serverId", (req, res) => {
    const { serverId } = req.params;
    if (serverId === "non-existent") {
      return notFound(res, `Server ${serverId} not found`);
    }
    sendOk(res, { serverId });
  });

  app.post("/api/mcp/servers/:serverId/restart", (req, res) => {
    const { serverId } = req.params;
    if (serverId === "non-existent") {
      return notFound(res, `Server ${serverId} not found`);
    }
    sendOk(res, { serverId, message: "Server restarted" });
  });

  app.get("/api/mcp/statistics", (_req, res) => {
    sendOk(res, { totalServers: 0, runningServers: 0, totalTools: 0 });
  });

  app.get("/api/mcp/health", async (_req, res) => {
    sendOk(res, { healthy: true, details: {} });
  });

  app.post("/api/mcp/servers/:serverId/tools/:toolName/call", (req, res) => {
    const { serverId, toolName } = req.params;
    if (!serverId || !toolName) {
      return badRequest(res, "Missing required parameters");
    }
    sendOk(res, { result: "test-result" });
  });

  app.use(mockErrorHandler);

  const testRequest = request(app);

  return {
    app,
    request: testRequest,
    config,
    mocks,
  };
}

export function createAuthenticatedRequest(testApp: TestApp) {
  return testApp.request.set("Authorization", `Bearer ${testApp.config.apiKeys[0].key}`);
}

export function generateTestProvider() {
  return {
    provider: "openai",
    name: "Test Provider",
    description: "Test provider for integration tests",
    enabled: true,
    baseConfig: {
      baseURL: "https://api.openai.com/v1",
      apiKey: "test-api-key",
      timeout: 30000,
      maxRetries: 3,
    },
  };
}

export function generateTestModel() {
  return {
    modelKey: "gpt-4",
    modelName: "GPT-4",
    modelType: "nlp",
    enabled: true,
    isDefault: false,
    modelConfig: {
      temperature: 0.7,
      maxTsendOkens: 4096,
    },
    displayOrder: 1,
  };
}

export function generateTestChatRequest(overrides: Record<string, any> = {}) {
  return {
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello, how are you?" },
    ],
    model: "gpt-4",
    stream: false,
    temperature: 0.7,
    max_tsendOkens: 100,
    ...overrides,
  };
}

export function expectSuccessResponse(response: any, minStatus = 200, maxStatus = 299) {
  expect(response.status).toBeGreaterThanOrEqual(minStatus);
  expect(response.status).toBeLessThanOrEqual(maxStatus);
}

export function expectErrorResponse(response: any, statusCode: number) {
  expect(response.status).toBe(statusCode);
  expect(response.body).toHaveProperty("error");
  expect(response.body.error).toHaveProperty("message");
}

export function expectUnauthorizedResponse(response: any) {
  expectErrorResponse(response, 401);
  expect(response.body.error.type).toBe("authentication_error");
  expect(response.body.error.code).toBe("UNAUTHORIZED");
}

export function expectNotFoundResponse(response: any) {
  expectErrorResponse(response, 404);
  expect(response.body.error.code).toBe("NOT_FOUND");
}

export function expectBadRequestResponse(response: any) {
  expectErrorResponse(response, 400);
  expect(response.body.error.type).toBe("invalid_request");
}
