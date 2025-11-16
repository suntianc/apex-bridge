/**
 * Protocol Engine - 协议引擎核心
 * 统一封装协议解析、变量解析和插件管理功能
 * 仅支持ABP协议，不再支持VCP协议
 */

// 独立实现 - 不再依赖vcp-intellicore-sdk
import { createVariableEngine } from './variable';
import {
  TimeProvider,
  EnvironmentProvider,
  PlaceholderProvider,
  AgentProvider,
  AsyncResultProvider,
  ToolDescriptionProvider,
  DiaryProvider,
  RAGProvider,
  RAGMode,
} from './variable/providers';
// PluginRuntime removed in skills-only architecture
import * as path from 'path';
import { VCPConfig } from '../types';
import { logger } from '../utils/logger';
import { DistributedService } from '../services/DistributedService';
import { PathService } from '../services/PathService';
import { ABPProtocolParser } from './protocol/ABPProtocolParser';
import { ABPProtocolConfig } from '../types/abp';

export class ProtocolEngine {
  public abpParser: ABPProtocolParser;
  public variableEngine: any;
  // pluginRuntime removed
  private distributedService?: DistributedService;
  public ragService?: any; // RAG服务实例
  private diaryService?: any; // 日记服务实例
  // Skills 描述生成器绑定（通过 ToolDescriptionProvider）
  private toolDescProvider?: ToolDescriptionProvider;
  
  constructor(private config: VCPConfig) {
    logger.info('🧠 Initializing Protocol Engine (ABP only)...');
    // 🔧 立即初始化核心组件，避免后续使用时为undefined
    this.initializeCore();
  }
  
  /**
   * 设置插件执行回调（使用SDK API）
   */
  setExecutionCallback(callback: (event: any) => void): void {
    // Legacy callback for plugin runtime is removed. Keep method for API compatibility.
    logger.info('[ProtocolEngine] Execution callback ignored (plugin system removed)');
  }
  
  /**
   * 初始化核心组件（不加载插件）
   */
  initializeCore(): void {
    // 1. 初始化ABP协议解析器（仅支持ABP协议）
    const abpConfig: ABPProtocolConfig = {
      dualProtocolEnabled: false, // 不再支持双协议模式
      errorRecoveryEnabled: true,
      jsonRepair: { enabled: true, strict: false },
      noiseStripping: { enabled: true, aggressive: false },
      boundaryValidation: { enabled: true, strict: false },
      fallback: { enabled: true, toVCP: false, toPlainText: true }, // 移除VCP fallback
      variable: { cacheEnabled: true, cacheTTL: 60000, reuseVCPProviders: true },
      ...(this.config as any).abp
    };
    this.abpParser = new ABPProtocolParser(abpConfig);
    logger.info('✅ ABPProtocolParser initialized (ABP only)');
    
    // 2. 初始化变量引擎（使用SDK工厂函数）
    this.variableEngine = createVariableEngine();
    logger.info('✅ VariableEngine initialized (independent implementation)');
  }

  /**
   * 解析工具请求（仅支持ABP协议）
   * 
   * @param content - AI响应内容
   * @returns 解析结果（ABP格式）
   */
  parseToolRequests(content: string): any[] {
    // 仅使用ABP协议解析
    const abpResult = this.abpParser.parseToolRequests(content);
    
    if (abpResult.success && abpResult.toolCalls.length > 0) {
      // ABP解析成功，返回ABP格式的工具调用
      logger.debug(`[ProtocolEngine] ABP protocol parsed ${abpResult.toolCalls.length} tool calls`);
      return abpResult.toolCalls.map((call) => ({
        name: call.tool,
        args: call.parameters,
        abpCallId: call.id,
        protocol: 'abp'
      }));
    }
    
    // ABP解析失败，返回空数组（不再fallback到VCP）
    if (!abpResult.success) {
      logger.debug(`[ProtocolEngine] ABP protocol parsing failed: ${abpResult.error || 'Unknown error'}`);
      if (abpResult.fallback === 'plain-text') {
        logger.debug('[ProtocolEngine] Falling back to plain text response');
      }
    }
    
    return [];
  }

  /**
   * 获取ABP协议解析器
   * 
   * @returns ABP协议解析器
   */
  getABPParser(): ABPProtocolParser {
    return this.abpParser;
  }
  
