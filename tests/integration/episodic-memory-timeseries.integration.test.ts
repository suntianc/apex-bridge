import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { DefaultEpisodicMemoryService } from '../../src/services/memory/EpisodicMemoryService';
import { TimeSeriesEpisodicStore } from '../../src/services/memory/stores/TimeSeriesEpisodicStore';

const createTempDir = async (): Promise<string> => {
  return fs.mkdtemp(path.join(os.tmpdir(), 'episodic-store-'));
};

describe('TimeSeriesEpisodicStore integration', () => {
  it('persists events to disk and reloads across instances', async () => {
    const dir = await createTempDir();
    try {
      const storeA = new TimeSeriesEpisodicStore({ baseDir: dir, segmentSize: 1 });
      const serviceA = new DefaultEpisodicMemoryService(storeA, { defaultWindowDays: 7 });

      await serviceA.recordEvent({
        userId: 'user-persist',
        personaId: '温暖伙伴',
        eventType: 'conversation',
        content: 'persisted event 1',
        timestamp: Date.now() - 1_000
      });
      await serviceA.recordEvent({
        userId: 'user-persist',
        personaId: '温暖伙伴',
        eventType: 'task',
        content: 'persisted event 2',
        timestamp: Date.now()
      });

      const files = await fs.readdir(dir);
      expect(files.some((file) => file.startsWith('segment-'))).toBe(true);

      const storeB = new TimeSeriesEpisodicStore({ baseDir: dir, segmentSize: 1 });
      const serviceB = new DefaultEpisodicMemoryService(storeB, { defaultWindowDays: 7 });
      const res = await serviceB.queryWindow({
        userId: 'user-persist',
        includeDiagnostics: true
      });

      expect(res.events.length).toBe(2);
      expect(res.events[0].content).toBe('persisted event 2');
      expect(res.diagnostics?.totalEvents).toBe(2);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('applies retention policy and rebuilds segments on reload', async () => {
    const dir = await createTempDir();
    try {
      const store = new TimeSeriesEpisodicStore({
        baseDir: dir,
        retentionMs: 1_000,
        segmentSize: 2
      });
      const service = new DefaultEpisodicMemoryService(store, { defaultWindowDays: 30 });

      await service.recordEvent({
        userId: 'user-retention',
        eventType: 'conversation',
        content: 'old event',
        timestamp: Date.now() - 10_000
      });
      await service.recordEvent({
        userId: 'user-retention',
        eventType: 'conversation',
        content: 'new event',
        timestamp: Date.now()
      });

      const storeReloaded = new TimeSeriesEpisodicStore({
        baseDir: dir,
        retentionMs: 1_000,
        segmentSize: 2
      });
      const serviceReloaded = new DefaultEpisodicMemoryService(storeReloaded, {
        defaultWindowDays: 30
      });
      const res = await serviceReloaded.queryWindow({
        userId: 'user-retention',
        includeDiagnostics: true
      });

      expect(res.events.length).toBe(1);
      expect(res.events[0].content).toBe('new event');
      expect(res.diagnostics?.totalEvents).toBe(1);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

