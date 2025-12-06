/**
 * ReActStrategy - ReAct聊天处理策略
 * 实现自我思考循环，支持工具调用和流式输出
 * 集成新工具系统：内置工具 + Skills外置工具
 */

import type { Message, ChatOptions } from '../types';
import type { ChatStrategy, ChatResult } from './ChatStrategy';
import type { LLMManager } from '../core/LLMManager';
import type { VariableResolver } from '../services/VariableResolver';
import type { AceIntegrator } from '../services/AceIntegrator';
import type { ConversationHistoryService } from '../services/ConversationHistoryService';
import { ReActEngine } from '../core/stream-orchestrator/ReActEngine';
import { LLMManagerAdapter } from '../core/stream-orchestrator/LLMAdapter';
import { BuiltInToolsRegistry } from '../services/BuiltInToolsRegistry';
import { ToolRetrievalService } from '../services/ToolRetrievalService';
import { BuiltInExecutor } from '../services/executors/BuiltInExecutor';
import { SkillsSandboxExecutor } from '../services/executors/SkillsSandboxExecutor';
import type { Tool } from '../core/stream-orchestrator/types';
import { logger } from '../utils/logger';

export class ReActStrategy implements ChatStrategy {
  private builtInRegistry: BuiltInToolsRegistry;
  private toolRetrievalService: ToolRetrievalService;
  private builtInExecutor: BuiltInExecutor;
  private skillsExecutor: SkillsSandboxExecutor;
  private availableTools: any[] = [];  // ✅ 新增：可用工具列表

  constructor(
    private llmManager: LLMManager,
    private variableResolver: VariableResolver,
    private aceIntegrator: AceIntegrator,
    private historyService: ConversationHistoryService
  ) {
    // 初始化工具系统组件
    this.builtInRegistry = new BuiltInToolsRegistry();
    // 注意：ToolRetrievalService 需要 config，这里暂时用空配置，实际使用时会由外部传入
    const tempConfig = {
      vectorDbPath: '',
      model: 'all-MiniLM-L6-v2',
      dimensions: 384,
      similarityThreshold: 0.6,
      cacheSize: 100
    };
    this.toolRetrievalService = new ToolRetrievalService(tempConfig);
    this.builtInExecutor = new BuiltInExecutor();
    this.skillsExecutor = new SkillsSandboxExecutor();

    logger.info('ReActStrategy initialized with new tool system integration');
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
   * 执行ReAct聊天处理
   */
  async execute(messages: Message[], options: ChatOptions): Promise<ChatResult> {
    const startTime = Date.now();
    const includeThoughtsInResponse = options.selfThinking?.includeThoughtsInResponse ?? true;

    logger.info(`[${this.getName()}] Starting ReAct execution with new tool system`);

    // 1. 工具发现与注册
    await this.initializeToolSystem(messages);

    // 2. 变量替换
    messages = await this.variableResolver.resolve(messages);

    // 3. 初始化 ReAct 引擎
    const reactEngine = new ReActEngine({
      maxIterations: options.selfThinking?.maxIterations ?? 5,
      enableThinking: options.selfThinking?.enableStreamThoughts ?? true,
      maxConcurrentTools: 3,
      provider: options.provider,
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.max_tokens
    });

    // ✅ 新增：将可用工具传递给ReActEngine
    if (this.availableTools.length > 0) {
      (reactEngine as any).tools = this.availableTools;
      logger.debug(`[${this.getName()}] Passed ${this.availableTools.length} tools to ReActEngine`);
    }

    // 4. 执行 ReAct 循环
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

      // 5. ACE Integration: 保存轨迹
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
   */
  async *stream(
    messages: Message[],
    options: ChatOptions,
    abortSignal?: AbortSignal
  ): AsyncIterableIterator<any> {
    logger.debug(`[${this.getName()}] Streaming ReAct execution`);

    // 变量替换
    messages = await this.variableResolver.resolve(messages);

    // 初始化 ReAct 引擎
    const reactEngine = new ReActEngine({
      maxIterations: options.selfThinking?.maxIterations ?? 5,
      enableThinking: options.selfThinking?.enableStreamThoughts ?? true,
      maxConcurrentTools: 3,
      provider: options.provider,
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.max_tokens
    });

    const llmClient = new LLMManagerAdapter(this.llmManager);
    const stream = reactEngine.execute(messages, llmClient, {});

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
      if (options.selfThinking?.enableStreamThoughts && event.type === 'reasoning') {
        yield `__THOUGHT__:${JSON.stringify({ iteration: event.iteration, content: event.data })}`;
        collectedThinking.push(event.data);
      } else if (event.type === 'content') {
        yield event.data;
        collectedContent += event.data;
      }
    }

    // ✅ ChaService会统一保存历史，策略层只返回数据
    // 返回收集的思考过程和内容
    return {
      content: collectedContent,
      rawThinkingProcess: collectedThinking
    };
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
      logger.debug(`[${this.getName()}] Loaded ${builtInTools.length} built-in tools`);

      // 2. 向量检索相关Skills
      const query = messages[messages.length - 1]?.content || '';
      const relevantSkills = await this.toolRetrievalService.findRelevantSkills(
        query,
        10, // limit
        0.6 // threshold
      );

      logger.debug(`[${this.getName()}] Found ${relevantSkills.length} relevant Skills for query: "${query.substring(0, 50)}..."`);

      // 3. 注册检索到的Skills到Skills执行器
      for (const skill of relevantSkills) {
        // 创建Skills执行包装器
        const skillExecuteWrapper = async (args: Record<string, any>) => {
          const result = await this.skillsExecutor.execute({
            name: skill.tool.name,
            args
          });
          return result;
        };

        // 注册到Skills执行器
        // 注意：Skills执行器内部会加载实际的Skills代码
      }

      // ✅ 新增：构建工具列表传递给LLM
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
      logger.info(`[${this.getName()}] Registered ${this.availableTools.length} tools for LLM`);

    } catch (error) {
      logger.warn(`[${this.getName()}] Tool system initialization failed:`, error);
      // 降级处理：继续执行，只是没有可用的工具
      this.availableTools = []; // 确保清空工具列表
    }
  }

  /**
   * 注册工具到ReAct引擎
   */
  private registerToolsToReActEngine(reactEngine: ReActEngine, options: ChatOptions): void {
    const builtInToolCount = this.builtInRegistry.listAllTools().length;
    logger.debug(`[${this.getName()}] ReActEngine tool registration stub - ${builtInToolCount} built-in tools available`);
    // TODO: 实现 ReActEngine 工具注册逻辑
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

  /**
   * 执行自定义工具（由ChatService传递的工具定义）
   */
  private async executeCustomTool(toolName: string, params: Record<string, any>): Promise<any> {
    logger.info(`[${this.getName()}] Executing custom tool: ${toolName}`, params);

    // 这里可以扩展为支持更多自定义工具类型
    // 目前主要处理options传递的工具定义
    switch (toolName) {
      case 'custom_business_logic':
        return { result: 'Custom business result', params };
      default:
        throw new Error(`[${this.getName()}] Unknown custom tool: ${toolName}`);
    }
  }

  /**
   * 注册默认工具 (暂存函数 - 未实现)
   */
  private registerDefaultTools(_skillExecutor: any): void {
    // 这里应该由ChatService传递默认工具，避免重复定义
    // 暂时为空，由ChatService在初始化时传递
  }
}
