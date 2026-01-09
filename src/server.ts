/**
 * ApexBridge Server - 主服务器入口（ABP-only）
 */

// 加载环境变量（必须在其他导入之前）
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import express from "express";
import cors from "cors";
import { Server } from "http";
import { WebSocketServer } from "ws";
import { ProtocolEngine, ExtendedAdminConfig } from "./core/ProtocolEngine";
// 向后兼容
import { LLMManager as LLMClient } from "./core/LLMManager";
import { EventBus } from "./core/EventBus";
import { ChatService } from "./services/ChatService";
import { ChatController } from "./api/controllers/ChatController";
import { authMiddleware } from "./api/middleware/authMiddleware";
import { rateLimitMiddleware } from "./api/middleware/rateLimitMiddleware";
import { errorHandler } from "./api/middleware/errorHandler";
import { logger } from "./utils/logger";
import type { AdminConfig } from "./services/ConfigService";
import { WebSocketManager } from "./api/websocket/WebSocketManager";
import { ChatChannel } from "./api/websocket/channels/ChatChannel";
import { ConfigService } from "./services/ConfigService";
import { PathService } from "./services/PathService";
import { ToolRetrievalService } from "./services/ToolRetrievalService";

// 验证中间件
import { initializeCustomValidators } from "./api/middleware/customValidators";
import { createValidationMiddleware } from "./api/middleware/validationMiddleware";
import {
  chatCompletionSchema,
  modelsListSchema,
  interruptRequestSchema,
  simpleStreamSchema,
  validateModelBeforeAddSchema,
} from "./api/middleware/validationSchemas";
// 清理中间件
import { createSanitizationMiddleware } from "./api/middleware/sanitizationMiddleware";
// 安全头中间件
import { createSecurityHeadersMiddleware } from "./api/middleware/securityHeadersMiddleware";
// 安全日志中间件
import { createSecurityLoggerMiddleware } from "./api/middleware/securityLoggerMiddleware";
// 审计日志中间件
import { createAuditLoggerMiddleware } from "./api/middleware/auditLoggerMiddleware";
// Skills管理路由
import skillRoutes from "./api/routes/skillRoutes";
// MCP管理路由
import mcpRoutes from "./api/routes/mcpRoutes";

export class ABPIntelliCore {
  private app: express.Application;
  private server: Server;
  private wss: WebSocketServer | null = null;
  private protocolEngine: ProtocolEngine | null = null;
  private llmClient: LLMClient | null = null;
  private eventBus: EventBus;
  private chatService: ChatService | null = null;
  private websocketManager: WebSocketManager | null = null;
  private chatChannel: ChatChannel | null = null;
  private configService: ConfigService;

  constructor() {
    this.app = express();
    this.server = new Server(this.app);
    this.eventBus = EventBus.getInstance();
    this.configService = ConfigService.getInstance();

    logger.info("🧠 ApexBridge Server initializing...");
  }

