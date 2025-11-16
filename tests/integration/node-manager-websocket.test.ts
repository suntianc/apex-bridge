import { NodeAwareDistributedServerChannel } from '../../src/api/websocket/channels/NodeAwareDistributedServerChannel';
import { NodeManager } from '../../src/core/NodeManager';

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

interface FakeMessage {
  type: string;
  data?: any;
}

class FakeWebSocket {
  public messages: any[] = [];
  public serverId?: string;

  constructor(serverId?: string) {
    this.serverId = serverId;
  }

  send(payload: string): void {
    try {
      this.messages.push(JSON.parse(payload));
    } catch {
      this.messages.push(payload);
    }
  }
}

function createChannel(overrides: Partial<NodeManager> = {}) {
  const nodeManagerMock = {
    registerNode: jest.fn(),
    unregisterNode: jest.fn(),
    handleHeartbeat: jest.fn(),
    handleLLMRequest: jest.fn(),
    handleConnectionClosed: jest.fn(),
    handleTaskResult: jest.fn(),
    ...overrides
  } as unknown as NodeManager;

  const channel = new NodeAwareDistributedServerChannel(nodeManagerMock);
  (channel as any).sendToClient = jest.fn((ws: FakeWebSocket, payload: any) => {
    ws.send(JSON.stringify(payload));
  });
  (channel as any).forwardToBase = jest.fn();

  return {
    channel,
    nodeManager: nodeManagerMock
  };
}

describe('NodeAwareDistributedServerChannel', () => {
  it('registers node and responds with success payload', async () => {
    const { channel, nodeManager } = createChannel({
      registerNode: jest.fn().mockReturnValue({
        id: 'node-1',
        name: 'Worker Alpha',
        type: 'worker',
        status: 'online',
        registeredAt: Date.now()
      })
    } as unknown as Partial<NodeManager>);

    const ws = new FakeWebSocket('server-1');
    const message: FakeMessage = {
      type: 'node_register',
      data: {
        nodeId: 'node-1',
        name: 'Worker Alpha',
        type: 'worker',
        capabilities: []
      }
    };

    await (channel as any).onMessage(ws, message);

    expect(nodeManager.registerNode).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 'node-1',
        connectionId: 'server-1'
      })
    );
    expect(ws.messages[0]).toMatchObject({
      type: 'node_registered',
      data: {
        success: true,
        nodeId: 'node-1'
      }
    });
  });

  it('handles heartbeat and responds with ack', async () => {
    const { channel, nodeManager } = createChannel({
      handleHeartbeat: jest.fn().mockReturnValue({
        id: 'node-1',
        status: 'busy'
      })
    } as unknown as Partial<NodeManager>);

    const ws = new FakeWebSocket('server-1');
    const message: FakeMessage = {
      type: 'heartbeat',
      data: {
        nodeId: 'node-1',
        status: 'busy',
        stats: {
          activeTasks: 1
        }
      }
    };

    await (channel as any).onMessage(ws, message);

    expect(nodeManager.handleHeartbeat).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({
        status: 'busy',
        stats: expect.objectContaining({ activeTasks: 1 })
      }),
      'server-1'
    );
    expect(ws.messages[0]).toMatchObject({
      type: 'heartbeat_ack',
      data: {
        nodeId: 'node-1',
        success: true,
        status: 'busy'
      }
    });
  });

  it('proxies llm request and returns response', async () => {
    const { channel, nodeManager } = createChannel({
      handleLLMRequest: jest.fn().mockResolvedValue({
        success: true,
        content: 'hello'
      })
    } as unknown as Partial<NodeManager>);

    const ws = new FakeWebSocket('worker-1');
    const message: FakeMessage = {
      type: 'llm_request',
      data: {
        requestId: 'req-1',
        nodeId: 'worker-1',
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'hi' }]
      }
    };

    await (channel as any).onMessage(ws, message);

    expect(nodeManager.handleLLMRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-1',
        nodeId: 'worker-1',
        model: 'gpt-4'
      })
    );
    expect(ws.messages[0]).toMatchObject({
      type: 'llm_response',
      data: {
        requestId: 'req-1',
        nodeId: 'worker-1',
        success: true,
        content: 'hello'
      }
    });
  });

  it('unregisters node and returns acknowledgement', async () => {
    const { channel, nodeManager } = createChannel({
      unregisterNode: jest.fn().mockReturnValue(true)
    } as unknown as Partial<NodeManager>);

    const ws = new FakeWebSocket('server-1');
    const message: FakeMessage = {
      type: 'node_unregister',
      data: {
        nodeId: 'node-1'
      }
    };

    await (channel as any).onMessage(ws, message);

    expect(nodeManager.unregisterNode).toHaveBeenCalledWith('node-1');
    expect(ws.messages[0]).toMatchObject({
      type: 'node_unregistered',
      data: {
        nodeId: 'node-1',
        success: true
      }
    });
  });

  it('handles task_result and acknowledges node', async () => {
    const { channel, nodeManager } = createChannel();
    const ws = new FakeWebSocket('worker-1');
    const message: FakeMessage = {
      type: 'task_result',
      data: {
        taskId: 'task-789',
        nodeId: 'worker-1',
        success: true,
        result: { ok: true }
      }
    };

    await (channel as any).onMessage(ws, message);

    expect(nodeManager.handleTaskResult).toHaveBeenCalledWith(
      'worker-1',
      expect.objectContaining({
        taskId: 'task-789',
        success: true,
        result: { ok: true }
      })
    );
    expect(ws.messages[0]).toMatchObject({
      type: 'task_result_ack',
      data: {
        taskId: 'task-789',
        nodeId: 'worker-1',
        success: true
      }
    });
  });

  it('streams llm responses when requested', async () => {
    const { channel, nodeManager } = createChannel({
      handleLLMRequest: jest.fn().mockImplementation(async ({ streamObserver }: any) => {
        const timestamp = Date.now();
        streamObserver?.onChunk({
          requestId: 'req-stream',
          nodeId: 'worker-1',
          chunk: 'Hello',
          done: false,
          timestamp
        });
        streamObserver?.onChunk({
          requestId: 'req-stream',
          nodeId: 'worker-1',
          chunk: '',
          done: true,
          timestamp: timestamp + 1
        });
        return {
          success: true,
          content: 'Hello'
        };
      })
    } as unknown as Partial<NodeManager>);

    const ws = new FakeWebSocket('worker-1');
    const message: FakeMessage = {
      type: 'llm_request',
      data: {
        requestId: 'req-stream',
        nodeId: 'worker-1',
        messages: [{ role: 'user', content: 'Hi' }],
        options: { stream: true }
      }
    };

    await (channel as any).onMessage(ws, message);

    expect(nodeManager.handleLLMRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        streamObserver: expect.any(Object)
      })
    );

    expect(ws.messages[0]).toMatchObject({
      type: 'llm_response_stream',
      data: {
        requestId: 'req-stream',
        nodeId: 'worker-1',
        chunk: 'Hello',
        done: false
      }
    });

    expect(ws.messages[1]).toMatchObject({
      type: 'llm_response_stream',
      data: {
        requestId: 'req-stream',
        nodeId: 'worker-1',
        done: true
      }
    });

    expect(ws.messages[2]).toMatchObject({
      type: 'llm_response',
      data: {
        requestId: 'req-stream',
        nodeId: 'worker-1',
        success: true,
        stream: true,
        content: 'Hello'
      }
    });
  });
});

