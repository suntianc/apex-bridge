/**
 * AceStrategyOrchestrator - ACE策略编排器（L4执行功能层）
 *
 * 职责：
 * - 任务拆解：将用户请求分解为子任务DAG
 * - 任务编排：按依赖关系顺序执行
 * - 任务监控：跟踪任务状态和进度
 * - L4 ↔ L5层级通信：下发任务、接收完成上报
 *
 * 内存管理改进：
 * - 使用LRU缓存限制任务队列和状态Map大小
 * - 任务完成后立即清理状态
 * - 定期清理过期任务数据
 *
 * 错误处理改进：
 * - 任务失败后实现快速返回机制
 * - 区分可恢复和不可恢复错误
 */

import type { Message, ChatOptions } from '../types';
import type { ChatStrategy, ChatResult } from './ChatStrategy';
import type { LLMManager } from '../core/LLMManager';
import type { AceIntegrator } from '../services/AceIntegrator';
import type { SessionManager } from '../services/SessionManager';
import type { AceEthicsGuard } from '../services/AceEthicsGuard';
import { logger } from '../utils/logger';
import { LRUMap } from '../utils/cache';

/**
 * 任务状态枚举
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * 任务定义接口
 */
export interface Task {
  /** 任务唯一ID */
  id: string;
  /** 任务描述 */
  description: string;
  /** 依赖的任务ID列表 */
  dependencies: string[];
  /** 任务相关的消息 */
  messages: Message[];
  /** 任务执行选项 */
  options: ChatOptions;
  /** 是否需要工具调用 */
  requiresToolCall: boolean;
  /** 任务状态 */
  status: TaskStatus;
  /** 任务执行结果 */
  result?: ChatResult;
  /** 创建时间 */
  createdAt: number;
  /** 开始时间 */
  startedAt?: number;
  /** 完成时间 */
  completedAt?: number;
  /** 错误信息 */
  error?: string;
}

/**
 * 任务状态更新接口
 */
export interface TaskStatusUpdate {
  taskId: string;
  status: TaskStatus;
  result?: ChatResult;
  error?: string;
  updatedAt: number;
}

/**
 * 任务拆解结果接口
 */
interface DecompositionResult {
  tasks: Array<{
    id: string;
    description: string;
    dependencies: string[];
    requiresToolCall: boolean;
  }>;
  reasoning: string;
}

/**
 * ACE编排选项接口
 */
export interface AceOrchestrationOptions {
  /** 是否启用ACE编排 */
  enabled?: boolean;
  /** 最大任务数限制 */
  maxTasks?: number;
  /** 任务执行超时（毫秒） */
  taskTimeout?: number;
  /** 是否允许并发执行 */
  allowParallel?: boolean;
  /** 最大并发任务数 */
  maxConcurrent?: number;
}

/**
 * ACE策略编排器
 * 将ChatService的策略选择逻辑提升到L4（执行功能层）
 */
export class AceStrategyOrchestrator {
  // ========== 配置常量 ==========
  private static readonly MAX_TASK_QUEUES = 100;        // 最大任务队列数
  private static readonly MAX_TASK_STATUSES = 1000;     // 最大任务状态数
  private static readonly TASK_STATUS_TTL_MS = 30 * 60 * 1000; // 任务状态30分钟过期
  private static readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5分钟清理一次
  private static readonly DEFAULT_MAX_TASKS = 100;
  private static readonly DEFAULT_TASK_TIMEOUT = 30000; // 30秒
  private static readonly DEFAULT_MAX_CONCURRENT = 3;

  /**
   * 任务队列存储（sessionId -> Task[]）- 使用LRU缓存
   */
  private taskQueues: LRUMap<string, Task[]> = new LRUMap(
    AceStrategyOrchestrator.MAX_TASK_QUEUES
  );

  /**
   * 任务状态存储（taskId -> TaskStatusUpdate）- 使用LRU缓存
   */
  private taskStatusMap: LRUMap<string, TaskStatusUpdate> = new LRUMap(
    AceStrategyOrchestrator.MAX_TASK_STATUSES
  );

  /** 进度回调函数 */
  private progressCallback?: (status: TaskStatusUpdate) => void;