  async initialize(): Promise<void> {
    try {
      // 1. 基础服务初始化 (Config, Path, DB)
      const pathService = PathService.getInstance();
      pathService.ensureAllDirs();
      logger.debug("✅ All required directories ensured");

      // 统一使用 getFullConfig 读取配置（env 优先）
      const fullConfig = this.configService.getFullConfig();
      const config = this.configService.readConfig();

      // 创建 ExtendedAdminConfig（合并系统级和应用级配置）
      const extendedConfig: ExtendedAdminConfig = {
        ...config,
        port: fullConfig.port,
        maxRequestSize: fullConfig.environment.maxRequestSize,
      } as ExtendedAdminConfig;

      // 验证系统级配置（环境变量）
      const systemValidation = this.configService.validateSystemConfig();
      if (!systemValidation.valid) {
        logger.error("❌ System configuration errors:");
        systemValidation.errors.forEach((err) => logger.error(`   - ${err}`));
        throw new Error("System configuration validation failed");
      }
      if (systemValidation.warnings.length > 0) {
        systemValidation.warnings.forEach((warn) => logger.warn(`⚠️ ${warn}`));
      }

      // 验证应用级配置（如果设置未完成，跳过严格验证）
      if (!this.configService.isSetupCompleted()) {
        logger.warn("⚠️ Configuration not fully setup (missing API Key)");
      } else {
        const validation = this.configService.validateConfig(config);
        if (!validation.valid) {
          throw new Error(`Configuration errors:\n${validation.errors.join("\n")}`);
        }
      }
      logger.debug("✅ Configuration loaded");

      // 初始化LLM配置服务（确保SQLite数据库和表已创建）
      const { LLMConfigService } = await import("./services/LLMConfigService");
      LLMConfigService.getInstance(); // 触发 DB 初始化
      logger.debug("✅ LLMConfigService initialized");

      // 初始化SkillManager（确保在ChatService之前）
      const { SkillManager } = await import("./services/SkillManager");
      const skillManager = SkillManager.getInstance();

      // 等待Skills索引初始化完成
      await skillManager.waitForInitialization();
      logger.debug("✅ SkillManager initialized");

      // 从数据库加载已注册的MCP服务器
      const { mcpIntegration } = await import("./services/MCPIntegrationService");
      await mcpIntegration.loadServersFromDatabase();
      logger.debug("✅ MCP servers loaded from database");

      // 2. 核心引擎初始化
      this.protocolEngine = new ProtocolEngine(extendedConfig);
      await this.protocolEngine.initialize();
      logger.debug("✅ Protocol Engine initialized");

      // 3. 业务服务初始化 (ChatService)
      const { LLMManager } = await import("./core/LLMManager");
      const llmManager = new LLMManager();
      logger.debug("✅ LLMManager initialized");

      // 使用工厂创建 ChatService
      const { ChatServiceFactory } = await import("./services/chat/ChatServiceFactory");
      const factory = new ChatServiceFactory();
      this.chatService = factory.create(this.protocolEngine, llmManager, this.eventBus);
      logger.debug("✅ ChatService initialized (created via factory)");

      // 4. 接口层初始化 (WebSocket & HTTP Routes)
      // ⚠️ 关键调整：先初始化 ChatService，再初始化 WS，最后绑定 Server
      this.setupWebSocket(extendedConfig);

      // 注入 WS Manager 到 ChatService
      if (this.websocketManager) {
        this.chatService.setWebSocketManager(this.websocketManager);
      }

      // 5. 设置中间件
      this.setupMiddleware();

      // 6. 设置路由
      await this.setupRoutes();

      // 7. 启动HTTP服务器（所有初始化完成后才启动）
      const apiHost = extendedConfig.api?.host || "0.0.0.0";
      const apiPort = fullConfig.port; // ✅ 从系统配置读取
      this.server.listen(apiPort, apiHost, () => {
        logger.info(`🚀 ApexBridge running on http://${apiHost}:${apiPort}`);
      });

      // 8. 设置优雅关闭
      this.setupGracefulShutdown();
    } catch (error) {
      logger.error("❌ Failed to initialize ApexBridge:", error);
      process.exit(1);
    }
  }

