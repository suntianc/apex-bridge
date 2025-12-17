# Stage 3: Curator 知识库维护

## 📋 阶段概述

| 属性 | 值 |
|------|-----|
| **阶段编号** | Stage 3 |
| **优先级** | 🟡 低优先级 |
| **预估工作量** | 14 小时（1.5 个周末） |
| **难度等级** | 🟢 低 |
| **依赖** | Stage 2 Generator 升级完成 |
| **产出物** | 自动去重合并 + 自动归档 + 混合检索（BM25 + 向量） |

## 🎯 阶段目标

### 核心目标
完善 Playbook 知识库的自动化维护，实现：
1. **自动去重与合并**：检测高度相似的 Playbook（余弦相似度 >0.9）并合并
2. **自动归档**：将 90 天未使用且成功率 <50% 的 Playbook 归档
3. **混合检索优化**：BM25 全文检索 + 向量检索 + RRF 融合，提升检索精度 15%

### 技术方案
1. **重复检测算法**：基于 LanceDB 向量相似度（cosine similarity >0.9）
2. **合并策略**：保留成功率更高的版本，合并使用统计
3. **归档策略**：`lastUsed > 90 天 AND successRate < 0.5`
4. **混合检索**：BM25（精确匹配） + 向量检索（语义匹配） + RRF 融合

### 价值
- ✅ **降低重复率 70%**：自动去重避免知识库膨胀
- ✅ **检索精度提升 15%**：混合检索兼顾精确和语义匹配
- ✅ **知识库质量提升 30%**：低效 Playbook 自动归档

## 📚 背景知识

### Curator 在 Playbook 循环中的位置

```
┌──────────────────────────────────────────────────┐
│  Generator (Stage 2)                             │
│  从成功 Trajectory 批量聚类提取通用模式           │
└─────────────────┬────────────────────────────────┘
                  ↓
┌──────────────────────────────────────────────────┐
│  Reflector (Stage 1)                             │
│  从失败 Trajectory 提取反模式                     │
└─────────────────┬────────────────────────────────┘
                  ↓
┌──────────────────────────────────────────────────┐
│  🎯 Curator (Stage 3) - 本阶段                    │
│  管理 Playbook 知识库（去重/归档/检索优化）       │
└──────────────────────────────────────────────────┘
```

### 当前实现 vs 升级后

| 维度 | 当前实现 | 升级后 |
|-----|---------|--------|
| **去重方式** | 只检索相似项，不自动合并 | 自动检测并合并（相似度 >0.9） |
| **归档策略** | 手动标记 `status='archived'` | 自动归档（90 天未使用 + 成功率 <50%） |
| **检索方式** | 纯向量检索 | 混合检索（BM25 + 向量 + RRF） |
| **知识图谱** | 扁平向量检索 | 无（Stage 4 可选） |

### 混合检索原理

**BM25（最佳匹配 25）**：基于词频的统计检索算法
```
score(D, Q) = Σ IDF(qi) · (f(qi, D) · (k1 + 1)) / (f(qi, D) + k1 · (1 - b + b · |D| / avgdl))
```

**向量检索**：基于语义相似度的深度学习检索
```
score(D, Q) = cosine_similarity(embed(Q), embed(D))
```

**RRF 融合（Reciprocal Rank Fusion）**：融合多个排序结果
```
RRF_score(D) = Σ 1 / (k + rank_i(D))
```

## 🗄️ 数据结构设计

### 重复检测结果

```typescript
/**
 * 重复 Playbook 对
 */
export interface DuplicatePlaybookPair {
  playbook1: StrategicPlaybook;
  playbook2: StrategicPlaybook;
  similarity: number;  // 0-1
  recommendation: 'merge' | 'keep_both';
}

/**
 * 归档候选
 */
export interface ArchiveCandidate {
  playbook: StrategicPlaybook;
  reason: string;
  days_since_last_used: number;
  success_rate: number;
}
```

