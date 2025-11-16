#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import { loadConfig } from './config/loader';
import { buildLogger } from './logger';
import { startRuntime } from './runtime';

const program = new Command();

program
  .name('node-agent')
  .description('Apex Bridge node agent runtime')
  .version('0.1.0');

program
  .command('start')
  .description('Start the node agent runtime')
  .option('-c, --config <path>', 'Path to the node agent config file')
  .option('--inspect', 'Print resolved configuration and exit', false)
  .action(async (options: { config?: string; inspect?: boolean }) => {
    try {
      const { config, sourcePath, warnings, maskedConfig } = await loadConfig({
        configPath: options.config
      });

      const logger = buildLogger({
        config: config.logging,
        metadata: { nodeName: config.node.name }
      });

      if (warnings.length > 0) {
        warnings.forEach((warning) => logger.warn(warning));
      }

      if (options.inspect) {
        logger.info('Resolved configuration (sensitive fields masked)', {
          sourcePath: path.relative(process.cwd(), sourcePath),
          config: maskedConfig
        });
        return;
      }

      logger.info('Loaded configuration', {
        sourcePath: path.relative(process.cwd(), sourcePath)
      });

      await startRuntime(config, logger);
    } catch (error) {
       
      console.error('Failed to start node agent:', (error as Error).message);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);

