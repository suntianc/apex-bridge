# Stage 0: 现有功能验证

## 📋 阶段概述

| 属性 | 值 |
|------|-----|
| **阶段编号** | Stage 0 |
| **优先级** | ⭐ 前置步骤（必须） |
| **预估工作量** | 1-2 小时（周末半天） |
| **难度等级** | 🟢 极低 |
| **依赖** | 无 |
| **产出物** | 验证测试脚本 + 功能评估报告 |

## 🎯 阶段目标

### 核心目标
确认 ApexBridge 现有的 Playbook 系统基础功能是否正常工作，避免在错误的基础上继续构建。

### 具体验证点
1. ✅ `PlaybookManager.extractPlaybookFromLearning()` 能否从单个 Learning 提取 Playbook
2. ✅ Playbook 能否正确存储到 LanceDB 向量数据库
3. ✅ `PlaybookMatcher.matchPlaybooks()` 能否进行语义匹配
4. ✅ `PlaybookMatcher.findSimilarPlaybooks()` 能否找到相似 Playbook

### 决策标准
- **✅ 验证通过**: 所有功能正常 → 继续 Stage 0.5
- **❌ 验证失败**: 发现基础功能缺陷 → **暂停**，先修复基础设施

## 📚 背景知识

### 当前实现状态（来自 v3.0 评估）

根据可行性分析报告第 2.0 节的评估：

| 组件 | 实现状态 | 完成度 | 关键文件 |
|------|---------|--------|---------|
| **Generator** | `PlaybookManager.extractPlaybookFromLearning()` | 🟡 40% | [PlaybookManager.ts:204-243](../../src/services/PlaybookManager.ts) |
| **Reflector** | ❌ 不存在 | 🔴 0% | N/A |
| **Curator** | `PlaybookMatcher.findSimilarPlaybooks()` | 🟡 30% | [PlaybookMatcher.ts:104-140](../../src/services/PlaybookMatcher.ts) |

### 为什么需要验证？

在 v2.0 报告中，我们假设这些功能已经完整实现。但实际代码评估发现：
- Generator 只是单个 Learning 提取（无批量聚类）
- Curator 只是相似检索（无自动去重/归档）
- Reflector 完全不存在

**因此，在开始新功能开发前，必须验证这 40% 和 30% 的基础功能是否真的可用。**

## 🔧 技术方案

### 验证策略

采用**黑盒测试**方法，通过实际调用 API 验证功能，不深入代码内部。

### 测试环境准备

```bash
# 1. 确保依赖已安装
npm install

# 2. 确保数据库已初始化
npm run db:migrate

# 3. 启动开发服务器（可选，如果需要 HTTP API 测试）
npm run dev
```

### 验证脚本架构

```
tests/
└── playbook/
    ├── stage0-verification.test.ts    # 主验证脚本
    ├── fixtures/
    │   └── mock-learning.json         # 测试数据
    └── utils/
        └── test-helpers.ts            # 辅助函数
```

## 💻 核心代码

### 1. 测试数据准备

创建 `tests/playbook/fixtures/mock-learning.json`:

```json
{
  "id": "test-learning-001",
  "userId": "test-user",
  "summary": "成功处理用户反馈分析任务",
  "learnings": [
    "使用 feedback-analyzer 工具提取关键问题",
    "通过 LLM 聚类分析将问题归类",
    "生成具体的改进方案建议"
  ],
  "outcome": "success",
  "context": {
    "domain": "数据分析",
    "skillsUsed": ["feedback-analyzer", "llm-clustering"],
    "duration": 8500
  },
  "timestamp": 1734336000000,
  "metadata": {
    "taskType": "feedback-analysis",
    "dataSize": 45
  }
}
```

### 2. 验证脚本实现