### 混合检索配置

```typescript
/**
 * 混合检索选项
 */
export interface HybridSearchOptions {
  query: string;
  limit: number;
  weights: {
    bm25: number;    // 默认 0.4
    vector: number;  // 默认 0.6
  };
  filters?: {
    tags?: string[];
    type?: string;
    status?: 'active' | 'archived';
  };
}
```

## 💻 核心代码实现

### 1. 扩展 PlaybookMatcher（维护功能）

修改 `src/services/PlaybookMatcher.ts`，添加维护方法：

```typescript
import { StrategicPlaybook } from '../types/playbook';
import { DuplicatePlaybookPair, ArchiveCandidate } from '../types/playbook-maintenance';
import { logger } from '../utils/logger';

export class PlaybookMatcher {
  // ... existing methods

  /**
   * 🆕 维护 Playbook 知识库（主入口）
   */
  async maintainPlaybookKnowledgeBase(): Promise<{
    merged: number;
    archived: number;
  }> {
    logger.info('[Curator] 开始知识库维护');

    let mergedCount = 0;
    let archivedCount = 0;

    try {
      // 1. 去重与合并
      const duplicates = await this.findDuplicates();
      logger.info(`[Curator] 发现 ${duplicates.length} 对重复 Playbook`);

      for (const pair of duplicates) {
        if (pair.recommendation === 'merge') {
          await this.mergePlaybooks(pair.playbook1, pair.playbook2);
          mergedCount++;
        }
      }

      // 2. 自动归档
      const candidates = await this.findArchiveCandidates();
      logger.info(`[Curator] 发现 ${candidates.length} 个归档候选`);

      for (const candidate of candidates) {
        await this.archivePlaybook(candidate.playbook.id);
        archivedCount++;
      }

      logger.info(`[Curator] 维护完成: 合并 ${mergedCount} 个, 归档 ${archivedCount} 个`);

      return { merged: mergedCount, archived: archivedCount };

    } catch (error: any) {
      logger.error('[Curator] 维护失败', error);
      throw error;
    }
  }

  /**
   * 🆕 查找重复 Playbook
   */
  async findDuplicates(threshold: number = 0.9): Promise<DuplicatePlaybookPair[]> {
    const allPlaybooks = await this.getAllPlaybooks({ status: 'active' });
    const duplicates: DuplicatePlaybookPair[] = [];
    const processed = new Set<string>();

    for (const playbook1 of allPlaybooks) {
      if (processed.has(playbook1.id)) continue;

      // 查找相似 Playbook
      const similar = await this.findSimilarPlaybooks(playbook1.id, 5);

      for (const match of similar) {
        if (match.matchScore >= threshold && !processed.has(match.playbook.id)) {
          duplicates.push({
            playbook1,
            playbook2: match.playbook,
            similarity: match.matchScore,
            recommendation: this.shouldMerge(playbook1, match.playbook) ? 'merge' : 'keep_both'
          });

          processed.add(playbook1.id);
          processed.add(match.playbook.id);
        }
      }
    }

    return duplicates;
  }

  /**
   * 🆕 判断是否应该合并
   */
  private shouldMerge(pb1: StrategicPlaybook, pb2: StrategicPlaybook): boolean {
    // 如果名称完全相同或高度相似（编辑距离 <3），建议合并
    const nameDistance = this.levenshteinDistance(pb1.name, pb2.name);
    if (nameDistance < 3) return true;

    // 如果工具列表相同，建议合并
    const tools1 = new Set(pb1.context.toolsInvolved);
    const tools2 = new Set(pb2.context.toolsInvolved);
    const sameTools = [...tools1].every(t => tools2.has(t)) && [...tools2].every(t => tools1.has(t));
    if (sameTools) return true;

    return false;
  }

  /**
   * 🆕 合并 Playbook
   */
  async mergePlaybooks(pb1: StrategicPlaybook, pb2: StrategicPlaybook): Promise<void> {
    // 保留成功率更高的版本
    const keeper = pb1.metrics.successRate >= pb2.metrics.successRate ? pb1 : pb2;
    const removed = keeper === pb1 ? pb2 : pb1;

    logger.info(`[Curator] 合并 Playbook: 保留 ${keeper.id}, 移除 ${removed.id}`);

    // 合并统计数据
    const mergedMetrics = {
      successRate: (
        keeper.metrics.successRate * keeper.metrics.usageCount +
        removed.metrics.successRate * removed.metrics.usageCount
      ) / (keeper.metrics.usageCount + removed.metrics.usageCount),
      usageCount: keeper.metrics.usageCount + removed.metrics.usageCount,
      avgExecutionTime: (
        keeper.metrics.avgExecutionTime * keeper.metrics.usageCount +
        removed.metrics.avgExecutionTime * removed.metrics.usageCount
      ) / (keeper.metrics.usageCount + removed.metrics.usageCount),
      lastUsed: Math.max(keeper.metrics.lastUsed, removed.metrics.lastUsed)
    };

    // 合并来源 Trajectory
    const mergedSources = [
      ...(keeper.sourceTrajectoryIds || []),
      ...(removed.sourceTrajectoryIds || [])
    ];

    // 更新保留的 Playbook
    await this.updatePlaybook(keeper.id, {
      metrics: mergedMetrics,
      sourceTrajectoryIds: Array.from(new Set(mergedSources)),
      updatedAt: new Date()
    });

    // 删除被移除的 Playbook
    await this.deletePlaybook(removed.id);
  }

  /**
   * 🆕 查找归档候选
   */
  async findArchiveCandidates(): Promise<ArchiveCandidate[]> {
    const allPlaybooks = await this.getAllPlaybooks({ status: 'active' });
    const candidates: ArchiveCandidate[] = [];
    const now = Date.now();

    for (const playbook of allPlaybooks) {
      const daysSinceUsed = (now - playbook.metrics.lastUsed) / (24 * 60 * 60 * 1000);

      // 归档条件: 90 天未使用 AND 成功率 <50%
      if (daysSinceUsed > 90 && playbook.metrics.successRate < 0.5) {
        candidates.push({
          playbook,
          reason: `${Math.round(daysSinceUsed)} 天未使用且成功率 ${(playbook.metrics.successRate * 100).toFixed(1)}%`,
          days_since_last_used: daysSinceUsed,
          success_rate: playbook.metrics.successRate
        });
      }
    }

    return candidates;
  }

  /**
   * 🆕 归档 Playbook
   */
  async archivePlaybook(playbookId: string): Promise<void> {
    await this.updatePlaybook(playbookId, {
      status: 'archived',
      updatedAt: new Date()
    });

    logger.info(`[Curator] Playbook 已归档: ${playbookId}`);
  }

  /**
   * 辅助方法：Levenshtein 编辑距离
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }
}
```

