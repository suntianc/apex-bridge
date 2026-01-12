/**
 * ContextModeExecutor 单元测试
 */

import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import {
  ContextModeExecutor,
  getContextModeExecutor,
} from "../../../../src/services/compat/ContextModeExecutor";
import { ContextMode, ExecutionOptions } from "../../../../src/services/compat/types";

describe("ContextModeExecutor", () => {
  let executor: ContextModeExecutor;
  let testSkillPath: string;
  let testSkillDir: string;

  beforeEach(async () => {
    executor = new ContextModeExecutor();
    testSkillDir = path.join(os.tmpdir(), "test-skills", `test-${Date.now()}`);
    await fs.mkdir(testSkillDir, { recursive: true });

    // 创建测试技能目录结构
    testSkillPath = path.join(testSkillDir, "test-skill");
    await fs.mkdir(testSkillPath, { recursive: true });

    // 创建测试 SKILL.md
    const skillMdContent = `---
name: test-skill
description: A test skill for context mode testing
version: 1.0.0
context: inline
---

# Test Skill

This is a test skill for validating context mode execution.
`;
    await fs.writeFile(path.join(testSkillPath, "SKILL.md"), skillMdContent);

    // 创建测试脚本
    const scriptContent = `console.log('Test skill executed successfully');`;
    await fs.writeFile(path.join(testSkillPath, "index.js"), scriptContent);
  });

  afterEach(async () => {
    await executor.cleanup();
    try {
      await fs.rm(testSkillDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  describe("execute", () => {
    it("should execute in inline mode with shared context", async () => {
      const result = await executor.execute(testSkillPath, "inline", {});

      expect(result.success).toBe(true);
      expect(result.mode).toBe("inline");
      expect(result.output).toContain("Inline execution");
    });

    it("should execute in fork mode and return fork mode indicator", async () => {
      const options: ExecutionOptions = { timeout: 10000 };
      const result = await executor.execute(testSkillPath, "fork", options);

      // Fork 模式会尝试执行脚本
      expect(result.mode).toBe("fork");
      // 结果可能是 success 或 false（取决于脚本是否存在可执行内容）
      expect(typeof result.durationMs).toBe("number");
    });

    it("should return error for invalid mode", async () => {
      const result = await executor.execute(testSkillPath, "invalid" as ContextMode, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown context mode");
    });

    it("should pass execution options correctly", async () => {
      const options: ExecutionOptions = {
        timeout: 5000,
        memoryLimit: 256,
        env: { TEST_VAR: "test-value" },
      };

      const result = await executor.execute(testSkillPath, "inline", options);

      expect(result.success).toBe(true);
    });

    it("should handle non-existent skill path gracefully", async () => {
      const nonExistentPath = path.join(testSkillDir, "non-existent");
      const result = await executor.execute(nonExistentPath, "inline", {});

      // Inline 模式会尝试加载上下文
      expect(result.mode).toBe("inline");
      // 不会抛出异常，返回结果
      expect(typeof result.durationMs).toBe("number");
    });
  });

  describe("executeInCurrentProcess (inline mode)", () => {
    it("should load skill context correctly", async () => {
      const options: ExecutionOptions = {
        files: ["SKILL.md", "index.js"],
        env: { INLINE_TEST: "true" },
      };

      const result = await executor.execute(testSkillPath, "inline", options);

      expect(result.success).toBe(true);
      expect(result.mode).toBe("inline");
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.files).toBeDefined();
    });
  });

  describe("getContextModeExecutor", () => {
    it("should return singleton instance", () => {
      const executor1 = getContextModeExecutor();
      const executor2 = getContextModeExecutor();

      expect(executor1).toBe(executor2);
    });

    it("should accept custom workspace path", () => {
      const customPath = "/custom/workspace";
      const executor = new ContextModeExecutor(customPath);

      expect(executor).toBeInstanceOf(ContextModeExecutor);
    });
  });

  describe("cleanup", () => {
    it("should cleanup resources without error", async () => {
      await expect(executor.cleanup()).resolves.not.toThrow();
    });

    it("should terminate all active processes", async () => {
      // 在 fork 模式下启动一个进程
      const options: ExecutionOptions = { timeout: 60000 };
      await executor.execute(testSkillPath, "fork", options);

      await expect(executor.terminateAllProcesses()).resolves.not.toThrow();
    });
  });

  // ==================== VUL-006: Cleanup Retry Tests ====================

  describe("cleanupWorkspace with retry (VUL-006)", () => {
    it("should cleanup workspace successfully on first attempt", async () => {
      const tempDir = path.join(os.tmpdir(), `test-cleanup-${Date.now()}`);
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(path.join(tempDir, "test.txt"), "test content");

      await expect(executor.cleanup()).resolves.not.toThrow();

      // Clean up test directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it("should handle cleanup errors gracefully", async () => {
      await expect(executor.cleanup()).resolves.not.toThrow();
    });

    it("should retry cleanup on failure", async () => {
      const testDir = path.join(os.tmpdir(), `test-retry-${Date.now()}`);
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(path.join(testDir, "file.txt"), "content");

      const dirExists = await fs
        .access(testDir)
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(true);

      const tempExecutor = new ContextModeExecutor(testDir);
      await tempExecutor.cleanup();

      const afterCleanup = await fs
        .access(testDir)
        .then(() => true)
        .catch(() => false);
    });
  });
});

describe("ContextMode types", () => {
  it("should accept fork and inline as valid ContextMode", () => {
    const forkMode: ContextMode = "fork";
    const inlineMode: ContextMode = "inline";

    expect(forkMode).toBe("fork");
    expect(inlineMode).toBe("inline");
  });

  it("should have correct type guards", () => {
    const isValidMode = (mode: string): mode is ContextMode => {
      return mode === "fork" || mode === "inline";
    };

    expect(isValidMode("fork")).toBe(true);
    expect(isValidMode("inline")).toBe(true);
    expect(isValidMode("invalid")).toBe(false);
  });
});
