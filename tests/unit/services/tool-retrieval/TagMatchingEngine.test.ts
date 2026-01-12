/**
 * TagMatchingEngine Test Suite
 */

import {
  TagMatchingEngine,
  DEFAULT_TAG_MATCHING_CONFIG,
} from "../../../../src/services/tool-retrieval/TagMatchingEngine";
import { ToolRetrievalResult } from "../../../../src/services/tool-retrieval/types";

describe("TagMatchingEngine", () => {
  let engine: TagMatchingEngine;

  beforeEach(() => {
    engine = new TagMatchingEngine();
  });

  describe("constructor", () => {
    it("should initialize with default config", () => {
      expect(engine).toBeInstanceOf(TagMatchingEngine);
    });

    it("should accept custom config", () => {
      const customEngine = new TagMatchingEngine({
        minScore: 0.7,
        maxDepth: 2,
        enableAliases: false,
      });
      expect(customEngine).toBeInstanceOf(TagMatchingEngine);
    });
  });

  describe("matchTags", () => {
    it("should return empty array for empty candidates", async () => {
      const results = await engine.matchTags(["category:file"], []);
      expect(results).toEqual([]);
    });

    it("should return empty array for empty query tags", async () => {
      const candidates: ToolRetrievalResult[] = [
        {
          id: "tool1",
          name: "File Tool",
          description: "A file tool",
          score: 0.9,
          toolType: "skill",
          tags: ["category:file", "operation:read"],
        },
      ];

      const results = await engine.matchTags([], candidates);
      expect(results).toEqual([]);
    });

    it("should match exact tags", async () => {
      const candidates: ToolRetrievalResult[] = [
        {
          id: "tool1",
          name: "File Tool",
          description: "A file tool",
          score: 0.9,
          toolType: "skill",
          tags: ["category:file", "operation:read"],
        },
      ];

      const results = await engine.matchTags(["category:file"], candidates);

      expect(results).toHaveLength(1);
      expect(results[0].matched).toBe(true);
      expect(results[0].tag).toBe("category:file");
      expect(results[0].score).toBeGreaterThanOrEqual(DEFAULT_TAG_MATCHING_CONFIG.minScore);
    });

    it("should match multiple tags", async () => {
      const candidates: ToolRetrievalResult[] = [
        {
          id: "tool1",
          name: "File Tool",
          description: "A file tool",
          score: 0.9,
          toolType: "skill",
          tags: ["category:file", "operation:read", "format:json"],
        },
      ];

      const results = await engine.matchTags(["category:file", "format:json"], candidates);

      expect(results).toHaveLength(1);
      expect(results[0].matched).toBe(true);
      expect(results[0].score).toBeGreaterThan(0);
    });

    it("should not match non-existent tags", async () => {
      const candidates: ToolRetrievalResult[] = [
        {
          id: "tool1",
          name: "File Tool",
          description: "A file tool",
          score: 0.9,
          toolType: "skill",
          tags: ["category:file"],
        },
      ];

      const results = await engine.matchTags(["category:network"], candidates);

      expect(results).toHaveLength(1);
      expect(results[0].matched).toBe(false);
    });

    it("should handle multiple candidates", async () => {
      const candidates: ToolRetrievalResult[] = [
        {
          id: "tool1",
          name: "File Tool",
          description: "A file tool",
          score: 0.9,
          toolType: "skill",
          tags: ["category:file"],
        },
        {
          id: "tool2",
          name: "Network Tool",
          description: "A network tool",
          score: 0.8,
          toolType: "skill",
          tags: ["category:network"],
        },
        {
          id: "tool3",
          name: "DB Tool",
          description: "A database tool",
          score: 0.7,
          toolType: "skill",
          tags: ["category:database"],
        },
      ];

      const results = await engine.matchTags(["category:file", "category:network"], candidates);

      expect(results).toHaveLength(3);
      expect(results[0].matched).toBe(true);
      expect(results[1].matched).toBe(true);
      expect(results[2].matched).toBe(false);
    });
  });

  describe("matchSingleTool", () => {
    it("should match a single tool", async () => {
      const tool: ToolRetrievalResult = {
        id: "tool1",
        name: "File Tool",
        description: "A file tool",
        score: 0.9,
        toolType: "skill",
        tags: ["category:file", "operation:read"],
      };

      const result = await engine.matchSingleTool(tool, ["category:file"]);

      expect(result.matched).toBe(true);
      expect(result.tag).toBe("category:file");
      expect(result.level).toBe("category");
    });

    it("should return unmatched for non-matching tags", async () => {
      const tool: ToolRetrievalResult = {
        id: "tool1",
        name: "File Tool",
        description: "A file tool",
        score: 0.9,
        toolType: "skill",
        tags: ["category:file"],
      };

      const result = await engine.matchSingleTool(tool, ["category:database"]);

      expect(result.matched).toBe(false);
      expect(result.score).toBeLessThan(DEFAULT_TAG_MATCHING_CONFIG.minScore);
    });
  });

  describe("calculateTagScore", () => {
    it("should return 0 for empty query tags", () => {
      const score = engine.calculateTagScore(
        ["category:file"],
        [],
        DEFAULT_TAG_MATCHING_CONFIG.hierarchy
      );
      expect(score).toBe(0);
    });

    it("should return 1 for exact match", () => {
      const score = engine.calculateTagScore(
        ["category:file"],
        ["category:file"],
        DEFAULT_TAG_MATCHING_CONFIG.hierarchy
      );
      expect(score).toBe(1);
    });

    it("should return high score for partial match", () => {
      const score = engine.calculateTagScore(
        ["category:file", "operation:read"],
        ["category:file"],
        DEFAULT_TAG_MATCHING_CONFIG.hierarchy
      );
      expect(score).toBeGreaterThan(0);
    });

    it("should handle tag aliases", () => {
      const score = engine.calculateTagScore(
        ["category:file"],
        ["cat:file"],
        DEFAULT_TAG_MATCHING_CONFIG.hierarchy
      );
      expect(score).toBeGreaterThan(0);
    });
  });
});