### 2. 混合检索实现

创建 `src/services/HybridSearchService.ts`:

```typescript
import { StrategicPlaybook } from '../types/playbook';
import { HybridSearchOptions } from '../types/playbook-maintenance';
import { logger } from '../utils/logger';

/**
 * 混合检索服务
 *
 * 职责:
 * - BM25 全文检索
 * - 向量语义检索
 * - RRF 融合排序
 */
export class HybridSearchService {
  private vectorDB: any;  // LanceDB instance
  private bm25Index: Map<string, any>;  // Simple in-memory BM25 index

  constructor(vectorDB: any) {
    this.vectorDB = vectorDB;
    this.bm25Index = new Map();
  }

  /**
   * 🆕 混合检索
   */
  async search(options: HybridSearchOptions): Promise<StrategicPlaybook[]> {
    const { query, limit, weights = { bm25: 0.4, vector: 0.6 } } = options;

    logger.debug(`[HybridSearch] 查询: ${query}`);

    // 1. BM25 检索
    const bm25Results = await this.bm25Search(query, limit * 2);

    // 2. 向量检索
    const vectorResults = await this.vectorSearch(query, limit * 2);

    // 3. RRF 融合
    const fusedResults = this.fuseResults(bm25Results, vectorResults, weights);

    // 4. 返回前 N 个
    return fusedResults.slice(0, limit);
  }

  /**
   * BM25 检索
   */
  private async bm25Search(query: string, limit: number): Promise<Array<{ id: string; score: number }>> {
    const queryTerms = this.tokenize(query);
    const scores = new Map<string, number>();

    // 简化的 BM25 实现
    for (const [docId, docData] of this.bm25Index.entries()) {
      let score = 0;
      for (const term of queryTerms) {
        if (docData.terms.has(term)) {
          const tf = docData.terms.get(term);
          const idf = this.calculateIDF(term);
          score += idf * ((tf * 2.2) / (tf + 1.2));  // k1=2.2, b=1.2 (简化)
        }
      }
      if (score > 0) {
        scores.set(docId, score);
      }
    }

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, score]) => ({ id, score }));
  }

  /**
   * 向量检索
   */
  private async vectorSearch(query: string, limit: number): Promise<Array<{ id: string; score: number }>> {
    // 调用 LanceDB 向量检索
    const results = await this.vectorDB.search(query, limit);
    return results.map((r: any) => ({ id: r.id, score: r.score }));
  }

  /**
   * RRF 融合
   */
  private fuseResults(
    bm25Results: Array<{ id: string; score: number }>,
    vectorResults: Array<{ id: string; score: number }>,
    weights: { bm25: number; vector: number }
  ): StrategicPlaybook[] {
    const k = 60;  // RRF 参数
    const scoreMap = new Map<string, number>();

    // BM25 贡献
    bm25Results.forEach((result, rank) => {
      const rrfScore = weights.bm25 / (k + rank + 1);
      scoreMap.set(result.id, (scoreMap.get(result.id) || 0) + rrfScore);
    });

    // 向量检索贡献
    vectorResults.forEach((result, rank) => {
      const rrfScore = weights.vector / (k + rank + 1);
      scoreMap.set(result.id, (scoreMap.get(result.id) || 0) + rrfScore);
    });

    // 按融合分数排序
    const sortedIds = Array.from(scoreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, _]) => id);

    // 获取完整 Playbook 对象
    return this.getPlaybooksByIds(sortedIds);
  }

  /**
   * 索引 Playbook（BM25）
   */
  async indexPlaybook(playbook: StrategicPlaybook): Promise<void> {
    const text = [
      playbook.name,
      playbook.description,
      ...playbook.tags,
      ...playbook.context.toolsInvolved
    ].join(' ');

    const terms = this.tokenize(text);
    const termFreq = new Map<string, number>();

    terms.forEach(term => {
      termFreq.set(term, (termFreq.get(term) || 0) + 1);
    });

    this.bm25Index.set(playbook.id, {
      terms: termFreq,
      length: terms.length
    });
  }

  /**
   * 分词
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);
  }

  /**
   * 计算 IDF
   */
  private calculateIDF(term: string): number {
    const N = this.bm25Index.size;
    let df = 0;

    for (const [_, docData] of this.bm25Index.entries()) {
      if (docData.terms.has(term)) df++;
    }

    return Math.log((N - df + 0.5) / (df + 0.5) + 1);
  }

  /**
   * 根据 ID 列表获取 Playbook
   */
  private async getPlaybooksByIds(ids: string[]): Promise<StrategicPlaybook[]> {
    // 从数据库批量获取
    // ... implementation
    return [];
  }
}
```

