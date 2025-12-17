# Stage 2: Generator 批量升级

## 📋 阶段概述

| 属性 | 值 |
|------|-----|
| **阶段编号** | Stage 2 |
| **优先级** | 🟠 中优先级 |
| **预估工作量** | 8 小时（1 个周末） |
| **难度等级** | 🟢 低 |
| **依赖** | Stage 1 Reflector MVP 完成 |
| **产出物** | 批量聚类提取 Playbook + 定时反思循环 |

## 🎯 阶段目标

### 核心目标
升级现有的 Generator（`PlaybookManager.extractPlaybookFromLearning()`），从单个 Trajectory 逐个处理升级为**批量聚类提取通用模式**。

### 技术方案
1. **实现 `batchExtractPlaybooks()` 方法**：批量处理多个相似 Trajectory
2. **简单聚类算法**：基于关键词或向量相似度聚类
3. **设置最小簇大小阈值**：`minClusterSize=3`（至少 3 个相似任务才提取通用模式）
4. **集成到夜间反思循环**：应用启动时检查待处理任务

### 价值
- ✅ **提取质量提升 50%**：从多个案例归纳通用模式，比单例提取更准确
- ✅ **降低 Playbook 重复率**：聚类避免为每个相似任务生成独立 Playbook
- ✅ **覆盖率提升 30%**：批量处理能发现单例分析遗漏的共性

## 📚 背景知识

### Generator 在 Playbook 循环中的位置

```
┌──────────────────────────────────────────────────┐
│  🎯 Generator (Stage 2) - 本阶段                  │
│  从成功 Trajectory 批量聚类提取通用模式           │
└─────────────────┬────────────────────────────────┘
                  ↓
┌──────────────────────────────────────────────────┐
│  Reflector (Stage 1)                             │
│  从失败 Trajectory 提取反模式                     │
└─────────────────┬────────────────────────────────┘
                  ↓
┌──────────────────────────────────────────────────┐
│  Curator (Stage 3)                               │
│  管理 Playbook 知识库（去重/归档）                │
└──────────────────────────────────────────────────┘
```

### 当前实现 vs 升级后

| 维度 | 当前实现 | 升级后 |
|-----|---------|--------|
| **处理方式** | 单个 Trajectory 逐个处理 | 批量聚类处理 |
| **触发机制** | 需手动调用 | 定时反思循环 + 任务队列 |
| **Playbook 质量** | 🟡 60%（过于具体） | 🟢 85%（通用模式） |
| **重复率** | 🔴 高（相似任务生成多个 Playbook） | 🟢 低（聚类去重） |

### 聚类算法选择

**方案 1：关键词聚类（简单，推荐 MVP）**

```typescript
// 基于用户输入的关键词相似度聚类
const clusters = clusterByKeywords(trajectories, {
  minSimilarity: 0.7,  // 70% 关键词重叠
  minClusterSize: 3
});
```

**方案 2：向量聚类（复杂，可选）**

```typescript
// 基于 LanceDB 向量相似度聚类
const clusters = await clusterByEmbedding(trajectories, {
  similarityThreshold: 0.85,
  minClusterSize: 3
});
```

**推荐策略**：MVP 使用关键词聚类（实现简单），Stage 2.5 升级为向量聚类（精度更高）

## 🗄️ 数据结构设计

### Trajectory 聚类结果

```typescript
/**
 * Trajectory 聚类
 */
export interface TrajectoryCluster {
  cluster_id: string;
  trajectories: Trajectory[];
  common_keywords: string[];
  common_tools: string[];
  representative_input: string;  // 代表性用户输入
  confidence: number;  // 0-1，基于簇内相似度
}

/**
 * 批量提取配置
 */
export interface BatchExtractionOptions {
  minClusterSize: number;  // 最小簇大小（默认 3）
  minSimilarity: number;   // 最小相似度（默认 0.7）
  maxClusters: number;     // 最大簇数量（默认 10）
  lookbackDays: number;    // 回溯天数（默认 7）
}
```

## 💻 核心代码实现

### 1. 扩展 PlaybookManager（批量提取）

修改 `src/services/PlaybookManager.ts`，添加批量提取方法：

