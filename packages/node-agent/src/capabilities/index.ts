import { Logger } from 'winston';
import { NodeAgentConfig } from '../config/types';
import { TaskOrchestrator } from '../tasks/TaskOrchestrator';
import { registerWorkerCapabilities } from './worker';
import { registerCompanionCapabilities } from './companion';
import { LLMProxy } from '../llm/LLMProxy';
import { loadToolPlugins } from '../plugins/toolPluginLoader';

export async function registerDefaultCapabilities(
  orchestrator: TaskOrchestrator,
  config: NodeAgentConfig,
  logger: Logger,
  llmProxy?: LLMProxy
): Promise<void> {
  if (config.node.type === 'worker') {
    registerWorkerCapabilities(orchestrator, logger, llmProxy);
  } else if (config.node.type === 'companion') {
    registerCompanionCapabilities(orchestrator, logger, llmProxy);
  }

  await loadToolPlugins(config, logger, orchestrator, llmProxy);
}

