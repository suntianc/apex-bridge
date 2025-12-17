# Stage 1: Reflector MVP 实现

## 📋 阶段概述

| 属性 | 值 |
|------|-----|
| **阶段编号** | Stage 1 |
| **优先级** | 🔴 最高优先级 |
| **预估工作量** | 16 小时（2 个周末） |
| **难度等级** | 🟡 中等 |
| **依赖** | Stage 0.6 Trajectory 质量提升完成 |
| **产出物** | PlaybookReflector 规则引擎 + 风险规避型 Playbook 生成 |

## 🎯 阶段目标

### 核心目标
实现 Playbook 反思器（Reflector），对比成功/失败 Trajectory，提取反模式并生成**风险规避型 Playbook**。

### 技术方案（MVP 策略）
⚠️ **修正关键**：不要一开始就让 LLM 自动发现所有反模式。采用**规则引擎起步**：

1. **硬编码 3-5 种常见错误模式**（Timeout, RateLimit, ResourceExhausted, NetworkError, PermissionDenied）
2. **基于 ErrorType 分类自动匹配**（来自 Stage 0.6）
3. **生成风险规避 Playbook**（type: 'risk_avoidance', tags: ['failure-derived']）
4. **第二阶段引入 LLM**（处理 UNKNOWN 错误类型）

### 价值
- ✅ **准确率从 40% → 80%**：规则引擎对常见错误模式识别精准
- ✅ **快速迭代**：MVP 周末即可验证，无需复杂的 LLM Prompt 调优
- ✅ **可扩展性**：规则引擎作为基础，LLM 作为补充

## 📚 背景知识

### Reflector 在 Playbook 循环中的位置

```
┌──────────────────────────────────────────────────┐
│  Generator (Stage 2)                             │
│  从成功 Trajectory 提取通用模式                   │
└─────────────────┬────────────────────────────────┘
                  ↓
┌──────────────────────────────────────────────────┐
│  🎯 Reflector (Stage 1) - 本阶段                  │
│  从失败 Trajectory 提取反模式                     │
│  生成风险规避型 Playbook                          │
└─────────────────┬────────────────────────────────┘
                  ↓
┌──────────────────────────────────────────────────┐
│  Curator (Stage 3)                               │
│  管理 Playbook 知识库（去重/归档）                │
└──────────────────────────────────────────────────┘
```

### 规则引擎 vs LLM 方案对比

| 维度 | 规则引擎（MVP） | LLM 聚类（进阶） |
|-----|---------------|---------------|
| **实现难度** | 🟢 低（周末完成） | 🟠 中（需调优 Prompt） |
| **准确率** | 🟢 80%（常见模式） | 🟡 60%（LLM 幻觉风险） |
| **可解释性** | 🟢 高（规则明确） | 🟡 低（黑盒） |
| **覆盖率** | 🟡 60%（只处理已知模式） | 🟢 90%（可发现新模式） |
| **成本** | 🟢 零成本 | 🟠 每次 API 调用成本 |
| **维护性** | 🟢 易维护（添加规则） | 🟠 需调整 Prompt |

**最佳策略**：规则引擎处理 80% 常见错误 + LLM 处理 20% 长尾错误

### 反模式示例

| ErrorType | 反模式 | 解决方案 | Playbook 类型 |
|-----------|-------|---------|-------------|
| `TIMEOUT` | 单次处理过多数据 | 分批处理，每批 ≤100 条 | risk_avoidance |
| `RATE_LIMIT` | 短时间频繁调用 API | 添加速率限制器（1 req/s） | risk_avoidance |
| `RESOURCE_EXHAUSTED` | 一次性加载大文件 | 使用流式处理 | risk_avoidance |
| `NETWORK_ERROR` | 无重试机制 | 添加指数退避重试 | risk_avoidance |
| `PERMISSION_DENIED` | API Key 过期 | 检查权限配置 | risk_avoidance |

## 🗄️ 数据结构设计

