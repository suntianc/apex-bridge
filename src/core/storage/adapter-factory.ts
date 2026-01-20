/**
 * Storage Adapter Factory
 *
 * Creates storage adapter instances based on configuration.
 * Supports SurrealDB, SQLite, and LanceDB backends.
 */

import {
  StorageBackend,
  StorageConfig,
  StorageFeatureFlags,
  ILLMConfigStorage,
  IMCPConfigStorage,
  IConversationStorage,
  ITrajectoryStorage,
  IVectorStorage,
} from "./interfaces";
import { logger } from "../../utils/logger";

import { LanceDBVectorStorage } from "./lance/vector-storage";
import { SurrealDBVectorStorage } from "./surrealdb/vector-storage";

import { SQLiteLLMConfigStorage } from "./sqlite/llm-config";
import { SQLiteConversationStorage } from "./sqlite/conversation";
import { SQLiteTrajectoryStorage } from "./sqlite/trajectory";
import { SurrealDBLLMConfigStorage } from "./surrealdb/llm-config";
import { SurrealDBConversationStorage } from "./surrealdb/conversation";
import { SurrealDBMCPConfigStorage } from "./surrealdb/mcp-config";
import { SurrealDBTrajectoryStorage } from "./surrealdb/trajectory";

function parseEnvInt(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === "") {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

class StorageAdapterFactory {
  private static instances: Map<string, unknown> = new Map();
  private static config: StorageConfig | null = null;

  /**
   * Initialize the factory with configuration
   */
  static initialize(config: StorageConfig): void {
    this.config = config;
    logger.info("[StorageAdapterFactory] Initialized with backend:", config.backend);
  }

  /**
   * Get LLM configuration storage adapter
   */
  static getLLMConfigStorage(): ILLMConfigStorage {
    const key = `llmConfig-${this.config?.backend || "unknown"}`;

    if (this.instances.has(key)) {
      return this.instances.get(key) as ILLMConfigStorage;
    }

    const adapter = this.createAdapter<ILLMConfigStorage>("ILLMConfigStorage");
    this.instances.set(key, adapter);
    return adapter;
  }

  /**
   * Get MCP configuration storage adapter
   */
  static getMCPConfigStorage(): IMCPConfigStorage {
    const key = `mcpConfig-${this.config?.backend || "unknown"}`;

    if (this.instances.has(key)) {
      return this.instances.get(key) as IMCPConfigStorage;
    }

    const adapter = this.createAdapter<IMCPConfigStorage>("IMCPConfigStorage");
    this.instances.set(key, adapter);
    return adapter;
  }

  /**
   * Get conversation history storage adapter
   */
  static getConversationStorage(): IConversationStorage {
    const key = `conversation-${this.config?.backend || "unknown"}`;

    if (this.instances.has(key)) {
      return this.instances.get(key) as IConversationStorage;
    }

    const adapter = this.createAdapter<IConversationStorage>("IConversationStorage");
    this.instances.set(key, adapter);
    return adapter;
  }

  /**
   * Get trajectory storage adapter
   */
  static getTrajectoryStorage(): ITrajectoryStorage {
    const key = `trajectory-${this.config?.backend || "unknown"}`;

    if (this.instances.has(key)) {
      return this.instances.get(key) as ITrajectoryStorage;
    }

    const adapter = this.createAdapter<ITrajectoryStorage>("ITrajectoryStorage");
    this.instances.set(key, adapter);
    return adapter;
  }

  /**
   * Get vector storage adapter
   */
  static getVectorStorage(): IVectorStorage {
    const key = `vector-${this.config?.backend || "unknown"}`;

    if (this.instances.has(key)) {
      return this.instances.get(key) as IVectorStorage;
    }

    const adapter = this.createVectorAdapter();
    this.instances.set(key, adapter);
    return adapter;
  }

  /**
   * Create vector storage adapter
   * Default: SurrealDB for new projects (no legacy data migration needed)
   * Legacy: LanceDB (via APEX_USE_LANCEDB_VECTOR=true for backward compatibility)
   */
  private static createVectorAdapter(): IVectorStorage {
    // Default to SurrealDB for new projects (no legacy data migration needed)
    const useLanceDB = process.env.APEX_USE_LANCEDB_VECTOR === "true";

    if (useLanceDB) {
      logger.info("[StorageAdapterFactory] Using legacy LanceDB vector storage");
      return new LanceDBVectorStorage();
    }

    // Default: SurrealDB vector storage
    return new SurrealDBVectorStorage();
  }

  /**
   * Create adapter based on configuration
   */
  private static createAdapter<T>(interfaceName: string): T {
    if (!this.config) {
      throw new Error("[StorageAdapterFactory] Factory not initialized. Call initialize() first.");
    }

    switch (this.config.backend) {
      case StorageBackend.SurrealDB:
        return this.createSurrealAdapter<T>(interfaceName);

      case StorageBackend.SQLite:
        return this.createSQLiteAdapter<T>(interfaceName);

      case StorageBackend.LanceDB:
        return this.createLanceAdapter<T>(interfaceName);

      default:
        throw new Error(`[StorageAdapterFactory] Unknown backend: ${this.config.backend}`);
    }
  }

  /**
   * Create SurrealDB adapter
   */
  private static createSurrealAdapter<T>(interfaceName: string): T {
    if (!this.config?.surrealdb) {
      throw new Error("[StorageAdapterFactory] SurrealDB config required for surrealdb backend");
    }

    switch (interfaceName) {
      case "ILLMConfigStorage": {
        return new SurrealDBLLMConfigStorage() as T;
      }
      case "IMCPConfigStorage": {
        return new SurrealDBMCPConfigStorage() as T;
      }
      case "IConversationStorage": {
        return new SurrealDBConversationStorage() as T;
      }
      case "ITrajectoryStorage": {
        return new SurrealDBTrajectoryStorage() as T;
      }
      default: {
        const { SurrealDBStorageAdapter } = require("./surrealdb/adapter");
        return new SurrealDBStorageAdapter(this.config.surrealdb) as T;
      }
    }
  }

  /**
   * Create SQLite adapter
   */
  private static createSQLiteAdapter<T>(interfaceName: string): T {
    switch (interfaceName) {
      case "ILLMConfigStorage": {
        return new SQLiteLLMConfigStorage() as T;
      }
      case "IConversationStorage": {
        return new SQLiteConversationStorage() as T;
      }
      case "ITrajectoryStorage": {
        return new SQLiteTrajectoryStorage() as T;
      }
      default: {
        const { SQLiteStorageAdapter } = require("./sqlite/adapter");
        return new SQLiteStorageAdapter() as T;
      }
    }
  }

  /**
   * Create LanceDB adapter
   */
  private static createLanceAdapter<T>(interfaceName: string): T {
    const { LanceDBStorageAdapter } = require("./lance/adapter");
    return new LanceDBStorageAdapter() as T;
  }

  /**
   * Reset all cached instances (for testing)
   */
  static reset(): void {
    this.instances.clear();
    this.config = null;
    logger.debug("[StorageAdapterFactory] All instances reset");
  }

  /**
   * Get current configuration
   */
  static getConfig(): StorageConfig | null {
    return this.config;
  }

  /**
   * Get current backend type
   */
  static getBackendType(): StorageBackend | null {
    return this.config?.backend || null;
  }

  /**
   * Check if SurrealDB is enabled
   */
  static isSurrealDBEnabled(): boolean {
    return (
      this.config?.backend === StorageBackend.SurrealDB && this.config?.features.surrealdbEnabled
    );
  }
}

/**
 * Parse feature flags from environment variables
 */
export function parseFeatureFlags(env: NodeJS.ProcessEnv): StorageFeatureFlags {
  return {
    surrealdbEnabled: env.SURREALDB_ENABLED === "true",
    dualWriteEnabled: false, // Dual-write removed - always false
    dualWriteReadStrategy: "primary",
    vectorMigrationEvaluation: false,
    sdkV2UpgradeEnabled: env.SURREALDB_SDK_V2 === "true",
  };
}

/**
 * Create storage configuration from environment
 */
export function createStorageConfig(env: NodeJS.ProcessEnv): StorageConfig {
  // Default to SurrealDB (dual-write removed)
  const backend = (env.STORAGE_BACKEND as StorageBackend) || StorageBackend.SurrealDB;
  const features = parseFeatureFlags(env);

  const config: StorageConfig = {
    backend,
    features,
  };

  if (backend === StorageBackend.SurrealDB) {
    config.surrealdb = {
      // Support both SURREALDB_URL and legacy SURREAL_URL
      url: env.SURREALDB_URL || env.SURREAL_URL || "ws://127.0.0.1:12470/rpc",
      namespace: env.SURREALDB_NAMESPACE || env.SURREAL_NS || "apexbridge",
      database: env.SURREALDB_DATABASE || env.SURREAL_DB || "production",
      username: env.SURREALDB_USER || env.SURREAL_USER || "root",
      password: env.SURREALDB_PASS || env.SURREAL_PASS || "root",
      timeout: parseEnvInt(env.SURREAL_CONNECTION_TIMEOUT, 5000),
      maxRetries: parseEnvInt(env.SURREAL_MAX_RETRIES, 3),
    };
  }

  if (backend === StorageBackend.SQLite) {
    config.sqlite = {
      path: env.SQLITE_PATH || "./.data/apexbridge.db",
      walMode: true,
      foreignKeys: true,
    };
  }

  if (backend === StorageBackend.LanceDB) {
    config.lance = {
      path: env.LANCEDB_PATH || "./.data/vectors",
    };
  }

  return config;
}

export { StorageAdapterFactory };
