/**
 * SurrealDB Trajectory Storage Adapter
 *
 * Implements ITrajectoryStorage interface using SurrealDB as the backend.
 */

import { SurrealDBClient } from "./client";
import type { ITrajectoryStorage, TrajectoryQuery, TrajectoryStats } from "../interfaces";
import type { Trajectory as TrajectoryType } from "../../../types/trajectory";
import { logger } from "../../../utils/logger";
import { validatePagination } from "../utils";

const TABLE_TRAJECTORIES = "trajectories";

interface TrajectoryRecord {
  id: string;
  task_id: string;
  session_id: string;
  steps: string;
  outcome: "SUCCESS" | "FAILURE" | "PENDING";
  evolution_status: "PENDING" | "COMPLETED" | "FAILED";
  created_at: number;
  updated_at: number;
  [key: string]: unknown;
}

export class SurrealDBTrajectoryStorage implements ITrajectoryStorage {
  private client: SurrealDBClient;

  constructor() {
    this.client = SurrealDBClient.getInstance();
  }

  async get(id: string): Promise<TrajectoryType | null> {
    try {
      const result = await this.client.select<TrajectoryRecord>(`${TABLE_TRAJECTORIES}:${id}`);
      if (result.length === 0) {
        return null;
      }
      return this.recordToTrajectory(result[0]);
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to get trajectory:", { id, error });
      throw error;
    }
  }

  async getMany(ids: string[]): Promise<Map<string, TrajectoryType>> {
    const map = new Map<string, TrajectoryType>();
    if (ids.length === 0) {
      return map;
    }

    try {
      const placeholders = ids.map((_, i) => `$id${i}`).join(",");
      const vars: Record<string, unknown> = {};
      ids.forEach((id, i) => {
        vars[`$id${i}`] = `${TABLE_TRAJECTORIES}:${id}`;
      });

      const result = await this.client.query<TrajectoryRecord[]>(
        `SELECT * FROM ${TABLE_TRAJECTORIES} WHERE id IN [${placeholders}]`,
        vars
      );

      for (const record of result) {
        const trajectory = this.recordToTrajectory(record);
        map.set(record.id.replace(`${TABLE_TRAJECTORIES}:`, ""), trajectory);
      }

      return map;
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to get many trajectories:", { ids, error });
      throw error;
    }
  }

