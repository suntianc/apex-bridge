/**
 * SQLite Trajectory Storage Adapter
 *
 * Implements ITrajectoryStorage interface using better-sqlite3.
 * This is the concrete implementation that TrajectoryStore depends on.
 */

import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import type { ITrajectoryStorage, TrajectoryQuery, TrajectoryStats } from "../interfaces";
import type { Trajectory as TrajectoryType } from "../../../types/trajectory";
import { logger } from "../../../utils/logger";
import { PathService } from "../../../services/PathService";

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

interface CountRow {
  count: number;
}

export class SQLiteTrajectoryStorage implements ITrajectoryStorage {
  private db: Database.Database;
  private dbPath: string;

  constructor() {
    const pathService = PathService.getInstance();
    const dataDir = pathService.getDataDir();

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = path.join(dataDir, "trajectories.db");
    this.db = new Database(this.dbPath);

    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    this.initializeDatabase();
    logger.debug(`SQLiteTrajectoryStorage initialized (database: ${this.dbPath})`);
  }

  private initializeDatabase(): void {
    this.db.exec(`
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

      CREATE INDEX IF NOT EXISTS idx_trajectories_outcome ON trajectories(outcome);
      CREATE INDEX IF NOT EXISTS idx_trajectories_timestamp ON trajectories(timestamp);
      CREATE INDEX IF NOT EXISTS idx_trajectories_session_id ON trajectories(session_id);
    `);

    logger.debug("[TrajectoryStore] Database tables initialized");
  }

  private mapRowToTrajectory(row: TrajectoryRow): TrajectoryType {
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

  async get(id: string): Promise<TrajectoryType | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM trajectories WHERE task_id = ?
      `);
      const row = stmt.get(id) as TrajectoryRow | undefined;

      return row ? this.mapRowToTrajectory(row) : null;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to get trajectory:", { id, error });
      throw error;
    }
  }

  async getMany(ids: string[]): Promise<Map<string, TrajectoryType>> {
    const map = new Map<string, TrajectoryType>();
    if (ids.length === 0) {
      return map;
    }

    try {
      for (const id of ids) {
        const trajectory = await this.get(id);
        if (trajectory) {
          map.set(id, trajectory);
        }
      }
      return map;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to get many trajectories:", { ids, error });
      throw error;
    }
  }

  async save(entity: TrajectoryType): Promise<string> {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO trajectories (
          task_id, session_id, user_input, steps, final_result,
          outcome, environment_feedback, used_rule_ids, timestamp,
          duration_ms, evolution_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        entity.task_id,
        entity.session_id,
        entity.user_input,
        JSON.stringify(entity.steps),
        entity.final_result,
        entity.outcome,
        entity.environment_feedback,
        JSON.stringify(entity.used_rule_ids),
        entity.timestamp,
        entity.duration_ms,
        entity.evolution_status
      );

      return entity.task_id;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to save trajectory:", { taskId: entity.task_id, error });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM trajectories WHERE task_id = ?
      `);
      stmt.run(id);
      return true;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to delete trajectory:", { id, error });
      return false;
    }
  }

  async deleteMany(ids: string[]): Promise<number> {
    let deleted = 0;
    for (const id of ids) {
      if (await this.delete(id)) {
        deleted++;
      }
    }
    return deleted;
  }

  async find(query: TrajectoryQuery): Promise<TrajectoryType[]> {
    try {
      const trajectories: TrajectoryType[] = [];

      if (query.outcome === "SUCCESS") {
        const success = await this.getRecentByOutcome("SUCCESS", query.limit || 10);
        trajectories.push(...success);
      } else if (query.outcome === "FAILURE") {
        const failures = await this.getRecentByOutcome("FAILURE", query.limit || 10);
        trajectories.push(...failures);
      }

      let result = trajectories;

      if (query.sessionId) {
        result = result.filter((t) => t.session_id === query.sessionId);
      }

      if (query.evolutionStatus) {
        result = result.filter((t) => t.evolution_status === query.evolutionStatus);
      }

      if (query.startTime) {
        result = result.filter((t) => t.timestamp >= query.startTime!);
      }

      if (query.endTime) {
        result = result.filter((t) => t.timestamp <= query.endTime!);
      }

      return result;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to find trajectories:", { query, error });
      throw error;
    }
  }

  async count(query: TrajectoryQuery): Promise<number> {
    try {
      const trajectories: TrajectoryType[] = [];

      if (query.outcome === "SUCCESS") {
        const success = await this.getRecentByOutcome("SUCCESS", 1000);
        trajectories.push(...success);
      } else if (query.outcome === "FAILURE") {
        const failures = await this.getRecentByOutcome("FAILURE", 1000);
        trajectories.push(...failures);
      } else {
        const success = await this.getRecentByOutcome("SUCCESS", 1000);
        const failures = await this.getRecentByOutcome("FAILURE", 1000);
        trajectories.push(...success, ...failures);
      }

      let count = trajectories.length;

      if (query.sessionId) {
        count = trajectories.filter((t) => t.session_id === query.sessionId).length;
      }

      if (query.evolutionStatus) {
        count = trajectories.filter((t) => t.evolution_status === query.evolutionStatus).length;
      }

      return count;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to count trajectories:", { query, error });
      throw error;
    }
  }

  async getByTaskId(taskId: string): Promise<TrajectoryType | null> {
    return await this.get(taskId);
  }

  async getRecentByOutcome(
    outcome: "SUCCESS" | "FAILURE",
    limit?: number
  ): Promise<TrajectoryType[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM trajectories
        WHERE outcome = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `);
      const rows = stmt.all(outcome, limit || 10) as TrajectoryRow[];

      return rows.map((row) => this.mapRowToTrajectory(row));
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to get recent by outcome:", { outcome, error });
      throw error;
    }
  }

  async getStats(): Promise<TrajectoryStats> {
    try {
      const totalStmt = this.db.prepare("SELECT COUNT(*) as count FROM trajectories");
      const successStmt = this.db.prepare(
        "SELECT COUNT(*) as count FROM trajectories WHERE outcome = 'SUCCESS'"
      );
      const failureStmt = this.db.prepare(
        "SELECT COUNT(*) as count FROM trajectories WHERE outcome = 'FAILURE'"
      );

      const total = totalStmt.get() as CountRow;
      const success = successStmt.get() as CountRow;
      const failure = failureStmt.get() as CountRow;

      return {
        total: total.count,
        success: success.count,
        failure: failure.count,
        pending: 0,
        completed: 0,
        failed: 0,
      };
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to get trajectory stats:", { error });
      throw error;
    }
  }

  async cleanup(olderThanDays: number): Promise<number> {
    try {
      const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
      const stmt = this.db.prepare(`
        DELETE FROM trajectories WHERE timestamp < ?
      `);
      const result = stmt.run(cutoffTime);

      logger.info(
        `[SQLite] Cleaned up ${result.changes} trajectories older than ${olderThanDays} days`
      );
      return result.changes;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to cleanup trajectories:", { olderThanDays, error });
      throw error;
    }
  }

  close(): void {
    this.db.close();
    logger.info("✅ SQLiteTrajectoryStorage database closed");
  }
}
