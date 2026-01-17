/**
 * ILLMConfigStorage Interface Test Suite
 *
 * Tests that the ILLMConfigStorage interface is properly defined
 * and can be implemented by various storage adapters.
 */

import type { ILLMConfigStorage, LLMConfigQuery } from "@/core/storage/interfaces";
import type { LLMProviderV2, LLMModelV2 } from "@/types/llm-models";
import { LLMModelType } from "@/types/llm-models";

describe("ILLMConfigStorage Interface", () => {
  describe("Type Definition", () => {
    it("should be a valid interface type", () => {
      const storage: ILLMConfigStorage = {
        get: jest.fn(),
        getMany: jest.fn(),
        save: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        find: jest.fn(),
        count: jest.fn(),
        getProviderByName: jest.fn(),
        getEnabledProviders: jest.fn(),
        getModelsByProvider: jest.fn(),
        getModelByKey: jest.fn(),
        getDefaultModelByType: jest.fn(),
        createProviderWithModels: jest.fn(),
        deleteModel: jest.fn(),
      };

      expect(storage).toBeDefined();
      expect(typeof storage.get).toBe("function");
      expect(typeof storage.getMany).toBe("function");
      expect(typeof storage.save).toBe("function");
      expect(typeof storage.delete).toBe("function");
      expect(typeof storage.deleteMany).toBe("function");
      expect(typeof storage.find).toBe("function");
      expect(typeof storage.count).toBe("function");
      expect(typeof storage.getProviderByName).toBe("function");
      expect(typeof storage.getEnabledProviders).toBe("function");
      expect(typeof storage.getModelsByProvider).toBe("function");
      expect(typeof storage.getModelByKey).toBe("function");
      expect(typeof storage.getDefaultModelByType).toBe("function");
      expect(typeof storage.createProviderWithModels).toBe("function");
    });
  });

  describe("Base Storage Methods", () => {
    let storage: ILLMConfigStorage;

    beforeEach(() => {
      storage = {
        get: jest.fn().mockResolvedValue(null),
        getMany: jest.fn().mockResolvedValue(new Map()),
        save: jest.fn().mockResolvedValue("1"),
        delete: jest.fn().mockResolvedValue(true),
        deleteMany: jest.fn().mockResolvedValue(0),
        find: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        getProviderByName: jest.fn().mockResolvedValue(null),
        getEnabledProviders: jest.fn().mockResolvedValue([]),
        getModelsByProvider: jest.fn().mockResolvedValue([]),
        getModelByKey: jest.fn().mockResolvedValue(null),
        getDefaultModelByType: jest.fn().mockResolvedValue(null),
        createProviderWithModels: jest.fn().mockResolvedValue("1"),
        deleteModel: jest.fn().mockResolvedValue(true),
      };
    });

    it("should implement get method", async () => {
      const mockProvider: LLMProviderV2 = {
        id: 1,
        provider: "openai",
        name: "OpenAI",
        description: "OpenAI Provider",
        baseConfig: { baseURL: "https://api.openai.com/v1" },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      (storage.get as jest.Mock).mockResolvedValue(mockProvider);

      const result = await storage.get("1");

      expect(storage.get).toHaveBeenCalledWith("1");
      expect(result).toEqual(mockProvider);
    });

    it("should implement getMany method", async () => {
      const providers = new Map<string, LLMProviderV2>();
      providers.set("1", {
        id: 1,
        provider: "openai",
        name: "OpenAI",
        baseConfig: { baseURL: "https://api.openai.com/v1" },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      (storage.getMany as jest.Mock).mockResolvedValue(providers);

      const result = await storage.getMany(["1"]);

      expect(storage.getMany).toHaveBeenCalledWith(["1"]);
      expect(result).toBe(providers);
    });

    it("should implement save method", async () => {
      const provider: LLMProviderV2 = {
        id: 0,
        provider: "test",
        name: "Test Provider",
        baseConfig: { baseURL: "http://localhost:8000" },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      (storage.save as jest.Mock).mockResolvedValue("2");

      const result = await storage.save(provider);

      expect(storage.save).toHaveBeenCalledWith(provider);
      expect(result).toBe("2");
    });

    it("should implement delete method", async () => {
      (storage.delete as jest.Mock).mockResolvedValue(true);

      const result = await storage.delete("1");

      expect(storage.delete).toHaveBeenCalledWith("1");
      expect(result).toBe(true);
    });

    it("should implement deleteMany method", async () => {
      (storage.deleteMany as jest.Mock).mockResolvedValue(2);

      const result = await storage.deleteMany(["1", "2"]);

      expect(storage.deleteMany).toHaveBeenCalledWith(["1", "2"]);
      expect(result).toBe(2);
    });

    it("should implement find method", async () => {
      const providers: LLMProviderV2[] = [];
      (storage.find as jest.Mock).mockResolvedValue(providers);

      const query: LLMConfigQuery = { enabled: true };
      const result = await storage.find(query);

      expect(storage.find).toHaveBeenCalledWith(query);
      expect(result).toEqual(providers);
    });

    it("should implement count method", async () => {
      (storage.count as jest.Mock).mockResolvedValue(5);

      const query: LLMConfigQuery = { enabled: true };
      const result = await storage.count(query);

      expect(storage.count).toHaveBeenCalledWith(query);
      expect(result).toBe(5);
    });
  });

  describe("LLM Specific Methods", () => {
    let storage: ILLMConfigStorage;

    beforeEach(() => {
      storage = {
        get: jest.fn(),
        getMany: jest.fn(),
        save: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        find: jest.fn(),
        count: jest.fn(),
        getProviderByName: jest.fn(),
        getEnabledProviders: jest.fn(),
        getModelsByProvider: jest.fn(),
        getModelByKey: jest.fn(),
        getDefaultModelByType: jest.fn(),
        createProviderWithModels: jest.fn(),
        deleteModel: jest.fn(),
      };
    });

    it("should implement getProviderByName method", async () => {
      const mockProvider: LLMProviderV2 = {
        id: 1,
        provider: "openai",
        name: "OpenAI",
        baseConfig: { baseURL: "https://api.openai.com/v1" },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      (storage.getProviderByName as jest.Mock).mockResolvedValue(mockProvider);

      const result = await storage.getProviderByName("openai");

      expect(storage.getProviderByName).toHaveBeenCalledWith("openai");
      expect(result).toEqual(mockProvider);
    });

    it("should return null for non-existent provider", async () => {
      (storage.getProviderByName as jest.Mock).mockResolvedValue(null);

      const result = await storage.getProviderByName("nonexistent");

      expect(result).toBeNull();
    });

    it("should implement getEnabledProviders method", async () => {
      const providers = ["openai", "claude"];
      (storage.getEnabledProviders as jest.Mock).mockResolvedValue(providers);

      const result = await storage.getEnabledProviders();

      expect(storage.getEnabledProviders).toHaveBeenCalled();
      expect(result).toEqual(providers);
    });

    it("should implement getModelsByProvider method", async () => {
      const models: LLMModelV2[] = [
        {
          id: 1,
          providerId: 1,
          modelKey: "gpt-4",
          modelName: "GPT-4",
          modelType: LLMModelType.NLP,
          modelConfig: {},
          enabled: true,
          isDefault: true,
          isAceEvolution: false,
          displayOrder: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      (storage.getModelsByProvider as jest.Mock).mockResolvedValue(models);

      const result = await storage.getModelsByProvider("1");

      expect(storage.getModelsByProvider).toHaveBeenCalledWith("1");
      expect(result).toEqual(models);
    });

    it("should implement getModelByKey method", async () => {
      const model: LLMModelV2 = {
        id: 1,
        providerId: 1,
        modelKey: "gpt-4",
        modelName: "GPT-4",
        modelType: LLMModelType.NLP,
        modelConfig: {},
        enabled: true,
        isDefault: true,
        isAceEvolution: false,
        displayOrder: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      (storage.getModelByKey as jest.Mock).mockResolvedValue(model);

      const result = await storage.getModelByKey("1", "gpt-4");

      expect(storage.getModelByKey).toHaveBeenCalledWith("1", "gpt-4");
      expect(result).toEqual(model);
    });

    it("should implement getDefaultModelByType method", async () => {
      const model: LLMModelV2 = {
        id: 1,
        providerId: 1,
        modelKey: "gpt-4",
        modelName: "GPT-4",
        modelType: LLMModelType.NLP,
        modelConfig: {},
        enabled: true,
        isDefault: true,
        isAceEvolution: false,
        displayOrder: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      (storage.getDefaultModelByType as jest.Mock).mockResolvedValue(model);

      const result = await storage.getDefaultModelByType("nlp");

      expect(storage.getDefaultModelByType).toHaveBeenCalledWith("nlp");
      expect(result).toEqual(model);
    });

    it("should implement createProviderWithModels method", async () => {
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
          isAceEvolution: false,
          displayOrder: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      (storage.createProviderWithModels as jest.Mock).mockResolvedValue("1");

      const result = await storage.createProviderWithModels(provider, models);

      expect(storage.createProviderWithModels).toHaveBeenCalledWith(provider, models);
      expect(result).toBe("1");
    });
  });

  describe("Error Handling", () => {
    let storage: ILLMConfigStorage;

    beforeEach(() => {
      storage = {
        get: jest.fn().mockRejectedValue(new Error("Database error")),
        getMany: jest.fn().mockRejectedValue(new Error("Database error")),
        save: jest.fn().mockRejectedValue(new Error("Database error")),
        delete: jest.fn().mockRejectedValue(new Error("Database error")),
        deleteMany: jest.fn().mockRejectedValue(new Error("Database error")),
        find: jest.fn().mockRejectedValue(new Error("Database error")),
        count: jest.fn().mockRejectedValue(new Error("Database error")),
        getProviderByName: jest.fn().mockRejectedValue(new Error("Database error")),
        getEnabledProviders: jest.fn().mockRejectedValue(new Error("Database error")),
        getModelsByProvider: jest.fn().mockRejectedValue(new Error("Database error")),
        getModelByKey: jest.fn().mockRejectedValue(new Error("Database error")),
        getDefaultModelByType: jest.fn().mockRejectedValue(new Error("Database error")),
        createProviderWithModels: jest.fn().mockRejectedValue(new Error("Database error")),
        deleteModel: jest.fn().mockRejectedValue(new Error("Database error")),
      };
    });

    it("should handle get errors", async () => {
      await expect(storage.get("1")).rejects.toThrow("Database error");
    });

    it("should handle save errors", async () => {
      const provider: LLMProviderV2 = {
        id: 1,
        provider: "test",
        name: "Test",
        baseConfig: { baseURL: "http://localhost" },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await expect(storage.save(provider)).rejects.toThrow("Database error");
    });

    it("should handle delete errors", async () => {
      await expect(storage.delete("1")).rejects.toThrow("Database error");
    });

    it("should handle find errors", async () => {
      await expect(storage.find({})).rejects.toThrow("Database error");
    });

    it("should handle count errors", async () => {
      await expect(storage.count({})).rejects.toThrow("Database error");
    });
  });

  describe("Query Interface", () => {
    it("should accept valid query parameters", () => {
      const validQuery: LLMConfigQuery = {
        enabled: true,
        provider: "openai",
        modelType: "nlp",
        isDefault: true,
        limit: 10,
        offset: 0,
      };

      expect(validQuery.enabled).toBe(true);
      expect(validQuery.provider).toBe("openai");
      expect(validQuery.modelType).toBe("nlp");
      expect(validQuery.isDefault).toBe(true);
      expect(validQuery.limit).toBe(10);
      expect(validQuery.offset).toBe(0);
    });

    it("should accept empty query", () => {
      const emptyQuery: LLMConfigQuery = {};

      expect(emptyQuery).toEqual({});
    });

    it("should accept partial query", () => {
      const partialQuery: LLMConfigQuery = {
        enabled: false,
      };

      expect(partialQuery.enabled).toBe(false);
    });
  });
});
