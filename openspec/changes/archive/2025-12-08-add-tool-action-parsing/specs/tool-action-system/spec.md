## ADDED Requirements

### Requirement: Tool Action Tag Parsing

系统 SHALL 支持解析 LLM 输出中的 `<tool_action>` 标签格式工具调用。

标签格式定义：
- 工具调用标签: `<tool_action name="工具名称">...</tool_action>`
- 参数子标签: `<参数名 value="参数值" />`
- 标签必须完整闭合才能触发工具执行

#### Scenario: 解析单个工具调用

- **WHEN** LLM 输出包含完整的 tool_action 标签
  ```xml
  <tool_action name="vector-search">
    <query value="读取文件" />
    <limit value="5" />
  </tool_action>
  ```
- **THEN** 系统解析出工具名称为 "vector-search"
- **AND** 系统解析出参数 { query: "读取文件", limit: "5" }
- **AND** 系统调用对应工具并获取结果

#### Scenario: 解析多个连续工具调用

- **WHEN** LLM 输出包含多个 tool_action 标签
- **THEN** 系统按顺序解析并执行每个工具调用
- **AND** 每个工具的执行结果独立返回

#### Scenario: 忽略不完整标签

- **WHEN** LLM 输出包含未闭合的 tool_action 标签
- **THEN** 系统不触发工具执行
- **AND** 继续等待后续输出直到标签完整

### Requirement: Stream Tag Detection

系统 SHALL 支持在流式输出中实时检测 tool_action 标签。

#### Scenario: 流式检测完整标签

- **WHEN** 流式输出的多个 chunk 组合形成完整标签
- **THEN** 系统在标签完整时立即检测到
- **AND** 非标签文本被正常输出给用户
- **AND** 标签内容被缓冲直到完整

#### Scenario: 跨 chunk 标签检测

- **WHEN** tool_action 标签跨越多个 chunk
  - chunk1: `思考: 我需要搜索...<tool_action name="`
  - chunk2: `vector-search"><query value="test"`
  - chunk3: `" /></tool_action>接下来...`
- **THEN** 系统正确缓冲并检测完整标签
- **AND** "思考: 我需要搜索..." 立即输出
- **AND** "接下来..." 在工具执行后输出

#### Scenario: 普通文本快速输出

- **WHEN** 流式 chunk 不包含 `<tool_action` 开始标记
- **THEN** 系统直接输出该 chunk 内容
- **AND** 不产生解析延迟

### Requirement: Tool Dispatcher

系统 SHALL 提供统一的工具调度器，路由 tool_action 调用到正确的执行器。

#### Scenario: 调度内置工具

- **WHEN** tool_action 的 name 匹配已注册的内置工具
- **THEN** 系统调用 BuiltInToolsRegistry 执行工具
- **AND** 返回工具执行结果

#### Scenario: 调度 Skills 工具

- **WHEN** tool_action 的 name 匹配已加载的 Skill
- **THEN** 系统调用 SkillsSandboxExecutor 执行工具
- **AND** 返回工具执行结果

#### Scenario: 处理工具不存在

- **WHEN** tool_action 的 name 不匹配任何已注册工具
- **THEN** 系统返回错误结果 { success: false, error: "Tool not found: xxx" }
- **AND** 错误信息被传递给 LLM 供后续决策

#### Scenario: 处理执行超时

- **WHEN** 工具执行超过配置的超时时间（默认 30 秒）
- **THEN** 系统中断执行并返回超时错误
- **AND** ReAct 循环继续处理

### Requirement: ReAct Integration

ReActStrategy SHALL 支持标签式工具调用，与现有 tool_calls 机制并行工作。

#### Scenario: 启用标签解析的 ReAct 循环

- **WHEN** ReActOptions.enableToolActionParsing 为 true（默认）
- **AND** LLM 输出 tool_action 标签
- **THEN** 系统解析并执行工具
- **AND** 工具结果作为 tool message 加入对话历史
- **AND** 触发下一轮 ReAct 迭代

#### Scenario: 禁用标签解析

- **WHEN** ReActOptions.enableToolActionParsing 为 false
- **THEN** 系统忽略 tool_action 标签
- **AND** 标签内容作为普通文本输出

#### Scenario: 标签与原生 tool_calls 互斥

- **WHEN** LLM 响应同时包含 tool_calls 和 tool_action 标签
- **THEN** 系统优先处理原生 tool_calls
- **AND** tool_action 标签作为普通文本输出

### Requirement: Tool Prompt Generation

系统 SHALL 提供工具描述生成功能，用于构建系统提示词。

#### Scenario: 生成工具描述

- **WHEN** 调用 generateToolPrompt(tools)
- **THEN** 系统生成包含所有可用工具的描述文本
- **AND** 描述包含工具名称、功能说明、参数定义
- **AND** 描述包含 tool_action 标签的使用示例

#### Scenario: 空工具列表

- **WHEN** 没有可用工具
- **THEN** 系统生成空的工具描述
- **AND** 提示 LLM 当前无可用工具
