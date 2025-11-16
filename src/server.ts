/**
 * ApexBridge Server - 主服务器入口（ABP-only）
 */

import express from 'express';
import cors from 'cors';
import { Server } from 'http';
import { WebSocketServer } from 'ws';
import { ProtocolEngine } from './core/ProtocolEngine';
import { LLMClient } from './core/LLMClient';
import { EventBus } from './core/EventBus';
import { PersonalityEngine } from './core/PersonalityEngine';
import { EmotionEngine } from './core/EmotionEngine';
import { ProactivityScheduler } from './core/ProactivityScheduler';
import { NodeManager } from './core/NodeManager';
import { getBasicScenes, createBirthdayReminderScene, createAnniversaryReminderScene } from './core/scenes/BasicScenes';
import { ProactivityConfigService } from './services/ProactivityConfigService';
import { RelationshipStorage } from './utils/relationshipStorage';
import { RAGMemoryService } from './services/RAGMemoryService';
import { DefaultEpisodicMemoryService } from './services/memory/EpisodicMemoryService';
import { DefaultSemanticMemoryService } from './services/memory/SemanticMemoryService';
import { TimeSeriesEpisodicStore } from './services/memory/stores/TimeSeriesEpisodicStore';
import { HNSWSemanticStore } from './services/memory/stores/HNSWSemanticStore';
import { EpisodicSemanticBridge, VectorizerEmbeddingProvider } from './services/memory/EpisodicSemanticBridge';
import { ChatService } from './services/ChatService';
import { ChatController } from './api/controllers/ChatController';
import { authMiddleware } from './api/middleware/authMiddleware';
import { rateLimitMiddleware } from './api/middleware/rateLimitMiddleware';
import { errorHandler } from './api/middleware/errorHandler';
import { loadConfig, validateConfig } from './config';
import { logger } from './utils/logger';
import { createPluginCallbackRouter } from './api/plugin-callback';
import type { AdminConfig } from './services/ConfigService';
import { ConversationRouter } from './core/conversation/ConversationRouter';
import { ToolAuthorization } from './core/conversation/ToolAuthorization';
// 独立WebSocket实现（不再依赖vcp-intellicore-sdk）
import { IndependentWebSocketManager } from './api/websocket/IndependentWebSocketManager';
import { ABPLogChannel } from './api/websocket/channels/ABPLogChannel';
// 其他频道暂时禁用（VCPInfo, ChromeObserver）
// import { VCPInfoChannelSDK } from 'vcp-intellicore-sdk'; // 已禁用
// import { ChromeObserverChannelSDK } from 'vcp-intellicore-sdk'; // 已禁用
// AdminPanel频道现在使用独立实现
import { AdminPanelChannel } from './api/websocket/channels/AdminPanelChannel';
import { NodeAwareDistributedServerChannel } from './api/websocket/channels/NodeAwareDistributedServerChannel';
import { DistributedService } from './services/DistributedService';
import { AsyncResultCleanupService } from './services/AsyncResultCleanupService';
import { DiaryArchiveService } from './services/DiaryArchiveService';
// PluginWatcher已移除 - 热更新功能暂时禁用
// 管理后台相关
import * as path from 'path';
import { isSetupCompleted } from './config';
import { ConfigService } from './services/ConfigService';
import { NodeService } from './services/NodeService';
import { PathService } from './services/PathService';
// Skills 集成
import { SkillsIndex } from './core/skills/SkillsIndex';
import { SkillsCache } from './core/skills/SkillsCache';
import { InstructionLoader } from './core/skills/InstructionLoader';
import { ResourceLoader } from './core/skills/ResourceLoader';
import { SkillsLoader } from './core/skills/SkillsLoader';
import { SkillsExecutionManager } from './core/skills/SkillsExecutionManager';
import { SkillsToToolMapper } from './core/skills/SkillsToToolMapper';
import { SkillsToolDescriptionGenerator } from './core/skills/SkillsToolDescriptionGenerator';
// Setup API
import * as setupController from './api/controllers/SetupController';
// Config API
import * as configController from './api/controllers/ConfigController';
// Node API
import * as nodeController from './api/controllers/NodeController';
// Admin API
import * as adminController from './api/controllers/AdminController';
// Personality API
import * as personalityController from './api/controllers/PersonalityController';
// Preference API
import * as preferenceController from './api/controllers/PreferenceController';
// Timeline API
import * as timelineController from './api/controllers/TimelineController';
// Relationship API
import * as relationshipController from './api/controllers/RelationshipController';
// Admin Auth Middleware
import { adminAuthMiddleware } from './api/middleware/adminAuthMiddleware';
// 验证中间件
import { initializeCustomValidators } from './api/middleware/customValidators';
import { createValidationMiddleware } from './api/middleware/validationMiddleware';
import {
  chatCompletionSchema,
  modelsListSchema,
  interruptRequestSchema,
  configUpdateSchema,
  personalityCreateSchema,
  personalityUpdateSchema,
  personalityIdSchema,
  nodeRegistrationSchema,
  nodeUpdateSchema,
  nodeIdSchema,
  setupSchema
} from './api/middleware/validationSchemas';
// 清理中间件
import { createSanitizationMiddleware } from './api/middleware/sanitizationMiddleware';
// 安全头中间件
import { createSecurityHeadersMiddleware } from './api/middleware/securityHeadersMiddleware';
// 安全日志中间件
import { createSecurityLoggerMiddleware } from './api/middleware/securityLoggerMiddleware';
// 审计日志中间件
import { createAuditLoggerMiddleware } from './api/middleware/auditLoggerMiddleware';

export class VCPIntelliCore {
  private app: express.Application;
  private server: Server;
  private wss: WebSocketServer | null = null;
  private protocolEngine: ProtocolEngine | null = null;
  private llmClient: LLMClient | null = null;
  private eventBus: EventBus;
  private chatService: ChatService | null = null;
  private toolAuthorization: ToolAuthorization | null = null;
  private websocketManager: IndependentWebSocketManager | null = null;
  private distributedServerChannel: NodeAwareDistributedServerChannel | null = null;
  private abpLogChannel: ABPLogChannel | null = null;
  // 其他频道暂时禁用
  // private vcpInfoChannel: VCPInfoChannelSDK | null = null;
  // private chromeObserverChannel: ChromeObserverChannelSDK | null = null;
  private adminPanelChannel: AdminPanelChannel | null = null; // 使用独立实现
  private distributedService: DistributedService | null = null;
  private cleanupService: AsyncResultCleanupService | null = null;
  private diaryArchiveService: DiaryArchiveService | null = null;
  private personalityEngine: PersonalityEngine | null = null; // 🆕 人格引擎
  private emotionEngine: EmotionEngine | null = null; // 🆕 情感引擎
  private memoryService: any = null; // 🆕 记忆服务（IMemoryService）
  private episodicMemoryService: DefaultEpisodicMemoryService | null = null;
  private semanticMemoryService: DefaultSemanticMemoryService | null = null;
  private episodicSemanticBridge: EpisodicSemanticBridge | null = null;
  private proactivityScheduler: ProactivityScheduler | null = null; // 🆕 主动性调度器
  private configService: ConfigService; // 🆕 配置服务
  private nodeService: NodeService; // 🆕 节点服务
  private nodeManager: NodeManager; // 🆕 节点管理器
  private conversationRouter: ConversationRouter | null = null;
  private nodeEventHandlersRegistered = false;
  // private pluginWatcher: PluginWatcher | null = null; // 热更新暂时禁用
  
