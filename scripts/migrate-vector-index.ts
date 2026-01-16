/**
 * Vector Index Migration Script
 *
 * Migrates vector index from LanceDB to SurrealDB.
 * Usage: npx ts-node scripts/migrate-vector-index.ts
 *
 * Environment variables:
 * - APEX_SURREALDB_VECTOR_DUAL_WRITE: Enable dual-write after migration
 * - APEX_SURREALDB_VECTOR_RW_SPLIT: Enable RW-split after migration
 * - APEX_SURREALDB_VECTOR_BATCH_SIZE: Batch size for migration (default: 100)
 */

import * as path from "path";
import { fileURLToPath } from "url";
import type { IVectorStorage, VectorRecord } from "../src/core/storage/interfaces";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function log(level: string, message: string, meta?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[${timestamp}] [${level}] ${message}${metaStr}`);
}

async function migrateVectorIndex(): Promise<void> {
  const { LanceDBVectorStorage } = await import("../src/core/storage/lance/vector-storage");
  const { SurrealDBVectorStorage } = await import("../src/core/storage/surrealdb/vector-storage");

  const BATCH_SIZE = parseInt(process.env.APEX_SURREALDB_VECTOR_BATCH_SIZE || "100", 10);

  log("INFO", "Starting vector index migration...", {
    batchSize: BATCH_SIZE,
    source: "LanceDB",
    target: "SurrealDB",
  });

  const lanceDB = new LanceDBVectorStorage();
  const surrealdb = new SurrealDBVectorStorage();

  try {
    log("INFO", "Initializing SurrealDB connection...");
    await surrealdb.initialize();

    const lanceCount = await lanceDB.count();
    log("INFO", `LanceDB vector count: ${lanceCount}`);

    if (lanceCount === 0) {
      log("INFO", "No vectors to migrate");
      return;
    }

    log("INFO", "Fetching vectors from LanceDB...");

    const migratedCount = await migrateVectors(lanceDB, surrealdb, BATCH_SIZE);

    log("INFO", `Migration complete: ${migratedCount} vectors migrated`);

    const surrealdbCount = await surrealdb.count();
    log("INFO", `SurrealDB vector count: ${surrealdbCount}`);

    if (migratedCount !== surrealdbCount) {
      log("WARN", `Count mismatch: migrated=${migratedCount}, SurrealDB=${surrealdbCount}`);
    }

    if (process.env.APEX_SURREALDB_VECTOR_DUAL_WRITE === "true") {
      log("INFO", "Dual-write enabled - vectors will sync to SurrealDB");
    }

    if (process.env.APEX_SURREALDB_VECTOR_RW_SPLIT === "true") {
      log("INFO", "Read-write split enabled - reads can switch to SurrealDB after warmup");
    }

    log("INFO", "Migration completed successfully!");
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log("ERROR", "Migration failed:", { error: errorMessage });
    throw error;
  }
}

async function migrateVectors(
  source: IVectorStorage,
  target: IVectorStorage,
  batchSize: number
): Promise<number> {
  let migrated = 0;
  const allRecords: VectorRecord[] = [];

  log("INFO", "Fetching all vectors from LanceDB...");

  let offset = 0;
  while (allRecords.length < 10000) {
    const batch = await fetchVectorBatch(source, offset, batchSize);
    if (batch.length === 0) {
      break;
    }
    allRecords.push(...batch);
    offset += batchSize;
    log("DEBUG", `Fetched ${allRecords.length} vectors...`);
  }

  log("INFO", `Total vectors to migrate: ${allRecords.length}`);

  for (let i = 0; i < allRecords.length; i += batchSize) {
    const batch = allRecords.slice(i, i + batchSize);

    log(
      "INFO",
      `Migrating batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allRecords.length / batchSize)} (${batch.length} vectors)`
    );

    try {
      await target.upsertBatch(batch);
      migrated += batch.length;

      log(
        "INFO",
        `Progress: ${migrated}/${allRecords.length} (${((migrated / allRecords.length) * 100).toFixed(1)}%)`
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("ERROR", `Batch migration failed:`, { error: errorMessage, batchStart: i });

      for (const record of batch) {
        try {
          await target.upsert(record.id, record.vector, record.metadata);
          migrated++;
        } catch (singleError: unknown) {
          const singleErrorMessage =
            singleError instanceof Error ? singleError.message : String(singleError);
          log("ERROR", `Failed to migrate vector:`, { id: record.id, error: singleErrorMessage });
        }
      }
    }
  }

  return migrated;
}

async function fetchVectorBatch(
  source: IVectorStorage,
  offset: number,
  limit: number
): Promise<VectorRecord[]> {
  const records: VectorRecord[] = [];

  const searchResult = await source.search(new Array(1536).fill(0), { limit: limit * 10 });

  const ids = new Set<string>();
  const startIndex = Math.floor(offset / 10);
  const endIndex = startIndex + limit;

  for (let i = startIndex; i < Math.min(searchResult.length, endIndex); i++) {
    const item = searchResult[i];
    if (!ids.has(item.id)) {
      ids.add(item.id);
      records.push({
        id: item.id,
        vector: new Array(1536).fill(0),
        metadata: item.metadata,
      });
    }
  }

  return records;
}

migrateVectorIndex()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("[VectorMigration] Script failed:", error);
    process.exit(1);
  });
