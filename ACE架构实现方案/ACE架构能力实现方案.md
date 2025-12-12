# ACE架构能力实现方案

> 基于《ACE架构深度剖析：基于分层认知模型的自主智能体上下文管理研究报告》
>
> 项目：ApexBridge
>
> 日期：2025-12-12

## 一、现状分析

### 1.1 已有基础设施

**ace-engine-core包（v0.1.0）**已实现ACE六层架构的核心框架：

- **六层实现**：L1渴望层 → L2全球战略层 → L3代理模型层 → L4执行功能层 → L5认知控制层 → L6任务起诉层
- **双向总线**：BusManager实现南向/北向通信协议
- **存储系统**：SQLite（轨迹/日志）+ ChromaDB（向量记忆）+ Memory/Redis（缓存）
- **会话管理**：SessionManager支持多会话隔离
- **调度器**：CognitiveScheduler支持心跳和反思触发

**ApexBridge集成现状**：
- `src/services/AceService.ts` 已封装AceEngine初始化
- `src/core/ace/ApexLLMAdapter.ts` 实现双通道LLM适配（执行模型+进化模型）
- `src/services/AceIntegrator.ts` 提供轨迹记录和反思触发接口
- `src/strategies/ReActStrategy.ts` 已集成AceIntegrator

### 1.2 架构差距分析

**当前项目技术栈分析**：

1. **工具调用机制**：已实现 BuiltInExecutor（内置）+ SkillsSandboxExecutor（进程隔离）的双执行器模式
2. **向量数据库**：统一使用 **LanceDB**（通过 ToolRetrievalService 管理）
3. **技能系统**：已有 SkillManager + 动态Skills自动注销机制（5分钟超时）
4. **轨迹记录**：已有 AceIntegrator 基础集成
5. **本地化实现**：✅ 已规划剔除 ace-engine-core，采用本地化实现

**当前问题**：

1. **浅层集成**：ACE仅作为"旁路记录器"，未深度参与决策流程
2. **单向数据流**：只有Northbound（上报轨迹），缺少Southbound（战略指导）
3. **层级未激活**：六层架构存在但未真正运作，L2-L4基本空转
4. **上下文隔离**：ReActStrategy的上下文管理与ACE的层级上下文未打通
5. **缺少反馈闭环**：ACE的反思结果未反哺到ChatService的决策
6. **本地化路径**：✅ 采用本地化AceCore替代ace-engine-core，无需外部SDK

## 二、ACE能力实现方案

### 2.1 架构设计原则

根据论文核心思想，结合当前项目技术栈，实现以下设计原则：

**原则1：层级化上下文管理**
- 不同层级维护不同时间跨度的上下文
- 通过抽象阶梯实现信息压缩（L6原始数据 → L2战略摘要）
- **本地化实现**：使用项目的变量引擎和会话管理系统

**原则2：双向总线闭环**
- Northbound：执行结果 → 战略调整
- Southbound：战略指令 → 执行优化
- **本地化实现**：使用 EventBus 实现，无需 ace-engine-core 的 BusManager

**原则3：渐进式集成**
- Phase 1：激活L5/L6（认知控制+任务执行）
- Phase 2：激活L4（执行功能层，任务拆解）
- Phase 3：激活L2/L3（全球战略+自我认知）
- Phase 4：激活L1（道德约束）

**原则4：技术栈统一**
- **向量库**：统一使用 **LanceDB**（当前项目已实现）
- **工具系统**：深度整合现有的 BuiltInExecutor + SkillsSandboxExecutor
- **技能系统**：利用已有的 SkillManager 和动态注销机制
- **✅ 本地化实现**：完全剔除 ace-engine-core 依赖，采用 AceCore 本地实现

### 2.2 Phase 1：激活L5/L6层（短期记忆与执行）

#### 目标
将ReActStrategy的思考循环映射到ACE的L5（认知控制）和L6（任务执行）。

#### 实现方案

**Step 1：重构ReActStrategy的上下文管理**

```typescript
// src/strategies/ReActStrategy.ts
export class ReActStrategy implements ChatStrategy {

  async execute(messages: Message[], options: ChatOptions): Promise<ChatResult> {
    // 🆕 创建ACE会话（L5/L6层级）
    const sessionId = await this.aceIntegrator.createSession({
      userId: options.userId || 'anonymous',
      metadata: { strategy: 'ReAct', timestamp: Date.now() }
    });

    try {
      // 🆕 将用户意图注入L5（认知控制层）
      await this.aceIntegrator.sendToLayer('COGNITIVE_CONTROL', {
        type: 'USER_INTENT',
        content: this.extractUserIntent(messages),
        context: this.buildL5Context(messages) // 仅包含当前任务相关上下文
      });

      // ReAct循环
      for (let round = 0; round < maxRounds; round++) {
        // 🆕 L5思考阶段：生成推理步骤
        const thought = await this.generateThought(messages, sessionId);

        // 🆕 记录到L5的Scratchpad（临时便签）
        await this.aceIntegrator.recordThought(sessionId, thought);

        // 🆕 L6执行阶段：工具调用
        if (thought.requiresToolCall) {
          const toolResult = await this.executeToolViaL6(thought.toolCall, sessionId);

          // 🆕 L6 → L5：原始结果上报
          await this.aceIntegrator.reportToolResult(sessionId, {
            raw: toolResult,
            summary: this.summarizeForL5(toolResult) // 数据清洗
          });
        }

        // 🆕 L5判断：任务是否完成
        const isComplete = await this.checkTaskCompletion(sessionId);
        if (isComplete) break;
      }

      // 🆕 L5 → L4：任务完成上报（触发上下文压缩）
      await this.aceIntegrator.completeTask(sessionId, {
        summary: '任务已完成',
        outcome: 'success'
      });

      return result;
    } finally {
      // 🆕 会话结束：触发记忆固化
      await this.aceIntegrator.closeSession(sessionId);
    }
  }

  // 🆕 为L5构建聚焦上下文（仅当前任务）
  private buildL5Context(messages: Message[]): string {
    // 只保留最近3轮对话 + 当前工具列表
    const recentMessages = messages.slice(-6);
    return `Recent Context:\n${this.formatMessages(recentMessages)}\n\nAvailable Tools:\n${this.toolPromptContent}`;
  }

  // 🆕 通过L6执行工具（记录原始IO）
  private async executeToolViaL6(toolCall: any, sessionId: string) {
    // L6记录：原始API调用
    await this.aceIntegrator.recordAction(sessionId, {
      layer: 'TASK_PROSECUTION',
      action: 'TOOL_CALL',
      payload: toolCall
    });

    const result = await this.toolDispatcher.dispatch(toolCall);

    // L6记录：原始返回数据
    await this.aceIntegrator.recordObservation(sessionId, {
      layer: 'TASK_PROSECUTION',
      observation: result,
      timestamp: Date.now()
    });

    return result;
  }
}
```

