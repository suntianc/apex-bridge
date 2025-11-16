import { NodeAgentConfig } from './config/types';
import { Logger } from 'winston';
import { ConnectionManager } from './connection/ConnectionManager';
import { ProtocolClient } from './protocol/ProtocolClient';
import { TaskOrchestrator } from './tasks/TaskOrchestrator';
import { TaskAssignment } from './tasks/types';
import { TelemetryService } from './telemetry/TelemetryService';
import { registerDefaultCapabilities } from './capabilities';
import { LLMProxy } from './llm/LLMProxy';

export interface RuntimeContext {
  config: NodeAgentConfig;
  logger: Logger;
  shuttingDown: boolean;
  connection?: ConnectionManager;
  protocol?: ProtocolClient;
  orchestrator?: TaskOrchestrator;
  telemetry?: TelemetryService;
  llmProxy?: LLMProxy;
}

export async function startRuntime(config: NodeAgentConfig, logger: Logger): Promise<RuntimeContext> {
  const context: RuntimeContext = {
    config,
    logger,
    shuttingDown: false
  };

  logger.info('Node agent runtime initialising', {
    nodeName: config.node.name,
    nodeType: config.node.type,
    capabilities: config.node.capabilities,
    tools: config.node.tools
  });

  setupSignalHandlers(context);

  const connection = new ConnectionManager({
    url: config.hub.url,
    headers: (config.hub as any).apiKey
      ? {
          Authorization: `Bearer ${(config.hub as any).apiKey}`
        }
      : undefined,
    logger
  });

  let orchestrator: TaskOrchestrator | undefined;
  let telemetry: TelemetryService | undefined;

  if (config.telemetry.enabled) {
    telemetry = new TelemetryService({
      port: config.telemetry.port,
      logger,
      nodeName: config.node.name
    });
    telemetry.start();
    context.telemetry = telemetry;
  }

  const protocol = new ProtocolClient({
    config,
    connection,
    logger,
    statsProvider: () => {
      const stats = orchestrator?.getStats();
      return {
        activeTasks: stats?.activeTasks ?? 0,
        totalTasks: (stats?.totalCompleted ?? 0) + (stats?.totalFailed ?? 0),
        completedTasks: stats?.totalCompleted ?? 0,
        failedTasks: stats?.totalFailed ?? 0,
        averageResponseTime: undefined,
        lastTaskAt: undefined
      };
    }
  });

  orchestrator = new TaskOrchestrator({
    logger,
    maxConcurrent: config.tasks.maxConcurrent,
    defaultTimeoutMs: config.tasks.defaultTimeoutMs,
    sendResult: (message) => protocol.sendTaskResult(message),
    getNodeId: () => protocol.getNodeId(),
    onStatsChange: (stats) => telemetry?.updateTaskStats(stats)
  });

  const llmProxy = new LLMProxy(protocol, logger);

  context.connection = connection;
  context.protocol = protocol;
  context.orchestrator = orchestrator;
  context.telemetry = telemetry;
  context.llmProxy = llmProxy;

  await registerDefaultCapabilities(orchestrator, config, logger, llmProxy);

  if (telemetry) {
    llmProxy.on('error', (error) => {
      telemetry.addWarning(`LLM error (${error.code}): ${error.message}`);
    });
  }

  protocol.on('taskAssign', (assignment) => {
    const task: TaskAssignment = {
      taskId: assignment.taskId,
      nodeId: assignment.nodeId,
      toolName: assignment.toolName,
      capability: assignment.capability,
      toolArgs: assignment.toolArgs ?? {},
      timeout: assignment.timeout,
      priority: assignment.priority,
      metadata: assignment.metadata
    };
    orchestrator?.handleAssignment(task);
  });

  connection.on('stateChange', (state) => {
    telemetry?.setConnectionState(state);
  });

  protocol.on('registered', (nodeId) => {
    telemetry?.setNodeId(nodeId);
    telemetry?.clearWarnings();
  });

  protocol.on('registrationFailed', (reason) => {
    telemetry?.addWarning(`Registration failed: ${reason}`);
  });

  protocol.on('heartbeatAck', () => {
    telemetry?.recordHeartbeatAck(Date.now());
  });

  try {
    await protocol.start();
    logger.info('Runtime bootstrap complete. Connected to Hub.');
    return context;
  } catch (error) {
    logger.error(`Failed to connect to Hub: ${(error as Error).message}`);
    await shutdownContext(context);
    throw error;
  }
}

export async function ensureRuntimeContext(config: NodeAgentConfig, logger: Logger): Promise<RuntimeContext> {
  return startRuntime(config, logger);
}

export async function shutdownContext(context: RuntimeContext): Promise<void> {
  const { logger } = context;
  try {
    if (context.protocol) {
      await context.protocol.stop();
    }
    if (context.orchestrator) {
      await context.orchestrator.stop();
    }
    if (context.llmProxy) {
      context.llmProxy.shutdown();
    }
    if (context.telemetry) {
      await context.telemetry.stop();
    }
    if (context.connection) {
      await context.connection.stop();
    }
  } catch (error) {
    logger.error(`Error during shutdown: ${(error as Error).message}`);
  }
}

function setupSignalHandlers(context: RuntimeContext): void {
  const { logger } = context;
  const shutdown = (signal: NodeJS.Signals) => {
    if (context.shuttingDown) {
      return;
    }
    context.shuttingDown = true;
    logger.info(`Received ${signal}, shutting down node agent...`);

    Promise.resolve()
      .then(async () => {
        await shutdownContext(context);
      })
      .catch((error) => {
        logger.error(`Error during shutdown: ${(error as Error).message}`);
      })
      .finally(() => {
        logger.info('Shutdown complete, goodbye.');
      });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

