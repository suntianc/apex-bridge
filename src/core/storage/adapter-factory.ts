/**
 * Storage Adapter Factory
 *
 * Creates storage adapter instances based on configuration.
 * Supports SQLite, SurrealDB, and LanceDB backends with feature flag control.
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

interface AdapterInstances {
  llmConfig: ILLMConfigStorage | null;
  mcpConfig: IMCPConfigStorage | null;
  conversation: IConversationStorage | null;
  trajectory: ITrajectoryStorage | null;
  vector: IVectorStorage | null;
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

    if (config.features.dualWriteEnabled) {
      logger.warn("[StorageAdapterFactory] Dual-write mode enabled");
    }
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

    const adapter = this.createAdapter<IVectorStorage>("IVectorStorage");
    this.instances.set(key, adapter);
    return adapter;
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

    const { SurrealDBStorageAdapter } = require("./surrealdb/adapter");
    return new SurrealDBStorageAdapter(this.config.surrealdb) as T;
  }

  /**
   * Create SQLite adapter
   */
  private static createSQLiteAdapter<T>(interfaceName: string): T {
    const { SQLiteStorageAdapter } = require("./sqlite/adapter");
    return new SQLiteStorageAdapter() as T;
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

  /**
   * Check if dual-write is enabled
   */
  static isDualWriteEnabled(): boolean {
    return this.config?.features.dualWriteEnabled || false;
  }
}

/**
 * Parse feature flags from environment variables
 */
export function parseFeatureFlags(env: NodeJS.ProcessEnv): StorageFeatureFlags {
  return {
    surrealdbEnabled: env.SURREALDB_ENABLED === "true",
    dualWriteEnabled: env.SURREALDB_DUAL_WRITE === "true",
    dualWriteReadStrategy:
      (env.SURREALDB_DUAL_READ_STRATEGY as StorageFeatureFlags["dualWriteReadStrategy"]) ||
      "primary",
    vectorMigrationEvaluation: env.SURREALDB_VECTOR_EVAL === "true",
    sdkV2UpgradeEnabled: env.SURREALDB_SDK_V2 === "true",
  };
}

/**
 * Create storage configuration from environment
 */
export function createStorageConfig(env: NodeJS.ProcessEnv): StorageConfig {
  const backend = (env.STORAGE_BACKEND as StorageBackend) || StorageBackend.SQLite;
  const features = parseFeatureFlags(env);

  const config: StorageConfig = {
    backend,
    features,
  };

  if (backend === StorageBackend.SurrealDB) {
    config.surrealdb = {
      url: env.SURREAL_URL || "ws://127.0.0.1:12470",
      namespace: env.SURREAL_NS || "apexbridge",
      database: env.SURREAL_DB || "production",
      username: env.SURREAL_USER || "root",
      password: env.SURREAL_PASS || "root",
      timeout: parseInt(env.SURREAL_CONNECTION_TIMEOUT || "5000", 10),
      maxRetries: parseInt(env.SURREAL_MAX_RETRIES || "3", 10),
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
