/**
 * Storage Adapter Factory Tests
 */

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
      expect(flags.dualWriteEnabled).toBe(false);
      expect(flags.dualWriteReadStrategy).toBe("primary");
      expect(flags.vectorMigrationEvaluation).toBe(false);
      expect(flags.sdkV2UpgradeEnabled).toBe(false);
    });

    it("should parse enabled feature flags", () => {
      const flags = parseFeatureFlags({
        SURREALDB_ENABLED: "true",
        SURREALDB_DUAL_WRITE: "true",
        SURREALDB_DUAL_READ_STRATEGY: "surreal",
        SURREALDB_VECTOR_EVAL: "true",
        SURREALDB_SDK_V2: "true",
      });
      expect(flags.surrealdbEnabled).toBe(true);
      expect(flags.dualWriteEnabled).toBe(true);
      expect(flags.dualWriteReadStrategy).toBe("surreal");
      expect(flags.vectorMigrationEvaluation).toBe(true);
      expect(flags.sdkV2UpgradeEnabled).toBe(true);
    });
  });

  describe("createStorageConfig", () => {
    it("should create default SQLite config", () => {
      const config = createStorageConfig({});
      expect(config.backend).toBe(StorageBackend.SQLite);
      expect(config.sqlite).toBeDefined();
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

    it("should create LanceDB config when backend is lance", () => {
      const config = createStorageConfig({
        STORAGE_BACKEND: "lance",
        LANCEDB_PATH: "/custom/path",
      });
      expect(config.backend).toBe(StorageBackend.LanceDB);
      expect(config.lance).toBeDefined();
      expect(config.lance?.path).toBe("/custom/path");
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
      expect(StorageAdapterFactory.getBackendType()).toBe(StorageBackend.SQLite);
    });
  });

  describe("isSurrealDBEnabled", () => {
    it("should return false when not configured", () => {
      expect(StorageAdapterFactory.isSurrealDBEnabled()).toBe(false);
    });

    it("should return false when backend is SQLite", () => {
      const config = createStorageConfig({});
      StorageAdapterFactory.initialize(config);
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

  describe("isDualWriteEnabled", () => {
    it("should return false by default", () => {
      const config = createStorageConfig({});
      StorageAdapterFactory.initialize(config);
      expect(StorageAdapterFactory.isDualWriteEnabled()).toBe(false);
    });

    it("should return true when dual write is enabled", () => {
      const config = createStorageConfig({
        SURREALDB_DUAL_WRITE: "true",
      });
      StorageAdapterFactory.initialize(config);
      expect(StorageAdapterFactory.isDualWriteEnabled()).toBe(true);
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
});