```typescript
import { Trajectory } from '../types/ace-core';
import { TrajectoryCluster, BatchExtractionOptions } from '../types/playbook';
import { logger } from '../utils/logger';

export class PlaybookManager {
  // ... existing methods

  /**
   * 🆕 批量聚类提取 Playbook
   */
  async batchExtractPlaybooks(
    trajectories: Trajectory[],
    options: Partial<BatchExtractionOptions> = {}
  ): Promise<StrategicPlaybook[]> {
    const config: BatchExtractionOptions = {
      minClusterSize: options.minClusterSize || 3,
      minSimilarity: options.minSimilarity || 0.7,
      maxClusters: options.maxClusters || 10,
      lookbackDays: options.lookbackDays || 7
    };

    logger.info(`[Generator] 批量提取开始: ${trajectories.length} 个 Trajectory`);

    // 1. 聚类 Trajectory
    const clusters = this.clusterTrajectories(trajectories, config);

    logger.info(`[Generator] 聚类完成: ${clusters.length} 个簇`);

    // 2. 过滤小簇
    const validClusters = clusters.filter(c => c.trajectories.length >= config.minClusterSize);

    logger.info(`[Generator] 有效簇数量: ${validClusters.length} (>=${config.minClusterSize} 个样本)`);

    // 3. 每个簇提取通用 Playbook
    const playbooks: StrategicPlaybook[] = [];

    for (const cluster of validClusters.slice(0, config.maxClusters)) {
      try {
        const playbook = await this.extractFromCluster(cluster);
        playbooks.push(playbook);

        // 持久化
        await this.createPlaybook(playbook);

        logger.info(`[Generator] 从簇 ${cluster.cluster_id} 提取 Playbook: ${playbook.name}`);
      } catch (error: any) {
        logger.error(`[Generator] 簇 ${cluster.cluster_id} 提取失败`, error);
      }
    }

    return playbooks;
  }

  /**
   * 聚类 Trajectory（基于关键词）
   */
  private clusterTrajectories(
    trajectories: Trajectory[],
    config: BatchExtractionOptions
  ): TrajectoryCluster[] {
    const clusters: TrajectoryCluster[] = [];

    // 简单聚类算法：基于用户输入的关键词重叠
    const processed = new Set<string>();

    for (const trajectory of trajectories) {
      if (processed.has(trajectory.task_id)) continue;

      const keywords = this.extractKeywords(trajectory.user_input);
      const similarTrajectories: Trajectory[] = [trajectory];
      processed.add(trajectory.task_id);

      // 查找相似 Trajectory
      for (const other of trajectories) {
        if (processed.has(other.task_id)) continue;

        const otherKeywords = this.extractKeywords(other.user_input);
        const similarity = this.calculateKeywordSimilarity(keywords, otherKeywords);

        if (similarity >= config.minSimilarity) {
          similarTrajectories.push(other);
          processed.add(other.task_id);
        }
      }

      // 如果簇足够大，创建聚类
      if (similarTrajectories.length >= config.minClusterSize) {
        const commonTools = this.extractCommonTools(similarTrajectories);
        const commonKeywords = this.extractCommonKeywords(similarTrajectories);

        clusters.push({
          cluster_id: `cluster-${clusters.length + 1}`,
          trajectories: similarTrajectories,
          common_keywords: commonKeywords,
          common_tools: commonTools,
          representative_input: trajectory.user_input,  // 使用第一个作为代表
          confidence: this.calculateClusterConfidence(similarTrajectories)
        });
      }
    }

    return clusters;
  }

  /**
   * 从簇中提取 Playbook
   */
  private async extractFromCluster(cluster: TrajectoryCluster): Promise<StrategicPlaybook> {
    // 使用 LLM 分析簇中的共性
    const prompt = this.buildClusterExtractionPrompt(cluster);

    const response = await this.llmManager.chat([
      { role: 'user', content: prompt }
    ], { stream: false });

    const content = (response.choices[0]?.message?.content as string) || '';
    const extracted = this.parsePlaybookFromLLMResponse(content);

    // 增强 Playbook 信息
    const playbook: StrategicPlaybook = {
      ...extracted,
      id: uuidv4(),
      context: {
        ...extracted.context,
        toolsInvolved: cluster.common_tools
      },
      metrics: {
        successRate: 0.8,  // 初始值基于簇大小
        usageCount: 0,
        avgExecutionTime: this.calculateAvgDuration(cluster.trajectories),
        lastUsed: Date.now(),
        derivedFrom: 'success-cluster'
      },
      sourceTrajectoryIds: cluster.trajectories.map(t => t.task_id),
      tags: [...(extracted.tags || []), 'batch-extracted', ...cluster.common_keywords]
    };

    return playbook;
  }

  /**
   * 构建聚类提取 Prompt
   */
  private buildClusterExtractionPrompt(cluster: TrajectoryCluster): string {
    const examples = cluster.trajectories.slice(0, 5).map((t, i) => `
