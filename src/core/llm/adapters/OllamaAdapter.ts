/**
 * Ollama适配器
 */

import { BaseOpenAICompatibleAdapter } from './BaseAdapter';
import { LLMProviderConfig } from '../../../types';

export class OllamaAdapter extends BaseOpenAICompatibleAdapter {
  constructor(config: LLMProviderConfig) {
    super('Ollama', config);
  }
}

