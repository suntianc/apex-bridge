# 节点管理和工具授权清理任务清单

## Task 1: 删除核心文件

### Task 1.1: 删除 NodeService
- 删除 `src/services/NodeService.ts`

### Task 1.2: 删除 NodeManager
- 删除 `src/core/NodeManager.ts`

### Task 1.3: 删除 NodeController
- 删除 `src/api/controllers/NodeController.ts`

### Task 1.4: 删除 ToolAuthorization
- 删除 `src/core/conversation/ToolAuthorization.ts`

## Task 2: 简化 ChatService

### Task 2.1: 移除授权相关导入和属性
- 移除 `ToolAuthorization` 导入
- 移除 `NodeManager` 导入
- 移除 `ToolAuthorizationDecision` 导入（如果不再需要）
- 移除 `toolAuthorization` 属性
- 移除 `nodeManager` 属性

### Task 2.2: 移除授权相关方法
- 移除 `setToolAuthorization` 方法
- 移除 `setNodeManager` 方法
- 移除 `evaluateToolAuthorization` 方法
- 移除 `resolveApprovalForDecision` 方法
- 移除 `buildAuthorizationError` 方法
- 移除 `findMatchingApproval` 方法
- 移除 `ensureToolApprovalRequest` 方法

### Task 2.3: 简化工具执行逻辑
- 修改 `executeAllowedTool` 方法，移除授权检查和节点派发
- 简化工具执行流程，直接执行所有工具请求
- 移除 `AuthorizedToolCall` 类型，直接使用 `ToolRequest`

## Task 3: 简化 ConversationRouter

### Task 3.1: 移除 NodeService 依赖
- 移除 `NodeService` 导入
- 移除 `nodeService` 属性
- 移除构造函数中的 `nodeService` 参数

### Task 3.2: 简化成员绑定逻辑
- 简化 `ensureHubMemberBinding` 方法，移除节点验证
- 简化或删除 `ensureNodeMemberBinding` 方法
- 直接使用传入的成员信息，不进行验证

## Task 4: 清理 server.ts

### Task 4.1: 移除相关导入
- 移除 `NodeService` 导入
- 移除 `ToolAuthorization` 导入
- 移除 `NodeController` 导入

### Task 4.2: 移除初始化和路由
- 移除 `NodeService` 初始化
- 移除 `ToolAuthorization` 初始化
- 移除 `NodeController` 路由注册
- 移除 `chatService.setToolAuthorization()` 调用
- 移除 `chatService.setNodeManager()` 调用

## Task 5: 清理类型定义

### Task 5.1: 清理 conversation.ts
- 移除或标记 `nodeId` 为可选（如果不再使用）
- 移除 `ToolOriginType`（如果不再使用）
- 移除 `ToolAuthorizationDecision`（如果不再使用）

### Task 5.2: 清理 index.ts
- 移除节点相关类型导出
- 移除工具授权相关类型导出

### Task 5.3: 清理 config.ts
- 移除节点配置类型导出

## Task 6: 验证与测试

### Task 6.1: 编译检查
- 运行 TypeScript 编译检查
- 修复所有编译错误

### Task 6.2: 功能验证
- 验证工具执行功能正常
- 验证对话路由功能正常
- 验证 Skills 执行功能正常

