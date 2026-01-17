/**
 * PruneStrategy 单元测试
 */

import { Message } from "@/types";
import { PruneStrategy } from "@/services/context-compression/strategies/PruneStrategy";

describe("PruneStrategy", () => {
  let strategy: PruneStrategy;

  beforeEach(() => {
    strategy = new PruneStrategy();
  });

  describe("getName", () => {
    it("should return prune", () => {
      expect(strategy.getName()).toBe("prune");
    });
  });

  describe("needsCompression", () => {
    it("should return false when under token limit", () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];
      expect(strategy.needsCompression(messages, 1000)).toBe(false);
    });

    it("should return true when over token limit", () => {
      const messages: Message[] = [
        { role: "user", content: "A".repeat(1000) },
        { role: "assistant", content: "B".repeat(1000) },
      ];
      expect(strategy.needsCompression(messages, 100)).toBe(true);
    });
  });

  describe("compress", () => {
    it("should return original messages when under limit", async () => {
      const messages: Message[] = [
        { role: "user", content: "Short message" },
        { role: "assistant", content: "Response" },
      ];

      const result = await strategy.compress(messages, { maxTokens: 1000 });

      expect(result.messages).toHaveLength(2);
      expect(result.removedCount).toBe(0);
      expect(result.hasSummary).toBe(false);
    });

    it("should handle empty messages", async () => {
      const result = await strategy.compress([], { maxTokens: 1000 });

      expect(result.messages).toHaveLength(0);
      expect(result.removedCount).toBe(0);
      expect(result.compactedTokens).toBe(0);
    });

    it("should preserve system message", async () => {
      const messages: Message[] = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi!" },
      ];

      const result = await strategy.compress(messages, {
        maxTokens: 1000,
        preserveSystemMessage: true,
      });

      expect(result.messages[0].role).toBe("system");
    });

    it("should calculate original tokens correctly", async () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "World" },
      ];

      const result = await strategy.compress(messages, { maxTokens: 1000 });

      expect(result.originalTokens).toBeGreaterThan(0);
    });
  });
});
