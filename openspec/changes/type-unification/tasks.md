# 类型定义统一重构任务清单

## Task 1: 统一 Message 和 ChatOptions 类型

### Task 1.1: 修改 ChatChannel 使用统一类型
- 在 `ChatChannel.ts` 中导入 `Message` 和 `ChatOptions` 类型
- 将 `ChatMessage` 接口中的内联消息结构改为使用 `Message[]`
- 将 `ChatMessage` 接口中的内联 options 结构改为使用 `ChatOptions`

### Task 1.2: 验证类型兼容性
- 确保 `ChatChannel` 中的消息结构与 `Message` 兼容
- 确保 `ChatChannel` 中的 options 结构与 `ChatOptions` 兼容
- 如有不兼容，调整 `Message` 或 `ChatOptions` 定义

### Task 1.3: 更新相关代码
- 检查是否有其他文件内联定义了类似的消息结构
- 统一使用 `Message` 和 `ChatOptions` 类型

## Task 2: 统一配置接口组织（可选）

### Task 2.1: 创建 config.ts 文件
- 在 `src/types/` 目录下创建 `config.ts` 文件
- 按模块分类组织配置接口

### Task 2.2: 迁移配置接口
- 将分散的配置接口迁移到 `config.ts`（可选）
- 或保持在各模块中，但统一导出

### Task 2.3: 更新导入
- 更新所有使用配置接口的代码
- 统一从 `types/config.ts` 或 `types/index.ts` 导入

## Task 3: 验证与测试

### Task 3.1: 类型检查
- 运行 TypeScript 编译检查
- 确保没有类型错误

### Task 3.2: 功能测试
- 测试 ChatChannel 的 WebSocket 功能
- 确保消息和选项处理正常

### Task 3.3: 导入验证
- 检查所有类型导入是否统一
- 确保没有重复定义

## Task 4: 文档更新

### Task 4.1: 更新代码注释
- 更新类型定义的注释，说明统一使用的位置
- 更新架构文档，说明类型组织结构

### Task 4.2: 更新架构文档
- 在 ARCHITECTURE_ANALYSIS.md 中说明统一的类型管理策略

