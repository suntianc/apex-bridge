import { DefaultEpisodicMemoryService } from '../../../src/services/memory/EpisodicMemoryService';
import { InMemoryEpisodicStore } from '../../../src/services/memory/stores/InMemoryEpisodicStore';

describe('DefaultEpisodicMemoryService', () => {
  let service: DefaultEpisodicMemoryService;

  beforeEach(() => {
    service = new DefaultEpisodicMemoryService(
      new InMemoryEpisodicStore(),
      { defaultWindowDays: 30 }
    );
  });

  it('records and retrieves events', async () => {
    await service.recordEvent({
      userId: 'user-1',
      personaId: '温暖伙伴',
      eventType: 'conversation',
      content: '提醒我吃饭',
      timestamp: Date.now()
    });

    const events = await service.getRecentEvents('user-1', { personaId: '温暖伙伴' });
    expect(events.length).toBe(1);
    expect(events[0].content).toContain('提醒');
  });

  it('filters by persona and event type', async () => {
    await service.recordEvent({
      userId: 'user-1',
      personaId: '温暖伙伴',
      eventType: 'conversation',
      content: '内容A',
      timestamp: Date.now()
    });

    await service.recordEvent({
      userId: 'user-1',
      personaId: '专业助手',
      eventType: 'task',
      content: '内容B',
      timestamp: Date.now()
    });

    const window = await service.queryWindow({
      userId: 'user-1',
      personaId: '专业助手',
      eventTypes: ['task'],
      includeDiagnostics: true
    });

    expect(window.events).toHaveLength(1);
    expect(window.events[0].content).toBe('内容B');
    expect(window.diagnostics?.filteredByContext).toBeGreaterThanOrEqual(1);
  });

  it('enforces window filtering', async () => {
    await service.recordEvent({
      userId: 'user-1',
      eventType: 'conversation',
      content: 'old',
      timestamp: Date.now() - 60 * 24 * 60 * 60 * 1000
    });

    await service.recordEvent({
      userId: 'user-1',
      eventType: 'conversation',
      content: 'recent',
      timestamp: Date.now()
    });

    const response = await service.queryWindow({
      userId: 'user-1',
      window: { lastDays: 1 },
      includeDiagnostics: true
    });

    expect(response.events).toHaveLength(1);
    expect(response.events[0].content).toBe('recent');
    expect(response.diagnostics?.filteredByWindow).toBeGreaterThan(0);
  });
});

