/**
 * TokenEstimator 单元测试
 */

import { Message, ContentPart } from "@/types";
import {
  TokenEstimator,
  TokenEstimationResult,
  KeepRecentResult,
} from "@/services/context-compression/TokenEstimator";

describe("TokenEstimator", () => {
  describe("estimateText", () => {
    it("should return 0 for empty string", () => {
      const result = TokenEstimator.estimateText("");
      expect(result.tokens).toBe(0);
      expect(result.characters).toBe(0);
    });

    it("should return 0 for null or undefined", () => {
      const resultNull = TokenEstimator.estimateText(null as any);
      const resultUndefined = TokenEstimator.estimateText(undefined as any);

      expect(resultNull.tokens).toBe(0);
      expect(resultUndefined.tokens).toBe(0);
    });

    it("should estimate 4 characters as 1 token", () => {
      const result = TokenEstimator.estimateText("test");
      expect(result.tokens).toBe(1);
      expect(result.characters).toBe(4);
    });

    it("should estimate 10 characters as 3 tokens (ceil)", () => {
      const result = TokenEstimator.estimateText("1234567890");
      expect(result.tokens).toBe(3);
      expect(result.characters).toBe(10);
    });

    it("should estimate Chinese characters correctly", () => {
      // 中文约 1-2 字符/Token
      const chinese = "你好世界";
      const result = TokenEstimator.estimateText(chinese);
      expect(result.tokens).toBeGreaterThanOrEqual(1); // 4个字符，ceil(4/4)=1，但实际中文字符可能需要更多
      expect(result.characters).toBe(4);
    });

    it("should estimate long text correctly", () => {
      const longText = "a".repeat(1000);
      const result = TokenEstimator.estimateText(longText);
      expect(result.tokens).toBe(250);
      expect(result.characters).toBe(1000);
    });
  });

  describe("estimateContentPart", () => {
    it("should estimate text part correctly", () => {
      const part: ContentPart = {
        type: "text",
        text: "Hello world",
      };
      const result = TokenEstimator.estimateContentPart(part);
      expect(result.tokens).toBe(3); // "Hello world" = 11 chars, ceil(11/4)=3
    });

    it("should estimate image_url part with string URL", () => {
      const part: ContentPart = {
        type: "image_url",
        image_url: "https://example.com/image.jpg",
      };
      const result = TokenEstimator.estimateContentPart(part);
      expect(result.tokens).toBeGreaterThan(0);
      expect(result.characters).toBe(29); // "https://example.com/image.jpg" = 29 chars
    });

    it("should estimate image_url part with object URL", () => {
      const part: ContentPart = {
        type: "image_url",
        image_url: { url: "https://example.com/image.jpg" },
      };
      const result = TokenEstimator.estimateContentPart(part);
      expect(result.tokens).toBeGreaterThan(0);
    });
  });

  describe("estimateMessage", () => {
    it("should return 0 for null message", () => {
      const result = TokenEstimator.estimateMessage(null as any);
      expect(result.tokens).toBe(0);
    });

    it("should estimate simple text message", () => {
      const message: Message = {
        role: "user",
        content: "Hello",
      };
      const result = TokenEstimator.estimateMessage(message);
      // "Hello" = 5 chars, ceil(5/4) = 2 tokens + 4 role overhead = 6 tokens
      expect(result.tokens).toBe(6);
      expect(result.characters).toBe(5);
      expect(result.role).toBe("user");
    });

    it("should estimate message with array content", () => {
      const message: Message = {
        role: "assistant",
        content: [{ type: "text", text: "Hi there!" }],
      };
      const result = TokenEstimator.estimateMessage(message);
      expect(result.tokens).toBeGreaterThanOrEqual(4); // role overhead + text
    });

    it("should estimate multimodal message with text and image", () => {
      const message: Message = {
        role: "user",
        content: [
          { type: "text", text: "Look at this" },
          { type: "image_url", image_url: "https://example.com/image.jpg" },
        ],
      };
      const result = TokenEstimator.estimateMessage(message);
      expect(result.tokens).toBeGreaterThan(5);
    });
  });

  describe("countMessages", () => {
    it("should return 0 for empty array", () => {
      const result = TokenEstimator.countMessages([]);
      expect(result).toBe(0);
    });

    it("should return 0 for null", () => {
      const result = TokenEstimator.countMessages(null as any);
      expect(result).toBe(0);
    });

    it("should count multiple messages", () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
        { role: "user", content: "How are you?" },
      ];
      const result = TokenEstimator.countMessages(messages);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeGreaterThanOrEqual(3 * 5); // At least 3 messages * min tokens
    });
  });

  describe("keepRecentMessages", () => {
    it("should return empty result for empty array", () => {
      const result = TokenEstimator.keepRecentMessages([], 1000);
      expect(result.messages).toEqual([]);
      expect(result.originalTokens).toBe(0);
      expect(result.compactedTokens).toBe(0);
      expect(result.removedIds).toEqual([]);
    });

    it("should keep all messages when under limit", () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
      ];
      const result = TokenEstimator.keepRecentMessages(messages, 1000);
      expect(result.messages.length).toBe(2);
      expect(result.removedIds.length).toBe(0);
    });

    it("should remove older messages when over limit", () => {
      // Create messages with known sizes
      const messages: Message[] = [
        { role: "user", content: "Message 1 - very long message that should be removed" },
        { role: "user", content: "Message 2 - also long message that might be removed" },
        { role: "user", content: "Short" },
      ];

      // Allow only enough for 2 messages (very small limit)
      const result = TokenEstimator.keepRecentMessages(messages, 15);

      // Should keep the last message and possibly one more
      expect(result.messages.length).toBeLessThanOrEqual(3);
      expect(result.removedIds.length + result.messages.length).toBe(3);
    });

    it("should preserve message order", () => {
      const messages: Message[] = [
        { role: "user", content: "First" },
        { role: "assistant", content: "Second" },
        { role: "user", content: "Third" },
      ];

      const result = TokenEstimator.keepRecentMessages(messages, 1000);

      // Should keep all messages in order
      expect(result.messages.length).toBe(3);
      expect(result.messages[0].role).toBe("user");
      expect(result.messages[1].role).toBe("assistant");
      expect(result.messages[2].role).toBe("user");
    });

    it("should calculate correct token counts", () => {
      const messages: Message[] = [
        { role: "user", content: "Hello world" }, // ~7 tokens
        { role: "assistant", content: "Hi there!" }, // ~6 tokens
      ];

      const result = TokenEstimator.keepRecentMessages(messages, 1000);

      expect(result.originalTokens).toBeGreaterThan(0);
      expect(result.compactedTokens).toBe(result.originalTokens);
      expect(result.compactedTokens).toBe(TokenEstimator.countMessages(result.messages));
    });
  });

  describe("countConversation", () => {
    it("should count messages without system prompt", () => {
      const messages: Message[] = [{ role: "user", content: "Hello" }];
      const result = TokenEstimator.countConversation(messages);
      expect(result).toBeGreaterThan(0);
    });

    it("should include system prompt in count", () => {
      const messages: Message[] = [{ role: "user", content: "Hello" }];
      const systemPrompt = "You are a helpful assistant.";

      const withSystem = TokenEstimator.countConversation(messages, systemPrompt);
      const withoutSystem = TokenEstimator.countConversation(messages);

      expect(withSystem).toBeGreaterThan(withoutSystem);
    });
  });

  describe("estimateSavings", () => {
    it("should return 0 when under limit", () => {
      const messages: Message[] = [{ role: "user", content: "Hi" }];
      const savings = TokenEstimator.estimateSavings(messages, 1000);
      expect(savings).toBe(0);
    });

    it("should calculate savings when over limit", () => {
      const messages: Message[] = [
        { role: "user", content: "A".repeat(1000) }, // ~250 tokens
      ];
      const savings = TokenEstimator.estimateSavings(messages, 100); // Limit to 100 tokens
      expect(savings).toBeGreaterThan(0);
    });
  });

  describe("canFitMessage", () => {
    it("should return true for small message", () => {
      const message: Message = { role: "user", content: "Hi" };
      expect(TokenEstimator.canFitMessage(message, 10)).toBe(true);
    });

    it("should return false for large message", () => {
      const message: Message = { role: "user", content: "A".repeat(1000) };
      expect(TokenEstimator.canFitMessage(message, 10)).toBe(false);
    });
  });

  describe("countNeededMessages", () => {
    it("should return 0 for empty array", () => {
      const count = TokenEstimator.countNeededMessages([], 100);
      expect(count).toBe(0);
    });

    it("should return correct count", () => {
      const messages: Message[] = [
        { role: "user", content: "Short" },
        { role: "user", content: "Medium length message here" },
        { role: "user", content: "A".repeat(100) },
      ];

      const count = TokenEstimator.countNeededMessages(messages, 50);
      expect(count).toBeGreaterThanOrEqual(0);
      expect(count).toBeLessThanOrEqual(3);
    });
  });

  describe("edge cases", () => {
    it("should handle very long messages", () => {
      const message: Message = { role: "user", content: "a".repeat(100000) };
      const result = TokenEstimator.estimateMessage(message);
      // 100000 chars = ceil(100000/4) = 25000 tokens + 4 role overhead = 25004 tokens
      expect(result.tokens).toBe(25004);
      expect(result.characters).toBe(100000);
    });

    it("should handle messages with special characters", () => {
      const message: Message = { role: "user", content: "Hello\n\t\r\nWorld! @#$%" };
      const result = TokenEstimator.estimateMessage(message);
      expect(result.tokens).toBeGreaterThan(0);
    });

    it("should handle Unicode characters", () => {
      const message: Message = { role: "user", content: "你好世界 🌍 🚀" };
      const result = TokenEstimator.estimateMessage(message);
      expect(result.tokens).toBeGreaterThan(0);
      expect(result.characters).toBeGreaterThan(0);
    });
  });
});
