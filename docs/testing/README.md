# ApexBridge 测试文档中心

> **ApexBridge 轻量级 ABP 聊天服务 - 完整测试文档**

## 📚 文档概述

本目录包含 ApexBridge 项目的完整人工测试文档体系，涵盖功能测试、集成测试、场景测试和性能测试等各个方面。

---

## 🚀 快速开始

### 新手推荐路径

1. 📖 **阅读测试总览** → [测试总览指南](./MANUAL_TESTING_GUIDE.md)
2. ⚡ **快速验证系统** → [10 分钟快速验证](./guides/QUICK_VALIDATION_CHECKLIST.md)
3. 🔍 **深入测试** → [30 分钟完整验证](./guides/FULL_VALIDATION_CHECKLIST.md)

### 特定场景入口

| 场景 | 文档 | 说明 |
|------|------|------|
| 💨 快速部署验证 | [快速验证清单](./guides/QUICK_VALIDATION_CHECKLIST.md) | 10分钟验证核心功能 |
| 🔄 版本更新后检查 | [完整验证清单](./guides/FULL_VALIDATION_CHECKLIST.md) | 30分钟全面测试 |
| 📦 发布前测试 | [回归测试清单](./guides/REGRESSION_TEST_CHECKLIST.md) | 完整回归测试 |
| 🐛 问题排查 | [故障排查指南](./guides/TROUBLESHOOTING_GUIDE.md) | 常见问题诊断 |

---

## 📂 文档结构

```
docs/testing/
├── README.md                           # 本文档 - 测试文档中心
├── MANUAL_TESTING_GUIDE.md            # 测试总览指南
│
├── cases/                              # 测试用例（按模块）
│   ├── CHAT_API_TEST_CASES.md          # 聊天接口测试用例 (15个)
│   ├── SKILLS_TEST_CASES.md            # Skills 体系测试用例 (15个)
│   ├── PROTOCOL_ENGINE_TEST_CASES.md   # ProtocolEngine 测试用例 [待创建]
│   ├── LLM_MANAGER_TEST_CASES.md       # LLMManager 测试用例 [待创建]
│   ├── VARIABLE_ENGINE_TEST_CASES.md   # VariableEngine 测试用例 [待创建]
│   ├── WEBSOCKET_TEST_CASES.md         # WebSocket 测试用例 [待创建]
│   └── LLM_CONFIG_SERVICE_TEST_CASES.md # LLMConfigService 测试用例 [待创建]
│
├── scenarios/                          # 场景测试
│   ├── E2E_CHAT_SCENARIOS.md           # 端到端对话场景 [待创建]
│   ├── SKILLS_INTEGRATION_SCENARIOS.md # Skills 集成场景 [待创建]
│   ├── LLM_SWITCHING_SCENARIOS.md      # 多 LLM 切换场景 [待创建]
│   └── ERROR_HANDLING_SCENARIOS.md     # 异常处理场景 [待创建]
│
└── guides/                             # 专项指南
    ├── QUICK_VALIDATION_CHECKLIST.md   # 10 分钟快速验证 ✅
    ├── FULL_VALIDATION_CHECKLIST.md    # 30 分钟完整验证 ✅
    ├── REGRESSION_TEST_CHECKLIST.md    # 回归测试清单 [待创建]
    ├── PERFORMANCE_TESTING_GUIDE.md    # 性能测试指南 [待创建]
    ├── SECURITY_TESTING_GUIDE.md       # 安全测试指南 [待创建]
    └── TROUBLESHOOTING_GUIDE.md        # 故障排查指南 [待创建]
```

### 文档状态说明

- ✅ **已完成**: 文档已创建并可用
- 🚧 **待创建**: 文档规划中，将在后续完成

---

## 📖 核心文档

### 1. 测试总览指南

**文件**: [MANUAL_TESTING_GUIDE.md](./MANUAL_TESTING_GUIDE.md)

**内容概览**:
- 测试环境准备（系统要求、工具安装、配置）
- 测试数据准备
- 测试执行流程
- 测试工具使用（curl、wscat、Postman）
- 常见问题排查

**适用人员**: 所有测试人员、开发者

---

## 🧪 测试用例文档

### 2.1 聊天接口测试用例

**文件**: [cases/CHAT_API_TEST_CASES.md](./cases/CHAT_API_TEST_CASES.md)

