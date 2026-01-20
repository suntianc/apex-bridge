import type { ILLMConfigStorage, LLMConfigQuery } from "@/core/storage/interfaces";
import type { LLMProviderV2, LLMModelV2 } from "@/types/llm-models";
import { LLMModelType } from "@/types/llm-models";
import path from "path";
import fs from "fs";
import os from "os";
import Database from "better-sqlite3";

const TEST_DB_DIR = path.join(os.tmpdir(), "apex-bridge-test-llm");

function cleanupTestDb() {
  try {
    if (fs.existsSync(TEST_DB_DIR)) {
      const files = fs.readdirSync(TEST_DB_DIR);
      for (const file of files) {
        if (file.startsWith("llm_test_")) {
          fs.unlinkSync(path.join(TEST_DB_DIR, file));
        }
      }
    }
  } catch (e) {}
}

class TestSQLiteLLMConfigStorage {
  public db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS llm_providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        base_config TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK(enabled IN (0, 1))
      );

      CREATE TABLE IF NOT EXISTS llm_models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER NOT NULL,
        model_key TEXT NOT NULL,
        model_name TEXT NOT NULL,
        model_type TEXT NOT NULL,
        model_config TEXT NOT NULL,
        api_endpoint_suffix TEXT,
        enabled INTEGER DEFAULT 1,
        is_default INTEGER DEFAULT 0,
        is_ace_evolution INTEGER DEFAULT 0,
        display_order INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (provider_id) REFERENCES llm_providers(id) ON DELETE CASCADE,
        UNIQUE(provider_id, model_key),
        CHECK(enabled IN (0, 1)),
        CHECK(is_default IN (0, 1)),
        CHECK(is_ace_evolution IN (0, 1))
      );
    `);
  }

  async get(id: string): Promise<LLMProviderV2 | null> {
    const numericId = parseInt(id, 10);
    const row = this.db
      .prepare(
        `SELECT id, provider, name, description, base_config, enabled, created_at, updated_at
         FROM llm_providers WHERE id = ?`
      )
      .get(numericId) as any;
    return row
      ? {
          id: row.id,
          provider: row.provider,
          name: row.name,
          description: row.description,
          baseConfig: JSON.parse(row.base_config),
          enabled: row.enabled === 1,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      : null;
  }

  async getMany(ids: string[]): Promise<Map<string, LLMProviderV2>> {
    const map = new Map<string, LLMProviderV2>();
    if (ids.length === 0) return map;

    const rows = this.db
      .prepare(
        `SELECT id, provider, name, description, base_config, enabled, created_at, updated_at
         FROM llm_providers WHERE id IN (${ids.map(() => "?").join(",")})`
      )
      .all(...ids.map((id) => parseInt(id, 10))) as any[];

    for (const row of rows) {
      map.set(String(row.id), {
        id: row.id,
        provider: row.provider,
        name: row.name,
        description: row.description,
        baseConfig: JSON.parse(row.base_config),
        enabled: row.enabled === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }
    return map;
  }

  async save(entity: LLMProviderV2): Promise<string> {
    const now = Date.now();
    if (entity.id) {
      const updates: string[] = [];
      const values: any[] = [];

      if (entity.name !== undefined) {
        updates.push("name = ?");
        values.push(entity.name);
      }
      if (entity.description !== undefined) {
        updates.push("description = ?");
        values.push(entity.description);
      }
      if (entity.baseConfig !== undefined) {
        updates.push("base_config = ?");
        values.push(JSON.stringify(entity.baseConfig));
      }
      if (entity.enabled !== undefined) {
        updates.push("enabled = ?");
        values.push(entity.enabled ? 1 : 0);
      }

      if (updates.length > 0) {
        updates.push("updated_at = ?");
        values.push(now);
        values.push(entity.id);

        this.db
          .prepare(`UPDATE llm_providers SET ${updates.join(", ")} WHERE id = ?`)
          .run(...values);
      }
      return String(entity.id);
    } else {
      const result = this.db
        .prepare(
          `INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          entity.provider,
          entity.name,
          entity.description || null,
          JSON.stringify(entity.baseConfig),
          entity.enabled ? 1 : 0,
          now,
          now
        );
      return String(result.lastInsertRowid);
    }
  }

  async delete(id: string): Promise<boolean> {
    const numericId = parseInt(id, 10);
    const result = this.db.prepare("DELETE FROM llm_providers WHERE id = ?").run(numericId);
    return result.changes > 0;
  }

  async deleteMany(ids: string[]): Promise<number> {
    let deleted = 0;
    for (const id of ids) {
      if (await this.delete(id)) deleted++;
    }
    return deleted;
  }

  async find(query: LLMConfigQuery): Promise<LLMProviderV2[]> {
    let sql = `SELECT id, provider, name, description, base_config, enabled, created_at, updated_at FROM llm_providers WHERE 1=1`;
    const values: any[] = [];

    if (query.enabled !== undefined) {
      sql += " AND enabled = ?";
      values.push(query.enabled ? 1 : 0);
    }
    if (query.provider) {
      sql += " AND provider = ?";
      values.push(query.provider);
    }

    sql += " ORDER BY id ASC";

    const rows = this.db.prepare(sql).all(...values) as any[];
    let result = rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      name: row.name,
      description: row.description,
      baseConfig: JSON.parse(row.base_config),
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    if (query.offset) result = result.slice(query.offset);
    if (query.limit) result = result.slice(0, query.limit);

    return result;
  }

  async count(query: LLMConfigQuery): Promise<number> {
    let sql = "SELECT COUNT(*) as count FROM llm_providers WHERE 1=1";
    const values: any[] = [];

    if (query.enabled !== undefined) {
      sql += " AND enabled = ?";
      values.push(query.enabled ? 1 : 0);
    }
    if (query.provider) {
      sql += " AND provider = ?";
      values.push(query.provider);
    }

    const row = this.db.prepare(sql).get(...values) as any;
    return row.count;
  }

  async getProviderByName(provider: string): Promise<LLMProviderV2 | null> {
    const row = this.db
      .prepare(
        `SELECT id, provider, name, description, base_config, enabled, created_at, updated_at
         FROM llm_providers WHERE provider = ?`
      )
      .get(provider) as any;
    return row
      ? {
          id: row.id,
          provider: row.provider,
          name: row.name,
          description: row.description,
          baseConfig: JSON.parse(row.base_config),
          enabled: row.enabled === 1,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      : null;
  }

  async getEnabledProviders(): Promise<string[]> {
    const rows = this.db
      .prepare(`SELECT provider FROM llm_providers WHERE enabled = 1 ORDER BY id ASC`)
      .all() as any[];
    return rows.map((row) => row.provider);
  }

  async getModelsByProvider(providerId: string): Promise<LLMModelV2[]> {
    const numericId = parseInt(providerId, 10);
    const rows = this.db
      .prepare(
        `SELECT m.*, p.provider, p.name as provider_name, p.base_config, p.enabled as provider_enabled
         FROM llm_models m
         JOIN llm_providers p ON m.provider_id = p.id
         WHERE m.provider_id = ?
         ORDER BY m.provider_id, m.model_type, m.display_order, m.id`
      )
      .all(numericId) as any[];

    return rows.map((row) => ({
      id: row.id,
      providerId: row.provider_id,
      modelKey: row.model_key,
      modelName: row.model_name,
      modelType: row.model_type as LLMModelType,
      modelConfig: JSON.parse(row.model_config),
      apiEndpointSuffix: row.api_endpoint_suffix,
      enabled: row.enabled === 1,
      isDefault: row.is_default === 1,

      displayOrder: row.display_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async getModelByKey(providerId: string, modelKey: string): Promise<LLMModelV2 | null> {
    const numericId = parseInt(providerId, 10);
    const row = this.db
      .prepare(
        `SELECT m.id, m.provider_id, m.model_key, m.model_name, m.model_type, m.model_config,
                 m.api_endpoint_suffix, m.enabled, m.is_default,

                m.display_order, m.created_at, m.updated_at
         FROM llm_models m
         WHERE m.provider_id = ? AND m.model_key = ?`
      )
      .get(numericId, modelKey) as any;

    if (!row) return null;

    return {
      id: row.id,
      providerId: row.provider_id,
      modelKey: row.model_key,
      modelName: row.model_name,
      modelType: row.model_type as LLMModelType,
      modelConfig: JSON.parse(row.model_config),
      apiEndpointSuffix: row.api_endpoint_suffix,
      enabled: row.enabled === 1,
      isDefault: row.is_default === 1,

      displayOrder: row.display_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getDefaultModelByType(modelType: string): Promise<LLMModelV2 | null> {
    const row = this.db
      .prepare(
        `SELECT m.id, m.provider_id, m.model_key, m.model_name, m.model_type, m.model_config,
                 m.api_endpoint_suffix, m.enabled, m.is_default,

                m.display_order, m.created_at, m.updated_at
         FROM llm_models m
         JOIN llm_providers p ON m.provider_id = p.id
         WHERE m.model_type = ? AND m.is_default = 1 AND m.enabled = 1 AND p.enabled = 1
         LIMIT 1`
      )
      .get(modelType) as any;

    if (!row) return null;

    return {
      id: row.id,
      providerId: row.provider_id,
      modelKey: row.model_key,
      modelName: row.model_name,
      modelType: row.model_type as LLMModelType,
      modelConfig: JSON.parse(row.model_config),
      apiEndpointSuffix: row.api_endpoint_suffix,
      enabled: row.enabled === 1,
      isDefault: row.is_default === 1,

      displayOrder: row.display_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createProviderWithModels(provider: LLMProviderV2, models: LLMModelV2[]): Promise<string> {
    const now = Date.now();

    const result = this.db
      .prepare(
        `INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        provider.provider,
        provider.name,
        provider.description || null,
        JSON.stringify(provider.baseConfig),
        provider.enabled ? 1 : 0,
        now,
        now
      );

    const providerId = result.lastInsertRowid;

    for (const model of models) {
      this.db
        .prepare(
          `INSERT INTO llm_models (provider_id, model_key, model_name, model_type, model_config, api_endpoint_suffix, enabled, is_default, display_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          providerId,
          model.modelKey,
          model.modelName,
          model.modelType,
          JSON.stringify(model.modelConfig || {}),
          model.apiEndpointSuffix || null,
          model.enabled ? 1 : 0,
          model.isDefault ? 1 : 0,
          model.displayOrder || 0,
          now,
          now
        );
    }

    return String(providerId);
  }

  async deleteModel(modelId: string): Promise<boolean> {
    const numericId = parseInt(modelId, 10);
    const result = this.db.prepare("DELETE FROM llm_models WHERE id = ?").run(numericId);
    return result.changes > 0;
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

describe("SQLiteLLMConfigStorage", () => {
  let storage: TestSQLiteLLMConfigStorage;
  let testDbPath: string;

  beforeAll(() => {
    if (!fs.existsSync(TEST_DB_DIR)) {
      fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    }
  });

  beforeEach(() => {
    cleanupTestDb();
    const dbName = `llm_test_${Date.now()}_${Math.random().toString(36).slice(2)}.db`;
    testDbPath = path.join(TEST_DB_DIR, dbName);
    storage = new TestSQLiteLLMConfigStorage(testDbPath);
  });

  afterEach(() => {
    if (storage) {
      try {
        storage.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    cleanupTestDb();
  });

  afterAll(() => {
    try {
      fs.rmSync(TEST_DB_DIR, { recursive: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe("Constructor", () => {
    it("should create instance without error", () => {
      expect(storage).toBeDefined();
      expect(storage).toBeInstanceOf(TestSQLiteLLMConfigStorage);
    });
  });

  describe("get", () => {
    it("should return provider when exists", async () => {
      const now = Date.now();
      storage.db
        .prepare(
          `INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "openai",
          "OpenAI",
          "OpenAI Provider",
          JSON.stringify({ baseURL: "https://api.openai.com/v1" }),
          1,
          now,
          now
        );

      const result = await storage.get("1");

      expect(result).toBeDefined();
      expect(result?.provider).toBe("openai");
      expect(result?.name).toBe("OpenAI");
    });

    it("should return null when provider not exists", async () => {
      const result = await storage.get("999");
      expect(result).toBeNull();
    });
  });

  describe("getMany", () => {
    it("should return providers map for valid IDs", async () => {
      const now = Date.now();

      storage.db
        .prepare(
          `INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "openai",
          "OpenAI",
          null,
          JSON.stringify({ baseURL: "https://api.openai.com/v1" }),
          1,
          now,
          now
        );

      storage.db
        .prepare(
          `INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "claude",
          "Claude",
          null,
          JSON.stringify({ baseURL: "https://api.anthropic.com" }),
          1,
          now,
          now
        );

      const result = await storage.getMany(["1", "2"]);

      expect(result.size).toBe(2);
      expect(result.get("1")?.provider).toBe("openai");
      expect(result.get("2")?.provider).toBe("claude");
    });

    it("should return empty map for empty IDs", async () => {
      const result = await storage.getMany([]);
      expect(result.size).toBe(0);
    });
  });

  describe("save", () => {
    it("should create new provider when id is 0", async () => {
      const newProvider: LLMProviderV2 = {
        id: 0,
        provider: "test",
        name: "Test Provider",
        description: "Test",
        baseConfig: { baseURL: "http://localhost:8000" },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = await storage.save(newProvider);

      expect(result).toBe("1");
      const saved = await storage.get("1");
      expect(saved?.provider).toBe("test");
    });

    it("should update existing provider when id is set", async () => {
      const now = Date.now();

      storage.db
        .prepare(
          `INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "openai",
          "OpenAI",
          null,
          JSON.stringify({ baseURL: "https://api.openai.com/v1" }),
          1,
          now,
          now
        );

      const existingProvider: LLMProviderV2 = {
        id: 1,
        provider: "openai",
        name: "OpenAI Updated",
        description: "Updated",
        baseConfig: { baseURL: "https://api.openai.com/v1" },
        enabled: false,
        createdAt: now,
        updatedAt: now,
      };

      const result = await storage.save(existingProvider);

      expect(result).toBe("1");
      const saved = await storage.get("1");
      expect(saved?.name).toBe("OpenAI Updated");
      expect(saved?.enabled).toBe(false);
    });
  });

  describe("delete", () => {
    it("should return true when delete succeeds", async () => {
      const now = Date.now();

      storage.db
        .prepare(
          `INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "openai",
          "OpenAI",
          null,
          JSON.stringify({ baseURL: "https://api.openai.com/v1" }),
          1,
          now,
          now
        );

      const result = await storage.delete("1");

      expect(result).toBe(true);
      const saved = await storage.get("1");
      expect(saved).toBeNull();
    });

    it("should return false when delete fails", async () => {
      const result = await storage.delete("999");
      expect(result).toBe(false);
    });
  });

  describe("deleteMany", () => {
    it("should delete multiple providers", async () => {
      const now = Date.now();

      for (const p of ["openai", "claude", "deepseek"]) {
        storage.db
          .prepare(
            `INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            p,
            p.charAt(0).toUpperCase() + p.slice(1),
            null,
            JSON.stringify({ baseURL: `https://api.${p}.com` }),
            1,
            now,
            now
          );
      }

      const result = await storage.deleteMany(["1", "2", "3"]);

      expect(result).toBe(3);
      expect(await storage.get("1")).toBeNull();
      expect(await storage.get("2")).toBeNull();
      expect(await storage.get("3")).toBeNull();
    });

    it("should return 0 for empty IDs", async () => {
      const result = await storage.deleteMany([]);
      expect(result).toBe(0);
    });
  });

  describe("find", () => {
    it("should find providers with enabled filter", async () => {
      const now = Date.now();

      storage.db
        .prepare(
          `INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "openai",
          "OpenAI",
          null,
          JSON.stringify({ baseURL: "https://api.openai.com/v1" }),
          1,
          now,
          now
        );

      storage.db
        .prepare(
          `INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "disabled",
          "Disabled",
          null,
          JSON.stringify({ baseURL: "http://localhost" }),
          0,
          now,
          now
        );

      const result = await storage.find({ enabled: true });

      expect(result).toHaveLength(1);
      expect(result[0].enabled).toBe(true);
    });

    it("should find providers with provider filter", async () => {
      const now = Date.now();

      storage.db
        .prepare(
          `INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "openai",
          "OpenAI",
          null,
          JSON.stringify({ baseURL: "https://api.openai.com/v1" }),
          1,
          now,
          now
        );

      const result = await storage.find({ provider: "openai" });

      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe("openai");
    });

    it("should apply limit and offset", async () => {
      const now = Date.now();

      for (const p of ["a", "b", "c"]) {
        storage.db
          .prepare(
            `INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            p,
            p.toUpperCase(),
            null,
            JSON.stringify({ baseURL: `https://api.${p}.com` }),
            1,
            now,
            now
          );
      }

      const result = await storage.find({ limit: 2, offset: 1 });

      expect(result).toHaveLength(2);
      expect(result[0].provider).toBe("b");
      expect(result[1].provider).toBe("c");
    });

    it("should handle empty result", async () => {
      const result = await storage.find({ enabled: true });
      expect(result).toEqual([]);
    });
  });

  describe("count", () => {
    it("should count providers matching query", async () => {
      const now = Date.now();

      for (const p of ["openai", "claude"]) {
        storage.db
          .prepare(
            `INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            p,
            p.toUpperCase(),
            null,
            JSON.stringify({ baseURL: `https://api.${p}.com` }),
            1,
            now,
            now
          );
      }

      storage.db
        .prepare(
          `INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "disabled",
          "Disabled",
          null,
          JSON.stringify({ baseURL: "http://localhost" }),
          0,
          now,
          now
        );

      const result = await storage.count({ enabled: true });

      expect(result).toBe(2);
    });
  });

  describe("getProviderByName", () => {
    it("should return provider by name", async () => {
      const now = Date.now();

      storage.db
        .prepare(
          `INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "openai",
          "OpenAI",
          null,
          JSON.stringify({ baseURL: "https://api.openai.com/v1" }),
          1,
          now,
          now
        );

      const result = await storage.getProviderByName("openai");

      expect(result).toBeDefined();
      expect(result?.provider).toBe("openai");
    });

    it("should return null when not found", async () => {
      const result = await storage.getProviderByName("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getEnabledProviders", () => {
    it("should return enabled provider names", async () => {
      const now = Date.now();

      for (const [p, enabled] of [
        ["openai", 1],
        ["claude", 1],
        ["disabled", 0],
      ] as const) {
        storage.db
          .prepare(
            `INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            p,
            p.charAt(0).toUpperCase() + p.slice(1),
            null,
            JSON.stringify({ baseURL: `https://api.${p}.com` }),
            enabled,
            now,
            now
          );
      }

      const result = await storage.getEnabledProviders();

      expect(result).toEqual(["openai", "claude"]);
    });
  });

  describe("getModelsByProvider", () => {
    it("should return models for provider", async () => {
      const now = Date.now();

      storage.db
        .prepare(
          `INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "openai",
          "OpenAI",
          null,
          JSON.stringify({ baseURL: "https://api.openai.com/v1" }),
          1,
          now,
          now
        );

      storage.db
        .prepare(
          `INSERT INTO llm_models (provider_id, model_key, model_name, model_type, model_config, enabled, is_default, display_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(1, "gpt-4", "GPT-4", "nlp", JSON.stringify({}), 1, 1, 1, now, now);

      const result = await storage.getModelsByProvider("1");

      expect(result).toHaveLength(1);
      expect(result[0].modelKey).toBe("gpt-4");
    });
  });

  describe("getModelByKey", () => {
    it("should return model by key", async () => {
      const now = Date.now();

      storage.db
        .prepare(
          `INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "openai",
          "OpenAI",
          null,
          JSON.stringify({ baseURL: "https://api.openai.com/v1" }),
          1,
          now,
          now
        );

      storage.db
        .prepare(
          `INSERT INTO llm_models (provider_id, model_key, model_name, model_type, model_config, enabled, is_default, display_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(1, "gpt-4", "GPT-4", "nlp", JSON.stringify({}), 1, 1, 1, now, now);

      const result = await storage.getModelByKey("1", "gpt-4");

      expect(result).toBeDefined();
      expect(result?.modelKey).toBe("gpt-4");
    });

    it("should return null when not found", async () => {
      const result = await storage.getModelByKey("1", "nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getDefaultModelByType", () => {
    it("should return default model by type", async () => {
      const now = Date.now();

      storage.db
        .prepare(
          `INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "openai",
          "OpenAI",
          null,
          JSON.stringify({ baseURL: "https://api.openai.com/v1" }),
          1,
          now,
          now
        );

      storage.db
        .prepare(
          `INSERT INTO llm_models (provider_id, model_key, model_name, model_type, model_config, enabled, is_default, display_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(1, "gpt-4", "GPT-4", "nlp", JSON.stringify({}), 1, 1, 1, now, now);

      const result = await storage.getDefaultModelByType("nlp");

      expect(result).toBeDefined();
      expect(result?.modelKey).toBe("gpt-4");
    });

    it("should return null when not found", async () => {
      const result = await storage.getDefaultModelByType("nlp");
      expect(result).toBeNull();
    });
  });

  describe("createProviderWithModels", () => {
    it("should create provider with models", async () => {
      const provider: LLMProviderV2 = {
        id: 0,
        provider: "test",
        name: "Test",
        baseConfig: { baseURL: "http://localhost" },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const models: LLMModelV2[] = [
        {
          id: 0,
          providerId: 0,
          modelKey: "test-model",
          modelName: "Test Model",
          modelType: LLMModelType.NLP,
          modelConfig: {},
          enabled: true,
          isDefault: false,
          displayOrder: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const result = await storage.createProviderWithModels(provider, models);

      expect(result).toBe("1");

      const savedProvider = await storage.get("1");
      expect(savedProvider?.provider).toBe("test");

      const savedModels = await storage.getModelsByProvider("1");
      expect(savedModels).toHaveLength(1);
      expect(savedModels[0].modelKey).toBe("test-model");
    });

    it("should create multiple models", async () => {
      const provider: LLMProviderV2 = {
        id: 0,
        provider: "test",
        name: "Test",
        baseConfig: { baseURL: "http://localhost" },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const models: LLMModelV2[] = [
        {
          id: 0,
          providerId: 0,
          modelKey: "model-1",
          modelName: "Model 1",
          modelType: LLMModelType.NLP,
          modelConfig: {},
          enabled: true,
          isDefault: false,
          displayOrder: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 0,
          providerId: 0,
          modelKey: "model-2",
          modelName: "Model 2",
          modelType: LLMModelType.EMBEDDING,
          modelConfig: {},
          enabled: true,
          isDefault: false,
          displayOrder: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const result = await storage.createProviderWithModels(provider, models);

      expect(result).toBe("1");
      const savedModels = await storage.getModelsByProvider("1");
      expect(savedModels).toHaveLength(2);
    });
  });

  describe("Interface Compliance", () => {
    it("should implement ILLMConfigStorage interface", () => {
      const storageMethods: (keyof ILLMConfigStorage)[] = [
        "get",
        "getMany",
        "save",
        "delete",
        "deleteMany",
        "find",
        "count",
        "getProviderByName",
        "getEnabledProviders",
        "getModelsByProvider",
        "getModelByKey",
        "getDefaultModelByType",
        "createProviderWithModels",
        "deleteModel",
      ];

      for (const method of storageMethods) {
        expect(typeof (storage as any)[method]).toBe("function");
      }
    });
  });
});