  constructor() {
    this.app = express();
    this.server = new Server(this.app);
    this.eventBus = EventBus.getInstance();
    this.configService = ConfigService.getInstance();
    this.nodeService = NodeService.getInstance();
    const adminConfig = this.configService.readConfig();
    this.nodeManager = new NodeManager({
      nodeService: this.nodeService,
      eventBus: this.eventBus,
      quotaConfig: adminConfig.llm?.quota
    });
    nodeController.setNodeManager(this.nodeManager);
    this.nodeManager.start();
    this.setupNodeEventForwarding();
    
    logger.info('🧠 ApexBridge Server initializing (ABP-only)...');
  }
  
  async initialize(): Promise<void> {
    try {
      // 1. 加载和验证配置
      logger.info('📋 Loading configuration...');
      const config = loadConfig();
      validateConfig();
      logger.info('✅ Configuration loaded and validated');
      
      // 🆕 1.5 确保必要的目录存在
      const { PathService } = await import('./services/PathService');
      const pathService = PathService.getInstance();
      pathService.ensureAllDirs();
      logger.info('✅ All required directories ensured');
      
      // 2. 初始化协议引擎核心组件（ProtocolEngine构造函数已调用initializeCore）
      this.protocolEngine = new ProtocolEngine(config);
      logger.info('✅ Protocol Engine core components initialized');
      
      // 🆕 不再在启动时强制初始化LLMClient
      // LLMClient将采用懒加载模式，仅在需要时（聊天请求时）初始化
      // 这样可以支持运行时配置变更，无需重启服务
      logger.info('ℹ️ LLMClient will be initialized on-demand (lazy loading)');
      
      // 3. 设置WebSocket（在插件加载前）
      this.setupWebSocket(config);
      
      // 🆕 3.5 设置SDK执行回调（pluginRuntime已创建，但插件未加载）
      if (this.protocolEngine && this.abpLogChannel) {
        this.protocolEngine.setExecutionCallback((event) => {
          logger.info(`🔔 SDK callback triggered: ${event.type} for ${event.pluginName}`);
          
          // 🎯 转换SDK事件为VCPToolBox标准格式
          let status: 'executing' | 'success' | 'error';
          let content = '';
          
          switch (event.type) {
            case 'tool_start':
              status = 'executing';
              content = `tool_name: ${event.pluginName}\n正在执行工具: ${event.pluginName}`;
              break;
            case 'tool_complete':
              status = 'success';
              content = `tool_name: ${event.pluginName}\n${event.result?.message || JSON.stringify(event.result)}`;
              break;
            case 'tool_error':
              status = 'error';
              content = `tool_name: ${event.pluginName}\n${event.error || '执行失败'}`;
              break;
            default:
              logger.warn(`Unknown event type: ${event.type}`);
              return;
          }
          
          logger.info(`📡 Pushing to ABPlog: ${status} - ${event.pluginName}`);
          
          // 使用SDK的VCPLogChannelSDK API推送
          this.abpLogChannel?.pushToolLog({
            status: status,
            tool: event.pluginName,
            content: content,
            source: 'sdk-callback'
          });
          
          logger.info(`✅ ABPlog pushed successfully`);
        });
        logger.info('✅ SDK execution callback connected to ABPlog (before plugin loading)');
      }
      
      // 4. 现在初始化协议引擎（会加载插件）
      await this.protocolEngine.initialize();
      logger.info(`✅ Protocol Engine initialized with ${this.protocolEngine.getPluginCount()} plugins`);
      
      // 🆕 4.5 启动异步结果清理服务
      const asyncResultProvider = this.protocolEngine.variableEngine?.providers?.get?.('AsyncResultProvider');
      if (asyncResultProvider) {
        this.cleanupService = new AsyncResultCleanupService(asyncResultProvider, {
          enabled: process.env.ASYNC_RESULT_CLEANUP_ENABLED !== 'false',
          maxAgeDays: parseInt(process.env.ASYNC_RESULT_MAX_AGE_DAYS || '7'),
          intervalDays: parseInt(process.env.ASYNC_RESULT_CLEANUP_INTERVAL_DAYS || '1'),
          strategy: (process.env.ASYNC_RESULT_CLEANUP_STRATEGY as 'directory' | 'file') || 'directory'
        });
        this.cleanupService.start();
        logger.info('✅ Async result cleanup service started');
      } else {
        logger.warn('⚠️ AsyncResultProvider not found, cleanup service not started');
      }
      
      // 🆕 4.6 启动日记归档服务
      const diaryArchiveEnabled = process.env.DIARY_ARCHIVE_ENABLED !== 'false';
      if (diaryArchiveEnabled) {
        const pathService = PathService.getInstance();
        const diaryRootPath = pathService.getDiaryRootDir();
        
        this.diaryArchiveService = new DiaryArchiveService({
          diaryRootPath: diaryRootPath,
          archiveDir: process.env.DIARY_ARCHIVE_DIR || 'archive',
          archiveAfterDays: parseInt(process.env.DIARY_ARCHIVE_AFTER_DAYS || '7', 10),
          enabled: true,
          cronSchedule: process.env.DIARY_ARCHIVE_CRON || '0 2 * * *',
        });
        
        this.diaryArchiveService.start();
        logger.info('✅ Diary archive service started');
      } else {
        logger.info('ℹ️ Diary archive service is disabled');
      }
      
      // 5. LLM客户端初始化已移到上方（根据setup状态决定）
      // 这里不再重复初始化
      
      // 6. 设置中间件
      this.setupMiddleware();
      
      // 7. 设置路由
      await this.setupRoutes();
      
      // 🆕 7.5 启动插件热更新监听器 (暂时禁用)
      // if (this.vcpEngine) {
      //   const enableHotReload = process.env.PLUGIN_HOT_RELOAD !== 'false';
      //   if (enableHotReload) {
      //     this.pluginWatcher = new PluginWatcher(
      //       this.vcpEngine.pluginRuntime,
      //       config.plugins.directory
      //     );
      //     await this.pluginWatcher.start();
      //   }
      // }
      
      // 8. 启动HTTP服务器
      this.server.listen(config.server.port, config.server.host, () => {
        logger.info(`🚀 ApexBridge running on http://${config.server.host}:${config.server.port}`);
        logger.info(`📦 Loaded ${this.protocolEngine!.getPluginCount()} plugins`);
        logger.info(`🎯 Ready to accept connections`);
      });
      
      // 9. 设置优雅关闭
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
    // 注意：对于某些字段（如密码、API key），可能需要跳过清理
    this.app.use(createSanitizationMiddleware({
      sanitizeBody: true,
      sanitizeQuery: true,
      sanitizeParams: true,
      sanitizeHeaders: false,
      allowHtml: false,
      preventSqlInjection: true,
      preventCommandInjection: true,
      preventPathTraversal: true,
      // 跳过敏感字段的清理（这些字段由验证中间件处理）
      skipFields: ['password', 'apiKey', 'token']
    }));
    
    // 安全日志中间件（记录安全相关事件）
    this.app.use(createSecurityLoggerMiddleware({
      enabled: true,
      logLevel: 'info',
      logRateLimitViolations: true,
      logSuspiciousRequests: true
    }));
    
    // 审计日志中间件（记录关键操作）
    this.app.use(createAuditLoggerMiddleware({
      enabled: true,
      logLevel: 'info',
      logSuccessfulOperations: true,
      logFailedOperations: true
    }));
    
    // 认证中间件
    this.app.use(authMiddleware);
  }
  
  /**
   * 🧪 验证MemoryService功能（运行时验证）
   */
  private async verifyMemoryService(): Promise<void> {
    if (!this.memoryService) {
      logger.warn('[MemoryService验证] MemoryService未初始化');
      return;
    }
    
    try {
      logger.info('[MemoryService验证] 开始验证MemoryService功能...');
      
      // 测试1: 保存记忆
      const testMemory = {
        content: '测试记忆：MemoryService运行时验证',
        userId: 'system-test',
        timestamp: Date.now(),
        metadata: {
          source: 'verification',
          knowledgeBase: 'test'
        }
      };
      
      const saveStart = Date.now();
      await this.memoryService.save(testMemory);
      const saveEnd = Date.now();
      const saveOverhead = saveEnd - saveStart;
      
      logger.info(`[MemoryService验证] ✅ save()测试成功，耗时: ${saveOverhead}ms`);
      
      if (saveOverhead > 10) {
        logger.warn(`[MemoryService验证] ⚠️  save()开销 ${saveOverhead}ms 超过10ms目标`);
      } else {
        logger.info(`[MemoryService验证] ✅ save()性能满足要求 (< 10ms)`);
      }
      
      // 测试2: 检索记忆
      const recallStart = Date.now();
      const memories = await this.memoryService.recall('测试记忆', {
        knowledgeBase: 'test',
        limit: 5
      });
      const recallEnd = Date.now();
      const recallOverhead = recallEnd - recallStart;
      
      logger.info(`[MemoryService验证] ✅ recall()测试成功，耗时: ${recallOverhead}ms，找到 ${memories.length} 条记忆`);
      
      // 注意：recall的总耗时包括RAG搜索本身，接口开销应该是很小的
      // 这里显示的是总耗时，实际接口开销应该 < 10ms
      if (recallOverhead > 1000) {
        logger.debug(`[MemoryService验证] recall()总耗时 ${recallOverhead}ms (包括RAG搜索)`);
      }
      
      logger.info('[MemoryService验证] ✅ MemoryService运行时验证完成');
      
    } catch (error: any) {
      logger.error('[MemoryService验证] ❌ 验证失败:', error.message);
      logger.error('[MemoryService验证] 这可能是正常的，如果RAG服务未正确配置');
    }
  }
  
  private setupNodeEventForwarding(): void {
    // 如果已经注册过，先移除旧的监听器
    if (this.nodeEventHandlersRegistered) {
      // 移除旧的监听器，准备重新注册
      const events = [
        'node_registered',
        'node_unregistered',
        'node_status_changed',
        'node_disconnected',
        'task_assigned',
        'task_completed',
        'task_timeout',
        'llm_proxy_started',
        'llm_proxy_completed',
        'llm_proxy_stream_chunk',
        'llm_proxy_stream_completed',
        'llm_proxy_rate_limited',
        'conversation:user_message',
        'conversation:assistant_message',
        'tool_approval_requested',
        'tool_approval_completed'
      ];
      events.forEach((eventName) => {
        this.eventBus.removeAllListeners(eventName);
      });
      this.nodeEventHandlersRegistered = false;
    }

    const forwardUpdate = (event: string, data: any): void => {
      // 广播到AdminPanel频道（如果已初始化）
      if (this.adminPanelChannel) {
        this.adminPanelChannel.broadcast({
          type: 'node_event',
          event,
          payload: data,
          timestamp: Date.now()
        });
      } else {
        logger.debug(`[NodeEvents] ${event} (AdminPanel not initialized)`, data);
      }
    };

    const events = [
      'node_registered',
      'node_unregistered',
      'node_status_changed',
      'node_disconnected',
      'task_assigned',
      'task_completed',
      'task_timeout',
      'llm_proxy_started',
      'llm_proxy_completed',
      'llm_proxy_stream_chunk',
      'llm_proxy_stream_completed',
      'llm_proxy_rate_limited',
      'conversation:user_message',
      'conversation:assistant_message',
      'tool_approval_requested',
      'tool_approval_completed'
    ];

    events.forEach((eventName) => {
      this.eventBus.subscribe(eventName, (payload: any) => {
        forwardUpdate(eventName, payload);
      });
    });

    this.nodeEventHandlersRegistered = true;
  }

  private resolveDefaultHubPersona(): string {
    try {
      const nodes = this.nodeService.getAllNodes();
      const hubNode = nodes.find((node) => node.type === 'hub' && ((node.boundPersonas && node.boundPersonas.length > 0) || node.boundPersona));
      if (hubNode) {
        return hubNode.boundPersonas?.[0] ?? hubNode.boundPersona ?? 'default';
      }
    } catch (error) {
      logger.warn('⚠️ Failed to resolve default hub persona, fallback to "default"', error);
    }
    return 'default';
  }

  private async setupRoutes(): Promise<void> {
    if (!this.protocolEngine) {
      throw new Error('Protocol Engine not initialized');
    }
    
    // 🆕 如果设置未完成，允许系统启动但只提供管理界面功能
    const setupCompleted = isSetupCompleted();
    if (!setupCompleted) {
      logger.info('⚠️ Setup not completed - only admin panel routes will be available');
    }
    // 注意：LLMClient采用懒加载机制，不在启动时初始化
    // 首次使用时（如聊天请求）会自动从RuntimeConfigService获取并初始化

    // 🆕 设置管理后台相关服务
    // 将分布式通道引用注入到NodeService（用于获取实时节点状态）
    if (this.distributedServerChannel) {
      this.nodeService.setDistributedChannel(this.distributedServerChannel);
    }
    
    // 🆕 只有在设置完成时才初始化聊天相关组件
    // LLMClient采用懒加载，不在这里初始化
    if (setupCompleted) {
      // 🆕 初始化PersonalityEngine
      this.personalityEngine = new PersonalityEngine();
      await this.personalityEngine.initialize();
      
      // 🆕 初始化EmotionEngine（不传入llmClient，采用懒加载）
      this.emotionEngine = new EmotionEngine({
        llmClient: undefined, // 懒加载，在需要时从RuntimeConfigService获取
        templateDir: './config/emotion',
        fastModeEnabled: true,
        cacheEnabled: true,
        recordingEnabled: false  // 暂时先不启用EmotionEngine的recordEmotion，我们在ChatService中调用MemoryService的recordEmotion
      });
      await this.emotionEngine.initialize();
      
      // 🆕 初始化MemoryService（根据配置选择实现）
      const adminConfig = ConfigService.getInstance().readConfig();
      const memorySystem = adminConfig.memory?.system || 'rag';
      logger.debug(`[MemoryService] MEMORY_SYSTEM=${memorySystem}, RAG服务可用=${!!this.protocolEngine.ragService}`);
      
      if (memorySystem === 'rag' && this.protocolEngine.ragService) {
        this.memoryService = new RAGMemoryService(this.protocolEngine.ragService, {
          defaultKnowledgeBase: 'default',
          enableLogging: true
        });
        logger.info('✅ MemoryService initialized (RAG mode)');
      } else if (memorySystem !== 'rag') {
        logger.warn(`⚠️ Unknown MEMORY_SYSTEM: ${memorySystem}, falling back to 'rag'`);
        // 后续可以实现RemoteMemoryService (apex-memory集成)
        if (this.protocolEngine.ragService) {
          this.memoryService = new RAGMemoryService(this.protocolEngine.ragService);
          logger.info('✅ MemoryService initialized (RAG mode, fallback)');
        }
      } else if (!this.protocolEngine.ragService) {
        logger.warn('[MemoryService] ⚠️ RAG服务未初始化，MemoryService将不会创建');
      }

      await this.setupMemoryPipelines(adminConfig);
      
      // 创建ChatService（保存为类成员）
      // 不再传入llmClient，采用懒加载模式
      this.chatService = new ChatService(
        this.protocolEngine,
        null as any, // LLMClient将采用懒加载
        this.eventBus
      );
      
      // 🆕 Skills 体系装配（索引、加载器、执行管理器与描述生成器）
      try {
        const ps = PathService.getInstance();
        const skillsRoot = path.join(ps.getRootDir(), 'apex-bridge', 'skills');
        const skillsIndex = new SkillsIndex({ skillsRoot });
        await skillsIndex.buildIndex();
        const skillsCache = new SkillsCache();
        const instructionLoader = new InstructionLoader(skillsIndex, skillsCache);
        const resourceLoader = new ResourceLoader(skillsIndex, skillsCache, {});
        const skillsLoader = new SkillsLoader(skillsIndex, instructionLoader, resourceLoader, skillsCache);
        const skillsExecManager = new SkillsExecutionManager(skillsLoader, {});
        const skillsMapper = new SkillsToToolMapper(skillsIndex);
        this.chatService.setSkillsExecution(skillsExecManager, skillsMapper);
        logger.info('✅ SkillsExecutionManager wired into ChatService');
        
        // 绑定三段披露描述生成器到 ProtocolEngine 的 ToolDescriptionProvider
        const skillsDescGen = new SkillsToolDescriptionGenerator(skillsIndex, instructionLoader, {});
        this.protocolEngine.setSkillsDescriptionGenerator(skillsDescGen);
        logger.info('✅ SkillsToolDescriptionGenerator bound to ToolDescriptionProvider');
      } catch (e: any) {
        logger.warn(`⚠️ Failed to initialize Skills components: ${e?.message || e}`);
      }
      
      // 🆕 注入PersonalityEngine
      if (this.personalityEngine) {
        this.chatService.setPersonalityEngine(this.personalityEngine);
      }
      
      // 🆕 注入EmotionEngine
      if (this.emotionEngine) {
        this.chatService.setEmotionEngine(this.emotionEngine);
      }
      
      // 🆕 注入PreferenceService（用于偏好学习与提示/工具披露影响）
      try {
        const { PreferenceService } = await import('./services/PreferenceService');
        const prefDefaults = { lang: 'zh', toolsDisclosure: 'brief' } as Record<string, string>;
        const preferenceService = new PreferenceService(prefDefaults);
        this.chatService.setPreferenceService(preferenceService);
        logger.info('[ChatService] PreferenceService attached');
      } catch (e: any) {
        logger.warn(`[ChatService] PreferenceService not attached: ${e?.message || e}`);
      }
      
      // 🆕 注入MemoryService
      if (this.memoryService) {
        this.chatService.setMemoryService(this.memoryService);
        logger.info('[ChatService] MemoryService attached');
        
        // 🧪 运行时验证：测试MemoryService基本功能（可选，通过环境变量控制）
        const verifyFlag = adminConfig.memory?.verifyMemoryService || false;
        logger.debug(`[MemoryService验证] verifyMemoryService=${verifyFlag}`);
        
        if (verifyFlag) {
          logger.info('[MemoryService验证] 检测到验证标志，开始执行验证...');
          await this.verifyMemoryService();
        } else {
          logger.debug(`[MemoryService验证] 验证未启用`);
        }
      } else {
        logger.warn('[MemoryService验证] MemoryService未初始化，跳过验证');
      }

      // 🆕 注入SemanticMemoryService（用于PromptBuilder）
      if (this.semanticMemoryService) {
        this.chatService.setSemanticMemoryService(this.semanticMemoryService);
        logger.info('[ChatService] SemanticMemoryService attached');
      }

      // 🆕 注入EpisodicMemoryService（用于PromptBuilder）
      if (this.episodicMemoryService) {
        this.chatService.setEpisodicMemoryService(this.episodicMemoryService);
        logger.info('[ChatService] EpisodicMemoryService attached');
      }
      
      // 🆕 注入 WebSocketManager（用于中断通知）
      if (this.websocketManager) {
        this.chatService.setWebSocketManager(this.websocketManager);
      }

      // 🆕 注入 ToolAuthorization
      this.toolAuthorization = new ToolAuthorization({
        nodeService: this.nodeService
      });
      this.chatService.setToolAuthorization(this.toolAuthorization);
      this.chatService.setNodeManager(this.nodeManager);

      this.conversationRouter = new ConversationRouter({
        defaultHubPersonaId: this.resolveDefaultHubPersona(),
        defaultHubMemberId: 'hub-main',
        nodeService: this.nodeService,
        eventBus: this.eventBus
      });
      
      // 🆕 初始化ProactivityScheduler（主动性调度系统）
      try {
        const proactivityConfigService = ProactivityConfigService.getInstance();
        const proactivityConfig = await proactivityConfigService.loadConfig();
        
        // 只有在配置启用时才初始化
        if (proactivityConfig.enabled !== false) {
          this.proactivityScheduler = new ProactivityScheduler({
            ...proactivityConfig,
            personalityEngine: this.personalityEngine,
            emotionEngine: this.emotionEngine,
            memoryService: this.memoryService,
            chatService: this.chatService,
            eventBus: this.eventBus
          });
          
          // 注册基础场景
          const basicScenes = getBasicScenes();
          for (const scene of basicScenes) {
            this.proactivityScheduler.registerScene(scene);
          }
          
          // 🆕 注册关系提醒场景（生日和纪念日）
          const relationshipStorage = new RelationshipStorage();
          const birthdayScene = createBirthdayReminderScene(relationshipStorage);
          const anniversaryScene = createAnniversaryReminderScene(relationshipStorage);
          this.proactivityScheduler.registerScene(birthdayScene);
          this.proactivityScheduler.registerScene(anniversaryScene);
          
          // 🆕 将ProactivityScheduler实例注入到RelationshipController
          relationshipController.setProactivityScheduler(this.proactivityScheduler);
          
          // 🆕 监听主动消息事件，推送到WebSocket
          if (this.eventBus && this.abpLogChannel) {
            this.eventBus.subscribe('proactive:message', (message: any) => {
              // 直接发送 proactive_message 类型的消息到WebSocket
              // 注意：SDK内部会处理客户端连接检查，如果没有客户端连接，消息可能不会实际发送
              try {
                // 构建 proactive_message 类型的消息（符合WebSocket客户端期望的格式）
                const proactiveMessage = {
                  type: 'proactive_message',
                  timestamp: message.timestamp || Date.now(),
                  data: {
                    sceneId: message.sceneId,
                    message: message.content,
                    score: message.metadata?.score,
                    userId: message.userId,
                    personality: message.personality
                  }
                };
                
                // 使用 broadcast 方法直接发送消息（通过类型转换访问protected方法）
                // 注意：broadcast方法会检查客户端连接状态，如果没有客户端连接，不会发送
                const clientCount = (this.abpLogChannel as any).clients?.size || 0;
                if (clientCount === 0) {
                  logger.warn(`⚠️ No WebSocket clients connected, message not sent: ${message.sceneId}`);
                } else {
                  (this.abpLogChannel as any).broadcast(proactiveMessage);
                  logger.info(`📢 Proactive message pushed to WebSocket: ${message.sceneId} (${clientCount} client(s) connected)`);
                }
                logger.debug(`   Content: ${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}`);
                logger.debug(`   Score: ${message.metadata?.score || 'N/A'}`);
              } catch (error: any) {
                logger.error(`❌ Failed to push proactive message to WebSocket:`, error);
              }
            });
            logger.info('✅ Proactive message WebSocket listener registered');
          }
          
          // 启动调度器
          this.proactivityScheduler.start();
          
          logger.info('✅ ProactivityScheduler initialized and started');
        } else {
          logger.info('ℹ️ ProactivityScheduler is disabled in config');
        }
      } catch (error: any) {
        logger.error('❌ Failed to initialize ProactivityScheduler:', error);
        // 不阻塞系统启动，继续执行
      }
    } else {
      logger.info('⚠️ Chat services not initialized (setup not completed or LLMClient not available)');
    }
    
    // 🆕 只有在设置完成时才注册聊天API
    // LLMClient采用懒加载，不需要在这里检查
    if (setupCompleted && this.chatService) {
      // 创建控制器（llmClient可以为null，采用懒加载）
      const chatController = new ChatController(this.chatService, null as any, this.conversationRouter!);
      
      // 聊天API（添加验证中间件）
      this.app.post('/v1/chat/completions',
        createValidationMiddleware(chatCompletionSchema),
        (req, res) => chatController.chatCompletions(req, res)
      );
      
      // ABP-only：移除历史 /v1/chatvcp 兼容端点
      
      // 模型列表API（添加验证中间件）
      this.app.get('/v1/models',
        createValidationMiddleware(modelsListSchema),
        (req, res) => chatController.getModels(req, res)
      );
      
      // 🆕 请求中断API（添加验证中间件）
      this.app.post('/v1/interrupt',
        createValidationMiddleware(interruptRequestSchema),
        (req, res) => chatController.interruptRequest(req, res)
      );
    } else {
      logger.info('⚠️ Chat APIs not available (setup not completed or LLMClient not initialized)');
    }
    
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
    
    // 🆕 插件回调端点（异步工具回调）
    const pluginCallbackRouter = createPluginCallbackRouter({
      protocolEngine: this.protocolEngine,
      webSocketManager: this.websocketManager,
      config: {
        ABP_API_KEY: process.env.ABP_API_KEY
      },
      configService: ConfigService.getInstance()
    });
    this.app.use('/plugin-callback', pluginCallbackRouter);
    logger.info('✅ Plugin callback route registered');
    
    
    // ==================== 管理后台API路由 ====================
    // 🆕 管理后台API使用独立的认证中间件（与VCP协议API认证完全分离）
    
    // 设置向导API（无需认证，添加验证中间件）
    this.app.get('/api/setup/status', setupController.getSetupStatus);
    this.app.post('/api/setup/complete',
      createValidationMiddleware(setupSchema),
      setupController.completeSetup
    );
    this.app.post('/api/setup/migrate-from-env', setupController.migrateFromEnv);
    
    // 🆕 应用管理后台认证中间件（只保护 /api/admin/* 路径，不包括 /api/setup）
    this.app.use('/api/admin', adminAuthMiddleware);
    
    // 配置管理API（添加验证中间件）
    this.app.get('/api/admin/config', configController.getConfig);
    this.app.put('/api/admin/config',
      createValidationMiddleware(configUpdateSchema),
      configController.updateConfig
    );
    this.app.post('/api/admin/config/reset', configController.resetConfig);
    this.app.get('/api/admin/config/export', configController.exportConfig);
    this.app.post('/api/admin/config/import', configController.importConfig);
    
    // 节点管理API（添加验证中间件）
    this.app.get('/api/admin/nodes', nodeController.getNodes);
    this.app.get('/api/admin/nodes/:id',
      createValidationMiddleware(nodeIdSchema),
      nodeController.getNode
    );
    this.app.get('/api/admin/nodes/:id/stats',
      createValidationMiddleware(nodeIdSchema),
      nodeController.getNodeStats
    );
    this.app.get('/api/admin/nodes/:id/tasks',
      createValidationMiddleware(nodeIdSchema),
      nodeController.getNodeTasks
    );
    this.app.post('/api/admin/nodes/:id/tasks',
      createValidationMiddleware(nodeIdSchema),
      nodeController.dispatchTaskToNode
    );
    this.app.post('/api/admin/nodes',
      createValidationMiddleware(nodeRegistrationSchema),
      nodeController.registerNode
    );
    this.app.put('/api/admin/nodes/:id',
      createValidationMiddleware(nodeUpdateSchema),
      nodeController.updateNode
    );
    this.app.delete('/api/admin/nodes/:id',
      createValidationMiddleware(nodeIdSchema),
      nodeController.deleteNode
    );
    
    // 管理后台通用API
    this.app.get('/api/admin/system/status', adminController.getSystemStatus);
    this.app.get('/api/admin/system/stats', adminController.getSystemStats);
    this.app.get('/api/admin/system/security-stats', adminController.getSecurityStats);
    this.app.get('/api/admin/system/security-alerts', adminController.getSecurityAlerts);
    this.app.post('/api/admin/system/security-alerts/:id/acknowledge', adminController.acknowledgeSecurityAlert);
    this.app.post('/api/admin/auth/login', adminController.login);
    this.app.post('/api/admin/auth/logout', adminController.logout);
    // 节点认证Key：仅保留 ABP API Key 生成端点
    this.app.post('/api/admin/auth/generate-node-key', adminController.generateNodeKey);
    // 🆕 客户端API Key 管理
    this.app.post('/api/admin/auth/api-keys', adminController.generateClientApiKey);
    this.app.get('/api/admin/auth/api-keys', adminController.listApiKeys);
    this.app.delete('/api/admin/auth/api-keys/:id', adminController.deleteApiKey);
    
    // 🆕 人格管理API（添加验证中间件）
    this.app.get('/api/admin/personalities', (req, res, next) => {
      personalityController.listPersonalities(req, res).catch(next);
    });
    this.app.get('/api/admin/personalities/:id',
      createValidationMiddleware(personalityIdSchema),
      (req, res, next) => {
        personalityController.getPersonality(req, res).catch(next);
      }
    );
    this.app.post('/api/admin/personalities',
      createValidationMiddleware(personalityCreateSchema),
      async (req, res, next) => {
        try {
          await personalityController.createPersonality(req, res);
          // 清除PersonalityEngine缓存
          if (this.personalityEngine) {
            const { id } = req.body;
            if (id) {
              this.personalityEngine.clearCache(id);
            }
          }
        } catch (error) {
          next(error);
        }
      }
    );
    this.app.put('/api/admin/personalities/:id',
      createValidationMiddleware(personalityUpdateSchema),
      async (req, res, next) => {
        try {
          await personalityController.updatePersonality(req, res);
          // 清除PersonalityEngine缓存
          if (this.personalityEngine) {
            const { id } = req.params;
            if (id) {
              this.personalityEngine.clearCache(id);
            }
          }
        } catch (error) {
          next(error);
        }
      }
    );
    this.app.delete('/api/admin/personalities/:id',
      createValidationMiddleware(personalityIdSchema),
      async (req, res, next) => {
        try {
          await personalityController.deletePersonality(req, res);
          // 清除PersonalityEngine缓存
          if (this.personalityEngine) {
            const { id } = req.params;
            if (id) {
              this.personalityEngine.clearCache(id);
            }
          }
        } catch (error) {
          next(error);
        }
      }
    );
    
    // 🆕 偏好管理API
    // 注入角色（统一从上游认证/头部等推断），实际授权在控制器内部判断
    const { injectRoleMiddleware } = await import('./api/middleware/roleMiddleware');
    this.app.use('/api/admin', injectRoleMiddleware());
    this.app.get('/api/admin/preferences', (req, res, next) => {
      preferenceController.listPreferences(req, res).catch(next);
    });
    this.app.get('/api/admin/preferences/:id', (req, res, next) => {
      preferenceController.getPreference(req, res).catch(next);
    });
    this.app.get('/api/admin/preferences/export', (req, res, next) => {
      preferenceController.exportPreferences(req, res).catch(next);
    });
    this.app.post('/api/admin/preferences', (req, res, next) => {
      preferenceController.createPreference(req, res).catch(next);
    });
    this.app.post('/api/admin/preferences/import', (req, res, next) => {
      preferenceController.importPreferences(req, res).catch(next);
    });
    this.app.put('/api/admin/preferences/:id', (req, res, next) => {
      preferenceController.updatePreference(req, res).catch(next);
    });
    this.app.delete('/api/admin/preferences/:id', (req, res, next) => {
      preferenceController.deletePreference(req, res).catch(next);
    });
    
    // 🆕 时间线管理API（需要注入memoryService）
    this.app.get('/api/admin/timeline', (req, res, next) => {
      // 注入memoryService到请求对象
      (req as any).memoryService = this.memoryService;
      timelineController.getTimeline(req, res).catch(next);
    });
    this.app.get('/api/admin/timeline/search', (req, res, next) => {
      // 注入memoryService到请求对象
      (req as any).memoryService = this.memoryService;
      timelineController.searchTimeline(req, res).catch(next);
    });
    
    // 🆕 关系管理API
    this.app.get('/api/admin/relationships', (req, res, next) => {
      relationshipController.listRelationships(req, res).catch(next);
    });
    this.app.get('/api/admin/relationships/:id', (req, res, next) => {
      relationshipController.getRelationship(req, res).catch(next);
    });
    this.app.post('/api/admin/relationships', (req, res, next) => {
      relationshipController.createRelationship(req, res).catch(next);
    });
    this.app.put('/api/admin/relationships/:id', (req, res, next) => {
      relationshipController.updateRelationship(req, res).catch(next);
    });
    this.app.delete('/api/admin/relationships/:id', (req, res, next) => {
      relationshipController.deleteRelationship(req, res).catch(next);
    });
    this.app.get('/api/admin/relationships/:id/reminders', (req, res, next) => {
      relationshipController.getRelationshipReminders(req, res).catch(next);
    });
    
    // 🆕 主动性调度测试API（手动触发场景）
    this.app.post('/api/admin/proactivity/trigger', adminAuthMiddleware, async (req, res, next) => {
      try {
        const { sceneId, userId, skipChecks } = req.body;
        if (!this.proactivityScheduler) {
          res.status(503).json({
            success: false,
            error: 'ProactivityScheduler not available'
          });
          return;
        }
        
        // 手动触发时，默认跳过工作日和触达窗检查
        await this.proactivityScheduler.trigger(sceneId || 'birthday_reminder', {
          userId: userId || 'default'
        }, {
          skipChecks: skipChecks !== false // 默认true，除非明确设置为false
        });
        
        res.json({
          success: true,
          message: 'Scene triggered successfully',
          sceneId: sceneId || 'birthday_reminder'
        });
      } catch (error: any) {
        next(error);
      }
    });
    
    // ==================== 管理后台静态文件服务 ====================
    // 注意：静态文件服务应该在API路由之后，但要在错误处理之前
    const pathService = PathService.getInstance();
    const adminDistPath = pathService.getAdminDistDir();
    const fs = require('fs');
    if (fs.existsSync(adminDistPath)) {
      // 提供管理后台静态文件（React应用）
      // 使用更明确的路径匹配，确保静态资源能正确加载
      this.app.use('/admin/assets', express.static(path.join(adminDistPath, 'assets'), {
        maxAge: '1h', // 缓存1小时
        etag: true,
        lastModified: true
      }));
      
      // 提供其他静态文件（如 favicon.ico 等）
      this.app.use('/admin', express.static(adminDistPath, {
        maxAge: '1h',
        etag: true,
        lastModified: true,
        index: false // 不自动提供 index.html（由下面的路由处理）
      }));
      
      // SPA路由支持：所有/admin/*路径都返回index.html（但排除静态资源）
      this.app.get('/admin/*', (req, res, next) => {
        // 如果请求的是API路径，不处理（让API路由处理）
        if (req.path.startsWith('/admin/api/')) {
          return res.status(404).json({ error: 'Not found' });
        }
        
        // 如果请求的是静态资源（assets目录），交给静态文件服务处理
        if (req.path.startsWith('/admin/assets/')) {
          return next();
        }
        
        // 首次启动检测：如果未完成设置，重定向到设置向导
        const setupCompleted = isSetupCompleted();
        if (!setupCompleted && !req.path.startsWith('/admin/setup')) {
          return res.redirect('/admin/setup');
        }
        
        // 返回index.html（由前端路由处理）
        res.sendFile(path.join(adminDistPath, 'index.html'));
      });
      
      logger.info('✅ Admin panel static files served from /admin');
    } else {
      logger.warn('⚠️ Admin panel not found (admin/dist directory does not exist)');
    }
    
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
      // 创建独立频道实例
      this.abpLogChannel = new ABPLogChannel();
      this.distributedServerChannel = new NodeAwareDistributedServerChannel(this.nodeManager);
      this.adminPanelChannel = new AdminPanelChannel(); // 使用独立实现
      // 其他频道暂时禁用
      // this.vcpInfoChannel = new VCPInfoChannelSDK();
      // this.chromeObserverChannel = new ChromeObserverChannelSDK();
      
      // 创建独立WebSocket管理器
      this.websocketManager = new IndependentWebSocketManager({
        enableHeartbeat: false,
        enableCompression: false
      });
      
      // 初始化（传入HTTP server）
      this.websocketManager.initialize(this.server);
      
      // 注册频道（仅注册核心频道）
      this.websocketManager.registerChannel(this.abpLogChannel);
      this.websocketManager.registerChannel(this.distributedServerChannel);
      this.websocketManager.registerChannel(this.adminPanelChannel); // 注册AdminPanel频道
      // 其他频道暂时禁用
      // this.websocketManager.registerChannel(this.vcpInfoChannel);
      // this.websocketManager.registerChannel(this.chromeObserverChannel);
      
      logger.info('✅ WebSocket server configured (independent implementation)');
      logger.info(`📡 WebSocket endpoints (2 channels, backward compatible):`);
      const nodeKey = config.auth.apiKey || '';
      logger.info(`   - /ABPlog/ABP_Key=${nodeKey.substring(0, 10)}...`);
      logger.info(`   - /log/ABP_Key=${nodeKey.substring(0, 10)}...`);
      logger.info(`   - /abp-distributed-server/ABP_Key=${nodeKey.substring(0, 10)}...`);
      logger.info(`   - /distributed-server/ABP_Key=${nodeKey.substring(0, 10)}...`);
      // logger.info(`   - /vcpinfo/VCP_Key=${nodeKey.substring(0, 10)}... (disabled)`);
      // logger.info(`   - /vcp-chrome-observer/VCP_Key=${nodeKey.substring(0, 10)}... (disabled)`);
      // logger.info(`   - /vcp-admin-panel/VCP_Key=${nodeKey.substring(0, 10)}... (disabled)`);
      
      // 🆕 创建DistributedService
      this.distributedService = new DistributedService(this.distributedServerChannel);
      logger.info('✅ Distributed service created');
      
      // 🆕 注入到ProtocolEngine
      if (this.protocolEngine) {
        this.protocolEngine.setDistributedService(this.distributedService);
      }
      
      // 🆕 连接SDK频道事件：工具注册
      this.distributedServerChannel.on('tools_registered', ({ serverId, tools, serverInfo }) => {
        // 分布式工具注册已移除（插件系统弃用）；保留日志以便排查
        logger.info(`🔗 (ignored) tools_registered from ${serverId} - count=${tools.length}`);
      });
      
      // 🆕 连接SDK频道事件：工具注销
      this.distributedServerChannel.on('tools_unregistered', ({ serverId, tools }) => {
        logger.info(`🔗 Unregistering tools from ${serverId}`);
        // SDK频道内部已触发VCPPluginRuntime的unregisterAllDistributedTools
        // 这里无需额外操作
      });
      
      // 🆕 连接SDK频道事件：异步工具结果推送
      this.distributedServerChannel.on('async_tool_result', (data) => {
        logger.info(`🏹 Async tool result received from ${data.serverId}`);
        
        // 转发到VCPLog通道（使用SDK频道方法）
        if (this.abpLogChannel) {
          // 优先提取message字段，提供友好显示
          let friendlyContent: string;
          const result = data.result;
          
          if (result !== undefined && result !== null) {
            if (typeof result === 'object') {
              // 优先级：message > messageForAI > result字段 > formatted
              if (result.message) {
                friendlyContent = result.message;
              } else if (result.messageForAI) {
                friendlyContent = result.messageForAI;
              } else if (result.result !== undefined) {
                friendlyContent = String(result.result);
              } else if (result.status === 'success') {
                friendlyContent = `执行成功`;
              } else {
                friendlyContent = JSON.stringify(result).substring(0, 200);
              }
            } else {
              friendlyContent = String(result).substring(0, 200);
            }
          } else {
            friendlyContent = `插件执行完毕`;
          }
          
          // 使用SDK频道的pushToolLog方法（自动使用VCPToolBox标准格式）
          this.abpLogChannel.pushToolLog({
            status: 'success',
            tool: data.plugin || 'Unknown',
            content: friendlyContent,
            source: 'async_tool_result'
          });
          
          logger.info(`📡 Forwarded async tool result to VCPLog: ${data.plugin}`);
        }
      });
      
      // 🆕 连接disconnect事件（注销工具）
      // Note: SDK频道在handleClose时自动触发tools_unregistered事件
      // 无需单独监听disconnect事件
      
      logger.info('✅ Distributed service integrated and events connected');
      
      // VCPlog现在完全由SDK回调处理，ChatService不再需要手动推送
      
    } catch (error) {
      logger.error('❌ Failed to setup WebSocket server:', error);
      throw error;
    }
  }
  
