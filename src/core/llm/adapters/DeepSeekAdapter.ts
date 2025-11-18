/**
 * DeepSeek适配器
 * 特殊处理：不支持top_k，max_tokens最大8192
 */

import { BaseOpenAICompatibleAdapter } from './BaseAdapter';
import { LLMProviderConfig } from '../../../types';
import { ChatOptions } from '../../../types';

export class DeepSeekAdapter extends BaseOpenAICompatibleAdapter {
  constructor(config: LLMProviderConfig) {
    super('DeepSeek', config);
  }

  protected filterOptions(options: ChatOptions): ChatOptions {
    const filtered = { ...options };

    // DeepSeek不支持top_k
    if ('top_k' in filtered) {
      delete (filtered as any).top_k;
    }

    // DeepSeek限制：max_tokens最大8192
    if (filtered.max_tokens && filtered.max_tokens > 8192) {
      filtered.max_tokens = 8192;
    }

    return filtered;
  }
}

