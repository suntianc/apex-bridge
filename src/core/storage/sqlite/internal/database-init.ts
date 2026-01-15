/**
 * SQLite Database Initialization Utilities
 *
 * Contains all database schema creation and initialization logic
 * that was previously in LLMConfigService.
 */

import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";
import { PathService } from "../../../../services/PathService";
import { logger } from "../../../../utils/logger";

export interface DatabaseConfig {
  path: string;
  walMode?: boolean;
  foreignKeys?: boolean;
}

export function ensureDataDir(): string {
  const pathService = PathService.getInstance();
  const dataDir = pathService.getDataDir();

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  return dataDir;
}

export function createDatabase(config: DatabaseConfig): Database.Database {
  ensureDataDir();

  const db = new Database(config.path);

  if (config.walMode) {
    db.pragma("journal_mode = WAL");
  }

  if (config.foreignKeys) {
    db.pragma("foreign_keys = ON");
  }

  return db;
}

export function initializeDatabaseSchema(db: Database.Database): void {
  db.exec(`
    -- 提供商表
    CREATE TABLE IF NOT EXISTS llm_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      base_config TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      CHECK(enabled IN (0, 1))
    );

    -- 模型表
    CREATE TABLE IF NOT EXISTS llm_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      model_key TEXT NOT NULL,
      model_name TEXT NOT NULL,
      model_type TEXT NOT NULL,
      model_config TEXT NOT NULL,
      api_endpoint_suffix TEXT,
      enabled INTEGER DEFAULT 1,
      is_default INTEGER DEFAULT 0,
      is_ace_evolution INTEGER DEFAULT 0,
      display_order INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (provider_id) REFERENCES llm_providers(id) ON DELETE CASCADE,
      UNIQUE(provider_id, model_key),
      CHECK(enabled IN (0, 1)),
      CHECK(is_default IN (0, 1)),
      CHECK(is_ace_evolution IN (0, 1))
    );

    -- 提供商索引
    CREATE INDEX IF NOT EXISTS idx_provider ON llm_providers(provider);
    CREATE INDEX IF NOT EXISTS idx_provider_enabled ON llm_providers(enabled);

    -- 模型索引
    CREATE INDEX IF NOT EXISTS idx_model_provider ON llm_models(provider_id);
    CREATE INDEX IF NOT EXISTS idx_model_type ON llm_models(model_type);
    CREATE INDEX IF NOT EXISTS idx_model_enabled ON llm_models(enabled);
    CREATE INDEX IF NOT EXISTS idx_model_default ON llm_models(is_default);
    CREATE INDEX IF NOT EXISTS idx_model_key ON llm_models(model_key);
    CREATE INDEX IF NOT EXISTS idx_model_type_default ON llm_models(model_type, is_default);
  `);

  const columns = db.prepare("PRAGMA table_info(llm_models)").all() as Array<{
    name: string;
  }>;
  const columnNames = new Set(columns.map((c) => c.name));

  const aceLayerColumns = [
    "is_ace_layer_l1",
    "is_ace_layer_l2",
    "is_ace_layer_l3",
    "is_ace_layer_l4",
    "is_ace_layer_l5",
    "is_ace_layer_l6",
  ];

  for (const col of aceLayerColumns) {
    if (!columnNames.has(col)) {
      db.exec(`ALTER TABLE llm_models ADD COLUMN ${col} INTEGER DEFAULT 0`);
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_model_ace_l1 ON llm_models(is_ace_layer_l1);
    CREATE INDEX IF NOT EXISTS idx_model_ace_l2 ON llm_models(is_ace_layer_l2);
    CREATE INDEX IF NOT EXISTS idx_model_ace_l3 ON llm_models(is_ace_layer_l3);
    CREATE INDEX IF NOT EXISTS idx_model_ace_l4 ON llm_models(is_ace_layer_l4);
    CREATE INDEX IF NOT EXISTS idx_model_ace_l5 ON llm_models(is_ace_layer_l5);
    CREATE INDEX IF NOT EXISTS idx_model_ace_l6 ON llm_models(is_ace_layer_l6);
  `);

  logger.debug(
    "✅ LLM v2 tables initialized (ACE layer support retained for backward compatibility)"
  );
}

export function getDefaultDbPath(): string {
  const pathService = PathService.getInstance();
  const dataDir = ensureDataDir();
  return path.join(dataDir, "llm_providers.db");
}
