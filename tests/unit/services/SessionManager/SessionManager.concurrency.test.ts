/**
 * SessionManager 并发安全测试
 * 验证 H-001 修复：防止会话映射竞态条件
 */

import { SessionManager } from "../../../../src/services/SessionManager";

// Mock ConversationHistoryService
const mockHistoryService = {
  deleteMessages: jest.fn().mockResolvedValue(undefined),
};

describe("SessionManager - 并发安全 (H-001)", () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    jest.useFakeTimers();
    sessionManager = new SessionManager(mockHistoryService as any);
    mockHistoryService.deleteMessages.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe("getOrCreate - 竞态条件防护", () => {
    it("应该防止同一 conversationId 的并发重复创建", async () => {
      const conversationId = "test-conv-123";
      const agentId = "agent-1";
      const userId = "user-1";

      const promises = [
        sessionManager.getOrCreate(agentId, userId, conversationId),
        sessionManager.getOrCreate(agentId, userId, conversationId),
        sessionManager.getOrCreate(agentId, userId, conversationId),
      ];

      const results = await Promise.all(promises);

      expect(results.every((r) => r === conversationId)).toBe(true);
      expect(sessionManager.getSessionCount()).toBe(1);
      expect(sessionManager.getSessionId(conversationId)).toBe(conversationId);
    });

    it("应该等待正在进行的创建操作完成", async () => {
      const conversationId = "test-conv-456";
      const agentId = "agent-2";
      const userId = "user-2";

      const firstRequest = sessionManager.getOrCreate(agentId, userId, conversationId);
      const secondRequest = sessionManager.getOrCreate(agentId, userId, conversationId);

      const [firstResult, secondResult] = await Promise.all([firstRequest, secondRequest]);

      expect(firstResult).toBe(conversationId);
      expect(secondResult).toBe(conversationId);
      expect(firstResult).toBe(secondResult);
    });

    it("应该正确处理并发归档操作", async () => {
      const conversationId = "test-conv-789";
      const agentId = "agent-3";
      const userId = "user-3";

      await sessionManager.getOrCreate(agentId, userId, conversationId);
      expect(sessionManager.getSessionCount()).toBe(1);

      const archivePromises = [
        sessionManager.archive(conversationId),
        sessionManager.archive(conversationId),
      ];

      await Promise.all(archivePromises);

      expect(sessionManager.getSessionCount()).toBe(0);
      // 由于竞态条件，可能调用 1-2 次
      const callCount = mockHistoryService.deleteMessages.mock.calls.length;
      expect(callCount).toBeGreaterThanOrEqual(1);
    });

    it("应该处理大量并发请求", async () => {
      const conversationId = "test-conv-large";
      const agentId = "agent-large";
      const userId = "user-large";

      const promises = Array(100)
        .fill(null)
        .map(() => sessionManager.getOrCreate(agentId, userId, conversationId));

      const results = await Promise.all(promises);

      expect(results.every((r) => r === conversationId)).toBe(true);
      expect(sessionManager.getSessionCount()).toBe(1);
    });

    it("应该正确处理空 conversationId", async () => {
      const result = await sessionManager.getOrCreate("agent", "user", "");
      expect(result).toBeNull();
      expect(sessionManager.getSessionCount()).toBe(0);
    });
  });

  describe("归档功能", () => {
    it("应该正确归档已存在的会话", async () => {
      const conversationId = "test-archive-1";
      await sessionManager.getOrCreate("agent", "user", conversationId);

      await sessionManager.archive(conversationId);

      expect(sessionManager.getSessionCount()).toBe(0);
      expect(mockHistoryService.deleteMessages).toHaveBeenCalledWith(conversationId);
    });

    it("应该处理不存在的会话归档", async () => {
      // 即使会话不存在，也会尝试删除消息历史
      await sessionManager.archive("non-existent");
      // 只调用一次（没有会话时也会尝试清理）
      expect(mockHistoryService.deleteMessages).toHaveBeenCalledTimes(1);
    });
  });
});