  /** 定期清理定时器 */
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private aceIntegrator: AceIntegrator,
    private strategies: ChatStrategy[],
    private llmManager: LLMManager,
    private sessionManager: SessionManager
  ) {
    // 启动定期清理
    this.startPeriodicCleanup();

    logger.info('[AceStrategyOrchestrator] Initialized with LRU cache (L4 Executive Function Layer)');
  }

  /**
   * 启动定期清理任务
   */
  private startPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredTasks();
    }, AceStrategyOrchestrator.CLEANUP_INTERVAL_MS);

    // 确保不阻止进程退出
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * 清理过期任务状态
   */
  private cleanupExpiredTasks(): void {
    const now = Date.now();
    const expiredTasks: string[] = [];

    for (const [taskId, status] of this.taskStatusMap.entries()) {
      // 清理超过TTL的已完成或失败的任务
      if (
        (status.status === 'completed' || status.status === 'failed') &&
        (now - status.updatedAt) > AceStrategyOrchestrator.TASK_STATUS_TTL_MS
      ) {
        expiredTasks.push(taskId);
      }
    }

    for (const taskId of expiredTasks) {
      this.taskStatusMap.delete(taskId);
    }

    if (expiredTasks.length > 0) {
      logger.debug(`[AceStrategyOrchestrator] Cleaned up ${expiredTasks.length} expired task statuses`);
    }
  }

  /**
   * 销毁服务，清理资源
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.taskQueues.clear();
    this.taskStatusMap.clear();

    logger.info('[AceStrategyOrchestrator] Destroyed and cleaned up all resources');
  }

  /**
   * 主编排方法
   * 分析用户请求，拆解为任务DAG并执行
   */
  async orchestrate(
    messages: Message[],
    options: ChatOptions
  ): Promise<ChatResult> {
    const sessionId = options.sessionId || this.generateSessionId();
    const orchestrationOptions = options.aceOrchestration || {};

    logger.info(`[AceStrategyOrchestrator] Starting orchestration (session: ${sessionId})`);

    try {
      // L4分析：将用户请求拆解为任务队列
      const taskQueue = await this.decomposeToTasks(messages, sessionId, options);

      // 快速通道：简单任务直接执行
      if (taskQueue.length === 0) {
        logger.debug('[AceStrategyOrchestrator] Empty task queue, executing as simple task');
        return this.executeSimpleTask(messages, options);
      }

      if (taskQueue.length === 1 && !taskQueue[0].requiresToolCall) {
        logger.debug('[AceStrategyOrchestrator] Single simple task, using fast path');
        return this.executeSimpleTask(messages, options);
      }

      // 保存任务队列
      this.taskQueues.set(sessionId, taskQueue);

      // 复杂任务：DAG执行
      return await this.executeTaskDAG(taskQueue, sessionId, options);

    } catch (error: any) {
      logger.error(`[AceStrategyOrchestrator] Orchestration failed: ${error.message}`);

      // 降级：作为简单任务执行
      logger.info('[AceStrategyOrchestrator] Falling back to simple task execution');
      return this.executeSimpleTask(messages, options);
    }
  }

  /**
   * 任务拆解方法
   * 使用LLMManager分析用户意图并拆解为子任务
   */
  private async decomposeToTasks(
    messages: Message[],
    sessionId: string,
    options: ChatOptions
  ): Promise<Task[]> {
    const userQuery = this.extractUserQuery(messages);

    // 简单任务检测：如果查询较短且无明显复杂指标，跳过拆解
    if (this.isSimpleQuery(userQuery)) {
      logger.debug('[AceStrategyOrchestrator] Simple query detected, skipping decomposition');
      return [];
    }

    const prompt = this.buildDecompositionPrompt(userQuery, messages);

    try {
      logger.debug('[AceStrategyOrchestrator] Starting task decomposition via LLM');

      const response = await this.llmManager.chat([
        {
          role: 'system',
          content: this.getDecompositionSystemPrompt()
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        stream: false,
        temperature: 0.3, // 低温度确保输出稳定
        max_tokens: 2000
      });

      const rawContent = response.choices[0]?.message?.content || '{"tasks":[],"reasoning":""}';
      const decomposition = this.parseDecompositionResult(rawContent);

      logger.info(`[AceStrategyOrchestrator] Decomposed into ${decomposition.tasks.length} tasks`);
      logger.debug(`[AceStrategyOrchestrator] Reasoning: ${decomposition.reasoning}`);

      // 转换为Task对象
      return this.buildTaskQueue(decomposition, messages, options);

    } catch (error: any) {
      logger.error(`[AceStrategyOrchestrator] Task decomposition failed: ${error.message}`);
      // 返回空数组，让主流程降级处理
      return [];
    }
  }

  /**
   * 执行任务DAG
   * 按拓扑排序顺序执行任务
   */
  private async executeTaskDAG(
    taskQueue: Task[],
    sessionId: string,
    options: ChatOptions
  ): Promise<ChatResult> {
    const results: ChatResult[] = [];
    const completedTasks = new Set<string>();

    try {
      // 🆕 L4战略提交前，先经过L1伦理审查
      const ethicsGuard = this.getEthicsGuard();
      if (ethicsGuard) {
        const strategy = {
          goal: `Execute task DAG with ${taskQueue.length} tasks`,
          plan: taskQueue.map(t => `- ${t.description}`).join('\n'),
          layer: 'L4_EXECUTIVE_FUNCTION'
        };

        const reviewResult = await ethicsGuard.reviewStrategy(strategy);
        if (!reviewResult.approved) {
          logger.warn(`[AceStrategyOrchestrator] L1伦理审查未通过: ${reviewResult.reason}`);

          // 记录审查失败到L1层
          await this.aceIntegrator.sendToLayer('ASPIRATIONAL', {
            type: 'STRATEGY_REJECTED',
            content: `L4战略执行被拒绝`,
            metadata: {
              reason: reviewResult.reason,
              suggestions: reviewResult.suggestions,
              taskCount: taskQueue.length,
              timestamp: Date.now()
            }
          });

          throw new Error(`L1伦理审查未通过: ${reviewResult.reason}`);
        }

        logger.info('[AceStrategyOrchestrator] L1伦理审查通过，继续执行');
      }

      // 拓扑排序：确定执行顺序
      const executionOrder = this.topologicalSort(taskQueue);

      logger.info(`[AceStrategyOrchestrator] Execution order: ${executionOrder.join(' -> ')}`);

      // 按顺序执行任务
      for (const taskId of executionOrder) {
        const task = taskQueue.find(t => t.id === taskId);
        if (!task) {
          logger.warn(`[AceStrategyOrchestrator] Task not found: ${taskId}`);
          continue;
        }

        try {
          // 检查依赖是否完成
          if (!this.areDependenciesMet(task, completedTasks)) {
            throw new Error(`Task ${taskId} dependencies not met`);
          }

          // 更新任务状态为运行中
          task.status = 'running';
          task.startedAt = Date.now();
          await this.updateTaskStatus(taskId, 'running', sessionId);

          // L4 -> L5：下发单一任务
          await this.dispatchTaskToL5(task, sessionId);

          // 构建任务消息（注入上下文）
          const taskMessages = this.buildTaskMessages(task, task.messages, results);

          // 选择策略并执行
          const strategy = this.selectStrategyForTask(task);
          logger.debug(`[AceStrategyOrchestrator] Executing task ${taskId} with strategy: ${strategy.getName()}`);

          const result = await strategy.execute(taskMessages, {
            ...task.options,
            sessionId,
            requestId: task.id
          }) as ChatResult;

          results.push(result);

          // L5 -> L4：任务完成上报
          await this.aceIntegrator.completeTask(sessionId, {
            summary: `Task ${task.id} completed: ${task.description}`,
            outcome: 'success'
          });

          // 更新任务状态为完成
          task.status = 'completed';
          task.completedAt = Date.now();
          task.result = result;
          await this.updateTaskStatus(taskId, 'completed', sessionId, result);
          completedTasks.add(taskId);

          logger.info(`[AceStrategyOrchestrator] Task completed: ${taskId} (${Date.now() - task.startedAt!}ms)`);

        } catch (error: any) {
          logger.error(`[AceStrategyOrchestrator] Task failed: ${taskId}`, error);

          // 更新任务状态为失败
          task.status = 'failed';
          task.completedAt = Date.now();
          task.error = error.message;
          await this.updateTaskStatus(taskId, 'failed', sessionId, undefined, error.message);

          // 上报失败到L5
          await this.aceIntegrator.completeTask(sessionId, {
            summary: `Task ${task.id} failed: ${error.message}`,
            outcome: 'failed'
          });

          // 检查是否为关键任务失败（有其他任务依赖于它）
          const hasDependents = taskQueue.some(t =>
            t.dependencies.includes(taskId) && t.status === 'pending'
          );

          if (hasDependents) {
            // 关键任务失败，快速返回错误
            logger.warn(`[AceStrategyOrchestrator] Critical task ${taskId} failed, aborting remaining tasks`);

            // 标记所有依赖此任务的任务为失败
            for (const t of taskQueue) {
              if (t.dependencies.includes(taskId) && t.status === 'pending') {
                t.status = 'failed';
                t.error = `Dependency ${taskId} failed`;
                await this.updateTaskStatus(t.id, 'failed', sessionId, undefined, t.error);
              }
            }

            // 返回已完成的结果和错误信息
            results.push({
              content: `[Critical task ${taskId} failed: ${error.message}. Remaining tasks aborted.]`,
              iterations: 0
            });

            // 快速返回，不继续执行
            return this.mergeResults(results);
          }

          // 非关键任务失败，记录错误但继续执行其他任务
          results.push({
            content: `[Task ${taskId} failed: ${error.message}]`,
            iterations: 0
          });
        }
      }

      return this.mergeResults(results);

    } finally {
      // 清理任务队列
      this.taskQueues.delete(sessionId);
    }
  }

  /**
   * 执行简单任务（快速通道）
   * 直接使用策略执行，跳过L4编排
   */
  private async executeSimpleTask(
    messages: Message[],
    options: ChatOptions
  ): Promise<ChatResult> {
    const strategy = this.selectDefaultStrategy(options);
    logger.debug(`[AceStrategyOrchestrator] Fast path: using ${strategy.getName()}`);
    return strategy.execute(messages, options) as Promise<ChatResult>;
  }

  /**
   * 构建任务拆解提示词
   */
  private buildDecompositionPrompt(userQuery: string, messages: Message[]): string {
    // 提取对话历史上下文
    const historyContext = messages
      .slice(0, -1)
      .filter(m => m.role !== 'system')
      .map(m => `${m.role}: ${m.content.substring(0, 200)}`)
      .join('\n');

    return `
用户请求：${userQuery}

${historyContext ? `对话历史：\n${historyContext}\n` : ''}

请将此任务分解为多个子任务。返回JSON格式：

{
  "tasks": [
    {
      "id": "task_1",
      "description": "任务描述",
      "dependencies": [],
      "requiresToolCall": true
    }
  ],
  "reasoning": "为什么这样分解"
}

约束条件：
1. 每个任务应该是原子性的，不可再分
2. 按照依赖关系排序，无依赖的任务排在前面
3. 如果需要工具调用（如搜索、计算、文件操作等），设置requiresToolCall为true
4. 任务描述要清晰、具体
5. 如果是简单任务（单一问答、无需多步骤），返回空数组
6. 最多拆解为5个子任务
7. 确保dependencies中的ID在tasks中存在

只返回JSON，不要其他内容。
`;
  }

  /**
   * 获取任务拆解系统提示词
   */
  private getDecompositionSystemPrompt(): string {
    return `You are a task decomposition expert. Your job is to analyze user requests and break them down into a DAG (Directed Acyclic Graph) of subtasks.

Rules:
1. Identify atomic, independent subtasks
2. Determine dependencies between tasks
3. Output valid JSON only
4. Keep task descriptions concise but clear
5. Set requiresToolCall=true if the task needs external tools/APIs
6. Return empty tasks array for simple queries

You must return valid JSON matching the specified format.`;
  }

  /**
   * 解析任务拆解结果
   */
  private parseDecompositionResult(rawContent: string): DecompositionResult {
    try {
      // 尝试提取JSON部分
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // 验证格式
      if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
        return { tasks: [], reasoning: 'Invalid format, falling back to simple execution' };
      }

      // 验证任务格式
      const validTasks = parsed.tasks.filter((t: any) =>
        t.id && typeof t.id === 'string' &&
        t.description && typeof t.description === 'string'
      );

      return {
        tasks: validTasks.map((t: any) => ({
          id: t.id,
          description: t.description,
          dependencies: Array.isArray(t.dependencies) ? t.dependencies : [],
          requiresToolCall: Boolean(t.requiresToolCall)
        })),
        reasoning: parsed.reasoning || ''
      };

    } catch (error: any) {
      logger.warn(`[AceStrategyOrchestrator] Failed to parse decomposition result: ${error.message}`);
      return { tasks: [], reasoning: 'Parse error, falling back to simple execution' };
    }
  }

  /**
   * 构建任务队列
   */
  private buildTaskQueue(
    decomposition: DecompositionResult,
    messages: Message[],
    options: ChatOptions
  ): Task[] {
    const now = Date.now();

    return decomposition.tasks.map((taskDef, index) => ({
      id: taskDef.id || `task_${now}_${index}`,
      description: taskDef.description,
      dependencies: taskDef.dependencies,
      messages: messages,
      options: this.buildTaskOptions(options, taskDef),
      requiresToolCall: taskDef.requiresToolCall,
      status: 'pending' as TaskStatus,
      createdAt: now
    }));
  }

  /**
   * 构建任务选项
   */
  private buildTaskOptions(
    originalOptions: ChatOptions,
    taskDef: { requiresToolCall: boolean; description: string }
  ): ChatOptions {
    return {
      ...originalOptions,
      // 根据任务类型设置selfThinking
      selfThinking: taskDef.requiresToolCall ? {
        enabled: true,
        includeThoughtsInResponse: false, // 编排模式下不输出思考过程
        maxIterations: 10,
        enableStreamThoughts: true,
        enableToolActionParsing: true
      } : originalOptions.selfThinking,
      // 清除ACE编排标志，避免递归
      aceOrchestration: undefined
    };
  }

  /**
   * 构建任务消息
   * 注入上下文和前序任务结果
   */
  private buildTaskMessages(
    task: Task,
    originalMessages: Message[],
    previousResults: ChatResult[]
  ): Message[] {
    const taskMessages: Message[] = [];

    // 添加系统消息（如果原消息有）
    const systemMsg = originalMessages.find(m => m.role === 'system');
    if (systemMsg) {
      taskMessages.push(systemMsg);
    }

    // 添加任务上下文
    if (previousResults.length > 0) {
      const contextSummary = previousResults
        .map((r, i) => `[Task ${i + 1} Result]: ${r.content.substring(0, 500)}`)
        .join('\n\n');

      taskMessages.push({
        role: 'system',
        content: `Previous task results:\n${contextSummary}`
      });
    }

    // 添加任务指令
    taskMessages.push({
      role: 'user',
      content: task.description
    });

    return taskMessages;
  }

  /**
   * 拓扑排序（Kahn算法）
   * 确定任务执行顺序
   */
  private topologicalSort(tasks: Task[]): string[] {
    const inDegree = new Map<string, number>();
    const graph = new Map<string, string[]>();

    // 初始化
    tasks.forEach(task => {
      inDegree.set(task.id, 0);
      graph.set(task.id, []);
    });

    // 计算入度和构建图
    tasks.forEach(task => {
      task.dependencies.forEach(dep => {
        // 只处理存在的依赖
        if (graph.has(dep)) {
          graph.get(dep)!.push(task.id);
          inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
        } else {
          logger.warn(`[AceStrategyOrchestrator] Unknown dependency: ${dep} for task ${task.id}`);
        }
      });
    });

    // Kahn算法
    const queue: string[] = [];
    inDegree.forEach((degree, taskId) => {
      if (degree === 0) {
        queue.push(taskId);
      }
    });

    const result: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      graph.get(current)!.forEach(neighbor => {
        const newDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      });
    }

    // 检查是否有环
    if (result.length !== tasks.length) {
      logger.error('[AceStrategyOrchestrator] Dependency cycle detected!');
      throw new Error('Task dependency cycle detected');
    }

    return result;
  }

  /**
   * 检查任务依赖是否满足
   */
  private areDependenciesMet(task: Task, completedTasks: Set<string>): boolean {
    return task.dependencies.every(dep => completedTasks.has(dep));
  }

  /**
   * 选择任务策略
   * 复用项目现有的supports机制
   */
  private selectStrategyForTask(task: Task): ChatStrategy {
    // 使用策略的 supports 方法进行匹配
    for (const strategy of this.strategies) {
      if (strategy.supports(task.options)) {
        return strategy;
      }
    }

    // 默认返回ReAct策略（如果任务需要工具调用）
    if (task.requiresToolCall) {
      const reactStrategy = this.strategies.find(s => s.getName() === 'ReActStrategy');
      if (reactStrategy) return reactStrategy;
    }

    // 最后降级到第一个策略
    return this.strategies[0];
  }

  /**
   * 选择默认策略
   */
  private selectDefaultStrategy(options: ChatOptions): ChatStrategy {
    for (const strategy of this.strategies) {
      if (strategy.supports(options)) {
        return strategy;
      }
    }
    return this.strategies[0];
  }

  /**
   * 更新任务状态
   */
  private async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    sessionId: string,
    result?: ChatResult,
    error?: string
  ): Promise<void> {
    const statusUpdate: TaskStatusUpdate = {
      taskId,
      status,
      result,
      error,
      updatedAt: Date.now()
    };

    this.taskStatusMap.set(taskId, statusUpdate);

    // 上报到L3（Agent Model Layer）- 为P2准备
    try {
      await this.aceIntegrator.sendToLayer('AGENT_MODEL', {
        type: 'TASK_STATUS_UPDATE',
        content: `Task ${taskId} status: ${status}`,
        metadata: {
          taskId,
          status,
          sessionId,
          timestamp: Date.now()
        }
      });
    } catch (err: any) {
      logger.warn(`[AceStrategyOrchestrator] Failed to report status to L3: ${err.message}`);
    }

    // 触发进度回调
    if (this.progressCallback) {
      this.progressCallback(statusUpdate);
    }
  }

  /**
   * 下发任务到L5层
   */
  private async dispatchTaskToL5(task: Task, sessionId: string): Promise<void> {
    await this.aceIntegrator.sendToLayer('COGNITIVE_CONTROL', {
      type: 'TASK',
      content: task.description,
      metadata: {
        taskId: task.id,
        dependencies: task.dependencies,
        requiresToolCall: task.requiresToolCall,
        sessionId
      }
    });

    logger.debug(`[AceStrategyOrchestrator] Task dispatched to L5: ${task.id}`);
  }

  /**
   * 合并任务结果
   */
  private mergeResults(results: ChatResult[]): ChatResult {
    if (results.length === 0) {
      return { content: '', iterations: 0 };
    }

    if (results.length === 1) {
      return results[0];
    }

    return {
      content: results.map((r, i) => {
        // 过滤掉失败消息的前缀
        const content = r.content.startsWith('[Task ') && r.content.includes('failed')
          ? r.content
          : r.content;
        return content;
      }).join('\n\n---\n\n'),
      iterations: results.reduce((sum, r) => sum + (r.iterations || 0), 0),
      thinkingProcess: results
        .filter(r => r.thinkingProcess)
        .map(r => r.thinkingProcess)
        .join('\n---\n'),
      rawThinkingProcess: results
        .filter(r => r.rawThinkingProcess)
        .flatMap(r => r.rawThinkingProcess || [])
    };
  }

  /**
   * 提取用户查询
   */
  private extractUserQuery(messages: Message[]): string {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    return lastUserMessage?.content || '';
  }

  /**
   * 检测是否为简单查询
   */
  private isSimpleQuery(query: string): boolean {
    // 查询过短
    if (query.length < 30) return true;

    // 简单问答关键词
    const simplePatterns = [
      /^(什么|谁|哪|怎么|为什么|是否|多少).{0,20}[?？]?$/,
      /^(请问|麻烦|帮我).{0,15}(说|讲|解释|介绍)/,
      /^你(好|是|能|会)/
    ];

    for (const pattern of simplePatterns) {
      if (pattern.test(query)) return true;
    }

    return false;
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `ace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 设置进度回调
   */
  setProgressCallback(callback: (status: TaskStatusUpdate) => void): void {
    this.progressCallback = callback;
  }

  /**
   * 获取任务队列状态
   */
  getTaskQueueStatus(sessionId: string): Task[] | undefined {
    return this.taskQueues.get(sessionId);
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId: string): TaskStatusUpdate | undefined {
    return this.taskStatusMap.get(taskId);
  }

  /**
   * 清理会话任务
   */
  clearSessionTasks(sessionId: string): void {
    this.taskQueues.delete(sessionId);
    // 清理相关任务状态
    const tasksToDelete: string[] = [];
    for (const [taskId, status] of this.taskStatusMap.entries()) {
      // 通过sessionId匹配任务状态（假设taskId包含sessionId前缀）
      if (taskId.startsWith(sessionId)) {
        tasksToDelete.push(taskId);
      }
    }
    for (const taskId of tasksToDelete) {
      this.taskStatusMap.delete(taskId);
    }

    logger.debug(`[AceStrategyOrchestrator] Cleared tasks for session: ${sessionId} (${tasksToDelete.length} statuses)`);
  }

  /**
   * 获取伦理守卫实例
   * 注意：这里使用依赖注入方式获取AceEthicsGuard
   * 在实际使用时，需要在AceIntegrator中初始化并注入
   */
  private getEthicsGuard(): AceEthicsGuard | null {
    // 尝试从aceIntegrator获取ethicsGuard
    // 这是一个简化的实现，实际项目中可以通过构造函数注入
    return (this.aceIntegrator as any).ethicsGuard || null;
  }
}
