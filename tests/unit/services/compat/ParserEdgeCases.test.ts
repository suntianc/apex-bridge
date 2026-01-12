/**
 * ParserEdgeCases.test.ts - ClaudeCodeSkillParser 边界条件测试
 */

import { ClaudeCodeSkillParser, ParseResult } from "@/services/compat/ClaudeCodeSkillParser";
import { ParseError, ParseErrorCode } from "@/services/compat/types";

describe("ClaudeCodeSkillParser Edge Cases", () => {
  let parser: ClaudeCodeSkillParser;

  beforeEach(() => {
    parser = new ClaudeCodeSkillParser();
  });

  describe("YAML Parsing Errors", () => {
    it("should handle invalid YAML syntax", async () => {
      const content = `---
name: [invalid yaml
  missing bracket
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe(ParseErrorCode.INVALID_YAML);
      expect(result.success).toBe(false);
    });

    it("should handle YAML injection attempts", async () => {
      const content = `---
name: test
description: !<tag:yaml.org,2002:js/function> "malicious code"
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      // Should either parse safely or reject
      expect(result).toBeDefined();
      // If parsing succeeded, metadata should be present
      if (result.success) {
        expect(result.metadata).toBeDefined();
      }
    });

    it("should handle malformed YAML with special characters", async () => {
      const content = `---
name: test
description: "unclosed string
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.code === ParseErrorCode.INVALID_YAML)).toBe(true);
    });
  });

  describe("Field Validation Edge Cases", () => {
    it("should handle name exactly 64 characters", async () => {
      const name = "a".repeat(64);
      const content = `---
name: ${name}
description: Valid description
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      expect(result.errors.filter((e) => e.code === ParseErrorCode.NAME_TOO_LONG)).toHaveLength(0);
      expect(result.success).toBe(true);
    });

    it("should handle name 65 characters (over limit)", async () => {
      const name = "a".repeat(65);
      const content = `---
name: ${name}
description: Valid description
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      expect(result.errors.some((e) => e.code === ParseErrorCode.NAME_TOO_LONG)).toBe(true);
      expect(result.success).toBe(false);
    });

    it("should handle special characters in name", async () => {
      const content = `---
name: test_skill!
description: Invalid name
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      expect(result.errors.some((e) => e.code === ParseErrorCode.INVALID_NAME_FORMAT)).toBe(true);
      expect(result.success).toBe(false);
    });

    it("should handle Unicode in description", async () => {
      const content = `---
name: test-skill
description: 这是一个中文描述 with émojis 🎉
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      expect(result.success).toBe(true);
      expect(result.metadata?.description).toContain("中文");
    });

    it("should handle very long description (1024+ chars)", async () => {
      const longDesc = "x".repeat(2000);
      const content = `---
name: test-skill
description: ${longDesc}
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      // Should still succeed but may have warnings
      expect(result).toBeDefined();
    });

    it("should handle numeric name", async () => {
      const content = `---
name: 123
description: Invalid name type
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      expect(result.errors.some((e) => e.code === ParseErrorCode.INVALID_NAME_FORMAT)).toBe(true);
    });
  });

  describe("Missing Fields", () => {
    it("should handle missing name", async () => {
      const content = `---
description: No name provided
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      expect(result.errors.some((e) => e.code === ParseErrorCode.MISSING_NAME)).toBe(true);
      expect(result.success).toBe(false);
    });

    it("should handle missing description", async () => {
      const content = `---
name: test-skill
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      expect(result.errors.some((e) => e.code === ParseErrorCode.MISSING_DESCRIPTION)).toBe(true);
      expect(result.success).toBe(false);
    });

    it("should handle completely empty frontmatter", async () => {
      const content = `---
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.success).toBe(false);
    });

    it("should handle null frontmatter", async () => {
      const content = `# Skill without frontmatter
Just content
`;
      const result = parser.parseContentWithResult(content);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.success).toBe(false);
    });
  });

  describe("Invalid Values", () => {
    it("should reject numeric name", async () => {
      const content = `---
name: 123
description: Invalid
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      expect(result.errors.some((e) => e.code === ParseErrorCode.INVALID_NAME_FORMAT)).toBe(true);
    });

    it("should reject boolean allowedTools", async () => {
      const content = `---
name: test-skill
description: Test
allowedTools: true
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      expect(result.errors.some((e) => e.code === ParseErrorCode.INVALID_ALLOWED_TOOLS)).toBe(true);
    });

    it("should reject object context", async () => {
      const content = `---
name: test-skill
description: Test
context: { mode: "fork" }
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      expect(result.errors.some((e) => e.code === ParseErrorCode.INVALID_CONTEXT)).toBe(true);
    });

    it("should reject invalid context value", async () => {
      const content = `---
name: test-skill
description: Test
context: invalid-mode
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      expect(result.errors.some((e) => e.code === ParseErrorCode.INVALID_CONTEXT)).toBe(true);
    });

    it("should reject non-string in allowedTools array", async () => {
      const content = `---
name: test-skill
description: Test
allowedTools: ["tool1", 123, "tool2"]
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      expect(
        result.errors.some(
          (e) =>
            e.code === ParseErrorCode.INVALID_ALLOWED_TOOLS && e.field?.includes("allowedTools")
        )
      ).toBe(true);
    });
  });

  describe("Error Recovery", () => {
    it("should collect multiple errors", async () => {
      const content = `---
name: 
description: 
version: invalid
context: unknown
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      // Should have multiple errors: missing name, missing description, invalid context
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      expect(result.success).toBe(false);
    });

    it("should provide helpful suggestions", async () => {
      const content = `---
name: Invalid Name With Spaces
description: Invalid name format
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      const nameError = result.errors.find((e) => e.field === "name");
      expect(nameError?.suggestions).toBeDefined();
      expect(nameError!.suggestions!.length).toBeGreaterThan(0);
    });

    it("should provide suggestion for name too long", async () => {
      const name = "a".repeat(100);
      const content = `---
name: ${name}
description: Valid description
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      const nameError = result.errors.find((e) => e.code === ParseErrorCode.NAME_TOO_LONG);
      expect(nameError?.suggestions).toBeDefined();
      expect(nameError!.suggestions!.some((s) => s.includes("64"))).toBe(true);
    });
  });

  describe("Reserved Words", () => {
    it('should reject name containing "claude"', async () => {
      const content = `---
name: my-claude-skill
description: Test
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      expect(result.errors.some((e) => e.code === ParseErrorCode.RESERVED_NAME)).toBe(true);
    });

    it('should reject name containing "anthropic"', async () => {
      const content = `---
name: anthropic-helper
description: Test
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      expect(result.errors.some((e) => e.code === ParseErrorCode.RESERVED_NAME)).toBe(true);
    });

    it('should reject name containing "system"', async () => {
      const content = `---
name: system-admin
description: Test
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      expect(result.errors.some((e) => e.code === ParseErrorCode.RESERVED_NAME)).toBe(true);
    });
  });

  describe("Valid Cases", () => {
    it("should parse valid SKILL.md content", async () => {
      const content = `---
name: test-skill
description: A valid test skill
version: 1.0.0
---
# Skill Content
This is the skill content.
`;
      const result = parser.parseContentWithResult(content);
      expect(result.success).toBe(true);
      expect(result.metadata?.name).toBe("test-skill");
      expect(result.metadata?.description).toBe("A valid test skill");
      expect(result.metadata?.version).toBe("1.0.0");
    });

    it("should handle optional fields", async () => {
      const content = `---
name: optional-skill
description: Skill with optional fields
tags:
  - test
  - demo
author: Test Author
requires:
  - other-skill
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      expect(result.success).toBe(true);
      expect(result.metadata?.tags).toEqual(["test", "demo"]);
      expect(result.metadata?.author).toBe("Test Author");
      expect(result.metadata?.dependencies).toEqual(["other-skill"]);
    });

    it("should handle default version when not provided", async () => {
      const content = `---
name: no-version-skill
description: Skill without version
---
# Skill
`;
      const result = parser.parseContentWithResult(content);
      expect(result.success).toBe(true);
      expect(result.metadata?.version).toBe("0.1.0");
    });
  });

  describe("ParseError Class", () => {
    it("should create ParseError with all properties", async () => {
      const error = new ParseError("Test error message", ParseErrorCode.MISSING_NAME, "name", [
        "Suggestion 1",
        "Suggestion 2",
      ]);
      expect(error.message).toBe("Test error message");
      expect(error.code).toBe(ParseErrorCode.MISSING_NAME);
      expect(error.field).toBe("name");
      expect(error.suggestions).toEqual(["Suggestion 1", "Suggestion 2"]);
      expect(error.name).toBe("ParseError");
    });

    it("should create ParseError without optional properties", async () => {
      const error = new ParseError("Simple error", ParseErrorCode.INVALID_YAML);
      expect(error.message).toBe("Simple error");
      expect(error.code).toBe(ParseErrorCode.INVALID_YAML);
      expect(error.field).toBeUndefined();
      expect(error.suggestions).toBeUndefined();
    });
  });
});
