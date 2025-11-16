/**
 * SetupController - 设置向导API控制器
 */

import { Request, Response } from 'express';
import { ConfigService, AdminConfig } from '../../services/ConfigService';
import { logger } from '../../utils/logger';
import { PathService } from '../../services/PathService';
import * as fs from 'fs';
import * as path from 'path';

const configService = ConfigService.getInstance();
const pathService = PathService.getInstance();

/**
 * 设置阶段的配置验证（只验证核心必需字段）
 */
function validateSetupConfig(config: AdminConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 验证管理员账户
  if (!config.auth.admin?.username || config.auth.admin.username.length < 3) {
    errors.push('管理员用户名至少需要3个字符');
  }
  if (!config.auth.admin?.password || config.auth.admin.password.length < 6) {
    errors.push('管理员密码至少需要6个字符');
  }

  // 验证默认LLM提供商是否已配置
  if (!config.llm.defaultProvider) {
    errors.push('必须选择默认LLM提供商');
  } else {
    const providerKey = config.llm.defaultProvider as keyof typeof config.llm;
    const defaultProviderConfig = config.llm[providerKey];
    // 检查配置是否存在且是对象类型（不是字符串）
    if (!defaultProviderConfig || typeof defaultProviderConfig !== 'object' || Array.isArray(defaultProviderConfig)) {
      errors.push(`默认LLM提供商 '${config.llm.defaultProvider}' 必须配置`);
    } else if (!(defaultProviderConfig as any).apiKey) {
      errors.push(`默认LLM提供商 '${config.llm.defaultProvider}' 必须配置 API Key`);
    }
  }

  // 验证RAG配置（如果启用）
  if (config.rag?.enabled && config.rag.vectorizer) {
    const vectorizerBaseURL =
      config.rag.vectorizer.baseURL ||
      (config.rag.vectorizer as any).baseUrl ||
      (config.rag.vectorizer as any).apiUrl;
    if (!vectorizerBaseURL || !config.rag.vectorizer.apiKey) {
      errors.push('启用RAG功能时，必须配置 Vectorizer Base URL 和 API Key');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 检查设置向导状态
 * GET /api/setup/status
 */
export async function getSetupStatus(req: Request, res: Response): Promise<void> {
  try {
    const isCompleted = configService.isSetupCompleted();
    const configPath = pathService.getConfigFilePath();
    const envPath = path.join(pathService.getRootDir(), '.env');
    
    const hasEnvFile = fs.existsSync(envPath);
    
    res.json({
      setup_completed: isCompleted,
      has_env_file: hasEnvFile,
      config_file_exists: fs.existsSync(configPath)
    });
  } catch (error: any) {
    logger.error('❌ Failed to get setup status:', error);
    res.status(500).json({
      error: 'Failed to get setup status',
      message: error.message
    });
  }
}

/**
 * 完成设置向导
 * POST /api/setup/complete
 */
export async function completeSetup(req: Request, res: Response): Promise<void> {
  try {
    if (configService.isSetupCompleted()) {
      res.status(403).json({
        error: 'Setup already completed',
        message: 'Setup flow is locked after completion. Please use admin APIs to modify configuration.'
      });
      return;
    }

    const { config } = req.body;
    
    if (!config) {
      res.status(400).json({
        error: 'Configuration is required'
      });
      return;
    }
    
    // 读取当前配置（如果存在）
    const currentConfig = configService.readConfig();
    
    // 合并新配置
    const updatedConfig = {
      ...currentConfig,
      ...config,
      setup_completed: true
    };
    
    // 设置阶段的验证：只验证核心必需字段
    const setupValidation = validateSetupConfig(updatedConfig);
    if (!setupValidation.valid) {
      res.status(400).json({
        error: 'Configuration validation failed',
        errors: setupValidation.errors
      });
      return;
    }
    
    // 保存配置
    configService.writeConfig(updatedConfig);
    
    // 清除配置缓存，确保下次读取时获取最新状态
    configService.clearCache();
    
    logger.info('✅ Setup completed');
    
    res.json({
      success: true,
      message: 'Setup completed successfully',
      setup_completed: true
    });
  } catch (error: any) {
    logger.error('❌ Failed to complete setup:', error);
    res.status(500).json({
      error: 'Failed to complete setup',
      message: error.message
    });
  }
}

/**
 * 从.env文件导入配置
 * POST /api/setup/migrate-from-env
 */
export async function migrateFromEnv(req: Request, res: Response): Promise<void> {
  try {
    if (configService.isSetupCompleted()) {
      res.status(403).json({
        error: 'Setup already completed',
        message: 'Environment migration is only allowed before initial setup.'
      });
      return;
    }

    const envPath = path.join(pathService.getRootDir(), '.env');
    
    if (!fs.existsSync(envPath)) {
      res.status(404).json({
        error: '.env file not found'
      });
      return;
    }
    
    // 读取.env文件
    const envContent = fs.readFileSync(envPath, 'utf-8');
    
    // 解析.env文件
    const envConfig: Record<string, string> = {};
    const lines = envContent.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, ''); // 移除引号
          envConfig[key] = value;
        }
      }
    }
    
    // 转换为AdminConfig格式
    const adminConfig = configService.readConfig();
    
    // 映射环境变量到配置对象
    // 系统参数
    if (envConfig.PORT) {
      adminConfig.server.port = parseInt(envConfig.PORT) || 8088;
    }
    if (envConfig.HOST) {
      adminConfig.server.host = envConfig.HOST;
    }
    if (envConfig.NODE_ENV) {
      adminConfig.server.nodeEnv = envConfig.NODE_ENV as 'development' | 'production' | 'test';
    }
    if (envConfig.DEBUG_MODE) {
      adminConfig.server.debugMode = envConfig.DEBUG_MODE === 'true';
    }
    
    // 认证配置
    // 读取 ABP_KEY（ABP-only）
    const envKey = envConfig.ABP_KEY;
    if (envKey) {
      // 从.env导入密钥到apiKey（节点认证密钥）
      adminConfig.auth.apiKey = envKey;
      // ABP-only：不再处理旧的 vcpKey 字段
      // 不再支持 VCP_KEY
    }
    // 🆕 读取 ABP_API_KEY 到新的 ApiKeyInfo[] 格式（ABP-only）
    const envApiKey = envConfig.ABP_API_KEY;
    if (envApiKey) {
      const oldApiKeys = envApiKey.split(',').map(k => k.trim()).filter(k => k);
      adminConfig.auth.apiKeys = oldApiKeys.map((key, index) => ({
        id: `migrated-${Date.now()}-${index}`,
        name: `迁移的Key-${index + 1}`,
        key: key,
        createdAt: Date.now(),
        lastUsedAt: undefined
      }));
    }
    
    // 插件配置
    if (envConfig.PLUGIN_DIR) {
      adminConfig.plugins.directory = envConfig.PLUGIN_DIR;
    }
    if (envConfig.PLUGIN_AUTO_LOAD) {
      adminConfig.plugins.autoLoad = envConfig.PLUGIN_AUTO_LOAD !== 'false';
    }
    
    // LLM配置
    if (envConfig.LLM_DEFAULT_PROVIDER) {
      adminConfig.llm.defaultProvider = envConfig.LLM_DEFAULT_PROVIDER;
    }
    
    // OpenAI
    if (envConfig.OPENAI_API_KEY) {
      adminConfig.llm.openai = {
        apiKey: envConfig.OPENAI_API_KEY,
        baseURL: envConfig.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        defaultModel: envConfig.OPENAI_DEFAULT_MODEL || 'gpt-4',
        timeout: parseInt(envConfig.OPENAI_TIMEOUT || '60000'),
        maxRetries: parseInt(envConfig.OPENAI_MAX_RETRIES || '3')
      };
    }
    
    // DeepSeek
    if (envConfig.DEEPSEEK_API_KEY) {
      adminConfig.llm.deepseek = {
        apiKey: envConfig.DEEPSEEK_API_KEY,
        baseURL: envConfig.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
        defaultModel: envConfig.DEEPSEEK_DEFAULT_MODEL || 'deepseek-chat',
        timeout: parseInt(envConfig.DEEPSEEK_TIMEOUT || '60000'),
        maxRetries: parseInt(envConfig.DEEPSEEK_MAX_RETRIES || '3')
      };
    }
    
    // Zhipu
    if (envConfig.ZHIPU_API_KEY) {
      const mode = envConfig.ZHIPU_MODE || 'default';
      let baseURL = envConfig.ZHIPU_BASE_URL;
      if (!baseURL) {
        baseURL = mode === 'coding' 
          ? 'https://open.bigmodel.cn/api/coding/paas/v4'
          : 'https://open.bigmodel.cn/api/paas/v4';
      }
      
      adminConfig.llm.zhipu = {
        apiKey: envConfig.ZHIPU_API_KEY,
        baseURL: baseURL,
        defaultModel: envConfig.ZHIPU_DEFAULT_MODEL || 'glm-4',
        timeout: parseInt(envConfig.ZHIPU_TIMEOUT || '60000'),
        maxRetries: parseInt(envConfig.ZHIPU_MAX_RETRIES || '3'),
        mode: mode as 'default' | 'coding'
      };
    }
    
    // Claude
    if (envConfig.CLAUDE_API_KEY) {
      adminConfig.llm.claude = {
        apiKey: envConfig.CLAUDE_API_KEY,
        baseURL: envConfig.CLAUDE_BASE_URL || 'https://api.anthropic.com/v1',
        defaultModel: envConfig.CLAUDE_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022',
        timeout: parseInt(envConfig.CLAUDE_TIMEOUT || '60000'),
        maxRetries: parseInt(envConfig.CLAUDE_MAX_RETRIES || '3')
      };
    }
    
    // Ollama
    if (envConfig.OLLAMA_BASE_URL) {
      adminConfig.llm.ollama = {
        baseURL: envConfig.OLLAMA_BASE_URL,
        defaultModel: envConfig.OLLAMA_DEFAULT_MODEL || 'llama3',
        timeout: parseInt(envConfig.OLLAMA_TIMEOUT || '120000'),
        maxRetries: parseInt(envConfig.OLLAMA_MAX_RETRIES || '2')
      };
    }
    
    // Custom
    if (envConfig.CUSTOM_API_KEY || envConfig.CUSTOM_BASE_URL) {
      adminConfig.llm.custom = {
        apiKey: envConfig.CUSTOM_API_KEY,
        baseURL: envConfig.CUSTOM_BASE_URL || 'http://localhost:8080/v1',
        defaultModel: envConfig.CUSTOM_DEFAULT_MODEL || 'custom-model',
        timeout: parseInt(envConfig.CUSTOM_TIMEOUT || '60000'),
        maxRetries: parseInt(envConfig.CUSTOM_MAX_RETRIES || '3')
      };
    }
    
    // RAG配置
    if (envConfig.RAG_ENABLED === 'true') {
      adminConfig.rag = adminConfig.rag || {
        enabled: true,
        storagePath: envConfig.RAG_STORAGE_PATH || './vector_store',
        vectorizer: undefined
      };
      adminConfig.rag.enabled = true;
      
      if (envConfig.RAG_STORAGE_PATH) {
        adminConfig.rag.storagePath = envConfig.RAG_STORAGE_PATH;
      }
      
      const vectorizerURL = envConfig.RAG_VECTORIZER_BASE_URL || envConfig.RAG_VECTORIZER_API_URL;
      if (vectorizerURL && envConfig.RAG_VECTORIZER_API_KEY) {
        adminConfig.rag.vectorizer = {
          provider: envConfig.RAG_VECTORIZER_PROVIDER,
          baseURL: vectorizerURL,
          apiKey: envConfig.RAG_VECTORIZER_API_KEY,
          model: envConfig.RAG_VECTORIZER_MODEL || 'text-embedding-3-small',
          dimensions: envConfig.RAG_VECTORIZER_DIMENSIONS ? parseInt(envConfig.RAG_VECTORIZER_DIMENSIONS) : undefined,
          dim: envConfig.RAG_VECTORIZER_DIMENSIONS ? parseInt(envConfig.RAG_VECTORIZER_DIMENSIONS) : undefined,
          batch: envConfig.RAG_VECTORIZER_BATCH ? parseInt(envConfig.RAG_VECTORIZER_BATCH) : undefined,
          timeout: envConfig.RAG_VECTORIZER_TIMEOUT ? parseInt(envConfig.RAG_VECTORIZER_TIMEOUT) : undefined
        };
      }
      
      // 🆕 RAG 检索模式配置
      if (envConfig.RAG_DEFAULT_MODE) {
        adminConfig.rag.defaultMode = envConfig.RAG_DEFAULT_MODE as 'basic' | 'time' | 'group' | 'rerank';
      }
      if (envConfig.RAG_DEFAULT_K) {
        adminConfig.rag.defaultK = parseInt(envConfig.RAG_DEFAULT_K);
      }
      if (envConfig.RAG_MAX_K) {
        adminConfig.rag.maxK = parseInt(envConfig.RAG_MAX_K);
      }
      if (envConfig.RAG_MAX_MULTIPLIER) {
        adminConfig.rag.maxMultiplier = parseFloat(envConfig.RAG_MAX_MULTIPLIER);
      }
      if (envConfig.RAG_SEMANTIC_WEIGHT) {
        adminConfig.rag.semanticWeight = parseFloat(envConfig.RAG_SEMANTIC_WEIGHT);
      }
      if (envConfig.RAG_TIME_WEIGHT) {
        adminConfig.rag.timeWeight = parseFloat(envConfig.RAG_TIME_WEIGHT);
      }
      if (envConfig.RAG_SIMILARITY_THRESHOLD) {
        adminConfig.rag.similarityThreshold = parseFloat(envConfig.RAG_SIMILARITY_THRESHOLD);
      }
      
      // 🆕 语义组配置
      if (envConfig.SEMANTIC_GROUP_CONFIG || envConfig.SEMANTIC_GROUP_WEIGHT) {
        adminConfig.rag.semanticGroup = {
          configPath: envConfig.SEMANTIC_GROUP_CONFIG || './config/semantic_groups.json',
          weight: envConfig.SEMANTIC_GROUP_WEIGHT ? parseFloat(envConfig.SEMANTIC_GROUP_WEIGHT) : 0.5
        };
      }
      
      // 🆕 Rerank 配置
      if (envConfig.RERANK_ENABLED === 'true') {
        adminConfig.rag.rerank = {
          enabled: true,
          baseURL: envConfig.RERANK_BASE_URL || envConfig.RERANK_API_URL || '',
          apiKey: envConfig.RERANK_API_KEY || '',
          model: envConfig.RERANK_MODEL || 'rerank-english-v2.0',
          multiplier: envConfig.RERANK_MULTIPLIER ? parseFloat(envConfig.RERANK_MULTIPLIER) : 2.0,
          timeout: envConfig.RERANK_TIMEOUT ? parseInt(envConfig.RERANK_TIMEOUT) : 5000
        };
      }
      
      // 🆕 Tag 配置
      if (envConfig.RAG_TAGS_CONFIG) {
        adminConfig.rag.tagsConfig = envConfig.RAG_TAGS_CONFIG;
      }
      
      // 🆕 日记归档配置
      if (envConfig.DIARY_ARCHIVE_AFTER_DAYS) {
        adminConfig.rag.diaryArchiveAfterDays = parseInt(envConfig.DIARY_ARCHIVE_AFTER_DAYS);
      }
    }
    
    // Memory配置
    if (envConfig.MEMORY_SYSTEM) {
      adminConfig.memory = adminConfig.memory || {};
      adminConfig.memory.system = envConfig.MEMORY_SYSTEM;
    }
    if (envConfig.VERIFY_MEMORY_SERVICE) {
      adminConfig.memory = adminConfig.memory || {};
      adminConfig.memory.verifyMemoryService = envConfig.VERIFY_MEMORY_SERVICE === 'true';
    }
    
    // 日志配置
    if (envConfig.LOG_LEVEL || envConfig.LOG_FILE) {
      adminConfig.logging = {
        level: envConfig.LOG_LEVEL || 'info',
        file: envConfig.LOG_FILE || './logs/intellicore.log'
      };
    }
    
    // 性能配置
    if (envConfig.WORKER_POOL_SIZE || envConfig.REQUEST_TIMEOUT || envConfig.MAX_REQUEST_SIZE) {
      adminConfig.performance = {
        workerPoolSize: envConfig.WORKER_POOL_SIZE ? parseInt(envConfig.WORKER_POOL_SIZE) : 4,
        requestTimeout: envConfig.REQUEST_TIMEOUT ? parseInt(envConfig.REQUEST_TIMEOUT) : 60000,
        maxRequestSize: envConfig.MAX_REQUEST_SIZE || '50mb'
      };
    }
    
    // 保存配置（但不标记为完成设置，让用户确认）
    configService.writeConfig(adminConfig);
    
    logger.info('✅ Configuration migrated from .env file');
    
    res.json({
      success: true,
      message: 'Configuration migrated from .env file',
      config: adminConfig
    });
  } catch (error: any) {
    logger.error('❌ Failed to migrate from .env:', error);
    res.status(500).json({
      error: 'Failed to migrate from .env',
      message: error.message
    });
  }
}

