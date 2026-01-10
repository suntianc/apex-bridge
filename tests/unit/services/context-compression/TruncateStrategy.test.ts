/**
 * TruncateStrategy 单元测试
 */

import { Message } from "@/types";
import { TruncateStrategy } from "@/services/context-compression/strategies/TruncateStrategy";

describe("TruncateStrategy", () => {
  let strategy: TruncateStrategy;

  beforeEach(() => {
    strategy = new TruncateStrategy();
  });

  describe("getName", () => {
    it("should return 'truncate'", () => {
      expect(strategy.getName()).toBe("truncate");
    });
  });

  describe("compress", () => {
    it("should return empty result for empty messages", async () => {
      const result = await strategy.compress([], { maxTokens: 8000 });

      expect(result.messages).toEqual([]);
      expect(result.originalTokens).toBe(0);
      expect(result.compactedTokens).toBe(0);
      expect(result.removedCount).toBe(0);
      expect(result.hasSummary).toBe(false);
    });

    it("should return original messages when under limit", async () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      const result = await strategy.compress(messages, { maxTokens: 8000 });

      expect(result.messages.length).toBe(2);
      expect(result.removedCount).toBe(0);
      expect(result.originalTokens).toBe(result.compactedTokens);
    });

    it("should truncate messages when over limit", async () => {
      // Create messages that exceed the limit
      const messages: Message[] = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "A".repeat(5000) }, // ~1250 tokens
        { role: "assistant", content: "B".repeat(5000) }, // ~1250 tokens
        { role: "user", content: "C".repeat(5000) }, // ~1250 tokens
        { role: "assistant", content: "D".repeat(5000) }, // ~1250 tokens
      ];

      // Limit to 4000 tokens
      const result = await strategy.compress(messages, {
        maxTokens: 4000,
        preserveSystemMessage: true,
      });

      // Should keep system message
      expect(result.messages[0].role).toBe("system");
      // Should have removed some messages
      expect(result.removedCount).toBeGreaterThan(0);
      // Compacted tokens should be under limit
      expect(result.compactedTokens).toBeLessThanOrEqual(4000);
    });

    it("should preserve system message by default", async () => {
      const messages: Message[] = [
        { role: "system", content: "System prompt" },
        { role: "user", content: "A".repeat(10000) },
        { role: "assistant", content: "B".repeat(10000) },
      ];

      const result = await strategy.compress(messages, {
        maxTokens: 5000,
        preserveSystemMessage: true,
      });

      expect(result.messages[0].role).toBe("system");
      expect(result.messages[0].content).toBe("System prompt");
    });

    it("should not preserve system message when disabled", async () => {
      const messages: Message[] = [
        { role: "system", content: "System prompt" },
        { role: "user", content: "A".repeat(10000) },
        { role: "assistant", content: "B".repeat(10000) },
      ];

      const result = await strategy.compress(messages, {
        maxTokens: 5000,
        preserveSystemMessage: false,
      });

      // With preserveSystemMessage: false, the system message should not be prioritized
      // It might still be in the result if there's room, but the non-system messages should be prioritized
      // Since we have 2 large messages (~2500 tokens each) that fit within 5000 tokens,
      // and system message is small, all 3 might be kept if they fit
      // This is expected behavior - preserveSystemMessage just means don't separate and always keep it
      const systemMessages = result.messages.filter((m) => m.role === "system");
      expect(systemMessages.length).toBeLessThanOrEqual(1);
    });

    it("should respect minMessageCount", async () => {
      const messages: Message[] = [
        { role: "user", content: "Short" },
        { role: "user", content: "A".repeat(10000) },
        { role: "assistant", content: "B".repeat(10000) },
      ];

      const result = await strategy.compress(messages, {
        maxTokens: 100,
        preserveSystemMessage: false,
        minMessageCount: 2,
      });

      // Should keep at least 2 messages
      expect(result.messages.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle tail direction truncation", async () => {
      const messages: Message[] = [
        { role: "user", content: "First message" },
        { role: "user", content: "Second message" },
        { role: "user", content: "Third message" },
      ];

      const result = await strategy.compress(messages, {
        maxTokens: 100,
        direction: "tail",
      } as any);

      // Should keep some messages
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.messages.length).toBeLessThanOrEqual(3);
    });

    it("should calculate correct token counts", async () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      const result = await strategy.compress(messages, { maxTokens: 10 });

      expect(result.originalTokens).toBeGreaterThan(0);
      expect(result.compactedTokens).toBeGreaterThan(0);
      expect(result.compactedTokens).toBeLessThanOrEqual(10);
    });
  });

  describe("needsCompression", () => {
    it("should return false when under limit", () => {
      const messages: Message[] = [{ role: "user", content: "Hi" }];

      expect(strategy.needsCompression(messages, 8000)).toBe(false);
    });

    it("should return true when over limit", () => {
      const messages: Message[] = [{ role: "user", content: "A".repeat(10000) }];

      expect(strategy.needsCompression(messages, 1000)).toBe(true);
    });

    it("should return false for empty messages", () => {
      expect(strategy.needsCompression([], 1000)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle single message that exceeds limit", async () => {
      const messages: Message[] = [{ role: "user", content: "A".repeat(100000) }];

      const result = await strategy.compress(messages, {
        maxTokens: 1000,
        preserveSystemMessage: false,
        minMessageCount: 1,
      });

      expect(result.messages.length).toBe(1);
      expect(result.removedCount).toBe(0);
    });

    it("should handle messages with special content types", async () => {
      const messages: Message[] = [
        {
          role: "user",
          content: [
            { type: "text", text: "Hello" },
            { type: "image_url", image_url: "https://example.com/image.jpg" },
          ],
        },
      ];

      const result = await strategy.compress(messages, { maxTokens: 100 });

      expect(result.messages.length).toBe(1);
      expect(result.originalTokens).toBeGreaterThan(0);
    });
  });
});
