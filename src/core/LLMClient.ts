/**
 * ApexBridge (ABP-only) - LLM客户端
 * 统一的LLM提供商抽象层，支持多提供商切换
 */

import axios, { AxiosInstance } from 'axios';
import { Message, ChatOptions, LLMResponse, LLMProviderConfig, LLMConfig } from '../types';
import { logger } from '../utils/logger';
import { retry, RetryConfig } from '../utils/retry';

/**
 * LLM适配器接口
 */
export interface ILLMAdapter {
  chat(messages: Message[], options: ChatOptions, signal?: AbortSignal): Promise<LLMResponse>;
  streamChat(messages: Message[], options: ChatOptions, signal?: AbortSignal): AsyncIterableIterator<string>;
  getModels(): Promise<string[]>;
}

/**
 * OpenAI兼容适配器（通用）
 * 支持：OpenAI、DeepSeek、智谱、Ollama、自定义提供商
 */
class OpenAICompatibleAdapter implements ILLMAdapter {
  private client: AxiosInstance;
  
  constructor(
    private providerName: string,
    private config: LLMProviderConfig
  ) {
    this.client = axios.create({
      baseURL: this.config.baseURL,
      headers: {
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
        'Content-Type': 'application/json'
      },
      timeout: this.config.timeout || 60000
    });
    
    logger.info(`✅ ${providerName} adapter initialized (${this.config.baseURL})`);
  }
  
  async chat(messages: Message[], options: ChatOptions, signal?: AbortSignal): Promise<LLMResponse> {
    // 获取重试配置（从配置或默认值）
    const maxRetries = this.config.maxRetries || 3;
    const retryConfig: RetryConfig = {
      maxRetries,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      retryOn4xx: false,
      shouldRetry: (error: any) => {
        // 如果请求被中断，不重试
        if (signal?.aborted || error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
          return false;
        }
        // 400 Bad Request 等客户端错误不重试
        if (error.response?.status === 400 || error.response?.status === 401 || 
            error.response?.status === 403 || error.response?.status === 404) {
          return false;
        }
        return true;
      }
    };

    return retry(async () => {
      try {
        // 🔐 排除内部路由参数
        const { provider, ...apiOptions } = options;
        
        // 🎯 根据厂商特性过滤参数
        let finalOptions = { ...apiOptions };
        
        // DeepSeek 不支持 top_k
        if (this.providerName === 'DeepSeek' && 'top_k' in finalOptions) {
          const { top_k, ...rest } = finalOptions;
          finalOptions = rest;
          logger.debug(`[${this.providerName}] Filtered top_k=${top_k}`);
        }
        
        // 🔧 DeepSeek限制：max_tokens 最大8192
        let maxTokens = options.max_tokens;
        if (this.providerName === 'DeepSeek' && maxTokens && maxTokens > 8192) {
          logger.warn(`⚠️  [${this.providerName}] max_tokens ${maxTokens} exceeds limit, capping at 8192`);
          maxTokens = 8192;
        }
        
        const requestBody: any = {
          model: options.model || this.config.defaultModel,
          messages,
          temperature: options.temperature ?? 0.7,
          stream: false,
          ...finalOptions
        };
        
        // 只添加有值的参数，避免发送 undefined
        if (maxTokens !== undefined) requestBody.max_tokens = maxTokens;
        if (options.top_p !== undefined) requestBody.top_p = options.top_p;
        
        logger.info(`[${this.providerName}] Request body snapshot`, {
          model: requestBody.model,
          hasMessages: Array.isArray(requestBody.messages),
          messageCount: Array.isArray(requestBody.messages) ? requestBody.messages.length : undefined
        });

        const response = await this.client.post('/chat/completions', requestBody, {
          signal
        });
        
        return response.data;
      } catch (error: any) {
        // 检查是否被中断
        if (signal?.aborted || error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
          throw error; // 直接抛出，不重试
        }

        logger.error(`❌ ${this.providerName} chat error:`, error.message);
        // 🔍 详细错误信息（用于调试400等错误）
        if (error.response) {
          logger.error(`   HTTP状态: ${error.response.status}`);
          logger.error(`   错误详情: ${JSON.stringify(error.response.data)}`);
        }
        throw new Error(`${this.providerName} request failed: ${error.message}`);
      }
    }, retryConfig);
  }
  