**测试范围**:
- 非流式聊天（API-CHAT-001）
- 流式聊天（API-CHAT-002）
- 多轮对话上下文（API-CHAT-003）
- 带工具调用的聊天（API-CHAT-004, 005）
- 参数验证（API-CHAT-007, 008, 009）
- 错误处理（API-CHAT-010）
- 性能测试（API-CHAT-012）
- 安全测试（API-CHAT-013）

**用例数量**: 15 个  
**优先级**: P0（核心功能）

---

### 2.2 Skills 体系测试用例

**文件**: [cases/SKILLS_TEST_CASES.md](./cases/SKILLS_TEST_CASES.md)

**测试范围**:
- Skills 加载验证（SKILL-001）
- HealthCheck 技能（SKILL-002）
- TimeInfo 技能（SKILL-003）
- SystemInfo 技能（SKILL-004）
- SimpleDice 技能（SKILL-005）
- RockPaperScissors 技能（SKILL-006）
- Direct/Internal 执行器（SKILL-007, 008）
- Skills 缓存和元数据（SKILL-009, 010）
- 多 Skills 集成（SKILL-011）
- 异常处理（SKILL-012）
- 性能测试（SKILL-014, 015）

**用例数量**: 15 个  
**Skills 覆盖**: 5 个（100%）

---

### 2.3 其他核心模块测试用例（已完成）

| 测试模块 | 文件 | 状态 | 用例数 | 架构 |
|----------|------|------|--------|------|
| ProtocolEngine | [PROTOCOL_ENGINE_TEST_CASES.md](./cases/PROTOCOL_ENGINE_TEST_CASES.md) | ✅ | 15 | v1 |
| LLMManager | [LLM_MANAGER_TEST_CASES.md](./cases/LLM_MANAGER_TEST_CASES.md) | ✅ | 15 | **v2.0 ⭐** |
| VariableEngine | [VARIABLE_ENGINE_TEST_CASES.md](./cases/VARIABLE_ENGINE_TEST_CASES.md) | ✅ | 15 | v1 |
| WebSocket | [WEBSOCKET_TEST_CASES.md](./cases/WEBSOCKET_TEST_CASES.md) | ✅ | 12 | v1 |
| LLMConfigService | [LLM_CONFIG_SERVICE_TEST_CASES.md](./cases/LLM_CONFIG_SERVICE_TEST_CASES.md) | ✅ | 15 | **v2.0 ⭐** |
| Provider/Model API | [PROVIDER_MODEL_API_TEST_CASES.md](./cases/PROVIDER_MODEL_API_TEST_CASES.md) | ✅ | 15 | **v2.0 ⭐** |

---

## 🎬 场景测试文档（待创建）

### 3.1 端到端对话场景

**文件**: `scenarios/E2E_CHAT_SCENARIOS.md` 🚧

**场景覆盖**:
1. 简单问答对话
2. 多轮上下文对话
3. 带工具调用的对话（查询时间）
4. 带工具调用的对话（系统信息）
5. 游戏互动对话（石头剪刀布）

---

### 3.2 Skills 集成场景

**文件**: `scenarios/SKILLS_INTEGRATION_SCENARIOS.md` 🚧

**场景覆盖**:
1. 健康检查技能集成
2. 时间查询技能集成
3. 系统信息技能集成
4. 随机骰子技能集成
5. 游戏技能集成

---

### 3.3 其他场景（待创建）

| 场景类型 | 文件 | 状态 |
|----------|------|------|
| 多 LLM 切换 | `scenarios/LLM_SWITCHING_SCENARIOS.md` | 🚧 |
| 异常处理 | `scenarios/ERROR_HANDLING_SCENARIOS.md` | 🚧 |

---

## 📋 快速验证清单

### 4.1 10 分钟快速验证

**文件**: [guides/QUICK_VALIDATION_CHECKLIST.md](./guides/QUICK_VALIDATION_CHECKLIST.md) ✅

**验证项目**:
1. ✅ 服务启动（2 分钟）
2. ✅ 健康检查（30 秒）
3. ✅ 基本聊天功能（3 分钟）
4. ✅ 工具调用功能（3 分钟）
5. ✅ WebSocket 功能（2 分钟，可选）

**适用场景**:
- 快速部署验证
- 更新后快速检查
- CI/CD 验证

---

