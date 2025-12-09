/**
 * ReAct Engine - ReAct流式处理核心引擎
 *
 * 事件驱动的ReAct推理引擎，支持：
 * - 链式思考 (Chain-of-Thought) 流式输出
 * - 工具并发执行
 * - 异步生成器
 * - 零阻塞SSE推送
 * - tool_action 标签解析
 */

import { ToolExecutor } from './ToolExecutor';
import { StreamTagDetector } from '../tool-action/StreamTagDetector';
import { ToolDispatcher } from '../tool-action/ToolDispatcher';
import { ToolActionParser } from '../tool-action/ToolActionParser';
import type { ToolActionCall } from '../tool-action/types';
import type {
  LLMAdapter,
  LLMOptions,
  ToolCall,
  StreamEvent,
  ReActOptions,
  ReActRuntimeContext
} from './types';
import { logger } from '../../utils/logger';

export class ReActEngine {
  private toolExecutor: ToolExecutor;
  private defaultOptions: Required<ReActOptions>;
  private toolDispatcher: ToolDispatcher;
  public tools: any[] = [];

  constructor(options: Partial<ReActOptions> = {}) {
    this.toolExecutor = new ToolExecutor({
      maxConcurrency: options.maxConcurrentTools ?? 3,
    });

    this.toolDispatcher = new ToolDispatcher({
      timeout: options.toolActionTimeout ?? 30000,
      maxConcurrency: options.maxConcurrentTools ?? 3
    });

    this.defaultOptions = {
      maxIterations: options.maxIterations ?? 10,
      timeoutMs: options.timeoutMs ?? 300_000,
      enableThinking: options.enableThinking ?? true,
      maxConcurrentTools: options.maxConcurrentTools ?? 3,
      enableStreamingTools: options.enableStreamingTools ?? false,
      enableToolActionParsing: options.enableToolActionParsing ?? true,
      toolActionTimeout: options.toolActionTimeout ?? 30000,
      provider: options.provider ?? undefined,
      model: options.model ?? undefined,
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? undefined,
      signal: undefined
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
    // 使用外部传入的 signal，如果没有则创建新的
    const signal = options.signal || new AbortController().signal;

    try {
      for (let iteration = 0; iteration < options.maxIterations; iteration++) {
        const chunk = yield* this.runIteration(
          messages,
          llmClient,
          {
            iteration,
            maxIterations: options.maxIterations,
            enableThinking: options.enableThinking,
            toolCalls: new Map(),
            accumulatedContent: '',
            signal
          },
          options,
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
    options: Required<ReActOptions>,
    signal: AbortSignal
  ): AsyncGenerator<StreamEvent, string | null, void> {
    const { provider, model, temperature, maxTokens } = options;
    const llmOptions: LLMOptions = {
      enableThinking: context.enableThinking,
      model,
      provider,
      temperature,
      maxTokens
    };

    const llmStream = llmClient.streamChat(
      messages,
      llmOptions,
      this.tools.length > 0 ? this.tools : undefined,
      signal
    );

    let assistantMessage = { role: 'assistant', content: '' };
    let toolCalls: ToolCall[] = [];
    let inThinking = false;
    let thinkingBuffer = '';

    // 初始化流式标签检测器
    const streamDetector = options.enableToolActionParsing ? new StreamTagDetector() : null;
    let detectedToolActions: ToolActionCall[] = [];

    for await (const chunk of llmStream) {
      if (signal.aborted) {
        throw new Error('Aborted');
      }

      if (chunk.type === 'reasoning') {
        // 流式输出每一个 reasoning chunk（不仅仅是第一个）
        if (context.enableThinking) {
          yield { type: 'reasoning', data: chunk.content, timestamp: Date.now(), iteration: context.iteration };
        }
        thinkingBuffer += chunk.content;
        inThinking = true;
        continue;
      }

      inThinking = false;

      // 原生 tool_calls 优先处理
      if (chunk.type === 'tool_calls') {
        toolCalls = chunk.tool_calls || [];
      }

      if (chunk.type === 'content') {
        // 如果启用了标签解析且没有原生 tool_calls
        if (streamDetector && toolCalls.length === 0) {
          // 🔍 调试日志：显示收到的 content
          logger.debug(`[ReActEngine] Processing content chunk (${chunk.content.length} chars): ${chunk.content.substring(0, 100)}...`);

          const detection = streamDetector.processChunk(chunk.content);

          // 🔍 调试日志：显示检测结果
          logger.debug(`[ReActEngine] Detection result: complete=${detection.complete}, hasToolAction=${!!detection.toolAction}, textToEmit="${detection.textToEmit?.substring(0, 50)}...", bufferRemainder="${detection.bufferRemainder?.substring(0, 50)}..."`);

          // 输出非标签文本
          if (detection.textToEmit) {
            assistantMessage.content += detection.textToEmit;
            yield { type: 'content', data: detection.textToEmit, timestamp: Date.now(), iteration: context.iteration };
          }

          // 检测到完整的工具调用标签
          if (detection.complete && detection.toolAction) {
            logger.info(`[ReActEngine] ✅ Detected tool_action: ${detection.toolAction.name}`);
            detectedToolActions.push(detection.toolAction);

            // 输出完整的标签内容到前端，让用户看到 LLM 的工具调用
            const tagContent = detection.toolAction.rawText;
            assistantMessage.content += tagContent;
            yield { type: 'content', data: tagContent, timestamp: Date.now(), iteration: context.iteration };
          }
        } else {
          // 不启用标签解析或已有原生 tool_calls，直接输出
          assistantMessage.content += chunk.content;
          yield { type: 'content', data: chunk.content, timestamp: Date.now(), iteration: context.iteration };
        }
      }
    }

    // 刷新流式检测器的缓冲区
    if (streamDetector) {
      const remainingText = streamDetector.flush();
      logger.debug(`[ReActEngine] Flushing detector buffer: "${remainingText?.substring(0, 100) || '(empty)'}..."`);
      if (remainingText) {
        // 🔍 检查 flush 后的内容是否包含未处理的标签
        if (remainingText.includes('<tool_action')) {
          logger.warn(`[ReActEngine] ⚠️ Buffer contains unprocessed tool_action tag!`);
          // 尝试解析缓冲区中的标签
          const parser = new ToolActionParser();
          const parseResult = parser.parse(remainingText);
          if (parseResult.toolCalls.length > 0) {
            logger.info(`[ReActEngine] Found ${parseResult.toolCalls.length} tool_action(s) in buffer`);
            for (const toolCall of parseResult.toolCalls) {
              detectedToolActions.push(toolCall);
            }
          }
        }

        assistantMessage.content += remainingText;
        yield { type: 'content', data: remainingText, timestamp: Date.now(), iteration: context.iteration };
      }
    }

    // 优先处理原生 tool_calls
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

    // 处理标签式工具调用
    if (detectedToolActions.length > 0) {
      yield {
        type: 'tool_start',
        data: { toolActions: detectedToolActions },
        timestamp: Date.now(),
        iteration: context.iteration
      };

      const toolResults: any[] = [];

      for (const toolAction of detectedToolActions) {
        const result = await this.toolDispatcher.dispatch(toolAction);
        toolResults.push(result);
      }

      yield {
        type: 'tool_end',
        data: { results: toolResults },
        timestamp: Date.now(),
        iteration: context.iteration
      };

      // 对于标签式工具调用，使用 user 消息格式传递工具结果
      // 因为没有原生 tool_calls，不能使用 role: 'tool' 格式
      const toolResultsText = detectedToolActions.map((action, index) => {
        const result = toolResults[index];
        const status = result.success ? 'success' : 'error';
        const resultContent = result.success
          ? (typeof result.result === 'string' ? result.result : JSON.stringify(result.result))
          : result.error;
        // 转义 CDATA 结束标记，防止内容中的 ]]> 导致 XML 解析错误
        const safeResultContent = resultContent.replace(/]]>/g, ']]]]><![CDATA[');

        return `<tool_output name="${action.name}" status="${status}">
                  ${safeResultContent}
                </tool_output>`;
                      }).join('\n\n');

      // 将 assistant 输出的内容（包含 tool_action 标签）和工具结果添加到消息历史
      messages.push(assistantMessage);
      messages.push({
        role: 'system',
        content: toolResultsText
      });

      return null;
    }

    return assistantMessage.content;
  }
}
