/**
 * Storage Interface Abstraction Layer
 *
 * This module defines the storage interfaces that abstract away
 * the underlying database implementation (SQLite, LanceDB, SurrealDB).
 * All business services should depend on these interfaces, not concrete implementations.
 */

import type { Message } from "../../../types";
import type { Trajectory } from "../../../types/trajectory";
export type { Trajectory } from "../../../types/trajectory";
import type { MCPServerConfig } from "../../../types/mcp";
import type {
  LLMProviderV2,
  LLMModelV2,
  LLMModelType,
  CreateProviderInput,
  UpdateProviderInput,
  CreateModelInput,
  UpdateModelInput,
  ModelQueryParams,
  LLMModelFull,
} from "../../../types/llm-models";

/**
 * Base storage interface - all storage adapters must implement this
 */
export interface IStorageAdapter<T> {
  /** Get a single record by ID */
  get(id: string): Promise<T | null>;

  /** Get multiple records by IDs */
  getMany(ids: string[]): Promise<Map<string, T>>;

  /** Create or update a record */
  save(entity: T): Promise<string>;

  /** Delete a record by ID */
  delete(id: string): Promise<boolean>;

  /** Delete multiple records by IDs */
  deleteMany(ids: string[]): Promise<number>;
}

/**
 * Queryable storage interface - for storage with search capabilities
 */
export interface IQueryableStorage<T, Q = Record<string, unknown>> extends IStorageAdapter<T> {
  /** Find records matching query criteria */
  find(query: Q): Promise<T[]>;

  /** Count records matching query criteria */
  count(query: Q): Promise<number>;
}

/**
 * LLM Configuration Storage Interface
 */
export interface ILLMConfigStorage extends IQueryableStorage<LLMProviderV2, LLMConfigQuery> {
  /** Get provider by name */
  getProviderByName(provider: string): Promise<LLMProviderV2 | null>;

  /** Get all enabled provider names */
  getEnabledProviders(): Promise<string[]>;

  /** Get all models for a provider */
  getModelsByProvider(providerId: string): Promise<LLMModelV2[]>;

  /** Get model by key within a provider */
  getModelByKey(providerId: string, modelKey: string): Promise<LLMModelV2 | null>;

  /** Get default model by type */
  getDefaultModelByType(modelType: string): Promise<LLMModelV2 | null>;

  /** Create provider with models (transactional) */
  createProviderWithModels(provider: LLMProviderV2, models: LLMModelV2[]): Promise<string>;

  /** Get ACE evolution model (optional) */
  getAceEvolutionModel?(): Promise<LLMModelFull | null>;
}

export interface LLMConfigQuery {
  enabled?: boolean;
  provider?: string;
  modelType?: string;
  isDefault?: boolean;
  limit?: number;
  offset?: number;
  providerId?: string;
}

/**
 * MCP Configuration Storage Interface
 */
export interface IMCPConfigStorage extends IQueryableStorage<MCPServerRecord, MCPConfigQuery> {
  /** Get server by ID */
  getByServerId(serverId: string): Promise<MCPServerRecord | null>;

  /** Get all enabled servers */
  getEnabledServers(): Promise<MCPServerRecord[]>;

  /** Check if server exists */
  exists(serverId: string): Promise<boolean>;

  /** Upsert server configuration */
  upsertServer(config: MCPServerConfig): Promise<void>;
}

export interface MCPServerRecord {
  id: string;
  config: MCPServerConfig;
  enabled: number;
  created_at: number;
  updated_at: number;
}

export interface MCPConfigQuery {
  enabled?: boolean;
  serverId?: string;
}

/**
 * Conversation History Storage Interface
 */
export interface IConversationStorage extends IQueryableStorage<
  ConversationMessage,
  ConversationQuery
> {
  /** Get all messages for a conversation */
  getByConversationId(
    conversationId: string,
    limit?: number,
    offset?: number
  ): Promise<ConversationMessage[]>;

  /** Get message count for a conversation */
  getMessageCount(conversationId: string): Promise<number>;

  /** Get last message in a conversation */
  getLastMessage(conversationId: string): Promise<ConversationMessage | null>;

  /** Get first message in a conversation */
  getFirstMessage(conversationId: string): Promise<ConversationMessage | null>;

  /** Delete all messages in a conversation */
  deleteByConversationId(conversationId: string): Promise<number>;

  /** Delete messages before a timestamp */
  deleteBefore(timestamp: number): Promise<number>;

  /** Save messages (batch insert) */
  saveMessages(conversationId: string, messages: Message[]): Promise<void>;
}

