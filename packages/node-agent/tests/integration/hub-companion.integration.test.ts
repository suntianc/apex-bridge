import { jest } from '@jest/globals';
import { AddressInfo } from 'net';
import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { startRuntime, shutdownContext } from 'src/runtime';
import { createTestLogger, waitFor } from '../helpers';
import type { NodeAgentConfig } from 'src/config/types';

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('Hub + Companion integration (real runtime)', () => {
  const streamEvents: any[] = [];
  const rateLimitEvents: any[] = [];

  let tmpRoot: string;
  let nodeManager: any;
  let nodeService: any;
  let eventBus: any;
  let runtimeConfigMock: any;
  let runtimeConfigSpy: jest.SpyInstance;
  let wss: WebSocketServer;
  let companionContext: any;
  let NodeAwareChannel: any;
  let channelInstance: any;
  let NodeManagerClass: any;
  let NodeServiceClass: any;
  let EventBusClass: any;
  let RuntimeConfigServiceClass: any;
  let taskAssignHandler: (payload: any) => void;
  const nodeConnections = new Map<string, WebSocket>();
  const pendingAssignPayloads = new Map<string, any>();
  const completedTasks = new Map<string, any>();
  const rawTaskResults = new Map<string, any>();
  const rawTaskAssigns = new Map<string, any>();

  const companionNodeId = 'companion-demo-node';

  beforeAll(async () => {
    jest.setTimeout(60000);

    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-companion-int-'));
    process.env.APEX_BRIDGE_ROOT_DIR = tmpRoot;
    process.env.APEX_BRIDGE_CONFIG_DIR = path.join(tmpRoot, 'config');
    process.env.APEX_BRIDGE_DATA_DIR = path.join(tmpRoot, 'data');
    fs.mkdirSync(process.env.APEX_BRIDGE_CONFIG_DIR!, { recursive: true });
    fs.mkdirSync(process.env.APEX_BRIDGE_DATA_DIR!, { recursive: true });

    await jest.isolateModulesAsync(async () => {
      ({ NodeManager: NodeManagerClass } = await import('../../../../src/core/NodeManager'));
      ({ NodeAwareDistributedServerChannel: NodeAwareChannel } = await import('../../../../src/api/websocket/channels/NodeAwareDistributedServerChannel'));
      ({ EventBus: EventBusClass } = await import('../../../../src/core/EventBus'));
      ({ NodeService: NodeServiceClass } = await import('../../../../src/services/NodeService'));
      ({ RuntimeConfigService: RuntimeConfigServiceClass } = await import('../../../../src/services/RuntimeConfigService'));
    });

    runtimeConfigMock = {
      getLLMClient: () => fakeLLMClient,
      getCurrentConfig: () => ({
        llm: {
          quota: {
            maxRequestsPerMinute: 1,
            maxTokensPerDay: 500,
            maxConcurrentStreams: 1,
            burstMultiplier: 1
          }
        }
      }),
      loadConfig: () => ({
        llm: {
          quota: {
            maxRequestsPerMinute: 1,
            maxTokensPerDay: 500,
            maxConcurrentStreams: 1,
            burstMultiplier: 1
          }
        }
      })
    };

    runtimeConfigSpy = jest
      .spyOn(RuntimeConfigServiceClass, 'getInstance')
      .mockReturnValue(runtimeConfigMock);

    nodeService = NodeServiceClass.getInstance();
    eventBus = EventBusClass.getInstance();

    nodeManager = new NodeManagerClass({
      nodeService,
      eventBus,
      quotaConfig: {
        maxRequestsPerMinute: 1,
        maxTokensPerDay: 500,
        maxConcurrentStreams: 1,
        burstMultiplier: 1
      }
    });
    nodeManager.start();

    channelInstance = new NodeAwareChannel(nodeManager);
    if (typeof nodeService.setDistributedChannel === 'function') {
      nodeService.setDistributedChannel(channelInstance);
    }
    (channelInstance as any).sendToClient = (ws: WebSocket, payload: any) => {
      if (payload?.type === 'node_registered' && payload?.data?.nodeId) {
        nodeConnections.set(payload.data.nodeId, ws);
      }
      ws.send(JSON.stringify(payload));
    };

    eventBus.subscribe('llm_proxy_stream_chunk', (payload: any) => {
      if (payload.nodeId === companionNodeId) {
        streamEvents.push(payload);
      }
    });
    eventBus.subscribe('llm_proxy_rate_limited', (payload: any) => {
      if (payload.nodeId === companionNodeId) {
        rateLimitEvents.push(payload);
      }
    });
    eventBus.subscribe('task_completed', (payload: any) => {
      completedTasks.set(payload.taskId, payload);
    });
    taskAssignHandler = (payload: any) => {
      if (payload.nodeId !== companionNodeId) {
        return;
      }
      const ws = nodeConnections.get(payload.nodeId);
      const assignPayload = pendingAssignPayloads.get(payload.taskId);
      if (!ws || !assignPayload) {
        return;
      }
      ws.send(
        JSON.stringify({
          type: 'task_assign',
          data: {
            taskId: payload.taskId,
            nodeId: payload.nodeId,
            toolName: assignPayload.toolName,
            capability: assignPayload.capability,
            toolArgs: assignPayload.toolArgs,
            timeout: assignPayload.timeout,
            priority: assignPayload.priority ?? 5
          }
        })
      );
      rawTaskAssigns.set(payload.taskId, assignPayload.toolArgs);
    };
    eventBus.subscribe('task_assigned', taskAssignHandler);

    wss = new WebSocketServer({ port: 0 });
    let connectionCounter = 0;
    wss.on('connection', (ws) => {
      (ws as any).serverId = `server-${++connectionCounter}`;
      ws.on('message', async (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'task_result' && message.data?.taskId) {
          rawTaskResults.set(message.data.taskId, message.data);
        }
        if (message.type === 'node_register') {
          await (channelInstance as any).handleNodeRegister(ws, message);
          return;
        }
        if (message.type === 'node_unregister') {
          await (channelInstance as any).handleNodeUnregister(ws, message);
          return;
        }
        if (message.type === 'heartbeat') {
          await (channelInstance as any).handleNodeHeartbeat(ws, message);
          return;
        }
        if (message.type === 'llm_request') {
          await (channelInstance as any).handleLLMRequest(ws, message);
          return;
        }
        if (message.type === 'task_result') {
          await (channelInstance as any).handleTaskResult(ws, message);
          return;
        }
        if ((channelInstance as any).forwardToBase) {
          await (channelInstance as any).forwardToBase(ws, message);
        }
      });

      ws.on('close', async () => {
        if ((channelInstance as any).onConnectionClosed) {
          await (channelInstance as any).onConnectionClosed(ws);
        }
      });
    });

    const { port } = wss.address() as AddressInfo;

    const companionConfig: NodeAgentConfig = {
      hub: {
        url: `ws://127.0.0.1:${port}`
      },
      node: {
        id: companionNodeId,
        name: 'Companion Demo Node',
        type: 'companion',
        capabilities: ['companion'],
        tools: ['companion_conversation']
      },
      heartbeat: {
        intervalMs: 200
      },
      tasks: {
        maxConcurrent: 1,
        defaultTimeoutMs: 10_000
      },
      llm: {
        streamEnabled: true,
        localFallback: false,
        retry: {
          attempts: 0,
          delayMs: 200
        }
      },
      telemetry: {
        enabled: false,
        port: 0
      },
      logging: {
        level: 'error',
        format: 'json'
      }
    };

    companionContext = await startRuntime(companionConfig, createTestLogger('error'));

    await waitFor(() => nodeManager.getNode(companionNodeId) !== null, {
      timeoutMs: 10_000,
      intervalMs: 50
    });
  });

  let fakeLLMClient: any = {
    streamChat: jest.fn(async function* () {
      yield '你好';
      yield '，世界';
    }),
    chat: jest.fn()
  };

  afterAll(async () => {
    if (companionContext) {
      await shutdownContext(companionContext);
    }
    if (wss) {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    }
    if (nodeManager) {
      nodeManager.stop();
    }
    if (eventBus && taskAssignHandler) {
      eventBus.unsubscribe('task_assigned', taskAssignHandler);
    }
    if (eventBus) {
      eventBus.removeAllListeners?.();
    }
    if (runtimeConfigSpy) {
      runtimeConfigSpy.mockRestore();
    }
    if (tmpRoot) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
    delete process.env.APEX_BRIDGE_ROOT_DIR;
    delete process.env.APEX_BRIDGE_CONFIG_DIR;
    delete process.env.APEX_BRIDGE_DATA_DIR;
  });

  beforeEach(() => {
    streamEvents.length = 0;
    rateLimitEvents.length = 0;
    completedTasks.clear();
    rawTaskResults.clear();
    rawTaskAssigns.clear();
  });

  test('companion node streams conversation results via Hub', async () => {
    fakeLLMClient = {
      streamChat: jest.fn(async function* () {
        yield '你好';
        yield '，世界';
      }),
      chat: jest.fn()
    };
    runtimeConfigMock.getLLMClient = () => fakeLLMClient;

    const taskId = 'task-conv-1';
    const assignInput = {
      taskId,
      capability: 'companion',
      toolName: 'companion_conversation',
      toolArgs: {
        conversationId: 'conv-1',
        messages: [{ role: 'user', content: '请用中文问候我' }],
        llm: { stream: true, temperature: 0.2 }
      },
      timeout: 10_000
    };
    pendingAssignPayloads.set(taskId, assignInput);
    const result = await nodeManager.assignTask(assignInput);
    pendingAssignPayloads.delete(taskId);

    expect(fakeLLMClient.streamChat).toHaveBeenCalled();
    expect(result).toMatchObject({
      conversationId: 'conv-1',
      reply: '你好，世界'
    });
    expect(Array.isArray(result.partialOutputs)).toBe(true);
    expect(result.partialOutputs.length).toBeGreaterThanOrEqual(2);
    expect(streamEvents.length).toBeGreaterThanOrEqual(2);
    expect(completedTasks.get(taskId)).toMatchObject({ success: true });
  });

  test('companion node falls back when quota exceeded', async () => {
    runtimeConfigMock.getLLMClient = () => fakeLLMClient;

    const taskId = 'task-conv-2';
    const assignInput = {
      taskId,
      capability: 'companion',
      toolName: 'companion_conversation',
      toolArgs: {
        conversationId: 'conv-2',
        messages: [{ role: 'user', content: '继续回答' }],
        llm: { stream: true },
        metadata: {
          fallbackReply: '当前对话达到限流，请稍后再试。'
        }
      },
      timeout: 10_000
    };
    pendingAssignPayloads.set(taskId, assignInput);
    const result = await nodeManager.assignTask(assignInput);
    pendingAssignPayloads.delete(taskId);

    if (!result) {
      const raw = rawTaskResults.get(taskId);
      const assigned = rawTaskAssigns.get(taskId);
      throw new Error(
        `Task result missing for ${taskId}, raw payload: ${JSON.stringify(raw)}, assigned toolArgs: ${JSON.stringify(assigned)}, completed payload: ${JSON.stringify(completedTasks.get(taskId))}`
      );
    }

    expect(result).toMatchObject({
      conversationId: 'conv-2',
      degraded: true,
      reply: { text: '当前对话达到限流，请稍后再试。' }
    });
    expect(rateLimitEvents.length).toBeGreaterThanOrEqual(1);
    expect(completedTasks.get(taskId)).toMatchObject({ success: true });
  });
});
