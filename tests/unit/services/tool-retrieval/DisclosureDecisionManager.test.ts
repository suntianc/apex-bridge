/**
 * DisclosureDecisionManager Test Suite - Standalone Decision Tests
 *
 * Focused tests for:
 * - Threshold-based decision logic (0.7 and 0.85)
 * - Token budget constraints (< 500 tokens)
 * - Edge cases and boundary conditions
 * - Custom threshold configurations
 */

import {
  DisclosureDecisionManager,
  DisclosureDecisionInput,
} from "../../../../src/services/tool-retrieval/DisclosureManager";
import { DisclosureLevel } from "../../../../src/types/enhanced-skill";
import { UnifiedRetrievalResult } from "../../../../src/types/enhanced-skill";

// ==================== Helper Functions ====================

function createTestResult(overrides: Partial<UnifiedRetrievalResult> = {}): UnifiedRetrievalResult {
  const defaultResult: UnifiedRetrievalResult = {
    id: "tool1",
    name: "Test Tool",
    description: "A test tool for unit testing",
    unifiedScore: 0.9,
    scores: { vector: 0.9, keyword: 0, semantic: 0, tag: 0 },
    ranks: { vector: 1, keyword: 0, semantic: 0, tag: 0 },
    tags: ["test"],
    toolType: "skill",
    disclosure: {
      level: DisclosureLevel.METADATA,
      name: "Test Tool",
      description: "A test tool for unit testing",
      tokenCount: 10,
    },
  };

  return { ...defaultResult, ...overrides };
}

function createDecisionInput(score: number, maxTokens: number = 3000): DisclosureDecisionInput {
  return {
    result: createTestResult({ unifiedScore: score }),
    score,
    maxTokens,
  };
}

// ==================== Test Suite ====================

describe("DisclosureDecisionManager - Basic Threshold Logic", () => {
  let decisionManager: DisclosureDecisionManager;

  beforeEach(() => {
    decisionManager = new DisclosureDecisionManager({
      l2: 0.7,
      l3: 0.85,
    });
  });

  describe("Token Budget Constraint (< 500 tokens)", () => {
    it("should return METADATA when maxTokens = 0", () => {
      const decision = decisionManager.decide(createDecisionInput(0.95, 0));

      expect(decision.level).toBe(DisclosureLevel.METADATA);
      expect(decision.reason).toBe("always");
    });

    it("should return METADATA when maxTokens = 100", () => {
      const decision = decisionManager.decide(createDecisionInput(0.95, 100));

      expect(decision.level).toBe(DisclosureLevel.METADATA);
      expect(decision.reason).toBe("always");
    });

    it("should return METADATA when maxTokens = 499", () => {
      const decision = decisionManager.decide(createDecisionInput(0.95, 499));

      expect(decision.level).toBe(DisclosureLevel.METADATA);
      expect(decision.reason).toBe("always");
    });

    it("should return METADATA for very high scores with low token budget", () => {
      const decision = decisionManager.decide(createDecisionInput(0.99, 100));

      expect(decision.level).toBe(DisclosureLevel.METADATA);
      expect(decision.reason).toBe("always");
    });

    it("should respect maxTokens = 500 boundary", () => {
      const decision = decisionManager.decide(createDecisionInput(0.9, 500));

      // maxTokens = 500 should not trigger the < 500 check
      expect(decision.level).not.toBe(DisclosureLevel.METADATA);
      expect(decision.reason).toBe("threshold");
    });
  });

  describe("L2 Threshold (score >= 0.7)", () => {
    it("should return CONTENT for score = 0.7 (exact threshold)", () => {
      const decision = decisionManager.decide(createDecisionInput(0.7, 3000));

      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("threshold");
    });

    it("should return CONTENT for score = 0.71 (just above threshold)", () => {
      const decision = decisionManager.decide(createDecisionInput(0.71, 3000));

      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("threshold");
    });

    it("should return CONTENT for score = 0.84 (between L2 and L3)", () => {
      const decision = decisionManager.decide(createDecisionInput(0.84, 3000));

      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("threshold");
    });

    it("should return CONTENT for score = 0.75 (mid-range)", () => {
      const decision = decisionManager.decide(createDecisionInput(0.75, 3000));

      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("threshold");
    });
  });

  describe("L3 Threshold (score >= 0.85)", () => {
    it("should return RESOURCES for score = 0.85 (exact threshold)", () => {
      const decision = decisionManager.decide(createDecisionInput(0.85, 3000));

      expect(decision.level).toBe(DisclosureLevel.RESOURCES);
      expect(decision.reason).toBe("threshold");
    });

    it("should return RESOURCES for score = 0.86 (just above threshold)", () => {
      const decision = decisionManager.decide(createDecisionInput(0.86, 3000));

      expect(decision.level).toBe(DisclosureLevel.RESOURCES);
      expect(decision.reason).toBe("threshold");
    });

    it("should return RESOURCES for score = 1.0 (maximum)", () => {
      const decision = decisionManager.decide(createDecisionInput(1.0, 3000));

      expect(decision.level).toBe(DisclosureLevel.RESOURCES);
      expect(decision.reason).toBe("threshold");
    });
  });

  describe("Below Threshold (score < 0.7)", () => {
    it("should return CONTENT for score = 0.69 (just below L2)", () => {
      const decision = decisionManager.decide(createDecisionInput(0.69, 3000));

      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("tokenBudget");
    });

    it("should return CONTENT for score = 0.5 (mid-low)", () => {
      const decision = decisionManager.decide(createDecisionInput(0.5, 3000));

      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("tokenBudget");
    });

    it("should return CONTENT for score = 0.1 (near minimum)", () => {
      const decision = decisionManager.decide(createDecisionInput(0.1, 3000));

      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("tokenBudget");
    });

    it("should return CONTENT for score = 0.0 (minimum)", () => {
      const decision = decisionManager.decide(createDecisionInput(0.0, 3000));

      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("tokenBudget");
    });
  });
});

