/**
 * ApexBridge - ABPLog WebSocket通道（ABP-only）
 * 处理 /ABPlog 端点的连接和消息推送
 */

import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { VCPLogMessage } from '../../../types';
import { logger } from '../../../utils/logger';

export class ABPLogChannel {
  readonly name = 'ABPLog';
  readonly pathPattern = /^\/(?:ABPlog|log)\/ABP_Key=(.+)$/;
  readonly clientType: 'ABPLog' = 'ABPLog';

  private clients: Set<WebSocket> = new Set();
  private clientIdCounter: number = 0;

  private stats = {
    totalMessagesReceived: 0,
    totalMessagesSent: 0,
    lastActivity: new Date(),
  };

  async handleConnection(
    ws: WebSocket,
    _connectionKey: string,
    _request: IncomingMessage
  ): Promise<void> {
    const clientId = `abplog-${++this.clientIdCounter}-${Date.now()}`;
    logger.info(`📡 New ABPLog client connecting: ${clientId}`);

    this.clients.add(ws);
    (ws as any).clientId = clientId;

    ws.on('close', () => {
      this.handleClose(ws);
    });
    ws.on('error', (error) => {
      this.handleError(ws, error as any);
    });

    this.sendToClient(ws, {
      type: 'connection_ack',
      data: {
        message: 'Connected to ApexBridge ABPLog',
        timestamp: Date.now(),
      },
    });

    logger.info(`✅ ABPLog client ${clientId} connected (total: ${this.clients.size})`);
  }

  async handleMessage(ws: WebSocket, message: any): Promise<void> {
    this.stats.totalMessagesReceived++;
    this.stats.lastActivity = new Date();
    const { type } = message || {};
    logger.debug(`[ABPLog] Message received: ${type || 'unknown'}`);
  }

  handleClose(ws: WebSocket): void {
    const clientId = (ws as any).clientId || 'unknown';
    this.clients.delete(ws);
    logger.info(`🔌 ABPLog client ${clientId} disconnected (remaining: ${this.clients.size})`);
  }

  handleError(ws: WebSocket, error: Error): void {
    const clientId = (ws as any).clientId || 'unknown';
    logger.error(`[ABPLog] Error on connection ${clientId}:`, error.message);
  }

  broadcast(message: any): void {
    if (this.clients.size === 0) {
      logger.debug('ℹ️  No ABPLog clients to broadcast to');
      return;
    }
    const data = JSON.stringify(message);
    let successCount = 0;
    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data);
          successCount++;
          this.stats.totalMessagesSent++;
        } catch (error: any) {
          logger.error('❌ Failed to broadcast to ABPLog client:', error);
        }
      }
    });
    this.stats.lastActivity = new Date();
    if (successCount > 0) {
      logger.debug(`📡 Broadcasted to ${successCount}/${this.clients.size} ABPLog clients`);
    }
  }

  pushToolResult(plugin: string, result: any): void {
    this.broadcast({
      type: 'tool_result',
      data: { plugin, result, timestamp: Date.now() },
    });
    logger.info(`📬 Pushed tool result to ABPLog: ${plugin}`);
  }

  pushToolError(plugin: string, error: string): void {
    this.broadcast({
      type: 'tool_error',
      data: { plugin, error, timestamp: Date.now() },
    });
    logger.warn(`📬 Pushed tool error to ABPLog: ${plugin}`);
  }

  pushToolLog(data: {
    status: 'executing' | 'success' | 'error' | 'interrupted';
    tool: string;
    content: string;
    source?: string;
    metadata?: Record<string, any>;
  }): void {
    const logData: VCPLogMessage = {
      type: 'abp_log',
      data: {
        log_type: 'tool_log',
        tool_name: data.tool,
        content: data.content,
        status: data.status,
        source: data.source || 'server',
        timestamp: new Date().toISOString(),
        ...(data.metadata || {}),
      },
    };
    this.broadcast(logData);
    this.stats.totalMessagesSent++;
    this.stats.lastActivity = new Date();
    logger.debug(`📬 Pushed tool log to ABPLog: ${data.tool} (${data.status})`);
  }

  pushNotification(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    this.broadcast({
      type: 'notification',
      data: { message, level, timestamp: Date.now() },
    });
  }

  pushLog(log: string): void {
    this.broadcast({
      type: 'abp_log',
      data: { log, timestamp: Date.now() },
    });
  }

  getConnectedClients(): number {
    return this.clients.size;
  }

  getStats(): any {
    return {
      name: this.name,
      connectedClients: this.clients.size,
      totalMessagesReceived: this.stats.totalMessagesReceived,
      totalMessagesSent: this.stats.totalMessagesSent,
      lastActivity: this.stats.lastActivity,
    };
  }

  async shutdown(): Promise<void> {
    logger.info(`🛑 Closing ${this.clients.size} ABPLog client connections...`);
    const closePromises: Promise<void>[] = [];
    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        closePromises.push(
          new Promise((resolve) => {
            ws.once('close', () => resolve());
            ws.close();
          })
        );
      }
    });
    await Promise.all(closePromises);
    this.clients.clear();
    logger.info('✅ All ABPLog client connections closed');
  }
}


