import PQueue from "p-queue";
import type { ToolCall, ToolResult } from "./types";
import { toolRegistry } from "../tool/registry";

export interface ToolExecutorOptions {
  maxConcurrency?: number;
}

export class ToolExecutor {
  private queue: PQueue;

  constructor(options: ToolExecutorOptions = {}) {
    this.queue = new PQueue({
      concurrency: options.maxConcurrency ?? 5,
    });
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

    await this.queue.addAll(toolCalls.map((call) => () => executeWithConcurrency(call)));

    return results;
  }

  private async executeTool(call: ToolCall, iteration: number): Promise<ToolResult> {
    const toolInfo = await toolRegistry.get(call.function.name);

    if (!toolInfo) {
      return {
        toolCallId: call.id,
        name: call.function.name,
        status: "error",
        result: null,
        error: `Tool "${call.function.name}" not found`,
        durationMs: 0,
      };
    }

    const startTime = Date.now();

    try {
      const toolInit = await toolInfo.init();
      const args = JSON.parse(call.function.arguments || "{}");
      const result = await toolInit.execute(args, {
        sessionID: "",
        messageID: "",
        agent: "",
        abort: new AbortController().signal,
        metadata: () => {},
      });
      const durationMs = Date.now() - startTime;

      return {
        toolCallId: call.id,
        name: call.function.name,
        status: "success",
        result: result.output,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      return {
        toolCallId: call.id,
        name: call.function.name,
        status: "error",
        result: null,
        error: error instanceof Error ? error.message : String(error),
        durationMs,
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
