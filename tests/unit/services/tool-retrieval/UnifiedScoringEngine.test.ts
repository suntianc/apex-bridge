/**
 * UnifiedScoringEngine Test Suite
 */

import {
  UnifiedScoringEngine,
  DEFAULT_SCORING_CONFIG,
} from "../../../../src/services/tool-retrieval/UnifiedScoringEngine";
import { RetrievalResult, RetrievalMethod } from "../../../../src/types/enhanced-skill";

describe("UnifiedScoringEngine", () => {
  let engine: UnifiedScoringEngine;

  beforeEach(() => {
    engine = new UnifiedScoringEngine();
  });

  describe("constructor", () => {
    it("should initialize with default config", () => {
      expect(engine).toBeInstanceOf(UnifiedScoringEngine);
    });

    it("should accept custom config", () => {
      const customEngine = new UnifiedScoringEngine({
        rrfK: 50,
        minScore: 0.2,
        maxResults: 20,
      });
      expect(customEngine).toBeInstanceOf(UnifiedScoringEngine);
    });
  });

  describe("fuseResults", () => {
    it("should handle empty results", () => {
      const result = engine.fuseResults([], [], [], []);

      expect(result.results).toEqual([]);
      expect(result.config.k).toBe(DEFAULT_SCORING_CONFIG.rrfK);
    });

    it("should fuse single method results", () => {
      const vectorResults: RetrievalResult[] = [
        { id: "tool1", score: 0.9, method: "vector" },
        { id: "tool2", score: 0.8, method: "vector" },
        { id: "tool3", score: 0.7, method: "vector" },
      ];

      const result = engine.fuseResults(vectorResults, [], [], []);

      expect(result.results).toHaveLength(3);
      expect(result.results[0].id).toBe("tool1");
      expect(result.results[0].unifiedScore).toBeGreaterThan(0);
    });

    it("should merge results from multiple methods", () => {
      const vectorResults: RetrievalResult[] = [
        { id: "tool1", score: 0.9, method: "vector" },
        { id: "tool2", score: 0.8, method: "vector" },
      ];

      const keywordResults: RetrievalResult[] = [
        { id: "tool2", score: 0.85, method: "keyword" },
        { id: "tool3", score: 0.7, method: "keyword" },
      ];

      const result = engine.fuseResults(vectorResults, keywordResults, [], []);

      expect(result.results).toHaveLength(3);
      const tool2Index = result.results.findIndex((r) => r.id === "tool2");
      expect(tool2Index).toBeLessThan(2);
    });

    it("should apply deduplication", () => {
      const vectorResults: RetrievalResult[] = [
        { id: "tool1", score: 0.9, method: "vector" },
        { id: "tool1", score: 0.8, method: "vector" },
      ];

      const result = engine.fuseResults(vectorResults, [], [], []);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].id).toBe("tool1");
    });

    it("should respect minScore threshold", () => {
      const vectorResults: RetrievalResult[] = [
        { id: "tool1", score: 0.9, method: "vector" },
        { id: "tool2", score: 0.05, method: "vector" },
      ];

      const result = engine.fuseResults(vectorResults, [], [], []);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].id).toBe("tool1");
    });
  });

  describe("normalizeScores", () => {
    it("should normalize scores to 0-1 range", () => {
      const results: RetrievalResult[] = [
        { id: "tool1", score: 10, method: "vector" },
        { id: "tool2", score: 20, method: "vector" },
        { id: "tool3", score: 30, method: "vector" },
      ];

      const normalized = engine.normalizeScores(results);

      expect(normalized[0].score).toBe(0);
      expect(normalized[1].score).toBe(0.5);
      expect(normalized[2].score).toBe(1);
    });

    it("should handle empty results", () => {
      const normalized = engine.normalizeScores([]);
      expect(normalized).toEqual([]);
    });
  });

  describe("deduplicateResults", () => {
    it("should remove duplicate IDs", () => {
      const results = [
        {
          id: "tool1",
          name: "Tool 1",
          description: "Description 1",
          unifiedScore: 0.9,
          scores: { vector: 0.9, keyword: 0, semantic: 0, tag: 0 },
          ranks: { vector: 1, keyword: 0, semantic: 0, tag: 0 },
          tags: [],
          toolType: "skill" as const,
          disclosure: {
            level: "metadata" as any,
            name: "Tool 1",
            description: "Description 1",
            tokenCount: 0,
          },
        },
        {
          id: "tool1",
          name: "Tool 1 Duplicate",
          description: "Description Duplicate",
          unifiedScore: 0.8,
          scores: { vector: 0.8, keyword: 0, semantic: 0, tag: 0 },
          ranks: { vector: 2, keyword: 0, semantic: 0, tag: 0 },
          tags: [],
          toolType: "skill" as const,
          disclosure: {
            level: "metadata" as any,
            name: "Tool 1 Duplicate",
            description: "Description Duplicate",
            tokenCount: 0,
          },
        },
        {
          id: "tool2",
          name: "Tool 2",
          description: "Description 2",
          unifiedScore: 0.7,
          scores: { vector: 0.7, keyword: 0, semantic: 0, tag: 0 },
          ranks: { vector: 3, keyword: 0, semantic: 0, tag: 0 },
          tags: [],
          toolType: "skill" as const,
          disclosure: {
            level: "metadata" as any,
            name: "Tool 2",
            description: "Description 2",
            tokenCount: 0,
          },
        },
      ];

      const deduplicated = engine.deduplicateResults(results);

      expect(deduplicated).toHaveLength(2);
      expect(deduplicated[0].id).toBe("tool1");
      expect(deduplicated[1].id).toBe("tool2");
    });
  });
});
