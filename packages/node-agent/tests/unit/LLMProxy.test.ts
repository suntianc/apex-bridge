import { jest } from '@jest/globals';
import EventEmitter from 'eventemitter3';
import { LLMProxy, LLMProxyError } from 'src/llm/LLMProxy';
import type { ProtocolClient } from 'src/protocol/ProtocolClient';
import type { LLMResponseMessage, LLMResponseStreamMessage } from 'src/protocol/types';
import { createTestLogger } from '../helpers';

class MockProtocol extends EventEmitter<{
  llmStream: [LLMResponseStreamMessage['data']];
  llmResponse: [LLMResponseMessage['data']];
  message: [unknown];
}> {
  public sendLLMRequest = jest.fn();
  public sendTaskResult = jest.fn();
  public send = jest.fn();
  public start = jest.fn(async () => {});
  public stop = jest.fn(async () => {});
  public getNodeId = jest.fn(() => 'node-1');
}

describe('LLMProxy', () => {
  const logger = createTestLogger('error');

  it('resolves final promise when llm_response success arrives', async () => {
    const mockProtocol = new MockProtocol();
    const protocol = mockProtocol as unknown as ProtocolClient;
    const proxy = new LLMProxy(protocol, logger);

    const handle = proxy.request({
      messages: [{ role: 'user', content: 'hello' }]
    });

    const requestPayload = mockProtocol.sendLLMRequest.mock.calls[0][0];
    expect(requestPayload.messages[0].content).toBe('hello');
    expect(requestPayload.options?.stream).toBe(false);

    mockProtocol.emit('llmResponse', {
      requestId: requestPayload.requestId,
      nodeId: 'node-1',
      success: true,
      content: { text: 'hi' },
      usage: { tokens: 5 },
      timestamp: Date.now()
    });

    const result = await handle.final;
    expect(result.content).toEqual({ text: 'hi' });
  });

  it('streams chunks before final response', async () => {
    const mockProtocol = new MockProtocol();
    const protocol = mockProtocol as unknown as ProtocolClient;
    const proxy = new LLMProxy(protocol, logger);

    const handle = proxy.request({
      messages: [{ role: 'user', content: 'say hi' }],
      stream: true
    });

    const requestPayload = mockProtocol.sendLLMRequest.mock.calls[0][0];

    const chunkPromise = (async () => {
      const chunks: string[] = [];
      if (!handle.stream) {
        return chunks;
      }
      for await (const chunk of handle.stream) {
        chunks.push(chunk);
      }
      return chunks;
    })();

    mockProtocol.emit('llmStream', {
      requestId: requestPayload.requestId,
      nodeId: 'node-1',
      chunk: 'part-1',
      done: false,
      timestamp: Date.now()
    });
    mockProtocol.emit('llmStream', {
      requestId: requestPayload.requestId,
      nodeId: 'node-1',
      chunk: '',
      done: true,
      timestamp: Date.now()
    });

    mockProtocol.emit('llmResponse', {
      requestId: requestPayload.requestId,
      nodeId: 'node-1',
      success: true,
      content: { text: 'done' },
      usage: undefined,
      timestamp: Date.now()
    });

    const [chunks, final] = await Promise.all([chunkPromise, handle.final]);
    expect(chunks).toEqual(['part-1']);
    expect(final.content).toEqual({ text: 'done' });
  });

  it('invokes onStreamChunk callback when provided', async () => {
    const mockProtocol = new MockProtocol();
    const protocol = mockProtocol as unknown as ProtocolClient;
    const proxy = new LLMProxy(protocol, logger);
    const chunkListener = jest.fn();

    const handle = proxy.request({
      messages: [{ role: 'user', content: 'stream me' }],
      stream: true,
      onStreamChunk: chunkListener
    });

    const requestPayload = mockProtocol.sendLLMRequest.mock.calls[0][0];

    mockProtocol.emit('llmStream', {
      requestId: requestPayload.requestId,
      nodeId: 'node-1',
      chunk: 'stream-1',
      done: false,
      timestamp: Date.now()
    });

    mockProtocol.emit('llmResponse', {
      requestId: requestPayload.requestId,
      nodeId: 'node-1',
      success: true,
      content: { text: 'done' },
      usage: undefined,
      timestamp: Date.now()
    });

    await handle.final;
    expect(chunkListener).toHaveBeenCalled();
    expect(chunkListener).toHaveBeenCalledWith(expect.objectContaining({ chunk: 'stream-1' }));
  });

  it('rejects when hub reports failure', async () => {
    const mockProtocol = new MockProtocol();
    const protocol = mockProtocol as unknown as ProtocolClient;
    const proxy = new LLMProxy(protocol, logger);

    const handle = proxy.request({ messages: [{ role: 'user', content: 'fail' }] });
    const requestPayload = mockProtocol.sendLLMRequest.mock.calls[0][0];

    const rejection = expect(handle.final).rejects.toThrow(LLMProxyError);

    mockProtocol.emit('llmResponse', {
      requestId: requestPayload.requestId,
      nodeId: 'node-1',
      success: false,
      error: { code: 'rate_limit', message: 'Too many requests' },
      timestamp: Date.now()
    });

    await rejection;
  });

  it('cancels request and emits error', async () => {
    const mockProtocol = new MockProtocol();
    const protocol = mockProtocol as unknown as ProtocolClient;
    const proxy = new LLMProxy(protocol, logger);

    const handle = proxy.request({ messages: [{ role: 'user', content: 'cancel' }], stream: true });

    const errorListener = jest.fn();
    proxy.on('error', errorListener);

    handle.cancel();

    await expect(handle.final).rejects.toThrow('LLM request was cancelled by client');
    expect(errorListener).toHaveBeenCalled();
  });
});