  async initialize(): Promise<void> {
    try {
      // 初始化RAG服务（如果配置启用）
      if ((this.config as any).rag?.enabled) {
        try {
          // 使用require避免在未安装RAG包时触发TS编译期错误
          // 优先级：abp-rag-sdk > @vcp/rag > vcp-intellicore-rag (向后兼容)
           
          let ragPkg: any;
          let ragRequireError: Error | undefined;
          try {
            ragPkg = require('abp-rag-sdk');
            logger.info('ℹ️ Using abp-rag-sdk');
          } catch (error: any) {
            ragRequireError = error;
            try {
              ragPkg = require('@vcp/rag');
              logger.info('ℹ️ abp-rag-sdk not found, fallback to @vcp/rag');
              ragRequireError = undefined;
            } catch (fallbackError: any) {
              ragRequireError = fallbackError;
              try {
                ragPkg = require('vcp-intellicore-rag');
                logger.info('ℹ️ @vcp/rag not found, fallback to vcp-intellicore-rag (deprecated)');
                ragRequireError = undefined;
              } catch (legacyError: any) {
                ragRequireError = legacyError;
              }
            }
          }

          if (!ragPkg) {
            throw ragRequireError;
          }

          const RAGService = ragPkg?.RAGService || ragPkg?.default;
          if (RAGService) {
            this.ragService = new RAGService();
            const ragConfig = (this.config as any).rag;
            const vectorizer = ragConfig.vectorizer;

            // 构建vectorizer配置（统一使用 baseURL，兼容 dim/dimensions）
            const vectorizerConfig = vectorizer ? (() => {
              const baseURL = vectorizer.baseURL?.trim();
              const normalizedBase =
                baseURL && baseURL.length > 0
                  ? baseURL.replace(/\/+$/, '')
                  : undefined;
              const hasEmbeddingsSuffix =
                normalizedBase?.toLowerCase().endsWith('/embeddings') ?? false;
              const apiUrl = normalizedBase
                ? hasEmbeddingsSuffix
                  ? normalizedBase
                  : `${normalizedBase}/embeddings`
                : undefined;

              if (!apiUrl) {
                logger.warn('⚠️ RAG vectorizer baseURL missing, embeddings API will not be reachable');
              }

              const resolvedConfig: Record<string, unknown> = {
                apiKey: vectorizer.apiKey,
                model: vectorizer.model,
                dimensions: vectorizer.dimensions || vectorizer.dim,
                batchSize: vectorizer.batch,
                timeout: vectorizer.timeout
              };

              if (apiUrl) {
                resolvedConfig.apiUrl = apiUrl;
              }

              return resolvedConfig;
            })() : undefined;
            
            await this.ragService.initialize({
              workDir: ragConfig.workDir || './vector_store',
              vectorizer: vectorizerConfig,
              debug: this.config.debugMode
            });
            logger.info('✅ RAG Service initialized');
          } else {
            logger.warn('⚠️ @vcp/rag package found but RAGService export missing, skip initialization');
          }
        } catch (error: any) {
          logger.warn(`⚠️ @vcp/rag not available or initialization failed: ${error?.message || error}`);
        }
      }
      
      // 插件系统已移除，无需设置依赖注入容器
      
      // 2. 注册内置Variable Providers（命名空间架构 v2.0）
      // 🔑 新优先级体系：
      // Layer 1 (10-30): 系统内置变量
      // Layer 2 (40-60): 配置驱动变量  
      // Layer 3 (70-95): 动态内容变量
      
      // Layer 1: 系统内置变量
      // TimeProvider (priority: 10) - {{time}}, {{date}}, {{datetime}}
      this.variableEngine.registerProvider(new TimeProvider());
      logger.debug('✅ [Layer1] TimeProvider registered (priority: 10)');
      
      // Layer 2: 配置驱动变量
      // EnvironmentProvider (priority: 40) - {{env:xxx}}, {{Var:xxx}}, {{Tar:xxx}}
      this.variableEngine.registerProvider(new EnvironmentProvider(['Var', 'Tar', 'Sar']));
      logger.debug('✅ [Layer2] EnvironmentProvider registered (priority: 40)');
      
      // PlaceholderProvider (priority: 60) - 静态占位符
      const placeholderProvider = new PlaceholderProvider();
      this.variableEngine.registerProvider(placeholderProvider);
      logger.debug('✅ [Layer2] PlaceholderProvider registered (priority: 60)');
      
      // Layer 3: 动态内容变量
      // AgentProvider (priority: 70) - {{agent:xxx}}
      const pathService = PathService.getInstance();
      const agentDir = pathService.getAgentDir();
      const agentProvider = new AgentProvider({
        agentDirectory: agentDir,
        enableCache: true,
        cacheTTL: 5 * 60 * 1000 // 5分钟
      });
      this.variableEngine.registerProvider(agentProvider);
      logger.debug(`✅ [Layer3] AgentProvider registered (priority: 70, namespace: agent)`);
      
      // DiaryProvider (priority: 80) - {{diary:xxx}}
      const diaryProvider = new DiaryProvider({ 
        ragService: this.ragService,
        diaryService: this.diaryService,
        enableCache: true,
        cacheTTL: 5 * 60 * 1000 // 5分钟
      });
      this.variableEngine.registerProvider(diaryProvider);
      logger.debug('✅ [Layer3] DiaryProvider registered (priority: 80, namespace: diary)');
      
      // TODO: 实现独立的SemanticGroupManager（可选功能）
      let semanticGroupManager: any | undefined;
      // 暂时禁用，等待独立实现
      logger.debug('⚠️ SemanticGroupManager temporarily disabled (waiting for independent implementation)');
      
      // TODO: 实现独立的RerankClient（可选功能）
      let rerankClient: any | undefined;
      // 暂时禁用，等待独立实现
      logger.debug('⚠️ RerankClient temporarily disabled (waiting for independent implementation)');

      // RAGProvider (priority: 85) - {{rag:diary:xxx:mode}}
      const ragProvider = new RAGProvider({
        ragService: this.ragService,
        defaultMode: (process.env.RAG_DEFAULT_MODE as any) || RAGMode.Basic,
        defaultK: parseInt(process.env.RAG_DEFAULT_K || '5', 10),
        maxK: parseInt(process.env.RAG_MAX_K || '20', 10),
        maxMultiplier: parseFloat(process.env.RAG_MAX_MULTIPLIER || '5.0'),
        semanticWeight: parseFloat(process.env.RAG_SEMANTIC_WEIGHT || '0.7'),
        timeWeight: parseFloat(process.env.RAG_TIME_WEIGHT || '0.3'),
        semanticGroupManager: semanticGroupManager,
        rerankClient: rerankClient,
      });
      this.variableEngine.registerProvider(ragProvider);
      logger.debug('✅ [Layer3] RAGProvider registered (priority: 85, namespace: rag)');
      
      // ToolDescriptionProvider (priority: 90) - {{ABPAllTools}} / 单工具名
      const toolDescProvider = new ToolDescriptionProvider();
      this.variableEngine.registerProvider(toolDescProvider);
      this.toolDescProvider = toolDescProvider;
      logger.debug('✅ [Layer3] ToolDescriptionProvider registered (priority: 90, namespace: tool)');
      
      // AsyncResultProvider (priority: 95) - {{async:xxx}}（保留对 legacy {{VCP_ASYNC_RESULT::xxx}} 的兼容说明）
      const asyncResultDir = pathService.getAsyncResultDir();
      const asyncResultProvider = new AsyncResultProvider({
        asyncResultDirectory: asyncResultDir
      });
      this.variableEngine.registerProvider(asyncResultProvider);
      logger.debug(`✅ [Layer3] AsyncResultProvider registered (priority: 95, namespace: async)`);
      
      logger.info('🎉 Variable providers registered (Namespace Architecture v2.0)');
      
      // 3.（已迁移）不再加载传统插件，工具能力由 Skills 体系提供
      logger.info('ℹ️ Skipping legacy PluginLoader; using Skills-based tooling');

      // 4. DiaryService 由内置记忆系统托管，取消对 RAGDiaryPlugin 的依赖

    } catch (error) {
      logger.error('❌ Failed to initialize Protocol Engine:', error);
      throw error;
    }
  }
  