### PlaybookReflector 输入/输出

```typescript
/**
 * 失败模式分析结果
 */
export interface FailurePattern {
  error_type: ErrorType;
  occurrences: number;
  failed_trajectories: string[];  // Trajectory IDs
  anti_pattern: string;
  solution: string;
  confidence: number;  // 0-1，基于出现次数
}

/**
 * 错误模式规则
 */
export interface ErrorPatternRule {
  error_type: ErrorType;
  keywords: string[];
  anti_pattern: string;
  solution: string;
  tags: string[];
}
```

### 风险规避型 Playbook 结构

```typescript
// 生成的 Playbook 示例
const riskAvoidancePlaybook: StrategicPlaybook = {
  id: 'pb-risk-timeout-001',
  name: '[风险规避] 超时处理模式',
  type: 'risk_avoidance',
  tags: ['failure-derived', 'risk-avoidance', 'timeout'],

  description: '处理大数据量时避免超时的最佳实践',

  trigger: {
    type: 'pattern',
    condition: '检测到 TIMEOUT 错误且数据量 >100 条'
  },

  actions: [{
    description: '将数据分批处理，每批不超过 100 条',
    action_type: 'preventive_measure'
  }],

  anti_patterns: [
    '不要在单次调用中处理超过 100 条数据',
    '避免在未设置超时限制的情况下执行长时间操作'
  ],

  context: {
    scenario: '批量数据处理',
    domain: 'data-processing',
    toolsInvolved: ['feedback-analyzer', 'data-processor']
  },

  metrics: {
    successRate: 0.0,  // 初始为 0（未使用过）
    usageCount: 0,
    avgExecutionTime: 0,
    lastUsed: Date.now(),
    derivedFrom: 'failure'  // 标记来源
  }
};
```

## 💻 核心代码实现

### 1. PlaybookReflector 服务

创建 `src/services/PlaybookReflector.ts`:

