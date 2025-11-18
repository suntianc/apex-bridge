# 节点管理和工具授权清理规范

## Purpose

移除不需要的节点管理和工具授权功能，简化代码架构，降低维护成本。

## Requirements

### Requirement 1: 移除节点管理功能

**描述**: 移除所有节点管理相关的代码和功能。

**约束**:
- 删除 `NodeService`、`NodeManager`、`NodeController`
- 移除所有节点验证逻辑
- 移除节点与人格绑定验证

**Scenario**: 
- 当需要验证节点时，不再进行验证，直接使用传入的信息
- 当需要查询节点信息时，不再查询，直接使用默认值或跳过

### Requirement 2: 移除工具授权功能

**描述**: 移除所有工具授权相关的代码和功能。

**约束**:
- 删除 `ToolAuthorization` 类
- 移除所有工具授权检查逻辑
- 所有工具请求直接执行，无需授权

**Scenario**:
- 当收到工具请求时，直接执行，不进行授权检查
- 当需要判断工具是否允许执行时，默认允许所有工具

### Requirement 3: 简化工具执行流程

**描述**: 简化工具执行流程，移除授权和节点派发逻辑。

**约束**:
- 所有工具在本地执行（通过 SkillsExecutionManager）
- 不再根据工具归属节点进行派发
- 不再检查工具执行权限

**Scenario**:
- 当需要执行工具时，直接调用 SkillsExecutionManager
- 不再区分工具来源（hub/worker/companion）
- 所有工具执行结果统一处理

## Delta for Node and Authorization Cleanup

### ADDED Requirements

无新增需求。

### UPDATED Requirements

1. **ChatService 工具执行** - 从需要授权检查改为直接执行所有工具
2. **ConversationRouter 成员绑定** - 从需要节点验证改为直接使用传入信息

### REMOVED Requirements

1. **节点管理功能** - 移除所有节点注册、查询、验证功能
2. **工具授权功能** - 移除所有工具授权检查功能
3. **节点派发功能** - 移除所有工具派发到节点的功能

