/**
 * ContextCompressionService 单元测试
 */

import { Message, ChatOptions } from "@/types";
import {
  ContextCompressionService,
  CompressionStrategyType,
} from "@/services/context-compression/ContextCompressionService";

describe("ContextCompressionService", () => {
  let service: ContextCompressionService;

  beforeEach(() => {
    service = new ContextCompressionService();
  });

  describe("compress", () => {
    it("should return original messages when compression is disabled", async () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      const options: ChatOptions = {
        contextCompression: {
          enabled: false,
        },
      };

      const result = await service.compress(messages, 8000, options);

      expect(result.messages.length).toBe(2);
      expect(result.stats.wasCompressed).toBe(false);
      expect(result.stats.savedTokens).toBe(0);
    });

    it("should return original messages when under limit", async () => {
      const messages: Message[] = [{ role: "user", content: "Hello" }];

      const result = await service.compress(messages, 8000);

      expect(result.messages.length).toBe(1);
      expect(result.stats.wasCompressed).toBe(false);
    });

    it("should compress messages when over limit", async () => {
      const messages: Message[] = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "A".repeat(5000) },
        { role: "assistant", content: "B".repeat(5000) },
        { role: "user", content: "C".repeat(5000) },
        { role: "assistant", content: "D".repeat(5000) },
      ];

      const result = await service.compress(messages, 4000);

      expect(result.stats.wasCompressed).toBe(true);
      expect(result.stats.compactedTokens).toBeLessThanOrEqual(4000);
    });

    it("should preserve system message by default", async () => {
      const messages: Message[] = [
        { role: "system", content: "System prompt" },
        { role: "user", content: "A".repeat(10000) },
        { role: "assistant", content: "B".repeat(10000) },
      ];

      const result = await service.compress(messages, 5000);

      expect(result.messages[0].role).toBe("system");
    });

    it("should calculate correct stats", async () => {
      const messages: Message[] = [
        { role: "user", content: "A".repeat(4000) },
        { role: "assistant", content: "B".repeat(4000) },
      ];

      const result = await service.compress(messages, 2000);

      expect(result.stats.originalMessageCount).toBe(2);
      expect(result.stats.originalTokens).toBeGreaterThan(0);
      expect(result.stats.savedTokens).toBeGreaterThanOrEqual(0);
      expect(result.stats.savingsRatio).toBeGreaterThanOrEqual(0);
      expect(result.stats.strategy).toBe("truncate");
    });

    it("should apply custom output reserve", async () => {
      const messages: Message[] = [
        { role: "user", content: "A".repeat(4000) },
        { role: "assistant", content: "B".repeat(4000) },
      ];

      const options: ChatOptions = {
        contextCompression: {
          outputReserve: 6000,
        },
      };

      // contextLimit=8000, outputReserve=6000, usable=2000
      // 2 messages x ~1000 tokens each = ~2000 tokens, should fit
      const result = await service.compress(messages, 8000, options);

      // With 2 messages of ~1000 tokens each, total ~2000, which equals usable limit
      expect(result.stats.compactedTokens).toBeLessThanOrEqual(2500);
    });

    it("should apply absolute limit as fallback", async () => {
      const messages: Message[] = [{ role: "user", content: "A".repeat(100000) }];

      const result = await service.compress(messages, 8000);

      // Absolute limit is 1000, single message exceeds limit and gets removed
      // This is expected - truncate strategy removes entire messages
      expect(result.messages.length).toBeLessThanOrEqual(1);
      expect(result.stats.compactedTokens).toBeLessThanOrEqual(1000);
    });
  });

  describe("needsCompression", () => {
    it("should return false when under limit", () => {
      const messages: Message[] = [{ role: "user", content: "Hi" }];

      expect(service.needsCompression(messages, 8000)).toBe(false);
    });

    it("should return true when over limit", () => {
      const messages: Message[] = [{ role: "user", content: "A".repeat(10000) }];

      expect(service.needsCompression(messages, 1000)).toBe(true);
    });

    it("should handle custom strategy from options", () => {
      const messages: Message[] = [{ role: "user", content: "A".repeat(10000) }];

      const options: ChatOptions = {
        contextCompression: {
          strategy: "truncate",
        },
      };

      // Even with custom options, needsCompression should check if over limit
      const result = service.needsCompression(messages, 1000, options);
      expect(result).toBe(true);
    });
  });

  describe("getAvailableStrategies", () => {
    it("should return list of available strategies", () => {
      const strategies = service.getAvailableStrategies();

      expect(strategies).toContain("truncate");
      expect(strategies).toContain("prune");
      expect(strategies).toContain("summary");
      expect(strategies).toContain("hybrid");
    });
  });

  describe("configuration parsing", () => {
    it("should use default values when not specified", async () => {
      const messages: Message[] = [{ role: "user", content: "A".repeat(10000) }];

      // No contextCompression option
      const result = await service.compress(messages, 8000);

      // Should use default: enabled=true, strategy='truncate'
      expect(result.stats.strategy).toBe("truncate");
    });

    it("should respect custom strategy from options", async () => {
      const messages: Message[] = [{ role: "user", content: "A".repeat(10000) }];

      const options: ChatOptions = {
        contextCompression: {
          strategy: "truncate", // Even though we request truncate, it's the default
        },
      };

      const result = await service.compress(messages, 8000, options);

      expect(result.stats.strategy).toBe("truncate");
    });
  });

  describe("edge cases", () => {
    it("should handle empty messages", async () => {
      const result = await service.compress([], 8000);

      expect(result.messages).toEqual([]);
      expect(result.stats.originalTokens).toBe(0);
      expect(result.stats.compactedTokens).toBe(0);
    });

    it("should handle messages with multimodal content", async () => {
      const messages: Message[] = [
        {
          role: "user",
          content: [
            { type: "text", text: "Hello" },
            { type: "image_url", image_url: "https://example.com/image.jpg" },
          ],
        },
      ];

      const result = await service.compress(messages, 8000);

      expect(result.messages.length).toBe(1);
    });

    it("should handle very large context limit", async () => {
      const messages: Message[] = [{ role: "user", content: "A".repeat(10000) }];

      // Large context limit means no compression needed
      const result = await service.compress(messages, 100000);

      expect(result.stats.wasCompressed).toBe(false);
    });
  });
});