```typescript
import { Trajectory, ErrorType, ErrorDetails } from '../types/ace-core';
import { StrategicPlaybook } from '../types/playbook';
import { PlaybookManager } from './PlaybookManager';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * 错误模式规则定义
 */
interface ErrorPatternRule {
  error_type: ErrorType;
  keywords: string[];
  anti_pattern: string;
  solution: string;
  tags: string[];
}

/**
 * 失败模式分析结果
 */
interface FailurePattern {
  error_type: ErrorType;
  occurrences: number;
  failed_trajectories: string[];
  anti_pattern: string;
  solution: string;
  confidence: number;
}

/**
 * Playbook 反思器 - MVP 规则引擎版
 *
 * 职责:
 * - 对比成功/失败 Trajectory
 * - 识别失败模式（基于规则引擎）
 * - 生成风险规避型 Playbook
 */
export class PlaybookReflector {
  private playbookManager: PlaybookManager;

  /**
   * 硬编码的错误模式规则（MVP 版本）
   */
  private errorPatternRules: ErrorPatternRule[] = [
    {
      error_type: ErrorType.TIMEOUT,
      keywords: ['timeout', 'exceeded', 'timed out'],
      anti_pattern: '不要在单次调用中处理过多数据',
      solution: '将数据分批处理，每批不超过 100 条，添加超时限制',
      tags: ['timeout', 'batch-processing', 'performance']
    },
    {
      error_type: ErrorType.RATE_LIMIT,
      keywords: ['rate limit', '429', 'too many requests', 'quota exceeded'],
      anti_pattern: '避免短时间内频繁调用 API',
      solution: '添加速率限制器（Rate Limiter），确保请求间隔至少 1 秒',
      tags: ['rate-limit', 'throttling', 'api']
    },
    {
      error_type: ErrorType.RESOURCE_EXHAUSTED,
      keywords: ['out of memory', 'heap', 'allocation failed', 'disk full'],
      anti_pattern: '避免一次性加载大文件到内存',
      solution: '使用流式处理（Stream）或分块读取，限制内存使用',
      tags: ['resource', 'memory', 'streaming']
    },
    {
      error_type: ErrorType.NETWORK_ERROR,
      keywords: ['connection refused', 'network error', 'ECONNREFUSED'],
      anti_pattern: '未实现重试机制或错误恢复',
      solution: '添加指数退避重试（最多 3 次），检查网络连接和服务可用性',
      tags: ['network', 'retry', 'resilience']
    },
    {
      error_type: ErrorType.PERMISSION_DENIED,
      keywords: ['permission denied', 'forbidden', '403', 'unauthorized'],
      anti_pattern: 'API Key 过期或权限配置错误',
      solution: '检查 API Key 有效性，验证权限范围，刷新凭证',
      tags: ['permission', 'auth', 'security']
    }
  ];

  constructor(playbookManager: PlaybookManager) {
    this.playbookManager = playbookManager;
  }

  /**
   * 分析失败模式（主入口）
   */
  async analyzeFailurePatterns(
    successTrajectories: Trajectory[],
    failureTrajectories: Trajectory[]
  ): Promise<StrategicPlaybook[]> {
    logger.info(`[Reflector] 开始分析失败模式: ${failureTrajectories.length} 个失败案例`);

    // 1. 提取失败模式
    const patterns = this.extractFailurePatterns(failureTrajectories);

    // 2. 过滤低置信度模式（至少出现 2 次）
    const significantPatterns = patterns.filter(p => p.occurrences >= 2);

    logger.info(`[Reflector] 识别到 ${significantPatterns.length} 个显著失败模式`);

    // 3. 生成风险规避型 Playbook
    const playbooks: StrategicPlaybook[] = [];

    for (const pattern of significantPatterns) {
      try {
        const playbook = await this.generateRiskAvoidancePlaybook(pattern, failureTrajectories);
        playbooks.push(playbook);

        // 持久化到知识库
        await this.playbookManager.createPlaybook(playbook);

        logger.info(`[Reflector] 生成风险规避 Playbook: ${playbook.name}`);
      } catch (error: any) {
        logger.error(`[Reflector] 生成 Playbook 失败`, error);
      }
    }

    return playbooks;
  }

  /**
   * 提取失败模式
   */
  private extractFailurePatterns(failureTrajectories: Trajectory[]): FailurePattern[] {
    const patternMap = new Map<string, FailurePattern>();

    for (const trajectory of failureTrajectories) {
      for (const step of trajectory.steps) {
        if (step.error_details) {
          // 匹配规则
          const matchedRule = this.matchErrorRule(step.error_details);

          if (matchedRule) {
            const patternKey = `${matchedRule.error_type}`;

            if (!patternMap.has(patternKey)) {
              patternMap.set(patternKey, {
                error_type: matchedRule.error_type,
                occurrences: 0,
                failed_trajectories: [],
                anti_pattern: matchedRule.anti_pattern,
                solution: matchedRule.solution,
                confidence: 0
              });
            }

            const pattern = patternMap.get(patternKey)!;
            pattern.occurrences++;
            pattern.failed_trajectories.push(trajectory.task_id);
          }
        }
      }
    }

    // 计算置信度（基于出现次数）
    const patterns = Array.from(patternMap.values());
    patterns.forEach(pattern => {
      pattern.confidence = Math.min(pattern.occurrences / 5, 1.0);  // 5 次及以上为 100%
    });

    return patterns;
  }

  /**
   * 匹配错误规则
   */
  private matchErrorRule(errorDetails: ErrorDetails): ErrorPatternRule | null {
    // 1. 优先精确匹配 ErrorType
    for (const rule of this.errorPatternRules) {
      if (errorDetails.error_type === rule.error_type) {
        return rule;
      }
    }

    // 2. 回退到关键词匹配
    const message = errorDetails.error_message.toLowerCase();
    for (const rule of this.errorPatternRules) {
      if (rule.keywords.some(kw => message.includes(kw))) {
        return rule;
      }
    }

    return null;
  }

  /**
   * 生成风险规避型 Playbook
   */
  private async generateRiskAvoidancePlaybook(
    pattern: FailurePattern,
    allFailures: Trajectory[]
  ): Promise<StrategicPlaybook> {
    // 提取相关的工具名称
    const involvedTools = new Set<string>();
    for (const trajectoryId of pattern.failed_trajectories) {
      const trajectory = allFailures.find(t => t.task_id === trajectoryId);
      if (trajectory) {
        trajectory.steps.forEach(step => {
          if (step.tool_details?.tool_name) {
            involvedTools.add(step.tool_details.tool_name);
          }
        });
      }
    }

    // 提取场景描述（从用户输入）
    const scenarioDescriptions = pattern.failed_trajectories
      .map(id => allFailures.find(t => t.task_id === id)?.user_input)
      .filter(Boolean)
      .slice(0, 3);  // 取前 3 个

    const playbook: StrategicPlaybook = {
      id: uuidv4(),
      name: `[风险规避] ${this.getErrorTypeDisplayName(pattern.error_type)}处理模式`,
      type: 'risk_avoidance',
      tags: ['failure-derived', 'risk-avoidance', pattern.error_type],

      description: `处理 ${this.getErrorTypeDisplayName(pattern.error_type)} 错误的最佳实践（基于 ${pattern.occurrences} 次失败经验）`,

      trigger: {
        type: 'pattern',
        condition: `检测到 ${pattern.error_type} 错误`
      },

      actions: [{
        description: pattern.solution,
        action_type: 'preventive_measure',
        tool_name: undefined,
        parameters: {}
      }],

      anti_patterns: [pattern.anti_pattern],

      context: {
        scenario: scenarioDescriptions.join('; ') || '数据处理',
        domain: 'general',
        toolsInvolved: Array.from(involvedTools)
      },

      metrics: {
        successRate: 0.0,  // 初始为 0
        usageCount: 0,
        avgExecutionTime: 0,
        lastUsed: Date.now(),
        derivedFrom: 'failure' as any
      },

      status: 'active',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      sourceTrajectoryIds: pattern.failed_trajectories
    };

    return playbook;
  }

  /**
   * 获取错误类型的可读名称
   */
  private getErrorTypeDisplayName(errorType: ErrorType): string {
    const displayNames: Record<ErrorType, string> = {
      [ErrorType.TIMEOUT]: '超时',
      [ErrorType.RATE_LIMIT]: 'API限流',
      [ErrorType.RESOURCE_EXHAUSTED]: '资源耗尽',
      [ErrorType.NETWORK_ERROR]: '网络错误',
      [ErrorType.PERMISSION_DENIED]: '权限不足',
      [ErrorType.INVALID_INPUT]: '输入参数错误',
      [ErrorType.LOGIC_ERROR]: '逻辑错误',
      [ErrorType.UNKNOWN]: '未知错误'
    };

    return displayNames[errorType] || errorType;
  }

  /**
   * 🆕 第二阶段：LLM 辅助分析未匹配错误（可选）
   */
  async analyzeUnknownFailures(
    unmatchedTrajectories: Trajectory[]
  ): Promise<StrategicPlaybook[]> {
    // TODO: Stage 1.5 实现 LLM 聚类分析
    logger.info(`[Reflector] LLM 分析功能待实现（${unmatchedTrajectories.length} 个未匹配案例）`);
    return [];
  }
}
```

