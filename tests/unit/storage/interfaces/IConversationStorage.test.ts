/**
 * IConversationStorage Interface Test Suite
 *
 * Tests that the IConversationStorage interface is properly defined
 * and can be implemented by various storage adapters.
 */

import type {
  IConversationStorage,
  ConversationQuery,
  ConversationMessage,
} from "@/core/storage/interfaces";

describe("IConversationStorage Interface", () => {
  describe("Type Definition", () => {
    it("should be a valid interface type", () => {
      const storage: IConversationStorage = {
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

      expect(storage).toBeDefined();
      expect(typeof storage.get).toBe("function");
      expect(typeof storage.getMany).toBe("function");
      expect(typeof storage.save).toBe("function");
      expect(typeof storage.delete).toBe("function");
      expect(typeof storage.deleteMany).toBe("function");
      expect(typeof storage.find).toBe("function");
      expect(typeof storage.count).toBe("function");
      expect(typeof storage.getByConversationId).toBe("function");
      expect(typeof storage.getMessageCount).toBe("function");
      expect(typeof storage.getLastMessage).toBe("function");
      expect(typeof storage.getFirstMessage).toBe("function");
      expect(typeof storage.deleteByConversationId).toBe("function");
      expect(typeof storage.deleteBefore).toBe("function");
      expect(typeof storage.saveMessages).toBe("function");
    });
  });

  describe("Base Storage Methods", () => {
    let storage: IConversationStorage;

    beforeEach(() => {
      storage = {
        get: jest.fn().mockResolvedValue(null),
        getMany: jest.fn().mockResolvedValue(new Map()),
        save: jest.fn().mockResolvedValue("1"),
        delete: jest.fn().mockResolvedValue(true),
        deleteMany: jest.fn().mockResolvedValue(0),
        find: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        getByConversationId: jest.fn().mockResolvedValue([]),
        getMessageCount: jest.fn().mockResolvedValue(0),
        getLastMessage: jest.fn().mockResolvedValue(null),
        getFirstMessage: jest.fn().mockResolvedValue(null),
        deleteByConversationId: jest.fn().mockResolvedValue(0),
        deleteBefore: jest.fn().mockResolvedValue(0),
        saveMessages: jest.fn().mockResolvedValue(undefined),
      };
    });

    it("should implement get method", async () => {
      const mockMessage: ConversationMessage = {
        id: 1,
        conversation_id: "conv-1",
        role: "user",
        content: "Hello",
        created_at: Date.now(),
        metadata: "{}",
      };

      (storage.get as jest.Mock).mockResolvedValue(mockMessage);

      const result = await storage.get("1");

      expect(storage.get).toHaveBeenCalledWith("1");
      expect(result).toEqual(mockMessage);
    });

    it("should implement getMany method", async () => {
      const messages = new Map<string, ConversationMessage>();
      messages.set("1", {
        id: 1,
        conversation_id: "conv-1",
        role: "user",
        content: "Hello",
        created_at: Date.now(),
        metadata: "{}",
      });

      (storage.getMany as jest.Mock).mockResolvedValue(messages);

      const result = await storage.getMany(["1"]);

      expect(storage.getMany).toHaveBeenCalledWith(["1"]);
      expect(result).toBe(messages);
    });

    it("should implement save method", async () => {
      const message: ConversationMessage = {
        id: 0,
        conversation_id: "conv-1",
        role: "user",
        content: "Hello",
        created_at: Date.now(),
        metadata: "{}",
      };

      (storage.save as jest.Mock).mockResolvedValue("2");

      const result = await storage.save(message);

      expect(storage.save).toHaveBeenCalledWith(message);
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
      const messages: ConversationMessage[] = [];
      (storage.find as jest.Mock).mockResolvedValue(messages);

      const query: ConversationQuery = { conversationId: "conv-1" };
      const result = await storage.find(query);

      expect(storage.find).toHaveBeenCalledWith(query);
      expect(result).toEqual(messages);
    });

    it("should implement count method", async () => {
      (storage.count as jest.Mock).mockResolvedValue(5);

      const query: ConversationQuery = { conversationId: "conv-1" };
      const result = await storage.count(query);

      expect(storage.count).toHaveBeenCalledWith(query);
      expect(result).toBe(5);
    });
  });

  describe("Conversation Specific Methods", () => {
    let storage: IConversationStorage;

    beforeEach(() => {
      storage = {
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

    it("should implement getByConversationId method", async () => {
      const messages: ConversationMessage[] = [
        {
          id: 1,
          conversation_id: "conv-1",
          role: "user",
          content: "Hello",
          created_at: Date.now(),
          metadata: "{}",
        },
        {
          id: 2,
          conversation_id: "conv-1",
          role: "assistant",
          content: "Hi there!",
          created_at: Date.now(),
          metadata: "{}",
        },
      ];

      (storage.getByConversationId as jest.Mock).mockResolvedValue(messages);

      const result = await storage.getByConversationId("conv-1", 100, 0);

      expect(storage.getByConversationId).toHaveBeenCalledWith("conv-1", 100, 0);
      expect(result).toEqual(messages);
    });

    it("should implement getByConversationId with default pagination", async () => {
      (storage.getByConversationId as jest.Mock).mockResolvedValue([]);

      await storage.getByConversationId("conv-1");

      expect(storage.getByConversationId).toHaveBeenCalled();
      expect((storage.getByConversationId as jest.Mock).mock.calls[0][0]).toBe("conv-1");
    });

    it("should implement getMessageCount method", async () => {
      (storage.getMessageCount as jest.Mock).mockResolvedValue(10);

      const result = await storage.getMessageCount("conv-1");

      expect(storage.getMessageCount).toHaveBeenCalledWith("conv-1");
      expect(result).toBe(10);
    });

    it("should implement getLastMessage method", async () => {
      const lastMessage: ConversationMessage = {
        id: 2,
        conversation_id: "conv-1",
        role: "assistant",
        content: "Goodbye",
        created_at: Date.now(),
        metadata: "{}",
      };

      (storage.getLastMessage as jest.Mock).mockResolvedValue(lastMessage);

      const result = await storage.getLastMessage("conv-1");

      expect(storage.getLastMessage).toHaveBeenCalledWith("conv-1");
      expect(result).toEqual(lastMessage);
    });

    it("should return null for empty conversation", async () => {
      (storage.getLastMessage as jest.Mock).mockResolvedValue(null);

      const result = await storage.getLastMessage("empty-conv");

      expect(result).toBeNull();
    });

    it("should implement getFirstMessage method", async () => {
      const firstMessage: ConversationMessage = {
        id: 1,
        conversation_id: "conv-1",
        role: "user",
        content: "Hello",
        created_at: Date.now(),
        metadata: "{}",
      };

      (storage.getFirstMessage as jest.Mock).mockResolvedValue(firstMessage);

      const result = await storage.getFirstMessage("conv-1");

      expect(storage.getFirstMessage).toHaveBeenCalledWith("conv-1");
      expect(result).toEqual(firstMessage);
    });

    it("should implement deleteByConversationId method", async () => {
      (storage.deleteByConversationId as jest.Mock).mockResolvedValue(5);

      const result = await storage.deleteByConversationId("conv-1");

      expect(storage.deleteByConversationId).toHaveBeenCalledWith("conv-1");
      expect(result).toBe(5);
    });

    it("should implement deleteBefore method", async () => {
      (storage.deleteBefore as jest.Mock).mockResolvedValue(10);

      const result = await storage.deleteBefore(Date.now() - 86400000);

      expect(storage.deleteBefore).toHaveBeenCalledWith(expect.any(Number));
      expect(result).toBe(10);
    });

    it("should implement saveMessages method", async () => {
      (storage.saveMessages as jest.Mock).mockResolvedValue(undefined);

      const messages = [
        { role: "user" as const, content: "Hello" },
        { role: "assistant" as const, content: "Hi!" },
      ];

      await storage.saveMessages("conv-1", messages);

      expect(storage.saveMessages).toHaveBeenCalledWith("conv-1", messages);
    });
  });

  describe("Error Handling", () => {
    let storage: IConversationStorage;

    beforeEach(() => {
      storage = {
        get: jest.fn().mockRejectedValue(new Error("Database error")),
        getMany: jest.fn().mockRejectedValue(new Error("Database error")),
        save: jest.fn().mockRejectedValue(new Error("Database error")),
        delete: jest.fn().mockRejectedValue(new Error("Database error")),
        deleteMany: jest.fn().mockRejectedValue(new Error("Database error")),
        find: jest.fn().mockRejectedValue(new Error("Database error")),
        count: jest.fn().mockRejectedValue(new Error("Database error")),
        getByConversationId: jest.fn().mockRejectedValue(new Error("Database error")),
        getMessageCount: jest.fn().mockRejectedValue(new Error("Database error")),
        getLastMessage: jest.fn().mockRejectedValue(new Error("Database error")),
        getFirstMessage: jest.fn().mockRejectedValue(new Error("Database error")),
        deleteByConversationId: jest.fn().mockRejectedValue(new Error("Database error")),
        deleteBefore: jest.fn().mockRejectedValue(new Error("Database error")),
        saveMessages: jest.fn().mockRejectedValue(new Error("Database error")),
      };
    });

    it("should handle get errors", async () => {
      await expect(storage.get("1")).rejects.toThrow("Database error");
    });

    it("should handle save errors", async () => {
      const message: ConversationMessage = {
        id: 1,
        conversation_id: "conv-1",
        role: "user",
        content: "Hello",
        created_at: Date.now(),
        metadata: "{}",
      };

      await expect(storage.save(message)).rejects.toThrow("Database error");
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

    it("should handle getByConversationId errors", async () => {
      await expect(storage.getByConversationId("conv-1")).rejects.toThrow("Database error");
    });

    it("should handle getMessageCount errors", async () => {
      await expect(storage.getMessageCount("conv-1")).rejects.toThrow("Database error");
    });

    it("should handle getLastMessage errors", async () => {
      await expect(storage.getLastMessage("conv-1")).rejects.toThrow("Database error");
    });

    it("should handle getFirstMessage errors", async () => {
      await expect(storage.getFirstMessage("conv-1")).rejects.toThrow("Database error");
    });

    it("should handle deleteByConversationId errors", async () => {
      await expect(storage.deleteByConversationId("conv-1")).rejects.toThrow("Database error");
    });

    it("should handle deleteBefore errors", async () => {
      await expect(storage.deleteBefore(Date.now())).rejects.toThrow("Database error");
    });

    it("should handle saveMessages errors", async () => {
      await expect(storage.saveMessages("conv-1", [])).rejects.toThrow("Database error");
    });
  });

  describe("Query Interface", () => {
    it("should accept valid query parameters", () => {
      const validQuery: ConversationQuery = {
        conversationId: "conv-1",
        role: "user",
        limit: 10,
        offset: 0,
        startTime: 1000000000000,
        endTime: 2000000000000,
      };

      expect(validQuery.conversationId).toBe("conv-1");
      expect(validQuery.role).toBe("user");
      expect(validQuery.limit).toBe(10);
      expect(validQuery.offset).toBe(0);
      expect(validQuery.startTime).toBe(1000000000000);
      expect(validQuery.endTime).toBe(2000000000000);
    });

    it("should accept empty query", () => {
      const emptyQuery: ConversationQuery = {};

      expect(emptyQuery).toEqual({});
    });

    it("should accept partial query", () => {
      const partialQuery: ConversationQuery = {
        role: "assistant",
        limit: 50,
      };

      expect(partialQuery.role).toBe("assistant");
      expect(partialQuery.limit).toBe(50);
    });

    it("should accept all role types", () => {
      const userQuery: ConversationQuery = { role: "user" };
      const assistantQuery: ConversationQuery = { role: "assistant" };
      const systemQuery: ConversationQuery = { role: "system" };

      expect(userQuery.role).toBe("user");
      expect(assistantQuery.role).toBe("assistant");
      expect(systemQuery.role).toBe("system");
    });
  });

  describe("ConversationMessage Structure", () => {
    it("should have correct structure", () => {
      const message: ConversationMessage = {
        id: 1,
        conversation_id: "conv-123",
        role: "user",
        content: "What is the meaning of life?",
        created_at: 1704067200000,
        metadata: JSON.stringify({ source: "web" }),
      };

      expect(message.id).toBe(1);
      expect(message.conversation_id).toBe("conv-123");
      expect(message.role).toBe("user");
      expect(message.content).toBe("What is the meaning of life?");
      expect(message.created_at).toBe(1704067200000);
      expect(typeof message.metadata).toBe("string");
    });

    it("should allow optional metadata", () => {
      const message: ConversationMessage = {
        id: 1,
        conversation_id: "conv-1",
        role: "assistant",
        content: "42",
        created_at: Date.now(),
      };

      expect(message.metadata).toBeUndefined();
    });
  });
});
