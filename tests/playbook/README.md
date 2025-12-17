# Stage 0: Playbook System Verification Tests

本目录包含 ApexBridge Playbook 系统的 Stage 0 验证测试。

## 📋 测试概述

Stage 0 是 Playbook 机制实施的前置步骤，用于验证现有的 PlaybookManager 和 PlaybookMatcher 基础功能是否正常工作。

### 验证点

1. ✅ **Generator**: `extractPlaybookFromLearning()` 从单个 Learning 提取 Playbook
2. ✅ **Storage**: LanceDB 存储功能
3. ✅ **Matcher**: `matchPlaybooks()` 语义匹配
4. ✅ **Matcher**: `findSimilarPlaybooks()` 相似检索
5. ✅ **性能基准测试**

## 🚀 运行测试

### 基本命令

```bash
# 运行 Stage 0 验证测试
npm test -- tests/playbook/stage0-verification.test.ts

# 使用 watch 模式
npm test -- tests/playbook/stage0-verification.test.ts --watch

# 生成详细报告
npm test -- tests/playbook/stage0-verification.test.ts --verbose

# 运行覆盖率测试
npm test -- tests/playbook/stage0-verification.test.ts --coverage
```

### 准备工作

在运行测试前，请确保：

1. **安装依赖**
   ```bash
   npm install
   ```

2. **配置环境变量**（如果需要LLM API调用）
   ```bash
   # 创建 .env 文件
   cp .env.template .env

   # 编辑 .env 文件，设置必要的API密钥
   OPENAI_API_KEY=your-openai-api-key
   # 其他必要的配置...
   ```

3. **检查数据库**（LanceDB）
   - 测试会自动初始化 LanceDB
   - 无需手动运行迁移脚本

## 📊 预期结果

### 成功场景

```
 PASS  tests/playbook/stage0-verification.test.ts
  Stage 0: Playbook System Verification
    Generator: extractPlaybookFromLearning()
      ✓ 应该能从 StrategicLearning 提取 Playbook (342ms)
      ✓ 生成的 Playbook 应该包含必要字段 (23ms)
      ✓ 应该防止重复提取（幂等性） (15ms)
    Storage: LanceDB Integration
      ✓ Playbook 应该已向量化并存储到 LanceDB (156ms)
      ✓ 应该能通过 ID 直接查询 Playbook (12ms)
    Matcher: matchPlaybooks()
      ✓ 应该能基于上下文匹配 Playbook (234ms)
      ✓ 不相关的查询应该返回空或低分匹配 (187ms)
    Matcher: findSimilarPlaybooks()
      ✓ 应该能找到相似的 Playbook (145ms)
    Performance Benchmarks
      ✓ 提取 Playbook 应在 5 秒内完成 (2341ms)
      ✓ 语义检索应在 1 秒内完成 (456ms)

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
Time:        4.123s
```

### 决策矩阵

| 通过测试数 | 决策 |
|-----------|------|
| **10/10** | ✅ 完美！直接进入 Stage 0.5 |
| **8-9/10** | ⚠️ 部分问题，评估影响后决定是否继续 |
| **6-7/10** | 🟠 严重问题，需要修复基础功能 |
| **<6/10** | 🔴 **暂停实施**，基础设施需要重构 |

## 🔧 文件结构

```
tests/playbook/
├── stage0-verification.test.ts    # 主验证脚本
├── fixtures/
│   └── mock-learning.json         # 测试数据
├── utils/
│   └── test-helpers.ts            # 辅助函数
└── README.md                      # 本文件
```

## 🐛 问题排查

### 常见问题 1: 依赖注入失败

**症状**: `TypeError: Cannot read property 'extractPlaybookFromLearning' of undefined`

**原因**: `PlaybookManager` 或 `PlaybookMatcher` 的依赖未正确初始化。

**解决方案**: 检查测试脚本中的 beforeAll 块，确保所有依赖正确注入。

### 常见问题 2: LanceDB 未初始化

**症状**: `Error: LanceDB table 'playbooks' not found`

**原因**: LanceDB 数据库或表未初始化。

**解决方案**: 测试会自动初始化LanceDB，如果仍有问题，检查工具检索服务是否正确初始化。

### 常见问题 3: LLM API 调用失败

**症状**: `Error: OpenAI API key not configured`

**原因**: `extractPlaybookFromLearning()` 内部调用 LLM 进行分析，但环境变量未配置。

**解决方案**: 在 `.env` 文件中设置必要的API密钥。

### 常见问题 4: 向量检索返回空

**症状**: `findSimilarPlaybooks()` 返回空数组

**原因**:
1. Playbook 未正确向量化
2. 相似度阈值设置过高
3. LanceDB 索引未构建

**解决方案**: 检查向量化状态和相似度阈值设置。

## 📝 测试数据

### StrategicLearning 示例

```json
{
  "id": "test-learning-001",
  "summary": "成功处理用户反馈分析任务",
  "learnings": [
    "使用 feedback-analyzer 工具提取关键问题",
    "通过 LLM 聚类分析将问题归类",
    "生成具体的改进方案建议"
  ],
  "outcome": "success",
  "timestamp": 1734336000000
}
```

## 📈 性能基准

- **提取 Playbook**: < 5 秒
- **语义检索**: < 1 秒
- **ID 查询**: < 100ms
- **相似检索**: < 500ms

## 📚 相关文档

- [Stage 0 设计文档](../../docs/08-playbook-implementation/01-stage0-verification.md)
- [PlaybookManager 源码](../../src/services/PlaybookManager.ts)
- [PlaybookMatcher 源码](../../src/services/PlaybookMatcher.ts)
- [Playbook 类型定义](../../src/types/playbook.ts)

## ⏱️ 时间估算

| 任务 | 预计时间 |
|------|---------|
| 运行测试 | 1-2 分钟 |
| 分析结果 | 5-10 分钟 |
| 问题排查（如有）| 15-30 分钟 |
| **总计** | **20-40 分钟** |

## 📅 下一步

验证通过后，阅读 [Stage 0.5: 任务队列基础设施](../../docs/08-playbook-implementation/02-stage0.5-task-queue.md)

---

**文档版本**: v1.0
**创建日期**: 2025-12-16
**维护者**: ApexBridge Team
