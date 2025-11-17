import { Logger } from 'winston';
import { NodeAgentConfig } from '../config/types';
import { TaskOrchestrator } from '../tasks/TaskOrchestrator';
import { registerWorkerCapabilities } from './worker';
import { registerCompanionCapabilities } from './companion';
import { LLMProxy } from '../llm/LLMProxy';
import { SkillsLoader } from '../skills/SkillsLoader';
import { NodeSkillsExecutor } from '../skills/NodeSkillsExecutor';

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

  // Load and register Skills
  await loadAndRegisterSkills(orchestrator, config, logger);
}

async function loadAndRegisterSkills(
  orchestrator: TaskOrchestrator,
  config: NodeAgentConfig,
  logger: Logger
): Promise<void> {
  const skillsDirectory = config.skills?.directory || 'skills';
  const loader = new SkillsLoader({
    directory: skillsDirectory,
    logger
  });

  const skills = await loader.loadAll();
  
  if (skills.length === 0) {
    logger.info('No skills loaded');
    return;
  }

  const executor = new NodeSkillsExecutor({ logger });

  for (const skill of skills) {
    const handler = executor.createHandler(skill);
    orchestrator.registerTool(skill.name, handler);
    logger.info(`Registered skill: ${skill.name}`, {
      skillPath: skill.skillPath,
      executePath: skill.executePath
    });
  }

  logger.info(`Registered ${skills.length} skill(s) from ${skillsDirectory}`);
}

