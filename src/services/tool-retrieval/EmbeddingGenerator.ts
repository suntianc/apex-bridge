/**
 * EmbeddingGenerator - Embedding Generation
 *
 * Handles embedding generation for skills and tools using LLMManager.
 */

import { logger } from "../../utils/logger";
import {
  EmbeddingConfig,
  EmbeddingVector,
  SkillData,
  MCPTool,
  ToolError,
  ToolErrorCode,
  EmbeddingInput,
} from "./types";
import { BatchEmbeddingService, BatchEmbeddingResult } from "./BatchEmbeddingService";

// LLMManager lazy import to avoid circular dependency
let llmManagerInstance: unknown = null;

// Batch embedding service singleton
let batchEmbeddingService: BatchEmbeddingService | null = null;

/**
 * EmbeddingGenerator interface
 */
export interface IEmbeddingGenerator {
  generateForSkill(skill: SkillData): Promise<EmbeddingVector>;
  generateForTool(tool: MCPTool): Promise<EmbeddingVector>;
  generateForText(text: string): Promise<EmbeddingVector>;
  generateBatch(texts: string[]): Promise<EmbeddingVector[]>;
  getConfig(): EmbeddingConfig;
  getActualDimensions(): Promise<number>;
}

/**
 * EmbeddingGenerator implementation
 */
export class EmbeddingGenerator implements IEmbeddingGenerator {
  private config: EmbeddingConfig;
  private dimensionsCache: number | null = null;
  private llmConfigService: unknown = null;
  private batchService: BatchEmbeddingService;

  constructor(config: EmbeddingConfig) {
    this.config = config;
    this.batchService = new BatchEmbeddingService({
      batchSize: 100,
      maxConcurrency: 5,
      retryAttempts: 3,
    });
    logger.info("[EmbeddingGenerator] Created with config:", {
      provider: config.provider,
      model: config.model,
      dimensions: config.dimensions,
    });
  }

  /**
   * Get actual dimensions from LLMConfigService
   */
  async getActualDimensions(): Promise<number> {
    if (this.dimensionsCache !== null) {
      return this.dimensionsCache;
    }

    try {
      // Lazy import to avoid circular dependency
      if (!this.llmConfigService) {
        const { LLMConfigService } = await import("../../services/LLMConfigService");
        this.llmConfigService = LLMConfigService.getInstance();
      }

      // Get default embedding model
      const embeddingModel = (
        this.llmConfigService as { getDefaultModel(type: string): unknown }
      ).getDefaultModel("embedding");

      if (embeddingModel && typeof embeddingModel === "object") {
        const modelConfig = (embeddingModel as { modelConfig?: { dimensions?: number } })
          .modelConfig;
        const dimensions = modelConfig?.dimensions || this.config.dimensions;

        logger.info(`[EmbeddingGenerator] Using actual dimensions: ${dimensions}`);
        this.dimensionsCache = dimensions;
        return dimensions;
      }
    } catch (error) {
      logger.warn("[EmbeddingGenerator] Failed to get actual dimensions:", error);
    }

    return this.config.dimensions;
  }

  /**
   * Generate embedding for a skill
   */
  async generateForSkill(skill: SkillData): Promise<EmbeddingVector> {
    const input: EmbeddingInput = {
      name: skill.name,
      description: skill.description,
      tags: skill.tags || [],
    };

    return this.generate(input);
  }

  /**
   * Generate embedding for an MCP tool
   */
  async generateForTool(tool: MCPTool): Promise<EmbeddingVector> {
    const input: EmbeddingInput = {
      name: tool.name,
      description: tool.description,
      tags: (tool.metadata?.tags as string[]) || [],
    };

    return this.generate(input);
  }

  /**
   * Generate embedding for text
   */
  async generateForText(text: string): Promise<EmbeddingVector> {
    return this.generate({
      name: text,
      description: text,
      tags: [],
    });
  }

