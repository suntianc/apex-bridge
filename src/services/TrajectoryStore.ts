/**
 * Trajectory 存储服务
 * 负责 Trajectory 的 SurrealDB 数据库操作
 */

import type { ITrajectoryStorage, TrajectoryStats } from "../core/storage/interfaces";
import type { Trajectory } from "../types/trajectory";
import { StorageAdapterFactory } from "../core/storage/adapter-factory";
import { logger } from "../utils/logger";

export class TrajectoryStore {
  private static instance: TrajectoryStore;
  private storage: ITrajectoryStorage;

  private constructor() {
    this.storage = StorageAdapterFactory.getTrajectoryStorage();
    logger.debug("[TrajectoryStore] Initialized with StorageAdapterFactory");
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
   * 根据 ID 获取 Trajectory
   */
  async getById(taskId: string): Promise<Trajectory | null> {
    return await this.storage.getByTaskId(taskId);
  }

  /**
   * 获取最近的成功 Trajectory
   */
  async getRecentSuccess(limit: number = 10): Promise<Trajectory[]> {
    return await this.storage.getRecentByOutcome("SUCCESS", limit);
  }

  /**
   * 获取最近的失败 Trajectory
   */
  async getRecentFailures(limit: number = 10): Promise<Trajectory[]> {
    return await this.storage.getRecentByOutcome("FAILURE", limit);
  }

  /**
   * 保存 Trajectory
   */
  async save(trajectory: Trajectory): Promise<void> {
    await this.storage.save(trajectory);
    logger.debug(`[TrajectoryStore] Saved trajectory: ${trajectory.task_id}`);
  }

  /**
   * 批量保存 Trajectory
   */
  async saveBatch(trajectories: Trajectory[]): Promise<void> {
    for (const trajectory of trajectories) {
      await this.save(trajectory);
    }
    logger.debug(`[TrajectoryStore] Batch saved ${trajectories.length} trajectories`);
  }

  /**
   * 删除 Trajectory
   */
  async delete(taskId: string): Promise<void> {
    await this.storage.delete(taskId);
    logger.debug(`[TrajectoryStore] Deleted trajectory: ${taskId}`);
  }

  /**
   * 获取轨迹统计信息
   */
  async getStats(): Promise<TrajectoryStats> {
    return await this.storage.getStats();
  }

  /**
   * 清理过期数据
   */
  async cleanup(olderThanDays: number = 30): Promise<number> {
    const count = await this.storage.cleanup(olderThanDays);
    logger.info(
      `[TrajectoryStore] Cleaned up ${count} trajectories older than ${olderThanDays} days`
    );
    return count;
  }
}