export interface ConversationMessage {
  id: number;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: number;
  metadata?: string;
}

export interface ConversationQuery {
  conversationId?: string;
  role?: "user" | "assistant" | "system";
  limit?: number;
  offset?: number;
  startTime?: number;
  endTime?: number;
}

/**
 * Trajectory Storage Interface
 */
export interface ITrajectoryStorage extends IQueryableStorage<Trajectory, TrajectoryQuery> {
  /** Get trajectory by task ID */
  getByTaskId(taskId: string): Promise<Trajectory | null>;

  /** Get recent trajectories by outcome */
  getRecentByOutcome(outcome: "SUCCESS" | "FAILURE", limit?: number): Promise<Trajectory[]>;

  /** Get trajectory statistics */
  getStats(): Promise<TrajectoryStats>;

  /** Cleanup old trajectories */
  cleanup(olderThanDays: number): Promise<number>;
}

export interface TrajectoryQuery {
  taskId?: string;
  sessionId?: string;
  outcome?: "SUCCESS" | "FAILURE";
  evolutionStatus?: "PENDING" | "COMPLETED" | "FAILED";
  startTime?: number;
  endTime?: number;
  limit?: number;
}

export interface TrajectoryStats {
  total: number;
  success: number;
  failure: number;
  pending: number;
  completed: number;
  failed: number;
}

/**
 * Vector Storage Interface (for LanceDB replacement)
 */
export interface IVectorStorage {
  /** Get storage backend type identifier */
  getBackendType(): "lance" | "surrealdb";

  /** Upsert a single vector record */
  upsert(id: string, vector: number[], metadata: Record<string, unknown>): Promise<void>;

  /** Upsert multiple vector records */
  upsertBatch(records: VectorRecord[]): Promise<void>;

  /** Delete a vector record */
  delete(id: string): Promise<boolean>;

  /** Search for similar vectors */
  search(queryVector: number[], options?: VectorSearchOptions): Promise<VectorSearchResult[]>;

  /** Get the embedding dimension */
  getDimension(): number;

  /** Check if index is persisted */
  isPersisted(): boolean;

  /** Get total record count */
  count(): Promise<number>;
}

export interface VectorRecord {
  id: string;
  vector: number[];
  metadata: Record<string, unknown>;
}

export interface VectorSearchOptions {
  limit?: number;
  threshold?: number;
  filters?: Record<string, unknown>;
  distanceType?: "cosine" | "l2" | "dot";
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

/**
 * Feature flags for storage backend selection
 */
export interface StorageFeatureFlags {
  /** Enable SurrealDB backend */
  surrealdbEnabled: boolean;

  /** Enable dual-write mode (write to both backends) */
  dualWriteEnabled: boolean;

  /** Read strategy in dual-write mode */
  dualWriteReadStrategy: "primary" | "surreal" | "compare";

  /** Enable vector migration evaluation */
  vectorMigrationEvaluation: boolean;

  /** Enable SDK v2 upgrade path */
  sdkV2UpgradeEnabled: boolean;
}

/**
 * Storage backend type enumeration
 */
export enum StorageBackend {
  SQLite = "sqlite",
  SurrealDB = "surrealdb",
  LanceDB = "lance",
}

/**
 * Storage configuration interface
 */
export interface StorageConfig {
  /** Backend type to use */
  backend: StorageBackend;

  /** SurrealDB specific configuration */
  surrealdb?: SurrealDBConfig;

  /** SQLite specific configuration */
  sqlite?: SQLiteConfig;

  /** LanceDB specific configuration */
  lance?: LanceConfig;

  /** Feature flags */
  features: StorageFeatureFlags;
}

export interface SurrealDBConfig {
  url: string;
  namespace: string;
  database: string;
  username: string;
  password: string;
  timeout?: number;
  maxRetries?: number;
}

export interface SQLiteConfig {
  path: string;
  walMode?: boolean;
  foreignKeys?: boolean;
}

export interface LanceConfig {
  path: string;
}
