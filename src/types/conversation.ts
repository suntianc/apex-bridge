import type { ChatOptions, Message } from './index';

export type ConversationSessionType = 'single' | 'group';

export type ConversationMemberType = 'hub' | 'companion' | 'worker';

export interface ConversationMemberBinding {
  memberId: string;
  personaId: string;
  type: ConversationMemberType;
  nodeId?: string;
  displayName?: string;
  metadata?: Record<string, unknown>;
}

export interface ApexMetaTarget {
  default?: {
    personaId: string;
    type: ConversationMemberType;
    nodeId?: string;
  };
  members?: ConversationMemberBinding[];
}

export interface ApexMetaApproval {
  requestId: string;
  approved: boolean;
  reason?: string;
  payload?: Record<string, unknown>;
}

export interface ApexMeta {
  conversationId?: string;
  sessionType?: ConversationSessionType;
  target?: ApexMetaTarget;
  mentions?: string[];
  waitForResult?: boolean;
  approval?: ApexMetaApproval;
  [key: string]: unknown;
}

export interface ConversationRequestPayload {
  messages: Message[];
  options: ChatOptions;
  apexMeta?: ApexMeta;
}

export interface ConversationHistoryRecord {
  id: string;
  role: Message['role'];
  content: string;
  timestamp: number;
  personaId?: string;
  memberId?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationPendingTask {
  taskId: string;
  personaId: string;
  nodeId?: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: number;
  completedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface ConversationContext {
  id: string;
  sessionType: ConversationSessionType;
  members: ConversationMemberBinding[];
  history: ConversationHistoryRecord[];
  pendingTasks: ConversationPendingTask[];
  personaState: Record<string, Record<string, unknown>>;
  toolApprovals: ToolApprovalRequest[];
  createdAt: number;
  updatedAt: number;
}

export type ToolOriginType = ConversationMemberType | 'custom' | 'unknown';

export type ToolAuthorizationStatus = 'allow' | 'deny' | 'requires_approval';

export interface ToolAuthorizationDecision {
  toolName: string;
  status: ToolAuthorizationStatus;
  reason?: string;
  originType: ToolOriginType;
  originNodeId?: string;
  originNodeName?: string;
  metadata?: Record<string, unknown>;
}

export type ToolApprovalStatus = 'pending' | 'approved' | 'denied' | 'consumed';

export interface ToolApprovalRequest {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  requesterPersonaId: string;
  requesterMemberId?: string;
  originType: ToolOriginType;
  originNodeId?: string;
  originNodeName?: string;
  status: ToolApprovalStatus;
  requestedAt: number;
  resolvedAt?: number;
  approverPersonaId?: string;
  approverMemberId?: string;
  decisionReason?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolApprovalResponse {
  requestId: string;
  approved: boolean;
  reason?: string;
  payload?: Record<string, unknown>;
}



