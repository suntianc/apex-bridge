/**
 * Dual-Write Adapter Tests
 */

import {
  DualWriteAdapter,
  DualWriteQueryableAdapter,
  DualWriteMCPConfigAdapter,
  DualWriteTrajectoryAdapter,
  parseEnvBool,
} from "@/core/storage/dual-write";
import type {
  IStorageAdapter,
  IQueryableStorage,
  IMCPConfigStorage,
  ITrajectoryStorage,
  MCPServerRecord,
  Trajectory,
} from "@/core/storage/interfaces";
import type { MCPServerConfig } from "@/types/mcp";
import { logger } from "@/utils/logger";

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

describe("DualWriteAdapter", () => {
  interface TestRecord {
    id: string;
    data: string;
  }

  let primaryMock: jest.Mocked<IStorageAdapter<TestRecord>>;
  let secondaryMock: jest.Mocked<IStorageAdapter<TestRecord>>;

  beforeEach(() => {
    primaryMock = {
      get: jest.fn(),
      getMany: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    };
    secondaryMock = {
      get: jest.fn(),
      getMany: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    };
  });

  describe("get", () => {
    it("should read from primary only", async () => {
      const mockRecord: TestRecord = { id: "test-1", data: "test" };
      primaryMock.get.mockResolvedValue(mockRecord);

      const adapter = new DualWriteAdapter<TestRecord>(primaryMock, secondaryMock, "TestDomain");
      const result = await adapter.get("test-1");

      expect(result).toEqual(mockRecord);
      expect(primaryMock.get).toHaveBeenCalledWith("test-1");
      expect(secondaryMock.get).not.toHaveBeenCalled();
    });

    it("should return null when primary returns null", async () => {
      primaryMock.get.mockResolvedValue(null);

      const adapter = new DualWriteAdapter<TestRecord>(primaryMock, secondaryMock, "TestDomain");
      const result = await adapter.get("test-1");

      expect(result).toBeNull();
    });
  });

  describe("getMany", () => {
    it("should read from primary only", async () => {
      const mockMap = new Map<string, TestRecord>([
        ["test-1", { id: "test-1", data: "test1" }],
        ["test-2", { id: "test-2", data: "test2" }],
      ]);
      primaryMock.getMany.mockResolvedValue(mockMap);

      const adapter = new DualWriteAdapter<TestRecord>(primaryMock, secondaryMock, "TestDomain");
      const result = await adapter.getMany(["test-1", "test-2"]);

      expect(result).toEqual(mockMap);
      expect(primaryMock.getMany).toHaveBeenCalledWith(["test-1", "test-2"]);
      expect(secondaryMock.getMany).not.toHaveBeenCalled();
    });
  });

  describe("save", () => {
    it("should write to both primary and secondary", async () => {
      const entity: TestRecord = { id: "test-1", data: "test" };
      primaryMock.save.mockResolvedValue("test-1");
      secondaryMock.save.mockResolvedValue("test-1");

      const adapter = new DualWriteAdapter<TestRecord>(primaryMock, secondaryMock, "TestDomain");
      const result = await adapter.save(entity);

      expect(result).toBe("test-1");
      expect(primaryMock.save).toHaveBeenCalledWith(entity);
      expect(secondaryMock.save).toHaveBeenCalledWith(entity);
    });

    it("should succeed even if secondary write fails", async () => {
      const entity: TestRecord = { id: "test-1", data: "test" };
      primaryMock.save.mockResolvedValue("test-1");
      secondaryMock.save.mockRejectedValue(new Error("Secondary write failed"));

      const adapter = new DualWriteAdapter<TestRecord>(primaryMock, secondaryMock, "TestDomain");
      const result = await adapter.save(entity);

      expect(result).toBe("test-1");
      expect(primaryMock.save).toHaveBeenCalledWith(entity);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(logger.error).toHaveBeenCalled();
    });

    it("should block if primary write fails", async () => {
      const entity: TestRecord = { id: "test-1", data: "test" };
      primaryMock.save.mockRejectedValue(new Error("Primary write failed"));

      const adapter = new DualWriteAdapter<TestRecord>(primaryMock, secondaryMock, "TestDomain");

      await expect(adapter.save(entity)).rejects.toThrow("Primary write failed");
      expect(secondaryMock.save).not.toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    it("should delete from both primary and secondary", async () => {
      primaryMock.delete.mockResolvedValue(true);
      secondaryMock.delete.mockResolvedValue(true);

      const adapter = new DualWriteAdapter<TestRecord>(primaryMock, secondaryMock, "TestDomain");
      const result = await adapter.delete("test-1");

      expect(result).toBe(true);
      expect(primaryMock.delete).toHaveBeenCalledWith("test-1");
      expect(secondaryMock.delete).toHaveBeenCalledWith("test-1");
    });

    it("should succeed even if secondary delete fails", async () => {
      primaryMock.delete.mockResolvedValue(true);
      secondaryMock.delete.mockRejectedValue(new Error("Secondary delete failed"));

      const adapter = new DualWriteAdapter<TestRecord>(primaryMock, secondaryMock, "TestDomain");
      const result = await adapter.delete("test-1");

      expect(result).toBe(true);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("deleteMany", () => {
    it("should delete from both primary and secondary", async () => {
      primaryMock.deleteMany.mockResolvedValue(2);
      secondaryMock.deleteMany.mockResolvedValue(2);

      const adapter = new DualWriteAdapter<TestRecord>(primaryMock, secondaryMock, "TestDomain");
      const result = await adapter.deleteMany(["test-1", "test-2"]);

      expect(result).toBe(2);
      expect(primaryMock.deleteMany).toHaveBeenCalledWith(["test-1", "test-2"]);
      expect(secondaryMock.deleteMany).toHaveBeenCalledWith(["test-1", "test-2"]);
    });
  });
});

describe("DualWriteQueryableAdapter", () => {
  interface TestRecord {
    id: string;
    data: string;
  }

  type TestQuery = Record<string, unknown>;

  let primaryMock: jest.Mocked<IQueryableStorage<TestRecord, TestQuery>>;
  let secondaryMock: jest.Mocked<IQueryableStorage<TestRecord, TestQuery>>;

  beforeEach(() => {
    primaryMock = {
      get: jest.fn(),
      getMany: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
    };
    secondaryMock = {
      get: jest.fn(),
      getMany: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
    };
  });

  describe("find", () => {
    it("should query from primary only", async () => {
      const mockResults: TestRecord[] = [
        { id: "test-1", data: "test1" },
        { id: "test-2", data: "test2" },
      ];
      primaryMock.find.mockResolvedValue(mockResults);

      const adapter = new DualWriteQueryableAdapter<TestRecord, TestQuery>(
        primaryMock,
        secondaryMock,
        "TestDomain"
      );
      const result = await adapter.find({});

      expect(result).toEqual(mockResults);
      expect(primaryMock.find).toHaveBeenCalledWith({});
      expect(secondaryMock.find).not.toHaveBeenCalled();
    });
  });

  describe("count", () => {
    it("should count from primary only", async () => {
      primaryMock.count.mockResolvedValue(10);

      const adapter = new DualWriteQueryableAdapter<TestRecord, TestQuery>(
        primaryMock,
        secondaryMock,
        "TestDomain"
      );
      const result = await adapter.count({});

      expect(result).toBe(10);
      expect(primaryMock.count).toHaveBeenCalledWith({});
      expect(secondaryMock.count).not.toHaveBeenCalled();
    });
  });
});

describe("DualWriteMCPConfigAdapter", () => {
  let primaryMock: jest.Mocked<IMCPConfigStorage>;
  let secondaryMock: jest.Mocked<IMCPConfigStorage>;

  beforeEach(() => {
    primaryMock = {
      get: jest.fn(),
      getMany: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      getByServerId: jest.fn(),
      getEnabledServers: jest.fn(),
      exists: jest.fn(),
      upsertServer: jest.fn(),
    };
    secondaryMock = {
      get: jest.fn(),
      getMany: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      getByServerId: jest.fn(),
      getEnabledServers: jest.fn(),
      exists: jest.fn(),
      upsertServer: jest.fn(),
    };
  });

  describe("getByServerId", () => {
    it("should delegate to primary", async () => {
      const mockConfig: MCPServerConfig = {
        id: "server-1",
        type: "stdio",
        command: "echo",
        args: ["test"],
      };
      const mockRecord: MCPServerRecord = {
        id: "server-1",
        config: mockConfig,
        enabled: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      primaryMock.getByServerId.mockResolvedValue(mockRecord);

      const adapter = new DualWriteMCPConfigAdapter(primaryMock, secondaryMock);
      const result = await adapter.getByServerId("server-1");

      expect(result).toEqual(mockRecord);
      expect(primaryMock.getByServerId).toHaveBeenCalledWith("server-1");
    });
  });

  describe("getEnabledServers", () => {
    it("should delegate to primary", async () => {
      const mockConfig: MCPServerConfig = {
        id: "server-1",
        type: "stdio",
        command: "echo",
        args: ["test"],
      };
      const mockRecords: MCPServerRecord[] = [
        {
          id: "server-1",
          config: mockConfig,
          enabled: 1,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ];
      primaryMock.getEnabledServers.mockResolvedValue(mockRecords);

      const adapter = new DualWriteMCPConfigAdapter(primaryMock, secondaryMock);
      const result = await adapter.getEnabledServers();

      expect(result).toEqual(mockRecords);
      expect(primaryMock.getEnabledServers).toHaveBeenCalled();
    });
  });

  describe("exists", () => {
    it("should delegate to primary", async () => {
      primaryMock.exists.mockResolvedValue(true);

      const adapter = new DualWriteMCPConfigAdapter(primaryMock, secondaryMock);
      const result = await adapter.exists("server-1");

      expect(result).toBe(true);
      expect(primaryMock.exists).toHaveBeenCalledWith("server-1");
    });
  });
});

describe("DualWriteTrajectoryAdapter", () => {
  let primaryMock: jest.Mocked<ITrajectoryStorage>;
  let secondaryMock: jest.Mocked<ITrajectoryStorage>;

  beforeEach(() => {
    primaryMock = {
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
    secondaryMock = {
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

  describe("getByTaskId", () => {
    it("should delegate to primary", async () => {
      const mockTrajectory: Trajectory = {
        task_id: "task-1",
        session_id: "session-1",
        user_input: "test input",
        steps: [],
        outcome: "SUCCESS",
        final_result: "test result",
        environment_feedback: null,
        used_rule_ids: [],
        timestamp: Date.now(),
        duration_ms: 1000,
        evolution_status: "PENDING",
      };
      primaryMock.getByTaskId.mockResolvedValue(mockTrajectory);

      const adapter = new DualWriteTrajectoryAdapter(primaryMock, secondaryMock);
      const result = await adapter.getByTaskId("task-1");

      expect(result).toEqual(mockTrajectory);
      expect(primaryMock.getByTaskId).toHaveBeenCalledWith("task-1");
    });
  });

  describe("getRecentByOutcome", () => {
    it("should delegate to primary", async () => {
      const mockTrajectories: Trajectory[] = [
        {
          task_id: "task-1",
          session_id: "session-1",
          user_input: "test input",
          steps: [],
          outcome: "SUCCESS",
          final_result: "test result",
          environment_feedback: null,
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 1000,
          evolution_status: "PENDING",
        },
      ];
      primaryMock.getRecentByOutcome.mockResolvedValue(mockTrajectories);

      const adapter = new DualWriteTrajectoryAdapter(primaryMock, secondaryMock);
      const result = await adapter.getRecentByOutcome("SUCCESS", 10);

      expect(result).toEqual(mockTrajectories);
      expect(primaryMock.getRecentByOutcome).toHaveBeenCalledWith("SUCCESS", 10);
    });
  });

  describe("getStats", () => {
    it("should delegate to primary", async () => {
      const mockStats = {
        total: 100,
        success: 80,
        failure: 20,
        pending: 0,
        completed: 0,
        failed: 0,
      };
      primaryMock.getStats.mockResolvedValue(mockStats);

      const adapter = new DualWriteTrajectoryAdapter(primaryMock, secondaryMock);
      const result = await adapter.getStats();

      expect(result).toEqual(mockStats);
      expect(primaryMock.getStats).toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("should delegate to primary", async () => {
      primaryMock.cleanup.mockResolvedValue(5);

      const adapter = new DualWriteTrajectoryAdapter(primaryMock, secondaryMock);
      const result = await adapter.cleanup(30);

      expect(result).toBe(5);
      expect(primaryMock.cleanup).toHaveBeenCalledWith(30);
    });
  });
});

describe("parseEnvBool", () => {
  it("should return default value for undefined", () => {
    expect(parseEnvBool(undefined, true)).toBe(true);
    expect(parseEnvBool(undefined, false)).toBe(false);
  });

  it("should return default value for empty string", () => {
    expect(parseEnvBool("", true)).toBe(true);
    expect(parseEnvBool("", false)).toBe(false);
  });

  it("should parse true values", () => {
    expect(parseEnvBool("true", false)).toBe(true);
    expect(parseEnvBool("True", false)).toBe(true);
    expect(parseEnvBool("TRUE", false)).toBe(true);
    expect(parseEnvBool("1", false)).toBe(true);
  });

  it("should parse false values", () => {
    expect(parseEnvBool("false", true)).toBe(false);
    expect(parseEnvBool("False", true)).toBe(false);
    expect(parseEnvBool("0", true)).toBe(false);
    expect(parseEnvBool("abc", true)).toBe(false);
  });
});