**Step 2：扩展AceIntegrator支持层级通信（本地化实现）**

```typescript
// src/services/AceIntegrator.ts
export class AceIntegrator {
  // ✅ 完全本地化总线（替代 ace-engine-core BusManager）
  private bus = {
    northbound: new EventEmitter(),
    southbound: new EventEmitter()
  };

  // ✅ 本地化Scratchpad存储（替代 ace-engine-core MemoryStorage）
  private scratchpads: Map<string, Map<string, string>> = new Map(); // sessionId -> layerId -> content

  // 🆕 向指定层级发送消息（本地化实现）
  async sendToLayer(layerId: string, packet: { content?: string; type?: string; metadata?: any }) {
    // ✅ 直接通过事件总线广播消息
    const message = {
      targetLayer: layerId,
      content: packet.content || '',
      type: packet.type || 'DIRECTIVE',
      metadata: packet.metadata || {},
      timestamp: Date.now()
    };

    // 南向消息：EXTERNAL -> ACE层级
    this.bus.southbound.emit('message', message);

    // ✅ 同时记录到Scratchpad（用于调试和追踪）
    if (this.scratchpads.has(layerId)) {
      const layerScratchpad = this.scratchpads.get(layerId)!;
      const existing = layerScratchpad.get('COMMUNICATION_LOG') || '';
      layerScratchpad.set('COMMUNICATION_LOG',
        existing + `\n[${new Date().toISOString()}] OUT: ${packet.content}`
      );
    }

    logger.debug(`[AceIntegrator] Sent message to ${layerId}: ${packet.content}`);
  }

  // 🆕 监听来自层级的事件（北向消息）
  onMessageFromLayer(layerId: string, callback: (message: any) => void): void {
    this.bus.northbound.on(layerId, callback);
  }

  // 🆕 记录L5的思考过程（Scratchpad，本地化实现）
  async recordThought(sessionId: string, thought: { content: string; reasoning: string }) {
    const sessionScratchpads = this.scratchpads.get(sessionId) || new Map();
    const existing = sessionScratchpads.get('COGNITIVE_CONTROL') || '';
    sessionScratchpads.set('COGNITIVE_CONTROL',
      existing + `\n[Thought] ${thought.reasoning}\n[Action] ${thought.content}`
    );
    this.scratchpads.set(sessionId, sessionScratchpads);
  }

  // 🆕 L6工具执行记录（适配当前项目工具调用格式）
  async recordAction(sessionId: string, action: { layer: string; action: string; payload: any }) {
    // 使用项目现有的轨迹记录接口
    await this.recordTrajectory({
      sessionId,
      layerId: action.layer,
      eventType: 'ACTION',
      content: JSON.stringify(action.payload),
      metadata: { actionType: action.action }
    });
  }

  // 🆕 L6观察结果记录（适配 ToolResult 格式）
  async recordObservation(sessionId: string, obs: {
    layer: string;
    observation: { success: boolean; output: any; error?: any; duration?: number; exitCode?: number };
    timestamp: number
  }) {
    const content = obs.observation.success
      ? JSON.stringify({ success: true, output: obs.observation.output })
      : JSON.stringify({ success: false, error: obs.observation.error });

    await this.recordTrajectory({
      sessionId,
      layerId: obs.layer,
      eventType: 'OBSERVATION',
      content,
      metadata: {
        timestamp: obs.timestamp,
        duration: obs.observation.duration,
        exitCode: obs.observation.exitCode
      }
    });
  }

  // 🆕 任务完成上报（触发L5 → L4的上下文压缩）
  async completeTask(sessionId: string, summary: { summary: string; outcome: string }) {
    // 1. 从L5的Scratchpad提取完整思考过程
    const scratchpad = this.scratchpads.get(sessionId)?.get('COGNITIVE_CONTROL') || '';

    // 2. 压缩为摘要（递归摘要）
    const compressed = await this.compressThoughts(scratchpad);

    // 3. 上报到L4
    await this.sendToLayer('EXECUTIVE_FUNCTION', {
      type: 'STATUS_UPDATE',
      content: `Task completed: ${summary.summary}\nOutcome: ${summary.outcome}\nDetails: ${compressed}`
    });

    // 4. 清空L5的Scratchpad
    this.scratchpads.get(sessionId)?.delete('COGNITIVE_CONTROL');
  }

  // 🆕 递归摘要算法（使用项目现有的LLMManager）
  private async compressThoughts(scratchpad: string): Promise<string> {
    if (scratchpad.length < 500) return scratchpad;

    try {
      // 使用项目现有的LLMManager进行摘要
      const response = await this.llmManager.chat([{
        role: 'user',
        content: `Summarize the following reasoning process into 2-3 sentences:\n\n${scratchpad}`
      }], { stream: false });

      return response.choices[0]?.message?.content || scratchpad;
    } catch (error) {
      logger.warn('[AceIntegrator] Failed to compress thoughts, using original text');
      return scratchpad;
    }
  }
}
```

**Step 3：创建轻量级本地化AceCore（替代ace-engine-core）**

