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
   * 供应商名称映射表
   */
  private static readonly PROVIDER_NAMES: Record<string, string> = {
    openai: 'OpenAI',
    deepseek: 'DeepSeek',
    zhipu: '智谱AI',
    claude: 'Claude',
    ollama: 'Ollama',
    custom: 'Custom'
  };

  /**
   * 供应商默认 baseURL 映射表
   */
  private static readonly PROVIDER_DEFAULT_BASEURLS: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    deepseek: 'https://api.deepseek.com/v1',
    zhipu: 'https://open.bigmodel.cn/api/paas/v4',
    claude: 'https://api.anthropic.com/v1',
    ollama: 'http://localhost:11434',
    custom: 'https://api.openai.com/v1' // Custom 默认使用 OpenAI 格式
  };

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

  /**
   * 获取支持的适配器供应商列表（包含显示名称和默认baseURL）
   */
  static getSupportedAdapters(): Array<{name: string, provider: string, defaultBaseURL: string}> {
    return Object.entries(this.PROVIDER_NAMES).map(([provider, name]) => ({
      name,
      provider,
      defaultBaseURL: this.PROVIDER_DEFAULT_BASEURLS[provider] || ''
    }));
  }
}

