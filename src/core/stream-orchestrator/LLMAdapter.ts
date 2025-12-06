import { LLMManager } from '../LLMManager';
import type { LLMAdapter, LLMOptions } from './types';

/**
 * LLMManager适配器
 * 将LLMManager适配为LLMAdapter接口
 */
export class LLMManagerAdapter implements LLMAdapter {
  private llmManager: LLMManager;

  constructor(llmManager: LLMManager) {
    this.llmManager = llmManager;
  }

  async *streamChat(
    messages: any[],
    options?: LLMOptions,
    tools?: any[],  // ✅ 新增：工具列表
    signal?: AbortSignal
  ): AsyncGenerator<any, void, void> {
    const stream = this.llmManager.streamChat(messages, options || {}, signal);

    for await (const chunk of stream) {
      if (typeof chunk === 'string') {
        yield { type: 'content', content: chunk };
      } else {
        yield chunk;
      }
    }
  }
}