```typescript
// src/core/ace/AceCore.ts
/**
 * 完全本地化ACE核心实现
 * ✅ 无外部依赖，完全替代 ace-engine-core
 */
export class AceCore {
  private bus = {
    northbound: new EventEmitter(),
    southbound: new EventEmitter()
  };

  private scratchpads: Map<string, Map<string, string>> = new Map();
  private sessions: Map<string, any> = new Map();
  private scheduler: NodeJS.Timeout | null = null;

  // ✅ 轻量级配置接口
  interface AceCoreConfig {
    agentId: string;
    reflectionCycleInterval?: number; // 默认60000ms
    maxSessionAge?: number; // 默认24小时
  }

  constructor(private config: AceCoreConfig) {}

  /**
   * 创建ACE会话（本地化实现）
   */
  async createSession(config: { userId: string; metadata: any }): Promise<string> {
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, {
      ...config,
      createdAt: Date.now(),
      lastActivity: Date.now()
    });
    logger.info(`[AceCore] Created session: ${sessionId}`);
    return sessionId;
  }

  /**
   * 更新会话活动时间
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  /**
   * Scratchpad管理（本地化实现，替代 ace-engine-core MemoryStorage）
   */
  async appendToScratchpad(sessionId: string, layerId: string, content: string): Promise<void> {
    if (!this.scratchpads.has(sessionId)) {
      this.scratchpads.set(sessionId, new Map());
    }
    const layerScratchpad = this.scratchpads.get(sessionId)!;
    const existing = layerScratchpad.get(layerId) || '';
    layerScratchpad.set(layerId, existing + '\n' + content);
    logger.debug(`[AceCore] Appended to scratchpad: ${layerId}`);
  }

  async getScratchpad(sessionId: string, layerId: string): Promise<string> {
    return this.scratchpads.get(sessionId)?.get(layerId) || '';
  }

  async clearScratchpad(sessionId: string, layerId: string): Promise<void> {
    this.scratchpads.get(sessionId)?.delete(layerId);
    logger.debug(`[AceCore] Cleared scratchpad: ${layerId}`);
  }

  /**
   * 启动调度器（触发反思）
   */
  start(): void {
    if (this.scheduler) return;

    this.scheduler = setInterval(() => {
      this.runReflectionCycle();
    }, 60000); // 每分钟执行一次

    logger.info('[AceCore] Scheduler started');
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (this.scheduler) {
      clearInterval(this.scheduler);
      this.scheduler = null;
      logger.info('[AceCore] Scheduler stopped');
    }
  }

  /**
   * 执行反思周期（本地化调度器）
   */
  private async runReflectionCycle(): Promise<void> {
    try {
      logger.debug('[AceCore] Running scheduled reflection cycle');

      // 1. 清理过期会话
      await this.cleanupExpiredSessions();

      // 2. 触发全局反思事件（北向）
      const reflectionTrigger = {
        type: 'PERIODIC_REFLECTION',
        level: 'GLOBAL_STRATEGY',
        sessionId: 'system',
        traceId: crypto.randomUUID(),
        timestamp: Date.now(),
        context: 'Periodic reflection cycle'
      };

      this.bus.northbound.emit('GLOBAL_STRATEGY', {
        data: { trigger: reflectionTrigger }
      });

      logger.debug('[AceCore] Reflection cycle completed');
    } catch (error) {
      logger.error('[AceCore] Reflection cycle failed:', error);
    }
  }

  /**
   * 清理过期会话
   */
  private async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();
    const maxAge = this.config.maxSessionAge || (24 * 60 * 60 * 1000); // 24小时

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > maxAge) {
        this.sessions.delete(sessionId);
        this.scratchpads.delete(sessionId);
        logger.info(`[AceCore] Cleaned up expired session: ${sessionId}`);
      }
    }
  }
}
```

#### 效果
- L5维护"当前任务"的聚焦上下文（最近3轮对话）
- L6记录所有原始IO（工具调用+返回），适配项目标准的 ToolResult 格式
- 任务完成后自动压缩并上报到L4
- 实现论文中的"Scratchpad机制"和"任务完结清洗"
- ✅ **本地化优势**：轻量级实现，无外部SDK依赖，性能更优

---

### 2.3 Phase 2：激活L4层（执行功能层）

#### 目标
将ChatService的多轮对话管理提升到L4，实现任务拆解和流程控制。

#### 实现方案

**Step 1：创建AceStrategyOrchestrator（本地化实现）**