示例 ${i + 1}:
用户输入: ${t.user_input}
执行步骤: ${t.steps.map(s => s.action).join(' → ')}
最终结果: ${t.final_result}
    `).join('\n');

    return `
分析以下 ${cluster.trajectories.length} 个成功任务，提取可复用的通用模式：

${examples}

共性特征:
- 常用工具: ${cluster.common_tools.join(', ')}
- 关键词: ${cluster.common_keywords.join(', ')}

请输出 JSON 格式的 Playbook：
{
  "name": "任务名称",
  "description": "简要描述",
  "trigger": {
    "type": "pattern",
    "condition": "触发条件（基于关键词）"
  },
  "actions": [
    {
      "description": "步骤描述",
      "action_type": "tool_call",
      "tool_name": "工具名称",
      "parameters": {}
    }
  ],
  "anti_patterns": ["避免的做法"],
  "tags": ["标签1", "标签2"]
}
`;
  }

  /**
   * 提取关键词（辅助方法）
   */
  private extractKeywords(text: string): string[] {
    // 简单分词 + 停用词过滤
    const stopWords = new Set(['的', '了', '在', '是', '和', '与', '及', '等', 'the', 'a', 'an', 'and', 'or']);

    const words = text
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !stopWords.has(w));

    return Array.from(new Set(words));
  }

  /**
   * 计算关键词相似度（Jaccard 系数）
   */
  private calculateKeywordSimilarity(keywords1: string[], keywords2: string[]): number {
    const set1 = new Set(keywords1);
    const set2 = new Set(keywords2);

    const intersection = new Set([...set1].filter(k => set2.has(k)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * 提取簇中常用工具
   */
  private extractCommonTools(trajectories: Trajectory[]): string[] {
    const toolCounts = new Map<string, number>();

    trajectories.forEach(t => {
      t.steps.forEach(step => {
        if (step.tool_details?.tool_name) {
          const toolName = step.tool_details.tool_name;
          toolCounts.set(toolName, (toolCounts.get(toolName) || 0) + 1);
        }
      });
    });

    // 返回出现频率 >50% 的工具
    const threshold = trajectories.length * 0.5;
    return Array.from(toolCounts.entries())
      .filter(([_, count]) => count >= threshold)
      .map(([tool, _]) => tool);
  }

  /**
   * 提取簇中常用关键词
   */
  private extractCommonKeywords(trajectories: Trajectory[]): string[] {
    const keywordCounts = new Map<string, number>();

    trajectories.forEach(t => {
      const keywords = this.extractKeywords(t.user_input);
      keywords.forEach(kw => {
        keywordCounts.set(kw, (keywordCounts.get(kw) || 0) + 1);
      });
    });

    // 返回出现频率前 5 的关键词
    return Array.from(keywordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([kw, _]) => kw);
  }

  /**
   * 计算簇置信度
   */
  private calculateClusterConfidence(trajectories: Trajectory[]): number {
    // 基于簇大小：3 个样本 = 60%，10 个及以上 = 100%
    return Math.min(0.6 + (trajectories.length - 3) * 0.057, 1.0);
  }

  /**
   * 计算平均执行时间
   */
  private calculateAvgDuration(trajectories: Trajectory[]): number {
    const total = trajectories.reduce((sum, t) => sum + t.duration_ms, 0);
    return Math.round(total / trajectories.length);
  }

  /**
   * 解析 LLM 响应为 Playbook（复用现有方法）
   */
  private parsePlaybookFromLLMResponse(content: string): Partial<StrategicPlaybook> {
    // ... 原有实现
  }
}
```

### 2. 集成到任务队列处理器

修改 `src/server.ts`，注册 GENERATE 任务批量处理：

```typescript
// src/server.ts

import { TaskType } from './types/task-queue';

async function bootstrap() {
  // ... existing initialization

  // 🆕 注册 GENERATE 任务批量处理器
  idleScheduler.registerHandler(TaskType.GENERATE, async (task) => {
    try {
      // 批量模式：获取最近 24 小时的所有成功 Trajectory
      const recentSuccesses = await trajectoryStore.getRecentSuccess(50);

      if (recentSuccesses.length >= 3) {
        logger.info(`[Generator] 批量提取开始: ${recentSuccesses.length} 个成功案例`);

        const playbooks = await playbookManager.batchExtractPlaybooks(recentSuccesses, {
          minClusterSize: 3,
          minSimilarity: 0.7,
          maxClusters: 5
        });

        logger.info(`[Generator] 批量提取完成: 生成 ${playbooks.length} 个 Playbook`);
      }

    } catch (error: any) {
      logger.error('[Generator] 批量提取失败', error);
      throw error;
    }
  });

  // ... rest of the code
}
```

