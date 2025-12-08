# Tasks: LLM 工具调用能力（tool_action 标签解析）

## 1. 核心解析器实现

- [x] 1.1 创建 `src/core/tool-action/types.ts` - 定义类型接口
  - ToolActionCall 接口
  - ParseResult 接口
  - DetectionResult 接口
  - DispatcherConfig 接口

- [x] 1.2 实现 `src/core/tool-action/ToolActionParser.ts` - 标签解析器
  - parse() 方法：解析完整文本中的工具调用
  - hasPendingTag() 方法：检测未完成标签
  - extractParameters() 方法：提取参数
  - 单元测试覆盖

- [x] 1.3 实现 `src/core/tool-action/StreamTagDetector.ts` - 流式检测器
  - processChunk() 方法：处理流式输入块
  - reset() 方法：重置状态
  - flush() 方法：强制刷新缓冲区
  - 状态机实现（NORMAL/TAG_OPENING/TAG_CONTENT/TAG_CLOSING）
  - 单元测试覆盖

- [x] 1.4 创建 `src/core/tool-action/index.ts` - 模块导出

## 2. 工具调度器实现

- [x] 2.1 实现 `src/core/tool-action/ToolDispatcher.ts` - 工具调度器
  - dispatch() 方法：执行工具调用
  - hasTool() 方法：检查工具是否存在
  - getAvailableTools() 方法：获取可用工具列表
  - 集成 BuiltInToolsRegistry
  - 错误处理和超时控制

- [x] 2.2 添加工具描述生成功能
  - generateToolPrompt() 函数：生成工具描述供系统提示词使用

## 3. ReActEngine 集成

- [x] 3.1 扩展 `src/core/stream-orchestrator/types.ts`
  - 添加 enableToolActionParsing 选项
  - 添加 toolActionTimeout 选项

- [x] 3.2 修改 `src/core/stream-orchestrator/ReActEngine.ts`
  - 引入 StreamTagDetector
  - 在 runIteration 中添加标签检测分支
  - 处理标签式工具调用结果
  - 保持与原生 tool_calls 的兼容

- [x] 3.3 更新 `src/strategies/ReActStrategy.ts`
  - 初始化 ToolDispatcher
  - 配置标签解析选项
  - 传递工具调度器到 ReActEngine

## 4. 测试

- [x] 4.1 单元测试
  - ToolActionParser 测试用例 (14 tests)
  - StreamTagDetector 测试用例 (11 tests)
  - ToolDispatcher 测试用例 (9 tests)
  - 全部 34 个测试通过 ✅

- [ ] 4.2 集成测试
  - 完整的多轮工具调用流程测试
  - 流式输出中的标签检测测试
  - 与现有 tool_calls 的兼容性测试

## 5. 文档

- [x] 5.1 更新 `src/core/tool-action/CLAUDE.md` - 模块文档
- [ ] 5.2 更新 `src/strategies/CLAUDE.md` - 策略文档更新
- [ ] 5.3 添加工具调用示例到项目文档

## 依赖关系

```
1.1 (types) → 1.2 (parser) → 1.3 (detector) → 1.4 (index)
                                    ↓
                              2.1 (dispatcher)
                                    ↓
                              3.1 → 3.2 → 3.3 (integration)
                                    ↓
                              4.1 → 4.2 (testing)
                                    ↓
                              5.1 → 5.2 → 5.3 (docs)
```

## 可并行任务

- 1.1 和 2.2 可并行
- 4.1 可在对应实现完成后立即开始
- 5.x 可在实现完成后并行进行
