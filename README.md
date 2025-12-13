# 🏠 ApexBridge - 轻量级ABP聊天服务

[![Status](https://img.shields.io/badge/Status-Active-brightgreen)](https://github.com/suntianc/apex-bridge)
[![Version](https://img.shields.io/badge/Version-v1.0.1-blue)](https://github.com/suntianc/apex-bridge/releases)
[![License](https://img.shields.io/badge/License-Apache--2.0-green.svg)](LICENSE)

**一款专注于ABP协议和LLM集成的轻量级聊天服务，支持多LLM提供商、Skills体系、RAG检索和实时流式对话**

[🚀 快速开始](#-快速开始) | [📖 完整文档](./docs/README.md) | [🔧 API参考](./docs/04-TESTING/ACE-MANUAL-TESTING-GUIDE.md)

## 🌟 项目特色

- **🧠 企业级ABP协议引擎** - 完全自主实现的ABP协议栈，无外部依赖
- **🎛️ 多LLM统一管理** - 适配器模式支持OpenAI、DeepSeek、智谱、Ollama等主流LLM
- **🧩 Skills 能力体系** - 轻量级技能执行框架，支持Direct/Internal双模式
- **🔍 原生RAG检索** - 集成向量搜索引擎，支持文档检索和知识库
- **🛡️ 全链路安全防护** - API Key认证、智能限流、安全审计
- **⚡ 实时流式通信** - WebSocket双向通信，支持请求中断
- **🏗️ ACE架构** - L1-L6层级化认知架构，实现自主智能体

## 🚀 快速开始

### 安装依赖
```bash
npm install
```

### 启动开发服务器
```bash
npm run dev
```

### 测试API
```bash
curl http://localhost:8088/health
```

## 📚 文档导航

### 📖 核心文档
- **[项目说明](./docs/00-README/README.md)** - 详细的项目介绍
- **[ACE架构实现](./docs/01-ARCHITECTURE/ACE架构实现方案/ACE架构能力实现方案.md)** - ACE架构完整方案
- **[配置指南](./docs/03-CONFIGURATION/ACE-CONFIG.md)** - ACE架构配置说明

### 🧪 测试与验证
- **[快速测试指南](./docs/04-TESTING/TESTING-QUICKSTART.md)** - 5分钟快速上手
- **[完整测试手册](./docs/04-TESTING/ACE-MANUAL-TESTING-GUIDE.md)** - 详细测试指南
- **[最终验证报告](./docs/04-TESTING/ACE-FINAL-VERIFICATION-REPORT.md)** - 实施成果验证

### 🔧 故障排查
- **[内存泄漏修复](./docs/05-TROUBLESHOOTING/ACE-MEMORY-LEAK-FIXES.md)** - 内存问题解决方案
- **[代码审查报告](./docs/05-TROUBLESHOOTING/ACE-IMPLEMENTATION-REVIEW-REPORT.md)** - 代码质量审查

## 🏗️ ACE架构

ApexBridge已实现完整的ACE（分层认知模型）架构，包含六个层级：

| 层级 | 名称 | 核心职责 | 文档位置 |
|------|------|----------|----------|
| **L1** | 渴望层 | 道德约束、价值观审查 | [P3阶段设计](./docs/01-ARCHITECTURE/ACE架构实现方案/05-P3阶段详细设计-激活L1层.md) |
| **L2** | 全球战略层 | 长期规划、世界模型 | [P2阶段设计](./docs/01-ARCHITECTURE/ACE架构实现方案/04-P2阶段详细设计-激活L2L3层.md) |
| **L3** | 代理模型层 | 自我认知、能力管理 | [P2阶段设计](./docs/01-ARCHITECTURE/ACE架构实现方案/04-P2阶段详细设计-激活L2L3层.md) |
| **L4** | 执行功能层 | 任务拆解、流程控制 | [P1阶段设计](./docs/01-ARCHITECTURE/ACE架构实现方案/03-P1阶段详细设计-激活L4层.md) |
| **L5** | 认知控制层 | 逻辑推理、思维链 | [P0阶段设计](./docs/01-ARCHITECTURE/ACE架构实现方案/02-P0阶段详细设计-激活L5L6层.md) |
| **L6** | 任务起诉层 | 感知输入、行动输出 | [P0阶段设计](./docs/01-ARCHITECTURE/ACE架构实现方案/02-P0阶段详细设计-激活L5L6层.md) |

## 📊 项目状态

- **当前版本**: v1.0.1
- **维护状态**: 🟢 活跃维护
- **ACE架构**: ✅ 完整实现（L1-L6）
- **测试覆盖率**: 94.1%
- **外部依赖**: 0个（完全本地化）

## 🎯 核心价值

1. **突破上下文限制** - 层级化管理支持无限长对话历史
2. **长期记忆能力** - 跨会话的上下文连续性
3. **复杂任务拆解** - DAG管理支持超长任务
4. **自我修正能力** - 动态管理技能，自动规避故障
5. **道德可控性** - 宪法约束满足企业合规
6. **零外部依赖** - 完全自包含，无供应链风险

## 📈 技术栈

- **语言**: TypeScript 5.0+
- **运行时**: Node.js ≥ 16.0.0
- **框架**: Express.js
- **数据库**: SQLite (配置) + LanceDB (向量)
- **架构**: ACE (L1-L6分层认知模型)

## 📝 开发指南

### 目录结构
```
├── src/              # 源代码
├── docs/             # 📚 完整文档中心
├── config/           # 配置文件
├── tests/            # 测试套件
└── scripts/          # 工具脚本
```

### 常用命令
```bash
# 开发
npm run dev          # 启动开发服务器
npm run build        # TypeScript编译
npm start            # 运行生产版本

# 测试
npm test             # 运行所有测试
npm run test:watch   # 监视模式
npm run test:coverage # 覆盖率报告

# 代码质量
npm run lint         # ESLint检查
npm run format       # Prettier格式化
```

## 🤝 贡献指南

我们欢迎所有形式的贡献！

1. **Fork 项目**
2. **创建特性分支** (`git checkout -b feature/AmazingFeature`)
3. **提交更改** (`git commit -m 'feat: 添加新功能'`)
4. **推送到分支** (`git push origin feature/AmazingFeature`)
5. **创建 Pull Request**

详细贡献指南请查看: [贡献指南](./docs/00-README/README.md#contributing)

## 📞 技术支持

- **GitHub Issues**: [报告问题](https://github.com/suntianc/apex-bridge/issues)
- **GitHub Discussions**: [技术讨论](https://github.com/suntianc/apex-bridge/discussions)
- **Email**: suntianc@gmail.com

## 📄 许可证

本项目采用 [Apache License 2.0](LICENSE) 许可证

---

**如果 ApexBridge 对您有帮助，请给我们一个 ⭐️ Star！**

[![Star History Chart](https://api.star-history.com/svg?repos=suntianc/apex-bridge&type=Date)](https://star-history.com/#suntianc/apex-bridge&Date)
