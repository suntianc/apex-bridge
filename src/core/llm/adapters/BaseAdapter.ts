/**
 * BaseAdapter - LLM适配器基类
 * 提供通用的OpenAI兼容适配器实现
 */

import axios, { AxiosInstance } from 'axios';
import { Message, ChatOptions, LLMResponse, LLMProviderConfig } from '../../../types';
import { logger } from '../../../utils/logger';
import { retry, RetryConfig } from '../../../utils/retry';

/**
 * LLM适配器接口
 */
export interface ILLMAdapter {
  chat(messages: Message[], options: ChatOptions, signal?: AbortSignal): Promise<LLMResponse>;
  streamChat(messages: Message[], options: ChatOptions, signal?: AbortSignal): AsyncIterableIterator<string>;
  getModels(): Promise<string[]>;
}

/**
 * OpenAI兼容适配器基类
 */
export abstract class BaseOpenAICompatibleAdapter implements ILLMAdapter {
  protected client: AxiosInstance;
  protected providerName: string;
  protected config: LLMProviderConfig;

  constructor(providerName: string, config: LLMProviderConfig) {
    this.providerName = providerName;
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseURL,
      headers: {
        ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` }),
        'Content-Type': 'application/json'
      },
      timeout: config.timeout || 60000
    });

    logger.info(`✅ ${providerName} adapter initialized (${config.baseURL})`);
  }

  /**
   * 过滤选项（子类可覆盖）
   */
  protected filterOptions(options: ChatOptions): ChatOptions {
    return options;
  }

  /**
   * 构建请求体（子类可覆盖）
   */
  protected buildRequestBody(messages: Message[], options: ChatOptions): any {
    const { provider, ...apiOptions } = options;
    const filteredOptions = this.filterOptions(apiOptions);

    return {
      model: options.model || this.config.defaultModel,
      messages,
      temperature: options.temperature ?? 0.7,
      stream: false,
      ...filteredOptions
    };
  }

  async chat(messages: Message[], options: ChatOptions, signal?: AbortSignal): Promise<LLMResponse> {
    const maxRetries = this.config.maxRetries || 3;
    const retryConfig: RetryConfig = {
      maxRetries,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      retryOn4xx: false,
      shouldRetry: (error: any) => {
        if (signal?.aborted || error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
          return false;
        }
        if (error.response?.status === 400 || error.response?.status === 401 ||
            error.response?.status === 403 || error.response?.status === 404) {
          return false;
        }
        return true;
      }
    };

    return retry(async () => {
      try {
        const requestBody = this.buildRequestBody(messages, options);

        logger.debug(`[${this.providerName}] Request body`, {
          model: requestBody.model,
          messageCount: messages.length
        });

        const response = await this.client.post('/chat/completions', requestBody, {
          signal
        });

        return response.data;
      } catch (error: any) {
        if (signal?.aborted || error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
          throw error;
        }

        logger.error(`❌ ${this.providerName} chat error:`, error.message);
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
      const { provider, ...apiOptions } = options;
      const filteredOptions = this.filterOptions(apiOptions);

      const requestBody: any = {
        model: options.model || this.config.defaultModel,
        messages,
        temperature: options.temperature ?? 0.7,
        stream: true,
        ...filteredOptions
      };

      logger.debug(`[${this.providerName}] Stream request`, {
        model: requestBody.model,
        messageCount: messages.length
      });

      const response = await this.client.post('/chat/completions', requestBody, {
        responseType: 'stream',
        signal
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
      return [this.config.defaultModel];
    }
  }
}

