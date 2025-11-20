/**
 * LLM 配置架构 v2.0 - 类型定义
 * 
 * 支持多模型类型的两级配置结构
 */

/**
 * 模型类型枚举
 */
export enum LLMModelType {
  NLP = 'nlp',              // 聊天/文本生成
  EMBEDDING = 'embedding',   // 文本向量化
  RERANK = 'rerank',        // 结果重排序
  IMAGE = 'image',          // 图像生成
  AUDIO = 'audio',          // 语音处理
  OTHER = 'other'           // 其他类型
}

/**
 * 提供商基础配置
 */
export interface ProviderBaseConfig {
  apiKey?: string;                       // API 密钥（可选，Ollama 不需要）
  baseURL: string;                       // API 基础 URL
  timeout?: number;                      // 超时时间（毫秒）
  maxRetries?: number;                   // 最大重试次数
  customHeaders?: Record<string, string>; // 自定义请求头
  [key: string]: any;                    // 其他自定义配置
}

/**
 * LLM 提供商记录
 */
export interface LLMProviderV2 {
  id: number;
  provider: string;           // 提供商标识 (openai, deepseek)
  name: string;              // 显示名称
  description?: string;      // 提供商描述
  baseConfig: ProviderBaseConfig; // 基础配置
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * 模型配置
 */
export interface ModelConfig {
  contextWindow?: number;     // 上下文窗口大小
  maxTokens?: number;         // 最大生成 tokens
  temperature?: number;       // 温度参数
  dimensions?: number;        // 向量维度（Embedding 模型）
  topK?: number;             // Top-K（Rerank 模型）
  [key: string]: any;        // 其他模型特定参数
}

/**
 * LLM 模型记录
 */
export interface LLMModelV2 {
  id: number;
  providerId: number;         // 关联提供商 ID
  modelKey: string;          // 模型标识 (gpt-4, deepseek-chat)
  modelName: string;         // 显示名称
  modelType: LLMModelType;   // 模型类型
  modelConfig: ModelConfig;  // 模型配置
  apiEndpointSuffix?: string; // API 端点后缀
  enabled: boolean;
  isDefault: boolean;        // 是否为该类型的默认模型
  displayOrder: number;      // 显示排序
  createdAt: number;
  updatedAt: number;
}

/**
 * 完整模型信息（包含提供商信息）
 */
export interface LLMModelFull extends LLMModelV2 {
  provider: string;           // 提供商标识
  providerName: string;       // 提供商名称
  providerBaseConfig: ProviderBaseConfig; // 提供商基础配置
  providerEnabled: boolean;   // 提供商是否启用
}

/**
 * 创建提供商输入
 */
export interface CreateProviderInput {
  provider: string;           // 提供商标识
  name: string;              // 显示名称
  description?: string;      // 描述
  baseConfig: ProviderBaseConfig; // 基础配置
  enabled?: boolean;         // 是否启用（默认 true）
}

/**
 * 更新提供商输入
 */
export interface UpdateProviderInput {
  name?: string;
  description?: string;
  baseConfig?: Partial<ProviderBaseConfig>;
  enabled?: boolean;
}

/**
 * 创建模型输入
 */
export interface CreateModelInput {
  modelKey: string;          // 模型标识
  modelName: string;         // 显示名称
  modelType: LLMModelType;   // 模型类型
  modelConfig?: ModelConfig; // 模型配置
  apiEndpointSuffix?: string; // API 端点后缀
  enabled?: boolean;         // 是否启用（默认 true）
  isDefault?: boolean;       // 是否默认（默认 false）
  displayOrder?: number;     // 显示排序（默认 0）
}

/**
 * 更新模型输入
 */
export interface UpdateModelInput {
  modelName?: string;
  modelConfig?: Partial<ModelConfig>;
  apiEndpointSuffix?: string;
  enabled?: boolean;
  isDefault?: boolean;
  displayOrder?: number;
}

/**
 * 模型查询参数
 */
export interface ModelQueryParams {
  providerId?: number;       // 按提供商筛选
  modelType?: LLMModelType;  // 按类型筛选
  enabled?: boolean;         // 按启用状态筛选
  isDefault?: boolean;       // 仅查询默认模型
}

/**
 * API 端点映射配置
 */
export interface EndpointMapping {
  [provider: string]: {
    [modelType: string]: string; // 端点后缀
  };
}

/**
 * 端点映射配置项
 */
export interface ProviderEndpointConfig {
  nlp?: string;
  embedding?: string;
  rerank?: string;
  image?: string;
  audio?: string;
  [key: string]: string | undefined;
}

