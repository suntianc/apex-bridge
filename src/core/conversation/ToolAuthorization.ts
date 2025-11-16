import { ToolRequest, ToolAuthorizationDecision, ToolOriginType } from '../../types';
import { NodeInfo, NodeService, NodeType } from '../../services/NodeService';
import { RouteResolution } from './ConversationRouter';

export interface ToolAuthorizationOptions {
  nodeService?: NodeService;
  sharedHubToolKeywords?: string[];
}

interface ToolOrigin {
  type: ToolOriginType;
  node?: NodeInfo;
}

const DEFAULT_SHARED_HUB_KEYWORDS = ['rag', 'memory', 'diary', 'timeline', 'profile', 'knowledge'];

export class ToolAuthorization {
  private readonly nodeService: NodeService;
  private readonly sharedHubToolKeywords: string[];

  constructor(options: ToolAuthorizationOptions = {}) {
    this.nodeService = options.nodeService ?? NodeService.getInstance();
    this.sharedHubToolKeywords = options.sharedHubToolKeywords ?? DEFAULT_SHARED_HUB_KEYWORDS;
  }

  authorize(tool: ToolRequest, route: RouteResolution): ToolAuthorizationDecision {
    const origin = this.resolveToolOrigin(tool.name);
    const decision: ToolAuthorizationDecision = {
      toolName: tool.name,
      status: 'allow',
      originType: origin.type,
      originNodeId: origin.node?.id,
      originNodeName: origin.node?.name
    };

    const persona = route.primaryTarget;
    if (!persona) {
      return decision;
    }

    const personaNodeId = persona.nodeId;

    if ((persona.type === 'companion' || persona.type === 'worker') && !personaNodeId) {
      return {
        ...decision,
        status: 'deny',
        reason: '人格未绑定节点，拒绝执行工具'
      };
    }

    switch (persona.type) {
      case 'hub':
        return decision;

      case 'companion':
        return this.authorizeForCompanion(decision, personaNodeId!, origin);

      case 'worker':
        return this.authorizeForWorker(decision, personaNodeId!, origin, tool.name);

      default:
        return decision;
    }
  }

  private authorizeForCompanion(
    baseDecision: ToolAuthorizationDecision,
    personaNodeId: string,
    origin: ToolOrigin
  ): ToolAuthorizationDecision {
    if (origin.type === 'companion') {
      if (origin.node?.id && origin.node.id !== personaNodeId) {
        return {
          ...baseDecision,
          status: 'deny',
          reason: `工具归属节点 ${origin.node?.name ?? origin.node.id}，当前人格未绑定`
        };
      }
      return baseDecision;
    }

    if (origin.type === 'worker') {
      return baseDecision;
    }

    if (origin.type === 'hub') {
      return {
        ...baseDecision,
        status: 'requires_approval',
        reason: 'Companion 人格调用 Hub 工具需要用户确认'
      };
    }

    return {
      ...baseDecision,
      status: 'requires_approval',
      reason: '工具来源未知，需要用户确认'
    };
  }

  private authorizeForWorker(
    baseDecision: ToolAuthorizationDecision,
    personaNodeId: string,
    origin: ToolOrigin,
    toolName: string
  ): ToolAuthorizationDecision {
    if (origin.type === 'worker') {
      if (origin.node?.id && origin.node.id !== personaNodeId) {
        return {
          ...baseDecision,
          status: 'deny',
          reason: `工具归属节点 ${origin.node?.name ?? origin.node.id}，当前人格未绑定`
        };
      }
      return baseDecision;
    }

    if (origin.type === 'hub' && this.isSharedHubUtility(toolName)) {
      return baseDecision;
    }

    return {
      ...baseDecision,
      status: 'deny',
      reason: 'Worker 人格仅能调用所属节点工具'
    };
  }

  private resolveToolOrigin(toolName: string): ToolOrigin {
    const nodes = this.nodeService.getAllNodes();

    for (const node of nodes) {
      if (!node.tools || node.tools.length === 0) {
        continue;
      }

      if (node.tools.includes(toolName)) {
        return {
          type: this.normalizeNodeType(node.type),
          node
        };
      }
    }

    return {
      type: 'hub'
    };
  }

  private normalizeNodeType(type: NodeType | undefined): ToolOriginType {
    if (type === 'worker' || type === 'companion' || type === 'hub') {
      return type;
    }
    if (type === 'custom') {
      return 'custom';
    }
    return 'unknown';
  }

  private isSharedHubUtility(toolName: string): boolean {
    const lower = toolName.toLowerCase();
    return this.sharedHubToolKeywords.some((keyword) => lower.includes(keyword));
  }
}


