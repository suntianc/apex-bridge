import { jest } from '@jest/globals';
import { registerCompanionCapabilities } from 'src/capabilities/companion';
import type { TaskHandler } from 'src/tasks/types';
import type { LLMProxy } from 'src/llm/LLMProxy';
import { LLMProxyError } from 'src/llm/LLMProxy';
import { createTestLogger } from '../helpers';

class StubOrchestrator {
  public handlers = new Map<string, TaskHandler>();

  registerTool(name: string, handler: TaskHandler): void {
    this.handlers.set(name, handler);
  }
}

describe('Companion capabilities', () => {
  const logger = createTestLogger('error');

  const createAssignment = (overrides: Partial<Parameters<TaskHandler>[0]['assignment']> = {}) => ({
    taskId: overrides.taskId ?? 'task-1',
    nodeId: overrides.nodeId ?? 'node-1',
    toolName: 'companion_conversation',
    capability: overrides.capability,
    toolArgs: overrides.toolArgs ?? {
      conversationId: 'conv-1',
      messages: [{ role: 'user', content: 'Hello there' }]
    },
    timeout: overrides.timeout,
    priority: overrides.priority,
    metadata: overrides.metadata
  });

  it('returns error when LLM proxy is unavailable', async () => {
    const orchestrator = new StubOrchestrator();
    registerCompanionCapabilities(orchestrator as unknown as any, logger);

    const handler = orchestrator.handlers.get('companion_conversation');
    expect(handler).toBeDefined();

    const abortController = new AbortController();
    const result = await handler!({
      assignment: createAssignment(),
      logger,
      signal: abortController.signal
    } as any);

    expect(result.success).toBe(false);
    expect(result.error).toMatchObject({ code: 'llm_proxy_unavailable' });
  });

  it('invokes LLM proxy and returns final reply', async () => {
    const orchestrator = new StubOrchestrator();
    const mockHandle = {
      requestId: 'req-1',
      final: Promise.resolve({ requestId: 'req-1', content: { text: 'hi human' }, usage: { tokens: 10 } }),
      cancel: jest.fn()
    };
    let capturedOptions: any;
    const mockProxy: Pick<LLMProxy, 'request'> = {
      request: jest.fn((options) => {
        capturedOptions = options;
        return mockHandle as any;
      })
    };

    registerCompanionCapabilities(orchestrator as unknown as any, logger, mockProxy as LLMProxy);

    const handler = orchestrator.handlers.get('companion_conversation')!;
    const abortController = new AbortController();

    const assignment = createAssignment({
      toolArgs: {
        conversationId: 'conv-9',
        prompt: 'You are a friendly assistant',
        llm: { model: 'gpt-test', temperature: 0.2, stream: false },
        messages: [{ role: 'user', content: 'Ping?' }]
      }
    });

    const result = await handler({ assignment, logger, signal: abortController.signal } as any);

    expect(mockProxy.request).toHaveBeenCalledTimes(1);
    expect(capturedOptions.stream).toBe(false);
    const requestMessages = capturedOptions.messages;
    expect(requestMessages[0]).toMatchObject({ role: 'system' });
    expect(requestMessages[1]).toMatchObject({ role: 'user', content: 'Ping?' });
    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({
      conversationId: 'conv-9',
      reply: { text: 'hi human' },
      partialOutputs: []
    });
  });

  it('streams partial outputs and collects them in result', async () => {
    const orchestrator = new StubOrchestrator();
    let capturedOptions: any;
    let resolveFinal: (value: any) => void;
    const finalPromise = new Promise((resolve) => {
      resolveFinal = resolve;
    });
    const mockHandle = {
      requestId: 'req-stream',
      final: finalPromise,
      cancel: jest.fn()
    };
    const mockProxy: Pick<LLMProxy, 'request'> = {
      request: jest.fn((options) => {
        capturedOptions = options;
        return mockHandle as any;
      })
    };

    registerCompanionCapabilities(orchestrator as unknown as any, logger, mockProxy as LLMProxy);
    const handler = orchestrator.handlers.get('companion_conversation')!;
    const abortController = new AbortController();

    const execution = handler({
      assignment: createAssignment({
        toolArgs: {
          conversationId: 'conv-stream',
          messages: [{ role: 'user', content: 'Stream it' }],
          llm: { stream: true }
        }
      }),
      logger,
      signal: abortController.signal
    } as any);

    // Simulate streaming chunks
    capturedOptions.onStreamChunk?.({
      requestId: 'req-stream',
      nodeId: 'node-1',
      chunk: 'hello',
      done: false,
      timestamp: Date.now()
    });
    capturedOptions.onStreamChunk?.({
      requestId: 'req-stream',
      nodeId: 'node-1',
      chunk: ' world',
      done: false,
      timestamp: Date.now()
    });

    resolveFinal!({ requestId: 'req-stream', content: { text: 'hello world' }, usage: { tokens: 20 } });

    const result = await execution;

    expect(mockProxy.request).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({
      conversationId: 'conv-stream',
      reply: { text: 'hello world' }
    });
    expect(result.result?.partialOutputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ chunk: 'hello' }),
      expect.objectContaining({ chunk: ' world' })
    ]));
  });

  it('cancels conversation when abort signal triggers', async () => {
    const orchestrator = new StubOrchestrator();
    let resolveFinal: (value: any) => void;
    const finalPromise = new Promise((resolve) => {
      resolveFinal = resolve;
    });
    const mockHandle = {
      requestId: 'req-2',
      final: finalPromise,
      cancel: jest.fn()
    };
    const mockProxy: Pick<LLMProxy, 'request'> = {
      request: jest.fn(() => mockHandle as any)
    };

    registerCompanionCapabilities(orchestrator as unknown as any, logger, mockProxy as LLMProxy);
    const handler = orchestrator.handlers.get('companion_conversation')!;
    const abortController = new AbortController();

    const promise = handler({
      assignment: createAssignment(),
      logger,
      signal: abortController.signal
    } as any);

    abortController.abort();
    resolveFinal!({ requestId: 'req-2', content: { text: 'late reply' }, usage: { tokens: 3 } });

    const result = await promise;

    expect(mockHandle.cancel).toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toMatchObject({ code: 'task_cancelled' });
  });

  it('returns degraded success when quota limited and fallback provided', async () => {
    const orchestrator = new StubOrchestrator();
    const proxyError = new LLMProxyError('rate_limit_exceeded', 'Too many requests', { retryAfter: 10 });
    const rejectedPromise = Promise.reject(proxyError);
    // Prevent unhandled rejection warning
    rejectedPromise.catch(() => {});
    const mockProxy: Pick<LLMProxy, 'request'> = {
      request: jest.fn(() => {
        return {
          requestId: 'req-limit',
          final: rejectedPromise,
          cancel: jest.fn()
        } as any;
      })
    };

    registerCompanionCapabilities(orchestrator as unknown as any, logger, mockProxy as LLMProxy);
    const handler = orchestrator.handlers.get('companion_conversation')!;

    const result = await handler({
      assignment: createAssignment({
        toolArgs: {
          conversationId: 'conv-limit',
          messages: [{ role: 'user', content: 'Hi' }],
          metadata: { fallbackReply: '当前限流，请稍后再试。' }
        }
      }),
      logger,
      signal: new AbortController().signal
    } as any);

    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({
      conversationId: 'conv-limit',
      degraded: true,
      reply: { text: '当前限流，请稍后再试。' }
    });
  });
});
