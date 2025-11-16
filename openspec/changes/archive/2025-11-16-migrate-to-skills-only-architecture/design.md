# 技术架构设计：迁移到 Skills 唯一架构

## Context

### 背景

当前 ApexBridge 项目维护两套并行的插件执行系统：
- **Plugin 系统**：传统的 `plugin-manifest.json` 格式，通过 `PluginRuntime` 执行
- **Skills 系统**：现代的 `SKILL.md` + `METADATA.yml` 格式，通过 `SkillsExecutionManager` 执行

这种并行架构导致：
1. 代码复杂度高，需要维护两套系统
2. ChatService 仍主要使用 PluginRuntime，Skills 系统未被充分利用
3. 工具描述生成不支持渐进式披露，Token 效率低
4. 开发者需要在两套系统间做选择，学习成本高

### 约束

- 必须保持现有 API 兼容性（工具调用接口）
- 必须支持现有工具的正常运行
- 必须实现 Token 使用量减少（渐进式披露）
- 必须提供平滑的迁移路径

### 利益相关者

- **开发者**：需要统一的插件开发方式
- **系统维护者**：需要简化架构，降低维护成本
- **最终用户**：需要更好的性能和响应速度

## Goals / Non-Goals

### Goals

1. **统一架构**：Skills 系统成为唯一的插件执行引擎
2. **渐进式披露**：实现完整的三段渐进式披露机制，降低 Token 使用
3. **平滑迁移**：提供自动化工具和详细文档支持 Plugin 到 Skills 迁移
4. **API 兼容**：保持现有工具调用 API 不变，仅内部实现变更
5. **性能优化**：通过渐进式披露减少 70-90% 的 Token 使用量

### Non-Goals

- 不支持在迁移期间同时运行两套系统（分阶段迁移）
- 不提供 Plugin 到 Skills 的自动适配层（需要显式迁移）
- 不改变外部 API 接口（仅内部架构变更）

## Decisions

### Decision 1: Skills 作为唯一执行引擎

**决策**：使用 `SkillsExecutionManager` 作为唯一的插件执行引擎，完全移除 `PluginRuntime`。

**理由**：
- Skills 系统已实现完整的执行器体系（direct, service, distributed, static, preprocessor, internal）
- Skills 系统支持渐进式加载，Token 效率高
- Skills 系统采用标准化的 Claude Code Skills 格式，更易维护
- 减少系统复杂度，只需维护一套系统

**替代方案**：
- 保持双系统并行：被拒绝，因为会增加维护成本
- 仅改造 PluginRuntime 添加渐进式披露：被拒绝，因为 Plugin 格式不如 Skills 灵活

### Decision 2: 三段渐进式披露机制

**决策**：实现三段渐进式披露机制，根据置信度动态加载工具描述。

**三个阶段**：
1. **Phase 1（元数据）**：~50 tokens，仅名称和简短描述，启动时加载
2. **Phase 2（简要）**：~200 tokens，添加参数列表，置信度 > 0.15 时加载
3. **Phase 3（完整）**：~1000-5000 tokens，所有细节，置信度 > 0.7 或执行前加载

**置信度阈值**：
- Phase 1 → Phase 2: `confidence >= 0.15`（初步匹配）
- Phase 2 → Phase 3: `confidence >= 0.7`（确定执行）

**理由**：
- 符合 Claude Code Skills 设计理念
- 能够显著降低 Token 使用（预期减少 70-90%）
- 根据 Agent 需求动态加载，避免不必要的上下文开销

**替代方案**：
- 两段披露（元数据 + 完整）：被拒绝，因为缺少中间层会影响工具选择质量
- 固定加载完整描述：被拒绝，因为会导致 Token 浪费

### Decision 3: 工具描述生成策略

**决策**：实现 `SkillsToolDescriptionGenerator`，基于 Skills 元数据动态生成三个阶段描述。

**生成逻辑**：
- **Phase 1**：从 `METADATA.yml` 提取 `name` 和 `description`
- **Phase 2**：添加 ABP 工具定义中的参数列表和基本说明
- **Phase 3**：加载 `SKILL.md` 完整内容，包含详细步骤、示例、最佳实践

