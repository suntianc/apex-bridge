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

describe('Hub + Worker integration (real runtime)', () => {
  let tmpRoot: string;
  let nodeManager: any;
  let nodeService: any;
  let eventBus: any;
  let runtimeConfigMock: any;
  let runtimeConfigSpy: jest.SpyInstance;
  let wss: WebSocketServer;
  let workerContext: any;
  let NodeAwareChannel: any;
  let channelInstance: any;
  let NodeManagerClass: any;
  let NodeServiceClass: any;
  let EventBusClass: any;
  let RuntimeConfigServiceClass: any;
  let taskAssignHandler: (payload: any) => void;

  const nodeConnections = new Map<string, WebSocket>();
  const pendingAssignPayloads = new Map<string, any>();
  const rawTaskResults = new Map<string, any>();

  const workerNodeId = 'worker-demo-node';

  beforeAll(async () => {
    jest.setTimeout(60000);

    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-worker-int-'));
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
      getLLMClient: () => null,
      getCurrentConfig: () => ({ llm: { quota: null } }),
      loadConfig: () => ({ llm: { quota: null } })
    };

    runtimeConfigSpy = jest
      .spyOn(RuntimeConfigServiceClass, 'getInstance')
      .mockReturnValue(runtimeConfigMock);

    nodeService = NodeServiceClass.getInstance();
    eventBus = EventBusClass.getInstance();

    nodeManager = new NodeManagerClass({
      nodeService,
      eventBus
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

    taskAssignHandler = (payload: any) => {
      if (payload.nodeId !== workerNodeId) {
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

    const workerConfig: NodeAgentConfig = {
      hub: {
        url: `ws://127.0.0.1:${port}`
      },
      node: {
        id: workerNodeId,
        name: 'Worker Demo Node',
        type: 'worker',
        capabilities: ['worker'],
        tools: ['echo', 'wait']
      },
      heartbeat: {
        intervalMs: 200
      },
      tasks: {
        maxConcurrent: 2,
        defaultTimeoutMs: 10_000
      },
      llm: {
        streamEnabled: false,
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

    workerContext = await startRuntime(workerConfig, createTestLogger('error'));

    await waitFor(() => nodeManager.getNode(workerNodeId) !== null, {
      timeoutMs: 10_000,
      intervalMs: 50
    });
  });

  afterAll(async () => {
    if (workerContext) {
      await shutdownContext(workerContext);
    }
    if (taskAssignHandler && eventBus) {
      eventBus.unsubscribe('task_assigned', taskAssignHandler);
    }
    if (wss) {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    }
    if (nodeManager) {
      nodeManager.stop();
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
    pendingAssignPayloads.clear();
    rawTaskResults.clear();
  });

  test('worker node echoes payload via Hub', async () => {
    const taskId = 'task-echo-1';
    const assignInput = {
      taskId,
      capability: 'worker',
      toolName: 'echo',
      toolArgs: {
        value: 'hello-worker'
      },
      timeout: 5_000
    };

    pendingAssignPayloads.set(taskId, assignInput);
    const result = await nodeManager.assignTask(assignInput);
    pendingAssignPayloads.delete(taskId);

    expect(result).toMatchObject({
      echoed: { value: 'hello-worker' }
    });
    expect(rawTaskResults.get(taskId)).toMatchObject({ success: true });
  });

  test('worker wait task respects duration', async () => {
    const taskId = 'task-wait-1';
    const assignInput = {
      taskId,
      capability: 'worker',
      toolName: 'wait',
      toolArgs: {
        durationMs: 200
      },
      timeout: 5_000
    };

    pendingAssignPayloads.set(taskId, assignInput);
    const result = await nodeManager.assignTask(assignInput);
    pendingAssignPayloads.delete(taskId);

    expect(result).toMatchObject({ sleptMs: 200 });
  });

  test('worker wait task times out when exceeding deadline', async () => {
    const taskId = 'task-wait-timeout';
    const assignInput = {
      taskId,
      capability: 'worker',
      toolName: 'wait',
      toolArgs: {
        durationMs: 1_500
      },
      timeout: 200
    };

    pendingAssignPayloads.set(taskId, assignInput);
    await expect(nodeManager.assignTask(assignInput)).rejects.toThrow(/timeout/i);
    pendingAssignPayloads.delete(taskId);

    await waitFor(() => rawTaskResults.has(taskId), { timeoutMs: 1_000, intervalMs: 25 });
    expect(rawTaskResults.get(taskId)).toMatchObject({ success: false });
  });
});
