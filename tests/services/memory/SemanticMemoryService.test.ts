import { DefaultSemanticMemoryService, SemanticMemoryOptions } from '../../../src/services/memory/SemanticMemoryService';
import { InMemorySemanticStore } from '../../../src/services/memory/stores/InMemorySemanticStore';

describe('DefaultSemanticMemoryService', () => {
  let store: InMemorySemanticStore;
  let service: DefaultSemanticMemoryService;
  let baseOptions: SemanticMemoryOptions;

  beforeEach(() => {
    store = new InMemorySemanticStore();
    baseOptions = {
      embeddingDimensions: 3,
      defaultTopK: 2,
      maxTopK: 5,
      minSimilarity: 0.6
    };
    service = new DefaultSemanticMemoryService(store, baseOptions);
  });

  it('saves semantic records and deduplicates by user/persona/content', async () => {
    const record = {
      userId: 'user-1',
      personaId: 'warm-buddy',
      content: '喜欢喝拿铁',
      embedding: [0.1, 0.2, 0.3]
    };

    const first = await service.saveSemantic(record);
    const duplicated = await service.saveSemantic({ ...record });

    expect(first.id).toBeDefined();
    expect(duplicated.id).toBe(first.id);
  });

  it('filters search results by persona and similarity threshold', async () => {
    await service.saveSemantic({
      userId: 'user-1',
      personaId: 'warm-buddy',
      content: 'alpha memo',
      embedding: [1, 0, 0]
    });

    await service.saveSemantic({
      userId: 'user-1',
      personaId: 'warm-buddy',
      content: 'beta memo',
      embedding: [0.9, 0.1, 0]
    });

    await service.saveSemantic({
      userId: 'user-1',
      personaId: 'professional',
      content: 'gamma memo',
      embedding: [0, 1, 0]
    });

    const response = await service.searchSimilar({
      vector: [1, 0, 0],
      topK: 1,
      userId: 'user-1',
      personaId: 'warm-buddy',
      includeDiagnostics: true
    });

    expect(response.results).toHaveLength(1);
    expect(response.results[0].content).toContain('alpha');
    expect(response.diagnostics?.totalCandidates).toBeGreaterThan(0);
    expect(response.diagnostics?.returned).toBe(1);
  });

  it('applies time window filtering when searching', async () => {
    await service.saveSemantic({
      userId: 'user-1',
      content: 'older memory',
      embedding: [1, 0, 0],
      createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000
    });

    const recent = await service.saveSemantic({
      userId: 'user-1',
      content: 'recent memory',
      embedding: [1, 0, 0]
    });

    const response = await service.searchSimilar({
      vector: [1, 0, 0],
      userId: 'user-1',
      includeDiagnostics: true,
      timeWindow: { lastDays: 1 }
    });

    expect(response.results).toHaveLength(1);
    expect(response.results[0].id).toBe(recent.id);
    expect(response.diagnostics?.filteredByContext).toBeGreaterThanOrEqual(1);
  });
});