  /**
   * Generate batch embeddings (optimized with parallel processing)
   */
  async generateBatch(texts: string[]): Promise<EmbeddingVector[]> {
    if (texts.length === 0) {
      return [];
    }

    // For small batches, use direct LLMManager call for efficiency
    if (texts.length <= 10) {
      return this.generateBatchDirect(texts);
    }

    // For larger batches, use batch service with parallel processing
    const startTime = Date.now();

    try {
      // Prepare embedding inputs
      const inputs = texts.map((text) =>
        this.prepareEmbeddingText({
          name: text,
          description: text,
          tags: [],
        })
      );

      // Use batch embedding service
      const result = await this.batchService.generateBatch(inputs, async (batchTexts: string[]) => {
        return this.callLLMEmbed(batchTexts);
      });

      logger.debug(
        `[EmbeddingGenerator] Batch generated ${result.totalProcessed}/${texts.length} embeddings in ${result.duration}ms`
      );

      // Convert to EmbeddingVector format
      return result.embeddings.map((values) => ({
        values,
        dimensions: values.length,
        model: this.config.model,
      }));
    } catch (error) {
      logger.error(
        "[EmbeddingGenerator] Batch embedding failed, falling back to sequential:",
        error
      );
      // Fallback to sequential processing
      return this.generateBatchDirect(texts);
    }
  }

  /**
   * Direct batch embedding (for small batches)
   */
  private async generateBatchDirect(texts: string[]): Promise<EmbeddingVector[]> {
    const vectors: EmbeddingVector[] = [];

    for (const text of texts) {
      const vector = await this.generateForText(text);
      vectors.push(vector);
    }

    return vectors;
  }

  /**
   * Call LLMManager embed method
   */
  private async callLLMEmbed(texts: string[]): Promise<number[][]> {
    // Lazy import LLMManager
    if (!llmManagerInstance) {
      const { LLMManager } = await import("../../core/LLMManager");
      llmManagerInstance = new LLMManager();
    }

    const embeddings = await (
      llmManagerInstance as { embed(texts: string[]): Promise<number[][]> }
    ).embed(texts);

    if (!embeddings || embeddings.length === 0) {
      throw new Error("Empty embedding result from LLMManager");
    }

    return embeddings;
  }

  /**
   * Core embedding generation
   */
  private async generate(input: EmbeddingInput): Promise<EmbeddingVector> {
    try {
      logger.debug(`[EmbeddingGenerator] Generating embedding for: ${input.name}`);

      // Generate embedding using remote API
      const vector = await this.generateRemoteEmbedding(input);

      return {
        values: vector,
        dimensions: vector.length,
        model: this.config.model,
      };
    } catch (error) {
      logger.error(`[EmbeddingGenerator] Failed to generate embedding for ${input.name}:`, error);
      throw new ToolError(
        `Embedding generation failed: ${this.formatError(error)}`,
        ToolErrorCode.EMBEDDING_MODEL_ERROR
      );
    }
  }

  /**
   * Generate embedding using remote API (via LLMManager)
   */
  private async generateRemoteEmbedding(input: EmbeddingInput): Promise<number[]> {
    try {
      // Lazy import LLMManager
      if (!llmManagerInstance) {
        const { LLMManager } = await import("../../core/LLMManager");
        llmManagerInstance = new LLMManager();
      }

      // Prepare text for embedding
      const text = this.prepareEmbeddingText(input);

      // Call LLMManager.embed()
      const embeddings = await (
        llmManagerInstance as { embed(texts: string[]): Promise<number[][]> }
      ).embed([text]);

      if (!embeddings || embeddings.length === 0 || !embeddings[0]) {
        throw new Error("Empty embedding result");
      }

      logger.debug(
        `[EmbeddingGenerator] Generated remote embedding: ${embeddings[0].length} dimensions`
      );
      return embeddings[0];
    } catch (error) {
      logger.error("[EmbeddingGenerator] Remote embedding generation failed:", error);
      throw error;
    }
  }

  /**
   * Prepare text for embedding
   */
  private prepareEmbeddingText(input: EmbeddingInput): string {
    const parts = [input.name, input.description, ...(input.tags || [])];

    return parts.join(" ").trim();
  }

  /**
   * Get configuration
   */
  getConfig(): EmbeddingConfig {
    return this.config;
  }

  /**
   * Format error message
   */
  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    return "Unknown error occurred in EmbeddingGenerator";
  }
}

/**
 * Get LLMManager instance (for embedding)
 */
export function getEmbeddingLLMManager(): unknown {
  return llmManagerInstance;
}

/**
 * Reset LLMManager instance (for testing)
 */
export function resetEmbeddingLLMManager(): void {
  llmManagerInstance = null;
}

/**
 * Get batch embedding service (for advanced usage)
 */
export function getBatchEmbeddingService(): BatchEmbeddingService | null {
  return batchEmbeddingService;
}

/**
 * Reset batch embedding service (for testing)
 */
export function resetBatchEmbeddingService(): void {
  batchEmbeddingService = null;
}