  async save(entity: TrajectoryType): Promise<string> {
    const record: TrajectoryRecord = {
      id: `${TABLE_TRAJECTORIES}:${entity.task_id}`,
      task_id: entity.task_id,
      session_id: entity.session_id || "",
      steps: JSON.stringify(entity.steps),
      outcome: entity.outcome,
      evolution_status: entity.evolution_status,
      created_at: entity.timestamp,
      updated_at: entity.timestamp + entity.duration_ms,
    };

    try {
      await this.client.create(TABLE_TRAJECTORIES, record);
      return entity.task_id;
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to save trajectory:", { taskId: entity.task_id, error });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.client.delete(`${TABLE_TRAJECTORIES}:${id}`);
      return true;
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to delete trajectory:", { id, error });
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
    const conditions: string[] = [];
    const vars: Record<string, unknown> = {};

    if (query.taskId) {
      conditions.push("task_id = $taskId");
      vars["taskId"] = query.taskId;
    }

    if (query.sessionId) {
      conditions.push("session_id = $sessionId");
      vars["sessionId"] = query.sessionId;
    }

    if (query.outcome) {
      conditions.push("outcome = $outcome");
      vars["outcome"] = query.outcome;
    }

    if (query.evolutionStatus) {
      conditions.push("evolution_status = $evolutionStatus");
      vars["evolutionStatus"] = query.evolutionStatus;
    }

    if (query.startTime) {
      conditions.push("created_at >= $startTime");
      vars["startTime"] = query.startTime;
    }

    if (query.endTime) {
      conditions.push("created_at <= $endTime");
      vars["endTime"] = query.endTime;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderClause = "ORDER BY created_at DESC";
    const pagination =
      query.limit !== undefined
        ? validatePagination({ limit: query.limit, defaultLimit: 0 })
        : null;
    const limitClause = pagination && pagination.limit > 0 ? `LIMIT ${pagination.limit}` : "";

    try {
      const result = await this.client.query<TrajectoryRecord[]>(
        `SELECT * FROM ${TABLE_TRAJECTORIES} ${whereClause} ${orderClause} ${limitClause}`.trim(),
        vars
      );

      return result.map((record) => this.recordToTrajectory(record));
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to find trajectories:", { query, error });
      throw error;
    }
  }

  async count(query: TrajectoryQuery): Promise<number> {
    const conditions: string[] = [];
    const vars: Record<string, unknown> = {};

    if (query.taskId) {
      conditions.push("task_id = $taskId");
      vars["taskId"] = query.taskId;
    }

    if (query.sessionId) {
      conditions.push("session_id = $sessionId");
      vars["sessionId"] = query.sessionId;
    }

    if (query.outcome) {
      conditions.push("outcome = $outcome");
      vars["outcome"] = query.outcome;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    try {
      const result = await this.client.query<{ count: number }[]>(
        `SELECT count() as count FROM ${TABLE_TRAJECTORIES} ${whereClause}`,
        vars
      );
      return result[0]?.count ?? 0;
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to count trajectories:", { query, error });
      throw error;
    }
  }

  async getByTaskId(taskId: string): Promise<TrajectoryType | null> {
    try {
      const result = await this.client.query<TrajectoryRecord[]>(
        `SELECT * FROM ${TABLE_TRAJECTORIES} WHERE task_id = $taskId LIMIT 1`,
        { taskId }
      );
      if (result.length === 0) {
        return null;
      }
      return this.recordToTrajectory(result[0]);
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to get trajectory by taskId:", { taskId, error });
      throw error;
    }
  }

  async getRecentByOutcome(
    outcome: "SUCCESS" | "FAILURE",
    limit?: number
  ): Promise<TrajectoryType[]> {
    try {
      const pagination = validatePagination({ limit: limit ?? 10, defaultLimit: 10 });
      const limitClause = pagination.limit > 0 ? `LIMIT ${pagination.limit}` : "LIMIT 10";
      const result = await this.client.query<TrajectoryRecord[]>(
        `SELECT * FROM ${TABLE_TRAJECTORIES} WHERE outcome = $outcome ORDER BY created_at DESC ${limitClause}`,
        { outcome }
      );
      return result.map((record) => this.recordToTrajectory(record));
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to get recent by outcome:", { outcome, error });
      throw error;
    }
  }

  async getStats(): Promise<TrajectoryStats> {
    try {
      const result = await this.client.query<
        {
          success: number;
          failure: number;
          pending: number;
          completed: number;
          failed: number;
          total: number;
        }[]
      >(
        `SELECT
          count() as total,
          sum(case when outcome = 'SUCCESS' then 1 else 0 end) as success,
          sum(case when outcome = 'FAILURE' then 1 else 0 end) as failure,
          sum(case when outcome = 'PENDING' then 1 else 0 end) as pending,
          sum(case when evolution_status = 'COMPLETED' then 1 else 0 end) as completed,
          sum(case when evolution_status = 'FAILED' then 1 else 0 end) as failed
        FROM ${TABLE_TRAJECTORIES}`,
        {}
      );

      const stats = result[0];
      return {
        total: stats?.total ?? 0,
        success: stats?.success ?? 0,
        failure: stats?.failure ?? 0,
        pending: stats?.pending ?? 0,
        completed: stats?.completed ?? 0,
        failed: stats?.failed ?? 0,
      };
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to get trajectory stats:", { error });
      throw error;
    }
  }

  async cleanup(olderThanDays: number): Promise<number> {
    try {
      const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
      const result = await this.client.query<{ id: string }[]>(
        `SELECT id FROM ${TABLE_TRAJECTORIES} WHERE created_at < $cutoffTime`,
        { cutoffTime }
      );
      const ids = result.map((r) => r.id.replace(`${TABLE_TRAJECTORIES}:`, ""));
      return this.deleteMany(ids);
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to cleanup trajectories:", { olderThanDays, error });
      throw error;
    }
  }

  private recordToTrajectory(record: TrajectoryRecord): TrajectoryType {
    let steps: TrajectoryType["steps"] = [];
    try {
      steps = JSON.parse(record.steps) as TrajectoryType["steps"];
    } catch {
      steps = [];
    }

    return {
      task_id: record.task_id,
      session_id: record.session_id,
      steps,
      outcome: record.outcome as "SUCCESS" | "FAILURE",
      evolution_status: record.evolution_status,
      user_input: "",
      final_result: "",
      environment_feedback: "",
      used_rule_ids: [],
      timestamp: record.created_at,
      duration_ms: record.updated_at - record.created_at,
    };
  }
}