### 4.2 30 分钟完整验证

**文件**: [guides/FULL_VALIDATION_CHECKLIST.md](./guides/FULL_VALIDATION_CHECKLIST.md) ✅

**验证阶段**:
1. 服务启动与配置（5 分钟）
2. API 接口测试（10 分钟）
3. Skills 功能测试（8 分钟）
4. WebSocket 测试（3 分钟）
5. 错误处理测试（2 分钟）
6. 性能基准测试（2 分钟）

**验证项目**: 22 个

**适用场景**:
- 版本发布前验证
- 重大更新后检查
- 完整功能测试

---

### 4.3 回归测试清单（待创建）

**文件**: `guides/REGRESSION_TEST_CHECKLIST.md` 🚧

**测试分类**:
1. 核心功能回归（P0）
2. API 接口回归（P0）
3. Skills 功能回归（P1）
4. 性能回归（P2）
5. 安全功能回归（P1）

---

## 🔧 专项测试指南（待创建）

### 5.1 性能测试指南

**文件**: `guides/PERFORMANCE_TESTING_GUIDE.md` 🚧

**测试内容**:
- 并发请求测试（10/50/100 并发）
- 响应时间基准测试
- 长时间运行稳定性测试
- 内存泄漏检测
- CPU 占用监控

---

### 5.2 安全测试指南

**文件**: `guides/SECURITY_TESTING_GUIDE.md` 🚧

**测试内容**:
- API Key 认证测试
- 速率限制测试
- 输入验证和清理测试
- 路径遍历防护测试
- SQL 注入防护测试

---

### 5.3 故障排查指南

**文件**: `guides/TROUBLESHOOTING_GUIDE.md` 🚧

**覆盖问题**:
- 服务启动失败
- LLM API 连接失败
- Skills 执行失败
- WebSocket 连接问题
- 性能下降问题
- 日志分析方法

---

## 📊 测试覆盖概览

### 已完成测试用例统计

| 类别 | 已完成 | 计划总数 | 完成率 |
|------|--------|---------|--------|
| API 接口 | 15 | 15 | 100% |
| Skills 体系 | 15 | 15 | 100% |
| 核心模块 | 87 | 87 | 100% |
| LLM 配置 v2.0 ⭐ | 45 | 45 | 100% |
| 场景测试 | 0 | 20 | 0% |
| 专项指南 | 2 | 5 | 40% |
| **总计** | **164** | **187** | **88%** |

### 功能模块覆盖

| 模块 | 测试用例 | Skills覆盖 | 状态 |
|------|----------|-----------|------|
| Chat API | ✅ 15 个 | - | 已完成 |
| Skills 体系 | ✅ 15 个 | 5/5 (100%) | 已完成 |
| ProtocolEngine | ✅ 15 个 | - | 已完成 |
| LLMManager | ✅ 15 个 | - | 已完成 |
| VariableEngine | ✅ 15 个 | - | 已完成 |
| WebSocket | ✅ 12 个 | - | 已完成 |
| LLMConfigService | ✅ 15 个 | - | 已完成 |

---

## 🎯 测试策略

### 测试优先级

| 优先级 | 说明 | 必须测试 |
|--------|------|----------|
| **P0** | 核心功能，必须全部通过 | ✅ 是 |
| **P1** | 重要功能，建议全部通过 | ⚠️ 建议 |
| **P2** | 辅助功能，可选测试 | ⭕ 可选 |

### 测试层级

1. **单元测试** (Jest) - 自动化，开发者日常执行
2. **集成测试** - 半自动化，CI/CD 执行
3. **功能测试** - 人工测试，本文档覆盖
4. **端到端测试** - 人工测试，重要发布前执行
5. **性能测试** - 专项测试，定期执行

---

## 🛠️ 测试工具

### 必需工具

1. **curl** - 命令行 HTTP 客户端
2. **Node.js** >= 16.0.0
3. **npm** >= 8.0.0

### 推荐工具

1. **jq** - JSON 处理工具
2. **wscat** - WebSocket 命令行客户端
3. **Postman** - 图形化 API 测试工具

### 可选工具

1. **ApiFox / ApiPost** - 国产 API 测试工具
2. **Chrome DevTools** - 浏览器开发者工具
3. **Artillery / k6** - 性能测试工具

---

## 📝 测试记录

### 测试记录模板

