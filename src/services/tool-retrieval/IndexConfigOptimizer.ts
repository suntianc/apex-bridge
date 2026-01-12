/**
 * IndexConfigOptimizer - IVF_PQ Index Configuration Optimizer
 *
 * Dynamically calculates optimal IVF_PQ index parameters based on data scale.
 * Improves vector search performance and recall rate.
 */

import { logger } from "../../utils/logger";

/**
 * IVF_PQ index configuration interface
 */
export interface IndexConfig {
  /** Number of IVF partitions */
  numPartitions: number;
  /** Number of sub-vectors for PQ */
  numSubVectors: number;
  /** Number of bits for PQ encoding (4 or 8) */
  numBits: 4 | 8;
  /** Maximum iterations for k-means clustering */
  maxIterations: number;
  /** Distance type for similarity search */
  distanceType: "l2" | "cosine" | "dot";
}

/**
 * Optimization result with estimated metrics
 */
export interface OptimizationResult {
  /** Calculated index configuration */
  config: IndexConfig;
  /** Estimated recall rate (0-1) */
  estimatedRecall: number;
  /** Estimated search latency in milliseconds */
  estimatedLatency: number;
  /** Reasoning for the calculated configuration */
  reasoning: string;
}

/**
 * Data scale category
 */
export type DataScale = "small" | "medium" | "large" | "xlarge";

/**
 * Preset configurations for different data scales
 */
export const INDEX_PRESETS: Record<
  DataScale,
  {
    numPartitions: number;
    numSubVectors: number;
    numBits: 4 | 8;
    expectedRecall: number;
    expectedLatency: string;
    rowRange: { min: number; max: number };
  }
> = {
  small: {
    numPartitions: 100,
    numSubVectors: 32,
    numBits: 8,
    expectedRecall: 0.95,
    expectedLatency: "1-2ms",
    rowRange: { min: 0, max: 10000 },
  },
  medium: {
    numPartitions: 500,
    numSubVectors: 64,
    numBits: 8,
    expectedRecall: 0.92,
    expectedLatency: "2-5ms",
    rowRange: { min: 10000, max: 100000 },
  },
  large: {
    numPartitions: 1000,
    numSubVectors: 96,
    numBits: 8,
    expectedRecall: 0.9,
    expectedLatency: "3-8ms",
    rowRange: { min: 100000, max: 1000000 },
  },
  xlarge: {
    numPartitions: 2000,
    numSubVectors: 128,
    numBits: 8,
    expectedRecall: 0.85,
    expectedLatency: "8-15ms",
    rowRange: { min: 1000000, max: Infinity },
  },
};

/**
 * IndexConfigOptimizer - Calculates optimal IVF_PQ index parameters
 *
 * Uses data-driven formulas to determine optimal partition count,
 * sub-vector count, and other parameters based on dataset size and
 * embedding dimension.
 */
export class IndexConfigOptimizer {
  /**
   * Calculate the optimal index configuration based on data scale
   *
   * @param rowCount - Number of vectors in the dataset
   * @param dimension - Embedding vector dimension
   * @param targetRecall - Target recall rate (default: 0.95)
   * @param preferSpeed - Whether to prioritize speed over recall (default: false)
   * @returns OptimizationResult with config and estimated metrics
   */
  calculateOptimalConfig(
    rowCount: number,
    dimension: number,
    targetRecall: number = 0.95,
    preferSpeed: boolean = false
  ): OptimizationResult {
    const scale = this.getDataScale(rowCount);
    const preset = INDEX_PRESETS[scale];

    // Calculate optimal parameters
    const numPartitions = this.calculateNumPartitions(rowCount);
    const numSubVectors = this.calculateNumSubVectors(dimension);
    const numBits = this.calculateNumBits(targetRecall);
    const maxIterations = this.calculateMaxIterations(targetRecall);
    const distanceType = this.determineDistanceType(dimension);

    // Adjust for speed preference
    const adjustedRecall = preferSpeed
      ? Math.min(targetRecall, preset.expectedRecall - 0.05)
      : targetRecall;

    // Calculate estimated metrics
    const estimatedRecall = this.estimateRecall(
      rowCount,
      numPartitions,
      numSubVectors,
      numBits,
      adjustedRecall
    );
    const estimatedLatency = this.estimateLatency(rowCount, numPartitions, preferSpeed);

    // Generate reasoning
    const reasoning = this.generateReasoning(
      scale,
      rowCount,
      dimension,
      numPartitions,
      numSubVectors,
      numBits,
      estimatedRecall,
      estimatedLatency
    );

    return {
      config: {
        numPartitions,
        numSubVectors,
        numBits,
        maxIterations,
        distanceType,
      },
      estimatedRecall,
      estimatedLatency,
      reasoning,
    };
  }

