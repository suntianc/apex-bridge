/**
 * ReActStrategy - ReAct聊天处理策略
 * 实现自我思考循环，支持工具调用和流式输出
 * 集成新工具系统：内置工具 + Skills外置工具 + tool_action标签解析
 */

import type { Message, ChatOptions } from '../types';
import type { ChatStrategy, ChatResult, StrategyPrepareResult } from './ChatStrategy';
import type { LLMManager } from '../core/LLMManager';
import type { AceIntegrator } from '../services/AceIntegrator';
import type { ConversationHistoryService } from '../services/ConversationHistoryService';
import { ReActEngine } from '../core/stream-orchestrator/ReActEngine';
import { LLMManagerAdapter } from '../core/stream-orchestrator/LLMAdapter';
import { BuiltInToolsRegistry } from '../services/BuiltInToolsRegistry';
import { ToolRetrievalService } from '../services/ToolRetrievalService';
import { BuiltInExecutor } from '../services/executors/BuiltInExecutor';
import { SkillsSandboxExecutor } from '../services/executors/SkillsSandboxExecutor';
import { generateToolPrompt, ToolDispatcher } from '../core/tool-action';
import type { Tool } from '../core/stream-orchestrator/types';
import { logger } from '../utils/logger';

export class ReActStrategy implements ChatStrategy {
  private builtInRegistry: BuiltInToolsRegistry;
  private toolRetrievalService: ToolRetrievalService;
  private builtInExecutor: BuiltInExecutor;
  private skillsExecutor: SkillsSandboxExecutor;
  private toolDispatcher: ToolDispatcher;
  private availableTools: any[] = [];

  constructor(
    private llmManager: LLMManager,
    private aceIntegrator: AceIntegrator,
    private historyService: ConversationHistoryService
  ) {
    // 初始化工具系统组件
    this.builtInRegistry = new BuiltInToolsRegistry();
    // ToolRetrievalService 配置（使用合理的默认路径）
    const toolRetrievalConfig = {
      vectorDbPath: './data',
      model: 'all-MiniLM-L6-v2',
      dimensions: 384, // 初始值，会在初始化时被实际模型维度覆盖
      similarityThreshold: 0.6,
      cacheSize: 100
    };
    this.toolRetrievalService = new ToolRetrievalService(toolRetrievalConfig);
    this.builtInExecutor = new BuiltInExecutor();
    this.skillsExecutor = new SkillsSandboxExecutor();
    this.toolDispatcher = new ToolDispatcher();

    logger.info('ReActStrategy initialized with tool_action parsing support');
  }

  getName(): string {
    return 'ReActStrategy';
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
    const toolPromptContent = this.generateToolPromptContent();

    // 3. 返回需要注入的变量
    return {
      variables: {
        available_tools: toolPromptContent
      }
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
      maxIterations: options.selfThinking?.maxIterations ?? Number.MAX_SAFE_INTEGER,
      enableThinking: options.selfThinking?.enableStreamThoughts ?? true,
      maxConcurrentTools: 3,
      enableToolActionParsing: options.selfThinking?.enableToolActionParsing ?? true,
      toolActionTimeout: options.selfThinking?.toolActionTimeout ?? 30000,
      provider: options.provider,
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.max_tokens
    });

    // 将可用工具传递给ReActEngine
    if (this.availableTools.length > 0) {
      (reactEngine as any).tools = this.availableTools;
      logger.debug(`[${this.getName()}] Passed ${this.availableTools.length} tools to ReActEngine`);
    }

    // 执行 ReAct 循环
    const thinkingProcess: string[] = [];
    let finalContent = '';
    let iterations = 0;

