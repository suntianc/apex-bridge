/**
 * ReAct Engine - ReAct流式处理核心引擎
 *
 * 事件驱动的ReAct推理引擎，支持：
 * - 链式思考 (Chain-of-Thought) 流式输出
 * - 工具并发执行
 * - 异步生成器
 * - 零阻塞SSE推送
 * - tool_action 标签解析
 * - Doom Loop 检测
 * - 步骤边界事件
 */

import { ToolExecutor } from "./ToolExecutor";
import { StreamTagDetector } from "../tool-action/StreamTagDetector";
import { ToolDispatcher } from "../tool-action/ToolDispatcher";
import { ToolActionParser } from "../tool-action/ToolActionParser";
import type { ToolActionCall } from "../tool-action/types";
import type {
  LLMAdapter,
  LLMOptions,
  ToolCall,
  StreamEvent,
  ReActOptions,
  ReActRuntimeContext,
  DoomLoopDetector,
} from "./types";
import { logger } from "../../utils/logger";

// ── Doom Loop 检测器实现 ─────────────────────────────────────────────────
const DOOM_LOOP_THRESHOLD = 3;

/**
 * Doom Loop 检测器实现
 * 检测重复的工具调用模式，防止无限循环
 */
export class DoomLoopDetectorImpl implements DoomLoopDetector {
  toolCallHistory: { name: string; args: unknown }[];
  doomLoopThreshold: number;

  constructor(threshold: number = DOOM_LOOP_THRESHOLD) {
    this.toolCallHistory = [];
    this.doomLoopThreshold = threshold;
  }

  check(name: string, args: unknown): boolean {
    // 添加到历史记录
    this.toolCallHistory.push({ name, args });

    // 只保留最近 N 次调用
    const maxHistory = this.doomLoopThreshold * 2;
    if (this.toolCallHistory.length > maxHistory) {
      this.toolCallHistory = this.toolCallHistory.slice(-maxHistory);
    }

    // 检查最近 N 次调用是否完全相同
    if (this.toolCallHistory.length < this.doomLoopThreshold) {
      return false;
    }

    const recentCalls = this.toolCallHistory.slice(-this.doomLoopThreshold);
    const lastCall = recentCalls[recentCalls.length - 1];

    // 检查所有最近调用是否与最后一次相同
    const isDoomLoop = recentCalls.every(
      (call) =>
        call.name === lastCall.name && JSON.stringify(call.args) === JSON.stringify(lastCall.args)
    );

    if (isDoomLoop) {
      logger.warn(
        `[ReActEngine] Doom Loop detected: ${name} called ${this.doomLoopThreshold} times with same args`
      );
    }

    return isDoomLoop;
  }