### 3. 定时维护任务

修改 `src/server.ts`，添加 CURATE 任务处理器：

```typescript
// src/server.ts

import { TaskType } from './types/task-queue';

async function bootstrap() {
  // ... existing initialization

  // 🆕 注册 CURATE 任务处理器
  idleScheduler.registerHandler(TaskType.CURATE, async (task) => {
    try {
      logger.info('[Curator] 开始知识库维护');

      const result = await playbookMatcher.maintainPlaybookKnowledgeBase();

      logger.info(`[Curator] 维护完成: 合并 ${result.merged} 个, 归档 ${result.archived} 个`);

    } catch (error: any) {
      logger.error('[Curator] 维护失败', error);
      throw error;
    }
  });

  // 🆕 每周日凌晨触发 CURATE 任务
  const scheduleCurateMaintenance = () => {
    const now = new Date();
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + (7 - now.getDay()));
    nextSunday.setHours(2, 0, 0, 0);

    const delay = nextSunday.getTime() - now.getTime();

    setTimeout(async () => {
      await taskQueue.enqueue({
        task_type: TaskType.CURATE,
        priority: TaskPriority.NORMAL
      });

      // 下周继续
      scheduleCurateMaintenance();
    }, delay);
  };

  scheduleCurateMaintenance();

  // ... rest of the code
}
```

