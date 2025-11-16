## Context

第一阶段Skills架构核心功能已完成（85%），但记忆系统集成尚未完成。为了完整实现Skills与记忆系统的对接，需要完成ToolExecutionResult接口扩展、Skills与记忆系统对接、以及Chat Pipeline基础记忆注入。

## Goals / Non-Goals

### Goals

1. **ToolExecutionResult接口扩展**
   - 支持memoryWrites和intermediateSteps字段
   - 实现Skills执行结果的记忆写入和调试追踪

2. **Skills与记忆系统对接**
   - 实现memoryWrites收集和提交
   - 实现intermediateSteps用于调试和监控

3. **Chat Pipeline基础记忆注入**
   - 注入UserProfile / HouseholdProfile
   - 注入Session Memory
   - 实现记忆上下文过滤

### Non-Goals

- 不实现完整的四维记忆系统（仅实现Profile + Session Memory）
- 不实现Semantic/Episodic Memory（第二阶段任务）
- 不实现记忆冲突解决机制（第二阶段任务）
- 不实现Prompt结构规范（第二阶段任务）

## Decisions

### 决策1: ToolExecutionResult接口扩展

**选择**: 在现有`ToolExecutionResult`接口中添加可选字段

**理由**:
- 保持向后兼容（可选字段）
- 符合设计文档中的决策2（Skills执行结果结构）
- 支持记忆系统集成和可观测性

**实现**:
```typescript
interface ToolExecutionResult {
  requestId: string;
  status: 'success' | 'error';
  result?: any;
  error?: string;
  // 新增字段
  memoryWrites?: MemoryWriteSuggestion[];
  intermediateSteps?: StepTrace[];
}
```

### 决策2: MemoryWriteSuggestion接口设计

**选择**: 定义独立的MemoryWriteSuggestion接口

**理由**:
- 清晰的接口定义
- 支持多种记忆类型
- 便于验证和处理

**实现**:
```typescript
interface MemoryWriteSuggestion {
  ownerType: 'user' | 'household' | 'task' | 'group';
  ownerId: string;
  type: 'preference' | 'fact' | 'event' | 'summary';
  importance: number; // 1-5
  content: string;
  metadata?: Record<string, any>;
}
```

### 决策3: StepTrace接口设计

**选择**: 定义StepTrace接口用于中间步骤追踪

**理由**:
- 支持多步骤执行追踪
- 支持调试和性能分析
- 支持可观测性监控

**实现**:
```typescript
interface StepTrace {
  stepId: string;
  stepName: string;
  input: any;
  output: any;
  duration: number; // milliseconds
  error?: Error;
  timestamp?: number;
}
```

### 决策4: 记忆注入策略

**选择**: 在ChatService中实现记忆注入

**理由**:
- 集中管理Prompt构建逻辑
- 便于维护和扩展
- 符合现有架构

**实现策略**:
- 在`ChatService.buildPrompt`中注入记忆
- 使用分层结构：[SYSTEM]、[MEMORY]、[USER]、[TOOL INSTR]
- 实现Token控制和优先级排序

## Risks / Trade-offs

### 风险1: 接口扩展可能影响现有代码

**缓解**:
- 使用可选字段，保持向后兼容
- 充分测试现有功能
- 逐步迁移

### 风险2: 记忆注入可能增加Token消耗

**缓解**:
- 实现Token控制机制
- 限制记忆数量
- 实现优先级排序

### 风险3: 性能影响

**缓解**:
- 异步处理memoryWrites提交
- 缓存记忆数据
- 优化查询性能

## Migration Plan

### 向后兼容

- 所有新字段都是可选的
- 现有代码无需修改即可继续工作
- 逐步启用新功能

### 数据迁移

- 无需数据迁移
- 新功能使用现有IMemoryService接口

### 代码迁移

- 逐步更新Skills执行器以支持新接口
- 更新ChatService以支持记忆注入
- 保持向后兼容

## Open Questions

1. **IMemoryService.appendMemory接口**: 需要确认是否已实现，如未实现需要先实现
2. **记忆注入Token限制**: 需要确定合适的Token限制值
3. **intermediateSteps存储**: 需要确定是否持久化存储，还是仅用于实时监控

