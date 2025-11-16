import {
  EpisodicMemoryEvent,
  EpisodicMemoryQuery,
  EpisodicMemoryResult
} from '../../src/types/memory';
import {
  EpisodicMemoryService,
  EpisodicMemorySearchResponse
} from '../../src/services/memory/EpisodicMemoryService';

describe('EpisodicMemoryService contract', () => {
  const noopEvent: EpisodicMemoryEvent = {
    userId: 'user-1',
    eventType: 'conversation',
    content: 'hello episodic memory',
    timestamp: Date.now()
  };

  const mockService: EpisodicMemoryService = {
    async recordEvent(event: EpisodicMemoryEvent): Promise<EpisodicMemoryResult> {
      return {
        id: event.id ?? 'generated',
        ...event
      };
    },
    async getRecentEvents(): Promise<EpisodicMemoryResult[]> {
      return [];
    },
    async queryWindow(query: EpisodicMemoryQuery): Promise<EpisodicMemorySearchResponse> {
      return {
        events: [
          {
            id: 'evt-1',
            userId: query.userId ?? 'user-1',
            eventType: 'conversation',
            content: 'example',
            timestamp: Date.now()
          }
        ],
        diagnostics: query.includeDiagnostics
          ? {
              totalEvents: 1,
              filteredByContext: 0,
              filteredByWindow: 0,
              returned: 1
            }
          : undefined
      };
    },
    async summarizeRange(): Promise<any> {
      return {
        earliest: Date.now() - 1000,
        latest: Date.now(),
        eventTypes: { conversation: 1 },
        total: 1
      };
    }
  };

  it('exposes minimal contract methods', async () => {
    const saved = await mockService.recordEvent(noopEvent);
    expect(saved.id).toBeDefined();
    expect(saved.eventType).toBe('conversation');

    const windowResponse = await mockService.queryWindow({
      userId: 'user-1',
      includeDiagnostics: true
    });

    expect(windowResponse.events.length).toBeGreaterThan(0);
    expect(windowResponse.diagnostics).toBeDefined();
    expect(windowResponse.diagnostics?.returned).toBe(1);

    const summary = await mockService.summarizeRange({ userId: 'user-1' });
    expect(summary.total).toBe(1);
  });
});

