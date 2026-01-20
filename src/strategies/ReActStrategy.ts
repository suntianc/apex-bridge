/**
 * ReActStrategy - ReAct聊天处理策略
 * 实现自我思考循环，支持工具调用和流式输出
 * 集成新工具系统：内置工具 + Skills外置工具 + tool_action标签解析
 */

import type { Message, ChatOptions } from "../types";
import type { ChatStrategy, ChatResult, StrategyPrepareResult } from "./ChatStrategy";
import type { LLMManager } from "../core/LLMManager";
import type { ConversationHistoryService } from "../services/ConversationHistoryService";
import { ReActEngine } from "../core/stream-orchestrator/ReActEngine";
import { LLMManagerAdapter } from "../core/stream-orchestrator/LLMAdapter";
import { BuiltInToolsRegistry } from "../services/BuiltInToolsRegistry";
import { ToolRetrievalService } from "../services/tool-retrieval/ToolRetrievalService";
import { BuiltInExecutor } from "../services/executors/BuiltInExecutor";
import { SkillsSandboxExecutor } from "../services/executors/SkillsSandboxExecutor";
import { generateToolPrompt, ToolDispatcher } from "../core/tool-action";
import { getSkillManager } from "../services/skill/SkillManager";
import type { Tool } from "../core/stream-orchestrator/types";
import { ToolType, SkillTool, BuiltInTool } from "../types/tool-system";
import { logger } from "../utils/logger";
import { extractTextFromMessage } from "../utils/message-utils";
import { TIMEOUT, LIMITS, THRESHOLDS } from "../constants";
import { SKILL_TIMEOUT_MS } from "../constants/retention";
import { ErrorClassifier } from "../utils/error-classifier";

export class ReActStrategy implements ChatStrategy {
  private builtInRegistry: BuiltInToolsRegistry;
  private toolRetrievalService: ToolRetrievalService;
  private builtInExecutor: BuiltInExecutor;
  private skillsExecutor: SkillsSandboxExecutor;
  private toolDispatcher: ToolDispatcher;
  private availableTools: any[] = [];

  // 自动注销机制：追踪动态注册Skills的最后访问时间
  private dynamicSkillsLastAccess: Map<string, number> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly SKILL_TIMEOUT_MS = SKILL_TIMEOUT_MS;

  constructor(
    private llmManager: LLMManager,
    private historyService: ConversationHistoryService
  ) {
    // 初始化工具系统组件
    this.builtInRegistry = new BuiltInToolsRegistry();

    // 使用 SkillManager 中已经初始化好的 ToolRetrievalService 实例
    // 避免创建重复的数据库和实例
    const skillManager = getSkillManager();
    this.toolRetrievalService = skillManager.getRetrievalService();

    this.builtInExecutor = new BuiltInExecutor();
    this.skillsExecutor = new SkillsSandboxExecutor();
    this.toolDispatcher = new ToolDispatcher();

    // 启动自动清理定时器
    this.startCleanupTimer();

    logger.debug("ReActStrategy initialized");
  }

  getName(): string {
    return "ReActStrategy";
  }

  /**
   * 检查是否支持该选项（需要selfThinking.enabled）
   */
  supports(options: ChatOptions): boolean {
    return !!options.selfThinking?.enabled;
  }

  /**
   * 准备阶段：初始化工具系统并返回需要注入的变量
   * ChatService 会在变量替换阶段使用这些变量
   */
  async prepare(messages: Message[], options: ChatOptions): Promise<StrategyPrepareResult> {
    logger.debug(`[${this.getName()}] Preparing strategy - initializing tool system`);

    // 1. 初始化工具系统（工具发现与注册）
    await this.initializeToolSystem(messages);

    // 2. 生成工具提示词内容
    const toolPromptContent = await this.generateToolPromptContent();

    // 3. 返回需要注入的变量
    return {
      variables: {
        available_tools: toolPromptContent,
      },
    };
  }

