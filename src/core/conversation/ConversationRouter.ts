import { randomUUID } from 'crypto';
import {
  ApexMeta,
  ConversationContext,
  ConversationHistoryRecord,
  ConversationMemberBinding,
  ConversationMemberType,
  ConversationRequestPayload,
  ConversationSessionType,
  ToolApprovalRequest,
  ToolApprovalResponse
} from '../../types';
import { ConversationContextStore, conversationContextStore } from './ConversationContextStore';
import { NodeService } from '../../services/NodeService';
import { logger } from '../../utils/logger';
import { EventBus } from '../EventBus';

export class ConversationRoutingError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ConversationRoutingError';
    this.statusCode = statusCode;
  }
}

export interface ConversationRouterOptions {
  defaultHubPersonaId: string;
  defaultHubMemberId?: string;
  contextStore?: ConversationContextStore;
  nodeService?: NodeService;
  eventBus?: EventBus;
}

export interface RouteResolution {
  conversationId: string;
  sessionType: ConversationSessionType;
  apexMeta?: ApexMeta;
  primaryTarget: ConversationMemberBinding;
  mandatoryTargets: ConversationMemberBinding[];
  broadcastTargets: ConversationMemberBinding[];
  mentions: string[];
  waitForResult: boolean;
  context: ConversationContext;
  approvalResponse?: ToolApprovalResponse & {
    request?: ToolApprovalRequest | null;
  };
}

const DEFAULT_HUB_MEMBER_ID = 'hub-main';

export class ConversationRouter {
  private readonly contextStore: ConversationContextStore;
  private readonly defaultHubPersonaId: string;
  private readonly defaultHubMemberId: string;
  private readonly nodeService: NodeService;
  private readonly eventBus: EventBus;

  constructor(options: ConversationRouterOptions) {
    this.defaultHubPersonaId = options.defaultHubPersonaId;
    this.defaultHubMemberId = options.defaultHubMemberId ?? DEFAULT_HUB_MEMBER_ID;
    this.contextStore = options.contextStore ?? conversationContextStore;
    this.nodeService = options.nodeService ?? NodeService.getInstance();
    this.eventBus = options.eventBus ?? EventBus.getInstance();
  }

  resolveRoute(payload: ConversationRequestPayload): RouteResolution {
    const apexMeta = payload.apexMeta ?? {};
    const conversationId = this.resolveConversationId(apexMeta.conversationId);
    const sessionType = apexMeta.sessionType ?? this.deriveSessionType(apexMeta);

    const existingContext = this.contextStore.get(conversationId);
    const shouldSeedMembers =
      !existingContext ||
      (apexMeta.target?.members && apexMeta.target.members.length > 0) ||
      Boolean(apexMeta.target?.default);
    const contextSeedMembers = shouldSeedMembers ? this.extractMembersFromMeta(apexMeta) : undefined;

    const context = this.contextStore.ensure(conversationId, {
      sessionType,
      members: contextSeedMembers
    });

    let approvalResponse: RouteResolution['approvalResponse'] = undefined;
    if (apexMeta.approval) {
      const resolved = this.contextStore.completeToolApprovalRequest(
        conversationId,
        apexMeta.approval,
        apexMeta.target?.default?.personaId,
        this.buildMemberId(apexMeta.target?.default ?? { personaId: '', type: 'hub' })
      );
      approvalResponse = {
        ...apexMeta.approval,
        request: resolved ?? null
      };
    }

    const mentionRefs = this.collectMentionRefs(payload);
    const mentionMembers = this.resolveMentionMembers(mentionRefs, apexMeta, context);

    const primaryTarget =
      mentionMembers[0] ?? this.resolvePrimaryTarget(apexMeta, context);

    const mandatoryTargets = mentionMembers.slice(primaryTarget ? 1 : 0);
    const broadcastTargets = this.resolveBroadcastTargets(primaryTarget, mandatoryTargets, apexMeta, context);

    const mentions = mentionMembers.map((member) => member.memberId);
    const waitForResult = this.resolveWaitForResult(apexMeta, primaryTarget.type);

    this.recordUserMessage(context.id, payload, mentions, context);

    return {
      conversationId: context.id,
      sessionType,
      apexMeta,
      primaryTarget,
      mandatoryTargets,
      broadcastTargets,
      mentions,
      waitForResult,
      context,
      approvalResponse
    };
  }