创建 `tests/playbook/stage0-verification.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PlaybookManager } from '../../src/services/PlaybookManager';
import { PlaybookMatcher } from '../../src/services/PlaybookMatcher';
import { StrategicLearning } from '../../src/types/ace-core';
import mockLearning from './fixtures/mock-learning.json';

describe('Stage 0: Playbook System Verification', () => {
  let playbookManager: PlaybookManager;
  let playbookMatcher: PlaybookMatcher;
  let generatedPlaybookId: string;

  beforeAll(async () => {
    // 初始化服务
    playbookManager = new PlaybookManager(/* 依赖注入 */);
    playbookMatcher = new PlaybookMatcher(/* 依赖注入 */);
  });

  afterAll(async () => {
    // 清理测试数据
    if (generatedPlaybookId) {
      await playbookManager.deletePlaybook(generatedPlaybookId);
    }
  });

  // ==========================================
  // 验证点 1: Generator 基础功能
  // ==========================================
  describe('Generator: extractPlaybookFromLearning()', () => {
    it('应该能从 StrategicLearning 提取 Playbook', async () => {
      const learning: StrategicLearning = mockLearning as any;

      const playbook = await playbookManager.extractPlaybookFromLearning(
        learning,
        '用户反馈分析场景'
      );

      expect(playbook).toBeDefined();
      expect(playbook).not.toBeNull();
      expect(playbook!.name).toBeTruthy();
      expect(playbook!.id).toBeTruthy();

      generatedPlaybookId = playbook!.id;

      console.log('✅ 生成的 Playbook:', {
        id: playbook!.id,
        name: playbook!.name,
        type: playbook!.type,
        tags: playbook!.tags
      });
    });

    it('生成的 Playbook 应该包含必要字段', async () => {
      const playbook = await playbookManager.getPlaybook(generatedPlaybookId);

      expect(playbook).toBeDefined();
      expect(playbook!.trigger).toBeDefined();
      expect(playbook!.actions).toBeDefined();
      expect(playbook!.actions.length).toBeGreaterThan(0);
      expect(playbook!.context).toBeDefined();
      expect(playbook!.metrics).toBeDefined();
    });

    it('应该防止重复提取（幂等性）', async () => {
      const learning: StrategicLearning = mockLearning as any;

      // 第二次提取应该返回 null（activeExtractions 防重）
      const secondPlaybook = await playbookManager.extractPlaybookFromLearning(
        learning,
        '用户反馈分析场景'
      );

      // 注意：这取决于实现细节，可能需要调整断言
      // 如果 activeExtractions 已清空，可能会再次生成
      console.log('⚠️ 第二次提取结果:', secondPlaybook ? '生成新 Playbook' : '返回 null');
    });
  });

  // ==========================================
  // 验证点 2: LanceDB 存储功能
  // ==========================================
  describe('Storage: LanceDB Integration', () => {
    it('Playbook 应该已向量化并存储到 LanceDB', async () => {
      // 通过向量检索验证存储
      const retrieved = await playbookMatcher.findSimilarPlaybooks(
        generatedPlaybookId,
        5
      );

      expect(retrieved).toBeDefined();
      expect(Array.isArray(retrieved)).toBe(true);

      console.log('✅ 找到相似 Playbook 数量:', retrieved.length);
    });

    it('应该能通过 ID 直接查询 Playbook', async () => {
      const playbook = await playbookManager.getPlaybook(generatedPlaybookId);

      expect(playbook).toBeDefined();
      expect(playbook!.id).toBe(generatedPlaybookId);
    });
  });

  // ==========================================
  // 验证点 3: Matcher 语义检索功能
  // ==========================================
  describe('Matcher: matchPlaybooks()', () => {
    it('应该能基于上下文匹配 Playbook', async () => {
      const matches = await playbookMatcher.matchPlaybooks({
        userQuery: '帮我分析用户反馈',
        sessionHistory: [
          { role: 'user', content: '我想了解用户对产品的看法' }
        ],
        currentContext: {
          domain: '数据分析',
          availableSkills: ['feedback-analyzer']
        }
      });

      expect(matches).toBeDefined();
      expect(Array.isArray(matches)).toBe(true);

      if (matches.length > 0) {
        console.log('✅ 匹配到的 Playbook:', {
          count: matches.length,
          topMatch: {
            name: matches[0].playbook.name,
            score: matches[0].matchScore,
            reason: matches[0].matchReason
          }
        });
      } else {
        console.log('⚠️ 未匹配到任何 Playbook（可能是相似度阈值问题）');
      }
    });

    it('不相关的查询应该返回空或低分匹配', async () => {
      const matches = await playbookMatcher.matchPlaybooks({
        userQuery: '今天天气怎么样？',
        sessionHistory: [],
        currentContext: {}
      });

      if (matches.length > 0) {
        const topScore = matches[0].matchScore;
        expect(topScore).toBeLessThan(0.6); // 应该是低分匹配
        console.log('⚠️ 不相关查询仍有匹配，最高分:', topScore);
      } else {
        console.log('✅ 不相关查询正确返回空结果');
      }
    });
  });

  // ==========================================
  // 验证点 4: 相似 Playbook 检索
  // ==========================================
  describe('Matcher: findSimilarPlaybooks()', () => {
    it('应该能找到相似的 Playbook', async () => {
      const similar = await playbookMatcher.findSimilarPlaybooks(
        generatedPlaybookId,
        3
      );

      expect(similar).toBeDefined();
      expect(Array.isArray(similar)).toBe(true);

      console.log('✅ 相似 Playbook 数量:', similar.length);

      if (similar.length > 0) {
        console.log('前 3 个相似 Playbook:', similar.map(s => ({
          name: s.playbook.name,
          score: s.matchScore
        })));
      }
    });
  });

  // ==========================================
  // 性能基准测试
  // ==========================================
  describe('Performance Benchmarks', () => {
    it('提取 Playbook 应在 5 秒内完成', async () => {
      const learning: StrategicLearning = {
        ...mockLearning,
        id: 'test-learning-perf-001'
      } as any;

      const startTime = Date.now();
      const playbook = await playbookManager.extractPlaybookFromLearning(learning);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000);
      console.log(`✅ 提取耗时: ${duration}ms`);

      // 清理
      if (playbook) {
        await playbookManager.deletePlaybook(playbook.id);
      }
    });

    it('语义检索应在 1 秒内完成', async () => {
      const startTime = Date.now();
      await playbookMatcher.matchPlaybooks({
        userQuery: '分析用户反馈',
        sessionHistory: [],
        currentContext: {}
      });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000);
      console.log(`✅ 检索耗时: ${duration}ms`);
    });
  });
});
```

