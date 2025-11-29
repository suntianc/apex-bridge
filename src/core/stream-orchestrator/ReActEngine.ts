/**
 * ReAct Engine - ReAct流式处理核心引擎 (180行)
 *
 * 事件驱动的ReAct推理引擎，支持：
 * - 链式思考 (Chain-of-Thought) 流式输出
 * - 工具并发执行
 * - 异步生成器
 * - 零阻塞SSE推送
 */

import PQueue from 'p-limit';
import { ToolExecutor } from './ToolExecutor';
import type {
  LLMAdapter,
  LLMOptions,
  ToolCall,
  ToolResult,
  StreamEvent,
  ReActOptions,
  ReActRuntimeContext
} from './types';

export class ReActEngine {
  private toolExecutor: ToolExecutor;
  private defaultOptions: Required<ReActOptions>;

  constructor(options: Partial<ReActOptions> = {}) {
    this.toolExecutor = new ToolExecutor({
      maxConcurrency: options.maxConcurrentTools ?? 3,
    });

    this.defaultOptions = {
      maxIterations: options.maxIterations ?? 10,
      timeoutMs: options.timeoutMs ?? 300_000,
      enableThinking: options.enableThinking ?? true,
      maxConcurrentTools: options.maxConcurrentTools ?? 3,
      enableStreamingTools: options.enableStreamingTools ?? false,
      provider: options.provider ?? undefined,
      model: options.model ?? undefined,
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? undefined
    };
  }

  /**
   * 执行ReAct循环
   * @param messages 消息历史
   * @param llmClient LLM适配器
   * @param runtimeOptions 运行时选项（继承默认选项）
   * @yields StreamEvent 流式事件
   * @returns 最终答案
   */
  async *execute(
    messages: any[],
    llmClient: LLMAdapter,
    runtimeOptions?: Partial<ReActOptions>
  ): AsyncGenerator<StreamEvent, string, void> {
    const options = { ...this.defaultOptions, ...runtimeOptions };
    const signal = new AbortController().signal;

    try {
      for (let iteration = 0; iteration < options.maxIterations; iteration++) {
        const chunk = yield* this.runIteration(
          messages,
          llmClient,
          { iteration, maxIterations: options.maxIterations, enableThinking: options.enableThinking, toolCalls: new Map(), accumulatedContent: '', signal },
          signal
        );

        if (chunk) {
          return chunk;
        }
      }

      throw new Error('Max iterations reached');
    } finally {
      this.toolExecutor.clear();
    }
  }

  /**
   * 单轮ReAct迭代
   */
  private async *runIteration(
    messages: any[],
    llmClient: LLMAdapter,
    context: ReActRuntimeContext,
    signal: AbortSignal
  ): AsyncGenerator<StreamEvent, string | null, void> {
    const { provider, model, temperature, maxTokens, ...llmSpecificOptions } = this.defaultOptions;
    const llmOptions: LLMOptions = {
      enableThinking: context.enableThinking,
      model,
      provider,
      temperature,
      maxTokens,
      ...llmSpecificOptions
    };

    const llmStream = llmClient.streamChat(messages, llmOptions, signal);

    let assistantMessage = { role: 'assistant', content: '' };
    let toolCalls: ToolCall[] = [];
    let inThinking = false;
    let thinkingBuffer = '';

    for await (const chunk of llmStream) {
      if (signal.aborted) {
        throw new Error('Aborted');
      }

      if (chunk.type === 'reasoning') {
        if (!inThinking && context.enableThinking) {
          inThinking = true;
          yield { type: 'reasoning', data: chunk.content, timestamp: Date.now(), iteration: context.iteration };
        }
        thinkingBuffer += chunk.content;
        continue;
      }

      inThinking = false;

      if (chunk.type === 'tool_calls') {
        toolCalls = chunk.tool_calls || [];
      }

      if (chunk.type === 'content') {
        assistantMessage.content += chunk.content;
        yield { type: 'content', data: chunk.content, timestamp: Date.now(), iteration: context.iteration };
      }
    }

    if (toolCalls.length > 0) {
      yield { type: 'tool_start', data: { toolCalls }, timestamp: Date.now(), iteration: context.iteration };

      const results = await this.toolExecutor.executeAll(toolCalls, context.iteration, (result) => {
        context.accumulatedContent += JSON.stringify(result);
      });

      yield { type: 'tool_end', data: { results: Array.from(results.values()) }, timestamp: Date.now(), iteration: context.iteration };

      const toolMessages = Array.from(results.entries()).map(([call, result]) => ({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: typeof result.result === 'string' ? result.result : JSON.stringify(result.result),
      }));

      messages.push(assistantMessage, ...toolMessages);

      return null;
    }

    return assistantMessage.content;
  }
}