  /**
   * Calculate optimal number of partitions based on row count
   *
   * Formula:
   * - < 10K: sqrt(rowCount) * 2 (smaller but efficient)
   * - 10K - 100K: rowCount / 100 (balanced)
   * - 100K - 1M: sqrt(rowCount) * 5 (for larger datasets)
   * - > 1M: rowCount / 500 (scales with data)
   *
   * @param rowCount - Number of vectors
   * @returns Optimal partition count
   */
  calculateNumPartitions(rowCount: number): number {
    if (rowCount < 10000) {
      // Small dataset: use sqrt with minimum
      const partitions = Math.max(32, Math.round(Math.sqrt(rowCount) * 2));
      logger.debug(
        `[IndexConfigOptimizer] Small dataset (${rowCount} rows): ${partitions} partitions`
      );
      return partitions;
    }

    if (rowCount < 100000) {
      // Medium dataset: balanced approach
      const partitions = Math.round(rowCount / 100);
      logger.debug(
        `[IndexConfigOptimizer] Medium dataset (${rowCount} rows): ${partitions} partitions`
      );
      return Math.min(partitions, 512);
    }

    if (rowCount < 1000000) {
      // Large dataset: optimized for search speed
      const partitions = Math.round(Math.sqrt(rowCount) * 5);
      logger.debug(
        `[IndexConfigOptimizer] Large dataset (${rowCount} rows): ${partitions} partitions`
      );
      return Math.min(partitions, 1024);
    }

    // XLarge dataset: scales with data
    const partitions = Math.round(rowCount / 500);
    logger.debug(
      `[IndexConfigOptimizer] XLarge dataset (${rowCount} rows): ${partitions} partitions`
    );
    return Math.min(partitions, 2048);
  }

  /**
   * Calculate optimal number of sub-vectors based on dimension
   *
   * Sub-vectors should divide the original vector for PQ encoding.
   * Range: dimension/8 to dimension/4, with reasonable bounds.
   *
   * @param dimension - Embedding vector dimension
   * @returns Optimal sub-vector count
   */
  calculateNumSubVectors(dimension: number): number {
    // Minimum: dimension / 8, Maximum: dimension / 4
    const minSubVectors = Math.max(8, Math.floor(dimension / 8));
    const maxSubVectors = Math.min(256, Math.floor(dimension / 4));

    // Use dimension / 6 as a balanced choice
    const subVectors = Math.round(dimension / 6);

    const clampedSubVectors = Math.max(minSubVectors, Math.min(maxSubVectors, subVectors));
    logger.debug(
      `[IndexConfigOptimizer] Dimension ${dimension}: ${clampedSubVectors} sub-vectors (range: ${minSubVectors}-${maxSubVectors})`
    );

    return clampedSubVectors;
  }

  /**
   * Calculate optimal number of bits for PQ encoding
   *
   * - High recall (> 0.9): use 8 bits for better accuracy
   * - Lower recall: use 4 bits for faster encoding
   *
   * @param targetRecall - Target recall rate
   * @returns Number of bits (4 or 8)
   */
  calculateNumBits(targetRecall: number): 4 | 8 {
    return targetRecall >= 0.9 ? 8 : 4;
  }

  /**
   * Calculate maximum iterations for k-means clustering
   *
   * Higher recall requires more iterations for better centroids.
   *
   * @param targetRecall - Target recall rate
   * @returns Maximum iterations
   */
  calculateMaxIterations(targetRecall: number): number {
    if (targetRecall >= 0.95) {
      return 50;
    }
    if (targetRecall >= 0.9) {
      return 35;
    }
    return 20;
  }

  /**
   * Determine optimal distance type based on dimension
   *
   * - Cosine similarity works well for most embeddings
   * - L2 distance is good for normalized vectors
   * - Dot product is fastest but requires normalized vectors
   *
   * @param dimension - Embedding vector dimension
   * @returns Distance type
   */
  determineDistanceType(dimension: number): "l2" | "cosine" | "dot" {
    // Cosine is generally best for semantic search
    return "cosine";
  }

  /**
   * Get the data scale category based on row count
   *
   * @param rowCount - Number of vectors
   * @returns Data scale category
   */
  getDataScale(rowCount: number): DataScale {
    if (rowCount < 10000) {
      return "small";
    }
    if (rowCount < 100000) {
      return "medium";
    }
    if (rowCount < 1000000) {
      return "large";
    }
    return "xlarge";
  }

