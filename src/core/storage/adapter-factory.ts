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
import { DualWriteMCPConfigAdapter, DualWriteTrajectoryAdapter, parseEnvBool } from "./dual-write";
import {
  ConsistentDualWriteConversationAdapter,
  ConsistentDualWriteLLMConfigAdapter,
  ReadWriteSplitConversationAdapter,
  ReadWriteSplitLLMConfigAdapter,
} from "./consistent-dual-write";
import { LanceDBVectorStorage } from "./lance/vector-storage";
import { SurrealDBVectorStorage } from "./surrealdb/vector-storage";
import { VectorDualWriteAdapter, VectorDualWriteConfig } from "./vector-dual-write";
import { VectorReadWriteSplitAdapter, VectorReadWriteSplitConfig } from "./vector-read-write-split";

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

    let adapter: ILLMConfigStorage;

    if (parseEnvBool(process.env.APEX_SURREALDB_LLM_CONFIG_RW_SPLIT, false)) {
      const primary = new SQLiteLLMConfigStorage();
      const secondary = new SurrealDBLLMConfigStorage();
      adapter = new ReadWriteSplitLLMConfigAdapter(primary, secondary, {
        domain: "LLMConfig",
        readFromSecondary: false,
        fallbackToPrimary: true,
      });
      logger.info("[StorageAdapterFactory] LLMConfig read-write split mode enabled");
    } else if (parseEnvBool(process.env.APEX_SURREALDB_LLM_CONFIG_DUAL_WRITE, false)) {
      const primary = new SQLiteLLMConfigStorage();
      const secondary = new SurrealDBLLMConfigStorage();
      adapter = new ConsistentDualWriteLLMConfigAdapter(primary, secondary, {
        domain: "LLMConfig",
        verifyOnWrite: true,
        repairOnFailure: true,
      });
      logger.info("[StorageAdapterFactory] LLMConfig consistent dual-write mode enabled");
    } else {
      adapter = this.createAdapter<ILLMConfigStorage>("ILLMConfigStorage");
    }

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

    let adapter: IMCPConfigStorage;

    if (parseEnvBool(process.env.APEX_SURREALDB_MCP_DUAL_WRITE, false)) {
      const primary = this.createAdapter<IMCPConfigStorage>("IMCPConfigStorage");
      const secondary = new SurrealDBMCPConfigStorage();
      adapter = new DualWriteMCPConfigAdapter(primary, secondary);
      logger.info("[StorageAdapterFactory] MCPConfig dual-write mode enabled");
    } else {
      adapter = this.createAdapter<IMCPConfigStorage>("IMCPConfigStorage");
    }

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

    let adapter: IConversationStorage;

    if (parseEnvBool(process.env.APEX_SURREALDB_CONVERSATION_RW_SPLIT, false)) {
      const primary = new SQLiteConversationStorage();
      const secondary = new SurrealDBConversationStorage();
      adapter = new ReadWriteSplitConversationAdapter(primary, secondary, {
        domain: "Conversation",
        readFromSecondary: false,
        fallbackToPrimary: true,
      });
      logger.info("[StorageAdapterFactory] Conversation read-write split mode enabled");
    } else if (parseEnvBool(process.env.APEX_SURREALDB_CONVERSATION_DUAL_WRITE, false)) {
      const primary = new SQLiteConversationStorage();
      const secondary = new SurrealDBConversationStorage();
      adapter = new ConsistentDualWriteConversationAdapter(primary, secondary, {
        domain: "Conversation",
        verifyOnWrite: true,
        repairOnFailure: true,
      });
      logger.info("[StorageAdapterFactory] Conversation consistent dual-write mode enabled");
    } else {
      adapter = this.createAdapter<IConversationStorage>("IConversationStorage");
    }

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

    let adapter: ITrajectoryStorage;

    if (parseEnvBool(process.env.APEX_SURREALDB_TRAJECTORY_DUAL_WRITE, false)) {
      const primary = new SQLiteTrajectoryStorage();
      const secondary = new SurrealDBTrajectoryStorage();
      adapter = new DualWriteTrajectoryAdapter(primary, secondary);
      logger.info("[StorageAdapterFactory] Trajectory dual-write mode enabled");
    } else {
      adapter = this.createAdapter<ITrajectoryStorage>("ITrajectoryStorage");
    }

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
   * Create vector storage adapter with migration support
   */
  private static createVectorAdapter(): IVectorStorage {
    const vectorDualWrite = parseEnvBool(process.env.APEX_SURREALDB_VECTOR_DUAL_WRITE, false);
    const vectorReadWriteSplit = parseEnvBool(process.env.APEX_SURREALDB_VECTOR_RW_SPLIT, false);

    if (!vectorDualWrite && !vectorReadWriteSplit) {
      return new LanceDBVectorStorage();
    }

    const lanceDB = new LanceDBVectorStorage();
    const surrealdb = new SurrealDBVectorStorage();

    if (vectorReadWriteSplit) {
      logger.info("[StorageAdapterFactory] Vector read-write split mode enabled");
      const config: Partial<VectorReadWriteSplitConfig> = {
        domain: "Vector",
        readFromSecondary: false,
        fallbackToPrimary: true,
        secondaryWarmup: false,
      };
      return new VectorReadWriteSplitAdapter(lanceDB, surrealdb, config);
    }

    logger.info("[StorageAdapterFactory] Vector dual-write mode enabled");
    const batchSize = parseEnvInt(process.env.APEX_SURREALDB_VECTOR_BATCH_SIZE, 100);

    const config: Partial<VectorDualWriteConfig> = {
      domain: "Vector",
      batchSize,
      asyncWrite: true,
    };
    return new VectorDualWriteAdapter(lanceDB, surrealdb, config);
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
