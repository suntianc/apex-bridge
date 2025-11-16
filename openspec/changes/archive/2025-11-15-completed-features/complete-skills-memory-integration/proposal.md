## Why

第一阶段Skills架构核心功能已完成（85%），但记忆系统集成尚未完成。为了完整实现Skills与记忆系统的对接，使系统功能完整可用，需要完成以下工作：

1. **ToolExecutionResult接口扩展**：支持memoryWrites和intermediateSteps，实现Skills执行结果的记忆写入和调试追踪
2. **Skills与记忆系统对接**：实现memoryWrites收集和提交，intermediateSteps用于调试和监控
3. **Chat Pipeline基础记忆注入**：在对话中使用记忆系统，注入UserProfile、HouseholdProfile和Session Memory

这些工作是第一阶段的核心功能，完成后系统将具备完整的记忆系统支持。

## What Changes

### 1. ToolExecutionResult接口扩展

- 扩展`ToolExecutionResult`接口，添加`memoryWrites?: MemoryWriteSuggestion[]`字段
- 扩展`ToolExecutionResult`接口，添加`intermediateSteps?: StepTrace[]`字段
- 定义`MemoryWriteSuggestion`接口（ownerType, ownerId, type, importance, content）
- 定义`StepTrace`接口（stepId, stepName, input, output, duration, error?）

### 2. Skills与记忆系统对接

- 在`SkillsExecutionManager`中收集`memoryWrites`和`intermediateSteps`
- 将`memoryWrites`统一交给`IMemoryService.appendMemory`
- 将`intermediateSteps`用于调试日志和可观测性监控
- 更新SKILL.md格式规范，添加记忆写入说明

### 3. Chat Pipeline基础记忆注入

- 在`ChatService`构建Prompt时注入`UserProfile` / `HouseholdProfile`
- 注入最近消息（Session Memory）
- 实现记忆上下文过滤（基于userId, householdId）
- 为后续Semantic/Episodic Memory预留参数位

## Impact

- **Affected specs**: 
  - `skills` - 修改Skills执行结果结构
  - `memory` - 扩展记忆系统接口
  - `chat-pipeline` - 修改Chat Pipeline集成记忆系统
- **Affected code**:
  - `src/types/index.ts` - 扩展ToolExecutionResult接口
  - `src/core/skills/SkillsExecutionManager.ts` - 实现memoryWrites和intermediateSteps收集
  - `src/services/ChatService.ts` - 实现记忆注入
  - `src/types/memory.ts` - 添加MemoryWriteSuggestion和StepTrace接口
  - `docs/skills/SKILL.md` - 更新格式规范
- **Dependencies**: 
  - 依赖现有的IMemoryService实现
  - 依赖现有的Skills架构实现
- **Timeline**: 
  - 预计2-3周完成

---

## Approval

**Status**: ✅ **APPROVED**

**Approved by**: User (Project Owner)

**Approval Date**: 2025-11-14

**Approval Notes**: 
- 提案已完整审查，符合项目需求和OpenSpec规范
- 技术决策合理，设计文档完整
- 任务清单详细，可执行性强
- 规范变更清晰，覆盖所有受影响能力

**Next Steps**:
1. 开始实施：按照 `tasks.md` 中的任务清单逐步执行
2. 每周进度评审：跟踪实施进度，识别风险
3. 关键里程碑检查：确保每个阶段按时完成

---

## 实施状态

**状态**: ✅ **核心功能已完成（约90%）**

**完成日期**: 2025-11-14

**完成情况**:
- ✅ **ToolExecutionResult接口扩展** - 100% 完成
- ✅ **Skills与记忆系统对接** - 100% 完成
- ✅ **Chat Pipeline基础记忆注入** - 100% 完成
- ⚠️ **测试和文档** - 50% 完成（文档已完成，测试建议后续执行）

**核心成果**:
- ✅ 完整实现memoryWrites和intermediateSteps支持
- ✅ Skills执行结果可以写入记忆
- ✅ Chat Pipeline可以注入记忆上下文
- ✅ SKILL.md格式规范文档已创建

**待完成工作**:
- ⏸️ 单元测试和集成测试（可选，建议执行）