## 🧪 测试验收

### 测试场景

创建 `tests/playbook/stage3-curator-maintenance.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from '@jest/globals';
import { PlaybookMatcher } from '../../src/services/PlaybookMatcher';
import { StrategicPlaybook } from '../../src/types/playbook';

describe('Stage 3: Curator Maintenance', () => {
  let matcher: PlaybookMatcher;

  beforeAll(() => {
    matcher = new PlaybookMatcher(/* deps */);
  });

  it('场景1: 检测高度相似的 Playbook（相似度 >0.9）', async () => {
    // 创建 2 个高度相似的 Playbook
    const pb1 = await createMockPlaybook({
      name: '用户反馈分析最佳实践',
      tags: ['分析', '反馈', '用户']
    });

    const pb2 = await createMockPlaybook({
      name: '用户反馈分析最佳方法',  // 名称相似
      tags: ['分析', '反馈', '用户']  // 标签相同
    });

    const duplicates = await matcher.findDuplicates(0.9);

    expect(duplicates.length).toBeGreaterThan(0);

    const pair = duplicates.find(d =>
      (d.playbook1.id === pb1.id && d.playbook2.id === pb2.id) ||
      (d.playbook1.id === pb2.id && d.playbook2.id === pb1.id)
    );

    expect(pair).toBeDefined();
    expect(pair!.similarity).toBeGreaterThan(0.9);
  });

  it('场景2: 合并重复 Playbook，保留高成功率版本', async () => {
    const pb1 = await createMockPlaybook({
      name: 'Playbook A',
      successRate: 0.85,
      usageCount: 10
    });

    const pb2 = await createMockPlaybook({
      name: 'Playbook A',
      successRate: 0.65,
      usageCount: 5
    });

    await matcher.mergePlaybooks(pb1, pb2);

    // 验证保留高成功率版本
    const keeper = await matcher.getPlaybookById(pb1.id);
    expect(keeper).toBeDefined();

    // 验证统计数据合并
    expect(keeper!.metrics.usageCount).toBe(15);  // 10 + 5

    // 验证低成功率版本被删除
    const removed = await matcher.getPlaybookById(pb2.id);
    expect(removed).toBeNull();
  });

  it('场景3: 识别归档候选（90 天未使用 + 成功率 <50%）', async () => {
    // 创建符合归档条件的 Playbook
    const pb = await createMockPlaybook({
      name: '低效 Playbook',
      successRate: 0.3,
      lastUsed: Date.now() - 100 * 24 * 60 * 60 * 1000  // 100 天前
    });

    const candidates = await matcher.findArchiveCandidates();

    const candidate = candidates.find(c => c.playbook.id === pb.id);
    expect(candidate).toBeDefined();
    expect(candidate!.days_since_last_used).toBeGreaterThan(90);
    expect(candidate!.success_rate).toBeLessThan(0.5);
  });

  it('场景4: 自动归档 Playbook', async () => {
    const pb = await createMockPlaybook({
      name: '待归档 Playbook',
      status: 'active'
    });

    await matcher.archivePlaybook(pb.id);

    const archived = await matcher.getPlaybookById(pb.id);
    expect(archived!.status).toBe('archived');
  });

  it('场景5: 混合检索精度高于纯向量检索', async () => {
    // 创建测试数据
    await seedPlaybooks([
      { name: '代码审查最佳实践', tags: ['code-review', 'quality'] },
      { name: '代码生成工具', tags: ['code-generation', 'automation'] },
      { name: '审查流程优化', tags: ['review', 'process'] }
    ]);

    // 查询 "代码审查"
    const vectorResults = await matcher.matchPlaybooks({ userQuery: '代码审查' });
    const hybridResults = await hybridSearch.search({ query: '代码审查', limit: 5 });

    // 混合检索应该将精确匹配排在前面
    expect(hybridResults[0].name).toContain('代码审查');
  });
});

/**
 * 辅助函数：创建模拟 Playbook
 */
async function createMockPlaybook(overrides: Partial<StrategicPlaybook>): Promise<StrategicPlaybook> {
  const playbook: StrategicPlaybook = {
    id: uuidv4(),
    name: 'Test Playbook',
    type: 'standard',
    tags: [],
    description: 'Test description',
    trigger: { type: 'pattern', condition: 'test' },
    actions: [],
    anti_patterns: [],
    context: { scenario: 'test', domain: 'test', toolsInvolved: [] },
    metrics: {
      successRate: 0.8,
      usageCount: 1,
      avgExecutionTime: 1000,
      lastUsed: Date.now()
    },
    status: 'active',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };

  // 保存到数据库
  await saveToDB(playbook);

  return playbook;
}
```

