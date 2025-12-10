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
}

