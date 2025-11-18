# 类型定义统一规范

## Purpose

统一项目中的类型定义，消除重复定义，建立清晰的类型组织结构，提高可维护性。

## Requirements

### Requirement 1: Message 类型统一

**描述**: 所有消息类型必须使用 `src/types/index.ts` 中定义的 `Message` 接口。

**约束**:
- `Message` 接口必须在 `src/types/index.ts` 中定义
- 其他文件不得重复定义 `Message` 或相似的消息结构
- `ABPMessage` 保留（ABP 协议专用，与 Message 有差异）

**Scenario**: 
- 当需要定义消息结构时，从 `src/types/index.ts` 导入 `Message`
- 当需要定义 ABP 协议消息时，使用 `ABPMessage`（`src/types/abp.ts`）
- 当需要定义 WebSocket 消息时，使用 `Message[]` 而不是内联定义

### Requirement 2: ChatOptions 类型统一

**描述**: 所有聊天选项类型必须使用 `src/types/index.ts` 中定义的 `ChatOptions` 接口。

**约束**:
- `ChatOptions` 接口必须在 `src/types/index.ts` 中定义
- 其他文件不得重复定义 `ChatOptions` 或相似的选项结构

**Scenario**:
- 当需要定义聊天选项时，从 `src/types/index.ts` 导入 `ChatOptions`
- 当需要定义 WebSocket 聊天选项时，使用 `ChatOptions` 而不是内联定义

### Requirement 3: 配置接口组织

**描述**: 配置接口应该组织清晰，便于查找和维护。

**约束**:
- 配置接口可以保留在各模块中（保持模块独立性）
- 或统一迁移到 `src/types/config.ts`（可选）
- 所有配置接口必须从 `types` 目录导出

**Scenario**:
- 当需要定义模块配置时，在模块对应的类型文件中定义
- 或统一在 `types/config.ts` 中定义
- 通过 `types/index.ts` 统一导出

## Delta for Type Unification

### ADDED Requirements

无新增需求。

### UPDATED Requirements

1. **ChatChannel 类型定义** - 从内联定义改为使用统一的 `Message` 和 `ChatOptions`
2. **类型导入规范** - 所有类型必须从 `src/types/index.ts` 导入

### REMOVED Requirements

1. **ChatChannel 内联类型定义** - 删除内联的消息和选项结构定义

