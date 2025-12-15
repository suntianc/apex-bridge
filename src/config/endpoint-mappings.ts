/**
 * API 端点映射配置
 * 
 * 定义各 LLM 提供商针对不同模型类型的 API 端点后缀
 */

import { LLMModelType, ProviderEndpointConfig, EndpointMapping } from '../types/llm-models';

/**
 * 默认端点映射
 * 
 * 大多数提供商遵循 OpenAI 兼容的端点格式
 */
const DEFAULT_ENDPOINT_CONFIG: ProviderEndpointConfig = {
  nlp: '/chat/completions',
  embedding: '/embeddings',
  rerank: '/rerank',
  image: '/images/generations',
  audio: '/audio/transcriptions'
};

/**
 * 各提供商的端点映射配置
 * 
 * 如果某提供商未配置，则使用默认配置
 */
export const PROVIDER_ENDPOINT_MAPPINGS: EndpointMapping = {
  /**
   * OpenAI
   * 文档: https://platform.openai.com/docs/api-reference
   */
  openai: {
    nlp: '/chat/completions',
    embedding: '/embeddings',
    image: '/images/generations',
    audio: '/audio/transcriptions'
    // rerank 暂不支持
  },

  /**
   * DeepSeek
   * 文档: https://platform.deepseek.com/api-docs/
   */
  deepseek: {
    nlp: '/chat/completions',
    embedding: '/embeddings'
    // 其他类型待补充
  },

  /**
   * 智谱 AI (GLM)
   * 文档: https://open.bigmodel.cn/dev/api
   */
  zhipu: {
    nlp: '/chat/completions',
    embedding: '/embeddings'
    // 智谱可能有不同的端点格式，待确认
  },

  /**
   * Ollama (本地模型)
   * 文档: https://github.com/ollama/ollama/blob/main/docs/api.md
   *
   * 注意: Ollama 支持 OpenAI 兼容格式 (/v1/*)
   */
  ollama: {
    nlp: '/chat/completions',
    embedding: '/embeddings'
    // 使用OpenAI兼容的端点格式
  },

  /**
   * Claude (Anthropic)
   * 文档: https://docs.anthropic.com/claude/reference
   * 
   * 注意: Claude 使用不同的 API 格式
   */
  claude: {
    nlp: '/messages'
    // Claude 目前不支持其他类型
  },

  /**
   * Azure OpenAI
   * 文档: https://learn.microsoft.com/en-us/azure/ai-services/openai/
   * 
   * 注意: Azure OpenAI 使用不同的 URL 结构
   */
  azure: {
    nlp: '/chat/completions',
    embedding: '/embeddings'
    // Azure 的端点在 baseURL 中已包含部署名称
  },

  /**
   * 通义千问 (Qwen)
   * 待补充
   */
  qwen: {
    nlp: '/chat/completions',
    embedding: '/embeddings'
  },

  /**
   * 文心一言 (ERNIE)
   * 待补充
   */
  ernie: {
    nlp: '/chat/completions'
  },

  /**
   * Cohere
   * 待补充
   */
  cohere: {
    nlp: '/generate',
    embedding: '/embed',
    rerank: '/rerank'
  },

  /**
   * SiliconFlow
   * 中转服务，兼容 OpenAI 格式
   */
  siliconflow: {
    nlp: '/chat/completions',
    embedding: '/embeddings'
  }
};

/**
 * 获取提供商的端点后缀
 * 
 * @param provider 提供商标识
 * @param modelType 模型类型
 * @returns API 端点后缀，如果未配置则返回默认值
 */
export function getEndpointSuffix(provider: string, modelType: LLMModelType | string): string | undefined {
  const providerConfig = PROVIDER_ENDPOINT_MAPPINGS[provider.toLowerCase()];
  
  if (providerConfig && providerConfig[modelType]) {
    return providerConfig[modelType];
  }
  
  // 使用默认配置
  const defaultConfig = DEFAULT_ENDPOINT_CONFIG[modelType as keyof ProviderEndpointConfig];
  return defaultConfig;
}

/**
 * 获取提供商支持的所有模型类型
 * 
 * @param provider 提供商标识
 * @returns 支持的模型类型列表
 */
export function getSupportedModelTypes(provider: string): string[] {
  const providerConfig = PROVIDER_ENDPOINT_MAPPINGS[provider.toLowerCase()];
  
  if (!providerConfig) {
    // 未配置的提供商，假设支持基本的 nlp 和 embedding
    return ['nlp', 'embedding'];
  }
  
  return Object.keys(providerConfig);
}

/**
 * 构建完整的 API URL
 * 
 * @param baseURL 基础 URL
 * @param endpointSuffix 端点后缀
 * @returns 完整的 API URL
 */
export function buildApiUrl(baseURL: string, endpointSuffix: string): string {
  const normalizedBase = baseURL.replace(/\/+$/, ''); // 移除尾部斜杠
  const normalizedSuffix = endpointSuffix.startsWith('/') ? endpointSuffix : `/${endpointSuffix}`;
  
  return `${normalizedBase}${normalizedSuffix}`;
}

/**
 * 验证端点配置
 * 
 * @param provider 提供商标识
 * @param modelType 模型类型
 * @returns 是否支持该模型类型
 */
export function validateEndpoint(provider: string, modelType: string): boolean {
  const endpoint = getEndpointSuffix(provider, modelType);
  return endpoint !== undefined;
}

