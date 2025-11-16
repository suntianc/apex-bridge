import http from 'http';
import os from 'os';
import { Logger } from 'winston';
import { ConnectionState } from '../connection/ConnectionManager';
import { TaskOrchestratorStats } from '../tasks/types';

export interface TelemetryServiceOptions {
  port: number;
  logger: Logger;
  nodeName: string;
}

interface TelemetrySnapshot {
    status: 'ok' | 'degraded' | 'critical';
    uptimeMs: number;
    node: {
      name: string;
      id?: string;
    };
    connection: {
      state: ConnectionState;
      lastHeartbeatAck?: number;
    };
    tasks: TaskOrchestratorStats;
    warnings: string[];
    timestamp: number;
    host: {
      hostname: string;
      platform: NodeJS.Platform;
      arch: string;
      loadAvg: number[];
      memory: {
        total: number;
        free: number;
      };
    };
}

export class TelemetryService {
  private readonly port: number;
  private readonly logger: Logger;
  private readonly nodeName: string;

  private server: http.Server | null = null;
  private startedAt = Date.now();
  private connectionState: ConnectionState = 'disconnected';
  private lastHeartbeatAck?: number;
  private nodeId?: string;
  private taskStats: TaskOrchestratorStats = {
    activeTasks: 0,
    queuedTasks: 0,
    totalCompleted: 0,
    totalFailed: 0
  };
  private warnings: string[] = [];

  constructor(options: TelemetryServiceOptions) {
    this.port = options.port;
    this.logger = options.logger.child({ component: 'TelemetryService' });
    this.nodeName = options.nodeName;
  }

  start(): void {
    if (this.server) {
      return;
    }

    this.server = http.createServer((req, res) => {
      if (!req.url) {
        res.writeHead(400);
        res.end('Bad Request');
        return;
      }

      if (req.url === '/healthz') {
        const snapshot = this.buildSnapshot();
        res.writeHead(snapshot.status === 'ok' ? 200 : snapshot.status === 'degraded' ? 503 : 500, {
          'Content-Type': 'application/json'
        });
        res.end(JSON.stringify(snapshot));
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    this.server.listen(this.port, () => {
      this.logger.info(`Telemetry service listening on http://0.0.0.0:${this.port}/healthz`);
    });

    this.server.on('error', (error) => {
      this.logger.error(`Telemetry server error: ${(error as Error).message}`);
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve());
    });
    this.server = null;
    this.logger.info('Telemetry service stopped');
  }

  setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
  }

  recordHeartbeatAck(timestamp: number): void {
    this.lastHeartbeatAck = timestamp;
  }

  setNodeId(nodeId: string): void {
    this.nodeId = nodeId;
  }

  updateTaskStats(stats: TaskOrchestratorStats): void {
    this.taskStats = stats;
  }

  addWarning(message: string): void {
    this.warnings.push(message);
  }

  clearWarnings(): void {
    this.warnings.length = 0;
  }

  private buildSnapshot(): TelemetrySnapshot {
    const now = Date.now();
    const heartbeatAge = this.lastHeartbeatAck ? now - this.lastHeartbeatAck : undefined;
    let status: TelemetrySnapshot['status'] = 'ok';

    if (this.connectionState === 'disconnected') {
      status = 'critical';
    } else if (
      this.connectionState === 'connecting' ||
      (heartbeatAge !== undefined && heartbeatAge > 90_000) ||
      this.warnings.length > 0
    ) {
      status = 'degraded';
    }

    return {
      status,
      uptimeMs: now - this.startedAt,
      node: {
        name: this.nodeName,
        id: this.nodeId
      },
      connection: {
        state: this.connectionState,
        lastHeartbeatAck: this.lastHeartbeatAck
      },
      tasks: this.taskStats,
      warnings: [...this.warnings],
      timestamp: now,
      host: {
        hostname: os.hostname(),
        platform: process.platform,
        arch: process.arch,
        loadAvg: os.loadavg(),
        memory: {
          total: os.totalmem(),
          free: os.freemem()
        }
      }
    };
  }
}

