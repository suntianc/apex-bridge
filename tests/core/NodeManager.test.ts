import { NodeManager, NodeRegisterInfo } from '../../src/core/NodeManager';
import { RuntimeConfigService } from '../../src/services/RuntimeConfigService';
import {
  NodeInfo,
  NodeService,
  NodeStats,
  RegisterNodeInput
} from '../../src/services/NodeService';

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

interface EventMap {
  [event: string]: any[];
}

class InMemoryNodeService {
  public nodes = new Map<string, NodeInfo>();
  private counter = 1;

  public registerNode = jest.fn((input: RegisterNodeInput): NodeInfo => {
    const id = input.id ?? `node-${this.counter++}`;
    const now = Date.now();
    const stats = this.mergeStats(undefined, input.stats);

    const node: NodeInfo = {
      id,
      name: input.name,
      type: input.type ?? 'worker',
      version: input.version,
      status: input.status ?? 'online',
      registeredAt: now,
      lastSeen: now,
      lastHeartbeat: now,
      capabilities: input.capabilities ? [...input.capabilities] : undefined,
      tools: input.tools ? [...input.tools] : undefined,
      personality: input.personality ? { ...input.personality } : undefined,
      config: input.config ? { ...input.config } : undefined,
      stats
    };

    this.nodes.set(id, node);
    return this.clone(node);
  });

  public unregisterNode = jest.fn((id: string): boolean => {
    const existed = this.nodes.delete(id);
    return existed;
  });

  public updateNodeRuntime = jest.fn((id: string, updates: Partial<NodeInfo>): NodeInfo | null => {
    const current = this.nodes.get(id);
    if (!current) {
      return null;
    }

    const merged: NodeInfo = {
      ...current,
      ...updates,
      stats: this.mergeStats(current.stats, updates.stats),
      config: updates.config ? { ...current.config, ...updates.config } : current.config,
      lastSeen: updates.lastSeen ?? current.lastSeen,
      lastHeartbeat: updates.lastHeartbeat ?? current.lastHeartbeat
    };

    this.nodes.set(id, merged);
    return this.clone(merged);
  });

  public updateNode = jest.fn((id: string, updates: Partial<NodeInfo>): NodeInfo | null => {
    const current = this.nodes.get(id);
    if (!current) {
      return null;
    }

    const merged: NodeInfo = {
      ...current,
      ...updates,
      stats: this.mergeStats(current.stats, updates.stats),
      config: updates.config ? { ...current.config, ...updates.config } : current.config,
      capabilities: updates.capabilities ?? current.capabilities,
      tools: updates.tools ?? current.tools,
      personality: updates.personality ?? current.personality
    };

    this.nodes.set(id, merged);
    return this.clone(merged);
  });

  public getAllNodes = jest.fn((): NodeInfo[] => {
    return Array.from(this.nodes.values()).map(node => this.clone(node));
  });

  private mergeStats(base?: NodeStats, updates?: Partial<NodeStats>): NodeStats {
    return {
      totalTasks: updates?.totalTasks ?? base?.totalTasks ?? 0,
      completedTasks: updates?.completedTasks ?? base?.completedTasks ?? 0,
      failedTasks: updates?.failedTasks ?? base?.failedTasks ?? 0,
      activeTasks: updates?.activeTasks ?? base?.activeTasks ?? 0,
      averageResponseTime: updates?.averageResponseTime ?? base?.averageResponseTime ?? 0,
      lastTaskAt: updates?.lastTaskAt ?? base?.lastTaskAt
    };
  }

  private clone(node: NodeInfo): NodeInfo {
    return {
      ...node,
      capabilities: node.capabilities ? [...node.capabilities] : undefined,
      tools: node.tools ? [...node.tools] : undefined,
      config: node.config ? { ...node.config } : undefined,
      stats: node.stats ? { ...node.stats } : undefined,
      personality: node.personality ? { ...node.personality } : undefined
    };
  }
}

function createEventRecorder() {
  const events: EventMap = {};
  const publish = jest.fn((event: string, payload: any) => {
    if (!events[event]) {
      events[event] = [];
    }
    events[event].push(payload);
  });

  const bus = {
    publish
  };

  return { events, publish, bus: bus as unknown as any };
}

