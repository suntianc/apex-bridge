/**
 * LLM适配器工厂
 * 根据provider字段创建对应的适配器实例
 */

import { ILLMAdapter } from './BaseAdapter';
import { LLMProviderConfig } from '../../../types';
import { OpenAIAdapter } from './OpenAIAdapter';
import { DeepSeekAdapter } from './DeepSeekAdapter';
import { ZhipuAdapter } from './ZhipuAdapter';
import { ClaudeAdapter } from './ClaudeAdapter';
import { OllamaAdapter } from './OllamaAdapter';
import { CustomAdapter } from './CustomAdapter';
import { logger } from '../../../utils/logger';

export class LLMAdapterFactory {
  /**
   * 根据provider创建适配器
   */
  static create(provider: string, config: LLMProviderConfig): ILLMAdapter {
    switch (provider.toLowerCase()) {
      case 'openai':
        return new OpenAIAdapter(config);
      case 'deepseek':
        return new DeepSeekAdapter(config);
      case 'zhipu':
        return new ZhipuAdapter(config);
      case 'claude':
        return new ClaudeAdapter(config);
      case 'ollama':
        return new OllamaAdapter(config);
      case 'custom':
        return new CustomAdapter(config);
      default:
        logger.error(`Unknown provider: ${provider}`);
        throw new Error(`Unknown provider: ${provider}. Supported providers: openai, deepseek, zhipu, claude, ollama, custom`);
    }
  }

  /**
   * 获取支持的provider列表
   */
  static getSupportedProviders(): string[] {
    return ['openai', 'deepseek', 'zhipu', 'claude', 'ollama', 'custom'];
  }
}