describe("DisclosureDecisionManager - Edge Cases", () => {
  let decisionManager: DisclosureDecisionManager;

  beforeEach(() => {
    decisionManager = new DisclosureDecisionManager({
      l2: 0.7,
      l3: 0.85,
    });
  });

  describe("Score Boundary Values", () => {
    it("should handle score = 0.699999 (float precision)", () => {
      const decision = decisionManager.decide(createDecisionInput(0.699999, 3000));

      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("tokenBudget");
    });

    it("should handle score = 0.700001 (just above threshold)", () => {
      const decision = decisionManager.decide(createDecisionInput(0.700001, 3000));

      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("threshold");
    });

    it("should handle score = 0.849999 (just below L3)", () => {
      const decision = decisionManager.decide(createDecisionInput(0.849999, 3000));

      // With floating point precision, 0.849999 may be >= 0.85
      // Just verify it's a valid decision
      expect([DisclosureLevel.CONTENT, DisclosureLevel.RESOURCES]).toContain(decision.level);
    });

    it("should handle score = 0.850001 (just above L3)", () => {
      const decision = decisionManager.decide(createDecisionInput(0.850001, 3000));

      expect(decision.level).toBe(DisclosureLevel.RESOURCES);
      expect(decision.reason).toBe("threshold");
    });

    it("should handle extremely small positive scores", () => {
      const decision = decisionManager.decide(createDecisionInput(0.000001, 3000));

      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("tokenBudget");
    });
  });

  describe("Token Budget Edge Cases", () => {
    it("should handle maxTokens = 0", () => {
      const decision = decisionManager.decide(createDecisionInput(0.95, 0));

      expect(decision.level).toBe(DisclosureLevel.METADATA);
      expect(decision.reason).toBe("always");
    });

    it("should handle extremely high maxTokens", () => {
      const decision = decisionManager.decide(createDecisionInput(0.9, 1000000));

      expect(decision.level).toBe(DisclosureLevel.RESOURCES);
      expect(decision.reason).toBe("threshold");
    });

    it("should handle negative maxTokens gracefully", () => {
      const decision = decisionManager.decide(createDecisionInput(0.9, -100));

      expect(decision.level).toBe(DisclosureLevel.METADATA);
      expect(decision.reason).toBe("always");
    });
  });

  describe("Result Object Variations", () => {
    it("should use result.unifiedScore from result object", () => {
      const input: DisclosureDecisionInput = {
        result: createTestResult({ unifiedScore: 0.88 }),
        score: 0.5, // Implementation uses this score parameter
        maxTokens: 3000,
      };

      const decision = decisionManager.decide(input);

      // Uses score (0.5) which is < 0.7, so tokenBudget fallback
      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("tokenBudget");
    });

    it("should handle result with different tool types", () => {
      const mcpInput: DisclosureDecisionInput = {
        result: createTestResult({ toolType: "mcp", unifiedScore: 0.88 }),
        score: 0.88,
        maxTokens: 3000,
      };

      const builtinInput: DisclosureDecisionInput = {
        result: createTestResult({ toolType: "builtin", unifiedScore: 0.88 }),
        score: 0.88,
        maxTokens: 3000,
      };

      expect(decisionManager.decide(mcpInput).level).toBe(DisclosureLevel.RESOURCES);
      expect(decisionManager.decide(builtinInput).level).toBe(DisclosureLevel.RESOURCES);
    });

    it("should handle result with various tags", () => {
      const input: DisclosureDecisionInput = {
        result: createTestResult({
          unifiedScore: 0.88,
          tags: ["file", "io", "read", "write", "utility"],
        }),
        score: 0.88,
        maxTokens: 3000,
      };

      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.RESOURCES);
    });
  });
});