    try {
      const llmClient = new LLMManagerAdapter(this.llmManager);
      const stream = reactEngine.execute(messages, llmClient, {});

      for await (const event of stream) {
        iterations = event.iteration;

        if (event.type === 'reasoning') {
          thinkingProcess.push(event.data);
        } else if (event.type === 'content') {
          finalContent += event.data;
        }
      }

      logger.debug(`[${this.getName()}] ReAct completed in ${iterations} iterations`);

      // ACE Integration: 保存轨迹
      if (options.sessionId && this.aceIntegrator.isEnabled()) {
        await this.aceIntegrator.saveTrajectory({
          requestId: options.requestId || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          sessionId: options.sessionId,
          messages: messages,
          finalContent: finalContent,
          thinkingProcess: thinkingProcess,
          iterations: iterations,
          isReAct: true
        });

        // 更新会话活动时间
        this.aceIntegrator.updateSessionActivity(options.sessionId).catch(err => {
          logger.warn(`[${this.getName()}] Failed to update session activity: ${err.message}`);
        });
      }

      // 返回结果（包含原始思考过程，供ChatService统一保存）
      return {
        content: finalContent,
        iterations,
        thinkingProcess: includeThoughtsInResponse ? thinkingProcess.join('\n') : undefined,
        rawThinkingProcess: thinkingProcess,  // 原始思考过程
        usage: undefined // TODO: 从LLMClient获取usage
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

    // 初始化 ReAct 引擎（启用 tool_action 标签解析）
    const reactEngine = new ReActEngine({
      maxIterations: options.selfThinking?.maxIterations ?? 5,
      enableThinking: options.selfThinking?.enableStreamThoughts ?? true,
      maxConcurrentTools: 3,
      enableToolActionParsing: options.selfThinking?.enableToolActionParsing ?? true,
      toolActionTimeout: options.selfThinking?.toolActionTimeout ?? 30000,
      provider: options.provider,
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.max_tokens
    });

    const llmClient = new LLMManagerAdapter(this.llmManager);
    const stream = reactEngine.execute(messages, llmClient, { signal: abortSignal });

    // 收集用于历史记录的数据
    const collectedThinking: string[] = [];
    let collectedContent = '';

    for await (const event of stream) {
      // 检查中断
      if (abortSignal?.aborted) {
        logger.debug(`[${this.getName()}] ReAct stream aborted`);
        return;
      }

      // 流式输出事件
      // 输出 JSON 格式字符串，与 SingleRoundStrategy 保持一致，便于前端 parseLLMChunk 解析
      if (event.type === 'reasoning') {
        const jsonChunk = JSON.stringify({ reasoning_content: event.data, content: null });
        yield jsonChunk;
        collectedThinking.push(event.data);
      } else if (event.type === 'content') {
        const jsonChunk = JSON.stringify({ reasoning_content: null, content: event.data });
        yield jsonChunk;
        collectedContent += event.data;
      }
    }

    // ✅ ChatService会统一保存历史，策略层只返回数据
    // 返回收集的思考过程和内容
    return {
      content: collectedContent,
      rawThinkingProcess: collectedThinking
    };
  }

  /**
   * 生成工具提示词内容（用于变量替换）
   */
  private generateToolPromptContent(): string {
    const toolDescriptions = this.toolDispatcher.getAvailableTools();

    if (toolDescriptions.length === 0) {
      logger.debug(`[${this.getName()}] No tools available, returning empty prompt`);
      return '当前没有可用的工具。';
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
        // ✅ 确保 ToolRetrievalService 已初始化（加载 embedding 模型配置）
        await this.toolRetrievalService.initialize();

        const query = messages[messages.length - 1]?.content || '';
        relevantSkills = await this.toolRetrievalService.findRelevantSkills(
          query,
          10, // limit
          0.6 // threshold
        );
        logger.debug(`[${this.getName()}] Found ${relevantSkills.length} relevant Skills`);
      } catch (skillError) {
        // Skills 检索失败，降级处理：只使用内置工具
        logger.warn(`[${this.getName()}] Skills retrieval failed, using built-in tools only:`,
          skillError instanceof Error ? skillError.message : skillError);
        relevantSkills = [];
      }

      // 3. 构建工具列表（内置工具 + Skills）
      this.availableTools = [
        ...builtInTools.map(tool => ({
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
          }
        })),
        ...relevantSkills.map(skill => ({
          type: 'function' as const,
          function: {
            name: skill.tool.name,
            description: skill.tool.description,
            parameters: skill.tool.parameters
          }
        }))
      ];

      logger.info(`[${this.getName()}] Tool system initialized in ${Date.now() - startTime}ms`);
      logger.info(`[${this.getName()}] Available tools: ${builtInTools.length} built-in + ${relevantSkills.length} Skills`);

    } catch (error) {
      logger.error(`[${this.getName()}] Tool system initialization failed:`, error);
      // 完全失败时，确保清空工具列表
      this.availableTools = [];
    }
  }

  /**
   * 执行工具（双执行器路由）
   */
  private async executeTool(toolName: string, params: Record<string, any>): Promise<any> {
    const startTime = Date.now();

    try {
      // 1. 先尝试内置执行器（零开销）
      const builtInResult = await this.builtInExecutor.execute({
        name: toolName,
        args: params
      }).catch(() => null);

      if (builtInResult?.success) {
        logger.debug(`[${this.getName()}] Built-in tool executed: ${toolName} (${Date.now() - startTime}ms)`);
        return builtInResult.output;
      }

      // 2. 尝试Skills执行器（进程隔离）
      const skillResult = await this.skillsExecutor.execute({
        name: toolName,
        args: params
      });

      if (skillResult.success) {
        logger.debug(`[${this.getName()}] Skills tool executed: ${toolName} (${Date.now() - startTime}ms)`);
        return skillResult.output;
      }

      throw new Error(`Tool execution failed: ${toolName}`);

    } catch (error) {
      logger.error(`[${this.getName()}] Tool execution failed: ${toolName}`, error);
      throw error;
    }
  }
}
