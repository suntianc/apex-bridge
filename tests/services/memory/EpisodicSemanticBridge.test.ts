import { EventEmitter } from 'events';
import { EpisodicSemanticBridge, SemanticEmbeddingProvider } from '../../../src/services/memory/EpisodicSemanticBridge';
import { SemanticMemoryService, SemanticMemorySearchResponse } from '../../../src/services/memory/SemanticMemoryService';

describe('EpisodicSemanticBridge', () => {
  const createSemanticService = () => {
    const service: SemanticMemoryService = {
      saveSemantic: jest.fn().mockResolvedValue({ id: 'semantic-1' }) as any,
      recallSemantic: jest.fn().mockResolvedValue(null),
      searchSimilar: jest.fn().mockResolvedValue({ results: [] } as SemanticMemorySearchResponse),
      deleteSemanticByContent: jest.fn().mockResolvedValue(undefined)
    };
    return service;
  };

  const embeddingProvider: SemanticEmbeddingProvider = {
    generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3])
  };

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  it('ingests events that pass importance threshold', async () => {
    const eventBus = new EventEmitter();
    const semantic = createSemanticService();

    new EpisodicSemanticBridge(eventBus, semantic, embeddingProvider, { importanceThreshold: 0.5 });

    eventBus.emit('memory:episodic:saved', {
      event: {
        id: 'evt-1',
        userId: 'user-1',
        personaId: '温暖伙伴',
        eventType: 'task',
        content: '提醒我明天买菜',
        timestamp: Date.now(),
        importance: 0.8
      },
      timelineLagMs: 100
    });

    await flush();
    expect(semantic.saveSemantic).toHaveBeenCalledTimes(1);
    expect(embeddingProvider.generateEmbedding).toHaveBeenCalledWith('提醒我明天买菜', {
      userId: 'user-1',
      personaId: '温暖伙伴'
    });
  });

  it('pruned events trigger semantic deletion', async () => {
    const eventBus = new EventEmitter();
    const semantic = createSemanticService();
    new EpisodicSemanticBridge(eventBus, semantic, embeddingProvider);

    eventBus.emit('memory:episodic:pruned', {
      events: [
        {
          id: 'evt-pruned',
          userId: 'user-1',
          personaId: '温暖伙伴',
          timestamp: Date.now() - 1000,
          content: '旧的事件'
        }
      ]
    });

    await flush();
    expect(semantic.deleteSemanticByContent).toHaveBeenCalledWith('user-1', '温暖伙伴', '旧的事件');
  });

  it('pauses ingestion on warning until timeline recovers', async () => {
    const eventBus = new EventEmitter();
    const semantic = createSemanticService();
    new EpisodicSemanticBridge(eventBus, semantic, embeddingProvider, { resumeLagThresholdMs: 50 });

    eventBus.emit('memory:episodic:warning', { message: 'lag detected' });

    eventBus.emit('memory:episodic:saved', {
      event: {
        id: 'evt-2',
        userId: 'user-2',
        personaId: '专业助手',
        eventType: 'task',
        content: '应该被延迟',
        timestamp: Date.now(),
        importance: 1
      },
      timelineLagMs: 200
    });

    await flush();
    expect(semantic.saveSemantic).not.toHaveBeenCalled();

    eventBus.emit('memory:episodic:saved', {
      event: {
        id: 'evt-3',
        userId: 'user-2',
        personaId: '专业助手',
        eventType: 'task',
        content: '恢复后的事件',
        timestamp: Date.now(),
        importance: 1
      },
      timelineLagMs: 10
    });

    await flush();
    expect(semantic.saveSemantic).toHaveBeenCalledTimes(1);
  });
});