### 2. 集成到任务队列处理器

修改 `src/server.ts`，注册 REFLECT 任务处理器：

```typescript
// src/server.ts

import { PlaybookReflector } from './services/PlaybookReflector';
import { TaskType } from './types/task-queue';

async function bootstrap() {
  // ... existing initialization

  const playbookReflector = new PlaybookReflector(playbookManager);

  // 🆕 注册 REFLECT 任务处理器
  idleScheduler.registerHandler(TaskType.REFLECT, async (task) => {
    try {
      // 获取失败的 Trajectory
      const failureTrajectory = await getTrajectoryById(task.trajectory_id);
      if (!failureTrajectory) {
        logger.warn(`[Reflector] Trajectory 不存在: ${task.trajectory_id}`);
        return;
      }

      // 获取最近的成功案例作为对比（可选）
      const successTrajectories = await getRecentSuccessTrajectories(10);

      // 执行反思分析
      const playbooks = await playbookReflector.analyzeFailurePatterns(
        successTrajectories,
        [failureTrajectory]
      );

      logger.info(`[Reflector] 生成 ${playbooks.length} 个风险规避 Playbook`);

    } catch (error: any) {
      logger.error('[Reflector] 任务处理失败', error);
      throw error;
    }
  });

  // ... rest of the code
}
```