  private setupMiddleware(): void {
    // 初始化自定义验证器（在中间件之前）
    initializeCustomValidators();

    // 安全headers（配置 Helmet.js）
    this.app.use(createSecurityHeadersMiddleware());

    // CORS
    this.app.use(
      cors({
        origin: (origin, callback) => {
          // 允许所有来源（生产环境应该配置具体来源）
          callback(null, true);
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
        exposedHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
      })
    );

    // Body解析
    this.app.use(express.json({ limit: process.env.MAX_REQUEST_SIZE || "100mb" })); // ✅ 增加到 100MB
    this.app.use(express.urlencoded({ extended: true, limit: "100mb" }));

    // 🔍 DEBUG: 在最早的地方记录请求
    this.app.use((req, res, next) => {
      if (req.path === "/v1/chat/completions" && req.method === "POST") {
        logger.debug(`[Server] Received POST /v1/chat/completions`);
        logger.debug(`[Server] Body present: ${!!req.body}`);
        logger.debug(`[Server] Content-Type: ${req.headers["content-type"]}`);
        if (req.body?.messages) {
          logger.debug(`[Server] Messages count: ${req.body.messages.length}`);
          const multimodal = req.body.messages.filter(
            (m: any) =>
              Array.isArray(m.content) && m.content.some((p: any) => p.type === "image_url")
          ).length;
          logger.debug(`[Server] Multimodal messages: ${multimodal}`);
        }
      }
      next();
    });

    // 限流保护
    this.app.use(rateLimitMiddleware);

    // 输入清理（在验证之前，清理潜在危险字符）
    this.app.use(
      createSanitizationMiddleware({
        skipFields: ["password", "apiKey", "token", "url"], // ✅ 跳过 url 字段（包括 image_url.url）
      })
    );

    const securityLogEnvLevel = (process.env.SECURITY_LOG_LEVEL || "warn").toLowerCase();
    const allowedLevels = new Set(["debug", "info", "warn", "error", "off"]);
    const normalizedLogLevel = allowedLevels.has(securityLogEnvLevel)
      ? (securityLogEnvLevel as "debug" | "info" | "warn" | "error" | "off")
      : "warn";
    const securityLogEnabled =
      process.env.SECURITY_LOG_ENABLED !== "false" && normalizedLogLevel !== "off";

    logger.info(`[SecurityLogger] enabled=${securityLogEnabled} level=${normalizedLogLevel}`);

    // 安全日志中间件（记录安全相关事件）
    this.app.use(createSecurityLoggerMiddleware());

    // 审计日志中间件（记录关键操作）
    this.app.use(createAuditLoggerMiddleware());

    // 认证中间件
    this.app.use(authMiddleware);
  }

  private async setupRoutes(): Promise<void> {
    if (!this.protocolEngine) {
      throw new Error("Protocol Engine not initialized");
    }

    if (!this.chatService) {
      throw new Error("ChatService must be initialized before setting up routes");
    }

    // LLMClient采用懒加载机制，不在启动时初始化
    // 首次使用时（如聊天请求）会自动创建 LLMManager 实例（从 SQLite 加载配置）

    // 注册聊天API
    // 创建控制器（LLMClient采用懒加载）
    const chatController = new ChatController(this.chatService, null as any);

    // 聊天API（临时禁用 AJV 验证中间件，只使用 parseChatRequest）
    this.app.post(
      "/v1/chat/completions",
      // createValidationMiddleware(chatCompletionSchema),  // ❌ 临时禁用：可能截断大型图片数据
      (req, res) => chatController.chatCompletions(req, res)
    );

    // 🆕 简化版流式聊天接口（专为前端看板娘设计）
    this.app.post(
      "/v1/chat/simple-stream",
      createValidationMiddleware(simpleStreamSchema),
      (req, res) => chatController.simpleChatStream(req, res)
    );

    // 🆕 会话管理API
    // ⚠️ 重要：更具体的路由必须在参数化路由之前注册

    // 🆕 获取活动会话列表（必须在 /:conversationId 之前）
    this.app.get("/v1/chat/sessions/active", (req, res) =>
      chatController.getActiveSessions(req, res)
    );

    // 🆕 获取会话历史（ACE Engine 内部日志，必须在 /:conversationId 之前）
    this.app.get("/v1/chat/sessions/:conversationId/history", (req, res) =>
      chatController.getSessionHistory(req, res)
    );

    // 🆕 获取对话消息历史（用户对话消息，必须在 /:conversationId 之前）
    this.app.get("/v1/chat/sessions/:conversationId/messages", (req, res) =>
      chatController.getConversationMessages(req, res)
    );

    // 获取单个会话（参数化路由，放在最后）
    this.app.get("/v1/chat/sessions/:conversationId", (req, res) =>
      chatController.getSession(req, res)
    );

    // 删除会话
    this.app.delete("/v1/chat/sessions/:conversationId", (req, res) =>
      chatController.deleteSession(req, res)
    );

    // 模型列表API（添加验证中间件）
    this.app.get("/v1/models", createValidationMiddleware(modelsListSchema), (req, res) =>
      chatController.getModels(req, res)
    );

    // 请求中断API（添加验证中间件）
    this.app.post("/v1/interrupt", createValidationMiddleware(interruptRequestSchema), (req, res) =>
      chatController.interruptRequest(req, res)
    );

    // LLM 配置管理 API（两级结构：提供商 + 模型）
    const ProviderController = await import("./api/controllers/ProviderController");
    const ModelController = await import("./api/controllers/ModelController");

    // 提供商管理
    this.app.get("/api/llm/providers", ProviderController.listProviders);
    this.app.get("/api/llm/providers/adapters", ProviderController.listAdapters);
    this.app.get("/api/llm/providers/:id", ProviderController.getProvider);
    this.app.post("/api/llm/providers/test-connect", ProviderController.testProviderConnection);
    this.app.post(
      "/api/llm/providers/validate-model",
      createValidationMiddleware(validateModelBeforeAddSchema),
      ProviderController.validateModelBeforeAdd
    );
    this.app.post("/api/llm/providers", ProviderController.createProvider);
    this.app.put("/api/llm/providers/:id", ProviderController.updateProvider);
    this.app.delete("/api/llm/providers/:id", ProviderController.deleteProvider);

    // 模型管理
    this.app.get("/api/llm/providers/:providerId/models", ModelController.listProviderModels);
    this.app.get("/api/llm/providers/:providerId/models/:modelId", ModelController.getModel);
    this.app.post("/api/llm/providers/:providerId/models", ModelController.createModel);
    this.app.put("/api/llm/providers/:providerId/models/:modelId", ModelController.updateModel);
    this.app.delete("/api/llm/providers/:providerId/models/:modelId", ModelController.deleteModel);

    // 模型查询（跨提供商）
    this.app.get("/api/llm/models", ModelController.queryModels);
    this.app.get("/api/llm/models/default", ModelController.getDefaultModel);

    /**
     * Skills管理API
     * 管理skills的生命周期：安装、卸载、查询
     */
    this.app.use("/api/skills", skillRoutes);

    /**
     * MCP管理API
     * 管理MCP服务器的生命周期：注册、注销、工具调用
     */
    this.app.use("/api/mcp", mcpRoutes);

    /**
     * 健康检查
     */
    this.app.get("/health", (req, res) => {
      res.json({
        status: "ok",
        version: "2.0.0",
        uptime: process.uptime(),
        plugins: this.protocolEngine!.getPluginCount(),
        activeRequests: this.chatService?.getActiveRequestCount() || 0,
      });
    });

    // 错误处理（必须最后注册）
    this.app.use(errorHandler);

    logger.debug("✅ Routes configured");
  }

  /**
   * 设置WebSocket服务器（使用独立实现）
   */
  private setupWebSocket(config: AdminConfig): void {
    if (!this.chatService) {
      throw new Error("ChatService must be initialized before WebSocket");
    }

    try {
      this.chatChannel = new ChatChannel(this.chatService);
      this.websocketManager = new WebSocketManager(config, this.chatChannel);
      this.websocketManager.initialize(this.server);
      logger.debug("✅ WebSocket server ready");
    } catch (error) {
      logger.error("❌ Failed to setup WebSocket server:", error);
      throw error;
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`\n🛑 Received ${signal}, shutting down gracefully...`);

      // 停止接受新请求
      this.server.close(() => {
        logger.info("✅ HTTP server closed");
      });

      // 关闭WebSocket
      if (this.websocketManager) {
        await this.websocketManager.shutdown();
      }

      // 停止 ChatService 清理定时器
      if (this.chatService) {
        this.chatService.stopCleanupTimer();
        logger.info("✅ ChatService cleanup timer stopped");
      }

      // 关闭协议引擎
      if (this.protocolEngine) {
        await this.protocolEngine.shutdown();
      }

      // 关闭MCP服务
      const { mcpIntegration } = await import("./services/MCPIntegrationService");
      await mcpIntegration.shutdown();

      logger.info("👋 ApexBridge shut down successfully");
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  }
}

// 启动服务器（ABP-only）
const shouldAutostart = process.env.APEX_BRIDGE_AUTOSTART !== "false";
if (shouldAutostart) {
  const server = new ABPIntelliCore();
  server.initialize().catch((error) => {
    logger.error("💥 Fatal error during initialization:", error);
    process.exit(1);
  });
}
