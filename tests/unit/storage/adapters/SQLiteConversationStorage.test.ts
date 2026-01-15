/**
 * SQLiteConversationStorage Adapter Test Suite
 *
 * Tests that the SQLiteConversationStorage adapter correctly implements
 * the IConversationStorage interface using direct database operations.
 */

import type {
  IConversationStorage,
  ConversationQuery,
  ConversationMessage,
} from "@/core/storage/interfaces";
import type { Message } from "@/types";
import Database from "better-sqlite3";
import { SQLiteConversationStorage } from "@/core/storage/sqlite/conversation";

describe("SQLiteConversationStorage", () => {
  let storage: SQLiteConversationStorage;
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    db.exec(`
      CREATE TABLE conversation_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        metadata TEXT
      );

      CREATE INDEX idx_conversation_id ON conversation_messages(conversation_id);
      CREATE INDEX idx_conversation_created ON conversation_messages(conversation_id, created_at);
      CREATE INDEX idx_created_at ON conversation_messages(created_at);
    `);

    storage = new SQLiteConversationStorage();
    (storage as any).db = db;
  });

  afterEach(() => {
    db.close();
  });

  describe("Constructor", () => {
    it("should create instance without error", () => {
      expect(storage).toBeDefined();
      expect(storage).toBeInstanceOf(SQLiteConversationStorage);
    });
  });

  describe("get", () => {
    it("should return message when exists", async () => {
      const message: ConversationMessage = {
        id: 0,
        conversation_id: "conv-1",
        role: "user",
        content: "Hello",
        created_at: Date.now(),
        metadata: "{}",
      };

      await storage.save(message);

      const result = await storage.get("conv-1");

      expect(result).not.toBeNull();
      expect(result?.conversation_id).toBe("conv-1");
      expect(result?.content).toBe("Hello");
    });

    it("should return null when message not exists", async () => {
      const result = await storage.get("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getMany", () => {
    it("should return messages map for valid IDs", async () => {
      const messages: ConversationMessage[] = [
        {
          id: 0,
          conversation_id: "conv-1",
          role: "user",
          content: "Hello",
          created_at: Date.now(),
          metadata: "{}",
        },
        {
          id: 0,
          conversation_id: "conv-2",
          role: "assistant",
          content: "Hi there!",
          created_at: Date.now(),
          metadata: "{}",
        },
      ];

      await storage.save(messages[0]);
      await storage.save(messages[1]);

      const result = await storage.getMany(["conv-1", "conv-2"]);

      expect(result.size).toBe(2);
      expect(result.get("conv-1")?.content).toBe("Hello");
      expect(result.get("conv-2")?.content).toBe("Hi there!");
    });

    it("should return empty map for empty IDs", async () => {
      const result = await storage.getMany([]);

      expect(result.size).toBe(0);
    });

    it("should skip conversations with no messages", async () => {
      const message: ConversationMessage = {
        id: 0,
        conversation_id: "conv-2",
        role: "assistant",
        content: "Hi",
        created_at: Date.now(),
        metadata: "{}",
      };

      await storage.save(message);

      const result = await storage.getMany(["conv-1", "conv-2"]);

      expect(result.size).toBe(1);
      expect(result.has("conv-1")).toBe(false);
      expect(result.has("conv-2")).toBe(true);
    });
  });

  describe("save", () => {
    it("should save message", async () => {
      const message: ConversationMessage = {
        id: 0,
        conversation_id: "conv-1",
        role: "user",
        content: "Hello",
        created_at: Date.now(),
        metadata: "{}",
      };

      const result = await storage.save(message);

      expect(result).toBe("0");

      const messages = await storage.getByConversationId("conv-1");
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("Hello");
    });
  });

  describe("delete", () => {
    it("should return true when delete succeeds", async () => {
      const message: ConversationMessage = {
        id: 0,
        conversation_id: "conv-1",
        role: "user",
        content: "Hello",
        created_at: Date.now(),
        metadata: "{}",
      };

      await storage.save(message);

      const result = await storage.delete("conv-1");

      expect(result).toBe(true);

      const messages = await storage.getByConversationId("conv-1");
      expect(messages).toHaveLength(0);
    });
  });

  describe("deleteMany", () => {
    it("should delete multiple conversations", async () => {
      const messages: ConversationMessage[] = [
        {
          id: 0,
          conversation_id: "conv-1",
          role: "user",
          content: "Hello1",
          created_at: Date.now(),
          metadata: "{}",
        },
        {
          id: 0,
          conversation_id: "conv-2",
          role: "user",
          content: "Hello2",
          created_at: Date.now(),
          metadata: "{}",
        },
        {
          id: 0,
          conversation_id: "conv-3",
          role: "user",
          content: "Hello3",
          created_at: Date.now(),
          metadata: "{}",
        },
      ];

      await storage.save(messages[0]);
      await storage.save(messages[1]);
      await storage.save(messages[2]);

      const result = await storage.deleteMany(["conv-1", "conv-2", "conv-3"]);

      expect(result).toBe(3);

      const count = await storage.count({});
      expect(count).toBe(0);
    });

    it("should return 0 for empty IDs", async () => {
      const message: ConversationMessage = {
        id: 0,
        conversation_id: "conv-1",
        role: "user",
        content: "Hello",
        created_at: Date.now(),
        metadata: "{}",
      };

      await storage.save(message);

      const result = await storage.deleteMany([]);

      expect(result).toBe(0);
    });
  });

  describe("find", () => {
    it("should find messages with conversationId filter", async () => {
      const message: ConversationMessage = {
        id: 0,
        conversation_id: "conv-1",
        role: "user",
        content: "Hello",
        created_at: Date.now(),
        metadata: "{}",
      };

      await storage.save(message);

      const result = await storage.find({ conversationId: "conv-1" });

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("Hello");
    });

    it("should apply limit and offset", async () => {
      const messages: ConversationMessage[] = [
        {
          id: 0,
          conversation_id: "conv-1",
          role: "user",
          content: "Hello1",
          created_at: Date.now(),
          metadata: "{}",
        },
        {
          id: 0,
          conversation_id: "conv-1",
          role: "user",
          content: "Hello2",
          created_at: Date.now() + 1,
          metadata: "{}",
        },
        {
          id: 0,
          conversation_id: "conv-1",
          role: "user",
          content: "Hello3",
          created_at: Date.now() + 2,
          metadata: "{}",
        },
      ];

      await storage.save(messages[0]);
      await storage.save(messages[1]);
      await storage.save(messages[2]);

      const result = await storage.find({ conversationId: "conv-1", limit: 2, offset: 1 });

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe("Hello2");
    });

    it("should return empty array when no conversationId", async () => {
      const result = await storage.find({});

      expect(result).toEqual([]);
    });
  });

  describe("count", () => {
    it("should count messages for conversation", async () => {
      const messages: ConversationMessage[] = [
        {
          id: 0,
          conversation_id: "conv-1",
          role: "user",
          content: "Hello1",
          created_at: Date.now(),
          metadata: "{}",
        },
        {
          id: 0,
          conversation_id: "conv-1",
          role: "user",
          content: "Hello2",
          created_at: Date.now(),
          metadata: "{}",
        },
        {
          id: 0,
          conversation_id: "conv-2",
          role: "user",
          content: "Hello3",
          created_at: Date.now(),
          metadata: "{}",
        },
      ];

      await storage.save(messages[0]);
      await storage.save(messages[1]);
      await storage.save(messages[2]);

      const result = await storage.count({ conversationId: "conv-1" });

      expect(result).toBe(2);
    });

    it("should return 0 when no conversationId", async () => {
      const result = await storage.count({});

      expect(result).toBe(0);
    });
  });

  describe("getByConversationId", () => {
    it("should return messages for conversation", async () => {
      const messages: ConversationMessage[] = [
        {
          id: 0,
          conversation_id: "conv-1",
          role: "user",
          content: "Hello",
          created_at: Date.now(),
          metadata: "{}",
        },
        {
          id: 0,
          conversation_id: "conv-1",
          role: "assistant",
          content: "Hi!",
          created_at: Date.now(),
          metadata: "{}",
        },
      ];

      await storage.save(messages[0]);
      await storage.save(messages[1]);

      const result = await storage.getByConversationId("conv-1", 100, 0);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe("user");
      expect(result[1].role).toBe("assistant");
    });

    it("should use default pagination", async () => {
      const message: ConversationMessage = {
        id: 0,
        conversation_id: "conv-1",
        role: "user",
        content: "Hello",
        created_at: Date.now(),
        metadata: "{}",
      };

      await storage.save(message);

      const result = await storage.getByConversationId("conv-1");

      expect(result).toHaveLength(1);
    });
  });

  describe("getMessageCount", () => {
    it("should return message count", async () => {
      const messages: ConversationMessage[] = [
        {
          id: 0,
          conversation_id: "conv-1",
          role: "user",
          content: "Hello1",
          created_at: Date.now(),
          metadata: "{}",
        },
        {
          id: 0,
          conversation_id: "conv-1",
          role: "user",
          content: "Hello2",
          created_at: Date.now(),
          metadata: "{}",
        },
      ];

      await storage.save(messages[0]);
      await storage.save(messages[1]);

      const result = await storage.getMessageCount("conv-1");

      expect(result).toBe(2);
    });
  });

  describe("getLastMessage", () => {
    it("should return last message", async () => {
      const messages: ConversationMessage[] = [
        {
          id: 0,
          conversation_id: "conv-1",
          role: "user",
          content: "First",
          created_at: Date.now(),
          metadata: "{}",
        },
        {
          id: 0,
          conversation_id: "conv-1",
          role: "assistant",
          content: "Goodbye",
          created_at: Date.now() + 1000,
          metadata: "{}",
        },
      ];

      await storage.save(messages[0]);
      await storage.save(messages[1]);

      const result = await storage.getLastMessage("conv-1");

      expect(result).not.toBeNull();
      expect(result?.content).toBe("Goodbye");
    });

    it("should return null for empty conversation", async () => {
      const result = await storage.getLastMessage("empty-conv");

      expect(result).toBeNull();
    });
  });

  describe("getFirstMessage", () => {
    it("should return first message", async () => {
      const messages: ConversationMessage[] = [
        {
          id: 0,
          conversation_id: "conv-1",
          role: "user",
          content: "First",
          created_at: Date.now(),
          metadata: "{}",
        },
        {
          id: 0,
          conversation_id: "conv-1",
          role: "assistant",
          content: "Second",
          created_at: Date.now() + 1000,
          metadata: "{}",
        },
      ];

      await storage.save(messages[0]);
      await storage.save(messages[1]);

      const result = await storage.getFirstMessage("conv-1");

      expect(result).not.toBeNull();
      expect(result?.content).toBe("First");
    });

    it("should return null for empty conversation", async () => {
      const result = await storage.getFirstMessage("empty-conv");

      expect(result).toBeNull();
    });
  });

  describe("deleteByConversationId", () => {
    it("should delete all messages in conversation", async () => {
      const messages: ConversationMessage[] = [
        {
          id: 0,
          conversation_id: "conv-1",
          role: "user",
          content: "Hello1",
          created_at: Date.now(),
          metadata: "{}",
        },
        {
          id: 0,
          conversation_id: "conv-1",
          role: "user",
          content: "Hello2",
          created_at: Date.now(),
          metadata: "{}",
        },
        {
          id: 0,
          conversation_id: "conv-2",
          role: "user",
          content: "Hello3",
          created_at: Date.now(),
          metadata: "{}",
        },
      ];

      await storage.save(messages[0]);
      await storage.save(messages[1]);
      await storage.save(messages[2]);

      const result = await storage.deleteByConversationId("conv-1");

      expect(result).toBe(2);

      const conv1Count = await storage.getMessageCount("conv-1");
      expect(conv1Count).toBe(0);

      const conv2Count = await storage.getMessageCount("conv-2");
      expect(conv2Count).toBe(1);
    });
  });

  describe("deleteBefore", () => {
    it("should delete messages before timestamp", async () => {
      const now = Date.now();
      const messages: ConversationMessage[] = [
        {
          id: 0,
          conversation_id: "conv-1",
          role: "user",
          content: "Old",
          created_at: now - 100000,
          metadata: "{}",
        },
        {
          id: 0,
          conversation_id: "conv-1",
          role: "user",
          content: "New",
          created_at: now,
          metadata: "{}",
        },
      ];

      await storage.save(messages[0]);
      await storage.save(messages[1]);

      const result = await storage.deleteBefore(now - 50000);

      expect(result).toBe(1);

      const remaining = await storage.getByConversationId("conv-1");
      expect(remaining).toHaveLength(1);
      expect(remaining[0].content).toBe("New");
    });
  });

  describe("saveMessages", () => {
    it("should save batch messages", async () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi!" },
      ];

      await storage.saveMessages("conv-1", messages);

      const result = await storage.getByConversationId("conv-1");

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe("user");
      expect(result[1].role).toBe("assistant");
    });
  });

  describe("Interface Compliance", () => {
    it("should implement IConversationStorage interface", () => {
      const storageMethods: (keyof IConversationStorage)[] = [
        "get",
        "getMany",
        "save",
        "delete",
        "deleteMany",
        "find",
        "count",
        "getByConversationId",
        "getMessageCount",
        "getLastMessage",
        "getFirstMessage",
        "deleteByConversationId",
        "deleteBefore",
        "saveMessages",
      ];

      for (const method of storageMethods) {
        expect(typeof storage[method]).toBe("function");
      }
    });
  });
});
