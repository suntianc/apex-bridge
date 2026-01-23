/**
 * SurrealDB Client Wrapper Tests
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { SurrealDBClient } from "@/core/storage/surrealdb/client";

// Create mock implementation
const mockSurrealInstance = {
  connect: vi.fn().mockResolvedValue(true),
  signin: vi.fn().mockResolvedValue({}),
  use: vi.fn().mockResolvedValue({}),
  query: vi.fn().mockResolvedValue([]),
  select: vi.fn().mockResolvedValue([]),
  create: vi.fn().mockResolvedValue([]),
  update: vi.fn().mockResolvedValue([]),
  delete: vi.fn().mockResolvedValue(true),
  close: vi.fn().mockResolvedValue(undefined),
  health: vi.fn().mockResolvedValue(true),
};

// Mock surrealdb module
vi.mock("surrealdb", () => {
  return {
    __esModule: true,
    Surreal: vi.fn().mockImplementation(() => mockSurrealInstance),
    createRemoteEngines: vi.fn(() => ({})),
    Table: class Table {
      constructor(public value: string) {}
    },
    RecordId: class RecordId {
      constructor(
        public table: string,
        public id: string
      ) {}
    },
  };
});

describe("SurrealDBClient", () => {
  let client: SurrealDBClient;

  beforeEach(() => {
    client = SurrealDBClient.getInstance();
    // Reset all mocks between tests
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe("getInstance", () => {
    it("should return singleton instance", () => {
      const instance1 = SurrealDBClient.getInstance();
      const instance2 = SurrealDBClient.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("connection state", () => {
    it("should initially be disconnected", () => {
      expect(client.connected).toBe(false);
    });

    it("should return connection info when not connected", () => {
      expect(client.getConnectionInfo()).toBeNull();
    });
  });

  describe("getConnectionInfo", () => {
    it("should return null when no config is set", () => {
      expect(client.getConnectionInfo()).toBeNull();
    });
  });
});

describe("SurrealDBClient - Connection Management", () => {
  afterEach(async () => {
    const client = SurrealDBClient.getInstance();
    await client.disconnect();
    vi.clearAllMocks();
  });

  it("should not allow concurrent connect with different configs", async () => {
    const client = SurrealDBClient.getInstance();
    const config1 = {
      url: "ws://localhost:12470/rpc",
      namespace: "apexbridge",
      database: "staging",
      username: "root",
      password: "root",
    };
    const config2 = {
      url: "ws://localhost:12470/rpc",
      namespace: "apexbridge",
      database: "staging",
      username: "root",
      password: "different", // Different password to trigger rejection
    };

    // Clear any existing connection state
    await client.disconnect().catch((error) => {
      if (process.env.DEBUG_TESTS === "true") {
        console.debug("Disconnect error (expected):", error);
      }
    });

    const connect1 = client.connect(config1);
    // This should reject immediately because a different connection is in progress
    await expect(client.connect(config2)).rejects.toThrow(
      "Connect already in progress with a different config"
    );
    // Clean up the first connection attempt
    await connect1.catch((error) => {
      if (process.env.DEBUG_TESTS === "true") {
        console.debug("Connect error (expected):", error);
      }
    });
  }, 10000);
});
