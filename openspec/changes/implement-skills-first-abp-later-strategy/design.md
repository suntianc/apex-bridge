## Context

ApexBridge项目当前基于VCPToolBox协议实现，面临协议合规风险（CC BY-NC-SA 4.0限制商业化）。同时，项目正在实施Skills架构以提升Token效率。本方案采用"Skills优先，ABP后续"的分阶段策略，在保证系统持续可用的前提下，完成架构现代化和协议合规化。

## Goals / Non-Goals

### Goals

#### 第一阶段目标
- 完成Skills架构实施，提升Token效率90%
- 实现记忆系统基础功能（Profile + Session Memory）
- 实现Skills执行中间步骤追踪（intermediateSteps）
- 实现监控与可观测性系统
- 保持VCP协议，完全向后兼容
- 系统功能完整，可正常使用

#### 第二阶段目标
- 实现ABP协议，解决协议合规问题（商业化前置条件）
- 实现多维记忆系统（四维记忆 + 权限控制 + 冲突解决）
- 实现向量库生命周期管理
- 实现Prompt结构规范
- 实现系统级回滚策略
- 完成RAG包品牌独立化

### Non-Goals

- 第一阶段不进行ABP协议迁移（保持VCP协议）
- 第一阶段不实现完整的四维记忆系统（仅实现Profile + Session）
- 第一阶段不进行RAG包重命名
- 第二阶段为可选（仅非商业场景），但商业化部署为必选

## Decisions

### 决策1: 分阶段实施策略

**选择**: Skills优先，ABP后续（方案四）

**理由**:
- 风险最低：两个重构工作完全分离，互不干扰
- 实施清晰：先完成Skills架构，再考虑协议迁移
- 向后兼容：每个阶段都保持系统可用
- 灵活调整：第二阶段可选，可根据实际情况决定

**替代方案**:
- 方案一：激进重构（5周）- 风险极高，与Skills架构冲突
- 方案二：渐进式重构 + Skills协调（10-12周）- 需要协调两个重构工作
- 方案三：双协议并行（折中）- 维护成本高

### 决策2: Skills执行结果结构

**选择**: ToolExecutionResult包含output、memoryWrites、intermediateSteps三个字段

**理由**:
- output：执行结果输出（必需）
- memoryWrites：记忆写入建议（可选，用于记忆系统集成）
- intermediateSteps：中间步骤追踪（可选，用于调试和可观测性）

**实现**:
```typescript
interface ToolExecutionResult {
  output: string;
  memoryWrites?: MemoryWriteSuggestion[];
  intermediateSteps?: StepTrace[];
}

interface StepTrace {
  stepId: string;
  stepName: string;
  input: any;
  output: any;
  duration: number;
  error?: Error;
}
```

### 决策3: ABP协议错误恢复机制

**选择**: 实现完整的错误恢复机制

**理由**:
- 现代LLM输出格式不稳定（部分JSON、语法错误、多余文本等）
- 必须支持自动修复和fallback，否则工具调用系统无法稳定运行

**实现策略**:
- 自动JSON修复（补全缺失括号、引号等）
- 噪声文本剥离（从LLM输出中提取有效JSON）
- 协议边界校验（验证开始/结束标记）
- 多JSON块处理（取最后一个有效块）
- 指令抽取器（从杂乱输出中恢复ABP block）
- 无法解析时fallback至纯文本响应

### 决策4: 记忆冲突解决策略

**选择**: 实现自动冲突检测和仲裁机制

**理由**:
- 长期运行后必然出现记忆冲突（用户偏好冲突、决策冲突等）
- 必须自动化处理，否则系统会混乱

**实现策略**:
- 冲突检测算法（识别同类记忆冲突）
- 自动仲裁策略（基于importance/recency/source-type）
- 记忆合并算法（"最新优先"或"高importance显式覆盖"）
- 可配置合并规则（memoryMergeRules）
- 手动冲突解决接口（管理员可手动合并或覆盖）

### 决策5: Prompt结构规范

**选择**: 明确定义Prompt结构格式

