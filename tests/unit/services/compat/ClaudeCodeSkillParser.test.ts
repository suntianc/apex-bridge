/**
 * Unit tests for ClaudeCodeSkillParser
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { ClaudeCodeSkillParser } from "../../../../src/services/compat/ClaudeCodeSkillParser";
import { ParseError } from "../../../../src/services/compat/types";

describe("ClaudeCodeSkillParser", () => {
  let parser: ClaudeCodeSkillParser;
  let tempDir: string;

  beforeEach(async () => {
    parser = new ClaudeCodeSkillParser();
    tempDir = path.join(os.tmpdir(), `skill-parser-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("parse", () => {
    it("should parse valid SKILL.md file", async () => {
      const skillContent = `---
name: test-skill
description: A test skill for unit testing
version: 1.0.0
author: Test Author
tags: [test, unit]
requires: []
allowedTools: [read, write]
model: claude-3-5-sonnet-20241022
context: inline
userInvocable: true
---

# Test Skill Content

This is the content of the test skill.
`;

      const skillPath = path.join(tempDir, "test-skill");
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContent);

      const result = await parser.parse(skillPath);

      expect(result.metadata.name).toBe("test-skill");
      expect(result.metadata.description).toBe("A test skill for unit testing");
      expect(result.metadata.version).toBe("1.0.0");
      expect(result.metadata.author).toBe("Test Author");
      expect(result.metadata.tags).toEqual(["test", "unit"]);
      expect(result.metadata.dependencies).toEqual([]);
      expect(result.compatibility.source).toBe("claude-code");
      expect(result.compatibility.allowedTools).toEqual(["read", "write"]);
      expect(result.compatibility.model).toBe("claude-3-5-sonnet-20241022");
      expect(result.compatibility.context).toBe("inline");
      expect(result.compatibility.userInvocable).toBe(true);
      expect(result.content).toContain("# Test Skill Content");
    });

    it("should use default version when not provided", async () => {
      const skillContent = `---
name: minimal-skill
description: A minimal skill without version
---

Content here
`;

      const skillPath = path.join(tempDir, "minimal-skill");
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContent);

      const result = await parser.parse(skillPath);

      expect(result.metadata.version).toBe("0.1.0");
    });

    it("should throw ParseError when SKILL.md is missing", async () => {
      await expect(parser.parse(tempDir)).rejects.toThrow(ParseError);
      await expect(parser.parse(tempDir)).rejects.toMatchObject({
        code: "FILE_NOT_FOUND",
      });
    });

    it("should throw ParseError for invalid name", async () => {
      const skillContent = `---
name: Invalid Name With Spaces
description: Test description
version: 1.0.0
---

Content
`;

      const skillPath = path.join(tempDir, "invalid-skill");
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContent);

      await expect(parser.parse(skillPath)).rejects.toThrow(ParseError);
    });

    it("should throw ParseError for reserved words in name", async () => {
      const skillContent = `---
name: claude-test
description: Test description
version: 1.0.0
---

Content
`;

      const skillPath = path.join(tempDir, "reserved-skill");
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContent);

      await expect(parser.parse(skillPath)).rejects.toThrow(ParseError);
    });

    it("should throw ParseError for missing name", async () => {
      const skillContent = `---
description: Test description
version: 1.0.0
---

Content
`;

      const skillPath = path.join(tempDir, "no-name-skill");
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContent);

      await expect(parser.parse(skillPath)).rejects.toThrow(ParseError);
    });

    it("should throw ParseError for missing description", async () => {
      const skillContent = `---
name: test-skill
version: 1.0.0
---

Content
`;

      const skillPath = path.join(tempDir, "no-desc-skill");
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContent);

      await expect(parser.parse(skillPath)).rejects.toThrow(ParseError);
    });

    it("should throw ParseError for description exceeding 1024 chars", async () => {
      const longDescription = "a".repeat(1025);
      const skillContent = `---
name: test-skill
description: ${longDescription}
version: 1.0.0
---

Content
`;

      const skillPath = path.join(tempDir, "long-desc-skill");
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContent);

      await expect(parser.parse(skillPath)).rejects.toThrow(ParseError);
    });
  });

  describe("parseContent", () => {
    it("should parse raw content directly", () => {
      const rawContent = `---
name: content-test
description: Test parsing raw content
version: 2.0.0
---

Raw content here
`;

      const result = parser.parseContent(rawContent);

      expect(result.metadata.name).toBe("content-test");
      expect(result.metadata.description).toBe("Test parsing raw content");
      expect(result.content).toContain("Raw content here");
    });

    it("should map requires to dependencies", () => {
      const rawContent = `---
name: dep-test
description: Test dependencies
version: 1.0.0
requires: [dep1, dep2]
---

Content
`;

      const result = parser.parseContent(rawContent);

      expect(result.metadata.dependencies).toEqual(["dep1", "dep2"]);
    });
  });

  describe("parseDirectory", () => {
    it("should parse multiple skills in a directory", async () => {
      // Create first skill
      const skill1Content = `---
name: skill-one
description: First skill
version: 1.0.0
---

Content 1
`;
      const skill1Path = path.join(tempDir, "skill-one");
      await fs.mkdir(skill1Path, { recursive: true });
      await fs.writeFile(path.join(skill1Path, "SKILL.md"), skill1Content);

      // Create second skill
      const skill2Content = `---
name: skill-two
description: Second skill
version: 1.0.0
---

Content 2
`;
      const skill2Path = path.join(tempDir, "skill-two");
      await fs.mkdir(skill2Path, { recursive: true });
      await fs.writeFile(path.join(skill2Path, "SKILL.md"), skill2Content);

      // Create a directory (not a skill)
      await fs.mkdir(path.join(tempDir, "not-a-skill"), { recursive: true });

      const result = await parser.parseDirectory(tempDir);

      expect(result.size).toBe(2);
      expect(result.get("skill-one")).toBeDefined();
      expect(result.get("skill-two")).toBeDefined();
      expect(result.get("not-a-skill")).toBeUndefined();
    });
  });
});
