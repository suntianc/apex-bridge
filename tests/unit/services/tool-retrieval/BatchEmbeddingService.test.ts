/**
 * BatchEmbeddingService Test Suite
 */

import {
  BatchEmbeddingService,
  BatchEmbeddingConfig,
  BatchEmbeddingResult,
} from "../../../../src/services/tool-retrieval/BatchEmbeddingService";

describe("BatchEmbeddingService", () => {
  let service: BatchEmbeddingService;

  beforeEach(() => {
    service = new BatchEmbeddingService({
      batchSize: 10,
      maxConcurrency: 2,
      retryAttempts: 2,
      minRetryDelayMs: 10,
      maxRetryDelayMs: 50,
    });
  });

  afterEach(() => {
    service.setProgressCallback(null);
  });

  describe("constructor", () => {
    it("should create service with default config", () => {
      const defaultService = new BatchEmbeddingService();
      expect(defaultService).toBeInstanceOf(BatchEmbeddingService);
    });

    it("should create service with custom config", () => {
      const config: BatchEmbeddingConfig = {
        batchSize: 50,
        maxConcurrency: 3,
        retryAttempts: 5,
        timeoutMs: 30000,
      };
      const customService = new BatchEmbeddingService(config);
      expect(customService).toBeInstanceOf(BatchEmbeddingService);
    });
  });

  describe("generateBatch", () => {
    it("should process empty text array", async () => {
      const mockEmbed = jest.fn().mockResolvedValue([]);
      const result = await service.generateBatch([], mockEmbed);

      expect(result.embeddings).toEqual([]);
      expect(result.totalProcessed).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.duration).toBe(0);
    });

    it("should process single text", async () => {
      const texts = ["test text"];
      const mockEmbed = jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]);

      const result = await service.generateBatch(texts, mockEmbed);

      expect(result.embeddings).toHaveLength(1);
      expect(result.totalProcessed).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(mockEmbed).toHaveBeenCalledTimes(1);
    });

    it("should process multiple texts in batches", async () => {
      const texts = Array(25).fill("test text");
      let batchIndex = 0;

      // Mock returns embeddings for the specific batch size
      const mockEmbed = jest.fn().mockImplementation((batch: string[]) => {
        const startIdx = batchIndex * 10;
        batchIndex++;
        return Promise.resolve(
          batch.map((_, i) => [0.1 * (startIdx + i), 0.2 * (startIdx + i), 0.3 * (startIdx + i)])
        );
      });

      const result = await service.generateBatch(texts, mockEmbed);

      expect(result.embeddings).toHaveLength(25);
      expect(result.totalProcessed).toBe(25);
      expect(result.failedCount).toBe(0);
      expect(result.batches).toHaveLength(3); // 25 / 10 = 3 batches
    });

    it("should handle concurrent batches", async () => {
      const texts = Array(20).fill("test text");
      const startTimes: number[] = [];
      let callIndex = 0;

      const mockEmbed = jest.fn().mockImplementation(async (batch: string[]) => {
        startTimes[callIndex++] = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 50));
        return batch.map(() => [0.1, 0.2, 0.3]);
      });

      const concurrentService = new BatchEmbeddingService({
        batchSize: 10,
        maxConcurrency: 2,
      });

      const result = await concurrentService.generateBatch(texts, mockEmbed);

      expect(result.totalProcessed).toBe(20);
      // With concurrency=2, batches should overlap in time
      expect(mockEmbed).toHaveBeenCalledTimes(2);
    });

    it("should retry failed embeddings", async () => {
      const texts = ["text1", "text2", "text3"];
      let callCount = 0;

      const mockEmbed = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Temporary failure");
        }
        return texts.map(() => [0.1, 0.2, 0.3]);
      });

      const retryService = new BatchEmbeddingService({
        batchSize: 10,
        maxConcurrency: 1,
        retryAttempts: 3,
        minRetryDelayMs: 5,
        maxRetryDelayMs: 20,
      });

      const result = await retryService.generateBatch(texts, mockEmbed);

      expect(result.totalProcessed).toBe(3);
      expect(callCount).toBe(2); // 1 initial + 1 retry
    });

    it("should report accurate duration", async () => {
      const texts = Array(5).fill("test text");

      const mockEmbed = jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return [[0.1, 0.2, 0.3]];
      });

      const result = await service.generateBatch(texts, mockEmbed);

      expect(result.duration).toBeGreaterThanOrEqual(100);
      expect(result.batches).toHaveLength(1);
    });

    it("should handle partial failures", async () => {
      const texts = ["text1", "text2", "text3"];

      const mockEmbed = jest.fn().mockResolvedValue([
        [0.1, 0.2, 0.3], // text1
        [], // text2 - empty
        [0.3, 0.4, 0.5], // text3
      ]);

      const result = await service.generateBatch(texts, mockEmbed);

      expect(result.totalProcessed).toBe(2);
      expect(result.failedCount).toBe(1);
    });

    it("should fallback on complete failure", async () => {
      const texts = ["text1", "text2"];

      const mockEmbed = jest.fn().mockRejectedValue(new Error("Complete failure"));

      const result = await service.generateBatch(texts, mockEmbed);

      // All batches fail, so no embeddings are processed
      expect(result.totalProcessed).toBe(0);
      expect(result.failedCount).toBe(2);
      expect(result.batches[0].success).toBe(false);
    });
  });

  describe("progress callback", () => {
    it("should call progress callback", async () => {
      const texts = Array(15).fill("test text");
      const progressUpdates: any[] = [];

      const mockEmbed = jest.fn().mockResolvedValue(texts.map(() => [0.1, 0.2, 0.3]));

      service.setProgressCallback((progress) => {
        progressUpdates.push(progress);
      });

      const result = await service.generateBatch(texts, mockEmbed);

      expect(progressUpdates.length).toBeGreaterThan(0);
      const lastProgress = progressUpdates[progressUpdates.length - 1];
      expect(lastProgress.processed).toBe(15);
      expect(lastProgress.total).toBe(15);
    });
  });

  describe("generateBatchKey", () => {
    it("should generate consistent keys for same texts", () => {
      const texts1 = ["text1", "text2", "text3"];
      const texts2 = ["text1", "text2", "text3"];

      const key1 = BatchEmbeddingService.generateBatchKey(texts1);
      const key2 = BatchEmbeddingService.generateBatchKey(texts2);

      expect(key1).toBe(key2);
    });

    it("should generate different keys for different texts", () => {
      const texts1 = ["text1", "text2"];
      const texts2 = ["text1", "text2", "text3"];

      const key1 = BatchEmbeddingService.generateBatchKey(texts1);
      const key2 = BatchEmbeddingService.generateBatchKey(texts2);

      expect(key1).not.toBe(key2);
    });

    it("should generate MD5 hash format", () => {
      const texts = ["test"];
      const key = BatchEmbeddingService.generateBatchKey(texts);

      expect(key).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  describe("estimateDuration", () => {
    it("should estimate based on text count", () => {
      const estimated = BatchEmbeddingService.estimateDuration(1000);
      expect(estimated).toBeGreaterThan(0);
    });

    it("should account for batch overhead", () => {
      const single = BatchEmbeddingService.estimateDuration(1);
      const many = BatchEmbeddingService.estimateDuration(1000);

      expect(many).toBeGreaterThan(single);
    });
  });

  describe("setProgressCallback", () => {
    it("should accept null callback", () => {
      expect(() => service.setProgressCallback(null)).not.toThrow();
    });

    it("should accept callback function", () => {
      const callback = jest.fn();
      expect(() => service.setProgressCallback(callback)).not.toThrow();
    });
  });

  // ==================== VUL-005: Error Callback Tests ====================

  describe("error callback (VUL-005)", () => {
    afterEach(() => {
      service.setErrorCallback(null);
    });

    it("should call error callback when batch fails", async () => {
      const texts = ["text1", "text2", "text3"];
      const errorCallbacks: any[] = [];

      const mockEmbed = jest.fn().mockRejectedValue(new Error("Network error"));

      service.setErrorCallback((error) => {
        errorCallbacks.push(error);
      });

      const result = await service.generateBatch(texts, mockEmbed);

      // Should have received error callback
      expect(errorCallbacks.length).toBeGreaterThan(0);
      const lastError = errorCallbacks[errorCallbacks.length - 1];
      expect(lastError.message).toBe("Network error");
      expect(lastError.batchIndex).toBeDefined();
      expect(lastError.failedCount).toBeGreaterThan(0);
      expect(lastError.timestamp).toBeDefined();
    });

    it("should accept null error callback", () => {
      expect(() => service.setErrorCallback(null)).not.toThrow();
    });

    it("should accept error callback function", () => {
      const callback = jest.fn();
      expect(() => service.setErrorCallback(callback)).not.toThrow();
    });

    it("should not call error callback on success", async () => {
      const texts = ["text1", "text2"];
      const errorCallbacks: any[] = [];

      const mockEmbed = jest.fn().mockResolvedValue([
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ]);

      service.setErrorCallback((error) => {
        errorCallbacks.push(error);
      });

      const result = await service.generateBatch(texts, mockEmbed);

      expect(result.failedCount).toBe(0);
      // Error callback should not be called on success
      expect(errorCallbacks.length).toBe(0);
    });

    it("should include retryable flag in error", async () => {
      const texts = ["text1"];
      const errorCallbacks: any[] = [];

      const mockEmbed = jest.fn().mockRejectedValue(new Error("Retryable error"));

      service.setErrorCallback((error) => {
        errorCallbacks.push(error);
      });

      const result = await service.generateBatch(texts, mockEmbed);

      expect(errorCallbacks.length).toBeGreaterThan(0);
      const lastError = errorCallbacks[errorCallbacks.length - 1];
      expect(lastError.retryable).toBeDefined();
    });
  });
});

describe("BatchEmbeddingService - Performance", () => {
  it("should process 1000 texts efficiently", async () => {
    const service = new BatchEmbeddingService({
      batchSize: 100,
      maxConcurrency: 5,
    });

    const texts = Array(1000).fill("performance test text");
    let batchIndex = 0;

    const mockEmbed = jest.fn().mockImplementation((batch: string[]) => {
      const startIdx = batchIndex * 100;
      batchIndex++;
      return Promise.resolve(batch.map((_, i) => Array(768).fill(0.1 * (startIdx + i))));
    });

    const startTime = Date.now();
    const result = await service.generateBatch(texts, mockEmbed);
    const duration = Date.now() - startTime;

    expect(result.totalProcessed).toBe(1000);
    expect(result.failedCount).toBe(0);
    // Should complete in reasonable time (parallel processing)
    expect(duration).toBeLessThan(10000); // 10 seconds max
  }, 15000); // Increase test timeout
});