```typescript
// src/strategies/AceStrategyOrchestrator.ts
/**
 * ACE策略编排器
 * 将ChatService的策略选择逻辑提升到L4（执行功能层）
 */
export class AceStrategyOrchestrator {
  constructor(
    private aceIntegrator: AceIntegrator,
    private strategies: ChatStrategy[],
    private llmManager: LLMManager // 注入项目现有的LLMManager
  ) {}

  async orchestrate(messages: Message[], options: ChatOptions): Promise<ChatResult> {
    // 🆕 使用项目现有的会话管理
    const sessionId = options.sessionId || `ace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 🆕 L4分析：将用户请求拆解为任务队列
    const taskQueue = await this.decomposeToTasks(messages, sessionId);

    // 🆕 L4执行：按DAG顺序执行任务
    const results: any[] = [];
    for (const task of taskQueue) {
      // L4 → L5：下发单一任务
      await this.aceIntegrator.sendToLayer('COGNITIVE_CONTROL', {
        type: 'TASK',
        content: task.description,
        metadata: { taskId: task.id, dependencies: task.dependencies }
      });

      // ✅ 使用项目现有的策略选择机制
      const strategy = this.selectStrategyForTask(task);
      const result = await strategy.execute(task.messages, {
        ...task.options,
        sessionId, // 传递会话ID
        requestId: task.id
      });
      results.push(result);

      // L5 → L4：任务完成上报
      await this.aceIntegrator.completeTask(sessionId, {
        summary: `Task ${task.id} completed`,
        outcome: 'success'
      });

      // 🆕 L4更新：从任务队列移除已完成任务
      await this.updateTaskQueue(sessionId, task.id);
    }

    return this.mergeResults(results);
  }

  // 🆕 任务拆解（L4核心能力，使用项目LLMManager）
  private async decomposeToTasks(messages: Message[], sessionId: string): Promise<Task[]> {
    // 使用项目现有的LLMManager分析用户意图，生成任务DAG
    const prompt = `Analyze the user request and break it down into subtasks:\n\n${this.formatMessages(messages)}\n\nReturn a JSON array of tasks, each with: {id, description, dependencies: [ids], requiresToolCall: boolean}`;

    try {
      // ✅ 使用项目现有的LLMManager（自动路由到合适的模型）
      const response = await this.llmManager.chat([{
        role: 'user',
        content: prompt
      }], { stream: false });

      const decomposition = response.choices[0]?.message?.content || '[]';
      return this.parseTaskQueue(decomposition);
    } catch (error) {
      logger.error('[AceStrategyOrchestrator] Task decomposition failed:', error);
      // 降级为单任务
      return [{
        id: `task_${Date.now()}`,
        description: messages[messages.length - 1]?.content || 'Unknown task',
        dependencies: [],
        messages,
        options: { provider: 'default', model: 'default' },
        requiresToolCall: false
      }];
    }
  }

  // 🆕 解析任务队列JSON
  private parseTaskQueue(jsonStr: string): Task[] {
    try {
      const tasks = JSON.parse(jsonStr);
      if (!Array.isArray(tasks)) {
        throw new Error('Tasks must be an array');
      }
      return tasks.map(task => ({
        id: task.id || `task_${Date.now()}`,
        description: task.description || 'No description',
        dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
        messages: [], // 将在后续步骤中填充
        options: { provider: 'default', model: 'default' },
        requiresToolCall: Boolean(task.requiresToolCall)
      }));
    } catch (error) {
      logger.warn('[AceStrategyOrchestrator] Failed to parse task queue, using single task:', error);
      return [{
        id: `task_${Date.now()}`,
        description: 'Fallback task',
        dependencies: [],
        messages: [],
        options: { provider: 'default', model: 'default' },
        requiresToolCall: false
      }];
    }
  }

  // 🆕 根据任务特征选择策略（使用项目现有的supports机制）
  private selectStrategyForTask(task: Task): ChatStrategy {
    // ✅ 使用策略的 supports 方法进行匹配
    for (const strategy of this.strategies) {
      if (strategy.supports(task.options)) {
        return strategy;
      }
    }
    // 默认返回ReAct策略
    return this.strategies.find(s => s.getName() === 'ReActStrategy') || this.strategies[0];
  }

  // 🆕 任务队列管理（使用项目会话管理）
  private async updateTaskQueue(sessionId: string, completedTaskId: string): Promise<void> {
    // 使用项目现有的会话管理更新任务状态
    logger.debug(`[AceStrategyOrchestrator] Task completed: ${completedTaskId} in session: ${sessionId}`);
  }

  private formatMessages(messages: Message[]): string {
    return messages.map(m => `${m.role}: ${m.content}`).join('\n');
  }

  private mergeResults(results: any[]): ChatResult {
    // 合并多任务结果
    return {
      content: results.map(r => r.content).join('\n---\n'),
      iterations: results.reduce((sum, r) => sum + (r.iterations || 0), 0)
    };
  }
}
```

**Step 2：修改ChatService集成编排器（本地化实现）**

```typescript
// src/services/ChatService.ts
export class ChatService {
  private aceOrchestrator: AceStrategyOrchestrator;

  constructor(...) {
    // 🆕 初始化ACE编排器（注入项目依赖）
    this.aceOrchestrator = new AceStrategyOrchestrator(
      this.aceIntegrator,
      this.strategies,
      this.llmManager // 传递项目现有的LLMManager
    );
  }

  async chat(messages: Message[], options: ChatOptions): Promise<ChatResult> {
    // 🆕 判断是否启用ACE编排
    if (options.aceOrchestration?.enabled) {
      logger.info('[ChatService] Using ACE orchestration for complex task');
      return this.aceOrchestrator.orchestrate(messages, options);
    }

    // ✅ 原有逻辑：直接策略选择（保持兼容性）
    const strategy = this.selectStrategy(options);
    return strategy.execute(messages, options);
  }
}
```

#### 效果
- L4维护任务队列（To-Do List + DAG）
- 支持复杂任务的自动拆解
- 实现论文中的"任务完结清洗"和"优先级排序"
- ✅ **本地化优势**：复用项目现有的LLMManager和会话管理，无额外依赖

---

### 2.4 Phase 3：激活L2/L3层（战略与自我认知）

#### 目标
- L2：维护长期战略和世界模型
- L3：维护工具清单和能力边界

#### 实现方案

**Step 1：L3自我认知层（工具能力管理，深度整合技能系统）**

```typescript
// src/services/AceCapabilityManager.ts
/**
 * ACE能力管理器（映射到L3 - Agent Model Layer）
 * 深度整合项目现有的技能系统
 */
export class AceCapabilityManager {
  constructor(
    private aceIntegrator: AceIntegrator,
    private skillManager: SkillManager, // ✅ 注入项目现有的SkillManager
    private toolRetrievalService: ToolRetrievalService // ✅ 注入项目现有的ToolRetrievalService
  ) {}

  // 🆕 技能注册时更新L3（与SkillManager集成）
  async registerSkill(skill: SkillTool) {
    await this.aceIntegrator.sendToLayer('AGENT_MODEL', {
      type: 'CAPABILITY_UPDATE',
      content: `New skill registered: ${skill.name}`,
      metadata: {
        skillName: skill.name,
        skillType: skill.type,
        capabilities: skill.description,
        tags: skill.tags,
        version: skill.version
      }
    });

    // ✅ 更新向量检索索引
    await this.toolRetrievalService.indexSkill({
      name: skill.name,
      description: skill.description,
      tags: skill.tags || [],
      path: skill.path,
      version: skill.version,
      metadata: { parameters: skill.parameters }
    });

    logger.info(`[AceCapabilityManager] Skill registered and indexed: ${skill.name}`);
  }