async function createNodeManager(overrides: Partial<NodeRegisterInfo> = {}) {
  const nodeService = new InMemoryNodeService();
  const recorder = createEventRecorder();

  const manager = new NodeManager({
    nodeService: nodeService as unknown as NodeService,
    eventBus: recorder.bus,
    heartbeatIntervalMs: 5_000,
    heartbeatTimeoutMs: 10_000
  });

  const registered = await manager.registerNode({
    name: 'worker-1',
    type: 'worker',
    capabilities: ['image', 'memory'],
    config: {
      maxConcurrentTasks: 2
    },
    ...overrides
  });

  return {
    manager,
    nodeService,
    events: recorder.events,
    registeredNode: registered
  };
}

describe('NodeManager', () => {
  beforeEach(() => {
    const runtimeConfigMock = {
      getLLMClient: jest.fn().mockReturnValue(null)
    };

    jest.spyOn(RuntimeConfigService, 'getInstance').mockReturnValue(runtimeConfigMock as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('registers node and publishes node_registered event', async () => {
    const { manager, nodeService, events } = await createNodeManager({ name: 'Worker Alpha' });

    expect(nodeService.registerNode).toHaveBeenCalledTimes(1);
    expect(events.node_registered).toBeDefined();
    expect(events.node_registered[0].node.name).toBe('Worker Alpha');

    const registeredNodeId = events.node_registered[0].node.id;
    const nodeFromManager = manager.getNode(registeredNodeId);
    expect(nodeFromManager).not.toBeNull();
    expect(nodeFromManager?.status).toBe('online');
  });

  it('handles heartbeat and emits status change', async () => {
    const { manager, nodeService, events, registeredNode } = await createNodeManager();

    nodeService.updateNodeRuntime.mockClear();

    const result = manager.handleHeartbeat(registeredNode.id, {
      status: 'busy',
      stats: { activeTasks: 1 }
    });

    expect(result).not.toBeNull();
    expect(result?.status).toBe('busy');

    expect(nodeService.updateNodeRuntime).toHaveBeenCalledWith(
      registeredNode.id,
      expect.objectContaining({
        status: 'busy'
      })
    );

    expect(events.node_heartbeat).toBeDefined();
    expect(events.node_heartbeat[0]).toMatchObject({
      nodeId: registeredNode.id,
      status: 'busy'
    });

    expect(events.node_status_changed).toBeDefined();
    expect(events.node_status_changed[0]).toMatchObject({
      nodeId: registeredNode.id,
      oldStatus: 'online',
      newStatus: 'busy'
    });
  });

  it('assigns task to node and resolves on completion', async () => {
    const { manager, events, registeredNode } = await createNodeManager({
      config: { maxConcurrentTasks: 3 },
      capabilities: ['vision', 'analysis']
    });

    const taskPromise = manager.assignTask({
      taskId: 'task-123',
      capability: 'vision',
      toolName: 'analyzeImage',
      toolArgs: { input: 'image-1' },
      timeout: 5_000
    });

    expect(events.task_assigned).toBeDefined();
    expect(events.task_assigned[0]).toMatchObject({
      taskId: 'task-123',
      nodeId: registeredNode.id,
      capability: 'vision'
    });

    manager.handleTaskResult(registeredNode.id, {
      taskId: 'task-123',
      success: true,
      result: { ok: true }
    });

    await expect(taskPromise).resolves.toEqual({ ok: true });

    const stats = manager.getNodeStats(registeredNode.id);
    expect(stats).not.toBeNull();
    expect(stats?.completedTasks).toBe(1);

    expect(events.task_completed).toBeDefined();
    expect(events.task_completed[0]).toMatchObject({
      taskId: 'task-123',
      nodeId: registeredNode.id,
      success: true
    });

    const statusEvents = events.node_status_changed?.filter(
      (evt: any) => evt.nodeId === registeredNode.id
    );
    expect(statusEvents?.some((evt: any) => evt.newStatus === 'busy')).toBe(true);
    expect(statusEvents?.some((evt: any) => evt.newStatus === 'online')).toBe(true);
  });
});

