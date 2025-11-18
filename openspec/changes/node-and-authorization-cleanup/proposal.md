# 节点管理和工具授权清理提案

## Why

当前项目中存在以下不需要的功能：

1. **NodeService（节点管理服务）**：
   - 管理分布式节点的注册、状态和配置
   - 节点与人格（persona）的绑定关系
   - 节点状态管理（online/offline/busy）
   - 这些功能在当前架构中不需要

2. **ToolAuthorization（工具授权）**：
   - 基于节点归属的工具授权检查
   - 基于人格类型的权限验证
   - 工具执行前的授权决策
   - 这些授权逻辑在当前架构中不需要

**问题**：
- **功能冗余**：节点管理和工具授权在当前架构中未被使用或不需要
- **代码复杂**：增加了不必要的复杂度和维护成本
- **依赖混乱**：多个模块依赖这些不需要的功能

## What Changes

### 目标
移除 NodeService、NodeManager、ToolAuthorization 及其相关依赖，简化代码架构。

### 范围
1. **删除文件**：
   - `src/services/NodeService.ts`
   - `src/core/NodeManager.ts`
   - `src/api/controllers/NodeController.ts`
   - `src/core/conversation/ToolAuthorization.ts`

2. **简化 ChatService**：
   - 移除工具授权检查逻辑
   - 移除节点派发逻辑
   - 直接执行所有工具请求

3. **简化 ConversationRouter**：
   - 移除节点验证逻辑
   - 移除人格绑定验证
   - 直接使用传入的成员信息

4. **清理类型定义**：
   - 移除节点相关类型
   - 移除工具授权相关类型

### 非目标
- 不改变 Skills 执行逻辑
- 不改变协议引擎功能
- 不改变对话路由的基本功能

## 影响范围

### 文件删除
- `src/services/NodeService.ts`
- `src/core/NodeManager.ts`
- `src/api/controllers/NodeController.ts`
- `src/core/conversation/ToolAuthorization.ts`

### 文件修改
- `src/services/ChatService.ts` - 移除授权和节点派发逻辑
- `src/core/conversation/ConversationRouter.ts` - 移除节点验证
- `src/server.ts` - 移除相关初始化和路由
- `src/types/conversation.ts` - 清理类型定义
- `src/types/index.ts` - 清理类型定义
- `src/types/config.ts` - 移除节点配置导出

## 验收标准

1. ✅ 所有节点管理相关代码已删除
2. ✅ 所有工具授权相关代码已删除
3. ✅ ChatService 直接执行所有工具，无需授权检查
4. ✅ ConversationRouter 不再验证节点和人格绑定
5. ✅ 代码通过编译和测试
6. ✅ 工具执行功能正常工作

