# Remove VCP Protocol Support

## Why

1. **商业合规要求**: VCP协议基于CC BY-NC-SA 4.0许可证，限制了商业化部署能力。ABP协议采用Apache-2.0许可证，支持商业化。
2. **品牌独立化**: 从VCP体系完全过渡到ABP体系，实现品牌和协议完全独立。
3. **架构简化**: 移除双协议支持，简化代码维护复杂度，统一协议栈。
4. **技术债务清理**: 移除遗留的VCP协议代码，降低系统复杂度。

## What Changes

### 核心变更

1. **移除VCP协议解析器**: 完全移除`vcp-intellicore-sdk`依赖，不再支持VCP协议解析
2. **移除VCP依赖包**: 从`package.json`移除`vcp-intellicore-sdk`和`vcp-intellicore-rag`
3. **重命名核心组件**: `VCPEngine` → `ProtocolEngine`（统一名称）
4. **更新WebSocket路径**: `/VCPlog` → `/ABPlog`，`/vcp-distributed-server` → `/abp-distributed-server`
5. **更新配置项**: `vcpKey` → `apiKey`，`VCP_KEY` → `ABP_KEY`
6. **移除VCP转换器**: 移除`VCPToABPConverter`（不再需要）

### 保留功能

- **变量系统**: ABP变量引擎已实现，变量提供者逻辑保留（独立实现）
- **插件系统**: 插件加载和执行逻辑保留（使用独立实现）
- **分布式通信**: WebSocket通信协议保留（协议无关）

### 受影响模块

- `src/core/VCPEngine.ts` → `src/core/ProtocolEngine.ts`
- `src/core/PluginLoader.ts` → 移除VCP SDK依赖
- `src/core/protocol/VCPToABPConverter.ts` → 删除
- `src/services/ChatService.ts` → 更新引用
- `src/api/websocket/WebSocketManager.ts` → 更新路径
- `config/admin-config.json` → 更新配置项
- `package.json` → 移除依赖

## Impact

- **BREAKING**: 完全移除VCP协议支持，不再向后兼容VCP格式
- **Affected specs**: 
  - `protocol` - 移除VCP协议支持
  - `core` - 核心引擎重命名和简化

## Non-Goals

- 不迁移VCP协议到ABP协议（用户需要自行迁移）
- 不保留VCP协议的任何兼容层
- 不更新外部项目的VCP引用（仅更新本项目）

