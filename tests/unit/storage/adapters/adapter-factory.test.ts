/**
 * Storage Adapter Factory Tests
 */

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  StorageAdapterFactory,
  createStorageConfig,
  parseFeatureFlags,
} from "@/core/storage/adapter-factory";
import { StorageBackend } from "@/core/storage/interfaces";

describe("StorageAdapterFactory", () => {
  afterEach(() => {
    StorageAdapterFactory.reset();
  });

  describe("parseFeatureFlags", () => {
    it("should parse default feature flags", () => {
      const flags = parseFeatureFlags({});
      expect(flags.surrealdbEnabled).toBe(false);
      expect(flags.dualWriteEnabled).toBe(false); // Always false - dual-write removed
      expect(flags.dualWriteReadStrategy).toBe("primary");
      expect(flags.vectorMigrationEvaluation).toBe(false);
      expect(flags.sdkV2UpgradeEnabled).toBe(false);
    });

    it("should parse enabled feature flags", () => {
      const flags = parseFeatureFlags({
        SURREALDB_ENABLED: "true",
        SURREALDB_SDK_V2: "true",
      });
      expect(flags.surrealdbEnabled).toBe(true);
      expect(flags.dualWriteEnabled).toBe(false); // Always false
      expect(flags.dualWriteReadStrategy).toBe("primary");
      expect(flags.vectorMigrationEvaluation).toBe(false);
      expect(flags.sdkV2UpgradeEnabled).toBe(true);
    });
  });

  describe("createStorageConfig", () => {
    it("should create default SurrealDB config (dual-write removed)", () => {
      const config = createStorageConfig({});
      expect(config.backend).toBe(StorageBackend.SurrealDB); // Changed from SQLite
      expect(config.surrealdb).toBeDefined();
    });

    it("should create SurrealDB config when backend is surrealdb", () => {
      const config = createStorageConfig({
        STORAGE_BACKEND: "surrealdb",
        SURREAL_URL: "ws://localhost:8000",
        SURREAL_NS: "test_ns",
        SURREAL_DB: "test_db",
        SURREAL_USER: "test_user",
        SURREAL_PASS: "test_pass",
      });
      expect(config.backend).toBe(StorageBackend.SurrealDB);
      expect(config.surrealdb).toBeDefined();
      expect(config.surrealdb?.url).toBe("ws://localhost:8000");
      expect(config.surrealdb?.namespace).toBe("test_ns");
      expect(config.surrealdb?.database).toBe("test_db");
    });
  });

  describe("initialize", () => {
    it("should initialize with config", () => {
      const config = createStorageConfig({});
      StorageAdapterFactory.initialize(config);
      expect(StorageAdapterFactory.getConfig()).toBe(config);
    });
  });

  describe("getBackendType", () => {
    it("should return null when not initialized", () => {
      expect(StorageAdapterFactory.getBackendType()).toBeNull();
    });

    it("should return backend type after initialization", () => {
      const config = createStorageConfig({});
      StorageAdapterFactory.initialize(config);
      expect(StorageAdapterFactory.getBackendType()).toBe(StorageBackend.SurrealDB);
    });
  });

  describe("isSurrealDBEnabled", () => {
    it("should return false when not configured", () => {
      expect(StorageAdapterFactory.isSurrealDBEnabled()).toBe(false);
    });

    it("should return true when SurrealDB backend and feature enabled", () => {
      const config = createStorageConfig({
        STORAGE_BACKEND: "surrealdb",
        SURREALDB_ENABLED: "true",
      });
      StorageAdapterFactory.initialize(config);
      expect(StorageAdapterFactory.isSurrealDBEnabled()).toBe(true);
    });
  });

  describe("reset", () => {
    it("should clear all instances and config", () => {
      const config = createStorageConfig({});
      StorageAdapterFactory.initialize(config);
      StorageAdapterFactory.reset();
      expect(StorageAdapterFactory.getConfig()).toBeNull();
      expect(StorageAdapterFactory.getBackendType()).toBeNull();
    });
  });

  describe("Storage Adapters", () => {
    beforeEach(() => {
      StorageAdapterFactory.reset();
    });

    it("should return LLMConfig storage adapter", () => {
      const config = createStorageConfig({});
      StorageAdapterFactory.initialize(config);

      const adapter = StorageAdapterFactory.getLLMConfigStorage();
      expect(adapter).toBeDefined();
    });

    it("should return MCPConfig storage adapter", () => {
      const config = createStorageConfig({});
      StorageAdapterFactory.initialize(config);

      const adapter = StorageAdapterFactory.getMCPConfigStorage();
      expect(adapter).toBeDefined();
    });

    it("should return Conversation storage adapter", () => {
      const config = createStorageConfig({});
      StorageAdapterFactory.initialize(config);

      const adapter = StorageAdapterFactory.getConversationStorage();
      expect(adapter).toBeDefined();
    });

    it("should return Trajectory storage adapter", () => {
      const config = createStorageConfig({});
      StorageAdapterFactory.initialize(config);

      const adapter = StorageAdapterFactory.getTrajectoryStorage();
      expect(adapter).toBeDefined();
    });

    it("should return Vector storage adapter", async () => {
      const config = createStorageConfig({});
      StorageAdapterFactory.initialize(config);

      const adapter = await StorageAdapterFactory.getVectorStorage();
      expect(adapter).toBeDefined();
    });
  });
});