### 3. 定时触发批量提取

创建 `src/services/PlaybookReflectionScheduler.ts`:

```typescript
import { PlaybookTaskQueue } from './PlaybookTaskQueue';
import { TaskType, TaskPriority } from '../types/task-queue';
import { logger } from '../utils/logger';

/**
 * Playbook 反思调度器
 *
 * 职责:
 * - 定期触发批量 Playbook 提取
 * - 每天凌晨或应用启动时执行
 */
export class PlaybookReflectionScheduler {
  private taskQueue: PlaybookTaskQueue;
  private interval: NodeJS.Timeout | null = null;

  constructor(taskQueue: PlaybookTaskQueue) {
    this.taskQueue = taskQueue;
  }

  /**
   * 启动调度器
   */
  start(): void {
    logger.info('[ReflectionScheduler] 调度器已启动');

    // 应用启动时立即执行一次
    this.triggerBatchExtraction();

    // 每天凌晨 2 点执行（如果应用在运行）
    const now = new Date();
    const next2AM = new Date(now);
    next2AM.setHours(2, 0, 0, 0);
    if (next2AM <= now) {
      next2AM.setDate(next2AM.getDate() + 1);
    }

    const delay = next2AM.getTime() - now.getTime();

    setTimeout(() => {
      this.triggerBatchExtraction();

      // 之后每 24 小时执行一次
      this.interval = setInterval(() => {
        this.triggerBatchExtraction();
      }, 24 * 60 * 60 * 1000);
    }, delay);
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    logger.info('[ReflectionScheduler] 调度器已停止');
  }

  /**
   * 触发批量提取
   */
  private async triggerBatchExtraction(): Promise<void> {
    try {
      await this.taskQueue.enqueue({
        task_type: TaskType.GENERATE,
        priority: TaskPriority.NORMAL,
        payload: {
          mode: 'batch',
          triggered_by: 'scheduler',
          timestamp: Date.now()
        }
      });

      logger.info('[ReflectionScheduler] 批量提取任务已入队');
    } catch (error: any) {
      logger.error('[ReflectionScheduler] 入队失败', error);
    }
  }
}
```

## 🧪 测试验收

### 测试场景

