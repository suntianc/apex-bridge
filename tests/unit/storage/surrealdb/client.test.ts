/**
 * SurrealDB Client Wrapper Tests
 */

import { SurrealDBClient } from "@/core/storage/surrealdb/client";

describe("SurrealDBClient", () => {
  let client: SurrealDBClient;

  beforeEach(() => {
    client = SurrealDBClient.getInstance();
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
      password: "root",
    };

    const connect1 = client.connect(config1);
    await expect(client.connect(config2)).rejects.toThrow(
      "Connect already in progress with a different config"
    );
    await connect1.catch(() => {});
  });
});