### 3. 辅助工具：Trajectory 查询

创建 `src/services/TrajectoryStore.ts`:

```typescript
import { Database } from 'better-sqlite3';
import { Trajectory } from '../types/ace-core';

/**
 * Trajectory 存储服务
 */
export class TrajectoryStore {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * 根据 ID 获取 Trajectory
   */
  async getById(taskId: string): Promise<Trajectory | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM trajectories WHERE task_id = ?
    `);
    const row = stmt.get(taskId) as any;

    return row ? this.mapRowToTrajectory(row) : null;
  }

  /**
   * 获取最近的成功 Trajectory
   */
  async getRecentSuccess(limit: number = 10): Promise<Trajectory[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM trajectories
      WHERE outcome = 'SUCCESS'
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];

    return rows.map(row => this.mapRowToTrajectory(row));
  }

  /**
   * 获取最近的失败 Trajectory
   */
  async getRecentFailures(limit: number = 10): Promise<Trajectory[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM trajectories
      WHERE outcome = 'FAILURE'
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];

    return rows.map(row => this.mapRowToTrajectory(row));
  }

  /**
   * 映射数据库行到 Trajectory 对象
   */
  private mapRowToTrajectory(row: any): Trajectory {
    return {
      task_id: row.task_id,
      session_id: row.session_id,
      user_input: row.user_input,
      steps: JSON.parse(row.steps),
      final_result: row.final_result,
      outcome: row.outcome,
      environment_feedback: row.environment_feedback,
      used_rule_ids: JSON.parse(row.used_rule_ids || '[]'),
      timestamp: row.timestamp,
      duration_ms: row.duration_ms,
      evolution_status: row.evolution_status
    };
  }
}
```

## 🧪 测试验收

### 测试场景

创建 `tests/playbook/stage1-reflector-mvp.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from '@jest/globals';
import { PlaybookReflector } from '../../src/services/PlaybookReflector';
import { Trajectory, ErrorType } from '../../src/types/ace-core';
import { PlaybookManager } from '../../src/services/PlaybookManager';

