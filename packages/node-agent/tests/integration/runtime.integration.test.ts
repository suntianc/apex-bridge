import { AddressInfo } from 'net';
import { WebSocketServer, WebSocket } from 'ws';
import { startRuntime, shutdownContext } from 'src/runtime';
import type { NodeAgentConfig } from 'src/config/types';
import { createTestLogger, waitFor } from '../helpers';

interface CapturedTaskResult {
  taskId: string;
  success: boolean;
  result?: unknown;
  error?: unknown;
}

describe('Node agent runtime integration', () => {
  it('registers with Hub, executes tasks, and handles streaming LLM flow', async () => {
    const server = new WebSocketServer({ port: 0 });
    const { port } = server.address() as AddressInfo;
    const logger = createTestLogger('error');

    const capturedResults: CapturedTaskResult[] = [];
    let hubSocket: WebSocket | null = null;

    server.on('connection', (socket) => {
      hubSocket = socket;
      socket.on('message', (buffer) => {
        const payload = JSON.parse(buffer.toString());
        switch (payload.type) {
          case 'node_register': {
            socket.send(
              JSON.stringify({
                type: 'node_registered',
                data: {
                  success: true,
                  nodeId: 'node-integration'
                }
              })
            );
            setTimeout(() => {
              socket.send(
                JSON.stringify({
                  type: 'task_assign',
                  data: {
                    taskId: 'echo-1',
                    nodeId: 'node-integration',
                    toolName: 'echo',
                    toolArgs: { text: 'hello' },
                    timeout: 1_000,
                    priority: 5
                  }
                })
              );
            }, 10);
            break;
          }
          case 'heartbeat': {
            socket.send(
              JSON.stringify({
                type: 'heartbeat_ack',
                data: {
                  success: true,
                  timestamp: Date.now()
                }
              })
            );
            break;
          }
          case 'task_result': {
            capturedResults.push({
              taskId: payload.data.taskId,
              success: payload.data.success,
              result: payload.data.result,
              error: payload.data.error
            });
            break;
          }
          case 'llm_request': {
            const requestId = payload.data.requestId;
            const nodeId = payload.data.nodeId;
            const timestamp = Date.now();
            socket.send(
              JSON.stringify({
                type: 'llm_response_stream',
                data: {
                  requestId,
                  nodeId,
                  chunk: 'hello',
                  done: false,
                  timestamp
                }
              })
            );
            socket.send(
              JSON.stringify({
                type: 'llm_response_stream',
                data: {
                  requestId,
                  nodeId,
                  chunk: '',
                  done: true,
                  timestamp: timestamp + 1
                }
              })
            );
            socket.send(
              JSON.stringify({
                type: 'llm_response',
                data: {
                  requestId,
                  nodeId,
                  success: true,
                  content: { text: 'hello world' },
                  usage: { tokens: 7 },
                  timestamp: timestamp + 2
                }
              })
            );
            break;
          }
          default: {
            break;
          }
        }
      });
    });

    const config: NodeAgentConfig = {
      hub: {
        url: `ws://127.0.0.1:${port}`
      },
      node: {
        id: 'node-integration',
        name: 'Integration Node',
        type: 'worker',
        capabilities: ['echo', 'wait'],
        tools: []
      },
      heartbeat: {
        intervalMs: 200
      },
      tasks: {
        maxConcurrent: 2,
        defaultTimeoutMs: 2_000
      },
      llm: {
        streamEnabled: true,
        localFallback: false,
        retry: {
          attempts: 0,
          delayMs: 100
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

    const context = await startRuntime(config, logger);

    await waitFor(() => capturedResults.length > 0);
    expect(capturedResults[0]).toMatchObject({ taskId: 'echo-1', success: true });

    const handle = context.llmProxy?.request({
      messages: [{ role: 'user', content: 'hello' }],
      stream: true
    });
    expect(handle).toBeDefined();

    const streamChunksPromise = (async () => {
      const chunks: string[] = [];
      if (handle?.stream) {
        for await (const chunk of handle.stream) {
          chunks.push(chunk);
        }
      }
      return chunks;
    })();

    const final = await handle?.final;
    const chunks = await streamChunksPromise;

    expect(chunks).toEqual(['hello']);
    expect(final?.content).toEqual({ text: 'hello world' });

    await shutdownContext(context);

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    hubSocket?.removeAllListeners();
  });
});
