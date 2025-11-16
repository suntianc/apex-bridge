import { createLogger, format, transports, Logger } from 'winston';
import { NodeAgentConfig } from './config/types';

export interface LoggerOptions {
  config: NodeAgentConfig['logging'];
  metadata?: Record<string, unknown>;
}

export function buildLogger(options: LoggerOptions): Logger {
  const { config, metadata } = options;
  const baseFormat =
    config.format === 'pretty'
      ? format.combine(
          format.colorize({ all: true }),
          format.timestamp(),
          format.printf(({ level, message, timestamp, ...rest }) => {
            const meta = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
            return `${timestamp} [${level}] ${message}${meta}`;
          })
        )
      : format.combine(format.timestamp(), format.json());

  return createLogger({
    level: config.level,
    defaultMeta: {
      component: 'node-agent',
      ...metadata
    },
    format: baseFormat,
    transports: [new transports.Console()]
  });
}

