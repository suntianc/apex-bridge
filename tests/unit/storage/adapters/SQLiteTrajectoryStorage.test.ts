/**
 * SQLiteTrajectoryStorage Adapter Test Suite
 *
 * Tests that the SQLiteTrajectoryStorage adapter correctly implements
 * the ITrajectoryStorage interface using direct database operations.
 */

import type {
  ITrajectoryStorage,
  TrajectoryQuery,
  TrajectoryStats,
} from "@/core/storage/interfaces";
import type { Trajectory } from "@/types/trajectory";
import Database from "better-sqlite3";
import { SQLiteTrajectoryStorage } from "@/core/storage/sqlite/trajectory";

describe("SQLiteTrajectoryStorage", () => {
  let storage: SQLiteTrajectoryStorage;
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    db.exec(`
      CREATE TABLE trajectories (
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

      CREATE INDEX idx_trajectories_outcome ON trajectories(outcome);
      CREATE INDEX idx_trajectories_timestamp ON trajectories(timestamp);
      CREATE INDEX idx_trajectories_session_id ON trajectories(session_id);
    `);

    storage = new SQLiteTrajectoryStorage();
    (storage as any).db = db;
  });

  afterEach(() => {
    db.close();
  });

  describe("Constructor", () => {
    it("should create instance without error", () => {
      expect(storage).toBeDefined();
      expect(storage).toBeInstanceOf(SQLiteTrajectoryStorage);
    });
  });

  describe("get", () => {
    it("should return trajectory when exists", async () => {
      const trajectory: Trajectory = {
        task_id: "task-1",
        session_id: "session-1",
        user_input: "Test input",
        steps: [],
        final_result: "Test result",
        outcome: "SUCCESS",
        environment_feedback: "",
        used_rule_ids: [],
        timestamp: Date.now(),
        duration_ms: 100,
        evolution_status: "PENDING",
      };

      await storage.save(trajectory);

      const result = await storage.get("task-1");

      expect(result).not.toBeNull();
      expect(result?.task_id).toBe("task-1");
      expect(result?.outcome).toBe("SUCCESS");
    });

    it("should return null when trajectory not exists", async () => {
      const result = await storage.get("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getMany", () => {
    it("should return trajectories map for valid IDs", async () => {
      const trajectories: Trajectory[] = [
        {
          task_id: "task-1",
          session_id: "session-1",
          user_input: "Test 1",
          steps: [],
          final_result: "Result 1",
          outcome: "SUCCESS",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 100,
          evolution_status: "PENDING",
        },
        {
          task_id: "task-2",
          session_id: "session-1",
          user_input: "Test 2",
          steps: [],
          final_result: "Result 2",
          outcome: "FAILURE",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 100,
          evolution_status: "PENDING",
        },
      ];

      await storage.save(trajectories[0]);
      await storage.save(trajectories[1]);

      const result = await storage.getMany(["task-1", "task-2"]);

      expect(result.size).toBe(2);
      expect(result.get("task-1")?.outcome).toBe("SUCCESS");
      expect(result.get("task-2")?.outcome).toBe("FAILURE");
    });

    it("should return empty map for empty IDs", async () => {
      const result = await storage.getMany([]);

      expect(result.size).toBe(0);
    });

    it("should skip trajectories that do not exist", async () => {
      const trajectory: Trajectory = {
        task_id: "task-1",
        session_id: "session-1",
        user_input: "Test",
        steps: [],
        final_result: "Result",
        outcome: "SUCCESS",
        environment_feedback: "",
        used_rule_ids: [],
        timestamp: Date.now(),
        duration_ms: 100,
        evolution_status: "PENDING",
      };

      await storage.save(trajectory);

      const result = await storage.getMany(["task-1", "task-2"]);

      expect(result.size).toBe(1);
      expect(result.has("task-1")).toBe(true);
      expect(result.has("task-2")).toBe(false);
    });
  });

  describe("save", () => {
    it("should save trajectory", async () => {
      const trajectory: Trajectory = {
        task_id: "task-1",
        session_id: "session-1",
        user_input: "Test",
        steps: [],
        final_result: "Result",
        outcome: "SUCCESS",
        environment_feedback: "",
        used_rule_ids: [],
        timestamp: Date.now(),
        duration_ms: 100,
        evolution_status: "PENDING",
      };

      const result = await storage.save(trajectory);

      expect(result).toBe("task-1");

      const saved = await storage.get("task-1");
      expect(saved).not.toBeNull();
      expect(saved?.task_id).toBe("task-1");
    });
  });

  describe("delete", () => {
    it("should return true when delete succeeds", async () => {
      const trajectory: Trajectory = {
        task_id: "task-1",
        session_id: "session-1",
        user_input: "Test",
        steps: [],
        final_result: "Result",
        outcome: "SUCCESS",
        environment_feedback: "",
        used_rule_ids: [],
        timestamp: Date.now(),
        duration_ms: 100,
        evolution_status: "PENDING",
      };

      await storage.save(trajectory);

      const result = await storage.delete("task-1");

      expect(result).toBe(true);

      const saved = await storage.get("task-1");
      expect(saved).toBeNull();
    });

    it("should always return true when delete is called", async () => {
      const result = await storage.delete("nonexistent");

      expect(result).toBe(true);
    });
  });

  describe("deleteMany", () => {
    it("should delete multiple trajectories", async () => {
      const trajectories: Trajectory[] = [
        {
          task_id: "task-1",
          session_id: "s1",
          user_input: "Test1",
          steps: [],
          final_result: "R1",
          outcome: "SUCCESS",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 100,
          evolution_status: "PENDING",
        },
        {
          task_id: "task-2",
          session_id: "s1",
          user_input: "Test2",
          steps: [],
          final_result: "R2",
          outcome: "SUCCESS",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 100,
          evolution_status: "PENDING",
        },
        {
          task_id: "task-3",
          session_id: "s1",
          user_input: "Test3",
          steps: [],
          final_result: "R3",
          outcome: "SUCCESS",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 100,
          evolution_status: "PENDING",
        },
      ];

      await storage.save(trajectories[0]);
      await storage.save(trajectories[1]);
      await storage.save(trajectories[2]);

      const result = await storage.deleteMany(["task-1", "task-2", "task-3"]);

      expect(result).toBe(3);

      const count = await storage.count({});
      expect(count).toBe(0);
    });

    it("should return 0 for empty IDs", async () => {
      const trajectory: Trajectory = {
        task_id: "task-1",
        session_id: "session-1",
        user_input: "Test",
        steps: [],
        final_result: "Result",
        outcome: "SUCCESS",
        environment_feedback: "",
        used_rule_ids: [],
        timestamp: Date.now(),
        duration_ms: 100,
        evolution_status: "PENDING",
      };

      await storage.save(trajectory);

      const result = await storage.deleteMany([]);

      expect(result).toBe(0);
    });
  });

  describe("find", () => {
    it("should find success trajectories", async () => {
      const trajectories: Trajectory[] = [
        {
          task_id: "task-1",
          session_id: "session-1",
          user_input: "Test",
          steps: [],
          final_result: "Result",
          outcome: "SUCCESS",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 100,
          evolution_status: "PENDING",
        },
      ];

      await storage.save(trajectories[0]);

      const result = await storage.find({ outcome: "SUCCESS" });

      expect(result).toHaveLength(1);
      expect(result[0].outcome).toBe("SUCCESS");
    });

    it("should find failure trajectories", async () => {
      const trajectories: Trajectory[] = [
        {
          task_id: "task-2",
          session_id: "session-1",
          user_input: "Test",
          steps: [],
          final_result: "Result",
          outcome: "FAILURE",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 100,
          evolution_status: "PENDING",
        },
      ];

      await storage.save(trajectories[0]);

      const result = await storage.find({ outcome: "FAILURE" });

      expect(result).toHaveLength(1);
      expect(result[0].outcome).toBe("FAILURE");
    });

    it("should apply sessionId filter", async () => {
      const trajectories: Trajectory[] = [
        {
          task_id: "task-1",
          session_id: "session-1",
          user_input: "Test",
          steps: [],
          final_result: "Result",
          outcome: "SUCCESS",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 100,
          evolution_status: "PENDING",
        },
        {
          task_id: "task-2",
          session_id: "session-2",
          user_input: "Test",
          steps: [],
          final_result: "Result",
          outcome: "SUCCESS",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 100,
          evolution_status: "PENDING",
        },
      ];

      await storage.save(trajectories[0]);
      await storage.save(trajectories[1]);

      const result = await storage.find({ outcome: "SUCCESS", sessionId: "session-1" });

      expect(result).toHaveLength(1);
      expect(result[0].session_id).toBe("session-1");
    });

    it("should apply evolutionStatus filter", async () => {
      const trajectories: Trajectory[] = [
        {
          task_id: "task-1",
          session_id: "session-1",
          user_input: "Test",
          steps: [],
          final_result: "Result",
          outcome: "SUCCESS",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 100,
          evolution_status: "COMPLETED",
        },
      ];

      await storage.save(trajectories[0]);

      const result = await storage.find({ outcome: "SUCCESS", evolutionStatus: "COMPLETED" });

      expect(result).toHaveLength(1);
      expect(result[0].evolution_status).toBe("COMPLETED");
    });

    it("should apply limit", async () => {
      for (let i = 0; i < 15; i++) {
        await storage.save({
          task_id: `task-${i}`,
          session_id: "session-1",
          user_input: "Test",
          steps: [],
          final_result: "Result",
          outcome: "SUCCESS",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 100,
          evolution_status: "PENDING",
        });
      }

      const result = await storage.find({ outcome: "SUCCESS", limit: 5 });

      expect(result).toHaveLength(5);
    });
  });

  describe("count", () => {
    it("should count success trajectories", async () => {
      const trajectories: Trajectory[] = [
        {
          task_id: "t1",
          session_id: "s1",
          user_input: "",
          steps: [],
          final_result: "",
          outcome: "SUCCESS",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 0,
          evolution_status: "PENDING",
        },
        {
          task_id: "t2",
          session_id: "s1",
          user_input: "",
          steps: [],
          final_result: "",
          outcome: "SUCCESS",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 0,
          evolution_status: "PENDING",
        },
      ];

      await storage.save(trajectories[0]);
      await storage.save(trajectories[1]);

      const result = await storage.count({ outcome: "SUCCESS" });

      expect(result).toBe(2);
    });

    it("should count failure trajectories", async () => {
      const trajectories: Trajectory[] = [
        {
          task_id: "t1",
          session_id: "s1",
          user_input: "",
          steps: [],
          final_result: "",
          outcome: "FAILURE",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 0,
          evolution_status: "PENDING",
        },
      ];

      await storage.save(trajectories[0]);

      const result = await storage.count({ outcome: "FAILURE" });

      expect(result).toBe(1);
    });

    it("should count all trajectories when no outcome filter", async () => {
      const trajectories: Trajectory[] = [
        {
          task_id: "t1",
          session_id: "s1",
          user_input: "",
          steps: [],
          final_result: "",
          outcome: "SUCCESS",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 0,
          evolution_status: "PENDING",
        },
        {
          task_id: "t2",
          session_id: "s1",
          user_input: "",
          steps: [],
          final_result: "",
          outcome: "FAILURE",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 0,
          evolution_status: "PENDING",
        },
      ];

      await storage.save(trajectories[0]);
      await storage.save(trajectories[1]);

      const result = await storage.count({});

      expect(result).toBe(2);
    });
  });

  describe("getByTaskId", () => {
    it("should return trajectory by task ID", async () => {
      const trajectory: Trajectory = {
        task_id: "task-1",
        session_id: "session-1",
        user_input: "Test",
        steps: [],
        final_result: "Result",
        outcome: "SUCCESS",
        environment_feedback: "",
        used_rule_ids: [],
        timestamp: Date.now(),
        duration_ms: 100,
        evolution_status: "PENDING",
      };

      await storage.save(trajectory);

      const result = await storage.getByTaskId("task-1");

      expect(result).not.toBeNull();
      expect(result?.task_id).toBe("task-1");
    });

    it("should return null when not found", async () => {
      const result = await storage.getByTaskId("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getRecentByOutcome", () => {
    it("should return recent success trajectories", async () => {
      const trajectories: Trajectory[] = [
        {
          task_id: "task-1",
          session_id: "session-1",
          user_input: "Test",
          steps: [],
          final_result: "Result",
          outcome: "SUCCESS",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 100,
          evolution_status: "PENDING",
        },
      ];

      await storage.save(trajectories[0]);

      const result = await storage.getRecentByOutcome("SUCCESS", 10);

      expect(result).toHaveLength(1);
      expect(result[0].outcome).toBe("SUCCESS");
    });

    it("should return recent failure trajectories", async () => {
      const trajectories: Trajectory[] = [
        {
          task_id: "task-2",
          session_id: "session-1",
          user_input: "Test",
          steps: [],
          final_result: "Result",
          outcome: "FAILURE",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 100,
          evolution_status: "PENDING",
        },
      ];

      await storage.save(trajectories[0]);

      const result = await storage.getRecentByOutcome("FAILURE", 10);

      expect(result).toHaveLength(1);
      expect(result[0].outcome).toBe("FAILURE");
    });

    it("should use default limit", async () => {
      for (let i = 0; i < 15; i++) {
        await storage.save({
          task_id: `task-${i}`,
          session_id: "session-1",
          user_input: "Test",
          steps: [],
          final_result: "Result",
          outcome: "SUCCESS",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 100,
          evolution_status: "PENDING",
        });
      }

      const result = await storage.getRecentByOutcome("SUCCESS");

      expect(result.length).toBeLessThanOrEqual(10);
    });
  });

  describe("getStats", () => {
    it("should return trajectory stats", async () => {
      const trajectories: Trajectory[] = [
        {
          task_id: "t1",
          session_id: "s1",
          user_input: "",
          steps: [],
          final_result: "",
          outcome: "SUCCESS",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 0,
          evolution_status: "PENDING",
        },
        {
          task_id: "t2",
          session_id: "s1",
          user_input: "",
          steps: [],
          final_result: "",
          outcome: "SUCCESS",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 0,
          evolution_status: "PENDING",
        },
        {
          task_id: "t3",
          session_id: "s1",
          user_input: "",
          steps: [],
          final_result: "",
          outcome: "FAILURE",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 0,
          evolution_status: "PENDING",
        },
      ];

      await storage.save(trajectories[0]);
      await storage.save(trajectories[1]);
      await storage.save(trajectories[2]);

      const result = await storage.getStats();

      expect(result.total).toBe(3);
      expect(result.success).toBe(2);
      expect(result.failure).toBe(1);
      expect(result.pending).toBe(0);
      expect(result.completed).toBe(0);
      expect(result.failed).toBe(0);
    });

    it("should return zeros for empty database", async () => {
      const result = await storage.getStats();

      expect(result.total).toBe(0);
      expect(result.success).toBe(0);
      expect(result.failure).toBe(0);
    });
  });

  describe("cleanup", () => {
    it("should cleanup old trajectories", async () => {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const trajectories: Trajectory[] = [
        {
          task_id: "t1",
          session_id: "s1",
          user_input: "",
          steps: [],
          final_result: "",
          outcome: "SUCCESS",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: now - 30 * dayMs,
          duration_ms: 0,
          evolution_status: "PENDING",
        },
        {
          task_id: "t2",
          session_id: "s1",
          user_input: "",
          steps: [],
          final_result: "",
          outcome: "SUCCESS",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: now - 25 * dayMs,
          duration_ms: 0,
          evolution_status: "PENDING",
        },
        {
          task_id: "t3",
          session_id: "s1",
          user_input: "",
          steps: [],
          final_result: "",
          outcome: "SUCCESS",
          environment_feedback: "",
          used_rule_ids: [],
          timestamp: now,
          duration_ms: 0,
          evolution_status: "PENDING",
        },
      ];

      await storage.save(trajectories[0]);
      await storage.save(trajectories[1]);
      await storage.save(trajectories[2]);

      const result = await storage.cleanup(20);

      expect(result).toBe(2);

      const remaining = await storage.getMany(["t1", "t2", "t3"]);
      expect(remaining.size).toBe(1);
      expect(remaining.has("t3")).toBe(true);
    });

    it("should return 0 when no trajectories to cleanup", async () => {
      const trajectory: Trajectory = {
        task_id: "t1",
        session_id: "s1",
        user_input: "",
        steps: [],
        final_result: "",
        outcome: "SUCCESS",
        environment_feedback: "",
        used_rule_ids: [],
        timestamp: Date.now(),
        duration_ms: 0,
        evolution_status: "PENDING",
      };

      await storage.save(trajectory);

      const result = await storage.cleanup(30);

      expect(result).toBe(0);
    });
  });

  describe("Interface Compliance", () => {
    it("should implement ITrajectoryStorage interface", () => {
      const storageMethods: (keyof ITrajectoryStorage)[] = [
        "get",
        "getMany",
        "save",
        "delete",
        "deleteMany",
        "find",
        "count",
        "getByTaskId",
        "getRecentByOutcome",
        "getStats",
        "cleanup",
      ];

      for (const method of storageMethods) {
        expect(typeof storage[method]).toBe("function");
      }
    });
  });
});