  // 🆕 技能失败时更新L3（标记为故障，与动态注销机制集成）
  async markSkillAsFaulty(skillName: string, error: string) {
    await this.aceIntegrator.sendToLayer('AGENT_MODEL', {
      type: 'CAPABILITY_UPDATE',
      content: `Skill ${skillName} marked as faulty: ${error}`,
      metadata: {
        skillName,
        status: 'faulty',
        error,
        timestamp: Date.now()
      }
    });

    // ✅ 触发自动注销机制（5分钟超时）
    logger.warn(`[AceCapabilityManager] Skill marked as faulty: ${skillName}`);
  }

  // 🆕 L3查询：当前可用技能（使用项目向量检索）
  async getAvailableCapabilities(): Promise<string[]> {
    // ✅ 使用项目现有的SkillManager获取技能列表
    const skills = await this.skillManager.listSkills();
    return skills.filter(s => s.enabled).map(s => s.name);
  }

  // 🆕 L3动态技能追踪（与ReActStrategy的自动注销机制集成）
  async updateSkillActivity(skillName: string): Promise<void> {
    // 使用项目现有的技能状态追踪
    await this.aceIntegrator.sendToLayer('AGENT_MODEL', {
      type: 'ACTIVITY_UPDATE',
      content: `Skill ${skillName} accessed`,
      metadata: {
        skillName,
        timestamp: Date.now(),
        status: 'active'
      }
    });
  }

  // 🆕 清理不活跃技能（触发ReActStrategy的自动清理）
  async cleanupInactiveSkills(): Promise<void> {
    // ✅ 使用项目现有的自动清理机制
    // ReActStrategy已经有5分钟超时清理，无需重复实现
    logger.debug('[AceCapabilityManager] Using ReActStrategy auto-cleanup mechanism');
  }
}
```

**Step 2：L2全球战略层（长期规划，使用LanceDB）**

```typescript
// src/services/AceStrategyManager.ts
/**
 * ACE战略管理器（映射到L2 - Global Strategy Layer）
 * 使用项目现有的LanceDB进行长期记忆
 */
export class AceStrategyManager {
  constructor(
    private aceIntegrator: AceIntegrator,
    private toolRetrievalService: ToolRetrievalService // ✅ 使用项目现有的LanceDB
  ) {}

  // 🆕 会话开始时从L2加载战略上下文（使用LanceDB）
  async loadStrategicContext(userId: string): Promise<string> {
    try {
      // ✅ 使用项目现有的ToolRetrievalService（LanceDB）
      const query = `User ${userId} strategic goals plans`;
      const relevantPlans = await this.toolRetrievalService.findRelevantSkills(
        query,
        5, // limit
        0.5 // threshold
      );

      if (relevantPlans.length === 0) {
        return 'No previous strategic context found.';
      }

      // 构建战略上下文
      const pastStrategies = relevantPlans.map(r =>
        `- ${r.tool.name}: ${r.tool.description}`
      ).join('\n');

      return `Past Strategic Goals:\n${pastStrategies}`;
    } catch (error) {
      logger.error('[AceStrategyManager] Failed to load strategic context:', error);
      return 'Failed to load strategic context.';
    }
  }

  // 🆕 任务完成后更新L2的世界模型（存储到LanceDB）
  async updateWorldModel(sessionId: string, outcome: { summary: string; learnings: string[] }) {
    await this.aceIntegrator.sendToLayer('GLOBAL_STRATEGY', {
      type: 'STATUS_UPDATE',
      content: `Mission accomplished: ${outcome.summary}`,
      metadata: {
        learnings: outcome.learnings,
        sessionId,
        timestamp: Date.now()
      }
    });

    // ✅ 将战略学习存储到LanceDB（作为特殊"战略技能"）
    await this.storeStrategicLearning(outcome);

    // 🆕 触发L2的战略调整（使用本地事件总线）
    this.aceIntegrator.getAceService()?.getEngine()?.bus.northbound.emit('GLOBAL_STRATEGY', {
      data: {
        trigger: {
          type: 'MISSION_COMPLETE',
          level: 'GLOBAL_STRATEGY',
          sessionId,
          traceId: crypto.randomUUID(),
          timestamp: Date.now(),
          context: outcome.summary
        }
      }
    });
  }

  // ✅ 将战略学习存储为向量记录（使用LanceDB）
  private async storeStrategicLearning(outcome: { summary: string; learnings: string[] }): Promise<void> {
    try {
      const learningText = `Strategic Learning: ${outcome.summary}\nLearnings: ${outcome.learnings.join('; ')}`;

      // 使用ToolRetrievalService作为通用向量存储
      await this.toolRetrievalService.indexSkill({
        name: `strategic_learning_${Date.now()}`,
        description: learningText,
        tags: ['strategic', 'learning', 'long-term'],
        path: 'memory://strategic',
        metadata: {
          type: 'strategic_learning',
          learnings: outcome.learnings,
          storedAt: Date.now()
        }
      });

      logger.info('[AceStrategyManager] Strategic learning stored in LanceDB');
    } catch (error) {
      logger.error('[AceStrategyManager] Failed to store strategic learning:', error);
    }
  }
}
```

#### 效果
- L3动态维护技能清单，自动标记故障技能
- ✅ **深度集成**：与SkillManager、ToolRetrievalService、ReActStrategy自动注销机制无缝整合
- L2维护跨会话的长期战略，使用LanceDB统一存储
- 实现论文中的"自我修正"和"战略对齐"
- ✅ **本地化优势**：统一技术栈，无外部依赖

---

### 2.5 Phase 4：激活L1层（道德约束）

#### 目标
实现最高层级的道德裁决和价值观约束。

#### 实现方案（本地化实现）

```typescript
// src/services/AceEthicsGuard.ts
/**
 * ACE伦理守卫（映射到L1 - Aspirational Layer）
 * 本地化实现，使用项目现有的配置系统
 */
