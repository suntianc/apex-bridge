# 测试指导文档中心

> 本文档是 ApexBridge 项目所有测试文档的集中入口，提供完整的测试指南和场景覆盖。

## 📚 文档导航

### 🔄 集成测试

#### 节点与Hub集成
- [🔌 集成测试场景总览](./INTEGRATION_SCENARIOS.md) - Node Agent 与 Hub 的集成测试
- 🎯 M3.2 节点集成测试
  - [Companion 节点集成](./M3.2_NODE_AGENT_COMPANION_INTEGRATION.md)
  - [Worker 节点集成](./M3.2_NODE_AGENT_WORKER_INTEGRATION.md)
- [🎛️ AdminPanel 节点事件测试](./ADMIN_PANEL_NODE_EVENTS.md) - 管理后台节点事件验证

#### 协议与迁移测试
- [🎯 M2.2 第二阶段测试指南](./M2.2_PHASE2_TESTING_GUIDE.md) - ABP 协议迁移完整测试流程

### 🧪 功能测试指南

#### 核心功能
- [🧠 MemoryService 测试指南](./MEMORY_SERVICE_TEST_GUIDE.md) - 记忆服务运行时验证
- [🎛️ AdminPanel 测试指南](./ADMIN_PANEL_TEST_GUIDE.md) - 管理后台功能测试
- [🔍 RAG API 测试用例](./RAG_API_TEST_CASE.md) - RAG 接口测试场景
- [💭 EmotionEngine 测试指南](./EMOTION_ENGINE_TEST_GUIDE.md) - 情感引擎验证指南

#### Skills 相关测试
- [🧩 Skills 集成测试](./docs/skills/INTEGRATION_TESTS.md) - Skills 能力执行测试

### 🔌 端到端测试

- [🔚 端到端场景测试](./E2E_SCENARIO_COMPANION_WORKER.md) - Companion 与 Worker 完整流程验证

### 🐛 故障排除与调试

- [📡 WebSocket 故障排除](./WEBSOCKET_TROUBLESHOOTING.md) - WebSocket 连接与调试指南

### 📝 测试记录

- [📊 测试结果汇总](./TEST_RESULTS_SUMMARY.md) - 测试执行结果记录

## 🚀 快速开始

### 运行测试

```bash
# 运行所有测试
npm test

# 生成覆盖率报告
npm run test:coverage

# 运行特定测试套件
npm test -- PersonalityEngine
npm test -- RAGService
npm test -- rateLimit

# 运行安全测试
npm test -- --testPathPattern="security|rateLimit|validation"
```

### 集成测试准备

在执行集成测试前，请确保：

1. **构建产物**（Node Agent）
   ```bash
   cd packages/node-agent
   npm run build
   ```

2. **插件文件存在**
   - `packages/node-agent/plugins/worker/calendar-task.js`
   - `packages/node-agent/plugins/worker/notify-user.js`

3. **配置正确**，节点配置包含：
   ```json
   {
     "plugins": {
       "toolDirectory": "plugins/worker"
     }
   }
   ```

4. **工具准备**
   - WebSocket 客户端（wscat / Postman）
   - REST 客户端（curl / Postman）

## 🎯 测试策略

### 测试层级

1. **单元测试** - 核心引擎和服务层（Jest）
   - 覆盖率目标：> 95%
   - 重点：人格引擎、ABP 协议、Skills 执行

2. **集成测试** - API 接口和 WebSocket
   - 场景驱动：端到端业务流程
   - 重点：Node Agent 通信、任务调度

3. **端到端测试** - 完整用户场景
   - 真实环境：Companion + Worker 协作
   - 重点：完整业务闭环

### 测试覆盖重点

- ✅ 人格引擎配置加载和缓存机制
- ✅ ABP 协议变量解析与 Skills 执行
- ✅ 多 LLM 提供商适配和切换
- ✅ WebSocket 连接和消息处理
- ✅ Skills 体系的安全性和隔离

## 📊 测试覆盖率

- **总覆盖率**: **95.7%** (154/161 测试通过)
- **核心引擎**: 98% 覆盖率
- **服务层**: 96% 覆盖率
- **API 接口**: 94% 覆盖率

## 🔒 安全测试

```bash
# 运行安全相关测试
npm test -- --testPathPattern="security|rateLimit|validation"

# 安全扫描
npm audit

# Trivy 漏洞扫描
trivy fs .
```

## 💡 测试最佳实践

1. **测试前先清理**：清空 `packages/node-agent/runtime-data/`，避免历史数据干扰
2. **记录测试日志**：在 `manual-testing/logs/` 目录按场景记录执行日志
3. **关注边界条件**：异常输入、超时、错误处理等场景
4. **保持测试隔离**：各测试场景之间尽量独立，避免相互影响

## 📞 获取帮助

- 📧 [提交 Issue](https://github.com/suntianc/apex-bridge/issues)
- 💬 [参与讨论](https://github.com/suntianc/apex-bridge/discussions)
- 📖 [查看完整文档](../README.md#documentation)