  async *streamChat(messages: Message[], options: ChatOptions, signal?: AbortSignal): AsyncIterableIterator<string> {
    try {
      // 🔐 排除内部路由参数
      const { provider, ...apiOptions } = options;
      
      // 🎯 根据厂商特性过滤参数
      let finalOptions = { ...apiOptions };
      
      // DeepSeek 不支持 top_k
      if (this.providerName === 'DeepSeek' && 'top_k' in finalOptions) {
        const { top_k, ...rest } = finalOptions;
        finalOptions = rest;
        logger.debug(`[${this.providerName}] Stream filtered top_k=${top_k}`);
      }
      
      // 🔧 DeepSeek限制：max_tokens 最大8192
      let maxTokens = options.max_tokens;
      if (this.providerName === 'DeepSeek' && maxTokens && maxTokens > 8192) {
        logger.warn(`⚠️  [${this.providerName}] max_tokens ${maxTokens} exceeds limit, capping at 8192`);
        maxTokens = 8192;
      }
      
      const requestBody: any = {
        model: options.model || this.config.defaultModel,
        messages,
        temperature: options.temperature ?? 0.7,
        stream: true,
        ...finalOptions
      };
      
      // 只添加有值的参数，避免发送 undefined
      if (maxTokens !== undefined) requestBody.max_tokens = maxTokens;
      if (options.top_p !== undefined) requestBody.top_p = options.top_p;
      
      logger.info(`[${this.providerName}] Stream request body snapshot`, {
        model: requestBody.model,
        hasMessages: Array.isArray(requestBody.messages),
        messageCount: Array.isArray(requestBody.messages) ? requestBody.messages.length : undefined
      });

      // 🆕 添加 AbortSignal 支持
      const response = await this.client.post('/chat/completions', requestBody, {
        responseType: 'stream',
        signal: signal  // 传递中断信号
      });
      
      for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n').filter((line: string) => line.trim());
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            
            if (data === '[DONE]') {
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              
              if (content) {
                yield content;
              }
            } catch (e) {
              // Skip parse errors
            }
          }
        }
      }
    } catch (error: any) {
      logger.error(`❌ ${this.providerName} stream error:`, error.message);
      // 🔍 详细错误信息（用于调试400等错误）
      if (error.response) {
        logger.error(`   HTTP状态: ${error.response.status}`);
        logger.error(`   错误详情: ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`${this.providerName} stream request failed: ${error.message}`);
    }
  }
  
  async getModels(): Promise<string[]> {
    try {
      const response = await this.client.get('/models');
      const models = response.data.data || response.data.models || [];
      return models.map((m: any) => m.id || m.name);
    } catch (error: any) {
      logger.warn(`⚠️  Failed to get models from ${this.providerName}:`, error.message);
      // 返回默认模型
      return [this.config.defaultModel];
    }
  }
}

/**
 * Claude适配器（Anthropic API）
 */
class ClaudeAdapter implements ILLMAdapter {
  private client: AxiosInstance;
  
  constructor(private config: LLMProviderConfig) {
    this.client = axios.create({
      baseURL: this.config.baseURL,
      headers: {
        'x-api-key': this.config.apiKey || '',
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      timeout: this.config.timeout || 60000
    });
    
    logger.info(`✅ Claude adapter initialized (${this.config.baseURL})`);
  }
  
  async chat(messages: Message[], options: ChatOptions, signal?: AbortSignal): Promise<LLMResponse> {
    // 获取重试配置
    const maxRetries = this.config.maxRetries || 3;
    const retryConfig: RetryConfig = {
      maxRetries,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      retryOn4xx: false,
      shouldRetry: (error: any) => {
        // 如果请求被中断，不重试
        if (signal?.aborted || error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
          return false;
        }
        // 400 Bad Request 等客户端错误不重试
        if (error.response?.status === 400 || error.response?.status === 401 || 
            error.response?.status === 403 || error.response?.status === 404) {
          return false;
        }
        return true;
      }
    };

    return retry(async () => {
      try {
        // 转换消息格式：分离system和其他消息
        const systemMessages = messages.filter(m => m.role === 'system');
        const otherMessages = messages.filter(m => m.role !== 'system');
        
        const response = await this.client.post('/messages', {
          model: options.model || this.config.defaultModel,
          max_tokens: options.max_tokens || 4096,
          temperature: options.temperature ?? 0.7,
          system: systemMessages.map(m => m.content).join('\n\n') || undefined,
          messages: otherMessages.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content
          })),
          stream: false
        }, {
          signal
        });
        
        // 转换为OpenAI格式
        return {
          id: response.data.id,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: response.data.model,
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: response.data.content[0]?.text || ''
            },
            finish_reason: response.data.stop_reason
          }]
        };
      } catch (error: any) {
        // 检查是否被中断
        if (signal?.aborted || error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
          throw error; // 直接抛出，不重试
        }

        logger.error('❌ Claude chat error:', error.message);
        throw new Error(`Claude request failed: ${error.message}`);
      }
    }, retryConfig);
  }
  
  async *streamChat(messages: Message[], options: ChatOptions, signal?: AbortSignal): AsyncIterableIterator<string> {
    try {
      const systemMessages = messages.filter(m => m.role === 'system');
      const otherMessages = messages.filter(m => m.role !== 'system');
      
      // 🆕 添加 AbortSignal 支持
      const response = await this.client.post('/messages', {
        model: options.model || this.config.defaultModel,
        max_tokens: options.max_tokens || 4096,
        temperature: options.temperature ?? 0.7,
        system: systemMessages.map(m => m.content).join('\n\n') || undefined,
        messages: otherMessages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        })),
        stream: true
      }, {
        responseType: 'stream',
        signal: signal  // 传递中断信号
      });
      
      for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n').filter((line: string) => line.trim());
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            
            try {
              const parsed = JSON.parse(data);
              
              if (parsed.type === 'content_block_delta') {
                const content = parsed.delta?.text;
                if (content) {
                  yield content;
                }
              }
            } catch (e) {
              // Skip parse errors
            }
          }
        }
      }
    } catch (error: any) {
      logger.error('❌ Claude stream error:', error.message);
      throw new Error(`Claude stream request failed: ${error.message}`);
    }
  }
  
  async getModels(): Promise<string[]> {
    // Claude不提供模型列表API，返回常用模型
    return [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ];
  }
}

/**
 * LLM客户端
 */
export class LLMClient {
  private adapters: Map<string, ILLMAdapter> = new Map();
  private defaultProvider: string | null = null;
  
  constructor(config: LLMConfig) {
    logger.info('🤖 Initializing LLM Client with multiple providers...');
    
    // 注册OpenAI
    if (config.openai) {
      this.adapters.set('openai', new OpenAICompatibleAdapter('OpenAI', config.openai));
    }
    
    // 注册DeepSeek
    if (config.deepseek) {
      this.adapters.set('deepseek', new OpenAICompatibleAdapter('DeepSeek', config.deepseek));
    }
    
    // 注册智谱AI
    if (config.zhipu) {
      this.adapters.set('zhipu', new OpenAICompatibleAdapter('ZhipuAI', config.zhipu));
    }
    
    // 注册Claude
    if (config.claude) {
      this.adapters.set('claude', new ClaudeAdapter(config.claude));
    }
    
    // 注册Ollama
    if (config.ollama) {
      this.adapters.set('ollama', new OpenAICompatibleAdapter('Ollama', config.ollama));
    }
    
    // 注册自定义提供商
    if (config.custom) {
      this.adapters.set('custom', new OpenAICompatibleAdapter('Custom', config.custom));
    }
    
    // 设置默认提供商
    if (config.defaultProvider && this.adapters.has(config.defaultProvider)) {
      this.defaultProvider = config.defaultProvider;
    } else {
      // 自动选择第一个可用的提供商
      this.defaultProvider = Array.from(this.adapters.keys())[0] || null;
    }
    
    if (!this.defaultProvider) {
      throw new Error('No LLM providers configured');
    }
    
    logger.info(`✅ LLM Client initialized with ${this.adapters.size} providers`);
    logger.info(`📌 Default provider: ${this.defaultProvider}`);
    logger.info(`📋 Available providers: ${Array.from(this.adapters.keys()).join(', ')}`);
  }
  
  /**
   * 根据模型名称自动检测提供商
   */
  private detectProvider(model?: string): string {
    if (!model) {
      return this.defaultProvider!;
    }
    
    // 根据模型名称前缀判断
    if (model.startsWith('gpt-')) return 'openai';
    if (model.startsWith('deepseek-')) return 'deepseek';
    if (model.startsWith('glm-')) return 'zhipu';
    if (model.startsWith('claude-')) return 'claude';
    if (model.startsWith('llama') || model.startsWith('qwen') || model.startsWith('mistral')) return 'ollama';
    
    // 如果无法判断，使用默认提供商
    return this.defaultProvider!;
  }
  
  /**
   * 获取指定提供商的适配器
   */
  private getAdapter(provider: string): ILLMAdapter {
    const adapter = this.adapters.get(provider);
    
    if (!adapter) {
      throw new Error(`LLM provider '${provider}' not configured. Available: ${Array.from(this.adapters.keys()).join(', ')}`);
    }
    
    return adapter;
  }
  
  async chat(messages: Message[], options: ChatOptions = {}): Promise<LLMResponse> {
    const provider = options.provider || this.detectProvider(options.model);
    const adapter = this.getAdapter(provider);
    
    logger.debug(`💬 Calling LLM: ${provider}, model: ${options.model || 'default'}`);
    
    return await adapter.chat(messages, options);
  }
  
  async *streamChat(messages: Message[], options: ChatOptions = {}, signal?: AbortSignal): AsyncIterableIterator<string> {
    const provider = options.provider || this.detectProvider(options.model);
    const adapter = this.getAdapter(provider);
    
    logger.debug(`🌊 Streaming from LLM: ${provider}, model: ${options.model || 'default'}`);
    
    // 🆕 传递中断信号
    yield* adapter.streamChat(messages, options, signal);
  }
  
  async getAllModels(): Promise<Array<{ id: string; provider: string }>> {
    const models: Array<{ id: string; provider: string }> = [];
    
    for (const [provider, adapter] of this.adapters) {
      try {
        const providerModels = await adapter.getModels();
        models.push(...providerModels.map(id => ({ id, provider })));
      } catch (error: any) {
        logger.warn(`⚠️  Failed to get models from ${provider}:`, error.message);
      }
    }
    
    return models;
  }
  
  /**
   * 获取可用的提供商列表
   */
  getAvailableProviders(): string[] {
    return Array.from(this.adapters.keys());
  }
  
  /**
   * 获取默认提供商
   */
  getDefaultProvider(): string | null {
    return this.defaultProvider;
  }
}
