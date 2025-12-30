/**
 * ChatService 模块类型定义
 *
 * 提供聊天服务相关的类型定义，支持消息处理、会话管理、上下文管理等功能
 */

// 导入核心类型
import type { Message, ContentPart } from '../../types';

// 重新导出核心类型以保持一致性
export type { Message, ContentPart };

// ==================== 聊天选项扩展 ====================

export interface ChatOptions {
  provider?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  loopTimeout?: number;
  agentId?: string;
  userId?: string;
  conversationId?: string;
  sessionId?: string;
  requestId?: string;
  domain?: string;
  user_prompt?: string;
  [key: string]: unknown;

  selfThinking?: StrategyOptions;
  aceOrchestration?: AceOrchestrationOptions;
  websocketCallbacks?: WebSocketCallbacks;
}

export interface StrategyOptions {
  enabled?: boolean;
  maxIterations?: number;
  includeThoughtsInResponse?: boolean;
  systemPrompt?: string;
  additionalPrompts?: string[];
  tools?: ToolDefinition[];
  enableStreamThoughts?: boolean;
  enableToolActionParsing?: boolean;
  toolActionTimeout?: number;
}

export interface AceOrchestrationOptions {
  enabled?: boolean;
  maxTasks?: number;
  taskTimeout?: number;
  allowParallel?: boolean;
  maxConcurrent?: number;
}

export interface WebSocketCallbacks {
  send: (data: string) => void;
  onInterrupt?: () => void;
  onError?: (error: Error) => void;
}

// ==================== 聊天结果 ====================

export interface ChatResult {
  content: string;
  iterations: number;
  finishReason?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  rawThinkingProcess?: string[];
  thinking?: string;
  metadata?: ChatResultMetadata;
  blockedByEthics?: boolean;
  ethicsReview?: EthicsReviewResult;
  ethicsLayer?: string;
}

export interface ChatResultMetadata {
  sessionId?: string;
  responseTime?: number;
  strategyUsed?: string;
  playbookMatches?: number;
}

export type StreamingChatIterator = AsyncIterableIterator<string>;

// ==================== 伦理审查 ====================

export interface EthicsReviewResult {
  approved: boolean;
  reason?: string;
  suggestions?: string[];
  violations?: string[];
}

export interface EthicsStrategyReview {
  goal: string;
  plan: string;
  layer: string;
}

// ==================== 会话类型 ====================

export interface SessionInfo {
  id: string;
  userId?: string;
  agentId?: string;
  createdAt: Date;
  lastActivity: Date;
  messageCount: number;
  metadata?: Record<string, unknown>;
}

export interface SessionCreateOptions {
  userId?: string;
  agentId?: string;
  initialMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationMessage {
  role: string;
  content: string;
  timestamp?: Date;
}

// ==================== 上下文类型 ====================

export interface ContextInfo {
  sessionId: string;
  messageHistory: Message[];
  systemPrompt: string;
  variables: Record<string, unknown>;
  managed: boolean;
  action?: ContextAction;
  effectiveMessages?: Message[];
}

export interface ContextAction {
  type: string;
  tokensBefore: number;
  tokensAfter: number;
}

export interface ContextUpdate {
  addedMessages?: Message[];
  removedIndices?: number[];
  systemPromptUpdate?: string;
  variableUpdates?: Record<string, unknown>;
}

export interface ContextManageOptions {
  force?: boolean;
  createCheckpoint?: boolean;
  threshold?: number;
}

// ==================== Playbook类型 ====================

export interface PlaybookMatch {
  playbook: unknown;
  matchScore: number;
  matchType?: string;
}

export interface PlaybookInjectionContext {
  userQuery: string;
  sessionHistory: Message[];
  currentState?: string;
  userProfile?: unknown;
  constraints?: unknown;
  domain?: string;
}

export interface PlaybookInjectionResult {
  success: boolean;
  variables?: Record<string, string>;
  guidance?: string;
  playbookName?: string;
  error?: string;
}

// ==================== 服务状态 ====================

export interface ServiceStatus {
  aceEnabled: boolean;
  activeRequests: number;
  sessionCount: number;
  llmManagerReady: boolean;
  strategies: string[];
  aceOrchestratorReady: boolean;
}

export interface ComponentStatus {
  name: string;
  healthy: boolean;
  details?: Record<string, unknown>;
}

export interface TaskComplexityResult {
  score: number;
  matchedKeywords?: string[];
  details?: {
    hasComplexKeywords: boolean;
    lengthScore: number;
    stepKeywordsFound: boolean;
    listFormatDetected: boolean;
  };
}

// ==================== 策略准备结果 ====================

export interface StrategyPrepareResult {
  variables: Record<string, string>;
  messages?: Message[];
}

// ==================== 工具定义 ====================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
