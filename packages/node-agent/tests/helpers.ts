import { createLogger, format, transports } from 'winston';
import type { Logger } from 'winston';

export function createTestLogger(level: 'error' | 'warn' | 'info' | 'debug' = 'error'): Logger {
  return createLogger({
    level,
    format: format.combine(format.timestamp(), format.simple()),
    transports: [
      new transports.Console({
        silent: true
      })
    ]
  });
}

export async function waitFor<T>(
  condition: () => T | Promise<T>,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<Awaited<T>> {
  const timeoutMs = options.timeoutMs ?? 2_000;
  const intervalMs = options.intervalMs ?? 25;
  const start = Date.now();

  while (true) {
    const result = await condition();
    if (result) {
      return result;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timeout exceeded');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
