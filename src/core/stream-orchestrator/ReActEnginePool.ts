import PQueue from "p-queue";
import { ReActEngine } from "./ReActEngine";
import type { LLMAdapter, BatchTask, BatchResult } from "./types";

export interface PoolOptions {
  maxConcurrent?: number;
}

export class ReActEnginePool {
  private engine: ReActEngine;
  private queue: PQueue;

  constructor(engine?: ReActEngine, options: PoolOptions = {}) {
    this.engine = engine ?? new ReActEngine();
    this.queue = new PQueue({ concurrency: options.maxConcurrent ?? 10 });
  }

  async *executeBatch(
    tasks: BatchTask[],
    llmClient: LLMAdapter,
    maxConcurrent: number = 10
  ): AsyncGenerator<BatchResult, void, void> {
    this.queue.concurrency = maxConcurrent;

    const executeTask = async (task: BatchTask): Promise<BatchResult> => {
      const stream = this.engine.execute(task.messages, llmClient, task.options);
      const chunks: any[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      return {
        taskId: task.taskId,
        result: chunks,
        timestamp: Date.now(),
      };
    };

    const promises = tasks.map((task) => this.queue.add(() => executeTask(task)));

    for (const promise of promises) {
      yield await promise;
    }
  }

  get activeCount(): number {
    return this.queue.pending;
  }

  get queuedCount(): number {
    return this.queue.size;
  }

  async pause(): Promise<void> {
    await this.queue.pause();
  }

  async resume(): Promise<void> {
    this.queue.start();
  }

  async onIdle(): Promise<void> {
    await this.queue.onIdle();
  }
}