  /**
   * 执行ReAct聊天处理
   * 注意：messages 已由 ChatService 完成变量替换
   */
  async execute(messages: Message[], options: ChatOptions): Promise<ChatResult> {
    const startTime = Date.now();
    const includeThoughtsInResponse = options.selfThinking?.includeThoughtsInResponse ?? true;

    logger.info(`[${this.getName()}] Starting ReAct execution with new tool system`);

    // 初始化 ReAct 引擎（启用 tool_action 标签解析）
    const reactEngine = new ReActEngine({
      maxIterations: options.selfThinking?.maxIterations ?? LIMITS.MAX_ITERATIONS,
      enableThinking: options.selfThinking?.enableStreamThoughts ?? true,
      maxConcurrentTools: LIMITS.MAX_CONCURRENT_TOOLS,
      enableToolActionParsing: options.selfThinking?.enableToolActionParsing ?? true,
      toolActionTimeout: options.selfThinking?.toolActionTimeout ?? TIMEOUT.TOOL_EXECUTION,
      provider: options.provider,
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.max_tokens,
    });

    // 将可用工具传递给ReActEngine
    if (this.availableTools.length > 0) {
      reactEngine.tools = this.availableTools;
      logger.debug(`[${this.getName()}] Passed ${this.availableTools.length} tools to ReActEngine`);
    }

    // 执行 ReAct 循环
    const thinkingProcess: string[] = [];
    let finalContent = "";
    let iterations = 0;

    try {
      const llmClient = new LLMManagerAdapter(this.llmManager);
      const stream = reactEngine.execute(messages, llmClient, {});

      for await (const event of stream) {
        iterations = event.iteration;

        if (event.type === "reasoning-delta") {
          thinkingProcess.push(event.data);
        } else if (event.type === "content") {
          finalContent += event.data;
        }
        // 注意：工具执行由ReActEngine内部处理，这里只关注思考过程和最终内容
      }

      logger.debug(`[${this.getName()}] ReAct completed in ${iterations} iterations`);

      const promptTokens = this.estimatePromptTokens(messages);
      const completionTokens = this.estimateCompletionTokens(finalContent, thinkingProcess);

      return {
        content: finalContent,
        iterations,
        thinkingProcess: includeThoughtsInResponse ? thinkingProcess.join("\n") : undefined,
        rawThinkingProcess: thinkingProcess,
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
      };
    } catch (error) {
      logger.error(`[${this.getName()}] ReAct execution failed: ${error}`);
      throw error;
    }
  }

  /**
   * 创建流式迭代器（ReAct流式版本）
   * 注意：messages 已由 ChatService 完成变量替换
   */
  async *stream(
    messages: Message[],
    options: ChatOptions,
    abortSignal?: AbortSignal
  ): AsyncIterableIterator<any> {
    logger.debug(`[${this.getName()}] Streaming ReAct execution`);

    // 初始化工具系统
    await this.initializeToolSystem(messages);

    // 初始化 ReAct 引擎（启用 tool_action 标签解析）
    const reactEngine = new ReActEngine({
      maxIterations: options.selfThinking?.maxIterations ?? LIMITS.MAX_ITERATIONS,
      enableThinking: options.selfThinking?.enableStreamThoughts ?? true,
      maxConcurrentTools: LIMITS.MAX_CONCURRENT_TOOLS,
      enableToolActionParsing: options.selfThinking?.enableToolActionParsing ?? true,
      toolActionTimeout: options.selfThinking?.toolActionTimeout ?? TIMEOUT.TOOL_EXECUTION,
      provider: options.provider,
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.max_tokens,
    });

    // 将工具传递给 ReActEngine
    reactEngine.tools = this.availableTools;
    logger.debug(`[${this.getName()}] Passed ${this.availableTools.length} tools to ReActEngine`);

    const llmClient = new LLMManagerAdapter(this.llmManager);
    const stream = reactEngine.execute(messages, llmClient, { signal: abortSignal });

    // 收集用于历史记录的数据
    const collectedThinking: string[] = [];
    let collectedContent = "";

    for await (const event of stream) {
      // 检查中断
      if (abortSignal?.aborted) {
        logger.debug(`[${this.getName()}] ReAct stream aborted`);
        return;
      }

      // 流式输出事件
      // 输出 JSON 格式字符串，与 SingleRoundStrategy 保持一致，便于前端 parseLLMChunk 解析
      switch (event.type) {
        case "reasoning-start":
          // 推理开始事件
          yield JSON.stringify({
            event_type: "reasoning-start",
            data: event.data,
            iteration: event.iteration,
          });
          break;

        case "reasoning-delta": {
          // 推理内容增量（替换原来的 reasoning 事件）
          const reasoningChunk = JSON.stringify({
            reasoning_content: event.data,
            content: null,
            step_number: event.stepNumber,
            iteration: event.iteration,
          });
          yield reasoningChunk;
          collectedThinking.push(event.data);
          break;
        }

        case "reasoning-end":
          // 推理结束事件
          yield JSON.stringify({
            event_type: "reasoning-end",
            data: event.data,
            iteration: event.iteration,
          });
          break;

        case "step-start":
          // 步骤开始事件
          yield JSON.stringify({
            event_type: "step-start",
            data: event.data,
            iteration: event.iteration,
            step_number: event.stepNumber,
          });
          break;

        case "step-finish":
          // 步骤完成事件
          yield JSON.stringify({
            event_type: "step-finish",
            data: event.data,
            iteration: event.iteration,
            step_number: event.stepNumber,
          });
          break;

        case "content": {
          const contentChunk = JSON.stringify({
            reasoning_content: null,
            content: event.data,
            step_number: event.stepNumber,
            iteration: event.iteration,
          });
          yield contentChunk;
          collectedContent += event.data;
          break;
        }

        case "tool_start":
          yield JSON.stringify({
            event_type: "tool_start",
            data: event.data,
            iteration: event.iteration,
            step_number: event.stepNumber,
          });
          break;

        case "tool_end":
          yield JSON.stringify({
            event_type: "tool_end",
            data: event.data,
            iteration: event.iteration,
            step_number: event.stepNumber,
          });
          break;

        case "done":
          yield JSON.stringify({
            event_type: "done",
            data: event.data,
            iteration: event.iteration,
          });
          break;

        case "error":
          yield JSON.stringify({
            event_type: "error",
            data: event.data,
            iteration: event.iteration,
          });
          break;

        default:
          // 未知事件类型，直接输出
          yield JSON.stringify(event);
      }
    }

    return {
      content: collectedContent,
      rawThinkingProcess: collectedThinking,
    };
  }