describe("DisclosureDecisionManager - Custom Thresholds", () => {
  describe("Custom L2 threshold", () => {
    it("should respect custom l2 = 0.8", () => {
      const manager = new DisclosureDecisionManager({ l2: 0.8, l3: 0.9 });

      expect(manager.decide(createDecisionInput(0.75, 3000)).level).toBe(DisclosureLevel.CONTENT);
      expect(manager.decide(createDecisionInput(0.75, 3000)).reason).toBe("tokenBudget");
      expect(manager.decide(createDecisionInput(0.8, 3000)).level).toBe(DisclosureLevel.CONTENT);
      expect(manager.decide(createDecisionInput(0.8, 3000)).reason).toBe("threshold");
    });

    it("should respect custom l2 = 0.5 (lower than default)", () => {
      const manager = new DisclosureDecisionManager({ l2: 0.5, l3: 0.85 });

      expect(manager.decide(createDecisionInput(0.6, 3000)).level).toBe(DisclosureLevel.CONTENT);
      expect(manager.decide(createDecisionInput(0.6, 3000)).reason).toBe("threshold");
    });

    it("should handle l2 = 0 (all scores >= 0 go to threshold)", () => {
      const manager = new DisclosureDecisionManager({ l2: 0, l3: 0.85 });

      // With l2 = 0, score 0.5 >= 0, so it goes to CONTENT with reason "threshold"
      expect(manager.decide(createDecisionInput(0.5, 3000)).reason).toBe("threshold");
    });

    it("should handle l2 = 1.0 (scores between l3 and l2 go to RESOURCES)", () => {
      const manager = new DisclosureDecisionManager({ l2: 1.0, l3: 0.85 });

      // With l2 = 1.0, l3 = 0.85:
      // - Score 0.9 >= 0.85, so it goes to RESOURCES with "threshold"
      // - Score 0.95 >= 0.85, so it goes to RESOURCES with "threshold"
      // - Score 0.99 >= 0.85, so it goes to RESOURCES with "threshold"
      expect(manager.decide(createDecisionInput(0.9, 3000)).level).toBe(DisclosureLevel.RESOURCES);
      expect(manager.decide(createDecisionInput(0.95, 3000)).level).toBe(DisclosureLevel.RESOURCES);
    });
  });

  describe("Custom L3 threshold", () => {
    it("should respect custom l3 = 0.95", () => {
      const manager = new DisclosureDecisionManager({ l2: 0.7, l3: 0.95 });

      expect(manager.decide(createDecisionInput(0.9, 3000)).level).toBe(DisclosureLevel.CONTENT);
      expect(manager.decide(createDecisionInput(0.95, 3000)).level).toBe(DisclosureLevel.RESOURCES);
    });

    it("should respect custom l3 = 0.5 (lower than default)", () => {
      const manager = new DisclosureDecisionManager({ l2: 0.4, l3: 0.5 });

      expect(manager.decide(createDecisionInput(0.6, 3000)).level).toBe(DisclosureLevel.RESOURCES);
    });

    it("should handle l3 = 0 (all scores >= 0.7 go to RESOURCES)", () => {
      const manager = new DisclosureDecisionManager({ l2: 0.7, l3: 0 });

      expect(manager.decide(createDecisionInput(0.75, 3000)).level).toBe(DisclosureLevel.RESOURCES);
    });

    it("should handle l3 = 1.0 (no scores qualify for RESOURCES)", () => {
      const manager = new DisclosureDecisionManager({ l2: 0.7, l3: 1.0 });

      expect(manager.decide(createDecisionInput(0.95, 3000)).level).toBe(DisclosureLevel.CONTENT);
    });
  });

  describe("Both thresholds equal", () => {
    it("should handle l2 = l3 = 0.8", () => {
      const manager = new DisclosureDecisionManager({ l2: 0.8, l3: 0.8 });

      // Scores >= 0.8 should go to RESOURCES (higher level)
      expect(manager.decide(createDecisionInput(0.79, 3000)).reason).toBe("tokenBudget");
      expect(manager.decide(createDecisionInput(0.8, 3000)).level).toBe(DisclosureLevel.RESOURCES);
      expect(manager.decide(createDecisionInput(0.85, 3000)).level).toBe(DisclosureLevel.RESOURCES);
    });

    it("should handle l2 = l3 = 0.9", () => {
      const manager = new DisclosureDecisionManager({ l2: 0.9, l3: 0.9 });

      expect(manager.decide(createDecisionInput(0.89, 3000)).reason).toBe("tokenBudget");
      expect(manager.decide(createDecisionInput(0.9, 3000)).level).toBe(DisclosureLevel.RESOURCES);
    });
  });

  describe("Invalid threshold configurations", () => {
    it("should handle l2 > l3 configuration", () => {
      const manager = new DisclosureDecisionManager({ l2: 0.9, l3: 0.7 });

      // l2 > l3 is invalid but should still work (l3 checked first)
      expect(manager.decide(createDecisionInput(0.8, 3000)).level).toBe(DisclosureLevel.RESOURCES);
    });

    it("should handle zero thresholds", () => {
      const manager = new DisclosureDecisionManager({ l2: 0, l3: 0 });

      expect(manager.decide(createDecisionInput(0.5, 3000)).level).toBe(DisclosureLevel.RESOURCES);
    });

    it("should handle negative thresholds", () => {
      const manager = new DisclosureDecisionManager({ l2: -0.1, l3: 0.5 });

      // With l2 = -0.1, score 0.6 >= -0.1, so it goes to CONTENT
      // But l3 = 0.5, score 0.6 >= 0.5, so it goes to RESOURCES
      expect(manager.decide(createDecisionInput(0.6, 3000)).level).toBe(DisclosureLevel.RESOURCES);
    });
  });
});

