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
import { loadConfig, validateConfig } from './config';
import { logger } from './utils/logger';
import type { AdminConfig } from './services/ConfigService';
import { WebSocketManager } from './api/websocket/WebSocketManager';
import { ChatChannel } from './api/websocket/channels/ChatChannel';
import * as path from 'path';
import { ConfigService } from './services/ConfigService';
import { PathService } from './services/PathService';

// 验证中间件
import { initializeCustomValidators } from './api/middleware/customValidators';
import { createValidationMiddleware } from './api/middleware/validationMiddleware';
import {
  chatCompletionSchema,
  modelsListSchema,
  interruptRequestSchema
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
      // 1. 加载和验证配置
      logger.info('📋 Loading configuration...');
      const config = loadConfig();
      validateConfig();
      logger.info('✅ Configuration loaded and validated');
      
      // 1.5 确保必要的目录存在
      const { PathService } = await import('./services/PathService');
      const pathService = PathService.getInstance();
      pathService.ensureAllDirs();
      logger.info('✅ All required directories ensured');
      
      // 1.6 初始化LLM配置服务（确保SQLite数据库和表已创建）
      const { LLMConfigService } = await import('./services/LLMConfigService');
      const llmConfigService = LLMConfigService.getInstance();
      logger.info('✅ LLMConfigService initialized (SQLite database ready)');
      
      // 2. 初始化协议引擎核心组件（ProtocolEngine构造函数已调用initializeCore）
      this.protocolEngine = new ProtocolEngine(config);
      logger.info('✅ Protocol Engine core components initialized');
      
      // LLMManager采用懒加载模式，仅在需要时（聊天请求时）初始化
      // 从SQLite加载配置，支持运行时配置变更，无需重启服务
      logger.info('ℹ️ LLMManager will be initialized on-demand (lazy loading from SQLite)');
      
      // 3. 设置WebSocket
      this.setupWebSocket(config);
      
      // 4. 初始化协议引擎
      await this.protocolEngine.initialize();
      logger.info(`✅ Protocol Engine initialized`);
      
      // 5. 设置中间件
      this.setupMiddleware();
      
      // 6. 设置路由
      await this.setupRoutes();
      
      // 7. 启动HTTP服务器
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
    
    // LLMClient采用懒加载机制，不在启动时初始化
    // 首次使用时（如聊天请求）会自动创建 LLMManager 实例（从 SQLite 加载配置）
    
    // 创建ChatService（保存为类成员）
    // LLMClient采用懒加载模式，不在这里初始化
    this.chatService = new ChatService(
      this.protocolEngine,
      null as any, // LLMClient采用懒加载
      this.eventBus
    );

    // 注入 WebSocketManager（用于中断通知）
    if (this.websocketManager) {
      this.chatService.setWebSocketManager(this.websocketManager);
    }
    
    // 注册聊天API
    if (this.chatService) {
      // 创建控制器（LLMClient采用懒加载）
      const chatController = new ChatController(this.chatService, null as any);

      // 聊天API（添加验证中间件）
      this.app.post('/v1/chat/completions',
        createValidationMiddleware(chatCompletionSchema),
        (req, res) => chatController.chatCompletions(req, res)
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
    }
    
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
   */
  private setupWebSocket(config: AdminConfig): void {
    logger.info('🌐 Setting up WebSocket server...');

    try {
      // 创建聊天频道实例
      this.chatChannel = new ChatChannel(this.chatService!);

      // 创建精简版WebSocket管理器（仅支持聊天功能）
      this.websocketManager = new WebSocketManager(config, this.chatChannel);

      // 初始化（传入HTTP server）
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