describe('Stage 1: Reflector MVP', () => {
  let reflector: PlaybookReflector;
  let playbookManager: PlaybookManager;

  beforeAll(() => {
    playbookManager = new PlaybookManager(/* deps */);
    reflector = new PlaybookReflector(playbookManager);
  });

  it('场景1: 识别超时失败模式并生成风险规避 Playbook', async () => {
    const failures: Trajectory[] = [
      {
        task_id: 'traj-fail-001',
        user_input: '分析 1000 条反馈',
        steps: [{
          thought: '调用 feedback-analyzer',
          action: 'call_tool: feedback-analyzer',
          tool_details: {
            tool_name: 'feedback-analyzer',
            input_params: { limit: 1000 },
            output_content: '',
            output_metadata: { execution_time_ms: 30000 }
          },
          error_details: {
            error_type: ErrorType.TIMEOUT,
            error_message: 'Timeout: tool execution exceeded 30s',
            context: { tool_name: 'feedback-analyzer', input_params: { limit: 1000 } }
          },
          duration: 30000,
          timestamp: Date.now()
        }],
        final_result: '',
        outcome: 'FAILURE',
        environment_feedback: '超时',
        used_rule_ids: [],
        timestamp: Date.now(),
        duration_ms: 30000,
        evolution_status: 'PENDING'
      },
      {
        task_id: 'traj-fail-002',
        user_input: '处理 5000 条数据',
        steps: [{
          thought: '调用 data-processor',
          action: 'call_tool: data-processor',
          error_details: {
            error_type: ErrorType.TIMEOUT,
            error_message: 'Request timeout after 30s',
            context: {}
          },
          duration: 30000,
          timestamp: Date.now()
        }],
        final_result: '',
        outcome: 'FAILURE',
        environment_feedback: '超时',
        used_rule_ids: [],
        timestamp: Date.now(),
        duration_ms: 30000,
        evolution_status: 'PENDING'
      }
    ];

    const playbooks = await reflector.analyzeFailurePatterns([], failures);

    // 验证生成风险规避 Playbook
    expect(playbooks.length).toBeGreaterThan(0);

    const timeoutPlaybook = playbooks.find(pb => pb.tags.includes('timeout'));
    expect(timeoutPlaybook).toBeDefined();
    expect(timeoutPlaybook!.type).toBe('risk_avoidance');
    expect(timeoutPlaybook!.tags).toContain('failure-derived');
    expect(timeoutPlaybook!.actions[0].description).toContain('分批处理');
    expect(timeoutPlaybook!.anti_patterns[0]).toContain('不要在单次调用中处理过多数据');
  });

  it('场景2: 识别速率限制失败模式', async () => {
    const failures: Trajectory[] = [
      {
        task_id: 'traj-fail-003',
        user_input: '批量查询用户信息',
        steps: [{
          thought: '调用 user-api',
          action: 'call_tool: user-api',
          error_details: {
            error_type: ErrorType.RATE_LIMIT,
            error_message: 'Rate limit exceeded: 429 Too Many Requests',
            context: {}
          },
          duration: 1000,
          timestamp: Date.now()
        }],
        final_result: '',
        outcome: 'FAILURE',
        environment_feedback: '速率限制',
        used_rule_ids: [],
        timestamp: Date.now(),
        duration_ms: 1000,
        evolution_status: 'PENDING'
      },
      {
        task_id: 'traj-fail-004',
        user_input: '批量发送通知',
        steps: [{
          thought: '调用 notification-api',
          action: 'call_tool: notification-api',
          error_details: {
            error_type: ErrorType.RATE_LIMIT,
            error_message: 'Too many requests',
            context: {}
          },
          duration: 500,
          timestamp: Date.now()
        }],
        final_result: '',
        outcome: 'FAILURE',
        environment_feedback: '速率限制',
        used_rule_ids: [],
        timestamp: Date.now(),
        duration_ms: 500,
        evolution_status: 'PENDING'
      }
    ];

    const playbooks = await reflector.analyzeFailurePatterns([], failures);

    const rateLimitPlaybook = playbooks.find(pb => pb.tags.includes('rate-limit'));
    expect(rateLimitPlaybook).toBeDefined();
    expect(rateLimitPlaybook!.actions[0].description).toContain('速率限制器');
  });

  it('场景3: 过滤低置信度模式（只出现 1 次）', async () => {
    const failures: Trajectory[] = [
      {
        task_id: 'traj-fail-005',
        user_input: '单次失败案例',
        steps: [{
          thought: 'test',
          action: 'test',
          error_details: {
            error_type: ErrorType.NETWORK_ERROR,
            error_message: 'Connection refused',
            context: {}
          },
          duration: 100,
          timestamp: Date.now()
        }],
        final_result: '',
        outcome: 'FAILURE',
        environment_feedback: '网络错误',
        used_rule_ids: [],
        timestamp: Date.now(),
        duration_ms: 100,
        evolution_status: 'PENDING'
      }
    ];

    const playbooks = await reflector.analyzeFailurePatterns([], failures);

    // 只出现 1 次，不应该生成 Playbook
    expect(playbooks.length).toBe(0);
  });

  it('场景4: 提取涉及的工具名称', async () => {
    const failures: Trajectory[] = [
      {
        task_id: 'traj-fail-006',
        user_input: '数据分析',
        steps: [{
          thought: 'test',
          action: 'test',
          tool_details: {
            tool_name: 'data-analyzer',
            input_params: {},
            output_content: ''
          },
          error_details: {
            error_type: ErrorType.RESOURCE_EXHAUSTED,
            error_message: 'Out of memory',
            context: {}
          },
          duration: 1000,
          timestamp: Date.now()
        }],
        final_result: '',
        outcome: 'FAILURE',
        environment_feedback: '资源耗尽',
        used_rule_ids: [],
        timestamp: Date.now(),
        duration_ms: 1000,
        evolution_status: 'PENDING'
      },
      {
        task_id: 'traj-fail-007',
        user_input: '数据处理',
        steps: [{
          thought: 'test',
          action: 'test',
          tool_details: {
            tool_name: 'data-processor',
            input_params: {},
            output_content: ''
          },
          error_details: {
            error_type: ErrorType.RESOURCE_EXHAUSTED,
            error_message: 'Heap out of memory',
            context: {}
          },
          duration: 1000,
          timestamp: Date.now()
        }],
        final_result: '',
        outcome: 'FAILURE',
        environment_feedback: '资源耗尽',
        used_rule_ids: [],
        timestamp: Date.now(),
        duration_ms: 1000,
        evolution_status: 'PENDING'
      }
    ];

    const playbooks = await reflector.analyzeFailurePatterns([], failures);

    const resourcePlaybook = playbooks.find(pb => pb.tags.includes('resource'));
    expect(resourcePlaybook).toBeDefined();
    expect(resourcePlaybook!.context.toolsInvolved).toEqual(
      expect.arrayContaining(['data-analyzer', 'data-processor'])
    );
  });
});
```

### 验收标准

| 场景 | 通过标准 |
|------|---------|
| **场景1** | 识别超时模式，生成包含"分批处理"的 Playbook |
| **场景2** | 识别速率限制模式，生成包含"速率限制器"的 Playbook |
| **场景3** | 低频错误（<2 次）不生成 Playbook |
| **场景4** | Playbook 包含涉及的工具名称列表 |

## ✅ 验收清单

- [ ] PlaybookReflector 类实现完整
- [ ] 硬编码 5 种错误模式规则
- [ ] `analyzeFailurePatterns()` 方法生成风险规避 Playbook
- [ ] 集成到任务队列 REFLECT 处理器
- [ ] 测试覆盖率 >80%
- [ ] 至少生成 1 个可用的风险规避 Playbook

## ⏱️ 时间估算

| 任务 | 预计时间 |
|------|---------|
| 定义 ErrorPatternRule 数据结构 | 30 分钟 |
| 实现 PlaybookReflector 核心逻辑 | 3 小时 |
| 实现 `extractFailurePatterns()` 方法 | 2 小时 |
| 实现 `generateRiskAvoidancePlaybook()` 方法 | 2 小时 |
| 集成到任务队列处理器 | 1 小时 |
| 创建 TrajectoryStore 辅助服务 | 1.5 小时 |
| 编写测试用例 | 3 小时 |
| 集成测试和调试 | 3 小时 |
| **总计** | **16 小时** |

## 📅 下一步

完成后，阅读 [Stage 2: Generator 升级](05-stage2-generator-upgrade.md)

**可选进阶**：实现 Stage 1.5 LLM 辅助聚类（处理 UNKNOWN 错误类型）

---

**文档版本**: v1.0
**创建日期**: 2025-12-16