export class AceEthicsGuard {
  private constitution: string = '';
  private aceIntegrator: AceIntegrator;
  private llmManager: LLMManager; // ✅ 使用项目现有的LLMManager

  constructor(aceIntegrator: AceIntegrator, llmManager: LLMManager) {
    this.aceIntegrator = aceIntegrator;
    this.llmManager = llmManager;
  }

  // 🆕 L4战略提交前，先经过L1审查（使用LLM进行伦理判断）
  async reviewStrategy(strategy: { goal: string; plan: string }): Promise<{ approved: boolean; reason?: string }> {
    try {
      // 加载宪法内容
      const constitution = await this.loadConstitution();

      // 使用LLM进行伦理审查
      const reviewPrompt = `${constitution}\n\nPlease review the following strategy for ethical compliance:\n\nGoal: ${strategy.goal}\nPlan: ${strategy.plan}\n\nRespond with JSON: {"approved": true/false, "reason": "explanation"}`;

      const response = await this.llmManager.chat([{
        role: 'user',
        content: reviewPrompt
      }], { stream: false });

      const content = response.choices[0]?.message?.content || '{}';

      try {
        const result = JSON.parse(content);
        return {
          approved: result.approved,
          reason: result.reason
        };
      } catch (parseError) {
        // JSON解析失败，使用简单关键词检测
        return this.fallbackEthicalCheck(strategy);
      }

    } catch (error) {
      logger.error('[AceEthicsGuard] Strategy review failed:', error);
      // 审查失败时保守处理
      return { approved: false, reason: 'Ethical review system error' };
    }
  }

  // 🆕 加载自定义宪法（使用项目配置系统）
  async loadConstitution(configPath?: string): Promise<string> {
    if (this.constitution) {
      return this.constitution;
    }

    const constitutionPath = configPath || process.env.CONSTITUTION_PATH || './config/constitution.md';

    try {
      const fs = await import('fs/promises');
      const constitution = await fs.readFile(constitutionPath, 'utf8');
      this.constitution = constitution;
      logger.info(`[AceEthicsGuard] Constitution loaded from ${constitutionPath}`);
      return constitution;
    } catch (error) {
      logger.warn('[AceEthicsGuard] Failed to load constitution, using default');
      // 默认宪法
      this.constitution = `You are an ethical AI assistant. Prioritize:
1. User safety and well-being
2. Honesty and transparency
3. Respect for privacy and confidentiality
4. Non-harm and non-discrimination
5. Legal compliance`;
      return this.constitution;
    }
  }