  /**
   * Get refine factor based on target recall
   *
   * Refine factor is used for re-ranking results to improve recall.
   *
   * @param targetRecall - Target recall rate
   * @returns Refine factor for LanceDB index
   */
  getRefineFactor(targetRecall: number): number {
    if (targetRecall >= 0.95) {
      return 30;
    }
    if (targetRecall >= 0.9) {
      return 20;
    }
    return 10;
  }

  /**
   * Estimate recall rate based on configuration
   *
   * This is a simplified model based on research findings.
   * Actual recall depends on data distribution and query characteristics.
   *
   * @param rowCount - Number of vectors
   * @param numPartitions - Number of partitions
   * @param numSubVectors - Number of sub-vectors
   * @param numBits - Number of bits for PQ
   * @param targetRecall - Target recall
   * @returns Estimated recall rate
   */
  private estimateRecall(
    rowCount: number,
    numPartitions: number,
    numSubVectors: number,
    numBits: 4 | 8,
    targetRecall: number
  ): number {
    // Base recall based on numBits (8 bits = better recall)
    const bitFactor = numBits === 8 ? 1.0 : 0.92;

    // Partition factor (more partitions = better recall up to a point)
    const partitionFactor = Math.min(1.0, (numPartitions / Math.sqrt(rowCount)) * 2);

    // Sub-vector factor (more sub-vectors = better recall)
    const subVectorFactor = Math.min(1.0, numSubVectors / 64);

    // Combined estimate (weighted average)
    const estimated =
      (bitFactor * 0.4 + partitionFactor * 0.35 + subVectorFactor * 0.25) * targetRecall;

    // Clamp between 0.7 and 0.99
    return Math.min(0.99, Math.max(0.7, estimated));
  }

  /**
   * Estimate search latency based on configuration
   *
   * @param rowCount - Number of vectors
   * @param numPartitions - Number of partitions
   * @param preferSpeed - Whether speed is prioritized
   * @returns Estimated latency in milliseconds
   */
  private estimateLatency(rowCount: number, numPartitions: number, preferSpeed: boolean): number {
    // Base latency proportional to log of row count
    const baseLatency = Math.log10(rowCount) * 0.5;

    // Adjust for partitions (more partitions = slightly slower but more accurate)
    const partitionFactor = Math.log2(numPartitions) * 0.3;

    // Speed preference reduces latency
    const speedFactor = preferSpeed ? 0.7 : 1.0;

    const estimated = (baseLatency + partitionFactor) * speedFactor;

    // Clamp between 1ms and 50ms
    return Math.min(50, Math.max(1, estimated));
  }

  /**
   * Generate human-readable reasoning for the configuration
   *
   * @param scale - Data scale category
   * @param rowCount - Number of vectors
   * @param dimension - Embedding dimension
   * @param numPartitions - Calculated partitions
   * @param numSubVectors - Calculated sub-vectors
   * @param numBits - Calculated bits
   * @param estimatedRecall - Estimated recall rate
   * @param estimatedLatency - Estimated latency
   * @returns Reasoning string
   */
  private generateReasoning(
    scale: DataScale,
    rowCount: number,
    dimension: number,
    numPartitions: number,
    numSubVectors: number,
    numBits: 4 | 8,
    estimatedRecall: number,
    estimatedLatency: number
  ): string {
    const scaleEmoji = {
      small: "🟢",
      medium: "🔵",
      large: "🟠",
      xlarge: "🔴",
    };

    return (
      `${scaleEmoji[scale]} ${scale.toUpperCase()} dataset optimization\n` +
      `  • Row count: ${rowCount.toLocaleString()} vectors\n` +
      `  • Dimension: ${dimension}\n` +
      `  • Partitions: ${numPartitions} (${(numPartitions / Math.sqrt(rowCount)).toFixed(2)}x sqrt(n))\n` +
      `  • Sub-vectors: ${numSubVectors} (${dimension / numSubVectors} dims per sub-vector)\n` +
      `  • PQ bits: ${numBits} (${numBits === 8 ? "higher accuracy" : "faster encoding"})\n` +
      `  • Expected recall: ${(estimatedRecall * 100).toFixed(1)}%\n` +
      `  • Expected latency: ~${estimatedLatency.toFixed(1)}ms`
    );
  }

  /**
   * Get a preset configuration for quick setup
   *
   * @param scale - Data scale category
   * @returns Preset configuration
   */
  getPreset(scale: DataScale): IndexConfig {
    const preset = INDEX_PRESETS[scale];
    return {
      numPartitions: preset.numPartitions,
      numSubVectors: preset.numSubVectors,
      numBits: preset.numBits,
      maxIterations: 30,
      distanceType: "cosine",
    };
  }

  /**
   * Get all available preset names
   *
   * @returns Array of preset names
   */
  getAvailablePresets(): DataScale[] {
    return ["small", "medium", "large", "xlarge"];
  }
}