  private async setupMemoryPipelines(adminConfig: any): Promise<void> {
    const pathService = PathService.getInstance();
    const episodicConfig = adminConfig.memory?.episodic ?? {};

    if (!this.episodicMemoryService) {
      try {
        const episodicDir = path.join(pathService.getDataDir(), 'episodic-timeline');
        pathService.ensureDir(episodicDir);
        const episodicStore = new TimeSeriesEpisodicStore({
          baseDir: episodicDir,
          retentionMs: episodicConfig.retentionMs
        });
        this.episodicMemoryService = new DefaultEpisodicMemoryService(
          episodicStore,
          {
            defaultWindowDays: episodicConfig.defaultWindowDays ?? 30,
            retentionMs: episodicConfig.retentionMs
          },
          this.eventBus
        );
        logger.info('✅ Episodic memory pipeline initialized');
      } catch (error: any) {
        logger.warn(`[MemoryPipeline] Failed to initialize episodic store: ${error?.message ?? error}`);
      }
    }

    if (!this.semanticMemoryService) {
      try {
        const semanticConfig = adminConfig.memory?.semantic ?? {};
        const vectorizer = adminConfig?.rag?.vectorizer ?? {};
        const embeddingDimensions =
          semanticConfig.embeddingDimensions ||
          vectorizer.dimensions ||
          vectorizer.dim ||
          1536;
        const semanticDir = path.join(pathService.getVectorStoreDir(), 'semantic-memory');
        const semanticStore = new HNSWSemanticStore({
          workDir: semanticDir,
          dimensions: embeddingDimensions
        });
        this.semanticMemoryService = new DefaultSemanticMemoryService(
          semanticStore,
          {
            embeddingDimensions,
            defaultTopK: semanticConfig.defaultTopK ?? 3,
            maxTopK: semanticConfig.maxTopK ?? 5,
            minSimilarity: semanticConfig.minSimilarity ?? 0.65,
            enableEvents: true
          },
          this.eventBus
        );
        logger.info('✅ Semantic memory pipeline initialized');
      } catch (error: any) {
        logger.warn(`[MemoryPipeline] Failed to initialize semantic store: ${error?.message ?? error}`);
      }
    }

    if (this.semanticMemoryService && !this.episodicSemanticBridge) {
      const vectorizer = adminConfig?.rag?.vectorizer ?? {};
      const embeddingProvider = new VectorizerEmbeddingProvider({
        baseURL: vectorizer.baseURL ?? vectorizer.apiUrl ?? vectorizer.baseUrl,
        apiKey: vectorizer.apiKey,
        model: vectorizer.model,
        dimensions: vectorizer.dimensions ?? vectorizer.dim
      });
      this.episodicSemanticBridge = new EpisodicSemanticBridge(
        this.eventBus,
        this.semanticMemoryService,
        embeddingProvider,
        adminConfig.memory?.episodicBridge
      );
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`\n🛑 Received ${signal}, shutting down gracefully...`);
      
      // 停止接受新请求
      this.server.close(() => {
        logger.info('✅ HTTP server closed');
      });
      
      // 🆕 关闭插件监听器 (暂时禁用)
      // if (this.pluginWatcher) {
      //   await this.pluginWatcher.stop();
      // }
      
      // 关闭DistributedService
      if (this.distributedService) {
        this.distributedService.shutdown();
      }
      
      // 🆕 关闭清理服务
      if (this.cleanupService) {
        this.cleanupService.stop();
        logger.info('✅ Async result cleanup service stopped');
      }
      
      // 🆕 关闭归档服务
      if (this.diaryArchiveService) {
        this.diaryArchiveService.stop();
        logger.info('✅ Diary archive service stopped');
      }
      
      this.nodeManager.stop();
      logger.info('✅ NodeManager heartbeat monitor stopped');
      
      // 关闭WebSocket
      if (this.websocketManager) {
        await this.websocketManager.shutdown();
      }
      
      // 🆕 停止 ChatService 清理定时器
      if (this.chatService) {
        this.chatService.stopCleanupTimer();
        logger.info('✅ ChatService cleanup timer stopped');
      }
      
      // 🆕 停止 ProactivityScheduler
      if (this.proactivityScheduler) {
        this.proactivityScheduler.stop();
        logger.info('✅ ProactivityScheduler stopped');
      }
      
      // 关闭协议引擎
      if (this.protocolEngine) {
        await this.protocolEngine.shutdown();
      }

      if (this.episodicSemanticBridge) {
        this.episodicSemanticBridge.destroy();
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
  const server = new VCPIntelliCore();
  server.initialize().catch(error => {
    logger.error('💥 Fatal error during initialization:', error);
    process.exit(1);
  });
}