  recordAssistantMessage(conversationId: string, record: Omit<ConversationHistoryRecord, 'id' | 'timestamp'>): void {
    const finalRecord: ConversationHistoryRecord = {
      id: randomUUID(),
      timestamp: Date.now(),
      ...record
    };
    this.contextStore.appendHistory(conversationId, finalRecord);
    this.eventBus.publish('conversation:assistant_message', {
      conversationId,
      message: finalRecord
    });
  }

  markTaskStatus(
    conversationId: string,
    taskId: string,
    status: ConversationHistoryRecord['role'],
    metadata?: Record<string, unknown>
  ): void {
    this.contextStore.resolvePendingTask(conversationId, taskId, {
      status: status === 'assistant' ? 'completed' : status === 'tool' ? 'completed' : 'failed',
      metadata
    });
  }

  private resolveConversationId(conversationId?: string): string {
    if (conversationId) {
      return conversationId;
    }
    return randomUUID();
  }

  private deriveSessionType(apexMeta: ApexMeta): ConversationSessionType {
    if (apexMeta.sessionType === 'group') {
      return 'group';
    }
    if (apexMeta.target?.members && apexMeta.target.members.length > 1) {
      return 'group';
    }
    return 'single';
  }

  private extractMembersFromMeta(apexMeta: ApexMeta): ConversationMemberBinding[] {
    if (apexMeta.target?.members && apexMeta.target.members.length > 0) {
      return apexMeta.target.members.map((member) => this.ensureMemberBinding({ ...member }));
    }
    if (apexMeta.target?.default) {
      return [
        this.ensureMemberBinding({
          memberId: this.buildMemberId(apexMeta.target.default),
          personaId: apexMeta.target.default.personaId,
          type: apexMeta.target.default.type,
          nodeId: apexMeta.target.default.nodeId
        })
      ];
    }

    return [
      this.ensureMemberBinding({
        memberId: this.defaultHubMemberId,
        personaId: this.defaultHubPersonaId,
        type: 'hub'
      })
    ];
  }

  private resolvePrimaryTarget(apexMeta: ApexMeta, context: ConversationContext): ConversationMemberBinding {
    if (apexMeta.target?.default) {
      const defaultId = this.buildMemberId(apexMeta.target.default);
      const existing = context.members.find((member) => member.memberId === defaultId);
      if (existing) {
        const ensured = this.ensureMemberBinding(existing);
        this.replaceMember(context, ensured);
        return ensured;
      }
      const newMember: ConversationMemberBinding = this.ensureMemberBinding({
        memberId: defaultId,
        personaId: apexMeta.target.default.personaId,
        type: apexMeta.target.default.type,
        nodeId: apexMeta.target.default.nodeId
      });
      context.members = [...context.members, newMember];
      return newMember;
    }

    if (context.sessionType === 'single') {
      if (context.members.length > 0) {
        const ensured = this.ensureMemberBinding(context.members[0]);
        this.replaceMember(context, ensured);
        return ensured;
      }
      const member: ConversationMemberBinding = this.ensureMemberBinding({
        memberId: this.defaultHubMemberId,
        personaId: this.defaultHubPersonaId,
        type: 'hub'
      });
      context.members = [member];
      return member;
    }

    if (context.members.length > 0) {
      const ensured = this.ensureMemberBinding(context.members[0]);
      this.replaceMember(context, ensured);
      return ensured;
    }

    const fallbackMember: ConversationMemberBinding = this.ensureMemberBinding({
      memberId: this.defaultHubMemberId,
      personaId: this.defaultHubPersonaId,
      type: 'hub'
    });
    context.members = [fallbackMember];
    return fallbackMember;
  }

  private resolveBroadcastTargets(
    primary: ConversationMemberBinding,
    mandatoryTargets: ConversationMemberBinding[],
    apexMeta: ApexMeta,
    context: ConversationContext
  ): ConversationMemberBinding[] {
    const excluded = new Set<string>([primary.memberId]);
    for (const target of mandatoryTargets) {
      excluded.add(target.memberId);
    }

    const broadcast: ConversationMemberBinding[] = [];

    for (const member of context.members) {
      if (excluded.has(member.memberId)) {
        continue;
      }
      const ensured = this.ensureMemberBinding(member);
      broadcast.push(ensured);
      this.replaceMember(context, ensured);
    }

    if (apexMeta.target?.members) {
      for (const member of apexMeta.target.members) {
        if (excluded.has(member.memberId)) {
          continue;
        }
        const ensured = this.ensureMemberBinding(member);
        if (!broadcast.find((item) => item.memberId === ensured.memberId)) {
          broadcast.push(ensured);
          this.replaceMember(context, ensured);
        }
      }
    }

    return broadcast;
  }