  private async *createReturnIterator(result: {
    content: string;
    rawThinkingProcess: string[];
  }): AsyncIterableIterator<{ content: string; rawThinkingProcess: string[] }> {
    yield result;
  }

  /**
   * 生成工具提示词内容（用于变量替换）
   */
  private async generateToolPromptContent(): Promise<string> {
    const toolDescriptions = await this.toolDispatcher.getAvailableTools();

    if (toolDescriptions.length === 0) {
      logger.debug(`[${this.getName()}] No tools available, returning empty prompt`);
      return "当前没有可用的工具。";
    }

    const toolPromptText = generateToolPrompt(toolDescriptions);
    logger.debug(`[${this.getName()}] Generated tool prompt with ${toolDescriptions.length} tools`);
    return toolPromptText;
  }

  /**
   * 初始化工具系统（工具发现与注册）
   */
  private async initializeToolSystem(messages: Message[]): Promise<void> {
    const startTime = Date.now();

    try {
      // 1. 加载所有内置工具到执行器
      const builtInTools = this.builtInRegistry.listAllTools();
      logger.debug(`[${this.getName()}] Found ${builtInTools.length} built-in tools`);

      // 2. 尝试向量检索相关Skills（可选，失败不影响内置工具）
      let relevantSkills: any[] = [];
      try {
        // 确保 ToolRetrievalService 已初始化（加载 embedding 模型配置）
        await this.toolRetrievalService.initialize();

        const query = messages[messages.length - 1]
          ? extractTextFromMessage(messages[messages.length - 1])
          : "";
        relevantSkills = await this.toolRetrievalService.findRelevantSkills(
          query,
          LIMITS.VECTOR_SEARCH_MAX_RESULTS, // limit
          THRESHOLDS.RELEVANT_SKILLS // threshold
        );
        logger.debug(`[${this.getName()}] Found ${relevantSkills.length} relevant Skills`);

        // 将检索到的Skills注册为代理工具，使其可以通过ToolDispatcher访问
        for (const skill of relevantSkills) {
          this.registerSkillAsBuiltInTool(skill.tool);
        }
      } catch (skillError) {
        // Skills 检索失败，降级处理：只使用内置工具
        logger.warn(
          `[${this.getName()}] Skills retrieval failed, using built-in tools only:`,
          skillError instanceof Error ? skillError.message : skillError
        );
        relevantSkills = [];
      }

      // 3. 构建工具列表（内置工具 + Skills）
      this.availableTools = [
        ...builtInTools.map((tool) => ({
          type: "function" as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        })),
        ...relevantSkills.map((skill) => ({
          type: "function" as const,
          function: {
            name: skill.tool.name,
            description: skill.tool.description,
            parameters: skill.tool.parameters,
          },
        })),
      ];

      logger.debug(`[${this.getName()}] Tool system initialized in ${Date.now() - startTime}ms`);
      logger.info(
        `[${this.getName()}] Available tools: ${builtInTools.length} built-in + ${relevantSkills.length} Skills`
      );

      // 记录动态技能状态
      if (relevantSkills.length > 0) {
        logger.info(`[${this.getName()}] ${this.getDynamicSkillsStatus()}`);
      }
    } catch (error) {
      logger.error(`[${this.getName()}] Tool system initialization failed:`, error);
      // 完全失败时，确保清空工具列表
      this.availableTools = [];
    }
  }

