# 需求清单

## 变更版本记录

| 版本 | 日期 | 变更内容 | 变更人 |
|------|------|----------|--------|
| 1.0 | 2026-01-08 20:30:00 | 初始版本 | - |

## 关联文档

- 暂无

## 需求清单信息

- **需求清单名称**：ACE功能剔除需求
- **创建时间**：2026-01-08 20:30:00
- **当前状态**：评审通过

## 需求列表

| 序号 | 需求名称 | 需求描述 | 是否确认 |
|------|----------|----------|----------|
| 1 | 移除ACE框架 | 移除六层认知架构相关代码（AceCore、AceService、AceIntegrator、AceStrategyManager、AceStrategyOrchestrator、AceEthicsGuard） | 是 |
| 2 | 移除上下文压缩 | 移除CompressionService、ContextManager及相关机制，简化上下文管理 | 是 |
| 3 | 移除伦理守卫 | 移除AceEthicsGuard及相关伦理审查功能，简化安全检查 | 是 |
| 4 | 移除轨迹和反思 | 移除轨迹记录、反思周期、WorldModel更新功能，简化状态管理 | 是 |
| 5 | 移除Playbook系统 | 移除PlaybookManager、PlaybookMatcher、PlaybookInjector及相关自动提炼功能 | 是 |
| 6 | 简化ChatService | 移除ACE编排层，直接使用ReActStrategy或SingleRoundStrategy执行对话 | 是 |
| 7 | 保留LLM调用 | 保留LLMManager及多模型适配器能力（OpenAI/Claude/DeepSeek等） | 是 |
| 8 | 保留工具执行 | 保留工具解析、调度、执行能力（Skill/MCP/Builtin） | 是 |
| 9 | 保留对话历史 | 保留ConversationHistoryService用于基础对话记录 | 是 |
| 10 | 保留向量搜索 | 保留ToolRetrievalService和SearchEngine用于工具检索 | 是 |
