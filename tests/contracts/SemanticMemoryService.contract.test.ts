import {
  SemanticMemoryDiagnostics,
  SemanticMemoryQuery,
  SemanticMemoryRecord,
  SemanticMemoryResult
} from '../../src/types/memory';
import {
  SemanticMemoryOptions,
  SemanticMemorySearchResponse,
  SemanticMemoryService
} from '../../src/services/memory/SemanticMemoryService';

describe('SemanticMemoryService contract', () => {
  const noopResult: SemanticMemoryResult = {
    id: 'noop',
    userId: 'user',
    content: 'placeholder',
    similarity: 1
  };

  const noopDiagnostics: SemanticMemoryDiagnostics = {
    totalCandidates: 0,
    filteredByContext: 0,
    filteredByThreshold: 0,
    returned: 0
  };

  const mockService: SemanticMemoryService = {
    async saveSemantic(record: SemanticMemoryRecord): Promise<SemanticMemoryResult> {
      return { ...noopResult, ...record, id: record.id ?? 'generated' };
    },
    async recallSemantic(): Promise<SemanticMemoryResult | null> {
      return null;
    },
    async searchSimilar(query: SemanticMemoryQuery): Promise<SemanticMemorySearchResponse> {
      return {
        results: query.topK ? Array(query.topK).fill(noopResult) : [],
        diagnostics: query.includeDiagnostics ? noopDiagnostics : undefined
      };
    },
    async deleteSemanticByContent(userId: string, personaId: string | undefined, content: string): Promise<void> {
      // Mock implementation - no-op
    }
  };

  it('exposes save/recall/search contracts', async () => {
    const options: SemanticMemoryOptions = {
      embeddingDimensions: 1536,
      defaultTopK: 3,
      maxTopK: 8,
      minSimilarity: 0.7
    };

    const saved = await mockService.saveSemantic({
      userId: 'user',
      content: 'hello world',
      embedding: [0, 1, 0.5]
    }, options);

    expect(saved.id).toBeDefined();
    expect(saved.userId).toBe('user');

    const query: SemanticMemoryQuery = {
      vector: [0, 1, 0.5],
      includeDiagnostics: true
    };

    const search = await mockService.searchSimilar(query);
    expect(Array.isArray(search.results)).toBe(true);
    expect(search.diagnostics).toBeDefined();
  });
});