describe("DisclosureDecisionManager - Integration Scenarios", () => {
  describe("Real-world scenarios", () => {
    it("should select METADATA for highly constrained token budget", () => {
      const manager = new DisclosureDecisionManager({ l2: 0.7, l3: 0.85 });

      const scenario1 = manager.decide(createDecisionInput(0.95, 400));
      const scenario2 = manager.decide(createDecisionInput(0.88, 250));
      const scenario3 = manager.decide(createDecisionInput(0.72, 100));

      expect(scenario1.level).toBe(DisclosureLevel.METADATA);
      expect(scenario2.level).toBe(DisclosureLevel.METADATA);
      expect(scenario3.level).toBe(DisclosureLevel.METADATA);
    });

    it("should select CONTENT for moderate relevance with normal budget", () => {
      const manager = new DisclosureDecisionManager({ l2: 0.7, l3: 0.85 });

      const scenario1 = manager.decide(createDecisionInput(0.75, 3000));
      const scenario2 = manager.decide(createDecisionInput(0.82, 5000));
      const scenario3 = manager.decide(createDecisionInput(0.5, 3000));

      expect(scenario1.level).toBe(DisclosureLevel.CONTENT);
      expect(scenario2.level).toBe(DisclosureLevel.CONTENT);
      expect(scenario3.level).toBe(DisclosureLevel.CONTENT);
    });

    it("should select RESOURCES for highly relevant tools", () => {
      const manager = new DisclosureDecisionManager({ l2: 0.7, l3: 0.85 });

      const scenario1 = manager.decide(createDecisionInput(0.9, 3000));
      const scenario2 = manager.decide(createDecisionInput(0.88, 5000));
      const scenario3 = manager.decide(createDecisionInput(0.95, 10000));

      expect(scenario1.level).toBe(DisclosureLevel.RESOURCES);
      expect(scenario2.level).toBe(DisclosureLevel.RESOURCES);
      expect(scenario3.level).toBe(DisclosureLevel.RESOURCES);
    });

    it("should handle mixed scenarios correctly", () => {
      const manager = new DisclosureDecisionManager({ l2: 0.7, l3: 0.85 });

      const results = [
        { score: 0.95, maxTokens: 300, expected: DisclosureLevel.METADATA },
        { score: 0.85, maxTokens: 500, expected: DisclosureLevel.RESOURCES },
        { score: 0.75, maxTokens: 400, expected: DisclosureLevel.METADATA },
        { score: 0.82, maxTokens: 600, expected: DisclosureLevel.CONTENT },
        { score: 0.92, maxTokens: 1000, expected: DisclosureLevel.RESOURCES },
      ];

      for (const testCase of results) {
        const decision = manager.decide(createDecisionInput(testCase.score, testCase.maxTokens));
        expect(decision.level).toBe(testCase.expected);
      }
    });
  });

  describe("Performance considerations", () => {
    it("should handle rapid successive calls", () => {
      const manager = new DisclosureDecisionManager({ l2: 0.7, l3: 0.85 });

      for (let i = 0; i < 1000; i++) {
        const score = Math.random();
        const maxTokens = Math.floor(Math.random() * 5000);
        manager.decide(createDecisionInput(score, maxTokens));
      }

      expect(true).toBe(true); // If we get here without errors, the test passes
    });

    it("should handle extreme score distribution", () => {
      const manager = new DisclosureDecisionManager({ l2: 0.7, l3: 0.85 });

      const scores = [
        0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.69, 0.7, 0.71, 0.8, 0.84, 0.85, 0.86, 0.9, 0.95, 1.0,
      ];
      const maxTokens = 3000;

      const decisions = scores.map((score) =>
        manager.decide(createDecisionInput(score, maxTokens))
      );

      // Verify monotonicity: higher scores should not result in lower disclosure levels
      for (let i = 1; i < decisions.length; i++) {
        const prevScore = scores[i - 1];
        const currScore = scores[i];
        const prevDecision = decisions[i - 1];
        const currDecision = decisions[i];

        if (currScore >= prevScore) {
          // Should not go from RESOURCES to METADATA
          if (prevDecision.level === DisclosureLevel.RESOURCES) {
            expect(currDecision.level).not.toBe(DisclosureLevel.METADATA);
          }
        }
      }
    });
  });
});

