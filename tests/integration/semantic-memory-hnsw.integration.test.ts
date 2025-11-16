import { mkdtemp } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { DefaultSemanticMemoryService, SemanticMemoryOptions } from '../../src/services/memory/SemanticMemoryService';
import { HNSWSemanticStore } from '../../src/services/memory/stores/HNSWSemanticStore';

const hasHnsw = (() => {
  try {
    require.resolve('hnswlib-node');
    return true;
  } catch {
    return false;
  }
})();

(hasHnsw ? describe : describe.skip)('HNSWSemanticStore integration', () => {
  let workDir: string;
  let baseOptions: SemanticMemoryOptions;

  beforeAll(async () => {
    workDir = await mkdtemp(path.join(os.tmpdir(), 'semantic-hnsw-'));
    baseOptions = {
      embeddingDimensions: 3,
      defaultTopK: 3
    };
  });

  it('persists vectors to disk and reloads across instances', async () => {
    const store = new HNSWSemanticStore({
      workDir,
      dimensions: 3,
      maxElements: 1024
    });
    const service = new DefaultSemanticMemoryService(store, baseOptions);

    await service.saveSemantic({
      id: 'pref-1',
      userId: 'user-x',
      content: '喜欢黑咖啡',
      embedding: [1, 0, 0]
    });

    await service.saveSemantic({
      id: 'pref-2',
      userId: 'user-x',
      content: '常去健身房',
      embedding: [0, 1, 0]
    });

    const firstSearch = await service.searchSimilar({
      vector: [1, 0, 0],
      userId: 'user-x'
    });

    expect(firstSearch.results[0].id).toBe('pref-1');

    // Reload index from disk
    const reloadedStore = new HNSWSemanticStore({
      workDir,
      dimensions: 3,
      maxElements: 1024
    });
    const reloadedService = new DefaultSemanticMemoryService(reloadedStore, baseOptions);

    const secondSearch = await reloadedService.searchSimilar({
      vector: [0, 1, 0],
      userId: 'user-x'
    });

    expect(secondSearch.results[0].id).toBe('pref-2');
  });
});

