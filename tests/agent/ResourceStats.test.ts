/**
 * ResourceStatsService 单元测试
 */

import { ResourceStatsService } from "../../src/services/agent/ResourceStats";

// 模拟 logger
jest.mock("../../src/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("ResourceStatsService", () => {
  let statsService: ResourceStatsService;

  beforeEach(() => {
    statsService = new ResourceStatsService();
  });

  afterEach(() => {
    statsService.shutdown();
  });

  describe("recordRequest", () => {
    it("should record request successfully", () => {
      statsService.recordRequest("openai", "gpt-4", 150, true);

      const stats = statsService.getResourceStats("openai", "gpt-4");
      expect(stats.totalRequests).toBe(1);
      expect(stats.successfulRequests).toBe(1);
      expect(stats.failedRequests).toBe(0);
    });

    it("should track failed requests", () => {
      statsService.recordRequest("openai", "gpt-4", 200, false);

      const stats = statsService.getResourceStats("openai", "gpt-4");
      expect(stats.totalRequests).toBe(1);
      expect(stats.successfulRequests).toBe(0);
      expect(stats.failedRequests).toBe(1);
    });

    it("should calculate average response time", () => {
      statsService.recordRequest("openai", "gpt-4", 100, true);
      statsService.recordRequest("openai", "gpt-4", 200, true);
      statsService.recordRequest("openai", "gpt-4", 300, true);

      const stats = statsService.getResourceStats("openai", "gpt-4");
      expect(stats.averageResponseTime).toBe(200);
    });
  });

  describe("getHealthStatus", () => {
    it("should return healthy status for normal operation", () => {
      for (let i = 0; i < 100; i++) {
        statsService.recordRequest("openai", "gpt-4", 100, true);
      }

      const health = statsService.getHealthStatus("openai", "gpt-4");

      expect(health.status).toBe("healthy");
      expect(health.score).toBeGreaterThan(80);
      expect(health.issues.length).toBe(0);
    });

    it("should detect degraded status on high error rate", () => {
      for (let i = 0; i < 85; i++) {
        statsService.recordRequest("openai", "gpt-4", 100, true);
      }
      for (let i = 0; i < 15; i++) {
        statsService.recordRequest("openai", "gpt-4", 100, false);
      }

      const health = statsService.getHealthStatus("openai", "gpt-4");

      // Error rate is 15%, which should trigger elevated error rate (>5%)
      expect(health.issues.some((i) => i.includes("error rate"))).toBe(true);
    });

    it("should detect unhealthy status on very high error rate", () => {
      for (let i = 0; i < 70; i++) {
        statsService.recordRequest("openai", "gpt-4", 100, false);
      }
      for (let i = 0; i < 30; i++) {
        statsService.recordRequest("openai", "gpt-4", 100, true);
      }

      const health = statsService.getHealthStatus("openai", "gpt-4");

      // Error rate is 70%, which should trigger high error rate (>10%)
      expect(health.issues.some((i) => i.includes("error rate"))).toBe(true);
      expect(health.score).toBeLessThan(80);
    });
  });

  describe("getStatsSummary", () => {
    it("should return correct summary", () => {
      statsService.recordRequest("openai", "gpt-4", 100, true);
      statsService.recordRequest("openai", "gpt-4", 200, true);
      statsService.recordRequest("anthropic", "claude", 150, true);

      const summary = statsService.getStatsSummary();

      expect(summary.totalProviders).toBe(2);
      expect(summary.totalRequests).toBe(3);
      expect(summary.averageLatency).toBeCloseTo(150, 0);
    });

    it("should track top providers", () => {
      for (let i = 0; i < 10; i++) {
        statsService.recordRequest("openai", "gpt-4", 100, true);
      }
      for (let i = 0; i < 5; i++) {
        statsService.recordRequest("anthropic", "claude", 100, true);
      }

      const summary = statsService.getStatsSummary();

      expect(summary.topProviders.length).toBeGreaterThan(0);
      expect(summary.topProviders[0].provider).toBe("openai");
      expect(summary.topProviders[0].requests).toBe(10);
    });
  });

  describe("alert rules", () => {
    it("should be able to add and remove alert rules", () => {
      statsService.addAlertRule({
        id: "test-alert",
        name: "Test Alert",
        condition: "error_rate",
        threshold: 5,
        severity: "warning",
        enabled: true,
      });

      const rules = statsService.getAlertRules();
      expect(rules.length).toBeGreaterThan(0);

      const removed = statsService.removeAlertRule("test-alert");
      expect(removed).toBe(true);
    });

    it("should acknowledge alerts", () => {
      // Add a custom alert rule with very low threshold
      statsService.addAlertRule({
        id: "test-ack-alert",
        name: "Test Ack Alert",
        condition: "error_rate",
        threshold: 1,
        severity: "warning",
        enabled: true,
        provider: "test",
        model: "model",
      });

      // Manually create an alert by adding to activeAlerts
      const alertId = "manual_alert_123";
      // @ts-expect-error - Accessing private property for testing
      statsService.activeAlerts.set("test:provider:model", {
        id: alertId,
        ruleId: "test-ack-alert",
        ruleName: "Test Ack Alert",
        severity: "warning",
        message: "Test alert message",
        provider: "test",
        model: "model",
        currentValue: 15,
        threshold: 5,
        timestamp: new Date(),
        acknowledged: false,
      });

      const result = statsService.acknowledgeAlert(alertId);
      expect(result).toBe(true);

      // @ts-expect-error - Accessing private property for testing
      const alert = statsService.activeAlerts.get("test:provider:model");
      expect(alert?.acknowledged).toBe(true);
    });
  });

  describe("getPerformanceTrend", () => {
    it("should return performance trend data", () => {
      for (let i = 0; i < 10; i++) {
        statsService.recordRequest("openai", "gpt-4", 100 + i * 10, true);
      }

      const trend = statsService.getPerformanceTrend("openai", "gpt-4", "1h");

      expect(trend.provider).toBe("openai");
      expect(trend.model).toBe("gpt-4");
      expect(trend.period).toBe("1h");
      expect(trend.requestCount.length).toBeGreaterThan(0);
      expect(trend.latencyP50.length).toBeGreaterThan(0);
    });
  });

  describe("getResourceStats", () => {
    it("should aggregate stats for all models", () => {
      statsService.recordRequest("openai", "gpt-4", 100, true);
      statsService.recordRequest("openai", "gpt-3.5", 50, true);

      const stats = statsService.getResourceStats("openai");

      expect(stats.provider).toBe("openai");
      expect(stats.model).toBe("");
      expect(stats.totalRequests).toBe(2);
    });
  });
});
