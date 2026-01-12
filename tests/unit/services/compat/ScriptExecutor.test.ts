/**
 * Unit tests for ScriptExecutor
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { ScriptExecutor } from "../../../../src/services/compat/ScriptExecutor";

describe("ScriptExecutor", () => {
  let executor: ScriptExecutor;
  let tempDir: string;

  beforeEach(async () => {
    executor = new ScriptExecutor();
    tempDir = path.join(os.tmpdir(), `script-executor-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await executor.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("validateScript", () => {
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
  });

  describe("getCapabilities", () => {
    it("should return capabilities for script", () => {
      const scriptPath = path.join(tempDir, "test.js");

      const capabilities = executor.getCapabilities(scriptPath);

      expect(capabilities.languages).toContain("javascript");
      expect(capabilities.hasFileSystemAccess).toBe(true);
    });
  });

  describe("execute", () => {
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

    it("should handle script errors gracefully", async () => {
      const scriptPath = path.join(tempDir, "error-test.js");
      await fs.writeFile(scriptPath, 'throw new Error("Test error");');

      const result = await executor.execute(scriptPath, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("Test error");
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
  });

  describe("cleanup", () => {
    it("should terminate all active processes", async () => {
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
  });
});