  /**
   * 注入 Skills 描述生成器到 ToolDescriptionProvider（由装配层调用）
   */
  setSkillsDescriptionGenerator(generator: any): void {
    if (!this.toolDescProvider) {
      logger.warn('[ProtocolEngine] ToolDescriptionProvider not ready; cannot set Skills generator');
      return;
    }
    try {
      (this.toolDescProvider as any).setSkillsGenerator?.(generator);
      logger.info('✅ SkillsToolDescriptionGenerator bound to ToolDescriptionProvider');
    } catch (e) {
      logger.error('[ProtocolEngine] Failed to bind Skills generator:', e);
    }
  }
  
  /**
   * 设置分布式服务（由server.ts注入）
   * 
   * @param service - DistributedService实例
   */
  setDistributedService(service: DistributedService): void {
    this.distributedService = service;
    // 插件系统已移除，无需注入执行器
    logger.info('✅ Distributed service attached (skills-first architecture)');
  }
  
  /**
   * 获取加载的插件数量
   */
  getPluginCount(): number {
    // 插件系统已移除，保持接口兼容
    return 0;
  }
  
  /**
   * 获取所有插件清单
   */
  getPlugins() {
    // 插件系统已移除，保持接口兼容
    return [];
  }
  
  /**
   * 优雅关闭
   */
  async shutdown(): Promise<void> {
    logger.info('🛑 Shutting down Protocol Engine...');
    
    try {
      // 1. 关闭分布式服务
      if (this.distributedService) {
        this.distributedService.shutdown();
      }
      
      // 2. 重置变量引擎
      if (this.variableEngine) {
        this.variableEngine.reset();
        logger.info('✅ Variable engine reset');
      }
      
      logger.info('✅ Protocol Engine shut down successfully');
    } catch (error) {
      logger.error('❌ Error during Protocol Engine shutdown:', error);
      throw error;
    }
  }
}

