/**
 * Trajectory 存储服务
 * 负责 Trajectory 的 SQLite 数据库操作
 */

import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import { Trajectory } from "../types/trajectory";
import { PathService } from "./PathService";
import { logger } from "../utils/logger";

/**
 * Database row type for trajectory queries
 */
interface TrajectoryRow {
  task_id: string;
  session_id: string | null;
  user_input: string;
  steps: string;
  final_result: string | null;
  outcome: string;
  environment_feedback: string | null;
  used_rule_ids: string;
  timestamp: number;
  duration_ms: number;
  evolution_status: string;
}

/**
 * Database row type for count queries
 */
interface CountRow {
  count: number;
}

export class TrajectoryStore {
  private static instance: TrajectoryStore;
  private db: Database.Database;
  private dbPath: string;

  private constructor() {
    const pathService = PathService.getInstance();
    const dataDir = pathService.getDataDir();

    // 确保数据目录存在
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = path.join(dataDir, "trajectories.db");
    this.db = new Database(this.dbPath);

    // 启用 WAL 模式提升性能
    this.db.pragma("journal_mode = WAL");
    // 启用外键约束
    this.db.pragma("foreign_keys = ON");

    this.initializeDatabase();
    logger.debug(`TrajectoryStore initialized (database: ${this.dbPath})`);
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): TrajectoryStore {
    if (!TrajectoryStore.instance) {
      TrajectoryStore.instance = new TrajectoryStore();
    }
    return TrajectoryStore.instance;
  }

  /**
   * 初始化数据库表结构
   */
  private initializeDatabase(): void {
    this.db.exec(`
      -- Trajectory 表
      CREATE TABLE IF NOT EXISTS trajectories (
        task_id TEXT PRIMARY KEY,
        session_id TEXT,
        user_input TEXT NOT NULL,
        steps TEXT NOT NULL,
        final_result TEXT,
        outcome TEXT NOT NULL CHECK(outcome IN ('SUCCESS', 'FAILURE')),
        environment_feedback TEXT,
        used_rule_ids TEXT,
        timestamp INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        evolution_status TEXT NOT NULL CHECK(evolution_status IN ('PENDING', 'COMPLETED', 'FAILED'))
      );

      -- 创建索引以提升查询性能
      CREATE INDEX IF NOT EXISTS idx_trajectories_outcome ON trajectories(outcome);
      CREATE INDEX IF NOT EXISTS idx_trajectories_timestamp ON trajectories(timestamp);
      CREATE INDEX IF NOT EXISTS idx_trajectories_session_id ON trajectories(session_id);
    `);

    logger.debug("[TrajectoryStore] Database tables initialized");
  }

  /**
   * 根据 ID 获取 Trajectory
   */
  async getById(taskId: string): Promise<Trajectory | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM trajectories WHERE task_id = ?
    `);
    const row = stmt.get(taskId) as TrajectoryRow | undefined;

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
    const rows = stmt.all(limit) as TrajectoryRow[];

    return rows.map((row) => this.mapRowToTrajectory(row));
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
    const rows = stmt.all(limit) as TrajectoryRow[];

    return rows.map((row) => this.mapRowToTrajectory(row));
  }

  /**
   * 保存 Trajectory
   */
  async save(trajectory: Trajectory): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO trajectories (
        task_id, session_id, user_input, steps, final_result,
        outcome, environment_feedback, used_rule_ids, timestamp,
        duration_ms, evolution_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      trajectory.task_id,
      trajectory.session_id,
      trajectory.user_input,
      JSON.stringify(trajectory.steps),
      trajectory.final_result,
      trajectory.outcome,
      trajectory.environment_feedback,
      JSON.stringify(trajectory.used_rule_ids),
      trajectory.timestamp,
      trajectory.duration_ms,
      trajectory.evolution_status
    );

    logger.debug(`[TrajectoryStore] Saved trajectory: ${trajectory.task_id}`);
  }

  /**
   * 批量保存 Trajectory
   */
  async saveBatch(trajectories: Trajectory[]): Promise<void> {
    const transaction = this.db.transaction((trajs: Trajectory[]) => {
      for (const trajectory of trajs) {
        this.save(trajectory);
      }
    });

    transaction(trajectories);
    logger.debug(`[TrajectoryStore] Batch saved ${trajectories.length} trajectories`);
  }

  /**
   * 删除 Trajectory
   */
  async delete(taskId: string): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM trajectories WHERE task_id = ?
    `);
    stmt.run(taskId);

    logger.debug(`[TrajectoryStore] Deleted trajectory: ${taskId}`);
  }

  /**
   * 获取轨迹统计信息
   */
  getStats(): {
    total: number;
    success: number;
    failure: number;
    pending: number;
    completed: number;
    failed: number;
  } {
    const totalStmt = this.db.prepare("SELECT COUNT(*) as count FROM trajectories");
    const successStmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM trajectories WHERE outcome = 'SUCCESS'"
    );
    const failureStmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM trajectories WHERE outcome = 'FAILURE'"
    );
    const pendingStmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM trajectories WHERE evolution_status = 'PENDING'"
    );
    const completedStmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM trajectories WHERE evolution_status = 'COMPLETED'"
    );
    const failedStmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM trajectories WHERE evolution_status = 'FAILED'"
    );

    const total = totalStmt.get() as CountRow;
    const success = successStmt.get() as CountRow;
    const failure = failureStmt.get() as CountRow;
    const pending = pendingStmt.get() as CountRow;
    const completed = completedStmt.get() as CountRow;
    const failed = failedStmt.get() as CountRow;

    return {
      total: total.count,
      success: success.count,
      failure: failure.count,
      pending: pending.count,
      completed: completed.count,
      failed: failed.count,
    };
  }

  /**
   * 映射数据库行到 Trajectory 对象
   */
  private mapRowToTrajectory(row: TrajectoryRow): Trajectory {
    return {
      task_id: row.task_id,
      session_id: row.session_id,
      user_input: row.user_input,
      steps: JSON.parse(row.steps),
      final_result: row.final_result,
      outcome: row.outcome as "SUCCESS" | "FAILURE",
      environment_feedback: row.environment_feedback,
      used_rule_ids: JSON.parse(row.used_rule_ids || "[]"),
      timestamp: row.timestamp,
      duration_ms: row.duration_ms,
      evolution_status: row.evolution_status as "PENDING" | "COMPLETED" | "FAILED",
    };
  }

  /**
   * 清理过期数据
   */
  async cleanup(olderThanDays: number = 30): Promise<number> {
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const stmt = this.db.prepare(`
      DELETE FROM trajectories WHERE timestamp < ?
    `);
    const result = stmt.run(cutoffTime);

    logger.info(
      `[TrajectoryStore] Cleaned up ${result.changes} trajectories older than ${olderThanDays} days`
    );
    return result.changes;
  }
}