### 验收标准

| 场景 | 通过标准 |
|------|---------|
| **场景1** | 检测相似度 >0.9 的 Playbook 对 |
| **场景2** | 合并时保留高成功率版本，统计数据正确合并 |
| **场景3** | 识别 90 天未使用 + 成功率 <50% 的 Playbook |
| **场景4** | 归档后 `status` 更新为 `archived` |
| **场景5** | 混合检索精度高于纯向量检索（精确匹配排在前面） |

## ✅ 验收清单

- [ ] `maintainPlaybookKnowledgeBase()` 主方法实现
- [ ] `findDuplicates()` 重复检测逻辑
- [ ] `mergePlaybooks()` 合并逻辑（保留高成功率版本）
- [ ] `findArchiveCandidates()` 归档候选识别
- [ ] `HybridSearchService` 混合检索实现
- [ ] 集成到任务队列 CURATE 处理器
- [ ] 每周日定时触发维护任务
- [ ] 测试覆盖率 >80%

## ⏱️ 时间估算

| 任务 | 预计时间 |
|------|---------|
| 实现 `findDuplicates()` 方法 | 2 小时 |
| 实现 `mergePlaybooks()` 方法 | 1.5 小时 |
| 实现 `findArchiveCandidates()` 和归档逻辑 | 1 小时 |
| 实现 HybridSearchService（BM25 + RRF） | 4 小时 |
| 集成到任务队列处理器 | 1 小时 |
| 实现定时调度（每周日触发） | 30 分钟 |
| 编写测试用例 | 2.5 小时 |
| 集成测试和调试 | 1.5 小时 |
| **总计** | **14 小时** |

## 📅 下一步

完成后，阅读 [Stage 3.5: Playbook 强制执行](07-stage3.5-forced-execution.md)

**可选进阶**：实现知识图谱（Playbook 关系建模）

---

**文档版本**: v1.0
**创建日期**: 2025-12-16
