import PQueue from 'p-queue';
import type { ToolCall, ToolResult } from './types';
import { SkillExecutor } from '../skills/SkillExecutor';

export interface ToolExecutorOptions {
  maxConcurrency?: number;
  skillExecutor?: SkillExecutor;
}

export class ToolExecutor {
  private queue: PQueue;
  private skillExecutor: SkillExecutor;

  constructor(options: ToolExecutorOptions = {}) {
    this.queue = new PQueue({
      concurrency: options.maxConcurrency ?? 5
    });
    this.skillExecutor = options.skillExecutor ?? new SkillExecutor();
  }

  async *executeStreaming(
    call: ToolCall,
    iteration: number,
    onChunk?: (chunk: any) => void
  ): AsyncGenerator<any, void, void> {
    const result = await this.executeTool(call, iteration);

    if (onChunk) {
      onChunk(result.result);
    }

    yield result;
  }

  async executeAll(
    toolCalls: ToolCall[],
    iteration: number,
    onComplete?: (result: ToolResult) => void
  ): Promise<Map<ToolCall, ToolResult>> {
    const results = new Map<ToolCall, ToolResult>();

    const executeWithConcurrency = async (call: ToolCall): Promise<void> => {
      const result = await this.executeTool(call, iteration);
      results.set(call, result);

      if (onComplete) {
        onComplete(result);
      }
    };

    await this.queue.addAll(
      toolCalls.map(call => () => executeWithConcurrency(call))
    );

    return results;
  }

  private async executeTool(call: ToolCall, iteration: number): Promise<ToolResult> {
    const skill = this.skillExecutor.getSkillByName(call.function.name);

    if (!skill) {
      return {
        toolCallId: call.id,
        name: call.function.name,
        status: 'error',
        result: null,
        error: `Tool "${call.function.name}" not found`,
        durationMs: 0
      };
    }

    const startTime = Date.now();

    try {
      const result = await this.skillExecutor.executeSkill(skill, JSON.parse(call.function.arguments || '{}'));
      const durationMs = Date.now() - startTime;

      return {
        toolCallId: call.id,
        name: call.function.name,
        status: 'success',
        result,
        durationMs
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      return {
        toolCallId: call.id,
        name: call.function.name,
        status: 'error',
        result: null,
        error: error instanceof Error ? error.message : String(error),
        durationMs
      };
    }
  }

  async pause(): Promise<void> {
    await this.queue.pause();
  }

  async resume(): Promise<void> {
    this.queue.start();
  }

  async clear(): Promise<void> {
    this.queue.clear();
  }

  get pendingCount(): number {
    return this.queue.pending;
  }

  get size(): number {
    return this.queue.size;
  }
}
