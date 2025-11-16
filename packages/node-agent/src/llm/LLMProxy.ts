import { randomUUID } from 'crypto';
import EventEmitter from 'eventemitter3';
import { Logger } from 'winston';
import { ProtocolClient } from '../protocol/ProtocolClient';
import {
  LLMMessage,
  LLMRequestMessage,
  LLMResponseMessage,
  LLMResponseStreamMessage
} from '../protocol/types';

export interface LLMRequestOptions {
  model?: string;
  messages: LLMMessage[];
  options?: Record<string, unknown>;
  stream?: boolean;
  requestId?: string;
  onStreamChunk?: (chunk: LLMResponseStreamMessage['data']) => void;
}

export interface LLMProxySuccess {
  requestId: string;
  content?: unknown;
  usage?: unknown;
}

export class LLMProxyError extends Error {
  constructor(public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'LLMProxyError';
  }
}

interface PendingRequest {
  resolve: (value: LLMProxySuccess) => void;
  reject: (reason: Error) => void;
  stream?: StreamBuffer;
  cancelled: boolean;
  onChunk?: (chunk: LLMResponseStreamMessage['data']) => void;
}

class StreamBuffer implements AsyncIterable<string> {
  private queue: (string | null)[] = [];
  private resolvers: Array<(result: IteratorResult<string>) => void> = [];
  private error: Error | null = null;

  push(chunk: string): void {
    if (this.error) return;
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift();
      resolve?.({ value: chunk, done: false });
    } else {
      this.queue.push(chunk);
    }
  }

  close(): void {
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift();
      resolve?.({ value: undefined as never, done: true });
    } else {
      this.queue.push(null);
    }
  }

  throw(error: Error): void {
    this.error = error;
    while (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift();
      resolve?.({ value: undefined as never, done: true });
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<string> {
    while (true) {
      if (this.error) {
        throw this.error;
      }

      if (this.queue.length > 0) {
        const chunk = this.queue.shift();
        if (chunk === null) {
          return;
        }
        if (typeof chunk !== 'string') {
          continue;
        }
        yield chunk;
        continue;
      }

      const chunk = await new Promise<IteratorResult<string>>((resolve) => {
        this.resolvers.push(resolve);
      });

      if (chunk.done) {
        return;
      }

      yield chunk.value;
    }
  }
}

export interface LLMRequestHandle {
  requestId: string;
  final: Promise<LLMProxySuccess>;
  stream?: AsyncIterable<string>;
  cancel(): void;
}

export class LLMProxy extends EventEmitter<{ error: [LLMProxyError] }> {
  private readonly protocol: ProtocolClient;
  private readonly logger: Logger;
  private readonly pending = new Map<string, PendingRequest>();

  constructor(protocol: ProtocolClient, logger: Logger) {
    super();
    this.protocol = protocol;
    this.logger = logger.child({ component: 'LLMProxy' });
    this.bindProtocolEvents();
  }

  shutdown(): void {
    this.pending.clear();
    this.removeAllListeners();
  }

  request(options: LLMRequestOptions): LLMRequestHandle {
    const requestId = options.requestId ?? randomUUID();

    const streamBuffer = options.stream ? new StreamBuffer() : undefined;
    let cancelCalled = false;

    const finalPromise = new Promise<LLMProxySuccess>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve,
        reject,
        stream: streamBuffer,
        cancelled: false,
        onChunk: options.onStreamChunk
      });
    });

    const nodeId = this.protocol.getNodeId();
    if (!nodeId) {
      const error = new LLMProxyError('node_not_registered', 'Node is not registered yet');
      this.completeWithError(requestId, error);
    } else {
      const payload: LLMRequestMessage['data'] = {
        requestId,
        nodeId,
        model: options.model,
        messages: options.messages,
        options: {
          ...options.options,
          stream: options.stream ?? false
        }
      };
      this.protocol.sendLLMRequest(payload);
      this.logger.debug('LLM request sent', { requestId, model: options.model, stream: options.stream });
    }

    const handle: LLMRequestHandle = {
      requestId,
      final: finalPromise,
      stream: streamBuffer ? streamBuffer : undefined,
      cancel: () => {
        if (cancelCalled) return;
        cancelCalled = true;
        const pending = this.pending.get(requestId);
        if (pending) {
          pending.cancelled = true;
          const error = new LLMProxyError('request_cancelled', 'LLM request was cancelled by client');
          this.completeWithError(requestId, error);
        }
      }
    };

    return handle;
  }

  private bindProtocolEvents(): void {
    this.protocol.on('llmStream', (chunk) => {
      const pending = this.pending.get(chunk.requestId);
      if (!pending) {
        this.logger.warn('Received llm_response_stream for unknown request', { requestId: chunk.requestId });
        return;
      }
      if (pending.stream) {
        if (chunk.chunk) {
          pending.stream.push(chunk.chunk);
        }
        if (chunk.done) {
          pending.stream.close();
        }
      }
      pending.onChunk?.(chunk);
    });

    this.protocol.on('llmResponse', (response) => {
      const pending = this.pending.get(response.requestId);
      if (!pending) {
        this.logger.warn('Received llm_response for unknown request', { requestId: response.requestId });
        return;
      }

      if (!response.success) {
        const error = new LLMProxyError(
          response.error?.code ?? 'llm_request_failed',
          response.error?.message ?? 'LLM request failed',
          response.error?.details
        );
        this.completeWithError(response.requestId, error);
        return;
      }

      pending.stream?.close();
      pending.onChunk?.({
        requestId: response.requestId,
        nodeId: response.nodeId,
        chunk: '',
        done: true,
        usage: response.usage,
        timestamp: response.timestamp
      });
      pending.resolve({
        requestId: response.requestId,
        content: response.content,
        usage: response.usage
      });
      this.pending.delete(response.requestId);
    });

    this.protocol.on('message', (payload) => {
      if (payload.type === 'llm_proxy_rate_limited' && typeof payload.data === 'object' && payload.data) {
        const data = payload.data as Record<string, unknown>;
        const requestId = String(data.requestId ?? '');
        const error = new LLMProxyError(
          String(data.code ?? 'rate_limit_exceeded'),
          String(data.message ?? 'LLM rate limit exceeded'),
          data
        );
        if (requestId && this.pending.has(requestId)) {
          this.completeWithError(requestId, error);
        } else {
          this.emit('error', error);
        }
      }
    });
  }

  private completeWithError(requestId: string, error: LLMProxyError): void {
    const pending = this.pending.get(requestId);
    if (!pending) {
      this.emit('error', error);
      return;
    }

    this.pending.delete(requestId);
    pending.stream?.throw(error);
    pending.reject(error);
    this.emit('error', error);
    pending.onChunk?.({
      requestId,
      nodeId: this.protocol.getNodeId() ?? '',
      chunk: '',
      done: true,
      timestamp: Date.now()
    });
  }
}