  private resolveWaitForResult(apexMeta: ApexMeta, memberType: ConversationMemberType): boolean {
    if (typeof apexMeta.waitForResult === 'boolean') {
      return apexMeta.waitForResult;
    }
    // 默认：Hub 请求等待，节点请求默认不等待
    return memberType === 'hub';
  }

  private recordUserMessage(
    conversationId: string,
    payload: ConversationRequestPayload,
    mentions: string[],
    context: ConversationContext
  ): void {
    if (!payload.messages || payload.messages.length === 0) {
      return;
    }

    const lastMessage = [...payload.messages].reverse().find((msg) => msg.role === 'user');
    if (!lastMessage) {
      return;
    }

    const historyRecord: ConversationHistoryRecord = {
      id: randomUUID(),
      role: 'user',
      content: lastMessage.content,
      timestamp: Date.now(),
      metadata: {
        name: lastMessage.name,
        mentions
      }
    };
    this.contextStore.appendHistory(conversationId, historyRecord);
    this.eventBus.publish('conversation:user_message', {
      conversationId,
      message: historyRecord,
      mentions,
      sessionType: context.sessionType,
      members: context.members,
      personaState: context.personaState
    });
  }

  private buildMemberId(target: { personaId: string; type: ConversationMemberType; nodeId?: string }): string {
    if (target.type === 'hub') {
      return `${target.type}:${target.nodeId ?? 'hub'}:${target.personaId}`;
    }
    if (target.nodeId) {
      return `${target.type}:${target.nodeId}:${target.personaId}`;
    }
    return `${target.type}:${target.personaId}`;
  }

  private ensureMemberBinding(member: ConversationMemberBinding): ConversationMemberBinding {
    if (member.type === 'hub') {
      return this.ensureHubMemberBinding(member);
    }
    return this.ensureNodeMemberBinding(member);
  }

  private ensureHubMemberBinding(member: ConversationMemberBinding): ConversationMemberBinding {
    const personaId = member.personaId?.trim();
    if (member.nodeId) {
      const node = this.nodeService.getNode(member.nodeId);
      if (!node) {
        throw new ConversationRoutingError(`未找到 Hub 节点 ${member.nodeId}`);
      }
      if (node.type !== 'hub') {
        throw new ConversationRoutingError(`节点 ${member.nodeId} 不是 Hub 类型`);
      }
      const allowed = node.boundPersonas ?? [];
      if (allowed.length === 0) {
        return {
          ...member,
          personaId: personaId ?? this.defaultHubPersonaId
        };
      }
      if (personaId && allowed.includes(personaId)) {
        return { ...member, personaId };
      }
      if (personaId && !allowed.includes(personaId)) {
        throw new ConversationRoutingError(`Hub 节点 ${member.nodeId} 未绑定人格 ${personaId}`);
      }
      return {
        ...member,
        personaId: allowed[0]
      };
    }

    const hubNodes = this.nodeService.getAllNodes().filter((node) => node.type === 'hub');
    const allowed = hubNodes.flatMap((node) => node.boundPersonas ?? []);

    if (personaId) {
      if (allowed.length > 0 && !allowed.includes(personaId)) {
        throw new ConversationRoutingError(`Hub 节点未绑定人格 ${personaId}`);
      }
      return { ...member, personaId };
    }

    if (allowed.length > 0) {
      return {
        ...member,
        personaId: allowed[0]
      };
    }

    return {
      ...member,
      personaId: this.defaultHubPersonaId
    };
  }

  private ensureNodeMemberBinding(member: ConversationMemberBinding): ConversationMemberBinding {
    if (!member.nodeId) {
      throw new ConversationRoutingError(`节点类型 ${member.type} 的成员必须指定 nodeId`);
    }
    const node = this.nodeService.getNode(member.nodeId);
    if (!node) {
      throw new ConversationRoutingError(`未找到节点 ${member.nodeId}`);
    }

    const allowedPersona =
      node.boundPersona ??
      (node.boundPersonas && node.boundPersonas.length > 0 ? node.boundPersonas[0] : undefined);

    if (!allowedPersona) {
      throw new ConversationRoutingError(`节点 ${member.nodeId} 尚未绑定人格`);
    }

    if (member.personaId && member.personaId !== allowedPersona) {
      throw new ConversationRoutingError(`节点 ${member.nodeId} 未绑定人格 ${member.personaId}`);
    }

    return {
      ...member,
      personaId: allowedPersona
    };
  }