**缓存策略**：
- Phase 1 描述：永久缓存（元数据不变）
- Phase 2 描述：TTL 缓存（30分钟）
- Phase 3 描述：按需加载，TTL 缓存（15分钟）

**理由**：
- 利用现有的 Skills 元数据，无需额外维护
- 三个阶段描述内容递增，符合渐进式披露理念
- 缓存策略平衡性能和数据新鲜度

### Decision 4: 迁移策略

**决策**：分两阶段实施，先集成后移除。

**阶段划分**：
1. **第一阶段**：Skills 系统集成 + 三段披露实现
   - 保持 Plugin 系统运行
   - ChatService 迁移到 SkillsExecutionManager
   - 验证功能完整性
2. **第二阶段**：Plugin 系统移除
   - 确认所有功能正常
   - 移除 Plugin 相关代码
   - 清理依赖

**理由**：
- 降低风险，允许回滚
- 逐步验证，确保稳定性
- 减少对现有功能的影响

**替代方案**：
- 一次性迁移：被拒绝，风险太大
- 仅标记废弃，不实际移除：被拒绝，因为会增加维护成本

## Architecture

### 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    ChatService                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  executeAllowedTool()                                │  │
│  │    ↓                                                  │  │
│  │  SkillsToToolMapper.mapToolToSkill()                 │  │
│  │    ↓                                                  │  │
│  │  SkillsExecutionManager.executeByIntent()            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│              ProtocolEngine                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ToolDescriptionProvider                             │  │
│  │    ↓                                                  │  │
│  │  SkillsToolDescriptionGenerator                      │  │
│  │    ├─ Phase 1: getMetadataDescription()              │  │
│  │    ├─ Phase 2: getBriefDescription()                 │  │
│  │    └─ Phase 3: getFullDescription()                  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│              SkillsExecutionManager                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - executeByIntent()                                 │  │
│  │  - executeWithFallback()                             │  │
│  │  - registerExecutor()                                │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 核心组件

#### 1. SkillsToolDescriptionGenerator

**职责**：基于 Skills 元数据生成三个阶段描述。

**接口**：
```typescript
interface SkillsToolDescriptionGenerator {
  // Phase 1: 元数据级别（~50 tokens）
  getMetadataDescription(skillName: string): Promise<string>;
  
  // Phase 2: 简要级别（~200 tokens）
  getBriefDescription(skillName: string): Promise<string>;
  
  // Phase 3: 完整级别（~1000-5000 tokens）
  getFullDescription(skillName: string): Promise<string>;
  
  // 根据置信度选择描述阶段
  getDescriptionByConfidence(
    skillName: string, 
    confidence: number
  ): Promise<string>;
}
```

**实现要点**：
- Phase 1: 从 `MetadataLoader` 获取元数据，提取 `name` 和 `description`
- Phase 2: 从 ABP 工具定义获取参数列表，生成简要描述
- Phase 3: 从 `InstructionLoader` 加载 `SKILL.md` 完整内容
- 使用 LRU 缓存减少重复加载

#### 2. SkillsToToolMapper

**职责**：在工具调用（Tool Call）和 Skills 执行之间建立映射。

**接口**：
```typescript
interface SkillsToToolMapper {
  // 工具名称映射到 Skill
  mapToolToSkill(toolName: string): Promise<SkillMetadata | null>;
  
  // 工具调用转换为 Skills 执行请求
  convertToolCallToExecutionRequest(
    tool: ToolRequest
  ): Promise<ExecutionRequest>;
  
  // Skills 执行结果转换为工具调用结果
  convertExecutionResponseToToolResult(
    response: ExecutionResponse
  ): Promise<any>;
}
```

**实现要点**：
- 工具名称与 Skill 名称一一对应
- 参数映射：`tool.args` → `ExecutionRequest.parameters`
- 结果转换：`ExecutionResponse.result.data` → 工具调用结果

#### 3. ToolDescriptionProvider 改造

**职责**：根据置信度动态选择工具描述阶段。

