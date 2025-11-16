import EventEmitter from 'eventemitter3';
import WebSocket from 'ws';
import { Logger } from 'winston';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export interface ConnectionManagerOptions {
  url: string;
  logger: Logger;
  headers?: Record<string, string>;
  reconnect?: {
    initialDelayMs?: number;
    maxDelayMs?: number;
    multiplier?: number;
  };
}

export interface ConnectionEvents {
  stateChange: (state: ConnectionState) => void;
  open: () => void;
  close: (code: number, reason: string) => void;
  error: (error: Error) => void;
  message: (payload: unknown) => void;
}

const DEFAULT_RECONNECT: Required<NonNullable<ConnectionManagerOptions['reconnect']>> = {
  initialDelayMs: 1000,
  maxDelayMs: 30_000,
  multiplier: 2
};

export class ConnectionManager extends EventEmitter<ConnectionEvents> {
  private readonly url: string;
  private readonly logger: Logger;
  private readonly headers?: Record<string, string>;
  private readonly reconnectConfig: Required<NonNullable<ConnectionManagerOptions['reconnect']>>;

  private socket: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private stopped = false;
  private outboundQueue: string[] = [];

  constructor(options: ConnectionManagerOptions) {
    super();
    this.url = options.url;
    this.logger = options.logger;
    this.headers = options.headers;
    this.reconnectConfig = {
      initialDelayMs: options.reconnect?.initialDelayMs ?? DEFAULT_RECONNECT.initialDelayMs,
      maxDelayMs: options.reconnect?.maxDelayMs ?? DEFAULT_RECONNECT.maxDelayMs,
      multiplier: options.reconnect?.multiplier ?? DEFAULT_RECONNECT.multiplier
    };
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.outboundQueue = [];
    return new Promise((resolve, reject) => {
      const handleOpen = () => {
        this.off('error', handleError);
        resolve();
      };
      const handleError = (error: Error) => {
        this.off('open', handleOpen);
        reject(error);
      };

      this.once('open', handleOpen);
      this.once('error', handleError);
      this.connect();
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.clearReconnectTimer();
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close(1000, 'Node agent shutdown');
    }
    this.setState('disconnected');
  }

  send(payload: unknown): void {
    const serialized = JSON.stringify(payload);
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(serialized);
    } else {
      this.outboundQueue.push(serialized);
    }
  }

  private connect(): void {
    if (this.stopped) {
      return;
    }

    this.setState('connecting');
    this.logger.info(`Connecting to Hub ${this.url}`);

    this.socket = new WebSocket(this.url, {
      headers: this.headers
    });

    this.socket.on('open', () => {
      this.logger.info('WebSocket connection established');
      this.reconnectAttempt = 0;
      this.setState('connected');
      this.emit('open');
      this.flushQueue();
    });

    this.socket.on('close', (code, reasonBuffer) => {
      const reason = reasonBuffer.toString();
      this.logger.warn(`WebSocket closed (code=${code}, reason=${reason || 'n/a'})`);
      this.setState('disconnected');
      this.emit('close', code, reason);
      if (!this.stopped) {
        this.scheduleReconnect();
      }
    });

    this.socket.on('error', (error) => {
      this.logger.error(`WebSocket error: ${error.message}`);
      this.emit('error', error);
    });

    this.socket.on('message', (data) => {
      this.handleMessage(data);
    });
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      if (typeof data === 'string') {
        this.emit('message', JSON.parse(data));
      } else if (Buffer.isBuffer(data)) {
        this.emit('message', JSON.parse(data.toString('utf8')));
      } else {
        this.logger.warn('Received non-text WebSocket message, ignoring');
      }
    } catch (error) {
      this.logger.error(`Failed to parse WebSocket message: ${(error as Error).message}`);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.stopped) {
      return;
    }
    this.reconnectAttempt += 1;
    const delay = Math.min(
      this.reconnectConfig.initialDelayMs *
        Math.pow(this.reconnectConfig.multiplier, this.reconnectAttempt - 1),
      this.reconnectConfig.maxDelayMs
    );

    this.logger.info(`Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempt})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private flushQueue(): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    while (this.outboundQueue.length > 0) {
      const serialized = this.outboundQueue.shift();
      if (serialized) {
        socket.send(serialized);
      }
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setState(next: ConnectionState): void {
    if (this.state !== next) {
      this.state = next;
      this.emit('stateChange', next);
    }
  }
}

