import { randomUUID } from 'crypto';
import {
  ConversationContext,
  ConversationHistoryRecord,
  ConversationMemberBinding,
  ConversationPendingTask,
  ConversationSessionType,
  ToolApprovalRequest,
  ToolApprovalResponse,
  ToolApprovalStatus
} from '../../types';

export interface ConversationContextStoreOptions {
  ttlMs?: number;
  cleanupIntervalMs?: number;
}

function cloneMembers(members: ConversationMemberBinding[]): ConversationMemberBinding[] {
  return members.map((member) => ({ ...member }));
}

export class ConversationContextStore {
  private readonly contexts = new Map<string, ConversationContext>();
  private readonly ttlMs?: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options: ConversationContextStoreOptions = {}) {
    this.ttlMs = options.ttlMs;
    const cleanupInterval = options.cleanupIntervalMs ?? (this.ttlMs ? Math.min(this.ttlMs / 2, 60_000) : undefined);
    if (cleanupInterval && this.ttlMs) {
      this.cleanupTimer = setInterval(() => this.cleanupExpired(), cleanupInterval);
      this.cleanupTimer.unref?.();
    }
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  listIds(): string[] {
    return Array.from(this.contexts.keys());
  }

  get(conversationId: string): ConversationContext | null {
    return this.contexts.get(conversationId) ?? null;
  }

  ensure(
    conversationId?: string,
    seed: Partial<Omit<ConversationContext, 'id' | 'createdAt' | 'updatedAt'>> = {}
  ): ConversationContext {
    const id = conversationId ?? randomUUID();
    const existing = this.contexts.get(id);
    if (existing) {
      let updated = false;
      if (seed.sessionType && seed.sessionType !== existing.sessionType) {
        existing.sessionType = seed.sessionType;
        updated = true;
      }
      if (seed.members && seed.members.length > 0) {
        existing.members = cloneMembers(seed.members);
        updated = true;
      }
      if (seed.personaState) {
        existing.personaState = {
          ...existing.personaState,
          ...seed.personaState
        };
        updated = true;
      }
      if (!existing.toolApprovals) {
        existing.toolApprovals = [];
        updated = true;
      }
      if (updated) {
        existing.updatedAt = Date.now();
      } else {
        this.touch(id);
      }
      return existing;
    }

    const now = Date.now();
    const context: ConversationContext = {
      id,
      sessionType: seed.sessionType ?? 'single',
      members: seed.members ? cloneMembers(seed.members) : [],
      history: seed.history ? [...seed.history] : [],
      pendingTasks: seed.pendingTasks ? [...seed.pendingTasks] : [],
      personaState: seed.personaState ? { ...seed.personaState } : {},
      toolApprovals: seed.toolApprovals ? [...seed.toolApprovals] : [],
      createdAt: now,
      updatedAt: now
    };
    this.contexts.set(id, context);
    return context;
  }

  touch(conversationId: string): void {
    const context = this.contexts.get(conversationId);
    if (context) {
      context.updatedAt = Date.now();
    }
  }

  setMembers(conversationId: string, members: ConversationMemberBinding[]): ConversationContext {
    const context = this.ensure(conversationId);
    context.members = cloneMembers(members);
    context.updatedAt = Date.now();
    return context;
  }

  appendHistory(conversationId: string, record: ConversationHistoryRecord): ConversationContext {
    const context = this.ensure(conversationId);
    context.history = [...context.history, { ...record }];
    context.updatedAt = Date.now();
    return context;
  }

  addPendingTask(conversationId: string, task: ConversationPendingTask): ConversationContext {
    const context = this.ensure(conversationId);
    context.pendingTasks = [...context.pendingTasks, { ...task }];
    context.updatedAt = Date.now();
    return context;
  }

  addToolApprovalRequest(conversationId: string, request: ToolApprovalRequest): ConversationContext {
    const context = this.ensure(conversationId);
    const existingIndex = context.toolApprovals.findIndex((item) => item.id === request.id);
    if (existingIndex >= 0) {
      context.toolApprovals[existingIndex] = { ...context.toolApprovals[existingIndex], ...request };
    } else {
      context.toolApprovals = [...context.toolApprovals, { ...request }];
    }
    context.updatedAt = Date.now();
    return context;
  }

  updateToolApprovalStatus(
    conversationId: string,
    requestId: string,
    updates: Partial<Omit<ToolApprovalRequest, 'id' | 'toolName' | 'requesterPersonaId' | 'originType'>> & {
      status?: ToolApprovalStatus;
    }
  ): ToolApprovalRequest | null {
    const context = this.contexts.get(conversationId);
    if (!context) {
      return null;
    }
    const index = context.toolApprovals.findIndex((item) => item.id === requestId);
    if (index < 0) {
      return null;
    }
    const existing = context.toolApprovals[index];
    const updated: ToolApprovalRequest = {
      ...existing,
      ...updates,
      status: updates.status ?? existing.status,
      resolvedAt: updates.resolvedAt ?? (updates.status && updates.status !== 'pending' ? Date.now() : existing.resolvedAt)
    };
    context.toolApprovals[index] = updated;
    context.updatedAt = Date.now();
    return updated;
  }

  completeToolApprovalRequest(
    conversationId: string,
    response: ToolApprovalResponse,
    approverPersonaId?: string,
    approverMemberId?: string
  ): ToolApprovalRequest | null {
    return this.updateToolApprovalStatus(conversationId, response.requestId, {
      status: response.approved ? 'approved' : 'denied',
      decisionReason: response.reason,
      metadata: response.payload
        ? { ...(this.contexts.get(conversationId)?.toolApprovals.find((item) => item.id === response.requestId)?.metadata ?? {}), ...response.payload }
        : undefined,
      approverPersonaId,
      approverMemberId
    });
  }

  consumeToolApproval(conversationId: string, requestId: string): ToolApprovalRequest | null {
    return this.updateToolApprovalStatus(conversationId, requestId, {
      status: 'consumed'
    });
  }

  resolvePendingTask(
    conversationId: string,
    taskId: string,
    updates: Partial<Omit<ConversationPendingTask, 'taskId'>> = {}
  ): ConversationContext | null {
    const context = this.contexts.get(conversationId);
    if (!context) {
      return null;
    }
    const tasks = context.pendingTasks.map((task) => {
      if (task.taskId !== taskId) {
        return task;
      }
      return {
        ...task,
        ...updates,
        status: updates.status ?? 'completed',
        completedAt: updates.completedAt ?? Date.now()
      };
    });
    context.pendingTasks = tasks;
    context.updatedAt = Date.now();
    return context;
  }

  setPersonaState(conversationId: string, personaId: string, state: Record<string, unknown>): ConversationContext {
    const context = this.ensure(conversationId);
    context.personaState = {
      ...context.personaState,
      [personaId]: {
        ...(context.personaState[personaId] ?? {}),
        ...state
      }
    };
    context.updatedAt = Date.now();
    return context;
  }

  remove(conversationId: string): void {
    this.contexts.delete(conversationId);
  }

  clear(): void {
    this.contexts.clear();
  }

  private cleanupExpired(): void {
    if (!this.ttlMs) {
      return;
    }
    const now = Date.now();
    for (const [id, context] of this.contexts.entries()) {
      if (now - context.updatedAt > this.ttlMs) {
        this.contexts.delete(id);
      }
    }
  }
}

export const conversationContextStore = new ConversationContextStore();

