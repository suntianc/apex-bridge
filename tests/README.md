# 测试说明

本文档汇总了ApexBridge项目的所有测试文档和测试类型。

## 测试类型

### 1. 集成测试用例（场景测试） 📋

**文档位置**: [docs/test-cases-integration.md](../docs/test-cases-integration.md)

**特点**:
- 基于真实用户场景的端到端集成测试
- 每个场景覆盖3-8个功能模块的集成
- 21个主测试场景，覆盖95%+的核心功能
- **推荐用于**: 功能验收测试、系统集成测试、用户路径验证

**包含模块**:
- 🎯 聊天对话场景（5个场景）
- 🎯 节点管理场景（4个场景）
- 🎯 记忆系统场景（4个场景）
- 🎯 Skills执行场景（5个场景）
- 🎯 管理后台场景（2个场景）
- 🎯 安全审计场景（1个场景）

**阅读建议**:
- QA工程师 → 按照执行顺序完整测试所有场景
- 开发者 → 查看自己负责的模块相关场景
- 项目经理 → 查看场景1.1、2.1、5.1了解核心流程

---

### 2. PersonalityEngine 测试（单元测试）

**代码位置**: `tests/core/PersonalityEngine.test.ts`

**特点**:
- 专注于PersonalityEngine核心功能的单元测试
- 测试覆盖构造函数、配置加载、缓存机制等
- 使用Jest + mock进行隔离测试

---

## 测试文档索引

| 文档 | 类型 | 目标读者 | 用途 |
|------|------|---------|------|
| [集成测试用例](../docs/test-cases-integration.md) | 📋 场景测试 | QA、开发者、PM | 端到端功能验证 |
| 本文件 | 🗂️ 汇总 | 所有人 | 快速导航测试文档 |
| [核心引擎测试](./core/) | 🧪 单元测试 | 核心开发者 | 模块级测试 |
| [API测试](./api/) | 🔌 集成测试 | API开发者 | 接口测试 |
| [性能测试](./performance/) | ⚡ 性能测试 | 性能工程师 | 压力测试、基准测试 |
| [安全测试](./security/) | 🔒 安全测试 | 安全工程师 | 渗透测试、漏洞扫描 |

---

## 快速开始

### 选择测试类型

根据你的角色选择合适的测试类型：

**我是QA工程师** 🤖
→ 从 [集成测试用例](../docs/test-cases-integration.md) 开始，按照执行顺序测试所有场景

**我是前端开发者** 🎨
→ 查看 [管理后台场景](../docs/test-cases-integration.md#模块五管理后台功能场景)

**我是后端开发者** ⚙️
→ 查看相关模块的单元测试和集成测试
- 核心引擎 → [核心测试](./core/)
- API接口 → [API测试](./api/)
- Services → [服务测试](./services/)

**我是DevOps/SRE** 🏗️
→ 重点关注 [节点管理场景](../docs/test-cases-integration.md#模块二节点管理与分布式任务场景)

---

## PersonalityEngine 测试

### 运行测试

```bash
# 安装依赖（如果还没有）
npm install --save-dev jest @types/jest ts-jest

# 运行所有测试
npm test

# 运行特定测试文件
npm test -- PersonalityEngine.test.ts

# 监听模式（开发时使用）
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

### 测试覆盖范围

PersonalityEngine 测试覆盖以下功能：

1. **构造函数和初始化**
   - 默认配置初始化
   - 自定义配置初始化
   - 默认人格加载

2. **JSON配置加载**
   - 有效JSON配置加载
   - 无效JSON错误处理
   - 必需字段验证

3. **TXT配置向后兼容**
   - TXT文件加载
   - 名字和头像提取
   - 兼容模式标记

4. **System Prompt构建**
   - JSON配置的Prompt构建
   - TXT配置的Prompt构建
   - 缓存机制

5. **消息注入**
   - 人格System Prompt插入
   - 用户System消息保留
   - 消息顺序验证

6. **缓存功能**
   - 人格配置缓存
   - System Prompt缓存
   - 缓存清除

7. **默认人格Fallback**
   - 不存在人格的Fallback
   - 默认人格创建

8. **Agent ID验证**
   - 无效ID拒绝
   - 中文字符支持

9. **多人格切换**
   - 不同人格加载
   - 人格切换验证

10. **刷新功能**
    - 人格刷新
    - 文件重新加载

### 测试文件结构

```
tests/
└── core/
    └── PersonalityEngine.test.ts  # PersonalityEngine单元测试
```

### 注意事项

- 测试使用了 `fs` 模块的 mock，模拟文件系统操作
- 测试使用了 `logger` 模块的 mock，避免控制台输出干扰
- 所有测试都是独立的，可以并行运行
- 测试不依赖实际的文件系统，完全使用mock