  reset(): void {
    this.toolCallHistory = [];
  }
}

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
      maxConcurrency: options.maxConcurrentTools ?? 3,
    });

    this.defaultOptions = {
      maxIterations: options.maxIterations ?? 50,
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
      signal: undefined,
    };
  }

  /**
   * 增强的 XML 内容转义
   * 处理所有 XML 特殊字符，防止破坏 XML 结构
   * @param content 原始内容
   * @returns 转义后的安全内容
   */
  private escapeXmlContent(content: string): string {
    if (!content || typeof content !== "string") {
      return "";
    }

    return content
      .replace(/&/g, "&amp;") // 必须最先处理
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
      .replace(/]]>/g, "]]]]><![CDATA["); // CDATA 保护
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

    // 初始化 Doom Loop 检测器
    const doomLoopDetector = new DoomLoopDetectorImpl(DOOM_LOOP_THRESHOLD);

    try {
      // 发送 reasoning-start 事件
      // yield {
      //   type: "reasoning-start",
      //   data: { message: "开始推理" },
      //   timestamp: Date.now(),
      //   iteration: 0,
      // };

      for (let iteration = 0; iteration < options.maxIterations; iteration++) {
        const chunk = yield* this.runIteration(
          messages,
          llmClient,
          {
            iteration,
            maxIterations: options.maxIterations,
            enableThinking: options.enableThinking,
            toolCalls: new Map(),
            accumulatedContent: "",
            signal,
            stepNumber: 0,
            doomLoopDetector,
          },
          options,
          signal
        );

        if (chunk) {
          // 发送 reasoning-end 事件
          // yield {
          //   type: "reasoning-end",
          //   data: { message: "推理完成" },
          //   timestamp: Date.now(),
          //   iteration,
          // };
          return chunk;
        }
      }

      throw new Error("Max iterations reached");
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
      maxTokens,
    };

    const llmStream = llmClient.streamChat(
      messages,
      llmOptions,
      this.tools.length > 0 ? this.tools : undefined,
      signal
    );

    let assistantMessage = { role: "assistant", content: "" };
    let toolCalls: ToolCall[] = [];
    let inThinking = false;
    let thinkingBuffer = "";
    let stepStartTime = Date.now();

    // 初始化流式标签检测器
    const streamDetector = options.enableToolActionParsing ? new StreamTagDetector() : null;
    let detectedToolActions: ToolActionCall[] = [];

    for await (const chunk of llmStream) {
      if (signal.aborted) {
        throw new Error("Aborted");
      }

      if (chunk.type === "reasoning") {
        // 流式输出每一个 reasoning chunk（不仅仅是第一个）
        if (context.enableThinking) {
          // 使用 reasoning-delta 事件替代 reasoning 事件
          yield {
            type: "reasoning-delta",
            data: chunk.content,
            timestamp: Date.now(),
            iteration: context.iteration,
            stepNumber: context.stepNumber,
          };
        }
        thinkingBuffer += chunk.content;
        inThinking = true;
        continue;
      }

      if (inThinking && thinkingBuffer) {
        thinkingBuffer = "";
        inThinking = false;
      }

      // 原生 tool_calls 优先处理
      if (chunk.type === "tool_calls") {
        toolCalls = chunk.tool_calls || [];
      }

      if (chunk.type === "content") {
        // 如果启用了标签解析且没有原生 tool_calls
        if (streamDetector && toolCalls.length === 0) {
          // 🔍 调试日志：显示收到的 content
          logger.debug(
            `[ReActEngine] Processing content chunk (${chunk.content.length} chars): ${chunk.content.substring(0, 100)}...`
          );

          const detection = streamDetector.processChunk(chunk.content);

          // 🔍 调试日志：显示检测结果
          logger.debug(
            `[ReActEngine] Detection result: complete=${detection.complete}, hasToolAction=${!!detection.toolAction}, textToEmit="${detection.textToEmit?.substring(0, 50)}...", bufferRemainder="${detection.bufferRemainder?.substring(0, 50)}..."`
          );

          // 输出非标签文本
          if (detection.textToEmit) {
            assistantMessage.content += detection.textToEmit;
            yield {
              type: "content",
              data: detection.textToEmit,
              timestamp: Date.now(),
              iteration: context.iteration,
              stepNumber: context.stepNumber,
            };
          }

          // 检测到完整的工具调用标签
          if (detection.complete && detection.toolAction) {
            logger.info(`[ReActEngine] ✅ Detected tool_action: ${detection.toolAction.name}`);
            detectedToolActions.push(detection.toolAction);

            // 输出完整的标签内容到前端，让用户看到 LLM 的工具调用
            const tagContent = detection.toolAction.rawText;
            assistantMessage.content += tagContent;
            yield {
              type: "content",
              data: tagContent,
              timestamp: Date.now(),
              iteration: context.iteration,
              stepNumber: context.stepNumber,
            };
          }
        } else {
          // 不启用标签解析或已有原生 tool_calls，直接输出
          assistantMessage.content += chunk.content;
          yield {
            type: "content",
            data: chunk.content,
            timestamp: Date.now(),
            iteration: context.iteration,
            stepNumber: context.stepNumber,
          };
        }
      }
    }

    // 刷新流式检测器的缓冲区
    if (streamDetector) {
      const remainingText = streamDetector.flush();
      logger.debug(
        `[ReActEngine] Flushing detector buffer: "${remainingText?.substring(0, 100) || "(empty)"}..."`
      );
      if (remainingText) {
        // 🔍 检查 flush 后的内容是否包含未处理的标签
        if (remainingText.includes("<tool_action")) {
          logger.warn(`[ReActEngine] ⚠️ Buffer contains unprocessed tool_action tag!`);
          // 尝试解析缓冲区中的标签
          const parser = new ToolActionParser();
          const parseResult = parser.parse(remainingText);
          if (parseResult.toolCalls.length > 0) {
            logger.info(
              `[ReActEngine] Found ${parseResult.toolCalls.length} tool_action(s) in buffer`
            );
            for (const toolCall of parseResult.toolCalls) {
              detectedToolActions.push(toolCall);
            }
          }
        }

        assistantMessage.content += remainingText;
        yield {
          type: "content",
          data: remainingText,
          timestamp: Date.now(),
          iteration: context.iteration,
          stepNumber: context.stepNumber,
        };
      }
    }

    // 优先处理原生 tool_calls
    if (toolCalls.length > 0) {
      // 增加步骤计数器并发送 step-start 事件
      context.stepNumber++;
      // yield {
      //   type: "step-start",
      //   data: { stepNumber: context.stepNumber, toolCount: toolCalls.length },
      //   timestamp: stepStartTime,
      //   iteration: context.iteration,
      //   stepNumber: context.stepNumber,
      // };

      // yield {
      //   type: "tool_start",
      //   data: { toolCalls },
      //   timestamp: Date.now(),
      //   iteration: context.iteration,
      //   stepNumber: context.stepNumber,
      // };

      const results = await this.toolExecutor.executeAll(toolCalls, context.iteration, (result) => {
        context.accumulatedContent += JSON.stringify(result);
      });

      // yield {
      //   type: "tool_end",
      //   data: { results: Array.from(results.values()) },
      //   timestamp: Date.now(),
      //   iteration: context.iteration,
      //   stepNumber: context.stepNumber,
      // };

      // 发送 step-finish 事件
      const stepCost = Date.now() - stepStartTime;
      // yield {
      //   type: "step-finish",
      //   data: {
      //     stepNumber: context.stepNumber,
      //     reason: "tool_completed",
      //     cost: stepCost,
      //     tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      //   },
      //   timestamp: Date.now(),
      //   iteration: context.iteration,
      //   stepNumber: context.stepNumber,
      // };

      const toolMessages = Array.from(results.entries()).map(([call, result]) => ({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: typeof result.result === "string" ? result.result : JSON.stringify(result.result),
      }));

      messages.push(assistantMessage, ...toolMessages);

      return null;
    }

    // 处理标签式工具调用
    if (detectedToolActions.length > 0) {
      // 增加步骤计数器并发送 step-start 事件
      context.stepNumber++;
      // yield {
      //   type: "step-start",
      //   data: { stepNumber: context.stepNumber, toolCount: detectedToolActions.length },
      //   timestamp: stepStartTime,
      //   iteration: context.iteration,
      //   stepNumber: context.stepNumber,
      // };

      // yield {
      //   type: "tool_start",
      //   data: { toolActions: detectedToolActions },
      //   timestamp: Date.now(),
      //   iteration: context.iteration,
      //   stepNumber: context.stepNumber,
      // };

      const toolResults: any[] = [];

      for (const toolAction of detectedToolActions) {
        // Doom Loop 检测
        if (context.doomLoopDetector.check(toolAction.name, toolAction.parameters)) {
          logger.warn(`[ReActEngine] 🚫 Preventing doom loop: ${toolAction.name}`);
          toolResults.push({
            success: false,
            error: "Doom loop detected: repeated tool call with same arguments",
            result: null,
          });
          continue;
        }

        const result = await this.toolDispatcher.dispatch(toolAction);
        toolResults.push(result);
      }

      // 过滤掉需要隐藏的结果，只推送用户可见的结果
      const visibleResults = toolResults.filter((r) => !r.hiddenFromUser);

      // yield {
      //   type: "tool_end",
      //   data: { results: visibleResults },
      //   timestamp: Date.now(),
      //   iteration: context.iteration,
      //   stepNumber: context.stepNumber,
      // };

      // 发送 step-finish 事件
      const stepCost = Date.now() - stepStartTime;
      // yield {
      //   type: "step-finish",
      //   data: {
      //     stepNumber: context.stepNumber,
      //     reason: "tool_completed",
      //     cost: stepCost,
      //     tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      //   },
      //   timestamp: Date.now(),
      //   iteration: context.iteration,
      //   stepNumber: context.stepNumber,
      // };

      // 对于标签式工具调用，使用 user 消息格式传递工具结果
      // 因为没有原生 tool_calls，不能使用 role: 'tool' 格式
      // 只包含用户可见的结果
      const visiblePairs = detectedToolActions
        .map((action, index) => ({ action, result: toolResults[index] }))
        .filter((pair) => !pair.result.hiddenFromUser);

      const toolResultsText = visiblePairs
        .map(({ action, result }) => {
          const status = result.success ? "success" : "error";
          const resultContent = result.success
            ? typeof result.result === "string"
              ? result.result
              : JSON.stringify(result.result)
            : result.error;
          // 增强的 XML 转义：处理所有特殊字符
          const safeResultContent = this.escapeXmlContent(resultContent);

          return `[SYSTEM_FEEDBACK]
                <tool_output name="${action.name}" status="${status}">
                  ${safeResultContent}
                </tool_output>`;
        })
        .join("\n\n");

      // 将 assistant 输出的内容（包含 tool_action 标签）和工具结果添加到消息历史
      messages.push(assistantMessage);
      messages.push({
        role: "user",
        content: toolResultsText,
      });

      return null;
    }

    // 无工具调用时，将 assistantMessage 添加到消息历史（保存思考过程）
    if (assistantMessage.content) {
      messages.push(assistantMessage);
    }

    return assistantMessage.content;
  }
}
