# Admin Panel 节点事件透传验证

- **测试日期**：2025-11-09
- **目标**：确认 Hub 内部的节点/任务/LLM 事件能够通过 `AdminPanelChannel` 广播到管理后台。

## 1. 环境准备

```bash
# 在仓库根目录
npm install
```

> 测试脚本会自动使用临时目录并将 `VCP_INTELLICORE_AUTOSTART` 置为 `false`，无需额外配置。

## 2. 执行命令

```bash
npm run test -- admin-panel-node-events.test.ts
```

## 3. 验证要点

- 测试会启动精简版 `VCPIntelliCore`，替换 `adminPanelChannel.broadcast` 为 `jest.fn()`。
- 通过 `EventBus.publish('task_completed', payload)` 触发事件。
- 断言 AdminPanel 渠道收到 `{ type: 'node_event', event: 'task_completed', payload }`。

## 4. 结论

事件总线与 AdminPanel 渠道联通正常，节点状态、任务进度及 LLM 代理事件均可实时透传至管理后台。
