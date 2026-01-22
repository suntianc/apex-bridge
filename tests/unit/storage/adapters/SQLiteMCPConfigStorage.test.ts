/**
 * SQLiteMCPConfigStorage Adapter Test Suite
 *
 * Tests that the SQLiteMCPConfigStorage adapter correctly implements
 * the IMCPConfigStorage interface.
 */

import { vi } from "vitest";

import type { IMCPConfigStorage, MCPConfigQuery, MCPServerRecord } from "@/core/storage/interfaces";
import type { MCPServerConfig } from "@/types/mcp";

vi.mock("@/services/MCPConfigService", () => ({
  MCPConfigService: {
    getInstance: vi.fn(() => mockService),
  },
}));

const mockService = {
  getServer: vi.fn(),
  getAllServers: vi.fn(),
  saveServer: vi.fn(),
  deleteServer: vi.fn(),
};

import { SQLiteMCPConfigStorage } from "@/core/storage/sqlite/mcp-config";

describe("SQLiteMCPConfigStorage", () => {
  let storage: SQLiteMCPConfigStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new SQLiteMCPConfigStorage();
  });

  describe("Constructor", () => {
    it("should create instance without error", () => {
      expect(storage).toBeDefined();
      expect(storage).toBeInstanceOf(SQLiteMCPConfigStorage);
    });
  });

  describe("get", () => {
    it("should return record when server exists", async () => {
      const server = {
        id: "server-1",
        config: {
          id: "server-1",
          type: "stdio" as const,
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
        },
        created_at: 1000000000000,
        updated_at: 1000000000000,
      };

      mockService.getServer.mockReturnValue(server);

      const result = await storage.get("server-1");

      expect(mockService.getServer).toHaveBeenCalledWith("server-1");
      expect(result).toEqual({
        id: "server-1",
        config: server.config,
        enabled: 1,
        created_at: 1000000000000,
        updated_at: 1000000000000,
      });
    });

    it("should return null when server not exists", async () => {
      mockService.getServer.mockReturnValue(undefined);

      const result = await storage.get("nonexistent");

      expect(result).toBeNull();
    });

    it("should handle service errors", async () => {
      mockService.getServer.mockImplementation(() => {
        throw new Error("Database error");
      });

      await expect(storage.get("server-1")).rejects.toThrow("Database error");
    });
  });

  describe("getMany", () => {
    it("should return servers map for valid IDs", async () => {
      const servers = [
        {
          id: "server-1",
          config: {
            id: "server-1",
            type: "stdio" as const,
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
          },
          created_at: 1000000000000,
          updated_at: 1000000000000,
        },
        {
          id: "server-2",
          config: {
            id: "server-2",
            type: "sse" as const,
            command: "python",
            args: ["server.py"],
          },
          created_at: 1000000000001,
          updated_at: 1000000000001,
        },
      ];

      mockService.getAllServers.mockReturnValue(servers);

      const result = await storage.getMany(["server-1", "server-2"]);

      expect(result.size).toBe(2);
      expect(result.get("server-1")?.id).toBe("server-1");
      expect(result.get("server-2")?.id).toBe("server-2");
    });

    it("should return empty map for empty IDs", async () => {
      const result = await storage.getMany([]);

      expect(result.size).toBe(0);
      expect(mockService.getAllServers).not.toHaveBeenCalled();
    });

    it("should handle service errors", async () => {
      mockService.getAllServers.mockImplementation(() => {
        throw new Error("Database error");
      });

      await expect(storage.getMany(["server-1"])).rejects.toThrow("Database error");
    });
  });

  describe("save", () => {
    it("should save server record", async () => {
      const record: MCPServerRecord = {
        id: "server-1",
        config: {
          id: "server-1",
          type: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
        },
        enabled: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      mockService.saveServer.mockReturnValue(undefined);

      const result = await storage.save(record);

      expect(mockService.saveServer).toHaveBeenCalledWith(record.config);
      expect(result).toBe("server-1");
    });

    it("should handle service errors", async () => {
      const record: MCPServerRecord = {
        id: "server-1",
        config: {
          id: "server-1",
          type: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
        },
        enabled: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      mockService.saveServer.mockImplementation(() => {
        throw new Error("Database error");
      });

      await expect(storage.save(record)).rejects.toThrow("Database error");
    });
  });

  describe("delete", () => {
    it("should return true when delete succeeds", async () => {
      mockService.deleteServer.mockReturnValue(undefined);

      const result = await storage.delete("server-1");

      expect(mockService.deleteServer).toHaveBeenCalledWith("server-1");
      expect(result).toBe(true);
    });

    it("should return false when delete fails", async () => {
      mockService.deleteServer.mockImplementation(() => {
        throw new Error("Database error");
      });

      const result = await storage.delete("server-1");

      expect(result).toBe(false);
    });
  });

  describe("deleteMany", () => {
    it("should delete multiple servers", async () => {
      mockService.deleteServer.mockReturnValue(undefined);

      const result = await storage.deleteMany(["server-1", "server-2", "server-3"]);

      expect(mockService.deleteServer).toHaveBeenCalledTimes(3);
      expect(result).toBe(3);
    });

    it("should return 0 for empty IDs", async () => {
      const result = await storage.deleteMany([]);

      expect(result).toBe(0);
      expect(mockService.deleteServer).not.toHaveBeenCalled();
    });

    it("should count only successful deletes", async () => {
      mockService.deleteServer
        .mockReturnValueOnce(undefined)
        .mockImplementationOnce(() => {
          throw new Error("Error");
        })
        .mockReturnValueOnce(undefined);

      const result = await storage.deleteMany(["server-1", "server-2", "server-3"]);

      expect(result).toBe(2);
    });
  });

  describe("find", () => {
    it("should find servers with serverId filter", async () => {
      const servers = [
        {
          id: "server-1",
          config: {
            id: "server-1",
            type: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
          },
          created_at: 1000000000000,
          updated_at: 1000000000000,
        },
      ];

      mockService.getAllServers.mockReturnValue(servers);

      const result = await storage.find({ serverId: "server-1" });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("server-1");
    });

    it("should handle empty result", async () => {
      mockService.getAllServers.mockReturnValue([]);

      const result = await storage.find({ serverId: "nonexistent" });

      expect(result).toEqual([]);
    });

    it("should handle service errors", async () => {
      mockService.getAllServers.mockImplementation(() => {
        throw new Error("Database error");
      });

      await expect(storage.find({})).rejects.toThrow("Database error");
    });
  });

  describe("count", () => {
    it("should count all servers", async () => {
      const servers = [
        {
          id: "server-1",
          config: { id: "1", type: "stdio", command: "npx", args: [] },
          created_at: 0,
          updated_at: 0,
        },
        {
          id: "server-2",
          config: { id: "2", type: "stdio", command: "npx", args: [] },
          created_at: 0,
          updated_at: 0,
        },
      ];

      mockService.getAllServers.mockReturnValue(servers);

      const result = await storage.count({});

      expect(result).toBe(2);
    });

    it("should handle service errors", async () => {
      mockService.getAllServers.mockImplementation(() => {
        throw new Error("Database error");
      });

      await expect(storage.count({})).rejects.toThrow("Database error");
    });
  });

  describe("getByServerId", () => {
    it("should return server by ID", async () => {
      const server = {
        id: "server-1",
        config: {
          id: "server-1",
          type: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
        },
        created_at: 1000000000000,
        updated_at: 1000000000000,
      };

      mockService.getServer.mockReturnValue(server);

      const result = await storage.getByServerId("server-1");

      expect(result?.id).toBe("server-1");
    });

    it("should handle service errors", async () => {
      mockService.getServer.mockImplementation(() => {
        throw new Error("Database error");
      });

      await expect(storage.getByServerId("server-1")).rejects.toThrow("Database error");
    });
  });

  describe("getEnabledServers", () => {
    it("should return all servers as enabled", async () => {
      const servers = [
        {
          id: "server-1",
          config: {
            id: "server-1",
            type: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
          },
          created_at: 1000000000000,
          updated_at: 1000000000000,
        },
      ];

      mockService.getAllServers.mockReturnValue(servers);

      const result = await storage.getEnabledServers();

      expect(result).toHaveLength(1);
      expect(result[0].enabled).toBe(1);
    });

    it("should handle service errors", async () => {
      mockService.getAllServers.mockImplementation(() => {
        throw new Error("Database error");
      });

      await expect(storage.getEnabledServers()).rejects.toThrow("Database error");
    });
  });

  describe("exists", () => {
    it("should return true when server exists", async () => {
      mockService.getServer.mockReturnValue({
        id: "server-1",
        config: { id: "1", type: "stdio", command: "npx", args: [] },
        created_at: 0,
        updated_at: 0,
      });

      const result = await storage.exists("server-1");

      expect(result).toBe(true);
    });

    it("should return false when server does not exist", async () => {
      mockService.getServer.mockReturnValue(undefined);

      const result = await storage.exists("nonexistent");

      expect(result).toBe(false);
    });
  });

  describe("upsertServer", () => {
    it("should upsert server configuration", async () => {
      const config: MCPServerConfig = {
        id: "server-1",
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
      };

      mockService.saveServer.mockReturnValue(undefined);

      await storage.upsertServer(config);

      expect(mockService.saveServer).toHaveBeenCalledWith(config);
    });

    it("should handle service errors", async () => {
      const config: MCPServerConfig = {
        id: "server-1",
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
      };

      mockService.saveServer.mockImplementation(() => {
        throw new Error("Database error");
      });

      await expect(storage.upsertServer(config)).rejects.toThrow("Database error");
    });
  });

  describe("Interface Compliance", () => {
    it("should implement IMCPConfigStorage interface", () => {
      const storageMethods: (keyof IMCPConfigStorage)[] = [
        "get",
        "getMany",
        "save",
        "delete",
        "deleteMany",
        "find",
        "count",
        "getByServerId",
        "getEnabledServers",
        "exists",
        "upsertServer",
      ];

      for (const method of storageMethods) {
        expect(typeof storage[method]).toBe("function");
      }
    });
  });
});
