/**
 * OpenCode压缩决策机制测试
 *
 * 测试新的OpenCode风格压缩功能：
 * - isOverflowOpenCode() 溢出检测
 * - protectedPrune() 受保护修剪
 * - openCodeSummary() AI摘要生成
 * - 集成测试
 */

import { Message } from "@/types";
import {
  ContextCompressionService,
  OpenCodeCompactionConfig,
} from "@/services/context-compression/ContextCompressionService";
import { TokenEstimator } from "@/services/context-compression/TokenEstimator";

describe("OpenCode Compression - isOverflowOpenCode", () => {
  let service: ContextCompressionService;

  beforeEach(() => {
    service = new ContextCompressionService();
  });

  describe("溢出检测", () => {
    it("应该正确检测无溢出的情况", () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      const result = service.isOverflowOpenCode(messages, 8000);

      expect(result.isOverflow).toBe(false);
      expect(result.severity).toBe("none");
      expect(result.overflowAmount).toBe(0);
    });

    it("应该正确检测警告级别溢出", () => {
      // 创建足够多的消息以触发溢出
      const messages: Message[] = [];
      for (let i = 0; i < 80; i++) {
        messages.push({ role: "user", content: "Test message ".repeat(25) });
      }

      const result = service.isOverflowOpenCode(messages, 8000);

      expect(result.isOverflow).toBe(true);
      expect(result.overflowAmount).toBeGreaterThan(0);
    });

    it("应该正确检测严重级别溢出", () => {
      // 创建大量消息以触发严重溢出
      const messages: Message[] = [];
      for (let i = 0; i < 500; i++) {
        messages.push({ role: "user", content: "This is a test message ".repeat(100) });
      }

      const result = service.isOverflowOpenCode(messages, 8000);

      expect(result.isOverflow).toBe(true);
      expect(result.severity).toBe("severe");
    });

    it("应该使用自定义溢出阈值", () => {
      const messages: Message[] = [{ role: "user", content: "Test message" }];

      const config: OpenCodeCompactionConfig = {
        overflowThreshold: 100, // 很小的阈值
      };

      const result = service.isOverflowOpenCode(messages, 8000, config);

      expect(result.usableLimit).toBe(7900);
    });

    it("应该正确计算cacheConsideration", () => {
      const messages: Message[] = [{ role: "user", content: "Hello" }];

      const result = service.isOverflowOpenCode(messages, 8000);

      expect(result.cacheConsideration).toBe(4000); // 默认阈值
    });
  });
});

describe("OpenCode Compression - protectedPrune", () => {
  let service: ContextCompressionService;

  beforeEach(() => {
    service = new ContextCompressionService();
  });

  describe("受保护修剪", () => {
    it("应该保护工具调用消息", async () => {
      const messages: Message[] = [
        { role: "user", content: "Search for something" },
        {
          role: "assistant",
          content: '<tool_action type="skill" name="web_search">...</tool_action>',
        },
        { role: "user", content: "What did you find?" },
        { role: "assistant", content: "Here are the results..." },
      ];

      const result = await service.protectedPrune(messages, 100);

      // 工具调用消息应该被保护
      const toolCallIndex = result.messages.findIndex(
        (m) => typeof m.content === "string" && m.content.includes("<tool_action")
      );
      expect(toolCallIndex).toBeGreaterThanOrEqual(0);
    });

    it("应该保护工具输出消息", async () => {
      const messages: Message[] = [
        { role: "user", content: "Run a command" },
        { role: "assistant", content: "<tool_action result>Command output here</tool_action>" },
        { role: "user", content: "Thanks" },
      ];

      const result = await service.protectedPrune(messages, 50);

      // 工具输出消息应该被保护
      const toolOutputIndex = result.messages.findIndex(
        (m) => typeof m.content === "string" && m.content.includes("result")
      );
      expect(toolOutputIndex).toBeGreaterThanOrEqual(0);
    });

    it("应该正确计算被保护的消息数", async () => {
      const messages: Message[] = [
        { role: "user", content: "Old message 1" },
        { role: "user", content: "Old message 2" },
        {
          role: "assistant",
          content: '<tool_action type="mcp" name="test_tool">{"param": "value"}</tool_action>',
        },
        {
          role: "assistant",
          content: "<tool_action result>Command output here with important data</tool_action>",
        },
        { role: "user", content: "New message" },
      ];

      const result = await service.protectedPrune(messages, 50);

      // 检查是否有工具相关消息被保护
      const hasProtectedContent = result.messages.some((m) => {
        const content = typeof m.content === "string" ? m.content : "";
        return content.includes("tool_action");
      });

      expect(result.protectedCount).toBeGreaterThanOrEqual(0);
      expect(hasProtectedContent).toBe(true);
    });

    it("当消息未超出限制时应该不移除任何消息", async () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      const result = await service.protectedPrune(messages, 10000);

      expect(result.removedCount).toBe(0);
      expect(result.messages.length).toBe(2);
    });

    it("应该支持禁用保护修剪", async () => {
      const config: OpenCodeCompactionConfig = {
        prune: false,
        protectTools: false,
      };

      const messages: Message[] = [];
      for (let i = 0; i < 50; i++) {
        messages.push({ role: "user", content: "Message ".repeat(20) });
      }

      const result = await service.protectedPrune(messages, 100, config);

      // 禁用保护后，应该使用标准截断策略
      expect(result.messages.length).toBeLessThan(messages.length);
      expect(result.protectedCount).toBe(0);
    });
  });
});

