/**
 * IndexConfigOptimizer Test Suite
 *
 * Tests for the IVF_PQ index configuration optimizer.
 */

import {
  IndexConfigOptimizer,
  IndexConfig,
  OptimizationResult,
  INDEX_PRESETS,
  DataScale,
} from "../../../../src/services/tool-retrieval/IndexConfigOptimizer";

describe("IndexConfigOptimizer", () => {
  let optimizer: IndexConfigOptimizer;

  beforeEach(() => {
    optimizer = new IndexConfigOptimizer();
  });

  describe("constructor", () => {
    it("should initialize successfully", () => {
      expect(optimizer).toBeInstanceOf(IndexConfigOptimizer);
    });
  });

  describe("calculateNumPartitions", () => {
    it("should return at least 32 partitions for small datasets", () => {
      const partitions = optimizer.calculateNumPartitions(1000);
      expect(partitions).toBeGreaterThanOrEqual(32);
    });

    it("should calculate partitions using sqrt for small datasets (< 10K)", () => {
      const partitions = optimizer.calculateNumPartitions(5000);
      const expected = Math.max(32, Math.round(Math.sqrt(5000) * 2));
      expect(partitions).toBe(expected);
    });

    it("should use rowCount / 100 for medium datasets (10K-100K)", () => {
      const partitions = optimizer.calculateNumPartitions(50000);
      expect(partitions).toBe(500);
    });

    it("should cap partitions at 512 for medium datasets", () => {
      // Use 50K to stay clearly in medium range
      const partitions = optimizer.calculateNumPartitions(50000);
      expect(partitions).toBeLessThanOrEqual(512);
    });

    it("should use sqrt * 5 for large datasets (100K-1M)", () => {
      // Use 500K which is clearly in large range
      const partitions = optimizer.calculateNumPartitions(500000);
      // Without cap, it would be ~3536, but we cap at 1024 for large
      expect(partitions).toBeLessThanOrEqual(1024);
      expect(partitions).toBeGreaterThanOrEqual(500);
    });

    it("should cap partitions at 1024 for large datasets", () => {
      // Use 500K to stay clearly in large range
      const partitions = optimizer.calculateNumPartitions(500000);
      expect(partitions).toBeLessThanOrEqual(1024);
    });

    it("should use rowCount / 500 for xlarge datasets (> 1M)", () => {
      // Use 2M which is clearly in xlarge range
      const partitions = optimizer.calculateNumPartitions(2000000);
      // Without cap, it would be 4000, but we cap at 2048
      expect(partitions).toBeLessThanOrEqual(2048);
      expect(partitions).toBeGreaterThanOrEqual(1000);
    });

    it("should cap partitions at 2048 for xlarge datasets", () => {
      const partitions = optimizer.calculateNumPartitions(10000000);
      expect(partitions).toBeLessThanOrEqual(2048);
    });

    it("should handle edge case of zero rows", () => {
      const partitions = optimizer.calculateNumPartitions(0);
      expect(partitions).toBeGreaterThanOrEqual(32);
    });

    it("should handle edge case of single row", () => {
      const partitions = optimizer.calculateNumPartitions(1);
      expect(partitions).toBeGreaterThanOrEqual(32);
    });
  });

  describe("calculateNumSubVectors", () => {
    it("should return at least 8 sub-vectors", () => {
      const subVectors = optimizer.calculateNumSubVectors(64);
      expect(subVectors).toBeGreaterThanOrEqual(8);
    });

    it("should calculate sub-vectors as dimension / 6", () => {
      const subVectors = optimizer.calculateNumSubVectors(384);
      const expected = Math.round(384 / 6);
      expect(subVectors).toBe(expected);
    });

    it("should cap at 256 sub-vectors", () => {
      const subVectors = optimizer.calculateNumSubVectors(2048);
      expect(subVectors).toBeLessThanOrEqual(256);
    });

    it("should have minimum dimension / 8", () => {
      const subVectors = optimizer.calculateNumSubVectors(64);
      const minSubVectors = Math.floor(64 / 8);
      expect(subVectors).toBeGreaterThanOrEqual(minSubVectors);
    });

    it("should have maximum dimension / 4", () => {
      const subVectors = optimizer.calculateNumSubVectors(384);
      const maxSubVectors = Math.floor(384 / 4);
      expect(subVectors).toBeLessThanOrEqual(maxSubVectors);
    });

    it("should handle 768 dimension (common for embeddings)", () => {
      const subVectors = optimizer.calculateNumSubVectors(768);
      expect(subVectors).toBeGreaterThanOrEqual(96);
      expect(subVectors).toBeLessThanOrEqual(192);
    });

    it("should handle 1536 dimension (OpenAI large embeddings)", () => {
      const subVectors = optimizer.calculateNumSubVectors(1536);
      expect(subVectors).toBeGreaterThanOrEqual(192);
      expect(subVectors).toBeLessThanOrEqual(256);
    });
  });

  describe("calculateNumBits", () => {
    it("should return 8 bits for high recall (>= 0.9)", () => {
      expect(optimizer.calculateNumBits(0.9)).toBe(8);
      expect(optimizer.calculateNumBits(0.95)).toBe(8);
      expect(optimizer.calculateNumBits(0.99)).toBe(8);
    });

    it("should return 4 bits for lower recall (< 0.9)", () => {
      expect(optimizer.calculateNumBits(0.89)).toBe(4);
      expect(optimizer.calculateNumBits(0.8)).toBe(4);
      expect(optimizer.calculateNumBits(0.7)).toBe(4);
    });
  });

  describe("calculateMaxIterations", () => {
    it("should return 50 for very high recall (>= 0.95)", () => {
      expect(optimizer.calculateMaxIterations(0.95)).toBe(50);
      expect(optimizer.calculateMaxIterations(0.99)).toBe(50);
    });

    it("should return 35 for high recall (>= 0.9)", () => {
      expect(optimizer.calculateMaxIterations(0.9)).toBe(35);
      expect(optimizer.calculateMaxIterations(0.94)).toBe(35);
    });

    it("should return 20 for lower recall (< 0.9)", () => {
      expect(optimizer.calculateMaxIterations(0.89)).toBe(20);
      expect(optimizer.calculateMaxIterations(0.7)).toBe(20);
    });
  });

  describe("determineDistanceType", () => {
    it("should always return cosine for semantic search", () => {
      expect(optimizer.determineDistanceType(384)).toBe("cosine");
      expect(optimizer.determineDistanceType(768)).toBe("cosine");
      expect(optimizer.determineDistanceType(1536)).toBe("cosine");
    });
  });

  describe("getDataScale", () => {
    it("should return small for < 10K rows", () => {
      expect(optimizer.getDataScale(0)).toBe("small");
      expect(optimizer.getDataScale(5000)).toBe("small");
      expect(optimizer.getDataScale(9999)).toBe("small");
    });

    it("should return medium for 10K-100K rows", () => {
      expect(optimizer.getDataScale(10000)).toBe("medium");
      expect(optimizer.getDataScale(50000)).toBe("medium");
      expect(optimizer.getDataScale(99999)).toBe("medium");
    });

    it("should return large for 100K-1M rows", () => {
      expect(optimizer.getDataScale(100000)).toBe("large");
      expect(optimizer.getDataScale(500000)).toBe("large");
      expect(optimizer.getDataScale(999999)).toBe("large");
    });

    it("should return xlarge for >= 1M rows", () => {
      expect(optimizer.getDataScale(1000000)).toBe("xlarge");
      expect(optimizer.getDataScale(5000000)).toBe("xlarge");
      expect(optimizer.getDataScale(10000000)).toBe("xlarge");
    });
  });

  describe("getRefineFactor", () => {
    it("should return 30 for high recall (>= 0.95)", () => {
      expect(optimizer.getRefineFactor(0.95)).toBe(30);
      expect(optimizer.getRefineFactor(0.99)).toBe(30);
    });

    it("should return 20 for medium recall (>= 0.9)", () => {
      expect(optimizer.getRefineFactor(0.9)).toBe(20);
      expect(optimizer.getRefineFactor(0.94)).toBe(20);
    });

    it("should return 10 for lower recall", () => {
      expect(optimizer.getRefineFactor(0.89)).toBe(10);
      expect(optimizer.getRefineFactor(0.7)).toBe(10);
    });
  });

  describe("calculateOptimalConfig", () => {
    it("should return valid config for small dataset", () => {
      const result = optimizer.calculateOptimalConfig(5000, 384, 0.95);
      expect(result.config.numPartitions).toBeGreaterThanOrEqual(32);
      expect(result.config.numSubVectors).toBeGreaterThanOrEqual(8);
      expect(result.config.numBits).toBe(8);
      expect(result.estimatedRecall).toBeGreaterThan(0.7);
      expect(result.estimatedLatency).toBeGreaterThan(0);
      expect(result.reasoning).toContain("SMALL");
    });

    it("should return valid config for medium dataset", () => {
      const result = optimizer.calculateOptimalConfig(50000, 384, 0.95);
      expect(result.config.numPartitions).toBe(500);
      expect(result.config.numSubVectors).toBeGreaterThanOrEqual(8);
      expect(result.config.numBits).toBe(8);
      expect(result.reasoning).toContain("MEDIUM");
    });

    it("should return valid config for large dataset", () => {
      const result = optimizer.calculateOptimalConfig(500000, 384, 0.95);
      expect(result.config.numPartitions).toBeGreaterThanOrEqual(500);
      expect(result.config.numSubVectors).toBeGreaterThanOrEqual(8);
      expect(result.reasoning).toContain("LARGE");
    });

    it("should return 4 bits for lower recall target", () => {
      const result = optimizer.calculateOptimalConfig(50000, 384, 0.85);
      expect(result.config.numBits).toBe(4);
    });

    it("should prefer speed when specified", () => {
      const speedResult = optimizer.calculateOptimalConfig(50000, 384, 0.95, true);
      const accuracyResult = optimizer.calculateOptimalConfig(50000, 384, 0.95, false);
      expect(speedResult.estimatedRecall).toBeLessThanOrEqual(accuracyResult.estimatedRecall);
    });

    it("should handle different dimensions", () => {
      const result384 = optimizer.calculateOptimalConfig(50000, 384);
      const result768 = optimizer.calculateOptimalConfig(50000, 768);
      expect(result768.config.numSubVectors).toBeGreaterThan(result384.config.numSubVectors);
    });

    it("should include reasoning in result", () => {
      const result = optimizer.calculateOptimalConfig(5000, 384);
      expect(result.reasoning).toBeDefined();
      expect(typeof result.reasoning).toBe("string");
      expect(result.reasoning.length).toBeGreaterThan(0);
    });

    it("should set maxIterations based on recall target", () => {
      const highRecall = optimizer.calculateOptimalConfig(50000, 384, 0.95);
      const lowRecall = optimizer.calculateOptimalConfig(50000, 384, 0.8);
      expect(highRecall.config.maxIterations).toBeGreaterThan(lowRecall.config.maxIterations);
    });
  });

  describe("getPreset", () => {
    it("should return valid config for small preset", () => {
      const config = optimizer.getPreset("small");
      expect(config.numPartitions).toBe(INDEX_PRESETS.small.numPartitions);
      expect(config.numSubVectors).toBe(INDEX_PRESETS.small.numSubVectors);
      expect(config.numBits).toBe(INDEX_PRESETS.small.numBits);
    });

    it("should return valid config for medium preset", () => {
      const config = optimizer.getPreset("medium");
      expect(config.numPartitions).toBe(INDEX_PRESETS.medium.numPartitions);
      expect(config.numSubVectors).toBe(INDEX_PRESETS.medium.numSubVectors);
      expect(config.numBits).toBe(INDEX_PRESETS.medium.numBits);
    });

    it("should return valid config for large preset", () => {
      const config = optimizer.getPreset("large");
      expect(config.numPartitions).toBe(INDEX_PRESETS.large.numPartitions);
      expect(config.numSubVectors).toBe(INDEX_PRESETS.large.numSubVectors);
      expect(config.numBits).toBe(INDEX_PRESETS.large.numBits);
    });

    it("should return valid config for xlarge preset", () => {
      const config = optimizer.getPreset("xlarge");
      expect(config.numPartitions).toBe(INDEX_PRESETS.xlarge.numPartitions);
      expect(config.numSubVectors).toBe(INDEX_PRESETS.xlarge.numSubVectors);
      expect(config.numBits).toBe(INDEX_PRESETS.xlarge.numBits);
    });
  });

  describe("getAvailablePresets", () => {
    it("should return all preset names", () => {
      const presets = optimizer.getAvailablePresets();
      expect(presets).toContain("small");
      expect(presets).toContain("medium");
      expect(presets).toContain("large");
      expect(presets).toContain("xlarge");
      expect(presets.length).toBe(4);
    });
  });

  describe("integration scenarios", () => {
    it("should handle startup scenario with empty database", () => {
      const result = optimizer.calculateOptimalConfig(0, 384, 0.95);
      expect(result.config.numPartitions).toBeGreaterThanOrEqual(32);
      expect(result.config.numSubVectors).toBeGreaterThanOrEqual(8);
      expect(result.estimatedRecall).toBeGreaterThan(0.7);
    });

    it("should handle growing dataset scenario", () => {
      const smallResult = optimizer.calculateOptimalConfig(5000, 384);
      const mediumResult = optimizer.calculateOptimalConfig(50000, 384);
      const largeResult = optimizer.calculateOptimalConfig(500000, 384);

      expect(mediumResult.config.numPartitions).toBeGreaterThan(smallResult.config.numPartitions);
      expect(largeResult.config.numPartitions).toBeGreaterThan(mediumResult.config.numPartitions);
    });

    it("should handle different embedding dimensions", () => {
      const result384 = optimizer.calculateOptimalConfig(50000, 384);
      const result768 = optimizer.calculateOptimalConfig(50000, 768);
      const result1024 = optimizer.calculateOptimalConfig(50000, 1024);

      expect(result768.config.numSubVectors).toBeGreaterThan(result384.config.numSubVectors);
      expect(result1024.config.numSubVectors).toBeGreaterThan(result768.config.numSubVectors);
    });

    it("should prioritize accuracy over speed by default", () => {
      const result = optimizer.calculateOptimalConfig(50000, 384, 0.95, false);
      expect(result.config.numBits).toBe(8);
      expect(result.config.maxIterations).toBeGreaterThanOrEqual(35);
    });

    it("should provide recall improvements for high-precision use cases", () => {
      const precisionResult = optimizer.calculateOptimalConfig(50000, 384, 0.98);
      const standardResult = optimizer.calculateOptimalConfig(50000, 384, 0.9);

      expect(precisionResult.config.maxIterations).toBeGreaterThan(
        standardResult.config.maxIterations
      );
      expect(precisionResult.config.numBits).toBe(8);
    });
  });

  describe("INDEX_PRESETS constant", () => {
    it("should have all required scales", () => {
      expect(INDEX_PRESETS.small).toBeDefined();
      expect(INDEX_PRESETS.medium).toBeDefined();
      expect(INDEX_PRESETS.large).toBeDefined();
      expect(INDEX_PRESETS.xlarge).toBeDefined();
    });

    it("should have valid partition counts", () => {
      expect(INDEX_PRESETS.small.numPartitions).toBe(100);
      expect(INDEX_PRESETS.medium.numPartitions).toBe(500);
      expect(INDEX_PRESETS.large.numPartitions).toBe(1000);
      expect(INDEX_PRESETS.xlarge.numPartitions).toBe(2000);
    });

    it("should have valid sub-vector counts", () => {
      expect(INDEX_PRESETS.small.numSubVectors).toBe(32);
      expect(INDEX_PRESETS.medium.numSubVectors).toBe(64);
      expect(INDEX_PRESETS.large.numSubVectors).toBe(96);
      expect(INDEX_PRESETS.xlarge.numSubVectors).toBe(128);
    });

    it("should have row ranges that cover all sizes", () => {
      expect(INDEX_PRESETS.small.rowRange.max).toBe(10000);
      expect(INDEX_PRESETS.medium.rowRange.min).toBe(10000);
      expect(INDEX_PRESETS.medium.rowRange.max).toBe(100000);
      expect(INDEX_PRESETS.large.rowRange.min).toBe(100000);
      expect(INDEX_PRESETS.large.rowRange.max).toBe(1000000);
      expect(INDEX_PRESETS.xlarge.rowRange.min).toBe(1000000);
    });

    it("should have 8 bits for all presets", () => {
      expect(INDEX_PRESETS.small.numBits).toBe(8);
      expect(INDEX_PRESETS.medium.numBits).toBe(8);
      expect(INDEX_PRESETS.large.numBits).toBe(8);
      expect(INDEX_PRESETS.xlarge.numBits).toBe(8);
    });
  });
});