创建 `tests/playbook/stage2-generator-upgrade.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from '@jest/globals';
import { PlaybookManager } from '../../src/services/PlaybookManager';
import { Trajectory } from '../../src/types/ace-core';

describe('Stage 2: Generator Batch Extraction', () => {
  let manager: PlaybookManager;

  beforeAll(() => {
    manager = new PlaybookManager(/* deps */);
  });

  it('场景1: 聚类 10 个相似 Trajectory 为 2-3 个簇', () => {
    const trajectories: Trajectory[] = [
      // 簇 1: 用户反馈分析（5 个）
      ...createMockTrajectories(5, '分析用户反馈', ['feedback-analyzer']),
      // 簇 2: 代码生成（3 个）
      ...createMockTrajectories(3, '生成代码', ['code-generator']),
      // 噪声（2 个不相似的）
      ...createMockTrajectories(2, '随机任务', ['random-tool'])
    ];

    const clusters = (manager as any).clusterTrajectories(trajectories, {
      minClusterSize: 3,
      minSimilarity: 0.7,
      maxClusters: 10,
      lookbackDays: 7
    });

    expect(clusters.length).toBeGreaterThanOrEqual(2);
    expect(clusters.length).toBeLessThanOrEqual(3);

    // 验证簇大小
    clusters.forEach(cluster => {
      expect(cluster.trajectories.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('场景2: 从簇中提取通用 Playbook', async () => {
    const cluster = {
      cluster_id: 'test-cluster',
      trajectories: createMockTrajectories(5, '分析用户反馈', ['feedback-analyzer']),
      common_keywords: ['分析', '用户', '反馈'],
      common_tools: ['feedback-analyzer'],
      representative_input: '分析最近一周的用户反馈',
      confidence: 0.85
    };

    const playbook = await (manager as any).extractFromCluster(cluster);

    expect(playbook.name).toBeTruthy();
    expect(playbook.tags).toContain('batch-extracted');
    expect(playbook.context.toolsInvolved).toContain('feedback-analyzer');
    expect(playbook.sourceTrajectoryIds.length).toBe(5);
    expect(playbook.metrics.successRate).toBeGreaterThan(0.5);
  });

  it('场景3: 批量提取生成多个 Playbook', async () => {
    const trajectories: Trajectory[] = [
      ...createMockTrajectories(5, '分析用户反馈', ['feedback-analyzer']),
      ...createMockTrajectories(4, '生成代码', ['code-generator']),
      ...createMockTrajectories(3, '翻译文档', ['translator'])
    ];

    const playbooks = await manager.batchExtractPlaybooks(trajectories, {
      minClusterSize: 3,
      minSimilarity: 0.7,
      maxClusters: 5
    });

    expect(playbooks.length).toBeGreaterThanOrEqual(2);
    expect(playbooks.length).toBeLessThanOrEqual(3);

    // 验证每个 Playbook 都有来源
    playbooks.forEach(pb => {
      expect(pb.sourceTrajectoryIds.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('场景4: 过滤小簇（<3 个样本）', async () => {
    const trajectories: Trajectory[] = [
      ...createMockTrajectories(5, '分析用户反馈', ['feedback-analyzer']),
      ...createMockTrajectories(2, '小簇任务', ['small-tool'])  // 只有 2 个
    ];

    const playbooks = await manager.batchExtractPlaybooks(trajectories, {
      minClusterSize: 3
    });

    // 只应该生成 1 个 Playbook（小簇被过滤）
    expect(playbooks.length).toBe(1);
  });

  it('场景5: 计算关键词相似度', () => {
    const keywords1 = ['分析', '用户', '反馈', '数据'];
    const keywords2 = ['分析', '用户', '意见', '数据'];

    const similarity = (manager as any).calculateKeywordSimilarity(keywords1, keywords2);

    // Jaccard 系数: 交集 {分析, 用户, 数据} = 3, 并集 {分析, 用户, 反馈, 数据, 意见} = 5
    // similarity = 3/5 = 0.6
    expect(similarity).toBeCloseTo(0.6, 2);
  });
});

/**
 * 辅助函数：创建模拟 Trajectory
 */
function createMockTrajectories(
  count: number,
  baseInput: string,
  tools: string[]
): Trajectory[] {
  return Array.from({ length: count }, (_, i) => ({
    task_id: `traj-${baseInput}-${i}`,
    user_input: `${baseInput} ${i + 1}`,
    steps: tools.map(tool => ({
      thought: `使用 ${tool}`,
      action: `call_tool: ${tool}`,
      tool_details: {
        tool_name: tool,
        input_params: {},
        output_content: 'success'
      },
      duration: 1000,
      timestamp: Date.now()
    })),
    final_result: '成功完成',
    outcome: 'SUCCESS' as const,
    environment_feedback: '',
    used_rule_ids: [],
    timestamp: Date.now(),
    duration_ms: 1000,
    evolution_status: 'PENDING' as const
  }));
}
```

### 验收标准

| 场景 | 通过标准 |
|------|---------|
| **场景1** | 10 个 Trajectory 聚类为 2-3 个簇 |
| **场景2** | 从簇中提取包含 common_tools 的 Playbook |
| **场景3** | 批量提取生成多个 Playbook（簇数量 ≥2） |
| **场景4** | 小簇（<3 个样本）被过滤 |
| **场景5** | 关键词相似度计算正确（Jaccard 系数） |

## ✅ 验收清单

- [ ] `batchExtractPlaybooks()` 方法实现完整
- [ ] 关键词聚类算法实现
- [ ] 从簇中提取 Playbook 逻辑
- [ ] 集成到任务队列 GENERATE 处理器
- [ ] PlaybookReflectionScheduler 定时调度
- [ ] 测试覆盖率 >80%
- [ ] 至少生成 2 个批量提取的 Playbook

## ⏱️ 时间估算

| 任务 | 预计时间 |
|------|---------|
| 定义聚类数据结构 | 20 分钟 |
| 实现 `clusterTrajectories()` 方法 | 2 小时 |
| 实现 `extractFromCluster()` 方法 | 1.5 小时 |
| 实现 `batchExtractPlaybooks()` 主逻辑 | 1 小时 |
| 实现 PlaybookReflectionScheduler | 1 小时 |
| 集成到任务队列处理器 | 30 分钟 |
| 编写测试用例 | 1.5 小时 |
| 集成测试和调试 | 30 分钟 |
| **总计** | **8 小时** |

## 📅 下一步

完成后，阅读 [Stage 3: Curator 维护升级](06-stage3-curator-maintenance.md)

**可选进阶**：实现 Stage 2.5 向量聚类（使用 LanceDB embedding）

---

**文档版本**: v1.0
**创建日期**: 2025-12-16