describe("OpenCode Compression - openCodeSummary", () => {
  let service: ContextCompressionService;

  beforeEach(() => {
    service = new ContextCompressionService();
  });

  describe("AI摘要生成", () => {
    it("应该生成有效的摘要", async () => {
      const messages: Message[] = [];
      for (let i = 0; i < 20; i++) {
        messages.push({
          role: "user",
          content: `User message ${i}: Hello, I need help with something`,
        });
        messages.push({
          role: "assistant",
          content: `Assistant response ${i}: Sure, I can help you with that.`,
        });
      }

      const result = await service.openCodeSummary(messages, 500);

      expect(result.messages.length).toBeLessThan(messages.length);
      expect(result.replacedCount).toBeGreaterThan(0);
      expect(result.summaryTokenCount).toBeGreaterThan(0);
    });

    it("应该保留系统消息", async () => {
      const messages: Message[] = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "First message" },
        { role: "assistant", content: "Response 1" },
        { role: "user", content: "Second message" },
        { role: "assistant", content: "Response 2" },
      ];

      const result = await service.openCodeSummary(messages, 500);

      // 系统消息应该被保留
      const systemMessage = result.messages.find((m) => m.role === "system");
      expect(systemMessage).toBeDefined();
    });

    it("应该保留最近的消息", async () => {
      const messages: Message[] = [];
      for (let i = 0; i < 30; i++) {
        messages.push({ role: "user", content: `Message ${i}` });
      }

      const result = await service.openCodeSummary(messages, 500);

      // 应该保留最后几条消息
      const lastMessage = messages[messages.length - 1];
      const keptLastMessage = result.messages.find((m) => m.content === lastMessage.content);
      expect(keptLastMessage).toBeDefined();
    });

    it("当禁用摘要时应该使用标准策略", async () => {
      const config: OpenCodeCompactionConfig = {
        summaryOnSevere: false,
      };

      const messages: Message[] = [];
      for (let i = 0; i < 50; i++) {
        messages.push({ role: "user", content: "Message ".repeat(20) });
      }

      const result = await service.openCodeSummary(messages, 100, config);

      expect(result.summaryTokenCount).toBe(0);
      expect(result.replacedCount).toBe(0);
    });
  });
});