**修改点**：
- 集成 `SkillsToolDescriptionGenerator`
- 支持置信度参数：`resolve(key, context: { confidence?: number })`
- 根据置信度自动选择描述阶段

**置信度来源**：
- `ToolAuthorization` 决策中的置信度
- Skills 匹配算法返回的置信度
- 默认使用 Phase 1（元数据级别）

## Risks / Trade-offs

### 风险 1: ChatService 迁移复杂度高

**风险**：ChatService 大量依赖 PluginRuntime，迁移工作量大。

**缓解措施**：
- 分阶段迁移，先实现适配层
- 保持 API 兼容性，仅内部实现变更
- 充分测试确保功能完整性

### 风险 2: 现有 Plugin 迁移困难

**风险**：某些 Plugin 可能需要手动调整才能完全迁移到 Skills 格式。

**缓解措施**：
- 提供自动化迁移工具
- 提供详细的迁移文档和示例
- 支持渐进式迁移，允许逐步调整

### 风险 3: 置信度阈值调优

**风险**：三段渐进式披露的置信度阈值可能需要根据实际使用调优。

**缓解措施**：
- 提供配置选项允许调整阈值
- 记录实际使用数据，持续优化
- 提供性能监控和指标收集

### Trade-off: Token 效率 vs 响应延迟

**权衡**：渐进式披露减少了 Token 使用，但增加了加载次数。

**决策**：优先考虑 Token 效率，因为：
- Token 成本是持续性的
- 加载延迟是一次性的，且可通过缓存优化
- 预期 Token 使用减少 70-90%，收益显著

## Migration Plan

### Phase 1: Skills 系统集成（6-8周）

**Week 1-2: 核心组件开发**
- [ ] 实现 `SkillsToolDescriptionGenerator`
- [ ] 实现 `SkillsToToolMapper`
- [ ] 修改 `ToolDescriptionProvider` 支持置信度选择

**Week 3-4: ChatService 集成**
- [ ] 在 ChatService 中添加 SkillsExecutionManager
- [ ] 实现工具调用到 Skills 执行的映射
- [ ] 保持 PluginRuntime 作为后备（双系统运行）

**Week 5-6: 测试验证**
- [ ] 功能测试确保所有工具调用正常
- [ ] 性能测试验证 Token 使用减少
- [ ] 兼容性测试确保 API 接口保持不变

**Week 7-8: 优化调整**
- [ ] 调优置信度阈值
- [ ] 优化缓存策略
- [ ] 性能优化和 bug 修复

### Phase 2: Plugin 系统移除（3-4周）

**Week 1-2: 迁移工具开发**
- [ ] 创建 `scripts/migrate-plugins-to-skills.ts`
- [ ] 迁移现有 plugins/ 目录下的插件
- [ ] 验证迁移后的功能完整性

**Week 3: 代码清理**
- [ ] 移除 ChatService 中的 PluginRuntime 后备
- [ ] 移除 ProtocolEngine 中的 PluginRuntime 初始化
- [ ] 删除 `src/core/plugin/` 目录
- [ ] 删除 `src/core/PluginLoader.ts`
- [ ] 删除 `src/types/plugin.ts`

**Week 4: 测试和文档**
- [ ] 完整回归测试
- [ ] 更新文档和示例
- [ ] 发布迁移指南

### 回滚计划

如果迁移过程中出现严重问题：

1. **回滚到 Phase 1 结束状态**：恢复 PluginRuntime 作为后备
2. **回滚到初始状态**：恢复 ChatService 使用 PluginRuntime
3. **修复问题后重新迁移**：解决问题后继续迁移流程

## Open Questions

1. **置信度计算**：如何准确计算工具调用的置信度？
   - 答案：使用 `ToolAuthorization` 决策中的置信度，或 Skills 匹配算法返回的置信度

2. **缓存失效策略**：Skills 更新后如何失效缓存？
   - 答案：基于文件修改时间（mtime）或内容哈希（content hash）判断是否需要重新加载

3. **分布式 Skills**：如何处理分布式 Skills 的描述生成？
   - 答案：分布式 Skills 仅支持 Phase 1 和 Phase 2，Phase 3 需要从远程节点获取

