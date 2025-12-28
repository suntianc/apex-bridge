/**
 * PlaybookFeedbackService - Playbook 反馈服务
 * ===========================================
 *
 * 负责收集、处理和应用用户对 Playbook 的反馈，
 * 实现自动优化和权重调整的闭环机制。
 *
 * Version: 1.0.0
 * Created: 2025-12-20
 */

import Database from 'better-sqlite3';
import { logger } from '../utils/logger';

export interface PlaybookFeedback {
  playbookId: string;
  sessionId: string;
  rating: number;        // 1-5 星
  satisfaction: number;  // 0-10 分
  helpful: boolean;      // 是否有帮助
  comments?: string;     // 可选评论
  timestamp: number;
}

export interface PlaybookMetrics {
  usageCount: number;
  successRate: number;
  avgSatisfaction: number;
  lastUsed: number;
  avgExecutionTime: number;
}

export class PlaybookFeedbackService {
  private db: Database.Database;

  constructor(dbPath: string = './.data/playbook_feedback.db') {
    this.db = new Database(dbPath);
    this.initializeTables();
  }

  private initializeTables(): void {
    const createFeedbackTable = `
      CREATE TABLE IF NOT EXISTS playbook_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playbook_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        satisfaction REAL NOT NULL CHECK (satisfaction >= 0 AND satisfaction <= 10),
        helpful INTEGER NOT NULL CHECK (helpful IN (0, 1)),
        comments TEXT,
        timestamp INTEGER NOT NULL
      )
    `;

    const createMetricsTable = `
      CREATE TABLE IF NOT EXISTS playbook_metrics (
        playbook_id TEXT PRIMARY KEY,
        usage_count INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        avg_satisfaction REAL DEFAULT 0,
        last_used INTEGER DEFAULT 0,
        avg_execution_time REAL DEFAULT 0,
        feedback_count INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT 0
      )
    `;

    this.db.exec(createFeedbackTable);
    this.db.exec(createMetricsTable);

    logger.debug('[PlaybookFeedbackService] Tables initialized');
  }

