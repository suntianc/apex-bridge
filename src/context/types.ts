/**
 * Context Management Types
 * Phase 1: Context Management Infrastructure
 *
 * Defines types for layered storage architecture:
 * - Full History Layer: Complete conversation history (for frontend display)
 * - Effective Context Layer: Compressed/managed context (for API calls)
 */

import { Message } from '../types';

// Re-export Message for convenience
export type { Message };

// ==================== Context Configuration ====================

/**
 * Context management configuration
 */
export interface ContextConfig {
  /** Maximum tokens for effective context (default: 8000) */
  maxTokens: number;

  /** Maximum messages in effective context (default: 50) */
  maxMessages: number;

  /** Token threshold to trigger context management (default: 6000) */
  managementThreshold: number;

  /** Whether to enable automatic context management (default: true) */
  autoManage: boolean;

  /** Whether to enable automatic checkpoint creation (default: true) */
  autoCheckpoint: boolean;

  /** Context compression strategy */
  compressionStrategy: CompressionStrategy;

  /** LLM model for compression (default: claude-3-haiku) */
  compressionModel: string;

  /** Compression timeout in milliseconds (default: 30000) */
  compressionTimeout: number;

  /** Checkpoint interval in message count (default: 10) */
  checkpointInterval: number;

  /** Maximum checkpoints to keep (default: 5) */
  maxCheckpoints: number;

  /** Cache TTL in milliseconds (default: 60000) */
  cacheTtlMs: number;
}

/**
 * Compression strategy options
 */
export type CompressionStrategy =
  | 'truncate'   // Simply remove oldest messages
  | 'compact'    // Summarize old messages
  | 'prune'      // Selectively remove less important messages
  | 'hybrid';    // Combination of strategies

/**
 * Default context configuration
 */
export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  maxTokens: 8000,
  maxMessages: 50,
  managementThreshold: 6000,
  autoManage: true,
  autoCheckpoint: true,
  compressionStrategy: 'truncate',
  compressionModel: 'claude-3-haiku-20240307',
  compressionTimeout: 30000,
  checkpointInterval: 10,
  maxCheckpoints: 5,
  cacheTtlMs: 60000
};

// ==================== Context Actions ====================

/**
 * Context action types
 */
export type ContextActionType =
  | 'prune'      // Remove specific messages
  | 'compact'    // Summarize messages
  | 'truncate'   // Remove oldest messages
  | 'restore'    // Restore from checkpoint
  | 'checkpoint' // Create checkpoint
  | 'none';      // No action needed

/**
 * Context action with metadata
 */
export interface ContextAction {
  type: ContextActionType;

  /** Messages affected by the action */
  affectedMessageIds?: number[];

  /** Summary generated (for compact action) */
  summary?: string;

  /** Checkpoint ID (for restore/checkpoint actions) */
  checkpointId?: string;

  /** Token count before action */
  tokensBefore: number;

  /** Token count after action */
  tokensAfter: number;

  /** Timestamp of action */
  timestamp: number;

  /** Reason for the action */
  reason?: string;
}

// ==================== Context Session ====================

/**
 * Effective context session stored in database
 */
export interface ContextSession {
  /** Unique session ID (same as conversation_id) */
  id: string;

  /** Conversation ID reference */
  conversationId: string;

  /** Compressed/managed messages for API calls */
  effectiveMessages: Message[];

  /** Current token count of effective context */
  tokenCount: number;

  /** Number of messages in effective context */
  messageCount: number;

  /** Summary of compressed content (if any) */
  compressionSummary?: string;

  /** IDs of messages that were compressed/removed */
  compressedMessageIds: number[];

  /** Last context action applied */
  lastAction?: ContextAction;

  /** Session creation time */
  createdAt: number;

  /** Last update time */
  updatedAt: number;

  /** Session configuration overrides */
  configOverrides?: Partial<ContextConfig>;
}

// ==================== Checkpoint ====================

/**
 * Context checkpoint for rollback support
 */
