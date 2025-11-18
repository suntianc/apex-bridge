# ProtocolEngine变量Provider精简规范

## 变更类型
`REMOVED`

## 变更范围
- 模块：`src/core/ProtocolEngine.ts`
- 删除：`src/core/variable/providers/AgentProvider.ts`
- 删除：`src/core/variable/providers/DiaryProvider.ts`

## 目标
移除ProtocolEngine中未使用的AgentProvider和DiaryProvider，简化变量解析系统。

## REMOVED Requirements

- **REQ-PROTO-001**: 移除AgentProvider - {{agent:xxx}} 变量不再解析
- **REQ-PROTO-002**: 移除DiaryProvider - {{diary:xxx}} 变量不再解析

## MODIFIED Requirements

### REQ-PROTO-003: 更新变量引擎注册
**Given** ProtocolEngine.initialize()
**When** 注册变量Provider
**Then** 仅注册以下Provider：
- TimeProvider (priority: 10)
- EnvironmentProvider (priority: 40)
- PlaceholderProvider (priority: 60)
- ToolDescriptionProvider (priority: 90)
- AsyncResultProvider (priority: 95)

**And** 不再注册：
- AgentProvider (已移除)
- DiaryProvider (已移除)

#### Scenario: 变量引擎初始化
```
Given 系统启动
When ProtocolEngine.initializeCore()被调用
Then 注册5个变量Provider
And 不包含AgentProvider和DiaryProvider
And 变量引擎正常工作
```

#### Scenario: Agent变量解析失败
```
Given 用户消息包含 {{agent:MyAgent}}
When 解析变量
Then 返回null（未匹配到Provider）
And 变量保持原样 {{agent:MyAgent}}
```

#### Scenario: Diary变量解析失败
```
Given 用户消息包含 {{diary:today}}
When 解析变量
Then 返回null（未匹配到Provider）
And 变量保持原样 {{diary:today}}
```


