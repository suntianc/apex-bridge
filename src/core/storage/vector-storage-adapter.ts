/**
 * Vector Storage Adapter
 *
 * Bridges IVectorStorage interface with SearchEngine/SkillIndexer which expect
 * LanceDB-compatible APIs. This adapter handles the interface mismatch.
 */

import { logger } from "../../utils/logger";
import type {
  IVectorStorage,
  VectorRecord,
  VectorSearchOptions,
  VectorSearchResult,
} from "./interfaces";
import type { ToolRetrievalResult, ToolsTable } from "../../services/tool-retrieval/types";

/**
 * Adapter that provides LanceDB-compatible interface using IVectorStorage
 */
export class VectorStorageAdapter {
  private storage: IVectorStorage;
  private dimension: number;

  constructor(storage: IVectorStorage) {
    this.storage = storage;
    this.dimension = storage.getDimension();
  }

  /**
   * Get the underlying storage instance
   */
  getStorage(): IVectorStorage {
    return this.storage;
  }

  /**
   * Get table (for compatibility - returns null for non-LanceDB backends)
   */
  async getTable(): Promise<null> {
    return null;
  }

  /**
   * Check if storage is available
   */
  isAvailable(): boolean {
    return true;
  }

  /**
   * Search for similar vectors (compatible with SearchEngine interface)
   * Takes a pre-computed query vector and returns formatted results
   */
  async searchWithVector(
    queryVector: number[],
    options?: { limit?: number; threshold?: number }
  ): Promise<ToolRetrievalResult[]> {
    const searchOptions: VectorSearchOptions = {
      limit: options?.limit ?? 10,
      threshold: options?.threshold ?? 0.7,
      distanceType: "cosine",
    };

    const results = await this.storage.search(queryVector, searchOptions);
    return this.formatSearchResults(results);
  }

  /**
   * Keyword search fallback - iterates all records and filters by keyword
   */
  async keywordSearch(query: string, limit: number = 10): Promise<ToolRetrievalResult[]> {
    const searchTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    const allRecords = await this.getAllRecords();

    const results: ToolRetrievalResult[] = [];

    for (const record of allRecords) {
      try {
        const data = this.extractRecordData(record);
        const searchableText =
          `${data.name} ${data.description} ${(data.tags || []).join(" ")}`.toLowerCase();
        const matchCount = searchTerms.filter((term) => searchableText.includes(term)).length;

        if (matchCount === 0) {
          continue;
        }

        const nameMatches = searchTerms.filter((term) =>
          data.name.toLowerCase().includes(term)
        ).length;

        const score = 0.5 + nameMatches * 0.25 + matchCount * 0.1;
        const normalizedScore = Math.min(score, 1.0);

        results.push({
          id: data.id,
          name: data.name,
          description: data.description,
          tags: data.tags || [],
          toolType: (data.toolType as "skill" | "mcp" | "builtin") || "skill",
          metadata: {
            ...data.metadata,
            path: data.path,
            version: data.version,
            source: data.source,
          },
          score: normalizedScore,
        });
      } catch (error) {
        logger.warn("[VectorStorageAdapter] Error processing record for keyword search:", error);
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Get all records from storage for keyword search
   */
  private async getAllRecords(): Promise<VectorRecord[]> {
    const totalCount = await this.storage.count();

    if (totalCount > 10000) {
      logger.warn("[VectorStorageAdapter] Too many records for keyword search");
      return [];
    }

    try {
      const dummyVector = new Array(this.dimension).fill(0);
      const results = await this.storage.search(dummyVector, {
        limit: Math.min(totalCount, 1000),
      });
      return results.map((r) => ({
        id: r.id,
        vector: new Array(this.dimension).fill(0),
        metadata: r.metadata,
      }));
    } catch (error) {
      logger.error("[VectorStorageAdapter] Failed to get all records:", error);
      return [];
    }
  }

  /**
   * Add a single record
   */
  async addRecord(record: ToolsTable): Promise<void> {
    await this.storage.upsert(record.id, record.vector, {
      name: record.name,
      description: record.description,
      tags: record.tags,
      path: record.path,
      version: record.version,
      source: record.source,
      toolType: record.toolType,
      metadata: record.metadata,
      indexedAt: record.indexedAt,
    });
  }

  /**
   * Add multiple records
   */
  async addRecords(records: ToolsTable[]): Promise<void> {
    const vectorRecords: VectorRecord[] = records.map((record) => ({
      id: record.id,
      vector: record.vector,
      metadata: {
        name: record.name,
        description: record.description,
        tags: record.tags,
        path: record.path,
        version: record.version,
        source: record.source,
        toolType: record.toolType,
        metadata: record.metadata,
        indexedAt: record.indexedAt,
      },
    }));

    await this.storage.upsertBatch(vectorRecords);
  }

  /**
   * Delete a record by ID
   */
  async deleteById(id: string): Promise<boolean> {
    return await this.storage.delete(id);
  }

  /**
   * Get record count
   */
  async getCount(): Promise<number> {
    return await this.storage.count();
  }

  /**
   * Format search results to ToolRetrievalResult format
   */
  private formatSearchResults(results: VectorSearchResult[]): ToolRetrievalResult[] {
    return results.map((result) => {
      const metadata = result.metadata;
      return {
        id: result.id,
        name: (metadata.name as string) || result.id,
        description: (metadata.description as string) || "",
        tags: (metadata.tags as string[]) || [],
        path: (metadata.path as string) || "",
        version: (metadata.version as string) || "",
        source: (metadata.source as string) || "builtin",
        toolType: (metadata.toolType as "skill" | "mcp" | "builtin") || "skill",
        metadata: metadata,
        score: result.score,
      };
    });
  }

  /**
   * Extract record data from VectorRecord
   */
  private extractRecordData(record: VectorRecord): {
    id: string;
    name: string;
    description: string;
    tags: string[];
    path: string;
    version: string;
    source: string;
    toolType: string;
    metadata: Record<string, unknown>;
  } {
    const metadata = record.metadata;
    return {
      id: record.id,
      name: (metadata.name as string) || record.id,
      description: (metadata.description as string) || "",
      tags: (metadata.tags as string[]) || [],
      path: (metadata.path as string) || "",
      version: (metadata.version as string) || "",
      source: (metadata.source as string) || "builtin",
      toolType: (metadata.toolType as string) || "skill",
      metadata: metadata,
    };
  }
}
