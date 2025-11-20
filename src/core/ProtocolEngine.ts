/**
 * Protocol Engine - 协议引擎核心
 * 统一封装协议解析、变量解析和插件管理功能
 */

import { createVariableEngine } from './variable';
import {
  TimeProvider,
  EnvironmentProvider,
  PlaceholderProvider,
  RAGProvider,
  RAGMode,
} from './variable/providers';
import type { AdminConfig } from '../services/ConfigService';
import { logger } from '../utils/logger';
import { PathService } from '../services/PathService';
import { ABPProtocolParser } from './protocol/ABPProtocolParser';
import { ABPProtocolConfig } from '../types/abp';
import { RAGService } from 'abp-rag-sdk';

export class ProtocolEngine {
  public abpParser: ABPProtocolParser;
  public variableEngine: any;
  public ragService?: any;
  
  constructor(private config: AdminConfig) {
    logger.info('🧠 Initializing Protocol Engine (ABP only)...');
    this.initializeCore();
  }
  
  /**
   * 初始化核心组件
   */
  initializeCore(): void {
    const abpConfig: ABPProtocolConfig = {
      dualProtocolEnabled: false,
      errorRecoveryEnabled: true,
      jsonRepair: { enabled: true, strict: false },
      noiseStripping: { enabled: true, aggressive: false },
      boundaryValidation: { enabled: true, strict: false },
      fallback: { enabled: true, toPlainText: true },
      variable: { cacheEnabled: true, cacheTTL: 60000 },
      ...(this.config as any).abp
    };
    this.abpParser = new ABPProtocolParser(abpConfig);
    logger.info('✅ ABPProtocolParser initialized');
    
    this.variableEngine = createVariableEngine();
    logger.info('✅ VariableEngine initialized');
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
      if ((this.config as any).rag?.enabled) {
        try {
          this.ragService = new RAGService();
          const ragConfig = (this.config as any).rag;
          const vectorizer = ragConfig.vectorizer;
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
          logger.info('✅ RAG Service initialized (abp-rag-sdk)');
        } catch (error: any) {
          logger.warn(`⚠️ RAG service initialization failed: ${error?.message || error}`);
        }
      }
      
      // 注册Variable Providers
      // Layer 1 (10-30): 系统内置变量
      this.variableEngine.registerProvider(new TimeProvider());
      logger.debug('✅ [Layer1] TimeProvider registered (priority: 10)');
      
      // Layer 2 (40-60): 配置驱动变量
      this.variableEngine.registerProvider(new EnvironmentProvider(['Var', 'Tar', 'Sar']));
      logger.debug('✅ [Layer2] EnvironmentProvider registered (priority: 40)');
      
      const placeholderProvider = new PlaceholderProvider();
      this.variableEngine.registerProvider(placeholderProvider);
      logger.debug('✅ [Layer2] PlaceholderProvider registered (priority: 60)');
      
      // Layer 3 (70-95): 动态内容变量
      const semanticGroupManager: any | undefined = undefined;
      const rerankClient: any | undefined = undefined;
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
      logger.debug('✅ [Layer3] RAGProvider registered (priority: 85)');

      logger.info('🎉 Variable providers registered');

    } catch (error) {
      logger.error('❌ Failed to initialize Protocol Engine:', error);
      throw error;
    }
  }
  
  getPluginCount(): number {
    return 0;
  }

  getPlugins() {
    return [];
  }
  
  /**
   * 优雅关闭
   */
  async shutdown(): Promise<void> {
    logger.info('🛑 Shutting down Protocol Engine...');
    
    try {
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