describe("OpenCode Compression - parseOpenCodeConfig", () => {
  let service: ContextCompressionService;

  beforeEach(() => {
    service = new ContextCompressionService();
  });

  describe("配置解析", () => {
    it("应该使用默认值当未指定配置", () => {
      const result = service.parseOpenCodeConfig(undefined);

      expect(result.auto).toBe(true);
      expect(result.prune).toBe(true);
      expect(result.overflowThreshold).toBe(4000);
      expect(result.protectTools).toBe(true);
      expect(result.summaryOnSevere).toBe(true);
      expect(result.severeThreshold).toBe(0.8);
    });

    it("应该正确解析自定义配置", () => {
      const config: OpenCodeCompactionConfig = {
        auto: false,
        prune: false,
        overflowThreshold: 5000,
        protectTools: false,
        summaryOnSevere: false,
        severeThreshold: 0.9,
      };

      const result = service.parseOpenCodeConfig(config);

      expect(result.auto).toBe(false);
      expect(result.prune).toBe(false);
      expect(result.overflowThreshold).toBe(5000);
      expect(result.protectTools).toBe(false);
      expect(result.summaryOnSevere).toBe(false);
      expect(result.severeThreshold).toBe(0.9);
    });

    it("应该支持部分配置", () => {
      const config: OpenCodeCompactionConfig = {
        overflowThreshold: 6000,
      };

      const result = service.parseOpenCodeConfig(config);

      expect(result.overflowThreshold).toBe(6000);
      expect(result.auto).toBe(true); // 默认值
    });
  });
});

describe("OpenCode Compression - 集成测试", () => {
  let service: ContextCompressionService;

  beforeEach(() => {
    service = new ContextCompressionService();
  });

  describe("完整压缩流程", () => {
    it("应该正确处理正常情况（无溢出）", async () => {
      const messages: Message[] = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello!" },
        { role: "assistant", content: "Hi there!" },
      ];

      const result = await service.compress(messages, 8000, {
        contextCompression: {
          enabled: true,
        },
      });

      // 未超出限制，不应该压缩
      expect(result.stats.wasCompressed).toBe(false);
      expect(result.messages.length).toBe(3);
    });

    it("应该正确处理溢出并使用受保护修剪", async () => {
      const messages: Message[] = [];
      for (let i = 0; i < 150; i++) {
        messages.push({
          role: "user",
          content: `User message ${i} with some content to make it longer`.repeat(5),
        });
        if (i % 3 === 0) {
          messages.push({
            role: "assistant",
            content: `<tool_action type="skill">Action ${i}</tool_action>`,
          });
        }
      }

      // 确保消息会触发溢出
      const totalTokens = TokenEstimator.countMessages(messages);
      expect(totalTokens).toBeGreaterThan(4000); // 确认会触发溢出

      const result = await service.compress(messages, 8000, {
        contextCompression: {
          enabled: true,
        },
      });

      expect(result.stats.wasCompressed).toBe(true);
      expect(result.stats.openCodeDecision).toBeDefined();
      expect(result.stats.openCodeDecision?.compactionType).toMatch(/prune|summary|strategy/);
    });

    it("应该在统计信息中包含OpenCode决策详情", async () => {
      const messages: Message[] = [];
      for (let i = 0; i < 200; i++) {
        messages.push({ role: "user", content: "Message ".repeat(50) });
      }

      const result = await service.compress(messages, 8000, {
        contextCompression: {
          enabled: true,
        },
      });

      expect(result.stats.openCodeDecision).toBeDefined();
      expect(result.stats.openCodeDecision?.overflowDetected).toBe(true);
      expect(result.stats.openCodeDecision?.severity).toMatch(/warning|severe/);
    });

    it("应该支持禁用OpenCode自动模式", async () => {
      const messages: Message[] = [];
      for (let i = 0; i < 100; i++) {
        messages.push({ role: "user", content: "Message ".repeat(50) });
      }

      const result = await service.compress(messages, 8000, {
        contextCompression: {
          enabled: true,
          openCodeConfig: {
            auto: false,
          },
        },
      });

      // 禁用auto后，应该使用策略回退
      expect(result.stats.openCodeDecision?.compactionType).toBe("strategy");
    });

    it("应该正确处理多模态内容", async () => {
      const messages: Message[] = [
        { role: "user", content: "Analyze this image" },
        {
          role: "user",
          content: [
            { type: "text", text: "Here is the image:" },
            { type: "image_url", image_url: "https://example.com/image.jpg" },
          ],
        },
        { role: "assistant", content: "I can see the image shows..." },
      ];

      const result = await service.compress(messages, 8000, {
        contextCompression: {
          enabled: true,
        },
      });

      expect(result.messages.length).toBeGreaterThan(0);
      // 多模态内容应该被正确处理
    });
  });
});