  /**
   * 将Skill注册为内置工具代理
   * 这样Skill就可以通过ToolDispatcher访问
   */
  private registerSkillAsBuiltInTool(skill: SkillTool): void {
    // 创建代理工具，执行时调用Skills执行器
    const proxyTool: BuiltInTool = {
      name: skill.name,
      description: skill.description,
      type: ToolType.BUILTIN,
      category: skill.tags?.join(", ") || "skill",
      enabled: true,
      level: skill.level,
      parameters: skill.parameters,
      execute: async (args: Record<string, any>) => {
        // 更新最后访问时间
        this.dynamicSkillsLastAccess.set(skill.name, Date.now());

        const result = await this.skillsExecutor.execute({
          name: skill.name,
          args,
        });

        return {
          success: result.success,
          output: result.success ? result.output : result.error,
          duration: result.duration,
          exitCode: result.exitCode,
        };
      },
    };

    // 记录技能注册时间和最后访问时间
    const now = Date.now();
    this.dynamicSkillsLastAccess.set(skill.name, now);

    // 注册到内置工具注册表
    this.builtInRegistry.registerTool(proxyTool);
    logger.debug(
      `[${this.getName()}] Registered skill proxy: ${skill.name} at ${new Date(now).toISOString()}`
    );
  }

  /**
   * 启动自动清理定时器
   * 每分钟检查一次，超过5分钟未使用的Skills将被自动注销
   * 添加防重复启动保护
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      logger.debug(`[${this.getName()}] Cleanup timer already running, skipping`);
      return;
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupUnusedSkills();
    }, 60 * 1000); // 每分钟执行一次

    logger.debug(`[${this.getName()}] Auto-cleanup timer started (interval: 60s, timeout: 5min)`);
  }

  /**
   * 清理超过5分钟未使用的Skills
   * 减少上下文占用，优化性能
   */
  private cleanupUnusedSkills(): void {
    const now = Date.now();
    const skillsToRemove: string[] = [];

    // 找出超过5分钟未使用的技能
    for (const [skillName, lastAccessTime] of this.dynamicSkillsLastAccess.entries()) {
      if (now - lastAccessTime > this.SKILL_TIMEOUT_MS) {
        skillsToRemove.push(skillName);
      }
    }

    if (skillsToRemove.length > 0) {
      logger.debug(`[${this.getName()}] Auto-cleanup starting: ${this.getDynamicSkillsStatus()}`);

      for (const skillName of skillsToRemove) {
        // 从动态追踪中移除
        this.dynamicSkillsLastAccess.delete(skillName);

        // 从内置工具注册表中注销
        this.builtInRegistry.unregisterTool(skillName);

        // 从可用工具列表中移除
        this.availableTools = this.availableTools.filter(
          (tool) => tool.function.name !== skillName
        );

        logger.info(`[${this.getName()}] Auto-unregistered unused skill: ${skillName}`);
      }

      logger.info(
        `[${this.getName()}] Auto-cleanup completed: ${skillsToRemove.length} skills removed`
      );
      logger.info(
        `[${this.getName()}] Remaining active skills: ${this.dynamicSkillsLastAccess.size}`
      );
    }
  }

  /**
   * 停止自动清理定时器
   * 用于资源清理
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.info(`[${this.getName()}] Auto-cleanup timer stopped`);
    }
  }

  /**
   * 关闭策略并清理资源
   * 供外部调用，确保定时器被正确清理
   */
  public shutdown(): void {
    this.stopCleanupTimer();
    logger.info(`[${this.getName()}] Strategy shutdown completed`);
  }

  /**
   * 获取当前动态注册技能的状态
   * 用于调试和监控
   */
  private getDynamicSkillsStatus(): string {
    const now = Date.now();
    const statuses: string[] = [];

    for (const [skillName, lastAccessTime] of this.dynamicSkillsLastAccess.entries()) {
      const age = Math.floor((now - lastAccessTime) / 1000);
      const timeStr =
        age < 60
          ? `${age}s ago`
          : age < 3600
            ? `${Math.floor(age / 60)}m ago`
            : `${Math.floor(age / 3600)}h ago`;
      statuses.push(`${skillName} (${timeStr})`);
    }

    return statuses.length > 0
      ? `Active skills: ${statuses.join(", ")}`
      : "No active dynamic skills";
  }

  private estimatePromptTokens(messages: Message[]): number {
    let totalChars = 0;

    for (const msg of messages) {
      if (typeof msg.content === "string") {
        totalChars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === "text" && part.text) {
            totalChars += part.text.length;
          }
        }
      }
      totalChars += msg.role.length + 10;
    }

    return ErrorClassifier.estimateTokens(String(totalChars));
  }

  private estimateCompletionTokens(content: string, thinkingProcess: string[]): number {
    const contentTokens = ErrorClassifier.estimateTokens(content);
    const thinkingTokens = thinkingProcess
      ? ErrorClassifier.estimateTokens(thinkingProcess.join(" "))
      : 0;

    return contentTokens + thinkingTokens;
  }
}
