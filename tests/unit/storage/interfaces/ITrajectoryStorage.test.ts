/**
 * ITrajectoryStorage Interface Test Suite
 *
 * Tests that the ITrajectoryStorage interface is properly defined
 * and can be implemented by various storage adapters.
 */

import type {
  ITrajectoryStorage,
  TrajectoryQuery,
  TrajectoryStats,
} from "@/core/storage/interfaces";
import type { Trajectory } from "@/types/trajectory";

describe("ITrajectoryStorage Interface", () => {
  describe("Type Definition", () => {
    it("should be a valid interface type", () => {
      const storage: ITrajectoryStorage = {
        get: jest.fn(),
        getMany: jest.fn(),
        save: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        find: jest.fn(),
        count: jest.fn(),
        getByTaskId: jest.fn(),
        getRecentByOutcome: jest.fn(),
        getStats: jest.fn(),
        cleanup: jest.fn(),
      };

      expect(storage).toBeDefined();
      expect(typeof storage.get).toBe("function");
      expect(typeof storage.getMany).toBe("function");
      expect(typeof storage.save).toBe("function");
      expect(typeof storage.delete).toBe("function");
      expect(typeof storage.deleteMany).toBe("function");
      expect(typeof storage.find).toBe("function");
      expect(typeof storage.count).toBe("function");
      expect(typeof storage.getByTaskId).toBe("function");
      expect(typeof storage.getRecentByOutcome).toBe("function");
      expect(typeof storage.getStats).toBe("function");
      expect(typeof storage.cleanup).toBe("function");
    });
  });

  describe("Base Storage Methods", () => {
    let storage: ITrajectoryStorage;

    beforeEach(() => {
      storage = {
        get: jest.fn().mockResolvedValue(null),
        getMany: jest.fn().mockResolvedValue(new Map()),
        save: jest.fn().mockResolvedValue("task-1"),
        delete: jest.fn().mockResolvedValue(true),
        deleteMany: jest.fn().mockResolvedValue(0),
        find: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        getByTaskId: jest.fn().mockResolvedValue(null),
        getRecentByOutcome: jest.fn().mockResolvedValue([]),
        getStats: jest.fn().mockResolvedValue({
          total: 0,
          success: 0,
          failure: 0,
          pending: 0,
          completed: 0,
          failed: 0,
        }),
        cleanup: jest.fn().mockResolvedValue(0),
      };
    });

    it("should implement get method", async () => {
      const mockTrajectory: Trajectory = {
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

      (storage.get as jest.Mock).mockResolvedValue(mockTrajectory);

      const result = await storage.get("task-1");

      expect(storage.get).toHaveBeenCalledWith("task-1");
      expect(result).toEqual(mockTrajectory);
    });

    it("should implement getMany method", async () => {
      const trajectories = new Map<string, Trajectory>();
      trajectories.set("task-1", {
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
      });

      (storage.getMany as jest.Mock).mockResolvedValue(trajectories);

      const result = await storage.getMany(["task-1"]);

      expect(storage.getMany).toHaveBeenCalledWith(["task-1"]);
      expect(result).toBe(trajectories);
    });

    it("should implement save method", async () => {
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

      (storage.save as jest.Mock).mockResolvedValue("task-1");

      const result = await storage.save(trajectory);

      expect(storage.save).toHaveBeenCalledWith(trajectory);
      expect(result).toBe("task-1");
    });

    it("should implement delete method", async () => {
      (storage.delete as jest.Mock).mockResolvedValue(true);

      const result = await storage.delete("task-1");

      expect(storage.delete).toHaveBeenCalledWith("task-1");
      expect(result).toBe(true);
    });

    it("should implement deleteMany method", async () => {
      (storage.deleteMany as jest.Mock).mockResolvedValue(2);

      const result = await storage.deleteMany(["task-1", "task-2"]);

      expect(storage.deleteMany).toHaveBeenCalledWith(["task-1", "task-2"]);
      expect(result).toBe(2);
    });

    it("should implement find method", async () => {
      const trajectories: Trajectory[] = [];
      (storage.find as jest.Mock).mockResolvedValue(trajectories);

      const query: TrajectoryQuery = { outcome: "SUCCESS" };
      const result = await storage.find(query);

      expect(storage.find).toHaveBeenCalledWith(query);
      expect(result).toEqual(trajectories);
    });

    it("should implement count method", async () => {
      (storage.count as jest.Mock).mockResolvedValue(5);

      const query: TrajectoryQuery = { outcome: "SUCCESS" };
      const result = await storage.count(query);

      expect(storage.count).toHaveBeenCalledWith(query);
      expect(result).toBe(5);
    });
  });

  describe("Trajectory Specific Methods", () => {
    let storage: ITrajectoryStorage;

    beforeEach(() => {
      storage = {
        get: jest.fn(),
        getMany: jest.fn(),
        save: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        find: jest.fn(),
        count: jest.fn(),
        getByTaskId: jest.fn(),
        getRecentByOutcome: jest.fn(),
        getStats: jest.fn(),
        cleanup: jest.fn(),
      };
    });

    it("should implement getByTaskId method", async () => {
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

      (storage.getByTaskId as jest.Mock).mockResolvedValue(trajectory);

      const result = await storage.getByTaskId("task-1");

      expect(storage.getByTaskId).toHaveBeenCalledWith("task-1");
      expect(result).toEqual(trajectory);
    });

    it("should return null for non-existent task", async () => {
      (storage.getByTaskId as jest.Mock).mockResolvedValue(null);

      const result = await storage.getByTaskId("nonexistent");

      expect(result).toBeNull();
    });

    it("should implement getRecentByOutcome method for SUCCESS", async () => {
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
      ];

      (storage.getRecentByOutcome as jest.Mock).mockResolvedValue(trajectories);

      const result = await storage.getRecentByOutcome("SUCCESS", 10);

      expect(storage.getRecentByOutcome).toHaveBeenCalledWith("SUCCESS", 10);
      expect(result).toEqual(trajectories);
    });

    it("should implement getRecentByOutcome method for FAILURE", async () => {
      const trajectories: Trajectory[] = [
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

      (storage.getRecentByOutcome as jest.Mock).mockResolvedValue(trajectories);

      const result = await storage.getRecentByOutcome("FAILURE", 10);

      expect(storage.getRecentByOutcome).toHaveBeenCalledWith("FAILURE", 10);
      expect(result).toEqual(trajectories);
    });

    it("should use default limit for getRecentByOutcome", async () => {
      (storage.getRecentByOutcome as jest.Mock).mockResolvedValue([]);

      await storage.getRecentByOutcome("SUCCESS");

      expect(storage.getRecentByOutcome).toHaveBeenCalled();
      expect((storage.getRecentByOutcome as jest.Mock).mock.calls[0][0]).toBe("SUCCESS");
    });

    it("should implement getStats method", async () => {
      const stats: TrajectoryStats = {
        total: 100,
        success: 80,
        failure: 20,
        pending: 0,
        completed: 0,
        failed: 0,
      };

      (storage.getStats as jest.Mock).mockResolvedValue(stats);

      const result = await storage.getStats();

      expect(storage.getStats).toHaveBeenCalled();
      expect(result).toEqual(stats);
    });

    it("should implement cleanup method", async () => {
      (storage.cleanup as jest.Mock).mockResolvedValue(50);

      const result = await storage.cleanup(30);

      expect(storage.cleanup).toHaveBeenCalledWith(30);
      expect(result).toBe(50);
    });
  });

  describe("Error Handling", () => {
    let storage: ITrajectoryStorage;

    beforeEach(() => {
      storage = {
        get: jest.fn().mockRejectedValue(new Error("Database error")),
        getMany: jest.fn().mockRejectedValue(new Error("Database error")),
        save: jest.fn().mockRejectedValue(new Error("Database error")),
        delete: jest.fn().mockRejectedValue(new Error("Database error")),
        deleteMany: jest.fn().mockRejectedValue(new Error("Database error")),
        find: jest.fn().mockRejectedValue(new Error("Database error")),
        count: jest.fn().mockRejectedValue(new Error("Database error")),
        getByTaskId: jest.fn().mockRejectedValue(new Error("Database error")),
        getRecentByOutcome: jest.fn().mockRejectedValue(new Error("Database error")),
        getStats: jest.fn().mockRejectedValue(new Error("Database error")),
        cleanup: jest.fn().mockRejectedValue(new Error("Database error")),
      };
    });

    it("should handle get errors", async () => {
      await expect(storage.get("task-1")).rejects.toThrow("Database error");
    });

    it("should handle save errors", async () => {
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

      await expect(storage.save(trajectory)).rejects.toThrow("Database error");
    });

    it("should handle delete errors", async () => {
      await expect(storage.delete("task-1")).rejects.toThrow("Database error");
    });

    it("should handle find errors", async () => {
      await expect(storage.find({})).rejects.toThrow("Database error");
    });

    it("should handle count errors", async () => {
      await expect(storage.count({})).rejects.toThrow("Database error");
    });

    it("should handle getByTaskId errors", async () => {
      await expect(storage.getByTaskId("task-1")).rejects.toThrow("Database error");
    });

    it("should handle getRecentByOutcome errors", async () => {
      await expect(storage.getRecentByOutcome("SUCCESS")).rejects.toThrow("Database error");
    });

    it("should handle getStats errors", async () => {
      await expect(storage.getStats()).rejects.toThrow("Database error");
    });

    it("should handle cleanup errors", async () => {
      await expect(storage.cleanup(30)).rejects.toThrow("Database error");
    });
  });

  describe("Query Interface", () => {
    it("should accept valid query parameters", () => {
      const validQuery: TrajectoryQuery = {
        taskId: "task-1",
        sessionId: "session-1",
        outcome: "SUCCESS",
        evolutionStatus: "COMPLETED",
        startTime: 1000000000000,
        endTime: 2000000000000,
        limit: 10,
      };

      expect(validQuery.taskId).toBe("task-1");
      expect(validQuery.sessionId).toBe("session-1");
      expect(validQuery.outcome).toBe("SUCCESS");
      expect(validQuery.evolutionStatus).toBe("COMPLETED");
      expect(validQuery.startTime).toBe(1000000000000);
      expect(validQuery.endTime).toBe(2000000000000);
      expect(validQuery.limit).toBe(10);
    });

    it("should accept empty query", () => {
      const emptyQuery: TrajectoryQuery = {};

      expect(emptyQuery).toEqual({});
    });

    it("should accept partial query", () => {
      const partialQuery: TrajectoryQuery = {
        outcome: "FAILURE",
      };

      expect(partialQuery.outcome).toBe("FAILURE");
    });

    it("should accept all outcome types", () => {
      const successQuery: TrajectoryQuery = { outcome: "SUCCESS" };
      const failureQuery: TrajectoryQuery = { outcome: "FAILURE" };

      expect(successQuery.outcome).toBe("SUCCESS");
      expect(failureQuery.outcome).toBe("FAILURE");
    });

    it("should accept all evolution status types", () => {
      const pendingQuery: TrajectoryQuery = { evolutionStatus: "PENDING" };
      const completedQuery: TrajectoryQuery = { evolutionStatus: "COMPLETED" };
      const failedQuery: TrajectoryQuery = { evolutionStatus: "FAILED" };

      expect(pendingQuery.evolutionStatus).toBe("PENDING");
      expect(completedQuery.evolutionStatus).toBe("COMPLETED");
      expect(failedQuery.evolutionStatus).toBe("FAILED");
    });
  });

  describe("TrajectoryStats Structure", () => {
    it("should have correct structure", () => {
      const stats: TrajectoryStats = {
        total: 100,
        success: 80,
        failure: 20,
        pending: 5,
        completed: 3,
        failed: 2,
      };

      expect(stats.total).toBe(100);
      expect(stats.success).toBe(80);
      expect(stats.failure).toBe(20);
      expect(stats.pending).toBe(5);
      expect(stats.completed).toBe(3);
      expect(stats.failed).toBe(2);
    });

    it("should handle zero values", () => {
      const stats: TrajectoryStats = {
        total: 0,
        success: 0,
        failure: 0,
        pending: 0,
        completed: 0,
        failed: 0,
      };

      expect(stats.total).toBe(0);
      expect(stats.success).toBe(0);
    });
  });

  describe("Trajectory Structure", () => {
    it("should have correct structure", () => {
      const trajectory: Trajectory = {
        task_id: "task-123",
        session_id: "session-456",
        user_input: "Calculate 2+2",
        steps: [
          {
            thought: "I need to add 2 and 2",
            action: "math.add",
            output: "4",
            duration: 50,
            timestamp: Date.now(),
          },
        ],
        final_result: "4",
        outcome: "SUCCESS",
        environment_feedback: "",
        used_rule_ids: ["rule-1", "rule-2"],
        timestamp: Date.now(),
        duration_ms: 100,
        evolution_status: "COMPLETED",
      };

      expect(trajectory.task_id).toBe("task-123");
      expect(trajectory.session_id).toBe("session-456");
      expect(trajectory.user_input).toBe("Calculate 2+2");
      expect(trajectory.steps).toHaveLength(1);
      expect(trajectory.outcome).toBe("SUCCESS");
      expect(trajectory.evolution_status).toBe("COMPLETED");
    });

    it("should allow optional session_id", () => {
      const trajectory: Trajectory = {
        task_id: "task-123",
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

      expect(trajectory.session_id).toBeUndefined();
    });
  });
});
