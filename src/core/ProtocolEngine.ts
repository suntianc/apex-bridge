/**
 * Protocol Engine - 协议引擎核心
 * 统一封装协议解析、变量解析和插件管理功能
 */

import { createVariableEngine, IVariableEngine } from './variable';
import {
  TimeProvider,
  PlaceholderProvider,
} from './variable/providers';
import type { AdminConfig } from '../services/ConfigService';
import { logger } from '../utils/logger';
import { ABPProtocolParser } from './protocol/ABPProtocolParser';
import { ABPProtocolConfig } from '../types/abp';
import { RAGService } from 'abp-rag-sdk';

/**
 * 扩展配置接口
 * 用于支持 RAG 和 ABP 配置，避免过度使用 as any
 */
interface ExtendedAdminConfig extends AdminConfig {
  abp?: Partial<ABPProtocolConfig>;
  rag?: {
    enabled: boolean;
    workDir?: string;
    vectorizer?: {
      baseURL?: string;
      apiKey?: string;
      model?: string;
      dimensions?: number;
      dim?: number; // 兼容别名
      batch?: number;
      timeout?: number;
    };
  };
  debugMode?: boolean;
}

export class ProtocolEngine {
  public abpParser!: ABPProtocolParser; // 使用 ! 断言，因为在 constructor 调用的 initializeCore 中必然赋值
  public variableEngine!: IVariableEngine; // 使用接口类型，提供完整的类型安全和代码提示
  public ragService?: RAGService; // 修正类型
  
  constructor(private config: ExtendedAdminConfig) {
    logger.info('🧠 Initializing Protocol Engine (ABP only)...');
    this.initializeCore();
  }
  
  /**
   * 初始化核心组件
   */
  initializeCore(): void {
    // 使用默认值合并配置
    const abpConfig: ABPProtocolConfig = {
      dualProtocolEnabled: false,
      errorRecoveryEnabled: true,
      jsonRepair: { enabled: true, strict: false },
      noiseStripping: { enabled: true, aggressive: false },
      boundaryValidation: { enabled: true, strict: false },
      fallback: { enabled: true, toPlainText: true },
      variable: { cacheEnabled: true, cacheTTL: 60000 },
      ...this.config.abp
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

  /**
   * 获取RAG服务实例
   * 用于访问 abp-rag-sdk 的 RAG 能力
   * 
   * @returns RAG服务实例，如果未初始化则返回 undefined
   */
  getRAGService(): RAGService | undefined {
    return this.ragService;
  }

  /**
   * 规范化 RAG Vectorizer 配置
   * 提取 URL 规范化逻辑，避免在 initialize 中过度耦合
   * 
   * @param vectorizer - RAG vectorizer 配置
   * @returns 规范化后的配置对象
   */
  private normalizeVectorizerConfig(vectorizer?: ExtendedAdminConfig['rag']['vectorizer']): any {
    if (!vectorizer) {
      return undefined;
    }

    const baseURL = vectorizer.baseURL?.trim();
    let apiUrl: string | undefined;

    if (baseURL && baseURL.length > 0) {
      const normalizedBase = baseURL.replace(/\/+$/, '');
      const hasEmbeddingsSuffix = normalizedBase.toLowerCase().endsWith('/embeddings');
      apiUrl = hasEmbeddingsSuffix ? normalizedBase : `${normalizedBase}/embeddings`;
    }

    if (!apiUrl) {
      logger.warn('⚠️ RAG vectorizer baseURL missing, embeddings API will not be reachable');
    }

    const resolvedConfig: Record<string, unknown> = {
      apiKey: vectorizer.apiKey,
      model: vectorizer.model,
      dimensions: vectorizer.dimensions || vectorizer.dim,
      batchSize: vectorizer.batch,
      timeout: vectorizer.timeout,
    };

    if (apiUrl) {
      resolvedConfig.apiUrl = apiUrl;
    }

    return resolvedConfig;
  }
  
  async initialize(): Promise<void> {
    try {
      // --- RAG Service Initialization ---
      if (this.config.rag?.enabled) {
        try {
          this.ragService = new RAGService();
          const ragConfig = this.config.rag;
          const vectorizerConfig = this.normalizeVectorizerConfig(ragConfig.vectorizer);
          
          await this.ragService.initialize({
            workDir: ragConfig.workDir || './vector_store',
            vectorizer: vectorizerConfig,
            debug: this.config.debugMode
          });
          logger.info('✅ RAG Service initialized (abp-rag-sdk)');
        } catch (error: any) {
          logger.warn(`⚠️ RAG service initialization failed: ${error?.message || error}`);
          // 即使 RAG 失败，也不应该阻断后续 Providers 的注册
          this.ragService = undefined;
        }
      }
      
      // --- Variable Providers Registration ---
      
      // Layer 1 (10-30): 系统内置变量
      this.variableEngine.registerProvider(new TimeProvider());
      logger.debug('✅ [Layer1] TimeProvider registered (priority: 10)');
      
      // Layer 2 (40-60): 配置驱动变量
      const placeholderProvider = new PlaceholderProvider();
      this.variableEngine.registerProvider(placeholderProvider);
      logger.debug('✅ [Layer2] PlaceholderProvider registered (priority: 60)');

      logger.info('🎉 All Variable providers registered');

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
   * 清理所有资源，包括 RAG Service 的生命周期管理
   */
  async shutdown(): Promise<void> {
    logger.info('🛑 Shutting down Protocol Engine...');
    
    try {
      // 1. 清理 Variable Engine
      if (this.variableEngine) {
        if (typeof this.variableEngine.reset === 'function') {
          this.variableEngine.reset();
        }
        logger.info('✅ Variable engine reset');
      }
      
      // 2. 🆕 关键修复：清理 RAG Service（防止资源泄漏）
      if (this.ragService) {
        // 尝试调用 RAGService 的清理方法
        // 注意：需要根据 abp-rag-sdk 的实际 API 调整方法名
        if (typeof (this.ragService as any).shutdown === 'function') {
          await (this.ragService as any).shutdown();
          logger.info('✅ RAG Service shut down');
        } else if (typeof (this.ragService as any).close === 'function') {
          await (this.ragService as any).close();
          logger.info('✅ RAG Service closed');
        } else if (typeof (this.ragService as any).destroy === 'function') {
          await (this.ragService as any).destroy();
          logger.info('✅ RAG Service destroyed');
        } else {
          logger.debug('⚠️ RAG Service has no explicit cleanup method, skipping');
        }
        this.ragService = undefined;
      }
      
      logger.info('✅ Protocol Engine shut down successfully');
    } catch (error) {
      logger.error('❌ Error during Protocol Engine shutdown:', error);
      // Shutdown 错误通常记录即可，不建议抛出，除非需要上层通过 exit code 反应
    }
  }
}