  /**
   * 记录用户反馈
   */
  async recordFeedback(feedback: PlaybookFeedback): Promise<void> {
    try {
      // 1. 存储反馈
      const insertFeedback = this.db.prepare(`
        INSERT INTO playbook_feedback
        (playbook_id, session_id, rating, satisfaction, helpful, comments, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      insertFeedback.run(
        feedback.playbookId,
        feedback.sessionId,
        feedback.rating,
        feedback.satisfaction,
        feedback.helpful ? 1 : 0,
        feedback.comments || null,
        feedback.timestamp
      );

      // 2. 更新指标
      await this.updatePlaybookMetrics(feedback.playbookId);

      logger.info('[PlaybookFeedbackService] Feedback recorded', {
        playbookId: feedback.playbookId,
        rating: feedback.rating,
        satisfaction: feedback.satisfaction
      });

    } catch (error) {
      logger.error('[PlaybookFeedbackService] Failed to record feedback', error);
      throw error;
    }
  }

  /**
   * 更新 Playbook 指标
   */
  private async updatePlaybookMetrics(playbookId: string): Promise<void> {
    // 获取所有反馈
    const feedbacks = this.db.prepare(`
      SELECT * FROM playbook_feedback WHERE playbook_id = ?
    `).all(playbookId) as PlaybookFeedback[];

    if (feedbacks.length === 0) {
      return;
    }

    // 计算新指标
    const usageCount = feedbacks.length;
    const helpfulCount = feedbacks.filter(f => f.helpful).length;
    const successRate = helpfulCount / usageCount;
    const avgSatisfaction = feedbacks.reduce((sum, f) => sum + f.satisfaction, 0) / usageCount;
    const lastUsed = Math.max(...feedbacks.map(f => f.timestamp));

    // 更新或插入指标
    const upsertMetrics = this.db.prepare(`
      INSERT INTO playbook_metrics
      (playbook_id, usage_count, success_count, failure_count, avg_satisfaction, last_used, feedback_count, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(playbook_id) DO UPDATE SET
        usage_count = excluded.usage_count,
        success_count = excluded.success_count,
        failure_count = excluded.failure_count,
        avg_satisfaction = excluded.avg_satisfaction,
        last_used = excluded.last_used,
        feedback_count = excluded.feedback_count,
        updated_at = excluded.updated_at
    `);

    const failureCount = usageCount - helpfulCount;
    upsertMetrics.run(
      playbookId,
      usageCount,
      helpfulCount,
      failureCount,
      avgSatisfaction,
      lastUsed,
      usageCount,
      Date.now()
    );

    logger.debug('[PlaybookFeedbackService] Metrics updated', {
      playbookId,
      usageCount,
      successRate: (successRate * 100).toFixed(1) + '%',
      avgSatisfaction: avgSatisfaction.toFixed(1)
    });
  }

  /**
   * 获取 Playbook 指标
   */
  getPlaybookMetrics(playbookId: string): PlaybookMetrics | null {
    const row = this.db.prepare(`
      SELECT * FROM playbook_metrics WHERE playbook_id = ?
    `).get(playbookId) as any;

    if (!row) {
      return null;
    }

    return {
      usageCount: row.usage_count,
      successRate: row.usage_count > 0 ? row.success_count / row.usage_count : 0,
      avgSatisfaction: row.avg_satisfaction,
      lastUsed: row.last_used,
      avgExecutionTime: row.avg_execution_time
    };
  }

  /**
   * 计算性能调整后的匹配分数
   */
  calculateAdjustedScore(
    baseScore: number,
    playbookId: string,
    usageCount: number
  ): number {
    const metrics = this.getPlaybookMetrics(playbookId);

    if (!metrics || metrics.usageCount < 5) {
      // 反馈数据不足，使用基础分数
      return baseScore;
    }

    let adjustedScore = baseScore;

    // 如果使用次数 > 10 且成功率 < 0.5，降权 50%
    if (usageCount > 10 && metrics.successRate < 0.5) {
      logger.info(`[PlaybookFeedbackService] Playbook ${playbookId} 成功率过低，强制降权`, {
        successRate: (metrics.successRate * 100).toFixed(1) + '%',
        adjustment: 0.5
      });
      adjustedScore *= 0.5;
    }

    // 如果满意度 < 6/10，降权 30%
    if (metrics.avgSatisfaction < 6) {
      adjustedScore *= 0.7;
    }

    return adjustedScore;
  }

  /**
   * 查找需要优化的低效 Playbook
   */
  findUnderperformingPlaybooks(options: {
    minUsageCount?: number;
    maxSuccessRate?: number;
    daysUnused?: number;
  } = {}): Array<{ playbookId: string; metrics: PlaybookMetrics; reason: string }> {
    const { minUsageCount = 10, maxSuccessRate = 0.5, daysUnused = 90 } = options;
    const cutoffTime = Date.now() - (daysUnused * 24 * 60 * 60 * 1000);

    const rows = this.db.prepare(`
      SELECT * FROM playbook_metrics
      WHERE usage_count >= ?
        AND success_count / usage_count <= ?
        AND last_used < ?
    `).all(minUsageCount, maxSuccessRate, cutoffTime) as any[];

    return rows.map(row => ({
      playbookId: row.playbook_id,
      metrics: {
        usageCount: row.usage_count,
        successRate: row.success_count / row.usage_count,
        avgSatisfaction: row.avg_satisfaction,
        lastUsed: row.last_used,
        avgExecutionTime: row.avg_execution_time
      },
      reason: `使用${row.usage_count}次，成功率${((row.success_count / row.usage_count) * 100).toFixed(1)}%，满意度${row.avg_satisfaction.toFixed(1)}`
    }));
  }

  /**
   * 生成反馈统计报告
   */
  generateFeedbackReport(playbookId: string): {
    totalFeedback: number;
    successRate: number;
    avgSatisfaction: number;
    ratingDistribution: Record<number, number>;
  } {
    const feedbacks = this.db.prepare(`
      SELECT rating, satisfaction, helpful FROM playbook_feedback
      WHERE playbook_id = ?
      ORDER BY timestamp DESC
    `).all(playbookId) as any[];

    const totalFeedback = feedbacks.length;
    const helpfulCount = feedbacks.filter(f => f.helpful).length;
    const successRate = totalFeedback > 0 ? helpfulCount / totalFeedback : 0;
    const avgSatisfaction = totalFeedback > 0
      ? feedbacks.reduce((sum, f) => sum + f.satisfaction, 0) / totalFeedback
      : 0;

    const ratingDistribution = feedbacks.reduce((dist, f) => {
      dist[f.rating] = (dist[f.rating] || 0) + 1;
      return dist;
    }, {} as Record<number, number>);

    return {
      totalFeedback,
      successRate,
      avgSatisfaction,
      ratingDistribution
    };
  }
}
