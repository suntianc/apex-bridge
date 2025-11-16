import fs from 'fs';
import path from 'path';
import { Logger } from 'winston';
import { NodeAgentConfig } from '../config/types';
import { TaskOrchestrator } from '../tasks/TaskOrchestrator';
import { LLMProxy } from '../llm/LLMProxy';

export interface ToolPluginContext {
  orchestrator: TaskOrchestrator;
  logger: Logger;
  llmProxy?: LLMProxy;
  config: NodeAgentConfig;
}

type ToolPlugin = (context: ToolPluginContext) => void | Promise<void>;

function resolvePluginDirectory(config: NodeAgentConfig): string | null {
  const configuredDir = config.plugins?.toolDirectory;
  if (!configuredDir) {
    return null;
  }

  const resolved = path.resolve(process.cwd(), configuredDir);
  return resolved;
}

async function collectPluginFiles(directory: string, files: string[] = []): Promise<string[]> {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectPluginFiles(fullPath, files);
      continue;
    }

    if (/\.(cjs|js|mjs)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function resolvePlugin(moduleExport: unknown): ToolPlugin | null {
  if (!moduleExport) {
    return null;
  }

  if (typeof moduleExport === 'function') {
    return moduleExport as ToolPlugin;
  }

  if (
    typeof moduleExport === 'object' &&
    typeof (moduleExport as Record<string, unknown>).register === 'function'
  ) {
    return (moduleExport as { register: ToolPlugin }).register;
  }

  return null;
}

export async function loadToolPlugins(
  config: NodeAgentConfig,
  logger: Logger,
  orchestrator: TaskOrchestrator,
  llmProxy?: LLMProxy
): Promise<void> {
  const directory = resolvePluginDirectory(config);
  if (!directory) {
    logger.debug('No tool plugin directory configured; skipping plugin load.');
    return;
  }

  if (!fs.existsSync(directory)) {
    logger.warn('Tool plugin directory does not exist, skipping.', {
      directory
    });
    return;
  }

  let files: string[];
  try {
    files = await collectPluginFiles(directory);
  } catch (error) {
    logger.error('Failed to read tool plugin directory', {
      directory,
      error: (error as Error).message
    });
    return;
  }

  if (files.length === 0) {
    logger.info('Tool plugin directory is empty; no plugins loaded', {
      directory
    });
    return;
  }

  const context: ToolPluginContext = {
    orchestrator,
    logger,
    llmProxy,
    config
  };

  for (const file of files) {
    try {
       
      const moduleExport = require(file);
      const plugin = resolvePlugin(moduleExport);
      if (!plugin) {
        logger.warn('Tool plugin does not export a register function; skipping.', {
          file
        });
        continue;
      }
      await Promise.resolve(plugin(context));
      logger.info('Loaded tool plugin', { file });
    } catch (error) {
      logger.error('Failed to load tool plugin', {
        file,
        error: (error as Error).message
      });
    }
  }
}

