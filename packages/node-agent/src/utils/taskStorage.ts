import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from 'winston';

const runtimeDir = path.resolve(process.cwd(), 'runtime-data');

interface CalendarTaskRecord {
  userId?: string;
  title: string;
  deadline?: string;
  notes?: string;
  sourceTaskId: string;
  nodeId: string;
  recordedAt: string;
}

interface NotificationRecord {
  userId?: string;
  channel: string;
  message: string;
  sourceTaskId: string;
  nodeId: string;
  recordedAt: string;
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(runtimeDir, { recursive: true });
}

async function appendJsonLine(filePath: string, payload: unknown, logger: Logger): Promise<void> {
  try {
    await ensureDir();
    await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, { encoding: 'utf8' });
  } catch (error) {
    logger.error('Failed to persist task record', {
      filePath,
      error: (error as Error).message
    });
    throw error;
  }
}

export async function recordCalendarTask(payload: Omit<CalendarTaskRecord, 'recordedAt'>, logger: Logger): Promise<CalendarTaskRecord> {
  const record: CalendarTaskRecord = {
    ...payload,
    recordedAt: new Date().toISOString()
  };
  await appendJsonLine(path.join(runtimeDir, 'calendar_tasks.jsonl'), record, logger);
  return record;
}

export async function recordNotification(payload: Omit<NotificationRecord, 'recordedAt'>, logger: Logger): Promise<NotificationRecord> {
  const record: NotificationRecord = {
    ...payload,
    recordedAt: new Date().toISOString()
  };
  await appendJsonLine(path.join(runtimeDir, 'notifications.jsonl'), record, logger);
  return record;
}
