/**
 * ApexBridge Server - 主服务器入口（ABP-only）
 */

import express from 'express';
import cors from 'cors';
import { Server } from 'http';
import { WebSocketServer } from 'ws';
import { ProtocolEngine } from './core/ProtocolEngine';
// 向后兼容
import { LLMManager as LLMClient } from './core/LLMManager';
import { EventBus } from './core/EventBus';
import { ChatService } from './services/ChatService';
import { ChatController } from './api/controllers/ChatController';
import { authMiddleware } from './api/middleware/authMiddleware';
import { rateLimitMiddleware } from './api/middleware/rateLimitMiddleware';
import { errorHandler } from './api/middleware/errorHandler';
import { logger } from './utils/logger';
import type { AdminConfig } from './services/ConfigService';
import { WebSocketManager } from './api/websocket/WebSocketManager';
import { ChatChannel } from './api/websocket/channels/ChatChannel';
import { ConfigService } from './services/ConfigService';
import { PathService } from './services/PathService';

// 验证中间件
import { initializeCustomValidators } from './api/middleware/customValidators';
import { createValidationMiddleware } from './api/middleware/validationMiddleware';
import {
  chatCompletionSchema,
  modelsListSchema,
  interruptRequestSchema,
  simpleStreamSchema
} from './api/middleware/validationSchemas';
// 清理中间件
import { createSanitizationMiddleware } from './api/middleware/sanitizationMiddleware';
// 安全头中间件
import { createSecurityHeadersMiddleware } from './api/middleware/securityHeadersMiddleware';
// 安全日志中间件
import { createSecurityLoggerMiddleware } from './api/middleware/securityLoggerMiddleware';
// 审计日志中间件
import { createAuditLoggerMiddleware } from './api/middleware/auditLoggerMiddleware';

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
    const adminConfig = this.configService.readConfig();
    
    logger.info('🧠 ApexBridge Server initializing (ABP-only)...');
  }
  
  async initialize(): Promise<void> {
    try {
      // 1. 基础服务初始化 (Config, Path, DB)
      logger.info('📋 Initializing base services...');
      
      // 确保路径服务最先就绪
      const pathService = PathService.getInstance();
      pathService.ensureAllDirs();
      logger.info('✅ All required directories ensured');
      
      // 统一使用 ConfigService 读取配置
      const config = this.configService.readConfig();
      
      // 验证配置（如果设置未完成，跳过严格验证）
      if (!this.configService.isSetupCompleted()) {
        logger.warn('⚠️ Configuration not fully setup (missing API Key)');
      } else {
        const validation = this.configService.validateConfig(config);
        if (!validation.valid) {
          throw new Error(`Configuration errors:\n${validation.errors.join('\n')}`);
        }
      }
      logger.info('✅ Configuration loaded and validated');
      
      // 初始化LLM配置服务（确保SQLite数据库和表已创建）
      const { LLMConfigService } = await import('./services/LLMConfigService');
      LLMConfigService.getInstance(); // 触发 DB 初始化
      logger.info('✅ LLMConfigService initialized (SQLite database ready)');
      
      // 2. 核心引擎初始化
      // ⏳ 关键调整：先创建 ProtocolEngine，然后等待完全初始化
      const memBefore = process.memoryUsage();
      logger.info(`[Memory] Before Protocol Engine init - RSS: ${Math.round(memBefore.rss / 1024 / 1024)}MB, Heap: ${Math.round(memBefore.heapUsed / 1024 / 1024)}MB`);
      
      this.protocolEngine = new ProtocolEngine(config);
      await this.protocolEngine.initialize(); // 等待引擎完全就绪
      
      const memAfter = process.memoryUsage();
      logger.info(`[Memory] After Protocol Engine init - RSS: ${Math.round(memAfter.rss / 1024 / 1024)}MB, Heap: ${Math.round(memAfter.heapUsed / 1024 / 1024)}MB`);
      logger.info(`[Memory] Protocol Engine memory delta - RSS: +${Math.round((memAfter.rss - memBefore.rss) / 1024 / 1024)}MB, Heap: +${Math.round((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024)}MB`);
      logger.info('✅ Protocol Engine initialized');
      
      // LLMManager采用懒加载模式，仅在需要时（聊天请求时）初始化
      // 从SQLite加载配置，支持运行时配置变更，无需重启服务
      logger.info('ℹ️ LLMManager will be initialized on-demand (lazy loading from SQLite)');
      
      // 3. 业务服务初始化 (ChatService)
      // 注意：此时 Engine 已就绪，ChatService 可以安全使用
      this.chatService = new ChatService(
        this.protocolEngine,
        null as any, // LLMClient 懒加载
        this.eventBus
      );
      logger.info('✅ ChatService initialized');
      
      // 4. 接口层初始化 (WebSocket & HTTP Routes)
      // ⚠️ 关键调整：先初始化 ChatService，再初始化 WS，最后绑定 Server
      this.setupWebSocket(config);
      
      // 注入 WS Manager 到 ChatService
      if (this.websocketManager) {
        this.chatService.setWebSocketManager(this.websocketManager);
      }
      
      // 5. 设置中间件
      this.setupMiddleware();
      
      // 6. 设置路由
      await this.setupRoutes();
      
      // 7. 启动HTTP服务器（所有初始化完成后才启动）
      const apiHost = config.api.host || '0.0.0.0';
      const apiPort = config.api.port || 8088;
      this.server.listen(apiPort, apiHost, () => {
        logger.info(`🚀 ApexBridge running on http://${apiHost}:${apiPort}`);
        logger.info(`📦 Loaded ${this.protocolEngine!.getPluginCount()} plugins`);
        logger.info(`🎯 Ready to accept connections`);
      });
      
      // 8. 设置优雅关闭
      this.setupGracefulShutdown();
      
    } catch (error) {
      logger.error('❌ Failed to initialize ApexBridge:', error);
      process.exit(1);
    }
  }
  
  private setupMiddleware(): void {
    // 初始化自定义验证器（在中间件之前）
    initializeCustomValidators();
    
    // 安全headers（配置 Helmet.js）
    this.app.use(createSecurityHeadersMiddleware());
    
    // CORS
    this.app.use(cors({
      origin: (origin, callback) => {
        // 允许所有来源（生产环境应该配置具体来源）
        callback(null, true);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
    }));
    
    // Body解析
    this.app.use(express.json({ limit: process.env.MAX_REQUEST_SIZE || '50mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // 限流保护
    this.app.use(rateLimitMiddleware);
    
    // 输入清理（在验证之前，清理潜在危险字符）
    this.app.use(createSanitizationMiddleware({
      skipFields: ['password', 'apiKey', 'token']
    }));
    
    const securityLogEnvLevel = (process.env.SECURITY_LOG_LEVEL || 'warn').toLowerCase();
    const allowedLevels = new Set(['debug', 'info', 'warn', 'error', 'off']);
    const normalizedLogLevel = allowedLevels.has(securityLogEnvLevel)
      ? (securityLogEnvLevel as 'debug' | 'info' | 'warn' | 'error' | 'off')
      : 'warn';
    const securityLogEnabled = process.env.SECURITY_LOG_ENABLED !== 'false' && normalizedLogLevel !== 'off';

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
      throw new Error('Protocol Engine not initialized');
    }
    
    if (!this.chatService) {
      throw new Error('ChatService must be initialized before setting up routes');
    }
    
    // LLMClient采用懒加载机制，不在启动时初始化
    // 首次使用时（如聊天请求）会自动创建 LLMManager 实例（从 SQLite 加载配置）
    
    // 注册聊天API
    // 创建控制器（LLMClient采用懒加载）
    const chatController = new ChatController(this.chatService, null as any);

    // 聊天API（添加验证中间件）
    this.app.post('/v1/chat/completions',
      createValidationMiddleware(chatCompletionSchema),
      (req, res) => chatController.chatCompletions(req, res)
    );

    // 🆕 简化版流式聊天接口（专为前端看板娘设计）
    this.app.post('/v1/chat/simple-stream',
      createValidationMiddleware(simpleStreamSchema),
      (req, res) => chatController.simpleChatStream(req, res)
    );

    // 🆕 会话管理API
    // ⚠️ 重要：更具体的路由必须在参数化路由之前注册
    
    // 🆕 获取活动会话列表（必须在 /:conversationId 之前）
    this.app.get('/v1/chat/sessions/active',
      (req, res) => chatController.getActiveSessions(req, res)
    );

    // 🆕 获取会话历史（ACE Engine 内部日志，必须在 /:conversationId 之前）
    this.app.get('/v1/chat/sessions/:conversationId/history',
      (req, res) => chatController.getSessionHistory(req, res)
    );

    // 🆕 获取对话消息历史（用户对话消息，必须在 /:conversationId 之前）
    this.app.get('/v1/chat/sessions/:conversationId/messages',
      (req, res) => chatController.getConversationMessages(req, res)
    );
    
    // 获取单个会话（参数化路由，放在最后）
    this.app.get('/v1/chat/sessions/:conversationId',
      (req, res) => chatController.getSession(req, res)
    );
    
    // 删除会话
    this.app.delete('/v1/chat/sessions/:conversationId',
      (req, res) => chatController.deleteSession(req, res)
    );
    
    // 模型列表API（添加验证中间件）
    this.app.get('/v1/models',
      createValidationMiddleware(modelsListSchema),
      (req, res) => chatController.getModels(req, res)
    );

    // 请求中断API（添加验证中间件）
    this.app.post('/v1/interrupt',
      createValidationMiddleware(interruptRequestSchema),
      (req, res) => chatController.interruptRequest(req, res)
    );
    
    // LLM 配置管理 API（两级结构：提供商 + 模型）
    const ProviderController = await import('./api/controllers/ProviderController');
    const ModelController = await import('./api/controllers/ModelController');
    
    // 提供商管理
    this.app.get('/api/llm/providers', ProviderController.listProviders);
    this.app.get('/api/llm/providers/:id', ProviderController.getProvider);
    this.app.post('/api/llm/providers', ProviderController.createProvider);
    this.app.put('/api/llm/providers/:id', ProviderController.updateProvider);
    this.app.delete('/api/llm/providers/:id', ProviderController.deleteProvider);
    
    // 模型管理
    this.app.get('/api/llm/providers/:providerId/models', ModelController.listProviderModels);
    this.app.get('/api/llm/providers/:providerId/models/:modelId', ModelController.getModel);
    this.app.post('/api/llm/providers/:providerId/models', ModelController.createModel);
    this.app.put('/api/llm/providers/:providerId/models/:modelId', ModelController.updateModel);
    this.app.delete('/api/llm/providers/:providerId/models/:modelId', ModelController.deleteModel);
    
    // 模型查询（跨提供商）
    this.app.get('/api/llm/models', ModelController.queryModels);
    this.app.get('/api/llm/models/default', ModelController.getDefaultModel);
    
    // 健康检查
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        version: '2.0.0',
        uptime: process.uptime(),
        plugins: this.protocolEngine!.getPluginCount(),
        activeRequests: this.chatService?.getActiveRequestCount() || 0
      });
    });

    // 错误处理（必须最后注册）
    this.app.use(errorHandler);
    
    logger.info('✅ Routes configured');
  }

  /**
   * 设置WebSocket服务器（使用独立实现）
   * ⚠️ 注意：此时 HTTP Server 还没 listen，这是安全的
   */
  private setupWebSocket(config: AdminConfig): void {
    if (!this.chatService) {
      throw new Error('ChatService must be initialized before WebSocket');
    }
    
    logger.info('🌐 Setting up WebSocket server...');

    try {
      // 创建聊天频道实例
      this.chatChannel = new ChatChannel(this.chatService);

      // 创建精简版WebSocket管理器（仅支持聊天功能）
      this.websocketManager = new WebSocketManager(config, this.chatChannel);

      // 绑定到 HTTP Server（此时 HTTP Server 还没 listen，这是安全的）
      this.websocketManager.initialize(this.server);

      logger.info('✅ WebSocket server configured (ABP-only chat implementation)');
      logger.info(`📡 WebSocket endpoints (1 channel, chat-only):`);
      logger.info(`   - /chat/api_key=<your_api_key>`);
      logger.info(`   - /v1/chat/api_key=<your_api_key>`);

      logger.info('✅ WebSocket server ready (chat-only)');
      
    } catch (error) {
      logger.error('❌ Failed to setup WebSocket server:', error);
      throw error;
    }
  }
  

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`\n🛑 Received ${signal}, shutting down gracefully...`);
      
      // 停止接受新请求
      this.server.close(() => {
        logger.info('✅ HTTP server closed');
      });

      // 关闭WebSocket
      if (this.websocketManager) {
        await this.websocketManager.shutdown();
      }
      
      // 停止 ChatService 清理定时器
      if (this.chatService) {
        this.chatService.stopCleanupTimer();
        logger.info('✅ ChatService cleanup timer stopped');
      }
      
      // 关闭协议引擎
      if (this.protocolEngine) {
        await this.protocolEngine.shutdown();
      }

      logger.info('👋 ApexBridge shut down successfully');
      process.exit(0);
    };
    
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }
}

// 启动服务器（ABP-only）
const shouldAutostart = process.env.APEX_BRIDGE_AUTOSTART !== 'false';
if (shouldAutostart) {
  const server = new ABPIntelliCore();
  server.initialize().catch(error => {
    logger.error('💥 Fatal error during initialization:', error);
    process.exit(1);
  });
}