每次测试后，建议填写测试记录：

```markdown
## 测试记录

- **测试日期**: YYYY-MM-DD
- **测试人员**: [姓名]
- **测试类型**: [快速验证/完整验证/回归测试]
- **ApexBridge 版本**: [版本号]
- **LLM 提供商**: [提供商名称]

### 测试结果

- **总用例数**: XX
- **通过数**: XX
- **失败数**: XX
- **通过率**: XX%

### 失败用例

1. [用例编号]: [失败原因]
2. ...

### 性能指标

- 平均响应时间: X.Xs
- 内存占用: XXX MB
- CPU 占用: XX%

### 备注

[其他需要说明的信息]
```

---

## 🚀 持续改进

### 文档维护

本测试文档体系持续更新中。如果你发现：
- 测试用例有问题或遗漏
- 文档有错误或不清晰之处
- 有更好的测试方法建议

欢迎通过以下方式贡献：
1. 提交 [GitHub Issue](https://github.com/suntianc/apex-bridge/issues)
2. 提交 [Pull Request](https://github.com/suntianc/apex-bridge/pulls)
3. 联系文档维护者

### 下一步计划

按优先级顺序：

1. ✅ **阶段 1**: 核心测试文档（已完成）
   - ✅ 测试总览指南
   - ✅ Chat API 测试用例
   - ✅ Skills 测试用例
   - ✅ 快速验证清单（10分钟 / 30分钟）

2. 🚧 **阶段 2**: 其他模块测试用例
   - ProtocolEngine 测试用例
   - LLMManager 测试用例
   - VariableEngine 测试用例
   - WebSocket 测试用例

3. 🚧 **阶段 3**: 场景测试文档
   - 端到端对话场景
   - Skills 集成场景
   - 多 LLM 切换场景
   - 异常处理场景

4. 🚧 **阶段 4**: 专项测试指南
   - 性能测试指南
   - 安全测试指南
   - 故障排查指南
   - 回归测试清单

---

## 📞 获取帮助

### 文档相关问题

- 查阅 [故障排查指南](./guides/TROUBLESHOOTING_GUIDE.md)（待创建）
- 查看 [项目 README](../../README.md)
- 提交 [GitHub Issue](https://github.com/suntianc/apex-bridge/issues)

### 功能相关问题

- 查阅 [用户手册](../USER_GUIDE.md)（如存在）
- 查阅 [API 文档](../API.md)（如存在）
- 查阅 [架构设计](../ARCHITECTURE.md)（如存在）

---

## 📜 版本历史

### v2.0.0 (2025-11-18) - LLM 配置架构升级 ⭐

**重大更新**: LLM 配置架构升级到 v2.0
- ✅ 两级配置结构（提供商 + 模型）
- ✅ 多模型类型支持（NLP, Embedding, Rerank, Image, Audio）
- ✅ 12 个新 API 端点
- ✅ ModelRegistry 缓存机制
- ✅ 灵活的端点映射

**已完成**:
- ✅ 测试文档中心（本文档）
- ✅ 测试总览指南
- ✅ Chat API 测试用例（15个）
- ✅ Skills 体系测试用例（15个）
- ✅ ProtocolEngine 测试用例（15个）
- ✅ LLMManager 测试用例（15个，v2.0 架构）⭐
- ✅ VariableEngine 测试用例（15个）
- ✅ WebSocket 测试用例（12个）
- ✅ LLMConfigService 测试用例（15个，v2.0 架构）⭐
- ✅ Provider/Model API 测试用例（15个，v2.0 架构）⭐
- ✅ 10 分钟快速验证清单（已更新）
- ✅ 30 分钟完整验证清单

**待完成**:
- 🚧 场景测试文档（4个）
- 🚧 专项测试指南（3个）

### v1.0.0 (2025-11-18) - 初始版本

- ✅ 完整的测试文档体系
- ✅ 102 个测试用例
- ✅ 7 个核心模块 100% 覆盖

---

## 🤝 贡献者

感谢所有为测试文档做出贡献的开发者和测试人员！

---

## 📄 许可证

本文档遵循 ApexBridge 项目的 [Apache License 2.0](../../LICENSE) 许可证。

---

<div align="center">

**Happy Testing! 🎉**

[⬆️ 返回顶部](#apexbridge-测试文档中心)

</div>

*最后更新: 2025-11-18*

