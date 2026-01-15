/**
 * IMCPConfigStorage Interface Test Suite
 *
 * Tests that the IMCPConfigStorage interface is properly defined
 * and can be implemented by various storage adapters.
 */

import type { IMCPConfigStorage, MCPConfigQuery, MCPServerRecord } from "@/core/storage/interfaces";
import type { MCPServerConfig } from "@/types/mcp";

describe("IMCPConfigStorage Interface", () => {
  describe("Type Definition", () => {
    it("should be a valid interface type", () => {
      const storage: IMCPConfigStorage = {
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

      expect(storage).toBeDefined();
      expect(typeof storage.get).toBe("function");
      expect(typeof storage.getMany).toBe("function");
      expect(typeof storage.save).toBe("function");
      expect(typeof storage.delete).toBe("function");
      expect(typeof storage.deleteMany).toBe("function");
      expect(typeof storage.find).toBe("function");
      expect(typeof storage.count).toBe("function");
      expect(typeof storage.getByServerId).toBe("function");
      expect(typeof storage.getEnabledServers).toBe("function");
      expect(typeof storage.exists).toBe("function");
      expect(typeof storage.upsertServer).toBe("function");
    });
  });

  describe("Base Storage Methods", () => {
    let storage: IMCPConfigStorage;

    beforeEach(() => {
      storage = {
        get: jest.fn().mockResolvedValue(null),
        getMany: jest.fn().mockResolvedValue(new Map()),
        save: jest.fn().mockResolvedValue("server-1"),
        delete: jest.fn().mockResolvedValue(true),
        deleteMany: jest.fn().mockResolvedValue(0),
        find: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        getByServerId: jest.fn().mockResolvedValue(null),
        getEnabledServers: jest.fn().mockResolvedValue([]),
        exists: jest.fn().mockResolvedValue(false),
        upsertServer: jest.fn().mockResolvedValue(undefined),
      };
    });

    it("should implement get method", async () => {
      const mockRecord: MCPServerRecord = {
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

      (storage.get as jest.Mock).mockResolvedValue(mockRecord);

      const result = await storage.get("server-1");

      expect(storage.get).toHaveBeenCalledWith("server-1");
      expect(result).toEqual(mockRecord);
    });

    it("should implement getMany method", async () => {
      const records = new Map<string, MCPServerRecord>();
      records.set("server-1", {
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
      });

      (storage.getMany as jest.Mock).mockResolvedValue(records);

      const result = await storage.getMany(["server-1"]);

      expect(storage.getMany).toHaveBeenCalledWith(["server-1"]);
      expect(result).toBe(records);
    });

    it("should implement save method", async () => {
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

      (storage.save as jest.Mock).mockResolvedValue("server-1");

      const result = await storage.save(record);

      expect(storage.save).toHaveBeenCalledWith(record);
      expect(result).toBe("server-1");
    });

    it("should implement delete method", async () => {
      (storage.delete as jest.Mock).mockResolvedValue(true);

      const result = await storage.delete("server-1");

      expect(storage.delete).toHaveBeenCalledWith("server-1");
      expect(result).toBe(true);
    });

    it("should implement deleteMany method", async () => {
      (storage.deleteMany as jest.Mock).mockResolvedValue(2);

      const result = await storage.deleteMany(["server-1", "server-2"]);

      expect(storage.deleteMany).toHaveBeenCalledWith(["server-1", "server-2"]);
      expect(result).toBe(2);
    });

    it("should implement find method", async () => {
      const records: MCPServerRecord[] = [];
      (storage.find as jest.Mock).mockResolvedValue(records);

      const query: MCPConfigQuery = { enabled: true };
      const result = await storage.find(query);

      expect(storage.find).toHaveBeenCalledWith(query);
      expect(result).toEqual(records);
    });

    it("should implement count method", async () => {
      (storage.count as jest.Mock).mockResolvedValue(5);

      const query: MCPConfigQuery = { enabled: true };
      const result = await storage.count(query);

      expect(storage.count).toHaveBeenCalledWith(query);
      expect(result).toBe(5);
    });
  });

  describe("MCP Specific Methods", () => {
    let storage: IMCPConfigStorage;

    beforeEach(() => {
      storage = {
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

    it("should implement getByServerId method", async () => {
      const mockRecord: MCPServerRecord = {
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

      (storage.getByServerId as jest.Mock).mockResolvedValue(mockRecord);

      const result = await storage.getByServerId("server-1");

      expect(storage.getByServerId).toHaveBeenCalledWith("server-1");
      expect(result).toEqual(mockRecord);
    });

    it("should implement getEnabledServers method", async () => {
      const servers: MCPServerRecord[] = [
        {
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
        },
      ];

      (storage.getEnabledServers as jest.Mock).mockResolvedValue(servers);

      const result = await storage.getEnabledServers();

      expect(storage.getEnabledServers).toHaveBeenCalled();
      expect(result).toEqual(servers);
    });

    it("should implement exists method", async () => {
      (storage.exists as jest.Mock).mockResolvedValue(true);

      const result = await storage.exists("server-1");

      expect(storage.exists).toHaveBeenCalledWith("server-1");
      expect(result).toBe(true);
    });

    it("should return false for non-existent server", async () => {
      (storage.exists as jest.Mock).mockResolvedValue(false);

      const result = await storage.exists("nonexistent");

      expect(result).toBe(false);
    });

    it("should implement upsertServer method", async () => {
      const config: MCPServerConfig = {
        id: "server-1",
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
      };

      (storage.upsertServer as jest.Mock).mockResolvedValue(undefined);

      await storage.upsertServer(config);

      expect(storage.upsertServer).toHaveBeenCalledWith(config);
    });
  });

  describe("Error Handling", () => {
    let storage: IMCPConfigStorage;

    beforeEach(() => {
      storage = {
        get: jest.fn().mockRejectedValue(new Error("Database error")),
        getMany: jest.fn().mockRejectedValue(new Error("Database error")),
        save: jest.fn().mockRejectedValue(new Error("Database error")),
        delete: jest.fn().mockRejectedValue(new Error("Database error")),
        deleteMany: jest.fn().mockRejectedValue(new Error("Database error")),
        find: jest.fn().mockRejectedValue(new Error("Database error")),
        count: jest.fn().mockRejectedValue(new Error("Database error")),
        getByServerId: jest.fn().mockRejectedValue(new Error("Database error")),
        getEnabledServers: jest.fn().mockRejectedValue(new Error("Database error")),
        exists: jest.fn().mockRejectedValue(new Error("Database error")),
        upsertServer: jest.fn().mockRejectedValue(new Error("Database error")),
      };
    });

    it("should handle get errors", async () => {
      await expect(storage.get("server-1")).rejects.toThrow("Database error");
    });

    it("should handle save errors", async () => {
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

      await expect(storage.save(record)).rejects.toThrow("Database error");
    });

    it("should handle delete errors", async () => {
      await expect(storage.delete("server-1")).rejects.toThrow("Database error");
    });

    it("should handle find errors", async () => {
      await expect(storage.find({})).rejects.toThrow("Database error");
    });

    it("should handle count errors", async () => {
      await expect(storage.count({})).rejects.toThrow("Database error");
    });

    it("should handle exists errors", async () => {
      await expect(storage.exists("server-1")).rejects.toThrow("Database error");
    });

    it("should handle upsertServer errors", async () => {
      const config: MCPServerConfig = {
        id: "server-1",
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
      };

      await expect(storage.upsertServer(config)).rejects.toThrow("Database error");
    });
  });

  describe("Query Interface", () => {
    it("should accept valid query parameters", () => {
      const validQuery: MCPConfigQuery = {
        enabled: true,
        serverId: "server-1",
      };

      expect(validQuery.enabled).toBe(true);
      expect(validQuery.serverId).toBe("server-1");
    });

    it("should accept empty query", () => {
      const emptyQuery: MCPConfigQuery = {};

      expect(emptyQuery).toEqual({});
    });

    it("should accept partial query", () => {
      const partialQuery: MCPConfigQuery = {
        enabled: false,
      };

      expect(partialQuery.enabled).toBe(false);
    });
  });

  describe("MCPServerRecord Structure", () => {
    it("should have correct structure", () => {
      const record: MCPServerRecord = {
        id: "server-1",
        config: {
          id: "server-1",
          type: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
          env: { NODE_ENV: "test" },
          cwd: "/tmp",
        },
        enabled: 1,
        created_at: 1000000000000,
        updated_at: 1000000000000,
      };

      expect(record.id).toBe("server-1");
      expect(record.config.type).toBe("stdio");
      expect(record.enabled).toBe(1);
      expect(record.created_at).toBe(1000000000000);
      expect(record.updated_at).toBe(1000000000000);
    });
  });
});
