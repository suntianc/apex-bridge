# Change: 迁移到 Skills 唯一架构

**变更ID**: migrate-to-skills-only-architecture
**创建日期**: 2025-01-27
**状态**: 提案阶段

## Why

当前 ApexBridge 项目存在两套并行的插件系统：

1. **Plugin 插件系统**（传统系统）：
   - 使用 `plugin-manifest.json` 格式
   - 通过 `PluginRuntime` 执行
   - 不支持渐进式披露机制
   - Token 效率低（全量加载）

2. **Skills 系统**（新系统）：
   - 使用 `SKILL.md` + `METADATA.yml` 格式
   - 通过 `SkillsExecutionManager` 执行
   - 支持三级加载架构（元数据→指令→资源）
   - Token 效率高（按需加载）

**问题**：
- 两套系统并行导致代码复杂度高、维护成本大
- ChatService 仍在使用 PluginRuntime，Skills 系统未完全集成
- 工具描述生成不支持三段渐进式披露机制
- 缺乏统一的工具执行入口

**目标**：
- 将 Skills 系统替换 Plugin 插件系统作为唯一的插件执行引擎
- 实现完整的三段渐进式披露机制（元数据→简要→完整）
- 完全移除 Plugin 系统相关代码，简化架构

## What Changes

### 第一阶段：Skills 系统集成（6-8周）

- **Skills 执行引擎集成**
  - 将 `ChatService` 从 `PluginRuntime.executePlugin()` 迁移到 `SkillsExecutionManager.executeByIntent()`
  - 实现 Skills 到工具调用的映射机制
  - 保持现有工具调用 API 兼容性

- **三段渐进式披露机制**
  - Phase 1（元数据级别）：仅工具名称和简短描述（~50 tokens）
    - 在启动/会话初始化时加载所有 Skills 元数据
    - 用于工具发现和初步匹配
  - Phase 2（简要级别）：添加参数列表和基本说明（~200 tokens）
    - 当置信度 > 0.15 时加载简要描述
    - 用于工具选择决策
  - Phase 3（完整级别）：包含所有细节、示例和注意事项（~1000-5000 tokens）
    - 当置信度 > 0.7 或工具即将执行时加载完整描述
    - 用于工具执行指导

- **工具描述生成器改造**
  - 实现 `SkillsToolDescriptionGenerator`，支持三个阶段描述生成
  - 修改 `ToolDescriptionProvider` 支持基于置信度的描述选择
  - 集成到 `ProtocolEngine` 和 `ChatService`

### 第二阶段：Plugin 系统移除（3-4周）

- **代码清理**
  - 移除 `PluginRuntime` 及其依赖
  - 移除 `PluginLoader` 和 `plugin-manifest.json` 支持
  - 移除 `src/core/plugin/` 目录
  - 移除 `src/types/plugin.ts` 类型定义

- **依赖清理**
  - 移除 `PlaceholderProvider` 中对 `PluginRuntime` 的依赖
  - 移除 `ProtocolEngine` 中对 `PluginRuntime` 的初始化
  - 更新 `ChatService` 移除所有 Plugin 相关调用

- **迁移工具**
  - 创建 `scripts/migrate-plugins-to-skills.ts` 自动化迁移工具
  - 将现有 `plugins/` 目录下的插件转换为 Skills 格式

**BREAKING**: 
- 完全移除 Plugin 插件系统支持
- 所有插件必须迁移到 Skills 格式
- `plugin-manifest.json` 格式不再支持
- `PluginRuntime` API 完全移除

## Impact

### Affected Specs

- **`skills`** - 修改 Skills 架构规范，添加三段渐进式披露机制
- **`protocol`** - 移除 Plugin 相关协议支持，仅保留 Skills 执行路径
- **`chat-pipeline`** - 修改 Chat Pipeline 集成，使用 SkillsExecutionManager 替代 PluginRuntime

### Affected Code

- **核心引擎**
  - `src/core/ProtocolEngine.ts` - 移除 PluginRuntime，集成 SkillsExecutionManager
  - `src/core/skills/` - 添加三段渐进式披露机制
  - `src/core/skills/SkillsExecutionManager.ts` - 增强以支持工具调用映射
  - `src/core/variable/providers/ToolDescriptionProvider.ts` - 实现基于置信度的描述选择

- **服务层**
  - `src/services/ChatService.ts` - 替换 PluginRuntime 调用为 SkillsExecutionManager
  - `src/api/controllers/SetupController.ts` - 移除 Plugin 配置相关代码

- **工具层**
  - 新增 `src/core/skills/SkillsToolDescriptionGenerator.ts` - 三段描述生成器
  - 新增 `src/core/skills/SkillsToToolMapper.ts` - Skills 到工具调用映射器

- **删除代码**
  - `src/core/plugin/` - 整个目录
  - `src/core/PluginLoader.ts` - 删除
  - `src/types/plugin.ts` - 删除
  - `src/core/variable/providers/PlaceholderProvider.ts` - 需要重写以支持 Skills

### Dependencies

- 无新增外部依赖
- 移除对 Plugin 系统的内部依赖

### Migration Path

1. **现有 Plugin 迁移**
   - 使用自动化迁移工具将 `plugins/` 目录下的所有插件转换为 Skills 格式
   - 迁移到 `skills/` 目录
   - 验证迁移后的功能完整性

2. **配置更新**
   - 更新 `admin-config.json` 移除 Plugin 相关配置
   - 更新文档和示例代码

3. **测试验证**
   - 完整回归测试确保所有工具调用正常
   - 性能测试验证 Token 使用量减少
   - 兼容性测试确保 API 接口保持不变

### Timeline

- **第一阶段**（Skills 系统集成）：6-8周
- **第二阶段**（Plugin 系统移除）：3-4周
- **总计**：9-12周

### Risks

- **高风险**：ChatService 大量依赖 PluginRuntime，迁移工作量大
- **中风险**：现有 Plugin 可能需要手动调整才能完全迁移到 Skills 格式
- **低风险**：三段渐进式披露机制需要仔细设计置信度阈值

### Mitigation

- 分阶段实施，每阶段完成后进行全面测试
- 保留迁移工具支持批量转换
- 提供详细的迁移文档和示例