export interface ContextCheckpoint {
  /** Unique checkpoint ID */
  id: string;

  /** Conversation ID reference */
  conversationId: string;

  /** Snapshot of effective messages at checkpoint time */
  messages: Message[];

  /** Token count at checkpoint */
  tokenCount: number;

  /** Message count at checkpoint */
  messageCount: number;

  /** Checkpoint creation reason */
  reason: string;

  /** Creation timestamp */
  createdAt: number;

  /** Expiration timestamp */
  expiresAt?: number;
}

// ==================== Message Marks ====================

/**
 * Message mark types
 */
export type MessageMarkType =
  | 'compressed'  // Message was compressed/summarized
  | 'truncated'   // Message was truncated
  | 'pruned'      // Message was pruned (selectively removed)
  | 'important'   // Message marked as important (preserved)
  | 'pinned';     // Message pinned (never removed)

/**
 * Message mark for tracking compression/truncation
 */
export interface MessageMark {
  /** Message ID from conversation_messages table */
  messageId: number;

  /** Conversation ID */
  conversationId: string;

  /** Mark type */
  markType: MessageMarkType;

  /** Context action that created this mark */
  actionId?: string;

  /** Mark creation time */
  createdAt: number;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ==================== Context Result ====================

/**
 * Result of context management operation
 */
export interface ContextResult {
  /** Whether context management was applied */
  managed: boolean;

  /** Action that was applied */
  action: ContextAction;

  /** Resulting effective messages */
  effectiveMessages: Message[];

  /** Token count after management */
  tokenCount: number;

  /** Message count after management */
  messageCount: number;

  /** Checkpoint created (if any) */
  checkpointCreated?: boolean;

  /** Error message (if any) */
  error?: string;
}

// ==================== Context Statistics ====================

/**
 * Context statistics for monitoring
 */
export interface ContextStatistics {
  /** Total conversations with context management */
  totalConversations: number;

  /** Total context actions performed */
  totalActions: number;

  /** Actions by type */
  actionsByType: Record<ContextActionType, number>;

  /** Average token count */
  averageTokenCount: number;

  /** Average message count */
  averageMessageCount: number;

  /** Total checkpoints */
  totalCheckpoints: number;

  /** Cache hit rate */
  cacheHitRate: number;
}

// ==================== Database Row Types ====================

/**
 * Database row type for context_sessions table
 */
export interface ContextSessionRow {
  id: string;
  conversation_id: string;
  effective_messages: string;  // JSON serialized
  token_count: number;
  message_count: number;
  compression_summary: string | null;
  compressed_message_ids: string;  // JSON serialized array
  last_action: string | null;  // JSON serialized
  config_overrides: string | null;  // JSON serialized
  created_at: number;
  updated_at: number;
}

/**
 * Database row type for context_checkpoints table
 */
export interface ContextCheckpointRow {
  id: string;
  conversation_id: string;
  messages: string;  // JSON serialized
  token_count: number;
  message_count: number;
  reason: string;
  created_at: number;
  expires_at: number | null;
}

/**
 * Database row type for message_marks table
 */
export interface MessageMarkRow {
  id: number;
  message_id: number;
  conversation_id: string;
  mark_type: string;
  action_id: string | null;
  created_at: number;
  metadata: string | null;  // JSON serialized
}

// ==================== API Types ====================

/**
 * Options for getting effective history
 */
export interface GetEffectiveHistoryOptions {
  /** Whether to include system messages */
  includeSystem?: boolean;

  /** Maximum messages to return */
  maxMessages?: number;

  /** Whether to apply token limit */
  applyTokenLimit?: boolean;

  /** Use cached result if available */
  useCache?: boolean;
}

/**
 * Options for context management
 */
export interface ManageContextOptions {
  /** Force management even if threshold not reached */
  force?: boolean;

  /** Override compression strategy */
  strategy?: CompressionStrategy;

  /** Create checkpoint before management */
  createCheckpoint?: boolean;

  /** Custom reason for the action */
  reason?: string;
}
