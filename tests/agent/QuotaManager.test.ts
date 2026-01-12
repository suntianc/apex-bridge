/**
 * QuotaManager 单元测试
 */

import { QuotaManager, QuotaPlan } from "../../src/services/agent/QuotaManager";

// 模拟 logger
jest.mock("../../src/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("QuotaManager", () => {
  let quotaManager: QuotaManager;

  beforeEach(() => {
    quotaManager = new QuotaManager();
  });

  afterEach(() => {
    quotaManager.shutdown();
  });

  describe("checkQuota", () => {
    it("should allow request when quota is available", () => {
      const result = quotaManager.checkQuota("user1", 100);
      expect(result).toBe(true);
    });

    it("should check quota for existing user", () => {
      quotaManager.setQuota("user1", "basic");

      const result = quotaManager.checkQuota("user1", 100);
      expect(result).toBe(true);
    });

    it("should reject request when quota exceeded", () => {
      quotaManager.setQuota("user1", "free");
      quotaManager.incrementUsage("user1", 900, "req1");

      const result = quotaManager.checkQuota("user1", 200);
      expect(result).toBe(false);
    });

    it("should reject request exceeding per-request limit", () => {
      quotaManager.setQuota("user1", "free");

      const result = quotaManager.checkQuota("user1", 200);
      expect(result).toBe(false);
    });

    it("should allow unlimited for enterprise plan", () => {
      quotaManager.setQuota("user1", "enterprise");

      const result = quotaManager.checkQuota("user1", 1000000);
      expect(result).toBe(true);
    });
  });

  describe("incrementUsage", () => {
    it("should increment usage correctly", async () => {
      quotaManager.setQuota("user1", "basic");
      const statusBefore = quotaManager.getQuotaStatus("user1");

      await quotaManager.incrementUsage("user1", 100, "req1");

      const statusAfter = quotaManager.getQuotaStatus("user1");
      expect(statusAfter.dailyUsed).toBe(statusBefore.dailyUsed + 100);
    });

    it("should track usage history", async () => {
      await quotaManager.incrementUsage("user1", 50, "req1", "openai", "gpt-4");

      const history = quotaManager.getUsageHistory("user1");
      expect(history.length).toBe(1);
      expect(history[0].tokens).toBe(50);
      expect(history[0].provider).toBe("openai");
      expect(history[0].model).toBe("gpt-4");
    });
  });

  describe("getQuotaStatus", () => {
    it("should return correct status for free plan", () => {
      quotaManager.setQuota("user1", "free");

      const status = quotaManager.getQuotaStatus("user1");

      expect(status.userId).toBe("user1");
      expect(status.plan).toBe("free");
      expect(status.dailyLimit).toBe(1000);
      expect(status.isExhausted).toBe(false);
    });

    it("should calculate usage percentage", () => {
      quotaManager.setQuota("user1", "basic");
      quotaManager.incrementUsage("user1", 25000, "req1");

      const status = quotaManager.getQuotaStatus("user1");

      expect(status.usagePercentage).toBeCloseTo(50, 0);
      expect(status.isNearLimit).toBe(false);
    });

    it("should detect near limit", () => {
      quotaManager.setQuota("user1", "basic");
      quotaManager.incrementUsage("user1", 40000, "req1");

      const status = quotaManager.getQuotaStatus("user1");

      expect(status.isNearLimit).toBe(true);
    });

    it("should detect exhausted quota", () => {
      quotaManager.setQuota("user1", "free");
      quotaManager.incrementUsage("user1", 1000, "req1");

      const status = quotaManager.getQuotaStatus("user1");

      expect(status.isExhausted).toBe(true);
      expect(status.remaining).toBe(0);
    });
  });

  describe("setQuota", () => {
    it("should set quota for different plans", () => {
      quotaManager.setQuota("user1", "free");
      quotaManager.setQuota("user2", "pro");

      const status1 = quotaManager.getQuotaStatus("user1");
      const status2 = quotaManager.getQuotaStatus("user2");

      expect(status1.plan).toBe("free");
      expect(status1.dailyLimit).toBe(1000);

      expect(status2.plan).toBe("pro");
      expect(status2.dailyLimit).toBe(500000);
    });

    it("should preserve usage when upgrading plan", async () => {
      quotaManager.setQuota("user1", "free");
      await quotaManager.incrementUsage("user1", 500, "req1");

      quotaManager.setQuota("user1", "basic");

      const status = quotaManager.getQuotaStatus("user1");
      expect(status.dailyUsed).toBe(500);
      expect(status.remaining).toBe(49500);
    });
  });

  describe("resetDailyQuota", () => {
    it("should reset daily quota", async () => {
      quotaManager.setQuota("user1", "basic");
      await quotaManager.incrementUsage("user1", 10000, "req1");

      quotaManager.resetDailyQuota("user1");

      const status = quotaManager.getQuotaStatus("user1");
      expect(status.dailyUsed).toBe(0);
      expect(status.remaining).toBe(50000);
    });
  });

  describe("getQuotaOverview", () => {
    it("should return correct overview", () => {
      quotaManager.setQuota("user1", "free");
      quotaManager.setQuota("user2", "basic");
      quotaManager.setQuota("user3", "enterprise");

      const overview = quotaManager.getQuotaOverview();

      expect(overview.totalUsers).toBe(3);
      expect(overview.planDistribution.free).toBe(1);
      expect(overview.planDistribution.basic).toBe(1);
      expect(overview.planDistribution.enterprise).toBe(1);
    });
  });

  describe("getTodayUsage", () => {
    it("should return today usage statistics", async () => {
      await quotaManager.incrementUsage("user1", 100, "req1", "openai", "gpt-4");
      await quotaManager.incrementUsage("user1", 200, "req2", "anthropic", "claude");

      const usage = quotaManager.getTodayUsage("user1");

      expect(usage.totalTokens).toBe(300);
    });
  });

  describe("removeUser", () => {
    it("should remove user quota config", () => {
      quotaManager.setQuota("user1", "free");
      expect(quotaManager.getQuotaStatus("user1").plan).toBe("free");

      quotaManager.removeUser("user1");

      // After removal, should get default quota status
      const status = quotaManager.getQuotaStatus("user1");
      expect(status.plan).toBe("free");
      expect(status.dailyUsed).toBe(0);
    });
  });

  describe("resetAllDailyQuotas", () => {
    it("should reset all user quotas", async () => {
      quotaManager.setQuota("user1", "basic");
      quotaManager.setQuota("user2", "pro");
      quotaManager.setQuota("user3", "enterprise");

      await quotaManager.incrementUsage("user1", 10000, "req1");
      await quotaManager.incrementUsage("user2", 100000, "req2");

      const count = quotaManager.resetAllDailyQuotas();

      expect(count).toBe(2); // Only non-enterprise users
      expect(quotaManager.getQuotaStatus("user1").dailyUsed).toBe(0);
      expect(quotaManager.getQuotaStatus("user2").dailyUsed).toBe(0);
    });
  });
});