**理由**:
- 不同类型记忆必须按层级排序
- 不同Agent persona需要不同prompt layout
- 确保所有Agent输出格式一致

**结构定义**:
```
[SYSTEM]
- Persona prompt
- Household Profile（可选）
- User Profile（可选）

[MEMORY]
- High-importance Semantic memory (topK=3)
- Relevant Episodic memory (topK=1)
- Session history (last N条消息)

[RAG] (如需要)
- Retrieved KB documents

[USER]
- 当前用户消息

[TOOL INSTR]
- ABP工具调用格式定义（always included / dynamic）
```

### 决策6: 向量库生命周期管理

**选择**: 实现完整的生命周期管理机制

**理由**:
- 大规模写入时会超时（需要批处理）
- 结构变化时需要重建索引（需要版本控制）
- 需要清理过期数据（需要GC策略）

**实现策略**:
- 批处理embedding机制（避免大规模写入超时）
- 安全重建索引流程（支持importance/visibility/ownerType大规模变更）
- 索引版本控制（避免新旧模型冲突）
- tombstone/GC策略（清理已删除或过期的向量数据）

### 决策7: 系统级回滚策略

**选择**: 实现多层次的回滚机制

**理由**:
- 复杂架构重构必须支持回滚
- 企业级系统必备能力

**实现策略**:
- 代码回滚（Git revert流程）
- 数据回滚（Memory/RAG双写期间的回滚策略）
- 协议回滚（ABP → VCP fallback机制）
- Skills引擎降级（新执行器失败时切回旧执行器）
- Feature Flag总开关（全局管理、紧急关闭能力）

## Risks / Trade-offs

### 风险1: 总工期较长（25-33周）

**缓解**:
- 第一阶段完成后系统即可正常使用
- 第二阶段为可选（仅非商业场景）
- 分阶段实施，可独立验证

### 风险2: ABP解析错误

**缓解**:
- 实现完整的错误恢复机制
- 实现fallback机制
- 充分测试各种错误场景

### 风险3: 记忆冲突累积

**缓解**:
- 实现冲突检测和自动解决机制
- 定义合并规则
- 定期清理和归档

### 风险4: 向量库管理缺失

**缓解**:
- 实现生命周期管理（重建、版本控制、批处理）
- 定期维护和监控
- 实现GC策略

### 风险5: 协议合规未完成即商用

**缓解**:
- 明确规定：商业化前必须完成ABP迁移+合规审计
- 禁止VCP协议在生产环境商用
- 建立合规检查清单

## Migration Plan

### 第一阶段迁移

- **向后兼容**: 完全向后兼容，保持VCP协议
- **数据迁移**: 无需数据迁移
- **代码迁移**: 新增Skills架构，不影响现有功能

### 第二阶段迁移

- **协议迁移**: 通过双协议兼容层平滑过渡
- **数据迁移**: 
  - RAG/Memory拆分（数据迁移脚本）
  - 向量库重建（索引版本控制）
- **代码迁移**: 
  - 逐步替换VCP协议为ABP协议
  - 更新所有导入语句
- **回滚策略**: 支持快速回滚到VCP协议

### RAG包重命名迁移

- **包迁移**: vcp-intellicore-rag → abp-rag-sdk
- **依赖更新**: 更新package.json和所有导入语句
- **废弃旧包**: 在npm上标记vcp-intellicore-rag为deprecated

## Open Questions

1. ~~**Skills架构实施进度**: 需要确认当前Skills架构的实施状态和进度~~ ✅ **已确认**
   - **状态**: 第一阶段核心功能已完成（约85%）
   - **完成时间**: 2025-11-14
   - **详情**: 参见 `PHASE1_COMPLETION.md`
2. **ABP迁移必要性评估**: 第一阶段完成后，需要评估ABP迁移的必要性和成本
   - **当前状态**: 待评估（第一阶段完成后进行）
   - **评估标准**: 
     - 商业化时间表
     - 协议合规风险
     - 迁移成本与收益
3. **商业化时间表**: 如计划商业化，需要明确时间表以确定第二阶段执行时机
   - **当前状态**: 待确定
   - **影响**: 第二阶段为可选，但商业化部署为必选

