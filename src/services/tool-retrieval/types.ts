/**
 * ToolRetrieval Service Types
 *
 * Type definitions for the tool retrieval service module.
 */

// ==================== Tool Retrieval Result ====================

/**
 * Tool retrieval result
 */
export interface ToolRetrievalResult {
  /** Tool/Skill ID */
  id: string;
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Similarity score (0-1) */
  score: number;
  /** Tool type: 'mcp' | 'builtin' | 'skill' */
  toolType: 'mcp' | 'builtin' | 'skill';
  /** Metadata */
  metadata?: Record<string, unknown>;
  /** Type tags */
  tags?: string[];
}

/**
 * Retrieval result sorting options
 */
export interface RetrievalSortingOptions {
  /** Sort field */
  field: 'score' | 'relevance' | 'popularity';
  /** Sort order */
  order: 'asc' | 'desc';
}

// ==================== Skill Data ====================

/**
 * Skill data structure
 */
export interface SkillData {
  /** Skill ID */
  id: string;
  /** Skill name */
  name: string;
  /** Skill description */
  description: string;
  /** Execution command */
  command?: string;
  /** Parameters pattern */
  parameters?: Record<string, unknown>;
  /** Type */
  type?: string;
  /** Tags */
  tags?: string[];
  /** File path */
  filePath?: string;
  /** Last modified time */
  lastModified?: Date;
  /** Metadata */
  metadata?: Record<string, unknown>;
  /** Version */
  version?: string;
}

// ==================== MCP Tool ====================

/**
 * MCP tool definition
 */
export interface MCPTool {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Input schema */
  inputSchema: MCPInputSchema;
  /** Tool type */
  type?: string;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * MCP input schema
 */
export interface MCPInputSchema {
  /** JSON Schema */
  schema: Record<string, unknown>;
  /** Properties */
  properties?: Record<string, unknown>;
}

/**
 * MCP tool retrieval result
 */
export interface MCPToolRetrievalResult {
  /** Tool name */
  name: string;
  /** Similarity score */
  score: number;
  /** Description */
  description: string;
  /** Parameters pattern */
  parameters?: Record<string, unknown>;
}

// ==================== Embedding Vector ====================

/**
 * Embedding vector configuration
 */
export interface EmbeddingConfig {
  /** Embedding model provider */
  provider: 'openai' | 'deepseek' | 'zhipu' | 'ollama';
  /** Model name */
  model: string;
  /** Embedding dimensions */
  dimensions: number;
  /** Max tokens */
  maxTokens?: number;
}

/**
 * Embedding vector
 */
export interface EmbeddingVector {
  /** Vector values */
  values: number[];
  /** Dimensions */
  dimensions: number;
  /** Model info */
  model: string;
}

// ==================== Database Configuration ====================

/**
 * LanceDB configuration
 */
export interface LanceDBConfig {
  /** Database path */
  databasePath: string;
  /** Table name */
  tableName: string;
  /** Vector dimensions */
  vectorDimensions: number;
}

/**
 * Database connection status
 */
export interface ConnectionStatus {
  /** Whether connected */
  connected: boolean;
  /** Last connection time */
  lastConnected?: Date;
  /** Connection error */
  error?: string;
}

// ==================== Index Configuration ====================

/**
 * Index configuration
 */
export interface IndexConfig {
  /** Index name */
  name: string;
  /** Batch size */
  batchSize: number;
  /** Reindex threshold (days) */
  reindexThresholdDays: number;
  /** Enable incremental indexing */
  enableIncrementalIndexing: boolean;
}

/**
 * Index status
 */
export interface IndexStatus {
  /** Number of indexed items */
  indexedCount: number;
  /** Last index time */
  lastIndexed?: Date;
  /** Currently indexing count */
  indexingCount: number;
  /** Pending count */
  pendingCount: number;
}

// ==================== Retrieval Configuration ====================

/**
 * Retrieval configuration
 */
export interface RetrievalConfig {
  /** Max results */
  maxResults: number;
  /** Min score threshold */
  minScore: number;
  /** Similarity threshold */
  similarityThreshold: number;
  /** Enable filtering */
  enableFiltering: boolean;
  /** Filter conditions */
  filters?: RetrievalFilter[];
}

/**
 * Retrieval filter condition
 */
export interface RetrievalFilter {
  /** Field name */
  field: string;
  /** Operator */
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'in';
  /** Value */
  value: unknown;
}

// ==================== Service Status ====================

/**
 * Service status
 */
export interface ServiceStatus {
  /** Database connection status */
  databaseStatus: ConnectionStatus;
  /** Index status */
  indexStatus: IndexStatus;
  /** Ready flag */
  ready: boolean;
  /** Health status */
  healthy: boolean;
}

// ==================== Tool Retrieval Config ====================

/**
 * Tool retrieval service configuration (matches existing interface)
 */
export interface ToolRetrievalConfig {
  /** Vector database path */
  vectorDbPath: string;
  /** Embedding model */
  model: string;
  /** Cache size */
  cacheSize: number;
  /** Vector dimensions */
  dimensions: number;
  /** Similarity threshold */
  similarityThreshold: number;
  /** Max results */
  maxResults: number;
}

// ==================== Tool System Types ====================

/**
 * Tool type enumeration
 */
export enum ToolType {
  SKILL = 'skill',
  MCP = 'mcp',
  BUILTIN = 'builtin'
}

/**
 * Tool error codes
 */
export enum ToolErrorCode {
  VECTOR_DB_ERROR = 'VECTOR_DB_ERROR',
  EMBEDDING_MODEL_ERROR = 'EMBEDDING_MODEL_ERROR',
  SKILL_NOT_FOUND = 'SKILL_NOT_FOUND',
  SKILL_EXECUTION_ERROR = 'SKILL_EXECUTION_ERROR',
  INVALID_CONFIG = 'INVALID_CONFIG'
}

/**
 * Tool error
 */
export class ToolError extends Error {
  code: ToolErrorCode;

  constructor(message: string, code: ToolErrorCode) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
  }
}

/**
 * Skill tool interface (matches existing ToolSystem interface)
 */
export interface SkillTool {
  name: string;
  description: string;
  type?: ToolType;
  tags?: string[];
  version?: string;
  path?: string;
  parameters?: Record<string, unknown>;
  enabled?: boolean;
  level?: number;
  metadata?: Record<string, unknown>;
}

// ==================== Internal Types ====================

/**
 * Internal tools table interface (for LanceDB schema)
 */
export interface ToolsTable {
  id: string;
  name: string;
  description: string;
  tags: string[];
  path?: string;
  version?: string;
  source?: string;
  toolType: 'skill' | 'mcp' | 'builtin';
  metadata: string;
  vector: number[];
  indexedAt: Date;
}

/**
 * Vectorized file data
 */
export interface VectorizedFileData {
  indexedAt: number;
  skillSize: number;
  skillHash: string;
}

/**
 * Embedding input (for internal use)
 */
export interface EmbeddingInput {
  name: string;
  description: string;
  tags: string[];
}

/**
 * Remote embedding input
 */
export interface RemoteEmbeddingInput {
  name: string;
  description: string;
  tags: string[];
}
