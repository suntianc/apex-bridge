/**
 * SQLite Storage Adapter
 *
 * Unified adapter that wraps SQLite-based storage implementations.
 */

import { SQLiteLLMConfigStorage } from "./llm-config";

interface SQLiteStorageAdapterOptions {
  path?: string;
  walMode?: boolean;
  foreignKeys?: boolean;
}

export class SQLiteStorageAdapter {
  llmConfig: SQLiteLLMConfigStorage;

  constructor(options: SQLiteStorageAdapterOptions = {}) {
    this.llmConfig = new SQLiteLLMConfigStorage(options.path);
  }

  close(): void {
    this.llmConfig.close();
  }
}

export type { SQLiteStorageAdapterOptions };
