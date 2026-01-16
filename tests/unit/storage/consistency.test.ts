/**
 * Unit Tests for Consistent Dual-Write Adapter
 */

import {
  ConsistentDualWriteAdapter,
  ConsistentDualWriteQueryableAdapter,
  ConsistentDualWriteLLMConfigAdapter,
  ReadWriteSplitLLMConfigAdapter,
  ReadWriteSplitConversationAdapter,
} from "@/core/storage/consistent-dual-write";
import {
  ReadWriteSplitAdapter,
  ReadWriteSplitQueryableAdapter,
} from "@/core/storage/read-write-split";
import type {
  IStorageAdapter,
  IQueryableStorage,
  ILLMConfigStorage,
  IConversationStorage,
  LLMConfigQuery,
  ConversationQuery,
} from "@/core/storage/interfaces";
import type { LLMProviderV2, LLMModelV2, LLMModelFull } from "@/types/llm-models";
import type { ConversationMessage } from "@/core/storage/interfaces";
import { logger } from "@/utils/logger";

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

describe("ConsistentDualWriteAdapter", () => {
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

      const adapter = new ConsistentDualWriteAdapter<TestRecord>(primaryMock, secondaryMock, {
        domain: "TestDomain",
        verifyOnWrite: false,
      });
      const result = await adapter.get("test-1");

      expect(result).toEqual(mockRecord);
      expect(primaryMock.get).toHaveBeenCalledWith("test-1");
      expect(secondaryMock.get).not.toHaveBeenCalled();
    });
  });

  describe("save", () => {
    it("should write to primary and async verify to secondary", async () => {
      const entity: TestRecord = { id: "test-1", data: "test" };
      primaryMock.save.mockResolvedValue("test-1");
      primaryMock.get.mockResolvedValue(entity);
      secondaryMock.get.mockResolvedValue(null);
      secondaryMock.save.mockResolvedValue("test-1");

      const adapter = new ConsistentDualWriteAdapter<TestRecord>(primaryMock, secondaryMock, {
        domain: "TestDomain",
        verifyOnWrite: true,
      });
      const result = await adapter.save(entity);

      expect(result).toBe("test-1");
      expect(primaryMock.save).toHaveBeenCalledWith(entity);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(secondaryMock.save).toHaveBeenCalled();
    });

    it("should not verify when verifyOnWrite is false", async () => {
      const entity: TestRecord = { id: "test-1", data: "test" };
      primaryMock.save.mockResolvedValue("test-1");

      const adapter = new ConsistentDualWriteAdapter<TestRecord>(primaryMock, secondaryMock, {
        domain: "TestDomain",
        verifyOnWrite: false,
      });
      const result = await adapter.save(entity);

      expect(result).toBe("test-1");
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(secondaryMock.get).not.toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    it("should delete from both primary and secondary", async () => {
      primaryMock.delete.mockResolvedValue(true);
      secondaryMock.delete.mockResolvedValue(true);

      const adapter = new ConsistentDualWriteAdapter<TestRecord>(primaryMock, secondaryMock, {
        domain: "TestDomain",
      });
      const result = await adapter.delete("test-1");

      expect(result).toBe(true);
      expect(primaryMock.delete).toHaveBeenCalledWith("test-1");
      expect(secondaryMock.delete).toHaveBeenCalledWith("test-1");
    });
  });
});

describe("ReadWriteSplitAdapter", () => {
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
    it("should read from primary when readFromSecondary is false", async () => {
      const mockRecord: TestRecord = { id: "test-1", data: "test" };
      primaryMock.get.mockResolvedValue(mockRecord);

      const adapter = new ReadWriteSplitAdapter<TestRecord>(primaryMock, secondaryMock, {
        domain: "TestDomain",
        readFromSecondary: false,
        fallbackToPrimary: true,
      });
      const result = await adapter.get("test-1");

      expect(result).toEqual(mockRecord);
      expect(primaryMock.get).toHaveBeenCalledWith("test-1");
      expect(secondaryMock.get).not.toHaveBeenCalled();
    });

    it("should read from secondary when available and readFromSecondary is true", async () => {
      const mockRecord: TestRecord = { id: "test-1", data: "test" };
      secondaryMock.get.mockResolvedValue(mockRecord);

      const adapter = new ReadWriteSplitAdapter<TestRecord>(primaryMock, secondaryMock, {
        domain: "TestDomain",
        readFromSecondary: true,
        fallbackToPrimary: true,
      });
      const result = await adapter.get("test-1");

      expect(result).toEqual(mockRecord);
      expect(secondaryMock.get).toHaveBeenCalledWith("test-1");
      expect(primaryMock.get).not.toHaveBeenCalled();
    });

    it("should fallback to primary when secondary fails", async () => {
      const mockRecord: TestRecord = { id: "test-1", data: "test" };
      secondaryMock.get.mockRejectedValue(new Error("Secondary failed"));
      primaryMock.get.mockResolvedValue(mockRecord);

      const adapter = new ReadWriteSplitAdapter<TestRecord>(primaryMock, secondaryMock, {
        domain: "TestDomain",
        readFromSecondary: true,
        fallbackToPrimary: true,
      });
      const result = await adapter.get("test-1");

      expect(result).toEqual(mockRecord);
      expect(primaryMock.get).toHaveBeenCalledWith("test-1");
    });
  });

  describe("save", () => {
    it("should always write to primary", async () => {
      const entity: TestRecord = { id: "test-1", data: "test" };
      primaryMock.save.mockResolvedValue("test-1");

      const adapter = new ReadWriteSplitAdapter<TestRecord>(primaryMock, secondaryMock, {
        domain: "TestDomain",
        readFromSecondary: true,
      });
      const result = await adapter.save(entity);

      expect(result).toBe("test-1");
      expect(primaryMock.save).toHaveBeenCalledWith(entity);
    });
  });

  describe("enable/disable secondary reads", () => {
    it("should enable and disable secondary reads", async () => {
      const mockRecord: TestRecord = { id: "test-1", data: "test" };
      primaryMock.get.mockResolvedValue(mockRecord);
      secondaryMock.get.mockResolvedValue(mockRecord);

      const adapter = new ReadWriteSplitAdapter<TestRecord>(primaryMock, secondaryMock, {
        domain: "TestDomain",
        readFromSecondary: false,
        fallbackToPrimary: true,
      });

      expect(adapter.isReadFromSecondary()).toBe(false);

      adapter.enableSecondaryReads();
      expect(adapter.isReadFromSecondary()).toBe(true);

      adapter.disableSecondaryReads();
      expect(adapter.isReadFromSecondary()).toBe(false);
    });
  });
});