  private replaceMember(context: ConversationContext, member: ConversationMemberBinding): void {
    const index = context.members.findIndex((existing) => existing.memberId === member.memberId);
    if (index >= 0) {
      context.members[index] = member;
    } else {
      context.members = [...context.members, member];
    }
  }

  private collectMentionRefs(payload: ConversationRequestPayload): string[] {
    const refs = new Set<string>();
    if (payload.apexMeta?.mentions) {
      for (const mention of payload.apexMeta.mentions) {
        if (typeof mention === 'string' && mention.trim().length > 0) {
          refs.add(mention.trim());
        }
      }
    }

    const lastUser = [...payload.messages].reverse().find((msg) => msg.role === 'user');
    if (lastUser?.content) {
      const regex = /@([\p{L}\p{N}_\-\.:]+)/gu;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(lastUser.content)) !== null) {
        const mention = match[1].trim();
        if (mention.length > 0) {
          refs.add(mention);
        }
      }
    }

    return Array.from(refs);
  }

  private resolveMentionMembers(
    mentionRefs: string[],
    apexMeta: ApexMeta,
    context: ConversationContext
  ): ConversationMemberBinding[] {
    if (mentionRefs.length === 0) {
      return [];
    }

    const candidates = this.collectCandidateMembers(apexMeta, context);
    const resolved: ConversationMemberBinding[] = [];
    const seen = new Set<string>();

    for (const ref of mentionRefs) {
      if (ref.toLowerCase() === 'all') {
        continue;
      }
      const match = this.matchMention(ref, candidates);
      if (!match) {
        logger.warn(`[ConversationRouter] 未能匹配 @${ref} 对应的成员，已忽略`);
        continue;
      }
      const ensured = this.ensureMemberBinding(match);
      this.replaceMember(context, ensured);
      if (!seen.has(ensured.memberId)) {
        resolved.push(ensured);
        seen.add(ensured.memberId);
      }
    }

    if (mentionRefs.some((ref) => ref.toLowerCase() === 'all')) {
      for (const member of candidates) {
        const ensured = this.ensureMemberBinding(member);
        this.replaceMember(context, ensured);
        if (!seen.has(ensured.memberId)) {
          resolved.push(ensured);
          seen.add(ensured.memberId);
        }
      }
    }

    return resolved;
  }

  private collectCandidateMembers(apexMeta: ApexMeta, context: ConversationContext): ConversationMemberBinding[] {
    const result: ConversationMemberBinding[] = [];
    const append = (member: ConversationMemberBinding) => {
      if (!result.find((existing) => existing.memberId === member.memberId)) {
        result.push({ ...member });
      }
    };

    for (const member of context.members) {
      append(member);
    }

    if (apexMeta.target?.members) {
      for (const member of apexMeta.target.members) {
        append(member);
      }
    }

    if (apexMeta.target?.default) {
      append({
        memberId: this.buildMemberId(apexMeta.target.default),
        personaId: apexMeta.target.default.personaId,
        type: apexMeta.target.default.type,
        nodeId: apexMeta.target.default.nodeId
      });
    }

    append({
      memberId: this.defaultHubMemberId,
      personaId: this.defaultHubPersonaId,
      type: 'hub'
    });

    return result;
  }

  private matchMention(ref: string, candidates: ConversationMemberBinding[]): ConversationMemberBinding | null {
    const normalized = ref.trim();
    if (!normalized) {
      return null;
    }

    const lower = normalized.toLowerCase();

    return (
      candidates.find((member) => member.memberId === normalized) ??
      candidates.find((member) => member.memberId.toLowerCase() === lower) ??
      candidates.find((member) => (member.displayName ?? '').toLowerCase() === lower) ??
      candidates.find((member) => member.personaId.toLowerCase() === lower) ??
      candidates.find(
        (member) => member.nodeId && `${member.type}:${member.nodeId}`.toLowerCase() === lower
      ) ??
      null
    );
  }
}


