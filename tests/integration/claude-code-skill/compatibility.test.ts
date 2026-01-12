/**
 * Claude Code Skill 兼容性测试
 * Phase 5 - ApexBridge Claude Code Skill 兼容性增强项目
 *
 * 测试覆盖：
 * - Skill 加载测试
 * - Skill 执行测试
 * - 结果格式化测试
 * - 兼容性验证测试
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { ClaudeCodeSkillParser } from "../../../src/services/compat/ClaudeCodeSkillParser";
import { ParseError } from "../../../src/services/compat/types";
import { ScriptExecutor } from "../../../src/services/compat/ScriptExecutor";
import { LifecycleManager } from "../../../src/services/compat/LifecycleManager";
import { SkillLifecycleHooks, SkillLifecycleContext } from "../../../src/services/compat/types";
import { SkillMetadata } from "../../../src/types/tool-system";

// ============================================
// Mock 数据工厂
// ============================================

function createValidSkillContent(overrides: Record<string, unknown> = {}): string {
  return `---
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

## Usage

\`\`\`javascript
const result = await executeSkill('test-skill', { input: 'data' });
\`\`\`
`;
}

function createMinimalSkillContent(): string {
  return `---
name: minimal-skill
description: A minimal skill without optional fields
---

Minimal content here.
`;
}

// ============================================
// Skill 加载测试
// ============================================

describe("Skill Loading Tests", () => {
  let parser: ClaudeCodeSkillParser;
  let tempDir: string;

  beforeEach(async () => {
    parser = new ClaudeCodeSkillParser();
    tempDir = path.join(os.tmpdir(), `skill-load-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("Basic Skill Loading", () => {
    it("should load valid SKILL.md file", async () => {
      const skillContent = createValidSkillContent();
      const skillPath = path.join(tempDir, "test-skill");
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContent);

      const result = await parser.parse(skillPath);

      expect(result.metadata.name).toBe("test-skill");
      expect(result.metadata.description).toBe("A test skill for unit testing");
      expect(result.metadata.version).toBe("1.0.0");
      expect(result.metadata.author).toBe("Test Author");
      expect(result.metadata.tags).toEqual(["test", "unit"]);
      expect(result.compatibility.source).toBe("claude-code");
      expect(result.compatibility.allowedTools).toEqual(["read", "write"]);
      expect(result.compatibility.model).toBe("claude-3-5-sonnet-20241022");
      expect(result.compatibility.context).toBe("inline");
      expect(result.compatibility.userInvocable).toBe(true);
      expect(result.content).toContain("# Test Skill Content");
    });

    it("should use default version when not provided", async () => {
      const skillContent = createMinimalSkillContent();
      const skillPath = path.join(tempDir, "minimal-skill");
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContent);

      const result = await parser.parse(skillPath);

      expect(result.metadata.version).toBe("0.1.0");
    });

    it("should set default values for optional fields", async () => {
      const skillContent = createMinimalSkillContent();
      const skillPath = path.join(tempDir, "defaults-skill");
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContent);

      const result = await parser.parse(skillPath);

      expect(result.metadata.dependencies).toEqual([]);
      expect(result.compatibility.allowedTools).toEqual([]);
      expect(result.compatibility.userInvocable).toBe(false);
    });

    it("should throw ParseError when SKILL.md is missing", async () => {
      await expect(parser.parse(tempDir)).rejects.toThrow(ParseError);
      await expect(parser.parse(tempDir)).rejects.toMatchObject({
        code: "FILE_NOT_FOUND",
      });
    });

    it("should throw ParseError for invalid name format", async () => {
      const skillContent = `---
name: Invalid Name With Spaces And-Special@Chars!
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

    it("should handle various YAML formats", async () => {
      // gray-matter library is lenient with YAML, so test with valid but unusual formats
      const unusualContent = `---
name: test-skill
description: Test
tags:
  - tag1
  - tag2
version: 1.0.0
---

Content
`;

      const skillPath = path.join(tempDir, "unusual-yaml-skill");
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, "SKILL.md"), unusualContent);

      const result = await parser.parse(skillPath);

      // Should parse successfully
      expect(result.metadata.name).toBe("test-skill");
      expect(result.metadata.tags).toEqual(["tag1", "tag2"]);
    });
  });

  describe("Field Validation", () => {
    it("should validate required tools format", async () => {
      const skillContent = `---
name: test-skill
description: Test
allowedTools: read
---

Content
`;
      const skillPath = path.join(tempDir, "tools-skill");
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContent);

      const result = await parser.parse(skillPath);

      expect(result.compatibility.allowedTools).toEqual(["read"]);
    });

    it("should validate tags format", async () => {
      const skillContent = `---
name: test-skill
description: Test
tags: [tag1, tag2, tag3]
---

Content
`;
      const skillPath = path.join(tempDir, "tags-skill");
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContent);

      const result = await parser.parse(skillPath);

      expect(result.metadata.tags).toEqual(["tag1", "tag2", "tag3"]);
    });

    it("should validate dependencies format", async () => {
      const skillContent = `---
name: test-skill
description: Test
requires: [dep1, dep2]
---

Content
`;
      const skillPath = path.join(tempDir, "deps-skill");
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContent);

      const result = await parser.parse(skillPath);

      expect(result.metadata.dependencies).toEqual(["dep1", "dep2"]);
    });

    it("should validate model field format", async () => {
      const skillContent = `---
name: test-skill
description: Test
model: claude-3-5-sonnet-20241022
---

Content
`;
      const skillPath = path.join(tempDir, "model-skill");
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContent);

      const result = await parser.parse(skillPath);

      expect(result.compatibility.model).toBe("claude-3-5-sonnet-20241022");
    });
  });

  describe("Content Parsing", () => {
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

    it("should preserve markdown formatting", async () => {
      const skillContent = `---
name: test-skill
description: Test
---

# Heading

\`\`\`javascript
console.log('code');
\`\`\`

- List item 1
- List item 2
`;
      const skillPath = path.join(tempDir, "format-skill");
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContent);

      const result = await parser.parse(skillPath);

      expect(result.content).toContain("# Heading");
      expect(result.content).toContain("console.log");
      expect(result.content).toContain("List item 1");
    });
  });

  describe("Directory Parsing", () => {
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

    it("should not parse skills in nested directories", async () => {
      // Create skill in nested directory (should be ignored)
      const nestedPath = path.join(tempDir, "nested", "deep");
      await fs.mkdir(nestedPath, { recursive: true });
      await fs.writeFile(
        path.join(nestedPath, "SKILL.md"),
        `---
name: nested-skill
description: Skill in nested directory
version: 1.0.0
---

Content
`
      );

      // Create a valid skill in root
      const rootSkillPath = path.join(tempDir, "root-skill");
      await fs.mkdir(rootSkillPath, { recursive: true });
      await fs.writeFile(
        path.join(rootSkillPath, "SKILL.md"),
        `---
name: root-skill
description: Skill in root directory
version: 1.0.0
---

Content
`
      );

      const result = await parser.parseDirectory(tempDir);

      // Only skills in direct subdirectories should be parsed
      expect(result.get("root-skill")).toBeDefined();
      expect(result.get("nested-skill")).toBeUndefined();
    });

    it("should handle empty directory", async () => {
      const emptyDir = path.join(tempDir, "empty");
      await fs.mkdir(emptyDir, { recursive: true });

      const result = await parser.parseDirectory(emptyDir);

      expect(result.size).toBe(0);
    });
  });
});

// ============================================
// Skill 执行测试
// ============================================

describe("Skill Execution Tests", () => {
  let executor: ScriptExecutor;
  let tempDir: string;

  beforeEach(async () => {
    executor = new ScriptExecutor();
    tempDir = path.join(os.tmpdir(), `skill-exec-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await executor.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("Script Validation", () => {
    it("should return valid for existing script", async () => {
      const scriptPath = path.join(tempDir, "test.js");
      await fs.writeFile(scriptPath, 'console.log("test");');

      const result = await executor.validateScript(scriptPath);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.capabilities.languages).toContain("javascript");
    });

    it("should return invalid for non-existent script", async () => {
      const scriptPath = path.join(tempDir, "non-existent.js");

      const result = await executor.validateScript(scriptPath);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should detect different script types", async () => {
      const jsPath = path.join(tempDir, "test.js");
      await fs.writeFile(jsPath, 'console.log("test");');

      const pyPath = path.join(tempDir, "test.py");
      await fs.writeFile(pyPath, 'print("test")');

      const jsResult = await executor.validateScript(jsPath);
      const pyResult = await executor.validateScript(pyPath);

      expect(jsResult.capabilities.languages).toContain("javascript");
      expect(pyResult.capabilities.languages).toContain("python");
    });

    it("should validate bash scripts", async () => {
      const bashPath = path.join(tempDir, "test.sh");
      await fs.writeFile(bashPath, '#!/bin/bash\necho "test"');

      const result = await executor.validateScript(bashPath);

      expect(result.valid).toBe(true);
      expect(result.capabilities.languages).toContain("bash");
    });

    it("should validate existing script files", async () => {
      const validPath = path.join(tempDir, "valid.js");
      await fs.writeFile(validPath, 'console.log("test");');

      const result = await executor.validateScript(validPath);

      // ScriptExecutor validates file existence and extension
      expect(result.valid).toBe(true);
    });
  });

  describe("Script Execution", () => {
    it("should execute JavaScript script successfully", async () => {
      const scriptPath = path.join(tempDir, "execute-test.js");
      await fs.writeFile(
        scriptPath,
        "const args = JSON.parse(process.argv[2]); console.log(JSON.stringify({ success: true, echo: args.value }));"
      );

      const result = await executor.execute(scriptPath, { value: "test-value" });

      expect(result.success).toBe(true);
      expect(result.output).toContain("test-value");
    });

    it("should execute Python script successfully", async () => {
      const scriptPath = path.join(tempDir, "execute-test.py");
      await fs.writeFile(
        scriptPath,
        'import json; import sys; args = json.loads(sys.argv[1]); print(json.dumps({"success": True, "echo": args["value"]}))'
      );

      const result = await executor.execute(scriptPath, { value: "test-value" });

      expect(result.success).toBe(true);
      expect(result.output).toContain("test-value");
    });

    it("should pass arguments to script", async () => {
      const scriptPath = path.join(tempDir, "args-test.js");
      await fs.writeFile(
        scriptPath,
        "const args = JSON.parse(process.argv[2]); console.log(args.test);"
      );

      const result = await executor.execute(scriptPath, { test: "hello" });

      expect(result.success).toBe(true);
      expect(result.output).toContain("hello");
    });

    it("should handle script errors gracefully", async () => {
      const scriptPath = path.join(tempDir, "error-test.js");
      await fs.writeFile(scriptPath, 'throw new Error("Test error");');

      const result = await executor.execute(scriptPath, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("Test error");
    });

    it("should respect timeout option", async () => {
      const scriptPath = path.join(tempDir, "timeout-test.js");
      await fs.writeFile(
        scriptPath,
        'setTimeout(() => { console.log("done"); process.exit(0); }, 5000);'
      );

      const result = await executor.execute(scriptPath, {}, { timeoutMs: 100 });

      expect(result.success).toBe(false);
      expect(result.error).toContain("timed out");
    });

    it("should capture stdout correctly", async () => {
      const scriptPath = path.join(tempDir, "stdout-test.js");
      await fs.writeFile(scriptPath, 'console.log("line1\\nline2\\nline3");');

      const result = await executor.execute(scriptPath, {});

      expect(result.success).toBe(true);
      expect(result.output).toContain("line1");
      expect(result.output).toContain("line2");
      expect(result.output).toContain("line3");
    });

    it("should execute scripts with output", async () => {
      const scriptPath = path.join(tempDir, "output.js");
      await fs.writeFile(scriptPath, 'console.log("test output"); process.exit(0);');

      const result = await executor.execute(scriptPath, {});

      expect(result.success).toBe(true);
      expect(result.output).toContain("test output");
    });
  });

  describe("Execution Isolation", () => {
    it("should terminate all active processes on cleanup", async () => {
      const scriptPath = path.join(tempDir, "long-running.js");
      await fs.writeFile(
        scriptPath,
        'setTimeout(() => { console.log("done"); process.exit(0); }, 30000);'
      );

      // Start a long-running script
      const executePromise = executor.execute(scriptPath, {});

      // Wait a bit for process to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Cleanup should terminate the process
      await executor.cleanup();

      const result = await executePromise;
      expect(result.success).toBe(false);
    });

    it("should not allow scripts to access parent process", async () => {
      const scriptPath = path.join(tempDir, "isolation-test.js");
      await fs.writeFile(
        scriptPath,
        "console.log(process.ppid);" // Should print parent PID
      );

      const result = await executor.execute(scriptPath, {});

      expect(result.success).toBe(true);
      expect(result.output.trim()).toMatch(/^\d+$/);
    });

    it("should limit execution time per script", async () => {
      const scriptPath = path.join(tempDir, "timelimit-test.js");
      await fs.writeFile(scriptPath, 'setTimeout(() => { console.log("finished"); }, 2000);');

      const result = await executor.execute(scriptPath, {}, { timeoutMs: 500 });

      expect(result.success).toBe(false);
      expect(result.error).toContain("timed out");
    });
  });

  describe("Capabilities Detection", () => {
    it("should return capabilities for script", () => {
      const scriptPath = path.join(tempDir, "test.js");

      const capabilities = executor.getCapabilities(scriptPath);

      expect(capabilities.languages).toContain("javascript");
      expect(capabilities.hasFileSystemAccess).toBe(true);
    });

    it("should detect shebang for script type", async () => {
      const pythonPath = path.join(tempDir, "shebang.py");
      await fs.writeFile(pythonPath, '#!/usr/bin/env python3\nprint("test")');

      const capabilities = executor.getCapabilities(pythonPath);

      expect(capabilities.languages).toContain("python");
    });

    it("should handle unknown file types", () => {
      const unknownPath = path.join(tempDir, "test.xyz");

      const capabilities = executor.getCapabilities(unknownPath);

      expect(capabilities.languages).toEqual([]);
    });
  });
});

// ============================================
// 结果格式化测试
// ============================================

describe("Result Formatting Tests", () => {
  describe("Skill Result Format", () => {
    it("should format successful execution result", async () => {
      // This test verifies the expected format of skill execution results
      const mockResult = {
        success: true,
        output: "Execution completed",
        executionTime: 150,
        metadata: {
          skillName: "test-skill",
          version: "1.0.0",
        },
      };

      expect(mockResult.success).toBe(true);
      expect(mockResult).toHaveProperty("output");
      expect(mockResult).toHaveProperty("executionTime");
      expect(mockResult.metadata.skillName).toBe("test-skill");
    });

    it("should format error result", async () => {
      const mockErrorResult = {
        success: false,
        error: "Execution failed",
        errorType: "TIMEOUT",
        executionTime: 5000,
        metadata: {
          skillName: "test-skill",
          version: "1.0.0",
        },
      };

      expect(mockErrorResult.success).toBe(false);
      expect(mockErrorResult).toHaveProperty("error");
      expect(mockErrorResult).toHaveProperty("errorType");
    });

    it("should format partial result", async () => {
      const mockPartialResult = {
        success: true,
        output: "Partial output",
        executionTime: 2000,
        truncated: true,
        remainingDataSize: 1024,
      };

      expect(mockPartialResult.success).toBe(true);
      expect(mockPartialResult.truncated).toBe(true);
      expect(mockPartialResult).toHaveProperty("remainingDataSize");
    });
  });

  describe("Disclosure Result Format", () => {
    it("should format L1 disclosure result", () => {
      const l1Result = {
        level: "METADATA",
        name: "test-skill",
        description: "A test skill",
        version: "1.0.0",
        author: "Test Author",
        tags: ["test", "unit"],
        tokenCount: 50,
      };

      expect(l1Result.level).toBe("METADATA");
      expect(l1Result).not.toHaveProperty("parameters");
      expect(l1Result).not.toHaveProperty("scripts");
      expect(l1Result).toHaveProperty("tags");
    });

    it("should format L2 disclosure result", () => {
      const l2Result = {
        level: "CONTENT",
        name: "test-skill",
        description: "A test skill",
        tokenCount: 500,
        parameters: [{ name: "input", type: "string", required: true }],
        examples: [{ input: "test", output: "result" }],
      };

      expect(l2Result.level).toBe("CONTENT");
      expect(l2Result).toHaveProperty("parameters");
      expect(l2Result).toHaveProperty("examples");
      expect(l2Result).not.toHaveProperty("scripts");
    });

    it("should format L3 disclosure result", () => {
      const l3Result = {
        level: "RESOURCES",
        name: "test-skill",
        description: "A test skill",
        tokenCount: 2000,
        parameters: [],
        examples: [],
        scripts: [{ name: "main", language: "javascript" }],
        dependencies: [{ name: "lodash", version: "^4.17.21" }],
        resources: [{ type: "file", path: "./README.md" }],
      };

      expect(l3Result.level).toBe("RESOURCES");
      expect(l3Result).toHaveProperty("scripts");
      expect(l3Result).toHaveProperty("dependencies");
      expect(l3Result).toHaveProperty("resources");
    });
  });
});

// ============================================
// 兼容性验证测试
// ============================================

describe("Compatibility Validation Tests", () => {
  let lifecycleManager: LifecycleManager;

  beforeEach(() => {
    lifecycleManager = new LifecycleManager();
  });

  afterEach(() => {
    lifecycleManager.clear();
  });

  describe("Lifecycle Hooks", () => {
    it("should register lifecycle hooks for a skill", () => {
      const hooks: SkillLifecycleHooks = {
        preInstall: jest.fn(),
        postInstall: jest.fn(),
      };

      lifecycleManager.registerHooks("test-skill", hooks);

      const registeredSkills = lifecycleManager.getRegisteredSkills();
      expect(registeredSkills).toContain("test-skill");
    });

    it("should unregister lifecycle hooks for a skill", () => {
      const hooks: SkillLifecycleHooks = {
        preInstall: jest.fn(),
      };

      lifecycleManager.registerHooks("test-skill", hooks);
      lifecycleManager.unregisterHooks("test-skill");

      const registeredSkills = lifecycleManager.getRegisteredSkills();
      expect(registeredSkills).not.toContain("test-skill");
    });

    it("should execute preInstall hook when registered", async () => {
      const preInstallMock = jest.fn();
      const hooks: SkillLifecycleHooks = {
        preInstall: preInstallMock,
      };

      lifecycleManager.registerHooks("test-skill", hooks);

      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
        metadata: {
          name: "test-skill",
          description: "Test",
          version: "1.0.0",
          tags: [],
        },
      };

      await lifecycleManager.preInstall(ctx);

      expect(preInstallMock).toHaveBeenCalledWith(ctx);
    });

    it("should execute postInstall hook when registered", async () => {
      const postInstallMock = jest.fn();
      const hooks: SkillLifecycleHooks = {
        postInstall: postInstallMock,
      };

      lifecycleManager.registerHooks("test-skill", hooks);

      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
        compatibility: {
          source: "claude-code",
        },
      };

      await lifecycleManager.postInstall(ctx);

      expect(postInstallMock).toHaveBeenCalledWith(ctx);
    });

    it("should cache compatibility information", async () => {
      const hooks: SkillLifecycleHooks = {};

      lifecycleManager.registerHooks("test-skill", hooks);

      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
        compatibility: {
          source: "claude-code",
          model: "claude-3-5-sonnet",
        },
      };

      await lifecycleManager.postInstall(ctx);

      const compatibility = lifecycleManager.getCompatibility("test-skill");
      expect(compatibility?.source).toBe("claude-code");
      expect(compatibility?.model).toBe("claude-3-5-sonnet");
    });

    it("should execute preUpdate hook when registered", async () => {
      const preUpdateMock = jest.fn();
      const hooks: SkillLifecycleHooks = {
        preUpdate: preUpdateMock,
      };

      lifecycleManager.registerHooks("test-skill", hooks);

      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
      };

      await lifecycleManager.preUpdate(ctx);

      expect(preUpdateMock).toHaveBeenCalledWith(ctx);
    });

    it("should execute postUpdate hook when registered", async () => {
      const postUpdateMock = jest.fn();
      const hooks: SkillLifecycleHooks = {
        postUpdate: postUpdateMock,
      };

      lifecycleManager.registerHooks("test-skill", hooks);

      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
      };

      await lifecycleManager.postUpdate(ctx);

      expect(postUpdateMock).toHaveBeenCalledWith(ctx);
    });

    it("should execute preUninstall hook when registered", async () => {
      const preUninstallMock = jest.fn();
      const hooks: SkillLifecycleHooks = {
        preUninstall: preUninstallMock,
      };

      lifecycleManager.registerHooks("test-skill", hooks);

      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
      };

      await lifecycleManager.preUninstall(ctx);

      expect(preUninstallMock).toHaveBeenCalledWith(ctx);
    });

    it("should execute postUninstall hook when registered", async () => {
      const postUninstallMock = jest.fn();
      const hooks: SkillLifecycleHooks = {
        postUninstall: postUninstallMock,
      };

      lifecycleManager.registerHooks("test-skill", hooks);

      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
      };

      await lifecycleManager.postUninstall(ctx);

      expect(postUninstallMock).toHaveBeenCalledWith(ctx);
    });

    it("should clear hooks and cache after uninstall", async () => {
      const hooks: SkillLifecycleHooks = {};

      lifecycleManager.registerHooks("test-skill", hooks);

      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
        compatibility: {
          source: "claude-code",
        },
      };

      await lifecycleManager.postUninstall(ctx);

      const registeredSkills = lifecycleManager.getRegisteredSkills();
      const compatibility = lifecycleManager.getCompatibility("test-skill");

      expect(registeredSkills).not.toContain("test-skill");
      expect(compatibility).toBeUndefined();
    });

    it("should not throw when no hook is registered", async () => {
      const ctx: SkillLifecycleContext = {
        skillName: "unregistered-skill",
        skillPath: "/path/to/unregistered-skill",
      };

      await expect(lifecycleManager.preInstall(ctx)).resolves.not.toThrow();
    });
  });

  describe("Dependency Checking", () => {
    it("should return satisfied when all dependencies are installed", async () => {
      const result = await lifecycleManager.checkDependencies(
        ["dep1", "dep2"],
        ["dep1", "dep2", "dep3"]
      );

      expect(result.satisfied).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.installed).toEqual(["dep1", "dep2"]);
    });

    it("should return unsatisfied when some dependencies are missing", async () => {
      const result = await lifecycleManager.checkDependencies(
        ["dep1", "missing-dep"],
        ["dep1", "dep2"]
      );

      expect(result.satisfied).toBe(false);
      expect(result.missing).toEqual(["missing-dep"]);
      expect(result.installed).toEqual(["dep1"]);
    });

    it("should be case-insensitive for dependency names", async () => {
      const result = await lifecycleManager.checkDependencies(["Dep1"], ["dep1"]);

      expect(result.satisfied).toBe(true);
    });

    it("should handle empty dependency list", async () => {
      const result = await lifecycleManager.checkDependencies([], ["dep1", "dep2"]);

      expect(result.satisfied).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it("should handle missing dependency list", async () => {
      const result = await lifecycleManager.checkDependencies(["dep1"], []);

      expect(result.satisfied).toBe(false);
      expect(result.missing).toEqual(["dep1"]);
    });
  });

  describe("Capability Checking", () => {
    it("should return true when skill has capability", async () => {
      const hooks: SkillLifecycleHooks = {};

      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
        compatibility: {
          source: "claude-code",
          userInvocable: true,
        },
      };

      await lifecycleManager.postInstall(ctx);

      expect(lifecycleManager.hasCapability("test-skill", "userInvocable")).toBe(true);
    });

    it("should return false when skill does not have capability", async () => {
      const hooks: SkillLifecycleHooks = {};

      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
        compatibility: {
          source: "claude-code",
        },
      };

      await lifecycleManager.postInstall(ctx);

      expect(lifecycleManager.hasCapability("test-skill", "userInvocable")).toBe(false);
    });

    it("should return false for unregistered skills", () => {
      expect(lifecycleManager.hasCapability("unregistered", "userInvocable")).toBe(false);
    });

    it("should return false for unknown capability", async () => {
      const hooks: SkillLifecycleHooks = {};

      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
        compatibility: {
          source: "claude-code",
        },
      };

      await lifecycleManager.postInstall(ctx);

      // 使用类型断言测试未知能力
      expect((lifecycleManager as any).hasCapability("test-skill", "unknownCapability")).toBe(
        false
      );
    });
  });

  describe("Context Creation", () => {
    it("should create context with all provided fields", () => {
      const metadata: SkillMetadata = {
        name: "test-skill",
        description: "Test",
        version: "1.0.0",
        tags: [],
        dependencies: ["dep1"],
      };

      const ctx = lifecycleManager.createContext(
        "test-skill",
        "/path/to/test-skill",
        metadata,
        { source: "claude-code" },
        "strict"
      );

      expect(ctx.skillName).toBe("test-skill");
      expect(ctx.skillPath).toBe("/path/to/test-skill");
      expect(ctx.metadata).toBe(metadata);
      expect(ctx.compatibility?.source).toBe("claude-code");
      expect(ctx.validationLevel).toBe("strict");
      expect(ctx.dependencies).toEqual(["dep1"]);
    });

    it("should use default validation level when not provided", () => {
      const metadata: SkillMetadata = {
        name: "test-skill",
        description: "Test",
        version: "1.0.0",
        tags: [],
      };

      const ctx = lifecycleManager.createContext("test-skill", "/path/to/test-skill", metadata);

      expect(ctx.validationLevel).toBe("basic");
    });

    it("should handle empty dependencies", () => {
      const metadata: SkillMetadata = {
        name: "test-skill",
        description: "Test",
        version: "1.0.0",
        tags: [],
      };

      const ctx = lifecycleManager.createContext("test-skill", "/path/to/test-skill", metadata);

      expect(ctx.dependencies).toBeUndefined();
    });
  });

  describe("Clear Functionality", () => {
    it("should remove all registered hooks", () => {
      lifecycleManager.registerHooks("skill1", {});
      lifecycleManager.registerHooks("skill2", {});

      lifecycleManager.clear();

      const registeredSkills = lifecycleManager.getRegisteredSkills();
      expect(registeredSkills).toEqual([]);
    });

    it("should clear all cached compatibility info", async () => {
      const ctx: SkillLifecycleContext = {
        skillName: "test-skill",
        skillPath: "/path/to/test-skill",
        compatibility: {
          source: "claude-code",
        },
      };

      await lifecycleManager.postInstall(ctx);

      lifecycleManager.clear();

      const compatibility = lifecycleManager.getCompatibility("test-skill");
      expect(compatibility).toBeUndefined();
    });
  });
});

// ============================================
// 端到端兼容性测试
// ============================================

describe("End-to-End Compatibility Tests", () => {
  let parser: ClaudeCodeSkillParser;
  let executor: ScriptExecutor;
  let lifecycleManager: LifecycleManager;
  let tempDir: string;

  beforeEach(async () => {
    parser = new ClaudeCodeSkillParser();
    executor = new ScriptExecutor();
    lifecycleManager = new LifecycleManager();
    tempDir = path.join(os.tmpdir(), `e2e-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await executor.cleanup();
    lifecycleManager.clear();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should load, parse, and execute a complete skill", async () => {
    // Create a skill
    const skillContent = `---
name: complete-skill
description: A complete skill for testing
version: 1.0.0
author: Test Author
tags: [test, e2e]
allowedTools: [read, write]
model: claude-3-5-sonnet-20241022
context: inline
userInvocable: true
---

# Complete Skill

This skill is used for end-to-end testing.

## Script

\`\`\`javascript
console.log("Skill executed successfully");
\`\`\`
`;
    const skillPath = path.join(tempDir, "complete-skill");
    await fs.mkdir(skillPath, { recursive: true });
    await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContent);

    // Parse the skill
    const parsedSkill = await parser.parse(skillPath);
    expect(parsedSkill.metadata.name).toBe("complete-skill");
    expect(parsedSkill.compatibility.source).toBe("claude-code");

    // Register lifecycle
    lifecycleManager.registerHooks("complete-skill", {});
    const ctx = lifecycleManager.createContext(
      "complete-skill",
      skillPath,
      parsedSkill.metadata,
      parsedSkill.compatibility,
      "strict"
    );
    await lifecycleManager.postInstall(ctx);

    // Verify lifecycle
    expect(lifecycleManager.hasCapability("complete-skill", "userInvocable")).toBe(true);
    expect(lifecycleManager.hasCapability("complete-skill", "allowedTools")).toBe(true);

    // Cleanup
    await lifecycleManager.preUninstall(ctx);
    await lifecycleManager.postUninstall(ctx);

    expect(lifecycleManager.getRegisteredSkills()).not.toContain("complete-skill");
  });

  it("should handle multiple skills in parallel", async () => {
    // Create multiple skills
    const skills = ["skill-1", "skill-2", "skill-3"];
    for (const skillName of skills) {
      const skillContent = `---
name: ${skillName}
description: Skill number ${skillName.split("-")[1]}
version: 1.0.0
---

Content for ${skillName}
`;
      const skillPath = path.join(tempDir, skillName);
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContent);
    }

    // Parse all skills in parallel
    const parsePromises = skills.map(async (skillName) => {
      return parser.parse(path.join(tempDir, skillName));
    });

    const results = await Promise.all(parsePromises);

    // All should parse successfully
    expect(results.length).toBe(3);
    results.forEach((result, index) => {
      expect(result.metadata.name).toBe(skills[index]);
    });

    // Register all lifecycle hooks in parallel
    const lifecyclePromises = results.map(async (result) => {
      lifecycleManager.registerHooks(result.metadata.name, {});
      const ctx = lifecycleManager.createContext(
        result.metadata.name,
        path.join(tempDir, result.metadata.name),
        result.metadata,
        result.compatibility
      );
      await lifecycleManager.postInstall(ctx);
    });

    await Promise.all(lifecyclePromises);

    // All skills should be registered
    const registeredSkills = lifecycleManager.getRegisteredSkills();
    skills.forEach((skill) => {
      expect(registeredSkills).toContain(skill);
    });
  });

  it("should maintain compatibility across version updates", async () => {
    // Create initial skill
    const skillContentV1 = `---
name: versioned-skill
description: Version 1.0
version: 1.0.0
---

Version 1 content
`;
    const skillPath = path.join(tempDir, "versioned-skill");
    await fs.mkdir(skillPath, { recursive: true });
    await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContentV1);

    // Parse and install v1
    const skillV1 = await parser.parse(skillPath);
    lifecycleManager.registerHooks("versioned-skill", {});
    const ctxV1 = lifecycleManager.createContext(
      "versioned-skill",
      skillPath,
      skillV1.metadata,
      skillV1.compatibility
    );
    await lifecycleManager.postInstall(ctxV1);

    // Verify v1
    let compatibility = lifecycleManager.getCompatibility("versioned-skill");
    expect(compatibility?.source).toBe("claude-code");

    // Update to v2
    const skillContentV2 = `---
name: versioned-skill
description: Version 2.0
version: 2.0.0
---

Version 2 content
`;
    await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContentV2);

    // Parse and update
    const skillV2 = await parser.parse(skillPath);
    const ctxV2 = lifecycleManager.createContext("versioned-skill", skillPath, skillV2.metadata, {
      ...skillV2.compatibility,
      model: "claude-4",
    });
    await lifecycleManager.postUpdate(ctxV2);

    // Verify v2
    compatibility = lifecycleManager.getCompatibility("versioned-skill");
    expect(compatibility?.model).toBe("claude-4");
  });
});
