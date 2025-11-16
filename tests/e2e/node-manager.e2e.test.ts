import { NodeAwareDistributedServerChannel } from '../../src/api/websocket/channels/NodeAwareDistributedServerChannel';
import { NodeManager } from '../../src/core/NodeManager';
import { NodeService } from '../../src/services/NodeService';
import { EventBus } from '../../src/core/EventBus';
import { RuntimeConfigService } from '../../src/services/RuntimeConfigService';
import { logger } from '../../src/utils/logger';

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('NodeManager E2E', () => {
  let nodeService: NodeService;
  let nodeManager: NodeManager;
  let distributedChannel: NodeAwareDistributedServerChannel;
  let eventBus: EventBus;
  const streamEvents: any[] = [];
  const rateLimitEvents: any[] = [];
  const runtimeConfigMock = {
    getLLMClient: () => null,
    getCurrentConfig: () => ({
      llm: {
        quota: {
          maxRequestsPerMinute: 5,
          maxTokensPerDay: 50,
          maxConcurrentStreams: 2,
          burstMultiplier: 1
        }
      }
    }),
    loadConfig: () => ({
      llm: {
        quota: {
          maxRequestsPerMinute: 5,
          maxTokensPerDay: 50,
          maxConcurrentStreams: 2,
          burstMultiplier: 1
        }
      }
    })
  } as any;

  beforeAll(async () => {
    jest.setTimeout(30_000);

    jest.spyOn(RuntimeConfigService, 'getInstance').mockReturnValue(runtimeConfigMock);

    nodeService = NodeService.getInstance();
    eventBus = EventBus.getInstance();

    nodeManager = new NodeManager({
      nodeService,
      eventBus
    });
    nodeManager.start();

    distributedChannel = new NodeAwareDistributedServerChannel(nodeManager);
    (distributedChannel as any).sendToClient = (_ws: any, payload: any) => {
      try {
        _ws.send(JSON.stringify(payload));
      } catch (error) {
        logger.error('Failed to send payload', error);
      }
    };

    eventBus.subscribe('llm_proxy_stream_chunk', (payload) => {
      streamEvents.push(payload);
    });
    eventBus.subscribe('llm_proxy_rate_limited', (payload) => {
      rateLimitEvents.push(payload);
    });
  });

  afterAll(async () => {
    nodeManager.stop();
    jest.restoreAllMocks();
  });

  test('simulates node lifecycle and streaming LLM flow', async () => {
    streamEvents.length = 0;
    rateLimitEvents.length = 0;
    const nodeId = `node-e2e-${Date.now()}`;

    const fakeLLMClient = {
      chat: jest.fn().mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'Final answer' } }],
        usage: { total_tokens: 4 }
      }),
      streamChat: jest.fn().mockImplementation(async function* () {
        yield 'Hello';
        yield ' World';
      })
    };

    runtimeConfigMock.getLLMClient = () => fakeLLMClient;

    const fakeWs: any = {
      send: jest.fn(),
      serverId: `conn-${nodeId}`
    };

    await (distributedChannel as any).handleNodeRegister(fakeWs, {
      type: 'node_register',
      data: {
        nodeId,
        name: 'Worker E2E',
        type: 'worker',
        capabilities: ['vision']
      }
    });

    await (distributedChannel as any).onMessage(fakeWs, {
      type: 'heartbeat',
      data: {
        nodeId,
        status: 'online',
        stats: { activeTasks: 0 }
      }
    });

    await (distributedChannel as any).onMessage(fakeWs, {
      type: 'llm_request',
      data: {
        requestId: 'req-e2e',
        nodeId,
        messages: [{ role: 'user', content: 'Say hi' }],
        options: {
          stream: true
        }
      }
    });

    expect(fakeLLMClient.streamChat).toHaveBeenCalled();
    expect(fakeWs.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"llm_response_stream"')
    );
    expect(fakeWs.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"llm_response"')
    );

    await (distributedChannel as any).onMessage(fakeWs, {
      type: 'task_result',
      data: {
        taskId: 'task-e2e',
        nodeId,
        success: true,
        result: { value: 42 }
      }
    });

    expect(fakeWs.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"task_result_ack"')
    );

    expect(streamEvents.length).toBeGreaterThan(0);
    expect(rateLimitEvents.length).toBe(0);
    expect(nodeManager.getNode(nodeId)).not.toBeNull();

    nodeService.unregisterNode(nodeId);
  });
});