describe("ReadWriteSplitQueryableAdapter", () => {
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
    it("should query from secondary when readFromSecondary is true", async () => {
      const mockResults: TestRecord[] = [{ id: "test-1", data: "test" }];
      secondaryMock.find.mockResolvedValue(mockResults);

      const adapter = new ReadWriteSplitQueryableAdapter<TestRecord, TestQuery>(
        primaryMock,
        secondaryMock,
        { domain: "TestDomain", readFromSecondary: true, fallbackToPrimary: true }
      );
      const result = await adapter.find({});

      expect(result).toEqual(mockResults);
      expect(secondaryMock.find).toHaveBeenCalledWith({});
    });
  });
});

describe("ConsistentDualWriteLLMConfigAdapter", () => {
  let primaryMock: jest.Mocked<ILLMConfigStorage>;
  let secondaryMock: jest.Mocked<ILLMConfigStorage>;

  beforeEach(() => {
    primaryMock = {
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
      getAceEvolutionModel: jest.fn(),
    };
    secondaryMock = {
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
      getAceEvolutionModel: jest.fn(),
    };
  });

  describe("getProviderByName", () => {
    it("should delegate to primary", async () => {
      const mockProvider: LLMProviderV2 = {
        id: 1,
        provider: "openai",
        name: "OpenAI",
        baseConfig: { baseURL: "https://api.openai.com" },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      primaryMock.getProviderByName.mockResolvedValue(mockProvider);

      const adapter = new ConsistentDualWriteLLMConfigAdapter(primaryMock, secondaryMock);
      const result = await adapter.getProviderByName("openai");

      expect(result).toEqual(mockProvider);
      expect(primaryMock.getProviderByName).toHaveBeenCalledWith("openai");
    });
  });

  describe("getEnabledProviders", () => {
    it("should delegate to primary", async () => {
      primaryMock.getEnabledProviders.mockResolvedValue(["openai", "deepseek"]);

      const adapter = new ConsistentDualWriteLLMConfigAdapter(primaryMock, secondaryMock);
      const result = await adapter.getEnabledProviders();

      expect(result).toEqual(["openai", "deepseek"]);
      expect(primaryMock.getEnabledProviders).toHaveBeenCalled();
    });
  });
});

describe("ReadWriteSplitConversationAdapter", () => {
  let primaryMock: jest.Mocked<IConversationStorage>;
  let secondaryMock: jest.Mocked<IConversationStorage>;

  beforeEach(() => {
    primaryMock = {
      get: jest.fn(),
      getMany: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      getByConversationId: jest.fn(),
      getMessageCount: jest.fn(),
      getLastMessage: jest.fn(),
      getFirstMessage: jest.fn(),
      deleteByConversationId: jest.fn(),
      deleteBefore: jest.fn(),
      saveMessages: jest.fn(),
    };
    secondaryMock = {
      get: jest.fn(),
      getMany: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      getByConversationId: jest.fn(),
      getMessageCount: jest.fn(),
      getLastMessage: jest.fn(),
      getFirstMessage: jest.fn(),
      deleteByConversationId: jest.fn(),
      deleteBefore: jest.fn(),
      saveMessages: jest.fn(),
    };
  });

  describe("getByConversationId", () => {
    it("should delegate to primary for read", async () => {
      const mockMessages: ConversationMessage[] = [
        {
          id: 1,
          conversation_id: "conv-1",
          role: "user",
          content: "Hello",
          created_at: Date.now(),
        },
      ];
      primaryMock.getByConversationId.mockResolvedValue(mockMessages);

      const adapter = new ReadWriteSplitConversationAdapter(primaryMock, secondaryMock);
      const result = await adapter.getByConversationId("conv-1");

      expect(result).toEqual(mockMessages);
      expect(primaryMock.getByConversationId).toHaveBeenCalledWith("conv-1", undefined, undefined);
    });
  });

  describe("saveMessages", () => {
    it("should delegate to primary for writes", async () => {
      const messages = [{ role: "user" as const, content: "Hello" }];
      primaryMock.saveMessages.mockResolvedValue();

      const adapter = new ReadWriteSplitConversationAdapter(primaryMock, secondaryMock);
      await adapter.saveMessages("conv-1", messages);

      expect(primaryMock.saveMessages).toHaveBeenCalledWith("conv-1", messages);
    });
  });
});
