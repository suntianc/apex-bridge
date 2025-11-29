import { LRUCache } from 'lru-cache';
import type { LLMAdapter, LLMOptions, StreamEvent } from './types';

interface CacheEntry {
  content: string;
  timestamp: number;
}

export interface CachedAdapterOptions {
  ttl?: number;
  maxSize?: number;
  enableL2?: boolean;
}

export class CachedLLMAdapter implements LLMAdapter {
  private l1Cache: LRUCache<string, CacheEntry>;
  private l2Cache: Map<string, any>;
  private delegate: LLMAdapter;
  private options: Required<CachedAdapterOptions>;

  constructor(delegate: LLMAdapter, options: CachedAdapterOptions = {}) {
    this.delegate = delegate;
    this.options = {
      ttl: options.ttl ?? 30_000,
      maxSize: options.maxSize ?? 100,
      enableL2: options.enableL2 ?? true
    };

    this.l1Cache = new LRUCache({
      max: this.options.maxSize,
      ttl: this.options.ttl,
      updateAgeOnGet: true
    });

    this.l2Cache = new Map();
  }

  async *streamChat(
    messages: any[],
    options?: LLMOptions,
    signal?: AbortSignal
  ): AsyncGenerator<any, void, void> {
    const cacheKey = this.generateCacheKey(messages, options);

    const cached = this.l1Cache.get(cacheKey);
    if (cached) {
      yield { type: 'text', content: cached.content, cached: true };
      return;
    }

    const l2Result = this.options.enableL2 ? this.getL2Cache(messages) : null;
    if (l2Result) {
      yield { type: 'text', content: l2Result, cached: 'l2' };
      return;
    }

    const chunks: string[] = [];
    for await (const chunk of this.delegate.streamChat(messages, options, signal)) {
      if (chunk.type === 'text') {
        chunks.push(chunk.content);
      }
      yield chunk;
    }

    const fullContent = chunks.join('');
    this.l1Cache.set(cacheKey, {
      content: fullContent,
      timestamp: Date.now()
    });

    if (this.options.enableL2 && messages.length > 2) {
      this.updateL2Cache(messages, fullContent);
    }
  }

  private generateCacheKey(messages: any[], options?: LLMOptions): string {
    const messagesKey = JSON.stringify(messages);
    const optionsKey = JSON.stringify(options || {});
    return `${messagesKey}::${optionsKey}`;
  }

  private getL2Cache(messages: any[]): string | null {
    const systemPrompt = messages.find(m => m.role === 'system')?.content;
    const userPrompt = messages.find(m => m.role === 'user')?.content;

    if (!systemPrompt || !userPrompt) return null;

    const cacheKey = this.hashCode(systemPrompt);
    const cacheValue = this.l2Cache.get(cacheKey);

    if (!cacheValue) return null;

    const promptTemplate = systemPrompt.split('\n').find(line =>
      line.includes('{') && line.includes('}')
    );

    if (promptTemplate && userPrompt.includes('continue')) {
      return cacheValue;
    }

    return null;
  }

  private updateL2Cache(messages: any[], result: string): void {
    const systemPrompt = messages.find(m => m.role === 'system')?.content;
    if (!systemPrompt) return;

    const cacheKey = this.hashCode(systemPrompt);
    this.l2Cache.set(cacheKey, result);
  }

  private hashCode(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  }

  clearCache(): void {
    this.l1Cache.clear();
    this.l2Cache.clear();
  }

  get cacheStats(): { l1Size: number; l2Size: number } {
    return {
      l1Size: this.l1Cache.size,
      l2Size: this.l2Cache.size
    };
  }
}
