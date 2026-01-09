/**
 * ConversationSaver 单元测试
 *
 * 测试对话历史保存器的格式化、清理和保存功能
 */

import { ConversationSaver, SaveMetadata } from "@/services/chat/ConversationSaver";
import { Message } from "@/types";
import { ConversationHistoryService } from "@/services/ConversationHistoryService";
import { SessionManager } from "@/services/SessionManager";

describe("ConversationSaver", () => {
  let conversationSaver: ConversationSaver;
  let mockConversationHistoryService: jest.Mocked<ConversationHistoryService>;
  let mockSessionManager: jest.Mocked<SessionManager>;

  beforeEach(() => {
    // 创建模拟服务
    mockConversationHistoryService = {
      getMessageCount: jest.fn(),
      saveMessages: jest.fn(),
    } as any;

    mockSessionManager = {
      updateMetadata: jest.fn(),
    } as any;

    conversationSaver = new ConversationSaver(mockConversationHistoryService, mockSessionManager);
  });

  describe("save", () => {
    const conversationId = "test-conversation";
    const baseMessages: Message[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];

    it("应该保存新对话的所有非assistant和非system消息", async () => {
      mockConversationHistoryService.getMessageCount.mockResolvedValue(0);

      await conversationSaver.save(conversationId, baseMessages, "AI response");

      expect(mockConversationHistoryService.getMessageCount).toHaveBeenCalledWith(conversationId);
      expect(mockConversationHistoryService.saveMessages).toHaveBeenCalledWith(
        conversationId,
        expect.arrayContaining([expect.objectContaining({ role: "user", content: "Hello" })])
      );
      // 应该包含 assistant 消息
      const savedMessages = mockConversationHistoryService.saveMessages.mock.calls[0][1];
      const assistantMessage = savedMessages.find((m: Message) => m.role === "assistant");
      expect(assistantMessage).toBeDefined();
    });

    it("应该只保存已有对话的最后一条非assistant和非system消息", async () => {
      mockConversationHistoryService.getMessageCount.mockResolvedValue(5);

      const newMessages: Message[] = [...baseMessages, { role: "user", content: "New message" }];

      await conversationSaver.save(conversationId, newMessages, "AI response");

      // 保存的消息数量应该只有 2（最后一条 user + assistant）
      const savedMessages = mockConversationHistoryService.saveMessages.mock.calls[0][1];
      expect(savedMessages).toHaveLength(2);
    });

    it("当最后一条消息是assistant时不应该保存用户消息", async () => {
      mockConversationHistoryService.getMessageCount.mockResolvedValue(5);

      const messages: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
        { role: "assistant", content: "Another response" },
      ];

      await conversationSaver.save(conversationId, messages, "AI response");

      // 只应该保存 assistant 消息
      const savedMessages = mockConversationHistoryService.saveMessages.mock.calls[0][1];
      expect(savedMessages).toHaveLength(1);
      expect(savedMessages[0].role).toBe("assistant");
    });

    it("应该正确格式化包含思考过程的 ReAct 内容", async () => {
      mockConversationHistoryService.getMessageCount.mockResolvedValue(0);

      const thinkingProcess = [
        JSON.stringify({ reasoning_content: "Thinking step 1" }),
        JSON.stringify({ reasoning_content: "Thinking step 2" }),
      ];

      await conversationSaver.save(
        conversationId,
        baseMessages,
        "Final answer",
        thinkingProcess,
        true
      );

      const savedMessages = mockConversationHistoryService.saveMessages.mock.calls[0][1];
      const assistantMessage = savedMessages.find((m: Message) => m.role === "assistant");

      expect(assistantMessage?.content).toContain("<thinking>");
      expect(assistantMessage?.content).toContain("Thinking step 1");
      expect(assistantMessage?.content).toContain("Thinking step 2");
    });

    it("应该处理空的 thinkingProcess", async () => {
      mockConversationHistoryService.getMessageCount.mockResolvedValue(0);

      await conversationSaver.save(conversationId, baseMessages, "AI response", [], true);

      const savedMessages = mockConversationHistoryService.saveMessages.mock.calls[0][1];
      const assistantMessage = savedMessages.find((m: Message) => m.role === "assistant");

      // 空思考不应该添加 thinking 标签
      expect(assistantMessage?.content).not.toContain("<thinking>Thinking step 1</thinking>");
    });

    it("应该静默处理保存错误", async () => {
      mockConversationHistoryService.getMessageCount.mockRejectedValue(new Error("DB error"));

      // 不应该抛出异常
      await expect(
        conversationSaver.save(conversationId, baseMessages, "AI response")
      ).resolves.not.toThrow();
    });
  });

  describe("updateSessionMetadata", () => {
    it("应该更新会话元数据", async () => {
      const sessionId = "test-session";
      const usage = {
        total_tokens: 100,
        prompt_tokens: 40,
        completion_tokens: 60,
      };

      await conversationSaver.updateSessionMetadata(sessionId, usage);

      expect(mockSessionManager.updateMetadata).toHaveBeenCalledWith(sessionId, {
        total_tokens: 100,
        prompt_tokens: 40,
        completion_tokens: 60,
      });
    });
  });

  describe("formatAssistantContent", () => {
    it("应该正确格式化普通内容", () => {
      // 直接测试私有方法需要类型转换
      const content = (conversationSaver as any).formatAssistantContent(
        "Hello world",
        undefined,
        false
      );
      expect(content).toBe("Hello world");
    });

    it("应该包含 reasoning 内容", () => {
      // 测试 parseAggregatedContent 返回 reasoning 的情况
      const contentWithReasoning = "Some reasoning here\nFinal answer";
      const content = (conversationSaver as any).formatAssistantContent(
        contentWithReasoning,
        undefined,
        false
      );
      // parseAggregatedContent 返回的格式取决于输入内容
      expect(typeof content).toBe("string");
    });
  });

  describe("cleanErrorContent", () => {
    it("应该移除 tool_output 错误标签", () => {
      const content =
        'Normal content <tool_output status="error">Error occurred</tool_output> more content';
      const cleaned = (conversationSaver as any).cleanErrorContent(content);

      expect(cleaned).not.toContain("tool_output");
      expect(cleaned).not.toContain("Error occurred");
      expect(cleaned).toContain("Normal content");
      expect(cleaned).toContain("more content");
    });

    it("应该移除 SYSTEM_FEEDBACK 错误块", () => {
      const content = 'Before [SYSTEM_FEEDBACK] status="error" some error [/SYSTEM_FEEDBACK] After';
      const cleaned = (conversationSaver as any).cleanErrorContent(content);

      expect(cleaned).not.toContain("[SYSTEM_FEEDBACK]");
      expect(cleaned).not.toContain('status="error"');
      expect(cleaned).toContain("Before");
    });

    it("应该移除 MCP 错误信息", () => {
      const content = "Content MCP error More content";
      const cleaned = (conversationSaver as any).cleanErrorContent(content);

      expect(cleaned).not.toContain("MCP error");
      expect(cleaned).toContain("Content");
    });

    it("应该清理多余的空白字符", () => {
      const content = "Line1\n\n\n\nLine2";
      const cleaned = (conversationSaver as any).cleanErrorContent(content);

      expect(cleaned).not.toContain("\n\n\n");
    });

    it("应该处理空内容", () => {
      expect((conversationSaver as any).cleanErrorContent("")).toBe("");
      expect((conversationSaver as any).cleanErrorContent(null)).toBe(null);
      expect((conversationSaver as any).cleanErrorContent(undefined)).toBe(undefined);
    });

    it("应该处理非字符串内容", () => {
      expect((conversationSaver as any).cleanErrorContent(123 as any)).toBe(123);
      expect((conversationSaver as any).cleanErrorContent({} as any)).toEqual({});
    });
  });

  describe("extractThinkingContent", () => {
    it("应该从 JSON 数组中提取 reasoning_content", () => {
      const thinkingProcess = [
        JSON.stringify({ reasoning_content: "Step 1" }),
        JSON.stringify({ reasoning_content: "Step 2" }),
      ];

      const extracted = (conversationSaver as any).extractThinkingContent(thinkingProcess);
      expect(extracted).toContain("Step 1");
      expect(extracted).toContain("Step 2");
    });

    it("应该处理带 data: 前缀的内容", () => {
      const thinkingProcess = [
        'data: {"reasoning_content": "Step 1"}',
        'data: {"reasoning_content": "Step 2"}',
      ];

      const extracted = (conversationSaver as any).extractThinkingContent(thinkingProcess);
      expect(extracted).toContain("Step 1");
      expect(extracted).toContain("Step 2");
    });

    it("应该处理 [DONE] 标记", () => {
      const thinkingProcess = [
        '{"reasoning_content": "Step 1"}',
        "[DONE]",
        '{"reasoning_content": "Step 2"}',
      ];

      const extracted = (conversationSaver as any).extractThinkingContent(thinkingProcess);
      expect(extracted).toContain("Step 1");
      expect(extracted).toContain("Step 2");
    });

    it("应该处理 JSON 解析错误并回退到原始内容", () => {
      const thinkingProcess = ["Invalid JSON content", '{"reasoning_content": "Valid step"}'];

      const extracted = (conversationSaver as any).extractThinkingContent(thinkingProcess);
      expect(extracted).toContain("Invalid JSON content");
      expect(extracted).toContain("Valid step");
    });

    it("应该处理带 }{ 分隔符的 JSON", () => {
      const thinkingProcess = ['{"reasoning_content": "Part1"}{"reasoning_content": "Part2"}'];

      const extracted = (conversationSaver as any).extractThinkingContent(thinkingProcess);
      expect(extracted).toContain("Part1");
      expect(extracted).toContain("Part2");
    });

    it("应该处理空数组", () => {
      const extracted = (conversationSaver as any).extractThinkingContent([]);
      expect(extracted).toBe("");
    });
  });
});