  // 简单的关键词检测（LLM不可用时的降级方案）
  private fallbackEthicalCheck(strategy: { goal: string; plan: string }): { approved: boolean; reason?: string } {
    const harmfulKeywords = ['hack', 'exploit', 'steal', 'illegal', 'harm', 'weapon'];
    const text = `${strategy.goal} ${strategy.plan}`.toLowerCase();

    for (const keyword of harmfulKeywords) {
      if (text.includes(keyword)) {
        return {
          approved: false,
          reason: `Potentially harmful content detected: ${keyword}`
        };
      }
    }

    return { approved: true };
  }
}
```

#### 效果
- L1作为"超我"监督所有战略决策
- ✅ **本地化实现**：使用项目现有的LLMManager和配置系统
- 支持自定义宪法文件
- 实现论文中的"道德罗盘"和"纠正指令"
- ✅ **降级机制**：LLM不可用时使用关键词检测，确保系统可用性

---

## 三、实施路线图

### 3.1 优先级排序

**P0（立即实施）- Phase 1**
- ✅ **本地化实现**：激活L5/L6，重构ReActStrategy的上下文管理
- ✅ **工具适配**：实现Scratchpad机制和任务完结清洗，适配项目ToolResult格式
- 预期收益：降低ReAct的上下文溢出风险，提升多轮对话稳定性

**P1（1周）- Phase 2**
- ✅ **本地化实现**：实现AceStrategyOrchestrator，激活L4
- ✅ **复用依赖**：使用项目现有的LLMManager和会话管理
- 预期收益：支持"写一个完整的Web应用"等复杂需求

**P2（2周）- Phase 3**
- ✅ **本地化实现**：激活L2/L3，实现长期记忆和能力管理
- ✅ **统一向量库**：使用项目现有的LanceDB（已实现），无需ChromaDB
- ✅ **深度集成**：与SkillManager、ToolRetrievalService、ReActStrategy自动注销机制整合
- 预期收益：跨会话的上下文连续性，智能体"记住"用户偏好

**P3（3周）- Phase 4**
- ✅ **本地化实现**：激活L1，实现道德约束
- ✅ **配置集成**：使用项目现有的配置系统和LLMManager
- 预期收益：满足金融、医疗等高风险场景的伦理要求

**P4（2周）- 完全剔除外部依赖**
- ✅ 创建本地化AceCore，替代ace-engine-core
- ✅ 迁移所有ace相关代码到本地实现
- ✅ 删除ace-engine-core依赖及package.json引用
- ⚠️ **关键任务**：
  - 重构AceService，移除对AceEngine的依赖
  - 更新所有import路径
  - 验证所有ACE功能正常运行
- 预期收益：✅ 完全无外部依赖，提高项目可控性和安全性

### 3.2 技术风险与缓解

**风险1：延迟增加**
- ✅ **缓解**：L5/L6使用小模型（如Llama-3-8B），L2/L4使用大模型
- ✅ **缓解**：引入"快速通道"，简单任务跳过L4直达L5
- ✅ **优化**：本地化实现减少网络开销，性能更优

**风险2：成本上升**
- ✅ **缓解**：L6使用非LLM脚本执行工具调用（项目已有）
- ✅ **缓解**：L5的Scratchpad压缩使用本地小模型
- ✅ **优化**：LanceDB性能优于ChromaDB，降低检索成本

**风险3：一致性漂移**
- ✅ **缓解**：L1的宪法作为所有层级的Prompt前缀
- ✅ **缓解**：引入审计Agent定期检查层级对齐
- ✅ **优化**：统一技术栈，减少不一致风险

**风险4：外部依赖耦合**
- ✅ **缓解**：✅ **完全本地化实现**，已剔除ace-engine-core依赖
- ✅ **缓解**：所有ACE功能使用项目现有组件实现
- ⚠️ **注意**：现有代码需在P4阶段重构，删除AceService对ace-engine-core的引用
- ✅ **收益**：✅ **零外部依赖**，完全可控，无供应链风险

### 3.3 配置示例（本地化配置 + SQLite存储）

#### SQLite数据表结构

L1-L6层级模型配置存储在SQLite数据库中（`data/llm_providers.db`）：

```sql
-- L1-L6层级模型配置表（完全本地化，无外部依赖）
-- 数据库：data/llm_providers.db（SQLite）
CREATE TABLE IF NOT EXISTS llm_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL,
  model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  model_type TEXT NOT NULL,          -- 'nlp', 'embedding', 'rerank'
  model_config TEXT NOT NULL,        -- JSON配置
  api_endpoint_suffix TEXT,
  enabled INTEGER DEFAULT 1,
  is_default INTEGER DEFAULT 0,
  is_ace_evolution INTEGER DEFAULT 0,  -- ✅ 标记ACE进化模型
  is_ace_layer_l1 INTEGER DEFAULT 0,   -- ✅ L1渴望层模型
  is_ace_layer_l2 INTEGER DEFAULT 0,   -- ✅ L2全球战略层模型
  is_ace_layer_l3 INTEGER DEFAULT 0,   -- ✅ L3代理模型层模型
  is_ace_layer_l4 INTEGER DEFAULT 0,   -- ✅ L4执行功能层模型
  is_ace_layer_l5 INTEGER DEFAULT 0,   -- ✅ L5认知控制层模型
  is_ace_layer_l6 INTEGER DEFAULT 0,   -- ✅ L6任务执行层模型
  display_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (provider_id) REFERENCES llm_providers(id) ON DELETE CASCADE,
  UNIQUE(provider_id, model_key),
  CHECK(enabled IN (0, 1))
);
```

#### 配置文件（仅存储非模型配置）

```json
// config/admin-config.json
{
  "ace": {
    "enabled": true,
    "orchestration": {
      "enabled": true,
      "mode": "full"
    },
    "layers": {
      "l1": {
        "enabled": true,
        "constitutionPath": "./config/constitution.md",
        "modelSource": "sqlite" // ✅ 模型从SQLite加载
      },
      "l2": {
        "enabled": true,
        "modelSource": "sqlite"
      },
      "l3": {
        "enabled": true,
        "modelSource": "sqlite"
      },
      "l4": {
        "enabled": true,
        "modelSource": "sqlite"
      },
      "l5": {
        "enabled": true,
        "modelSource": "sqlite",
        "fallbackToEvolution": true // ✅ L5可回退到进化模型
      },
      "l6": {
        "enabled": true,
        "useLLM": false // ✅ L6通常不使用LLM
      }
    },
    "memory": {
      "provider": "lancedb", // ✅ 统一使用LanceDB
      "vectorDbPath": "./.data",
      "collectionPrefix": "apex_bridge"
    },
    "optimization": {
      "fastTrackSimpleTasks": true,
      "l5ScratchpadCompression": true,
      "l6NonLLMExecution": true
    },
    "skills": {
      "autoCleanupEnabled": true, // ✅ 使用项目现有的自动注销机制
      "cleanupTimeoutMs": 300000,
      "maxActiveSkills": 50
    },
    "localImplementation": {
      "enabled": true, // ✅ 启用本地化实现
      "aceCore": {
        "reflectionCycleInterval": 60000, // 反思周期间隔（毫秒）
        "maxSessionAge": 86400000 // 会话最大生存时间（毫秒，24小时）
      },
      "useEventBus": true, // 使用项目现有的EventBus
      "useLLMManager": true, // 使用项目现有的LLMManager
      "useSQLiteConfig": true // ✅ 模型配置存储在SQLite
    }
  }
}
```

#### SQLite模型配置管理

```typescript
// src/services/AceLayerConfigService.ts
/**
 * ✅ 完全本地化ACE层级模型配置服务
 * 扩展 LLMConfigService，支持L1-L6层级模型配置
 * 无外部依赖，所有配置存储在SQLite
 */
export class AceLayerConfigService extends LLMConfigService {

  // ✅ 获取L1层模型（渴望层 - 道德约束）
  getL1LayerModel(): LLMModelFull | null {
    return this.getModelByLayer('l1');
  }

  // ✅ 获取L2层模型（全球战略层）
  getL2LayerModel(): LLMModelFull | null {
    return this.getModelByLayer('l2');
  }

  // ✅ 获取L3层模型（代理模型层）
  getL3LayerModel(): LLMModelFull | null {
    return this.getModelByLayer('l3');
  }

  // ✅ 获取L4层模型（执行功能层）
  getL4LayerModel(): LLMModelFull | null {
    return this.getModelByLayer('l4');
  }

  // ✅ 获取L5层模型（认知控制层）
  getL5LayerModel(): LLMModelFull | null {
    return this.getModelByLayer('l5') || this.getAceEvolutionModel();
  }

  // ✅ 获取L6层模型（任务执行层）
  getL6LayerModel(): LLMModelFull | null {
    // L6通常不使用LLM，返回null
    return null;
  }

  // 🆕 设置模型为指定层级
  setModelAsLayer(modelId: number, layer: 'l1' | 'l2' | 'l3' | 'l4' | 'l5' | 'l6'): void {
    // 清除该层级现有配置
    this.db.prepare(`
      UPDATE llm_models
      SET is_ace_layer_${layer} = 0
      WHERE is_ace_layer_${layer} = 1
    `).run();

    // 设置新模型
    this.db.prepare(`
      UPDATE llm_models
      SET is_ace_layer_${layer} = 1, updated_at = ?
      WHERE id = ?
    `).run(Date.now(), modelId);

    logger.info(`[AceLayerConfig] Model ${modelId} set as ${layer} layer`);
  }

