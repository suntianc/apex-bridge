/**
 * MemoryService 集成测试
 * 使用内存版 RAG 服务验证保存 / 检索 / 性能目标
 */

import { performance } from 'node:perf_hooks';
import { RAGMemoryService } from '../../src/services/RAGMemoryService';
import { Memory, MemoryContext } from '../../src/types/memory';

type RAGDocument = {
  id: string;
  content: string;
  knowledgeBase?: string;
  metadata?: Record<string, any>;
};

class InMemoryRAGService {
  private documents: RAGDocument[] = [];

  async addDocument(doc: RAGDocument): Promise<string> {
    const id = doc.id ?? `memory-${this.documents.length + 1}`;
    const normalized: RAGDocument = {
      ...doc,
      id,
      metadata: {
        ...(doc.metadata ?? {}),
        timestamp: doc.metadata?.timestamp ?? Date.now()
      }
    };
    this.documents.push(normalized);
    return id;
  }

  async search(params: {
    query?: string;
    k?: number;
    knowledgeBase?: string;
    metadataFilter?: Record<string, any>;
  }): Promise<Array<Record<string, any>>> {
    const { query, k = 10, knowledgeBase, metadataFilter } = params ?? {};
    let results = this.documents;

    if (knowledgeBase) {
      results = results.filter((doc) => doc.knowledgeBase === knowledgeBase);
    }
    if (metadataFilter?.userId) {
      results = results.filter((doc) => doc.metadata?.userId === metadataFilter.userId);
    }
    if (query) {
      results = results.filter((doc) => doc.content?.includes(query));
    }

    return results.slice(0, k).map((doc) => ({
      id: doc.id,
      content: doc.content,
      metadata: { ...doc.metadata },
      score: 0.95
    }));
  }
}

describe('MemoryService Integration Tests', () => {
  let ragService: InMemoryRAGService;
  let memoryService: RAGMemoryService;

  beforeEach(() => {
    ragService = new InMemoryRAGService();
    memoryService = new RAGMemoryService(ragService as any, {
      defaultKnowledgeBase: 'kb-test',
      enableLogging: false
    });
  });

  it('应该能够初始化MemoryService并保持RAG引用', () => {
    expect(memoryService).toBeDefined();
    expect(memoryService.getRAGService()).toBe(ragService);
  });

  it('应该能够保存并检索记忆（端到端）', async () => {
    const memory: Memory = {
      content: '用户喜欢科幻电影和太空探索',
      userId: 'user-1',
      metadata: {
        source: 'integration-test',
        tags: ['preference', 'movie']
      }
    };

    await memoryService.save(memory);

    const context: MemoryContext = {
      knowledgeBase: 'kb-test',
      userId: 'user-1',
      limit: 5
    };

    const results = await memoryService.recall('科幻', context);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      content: memory.content,
      metadata: expect.objectContaining({
        source: 'integration-test',
        tags: ['preference', 'movie'],
        userId: 'user-1'
      })
    });
  });

  it('应该验证save/recall性能开销 < 10ms', async () => {
    const perfMemory: Memory = {
      content: '性能测试记忆',
      userId: 'perf-user'
    };

    const saveStart = performance.now();
    await memoryService.save(perfMemory);
    const saveDuration = performance.now() - saveStart;

    const recallStart = performance.now();
    await memoryService.recall('性能', {
      knowledgeBase: 'kb-test',
      userId: 'perf-user'
    });
    const recallDuration = performance.now() - recallStart;

    expect(saveDuration).toBeLessThanOrEqual(10);
    expect(recallDuration).toBeLessThanOrEqual(10);
  });
});