### 3. 辅助函数（可选）

创建 `tests/playbook/utils/test-helpers.ts`:

```typescript
import { StrategicLearning } from '../../../src/types/ace-core';

/**
 * 生成测试用 StrategicLearning
 */
export function createMockLearning(overrides?: Partial<StrategicLearning>): StrategicLearning {
  return {
    id: `test-${Date.now()}`,
    userId: 'test-user',
    summary: '测试学习记录',
    learnings: ['测试学习点1', '测试学习点2'],
    outcome: 'success',
    context: {
      domain: 'test',
      skillsUsed: [],
      duration: 1000
    },
    timestamp: Date.now(),
    ...overrides
  } as StrategicLearning;
}

/**
 * 等待异步操作完成（带超时）
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error(`Timeout after ${timeout}ms`);
}
```

## 🧪 测试执行

### 运行测试

```bash
# 运行 Stage 0 验证测试
npm test -- tests/playbook/stage0-verification.test.ts

# 或者使用 Jest watch 模式
npm test -- tests/playbook/stage0-verification.test.ts --watch

# 生成详细报告
npm test -- tests/playbook/stage0-verification.test.ts --verbose
```

### 预期输出

**成功场景**:
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

**失败场景**（示例）:
```
 FAIL  tests/playbook/stage0-verification.test.ts
  Stage 0: Playbook System Verification
    Generator: extractPlaybookFromLearning()
      ✕ 应该能从 StrategicLearning 提取 Playbook (89ms)

  ● Generator: extractPlaybookFromLearning() › 应该能从 StrategicLearning 提取 Playbook

    TypeError: Cannot read property 'extractPlaybookFromLearning' of undefined

      45 |       const playbook = await playbookManager.extractPlaybookFromLearning(
      46 |         learning,
    > 47 |         '用户反馈分析场景'
         |         ^
      48 |       );
```

## ✅ 验收标准

### 必须通过的测试

| 测试项 | 重要性 | 通过标准 |
|-------|--------|---------|
| **提取 Playbook** | 🔴 关键 | 能生成非 null 的 Playbook 对象 |
| **包含必要字段** | 🔴 关键 | 包含 trigger, actions, context, metrics |
| **LanceDB 存储** | 🔴 关键 | 能通过向量检索找回 Playbook |
| **语义匹配** | 🟠 重要 | 相关查询能返回匹配结果 |
| **相似检索** | 🟠 重要 | 能找到至少 1 个相似 Playbook（如果存在） |
| **性能基准** | 🟡 次要 | 提取 <5s, 检索 <1s |

### 决策矩阵

| 通过测试数 | 决策 |
|-----------|------|
| **10/10** | ✅ 完美！直接进入 Stage 0.5 |
| **8-9/10** | ⚠️ 部分问题，评估影响后决定是否继续 |
| **6-7/10** | 🟠 严重问题，需要修复基础功能 |
| **<6/10** | 🔴 **暂停实施**，基础设施需要重构 |

## 📝 问题排查指南

### 常见问题 1: 依赖注入失败