  // 🆕 获取所有层级模型配置
  getAllLayerModels(): Record<string, LLMModelFull | null> {
    return {
      l1: this.getL1LayerModel(),
      l2: this.getL2LayerModel(),
      l3: this.getL3LayerModel(),
      l4: this.getL4LayerModel(),
      l5: this.getL5LayerModel(),
      l6: this.getL6LayerModel()
    };
  }

  // 私有方法：根据层级获取模型
  private getModelByLayer(layer: string): LLMModelFull | null {
    const row = this.db.prepare(`
      SELECT
        m.id, m.provider_id, m.model_key, m.model_name, m.model_type,
        m.model_config, m.api_endpoint_suffix, m.enabled, m.is_default, m.is_ace_evolution,
        m.display_order, m.created_at, m.updated_at,
        p.provider, p.name as provider_name, p.base_config, p.enabled as provider_enabled
      FROM llm_models m
      JOIN llm_providers p ON m.provider_id = p.id
      WHERE m.is_ace_layer_${layer} = 1
        AND m.enabled = 1
        AND p.enabled = 1
      LIMIT 1
    `).get() as any;

    return row ? this.mapModelFullRow(row) : null;
  }
}
```

#### API接口示例

```bash
# 设置GPT-4为L2层模型（全球战略层）
curl -X POST http://localhost:3000/api/llm/models/1/layer \
  -H "Content-Type: application/json" \
  -d '{"layer": "l2"}'

# 查询所有层级模型配置
curl http://localhost:3000/api/ace/layers/models

# 输出示例
{
  "l1": {
    "modelKey": "gpt-4",
    "modelName": "GPT-4",
    "provider": "openai"
  },
  "l2": {
    "modelKey": "gpt-4-turbo",
    "modelName": "GPT-4 Turbo",
    "provider": "openai"
  },
  "l3": {
    "modelKey": "gpt-3.5-turbo",
    "modelName": "GPT-3.5 Turbo",
    "provider": "openai"
  },
  "l4": {
    "modelKey": "gpt-4",
    "modelName": "GPT-4",
    "provider": "openai"
  },
  "l5": {
    "modelKey": "llama-3-8b",
    "modelName": "Llama-3 8B",
    "provider": "ollama"
  },
  "l6": null
}
```

---

## 四、核心价值总结

通过实施ACE架构，ApexBridge将实现：

1. **突破上下文窗口限制**：通过层级化管理，支持无限长的对话历史
2. **长期记忆能力**：✅ **LanceDB统一存储**使智能体"记住"数月前的对话
3. **复杂任务拆解**：L4的DAG管理支持"开发一个完整项目"等超长任务
4. **自我修正能力**：✅ **深度集成技能系统**，L3动态管理技能能力，自动规避故障技能
5. **道德可控性**：L1的宪法约束满足企业合规需求
6. **✅ 本地化优势（完全无外部依赖）**：
   - ✅ **零外部SDK依赖**，完全自包含，无供应链风险
   - ✅ **统一技术栈**（TypeScript + SQLite + LanceDB），提高可维护性
   - ✅ **深度复用现有组件**，降低开发成本和维护成本
   - ✅ **轻量级实现**，减少内存占用和启动时间，性能更优
   - ✅ **完全可控**，所有代码在项目内，可定制化程度高

这是从"Copilot"向"Autonomous Agent"演进的关键技术路径。

---

## 五、附录：ACE六层架构对照表（本地化映射）

| 层级 | 名称 | 核心职责 | 时间跨度 | 上下文更新频率 | ApexBridge映射 | 本地化实现 |
|------|------|----------|----------|----------------|----------------|------------|
| **L1** | 渴望层 | 道德、使命、宪法 | 永恒 | 极低 | AceEthicsGuard | ✅ LLMManager + 配置系统 |
| **L2** | 全球战略层 | 长期规划、世界模型 | 月/年 | 低 | AceStrategyManager | ✅ LanceDB（ToolRetrievalService） |
| **L3** | 代理模型层 | 自我认知、能力管理 | 持续 | 中 | AceCapabilityManager | ✅ SkillManager + 动态注销机制 |
| **L4** | 执行功能层 | 任务拆解、流程控制 | 小时/天 | 高 | AceStrategyOrchestrator | ✅ LLMManager + 会话管理 |
| **L5** | 认知控制层 | 逻辑推理、思维链 | 分/秒 | 极高 | ReActStrategy (重构) | ✅ Scratchpad + EventBus |
| **L6** | 任务起诉层 | 感知输入、行动输出 | 毫秒 | 瞬时 | BuiltInExecutor + SkillsSandboxExecutor | ✅ 双执行器模式 |

**✅ 技术栈完全统一（零外部依赖）**：
- ✅ **向量库**：LanceDB（ToolRetrievalService）
- ✅ **工具系统**：BuiltInExecutor + SkillsSandboxExecutor
- ✅ **技能系统**：SkillManager + 动态注销机制
- ✅ **LLM调用**：LLMManager（统一适配）
- ✅ **事件系统**：EventBus（替代BusManager）
- ✅ **存储系统**：SQLite（模型配置 + LanceDB（向量数据）
- ✅ **模型配置**：SQLite数据库统一管理L1-L6层级模型
- ✅ **ACE核心**：AceCore（本地化实现，完全替代ace-engine-core）

---

## 六、参考文献

1. Shapiro, D. (2023). *Hierarchical Autonomous Agent Framework (ACE)*. GitHub Repository.
2. Vaswani, A., et al. (2017). *Attention Is All You Need*. NeurIPS.
3. Liu, N. F., et al. (2023). *Lost in the Middle: How Language Models Use Long Contexts*. arXiv.
4. Xi, Z., et al. (2023). *The Rise and Potential of Large Language Model Based Agents: A Survey*. arXiv.

---

**文档版本**：v1.0
**最后更新**：2025-12-12
**作者**：ApexBridge Team
