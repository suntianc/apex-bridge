## 1. ToolExecutionResult接口扩展（Week 1）

- [x] 1.1 定义MemoryWriteSuggestion接口
  - [x] 1.1.1 在`src/types/memory.ts`中定义`MemoryWriteSuggestion`接口
  - [x] 1.1.2 包含字段：ownerType, ownerId, type, importance, content
  - [x] 1.1.3 添加类型注释和文档

- [x] 1.2 定义StepTrace接口
  - [x] 1.2.1 在`src/types/memory.ts`中定义`StepTrace`接口
  - [x] 1.2.2 包含字段：stepId, stepName, input, output, duration, error?
  - [x] 1.2.3 添加类型注释和文档

- [x] 1.3 扩展ToolExecutionResult接口
  - [x] 1.3.1 在`src/types/index.ts`中扩展`ToolExecutionResult`接口
  - [x] 1.3.2 添加`memoryWrites?: MemoryWriteSuggestion[]`字段
  - [x] 1.3.3 添加`intermediateSteps?: StepTrace[]`字段
  - [x] 1.3.4 更新相关类型定义和导入

## 2. Skills与记忆系统对接（Week 1-2）

- [x] 2.1 在SkillsExecutionManager中收集memoryWrites
  - [x] 2.1.1 修改`SkillsExecutionManager.execute`方法
  - [x] 2.1.2 在执行器返回结果后收集memoryWrites
  - [x] 2.1.3 验证memoryWrites格式和有效性

- [x] 2.2 在SkillsExecutionManager中收集intermediateSteps
  - [x] 2.2.1 在执行过程中追踪中间步骤
  - [x] 2.2.2 记录每个步骤的输入、输出、耗时
  - [x] 2.2.3 处理步骤执行错误

- [x] 2.3 实现memoryWrites提交到IMemoryService
  - [x] 2.3.1 在`SkillsExecutionManager`中注入`IMemoryService`
  - [x] 2.3.2 将收集的memoryWrites提交到`IMemoryService.save`
  - [x] 2.3.3 实现错误处理和日志记录

- [x] 2.4 实现intermediateSteps用于调试和监控
  - [x] 2.4.1 将intermediateSteps输出到调试日志
  - [x] 2.4.2 实现性能分析和错误检测
  - [x] 2.4.3 实现详细步骤追踪

- [x] 2.5 更新SKILL.md格式规范
  - [x] 2.5.1 在`docs/skills/SKILL_FORMAT.md`中创建完整的格式规范文档
  - [x] 2.5.2 提供记忆写入示例和中间步骤追踪示例
  - [x] 2.5.3 更新最佳实践指南

## 3. Chat Pipeline基础记忆注入（Week 2-3）

- [x] 3.1 在ChatService中注入UserProfile / HouseholdProfile
  - [x] 3.1.1 实现`injectMemoriesIntoMessages`方法
  - [x] 3.1.2 从`IMemoryService`获取UserProfile和HouseholdProfile
  - [x] 3.1.3 将Profile信息注入到Prompt的[SYSTEM]部分

- [x] 3.2 注入最近消息（Session Memory）
  - [x] 3.2.1 实现`extractSessionMemory`方法提取Session Memory
  - [x] 3.2.2 将最近N条消息注入到Prompt的[MEMORY]部分
  - [x] 3.2.3 实现消息数量限制（默认50条，可配置）

- [x] 3.3 实现记忆上下文过滤
  - [x] 3.3.1 实现`filterMemoryByContext`方法
  - [x] 3.3.2 基于userId过滤记忆
  - [x] 3.3.3 基于householdId过滤记忆（预留）

- [x] 3.4 为后续Semantic/Episodic Memory预留参数位
  - [x] 3.4.1 在Prompt结构中预留Semantic Memory位置（注释）
  - [x] 3.4.2 在Prompt结构中预留Episodic Memory位置（注释）
  - [x] 3.4.3 定义SemanticMemoryOptions和EpisodicMemoryOptions接口
  - [x] 3.4.4 定义MemoryInjectionConfig接口

## 4. 测试和文档（Week 3）

- [x] 4.1 单元测试（可选，建议执行）
  - [x] 4.1.1 测试ToolExecutionResult接口扩展
    - [x] `tests/core/SkillsExecutionManager.test.ts` 新增 `Memory integration hooks` 用例，验证 `memoryWrites` 解析并转换为 `IMemoryService.save` 所需的结构
  - [x] 4.1.2 测试memoryWrites收集和提交
    - [x] 同一用例覆盖有效/无效写入建议的过滤与保存
  - [x] 4.1.3 测试intermediateSteps收集和追踪
    - [x] 通过 spy 确认 `processIntermediateSteps` 被调用（`tests/core/SkillsExecutionManager.test.ts`）
  - [x] 4.1.4 测试Chat Pipeline记忆注入
    - [x] 新增 `tests/services/ChatService.memory.test.ts`，验证 UserProfile、HouseholdProfile、Session Memory 注入逻辑

- [x] 4.2 集成测试（可选，建议执行）
  - [x] 4.2.1 测试Skills执行到记忆写入的完整流程
    - [x] `tests/integration/skills-memory-integration.test.ts` 覆盖 SkillsExecutionManager 与 IMemoryService 的端到端交互
  - [x] 4.2.2 测试Chat Pipeline记忆注入的完整流程
    - [x] 同一文件验证 `ChatService.processMessage` 实际注入记忆并生成 `memory:new_document` 事件
  - [x] 4.2.3 测试错误处理和边界情况
    - [x] 集成测试中模拟 `recall/save` 失败，确保 Skills 与 Chat 流程均能降级运行

- [x] 4.3 文档更新
  - [x] 4.3.1 创建SKILL.md格式规范文档（SKILL_FORMAT.md）
  - [x] 4.3.2 提供记忆写入和中间步骤追踪示例
  - [x] 4.3.3 更新最佳实践指南

