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
 * 上下文和记忆配置
 */
export interface ContextConfig {
  maxContextLength?: number;     // 最大上下文长度
  contextWindowType?: 'sliding' | 'fixed'; // 上下文窗口类型
  memoryRetention?: number;      // 记忆保留时间（秒）
  contextCompression?: boolean;  // 是否启用上下文压缩
  contextStrategy?: 'truncate' | 'summarize' | 'sliding'; // 上下文溢出策略
}

/**
 * 输出控制配置
 */
export interface OutputConfig {
  maxOutputTokens?: number;      // 最大输出 tokens
  minOutputTokens?: number;      // 最小输出 tokens
  outputFormat?: 'text' | 'json' | 'xml' | 'markdown'; // 输出格式
  streamingEnabled?: boolean;    // 是否启用流式输出
  chunkSize?: number;            // 流式输出块大小
  stopSequences?: string[];      // 停止序列
  responseFormat?: object;       // 响应格式规范（用于 json 模式）
}

/**
 * 高级生成配置
 */
export interface GenerationConfig {
  topP?: number;                 // Top-P 采样
  frequencyPenalty?: number;     // 频率惩罚
  presencePenalty?: number;      // 存在惩罚
  repetitionPenalty?: number;    // 重复惩罚
  seed?: number;                 // 随机种子
  logitBias?: Record<string, number>; // Logit 偏差
  numSequences?: number;         // 生成的序列数量
  bestOf?: number;               // 生成多个序列并返回最佳
}

/**
 * 性能和缓存配置
 */
export interface PerformanceConfig {
  cacheEnabled?: boolean;        // 是否启用缓存
  cacheTTL?: number;             // 缓存 TTL（秒）
  batchSize?: number;            // 批处理大小
  requestTimeout?: number;       // 请求超时（毫秒）
  retryBackoff?: 'exponential' | 'linear'; // 重试退避策略
  maxConcurrentRequests?: number; // 最大并发请求数
  enableMetrics?: boolean;       // 是否启用性能指标
}

/**
 * 模型配置
 */
export interface ModelConfig {
  // 基础配置
  contextWindow?: number;        // 上下文窗口大小
  maxTokens?: number;            // 最大生成 tokens
  temperature?: number;          // 温度参数
  dimensions?: number;           // 向量维度（Embedding 模型）
  topK?: number;                // Top-K（Rerank 模型）

  // ⭐ 新增配置
  contextConfig?: ContextConfig;     // 上下文和记忆配置
  outputConfig?: OutputConfig;       // 输出控制配置
  generationConfig?: GenerationConfig; // 高级生成配置
  performanceConfig?: PerformanceConfig; // 性能和缓存配置

  // 扩展参数
  [key: string]: any;            // 其他模型特定参数
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
  isAceEvolution: boolean;   // 是否为ACE进化专用模型
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
  isAceEvolution?: boolean;  // 是否ACE进化专用（默认 false）
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
  isAceEvolution?: boolean;
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

