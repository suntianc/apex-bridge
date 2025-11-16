import { TaskHandler } from './types';

export class TaskRegistry {
  private readonly handlers = new Map<string, TaskHandler>();

  register(toolName: string, handler: TaskHandler): void {
    this.handlers.set(toolName, handler);
  }

  unregister(toolName: string): void {
    this.handlers.delete(toolName);
  }

  get(toolName: string): TaskHandler | undefined {
    return this.handlers.get(toolName);
  }

  clear(): void {
    this.handlers.clear();
  }
}

