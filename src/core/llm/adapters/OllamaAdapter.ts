/**
 * Ollama适配器
 */

import { BaseOpenAICompatibleAdapter } from './BaseAdapter';
import { LLMProviderConfig } from '../../../types';
import { logger } from '../../../utils/logger';

export class OllamaAdapter extends BaseOpenAICompatibleAdapter {
  constructor(config: LLMProviderConfig) {
    // 对于本地服务，禁用代理
    const enhancedConfig = {
      ...config,
      // 禁用代理，避免localhost请求被转发到代理服务器
      proxy: false
    };

    super('Ollama', enhancedConfig);

    logger.info('Ollama adapter initialized with proxy disabled for local requests');
  }

  /**
   * 重写 embed 方法以适配 Ollama 的 API 格式
   * Ollama 使用 /api/embeddings 端点和不同的请求格式
   */
  async embed(texts: string[], model?: string): Promise<number[][]> {
    try {
      const embeddingModel = model || this.config.defaultModel;

      logger.debug(`[${this.providerName}] Embedding request`, {
        model: embeddingModel,
        textCount: texts.length
      });

      // Ollama 的 embedding API 一次只能处理一个文本
      // 需要为每个文本发送单独的请求
      const embeddings: number[][] = [];

      for (const text of texts) {
        const requestBody = {
          model: embeddingModel,
          prompt: text  // Ollama 使用 'prompt' 而不是 'input'
        };

        // Ollama 使用 /api/embeddings 端点
        const response = await this.client.post('/api/embeddings', requestBody);

        // Ollama 格式: { embedding: [...] }
        if (response.data?.embedding) {
          embeddings.push(response.data.embedding);
        } else {
          throw new Error('Unexpected embedding response format from Ollama');
        }
      }

      return embeddings;
    } catch (error: any) {
      logger.error(`❌ ${this.providerName} embed error:`, error.message);
      if (error.response) {
        logger.error(`   HTTP状态: ${error.response.status}`);
        try {
          if (error.response.data && typeof error.response.data === 'object') {
            logger.error(`   错误详情: ${JSON.stringify(error.response.data, null, 2)}`);
          }
        } catch (e) {
          // 序列化失败
        }
      }
      throw new Error(`${this.providerName} embedding failed: ${error.message}`);
    }
  }
}

