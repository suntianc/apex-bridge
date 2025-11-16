/**
 * RaceDetector Tests - 竞态条件检测器测试
 */

import { RaceDetector, createOperationId, createResourceId } from '../../src/utils/RaceDetector';

describe('RaceDetector', () => {
  let raceDetector: RaceDetector;

  beforeEach(() => {
    // Reset singleton instance
    (RaceDetector as any).instance = undefined;
    raceDetector = RaceDetector.getInstance({ enabled: true, logLevel: 'debug' });
    raceDetector.resetStats();
  });

  describe('Basic Operations', () => {
    it('should detect concurrent operations', () => {
      const resourceId = createResourceId('test-resource', 'test-id');
      const operationId1 = createOperationId('op-1');
      const operationId2 = createOperationId('op-2');

      // Start first operation
      raceDetector.startOperation(resourceId, operationId1);

      // Start second operation (should detect race condition)
      raceDetector.startOperation(resourceId, operationId2);

      // Check stats
      const stats = raceDetector.getStats();
      expect(stats.totalDetections).toBe(1);

      // End operations
      raceDetector.endOperation(resourceId, operationId1);
      raceDetector.endOperation(resourceId, operationId2);
    });

    it('should not detect race condition for sequential operations', () => {
      const resourceId = createResourceId('test-resource', 'test-id');
      const operationId1 = createOperationId('op-1');
      const operationId2 = createOperationId('op-2');

      // Start and end first operation
      raceDetector.startOperation(resourceId, operationId1);
      raceDetector.endOperation(resourceId, operationId1);

      // Start second operation (should not detect race condition)
      raceDetector.startOperation(resourceId, operationId2);

      // Check stats
      const stats = raceDetector.getStats();
      expect(stats.totalDetections).toBe(0);

      // End operation
      raceDetector.endOperation(resourceId, operationId2);
    });

    it('should track active operations', () => {
      const resourceId = createResourceId('test-resource', 'test-id');
      const operationId = createOperationId('op-1');

      // Start operation
      raceDetector.startOperation(resourceId, operationId);

      // Check active operations
      expect(raceDetector.hasActiveOperations(resourceId)).toBe(true);
      expect(raceDetector.getActiveOperations(resourceId)).toContain(operationId);

      // End operation
      raceDetector.endOperation(resourceId, operationId);

      // Check active operations
      expect(raceDetector.hasActiveOperations(resourceId)).toBe(false);
      expect(raceDetector.getActiveOperations(resourceId)).toEqual([]);
    });
  });

  describe('Statistics', () => {
    it('should track detection statistics', () => {
      const resourceId = createResourceId('test-resource', 'test-id');
      const operationId1 = createOperationId('op-1');
      const operationId2 = createOperationId('op-2');
      const operationId3 = createOperationId('op-3');

      // Start multiple concurrent operations
      raceDetector.startOperation(resourceId, operationId1);
      raceDetector.startOperation(resourceId, operationId2); // Detection 1
      raceDetector.startOperation(resourceId, operationId3); // Detection 2

      // Check stats
      const stats = raceDetector.getStats();
      expect(stats.totalDetections).toBe(2);
      expect(stats.resources.get(resourceId)).toBe(2);
      expect(stats.operations.get(operationId2)).toBe(1);
      expect(stats.operations.get(operationId3)).toBe(1);

      // End operations
      raceDetector.endOperation(resourceId, operationId1);
      raceDetector.endOperation(resourceId, operationId2);
      raceDetector.endOperation(resourceId, operationId3);
    });

    it('should reset statistics', () => {
      const resourceId = createResourceId('test-resource', 'test-id');
      const operationId1 = createOperationId('op-1');
      const operationId2 = createOperationId('op-2');

      // Create some detections
      raceDetector.startOperation(resourceId, operationId1);
      raceDetector.startOperation(resourceId, operationId2);
      raceDetector.endOperation(resourceId, operationId1);
      raceDetector.endOperation(resourceId, operationId2);

      // Reset stats
      raceDetector.resetStats();

      // Check stats
      const stats = raceDetector.getStats();
      expect(stats.totalDetections).toBe(0);
      expect(stats.resources.size).toBe(0);
      expect(stats.operations.size).toBe(0);
    });
  });

  describe('Configuration', () => {
    it('should respect enabled/disabled configuration', () => {
      // Update existing detector configuration
      raceDetector.updateConfig({ enabled: false });
      const resourceId = createResourceId('test-resource-disabled', 'test-id');
      const operationId1 = createOperationId('op-1');
      const operationId2 = createOperationId('op-2');

      // Reset stats
      raceDetector.resetStats();

      // Start concurrent operations (should not detect)
      raceDetector.startOperation(resourceId, operationId1);
      raceDetector.startOperation(resourceId, operationId2);

      // Check stats (should be 0)
      const stats = raceDetector.getStats();
      expect(stats.totalDetections).toBe(0);

      // End operations
      raceDetector.endOperation(resourceId, operationId1);
      raceDetector.endOperation(resourceId, operationId2);

      // Reset configuration
      raceDetector.updateConfig({ enabled: true });
    });

    it('should update configuration', () => {
      raceDetector.updateConfig({ enabled: false });
      const resourceId = createResourceId('test-resource', 'test-id');
      const operationId1 = createOperationId('op-1');
      const operationId2 = createOperationId('op-2');

      // Start concurrent operations (should not detect)
      raceDetector.startOperation(resourceId, operationId1);
      raceDetector.startOperation(resourceId, operationId2);

      // Check stats (should be 0)
      const stats = raceDetector.getStats();
      expect(stats.totalDetections).toBe(0);

      // End operations
      raceDetector.endOperation(resourceId, operationId1);
      raceDetector.endOperation(resourceId, operationId2);
    });
  });

  describe('Event Listeners', () => {
    it('should trigger listeners on race condition detection', () => {
      const resourceId = createResourceId('test-resource', 'test-id');
      const operationId1 = createOperationId('op-1');
      const operationId2 = createOperationId('op-2');
      const events: any[] = [];

      // Add listener
      raceDetector.addListener((event) => {
        events.push(event);
      });

      // Start concurrent operations
      raceDetector.startOperation(resourceId, operationId1);
      raceDetector.startOperation(resourceId, operationId2);

      // Check listener was triggered
      expect(events.length).toBe(1);
      expect(events[0].resourceId).toBe(resourceId);
      expect(events[0].operationId).toBe(operationId2);
      expect(events[0].activeOperations).toContain(operationId1);

      // End operations
      raceDetector.endOperation(resourceId, operationId1);
      raceDetector.endOperation(resourceId, operationId2);
    });

    it('should remove listeners', () => {
      const resourceId = createResourceId('test-resource', 'test-id');
      const operationId1 = createOperationId('op-1');
      const operationId2 = createOperationId('op-2');
      const events: any[] = [];

      // Add listener
      const listener = (event: any) => {
        events.push(event);
      };
      raceDetector.addListener(listener);

      // Start concurrent operations
      raceDetector.startOperation(resourceId, operationId1);
      raceDetector.startOperation(resourceId, operationId2);
      expect(events.length).toBe(1);

      // Remove listener
      raceDetector.removeListener(listener);

      // Start concurrent operations again
      raceDetector.endOperation(resourceId, operationId1);
      raceDetector.endOperation(resourceId, operationId2);
      raceDetector.startOperation(resourceId, operationId1);
      raceDetector.startOperation(resourceId, operationId2);

      // Check listener was not triggered
      expect(events.length).toBe(1);

      // End operations
      raceDetector.endOperation(resourceId, operationId1);
      raceDetector.endOperation(resourceId, operationId2);
    });
  });

  describe('withOperation Helper', () => {
    it('should wrap operation with race detection', async () => {
      const resourceId = createResourceId('test-resource', 'test-id');
      const operationId = createOperationId('op-1');

      let executed = false;

      // Execute operation with wrapper
      await raceDetector.withOperation(resourceId, operationId, async () => {
        executed = true;
        return 'result';
      });

      // Check operation was executed
      expect(executed).toBe(true);

      // Check no active operations
      expect(raceDetector.hasActiveOperations(resourceId)).toBe(false);
    });

    it('should handle errors in wrapped operation', async () => {
      const resourceId = createResourceId('test-resource', 'test-id');
      const operationId = createOperationId('op-1');

      // Execute operation with error
      await expect(
        raceDetector.withOperation(resourceId, operationId, async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      // Check no active operations
      expect(raceDetector.hasActiveOperations(resourceId)).toBe(false);
    });
  });

  describe('Helper Functions', () => {
    it('should create unique operation IDs', () => {
      const id1 = createOperationId('prefix');
      const id2 = createOperationId('prefix');

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^prefix-\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^prefix-\d+-[a-z0-9]+$/);
    });

    it('should create resource IDs', () => {
      const resourceId = createResourceId('type', 'id');

      expect(resourceId).toBe('type:id');
    });
  });
});