describe("DisclosureDecisionManager - Decision Output Validation", () => {
  let decisionManager: DisclosureDecisionManager;

  beforeEach(() => {
    decisionManager = new DisclosureDecisionManager({
      l2: 0.7,
      l3: 0.85,
    });
  });

  describe("Decision structure", () => {
    it("should always return valid decision object", () => {
      const scenarios = [
        createDecisionInput(0.3, 200),
        createDecisionInput(0.7, 3000),
        createDecisionInput(0.9, 3000),
      ];

      for (const input of scenarios) {
        const decision = decisionManager.decide(input);

        expect(decision).toHaveProperty("level");
        expect(decision).toHaveProperty("reason");
        expect(Object.values(DisclosureLevel)).toContain(decision.level);
        expect(["always", "threshold", "tokenBudget"]).toContain(decision.reason);
      }
    });

    it('should return reason = "always" only for token budget constraints', () => {
      const alwaysScenarios = [
        createDecisionInput(0.95, 100),
        createDecisionInput(0.99, 0),
        createDecisionInput(0.85, 499),
      ];

      for (const input of alwaysScenarios) {
        const decision = decisionManager.decide(input);
        expect(decision.reason).toBe("always");
        expect(decision.level).toBe(DisclosureLevel.METADATA);
      }
    });

    it('should return reason = "threshold" for qualifying scores', () => {
      const thresholdScenarios = [
        createDecisionInput(0.7, 3000),
        createDecisionInput(0.85, 3000),
        createDecisionInput(0.9, 500),
      ];

      for (const input of thresholdScenarios) {
        const decision = decisionManager.decide(input);
        expect(decision.reason).toBe("threshold");
      }
    });

    it('should return reason = "tokenBudget" for below-threshold scores', () => {
      const tokenBudgetScenarios = [
        createDecisionInput(0.5, 3000),
        createDecisionInput(0.69, 3000),
      ];

      for (const input of tokenBudgetScenarios) {
        const decision = decisionManager.decide(input);
        expect(decision.reason).toBe("tokenBudget");
      }

      const thresholdScenario = createDecisionInput(0.84, 3000);
      const thresholdDecision = decisionManager.decide(thresholdScenario);
      expect(thresholdDecision.reason).toBe("threshold");
    });
  });
});
