# 类型定义统一重构提案

## Why

当前项目中存在类型定义重复和分散的问题：

1. **Message 类型重复定义**：
   - `src/types/index.ts` - 定义了 `Message` 接口
   - `src/types/abp.ts` - 定义了 `ABPMessage` 接口（与 Message 相似但不同）
   - `src/api/websocket/channels/ChatChannel.ts` - 内联定义了消息结构（与 Message 相似）

2. **ChatOptions 类型重复定义**：
   - `src/types/index.ts` - 定义了 `ChatOptions` 接口
   - `src/api/websocket/channels/ChatChannel.ts` - 内联定义了 options 结构（与 ChatOptions 相似）

3. **配置接口分散**：
   - 各种 `*Config` 接口分散在不同模块中
   - `ConfigService.ts` 中定义了 `AdminConfig`、`RateLimit*Config` 等
   - `types/skills.ts` 中定义了 `SkillPermissionConfig`、`CacheConfig` 等
   - `types/proactivity.ts` 中定义了 `ProactivitySchedulerConfig` 等
   - `types/personality.ts` 中定义了 `PersonalityEngineConfig` 等
   - 各个服务文件中定义了各自的 `*Config` 接口

**问题**：
- **类型重复**：相同或相似的类型在多个地方定义，容易产生不一致
- **维护困难**：修改类型需要在多个地方同步更新
- **导入混乱**：不清楚应该从哪个文件导入类型
- **配置分散**：配置接口分散在不同模块，难以统一管理

## What Changes

### 目标
统一类型定义，建立清晰的类型组织结构，消除重复定义，提高可维护性。

### 范围
1. **统一 Message 类型**：
   - 保留 `src/types/index.ts` 中的 `Message` 作为标准定义
   - `ChatChannel.ts` 中的内联消息结构改为使用 `Message` 和 `ChatOptions`
   - `ABPMessage` 保留（ABP 协议专用，与 Message 有差异）

2. **统一 ChatOptions 类型**：
   - 保留 `src/types/index.ts` 中的 `ChatOptions` 作为标准定义
   - `ChatChannel.ts` 中的内联 options 结构改为使用 `ChatOptions`

3. **统一配置接口组织**：
   - 在 `src/types/` 目录下创建 `config.ts` 文件，统一管理配置接口
   - 将分散的配置接口按模块分类组织
   - 保持各模块配置接口的独立性（不强制合并）

### 非目标
- 不改变 `ABPMessage`（ABP 协议专用，与 Message 有差异）
- 不强制合并所有配置接口（保持模块独立性）
- 不改变现有的配置结构

## 影响范围

### 文件修改
- `src/api/websocket/channels/ChatChannel.ts` - 使用统一的 `Message` 和 `ChatOptions`
- `src/types/index.ts` - 确保类型定义完整
- `src/types/config.ts` - 新建文件，统一管理配置接口（可选）

### 文件保留
- `src/types/abp.ts` - 保留 `ABPMessage`（ABP 协议专用）
- 各模块的配置接口 - 保留在各自模块中（可选，或迁移到 `config.ts`）

## 验收标准

1. ✅ ChatChannel 使用统一的 `Message` 和 `ChatOptions` 类型
2. ✅ 所有类型定义从 `src/types/index.ts` 导入
3. ✅ 配置接口组织清晰（可选：统一到 `config.ts`）
4. ✅ 代码通过编译和测试
5. ✅ 类型功能正常工作