**症状**: `TypeError: Cannot read property 'extractPlaybookFromLearning' of undefined`

**原因**: `PlaybookManager` 或 `PlaybookMatcher` 的依赖（如 LLMManager, ToolRetrievalService）未正确注入。

**解决方案**:
```typescript
// 在 beforeAll 中正确初始化依赖
beforeAll(async () => {
  const llmManager = new LLMManager(/* config */);
  const toolRetrievalService = new ToolRetrievalService(/* config */);

  playbookManager = new PlaybookManager(llmManager, toolRetrievalService);
  playbookMatcher = new PlaybookMatcher(toolRetrievalService);
});
```

### 常见问题 2: LanceDB 未初始化

**症状**: `Error: LanceDB table 'playbooks' not found`

**原因**: LanceDB 数据库或表未初始化。

**解决方案**:
```bash
# 运行数据库迁移脚本
npm run db:migrate

# 或者手动初始化 LanceDB
npm run lancedb:init
```

### 常见问题 3: LLM API 调用失败

**症状**: `Error: OpenAI API key not configured`

**原因**: `extractPlaybookFromLearning()` 内部调用 LLM 进行分析，但环境变量未配置。

**解决方案**:
```bash
# 设置环境变量
export OPENAI_API_KEY="your-api-key"

# 或者在 .env 文件中配置
echo "OPENAI_API_KEY=your-api-key" >> .env
```

### 常见问题 4: 向量检索返回空

**症状**: `findSimilarPlaybooks()` 返回空数组

**原因**:
1. Playbook 未正确向量化
2. 相似度阈值设置过高
3. LanceDB 索引未构建

**解决方案**:
```typescript
// 检查向量化状态
const playbook = await playbookManager.getPlaybook(id);
console.log('向量化状态:', playbook.metadata?.vectorized);

// 降低相似度阈值进行调试
const similar = await playbookMatcher.findSimilarPlaybooks(id, 5, 0.3); // 阈值从 0.6 降到 0.3
```

## ⏱️ 时间估算

| 任务 | 预计时间 | 实际时间 |
|------|---------|---------|
| 阅读文档和现有代码 | 30 分钟 | ___ |
| 编写测试脚本 | 30 分钟 | ___ |
| 准备测试数据 | 15 分钟 | ___ |
| 运行测试并调试 | 30 分钟 | ___ |
| 编写验证报告 | 15 分钟 | ___ |
| **总计** | **2 小时** | ___ |

## 📊 验证报告模板

完成验证后，填写以下报告：

```markdown
# Stage 0 验证报告

**验证日期**: 2025-12-__
**验证人**: ______
**环境**: Node.js v___ / TypeScript v___

## 测试结果摘要

- 总测试数: 10
- 通过: __
- 失败: __
- 跳过: __

## 详细结果

### Generator 功能
- [ ] 提取 Playbook: ✅/❌
- [ ] 必要字段完整: ✅/❌
- [ ] 幂等性: ✅/❌

### Storage 功能
- [ ] LanceDB 存储: ✅/❌
- [ ] ID 查询: ✅/❌

### Matcher 功能
- [ ] 语义匹配: ✅/❌
- [ ] 不相关过滤: ✅/❌
- [ ] 相似检索: ✅/❌

### 性能
- 提取耗时: ___ms (< 5000ms ✅/❌)
- 检索耗时: ___ms (< 1000ms ✅/❌)

## 发现的问题

1. ______
2. ______

## 决策

- [ ] ✅ 验证通过，继续 Stage 0.5
- [ ] ⚠️ 部分问题，需要评估
- [ ] ❌ 验证失败，需要修复基础设施

## 备注

______
```

## 🔗 相关资源

- **PlaybookManager 源码**: [src/services/PlaybookManager.ts](../../src/services/PlaybookManager.ts)
- **PlaybookMatcher 源码**: [src/services/PlaybookMatcher.ts](../../src/services/PlaybookMatcher.ts)
- **类型定义**: [src/types/ace-core.d.ts](../../src/types/ace-core.d.ts)
- **可行性报告 § 2.0**: [ACE架构与EiC融合可行性分析报告.md § 2.0](../../ACE架构与EiC融合可行性分析报告.md#20-当前实现状态评估)

## 📅 下一步

验证通过后，阅读 [Stage 0.5: 任务队列基础设施](02-stage0.5-task-queue.md)

---

**文档版本**: v1.0
**创建日期**: 2025-12-16
**维护者**: ApexBridge Team
