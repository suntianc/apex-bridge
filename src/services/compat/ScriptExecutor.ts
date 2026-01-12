/**
 * ScriptExecutor - 脚本执行适配器
 * 在隔离环境中执行技能脚本，支持多种隔离策略
 */

import { spawn, ChildProcess } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import {
  ScriptExecutionOptions,
  ScriptExecutionResult,
  ScriptCapabilities,
  ValidationResult,
} from "./types";
import { logger } from "../../utils/logger";

/**
 * 默认执行选项
 */
const DEFAULT_OPTIONS: Required<ScriptExecutionOptions> = {
  timeoutMs: 60000,
  maxOutputSize: 10 * 1024 * 1024, // 10MB
  memoryLimitMb: 512,
  env: {},
  network: "deny",
};

/**
 * 最大参数大小 (1MB)
 */
const MAX_ARGS_SIZE = 1 * 1024 * 1024;

/**
 * 脚本执行适配器
 */
export class ScriptExecutor {
  private readonly workspacePath: string;
  private readonly activeProcesses: Map<string, ChildProcess>;

  constructor(workspacePath?: string) {
    this.workspacePath = workspacePath || path.join(os.tmpdir(), "skill-executor");
    this.activeProcesses = new Map();
    this.ensureWorkspaceDirectory();
  }

  /**
   * 确保工作区目录存在
   */
  private async ensureWorkspaceDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.workspacePath, { recursive: true });
    } catch (error) {
      logger.error("Failed to create workspace directory:", error);
    }
  }

  /**
   * 执行脚本
   */
  async execute(
    scriptPath: string,
    args: Record<string, unknown>,
    options?: ScriptExecutionOptions
  ): Promise<ScriptExecutionResult> {
    const startTime = Date.now();
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

    // 验证脚本路径
    const validation = await this.validateScript(scriptPath);
    if (!validation.valid) {
      return {
        success: false,
        output: "",
        error: `Script validation failed: ${validation.errors.join(", ")}`,
        durationMs: Date.now() - startTime,
      };
    }

    try {
      // 准备环境变量
      const env = this.prepareEnvironment(mergedOptions);

      // 创建隔离工作区
      const workspaceDir = await this.createWorkspace();

      // 执行脚本
      const result = await this.spawnProcess(scriptPath, args, workspaceDir, env, mergedOptions);

      // 清理工作区
      await this.cleanupWorkspace(workspaceDir);

      return {
        success: result.success,
        output: result.stdout,
        error: result.error,
        exitCode: result.exitCode,
        durationMs: Date.now() - startTime,
        metadata: {
          truncated: result.truncated,
        },
      };
    } catch (error) {
      logger.error("Script execution failed:", error);

      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "Unknown error",
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * 验证脚本
   */
  async validateScript(scriptPath: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 检查文件是否存在
      await fs.access(scriptPath);
    } catch {
      errors.push(`Script file not found: ${scriptPath}`);
      return {
        valid: false,
        errors,
        warnings,
        capabilities: {
          languages: [],
          hasNetworkAccess: false,
          hasFileSystemAccess: false,
          maxExecutionTimeMs: 0,
          maxMemoryMb: 0,
        },
      };
    }

    // 检查文件扩展名
    const ext = path.extname(scriptPath);
    const languages = this.detectLanguage(ext);

    if (languages.length === 0) {
      errors.push(`Unsupported script type: ${ext}`);
    }

    // 尝试读取脚本头部获取能力信息
    try {
      const content = await fs.readFile(scriptPath, "utf8");
      const capabilities = this.parseCapabilities(content);

      // 合并语言检测结果
      capabilities.languages = languages.length > 0 ? languages : capabilities.languages;

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        capabilities,
      };
    } catch {
      return {
        valid: errors.length === 0,
        errors,
        warnings,
        capabilities: {
          languages,
          hasNetworkAccess: false,
          hasFileSystemAccess: true,
          maxExecutionTimeMs: DEFAULT_OPTIONS.timeoutMs,
          maxMemoryMb: DEFAULT_OPTIONS.memoryLimitMb,
        },
      };
    }
  }

  /**
   * 获取脚本能力
   */
  getCapabilities(scriptPath: string): ScriptCapabilities {
    const ext = path.extname(scriptPath);
    const languages = this.detectLanguage(ext);

    return {
      languages,
      hasNetworkAccess: false,
      hasFileSystemAccess: true,
      maxExecutionTimeMs: DEFAULT_OPTIONS.timeoutMs,
      maxMemoryMb: DEFAULT_OPTIONS.memoryLimitMb,
    };
  }

  /**
   * 在子进程中执行脚本
   */
  private spawnProcess(
    scriptPath: string,
    args: Record<string, unknown>,
    workspaceDir: string,
    env: NodeJS.ProcessEnv,
    options: Required<ScriptExecutionOptions>
  ): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode?: number;
    error?: string;
    truncated: boolean;
  }> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      // 序列化参数
      const serializedArgs = JSON.stringify(args);
      const argsSize = Buffer.byteLength(serializedArgs);

      if (argsSize > MAX_ARGS_SIZE) {
        resolve({
          success: false,
          stdout: "",
          stderr: "",
          error: `Arguments exceed maximum size limit (${MAX_ARGS_SIZE} bytes)`,
          truncated: false,
        });
        return;
      }

      // 确定执行命令
      const command = this.getExecuteCommand(scriptPath);
      const processArgs = this.prepareProcessArgs(args);

      // 设置 spawn 选项
      const spawnOptions = {
        env,
        cwd: workspaceDir,
        stdio: ["pipe", "pipe", "pipe"] as ("pipe" | "ipc" | "ignore" | "inherit")[],
        shell: false,
        detached: false,
      };

      // 启动进程
      const process = spawn(command, [scriptPath, ...processArgs], spawnOptions);

      // 生成进程 ID
      const processId = crypto.randomUUID();
      this.activeProcesses.set(processId, process);

      let stdout = "";
      let stderr = "";
      let outputSize = 0;
      let truncated = false;

      // 收集 stdout
      if (process.stdout) {
        process.stdout.on("data", (data: Buffer) => {
          const chunk = data.toString();
          outputSize += Buffer.byteLength(chunk);

          if (outputSize > options.maxOutputSize && !truncated) {
            truncated = true;
            stdout += "\n[TRUNCATED: Output exceeded size limit]";
            this.terminateProcess(process);
            this.activeProcesses.delete(processId);
          } else if (!truncated) {
            stdout += chunk;
          }
        });
      }

      // 收集 stderr
      if (process.stderr) {
        process.stderr.on("data", (data: Buffer) => {
          const chunk = data.toString();
          if (!truncated) {
            stderr += chunk;
          }
        });
      }

      // 收集 stderr
      process.stderr?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        if (!truncated) {
          stderr += chunk;
        }
      });

      // 设置超时
      const timeout = setTimeout(() => {
        logger.warn(`Script execution timed out after ${options.timeoutMs}ms`);
        this.terminateProcess(process);
        this.activeProcesses.delete(processId);

        resolve({
          success: false,
          stdout,
          stderr: stderr || "Execution timed out",
          exitCode: -1,
          error: `Execution timed out after ${options.timeoutMs}ms`,
          truncated,
        });
      }, options.timeoutMs);

      // 处理进程退出
      process.on("close", (code: number | null, signal: string | null) => {
        clearTimeout(timeout);
        this.activeProcesses.delete(processId);

        const duration = Date.now() - startTime;

        if (code !== 0 && signal) {
          logger.warn(`Process exited with signal: ${signal}`);
        }

        resolve({
          success: code === 0 && !signal,
          stdout,
          stderr,
          exitCode: code ?? (signal ? -1 : 0),
          error: code !== 0 ? stderr.trim() || `Process exited with code ${code}` : undefined,
          truncated,
        });
      });

      // 处理进程错误
      process.on("error", (error: Error) => {
        clearTimeout(timeout);
        this.activeProcesses.delete(processId);

        logger.error("Process error:", error);

        resolve({
          success: false,
          stdout,
          stderr,
          error: error.message,
          truncated,
        });
      });
    });
  }

  /**
   * 准备环境变量
   */
  private prepareEnvironment(options: Required<ScriptExecutionOptions>): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...options.env,
      NODE_OPTIONS: `--max-old-space-size=${options.memoryLimitMb}`,
      NODE_NO_WARNINGS: "1",
    };

    // 网络策略
    if (options.network === "deny") {
      env.NODE_TLS_REJECT_UNAUTHORIZED = "1";
    }

    return env;
  }

  /**
   * 准备进程参数
   */
  private prepareProcessArgs(args: Record<string, unknown>): string[] {
    return [JSON.stringify(args)];
  }

  /**
   * 获取执行命令
   */
  private getExecuteCommand(scriptPath: string): string {
    const ext = path.extname(scriptPath);

    switch (ext) {
      case ".js":
      case ".mjs":
      case ".cjs":
        return "node";
      case ".ts":
        return "ts-node";
      case ".py":
        return "python3";
      case ".sh":
        return "bash";
      default:
        return "node";
    }
  }

  /**
   * 检测脚本语言
   */
  private detectLanguage(ext: string): string[] {
    const languageMap: Record<string, string[]> = {
      ".js": ["javascript"],
      ".mjs": ["javascript"],
      ".cjs": ["javascript"],
      ".ts": ["typescript"],
      ".py": ["python"],
      ".sh": ["bash", "shell"],
    };

    return languageMap[ext] || [];
  }

  /**
   * 解析脚本能力
   */
  private parseCapabilities(content: string): ScriptCapabilities {
    return {
      languages: [],
      hasNetworkAccess: content.includes("fetch") || content.includes("axios"),
      hasFileSystemAccess: true,
      maxExecutionTimeMs: DEFAULT_OPTIONS.timeoutMs,
      maxMemoryMb: DEFAULT_OPTIONS.memoryLimitMb,
    };
  }

  /**
   * 创建隔离工作区
   */
  private async createWorkspace(): Promise<string> {
    const workspaceId = `skill_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const workspacePath = path.join(this.workspacePath, workspaceId);

    await fs.mkdir(workspacePath, { recursive: true });
    await fs.chmod(workspacePath, 0o700);

    return workspacePath;
  }

  /**
   * 清理工作区
   */
  private async cleanupWorkspace(workspacePath: string): Promise<void> {
    try {
      await fs.rm(workspacePath, { recursive: true, force: true });
    } catch (error) {
      logger.warn(`Failed to cleanup workspace: ${workspacePath}`, error);
    }
  }

  /**
   * 终止进程
   */
  private terminateProcess(process: ChildProcess, signal: string = "SIGTERM"): void {
    if (!process.killed && process.pid) {
      try {
        process.kill(signal as NodeJS.Signals);
      } catch (error) {
        logger.warn("Failed to terminate process:", error);
      }
    }
  }

  /**
   * 终止所有活跃进程
   */
  async terminateAllProcesses(): Promise<void> {
    for (const process of this.activeProcesses.values()) {
      this.terminateProcess(process, "SIGKILL");
    }
    this.activeProcesses.clear();
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    await this.terminateAllProcesses();

    try {
      await fs.rm(this.workspacePath, { recursive: true, force: true });
    } catch (error) {
      logger.warn("Failed to cleanup workspace directory:", error);
    }
  }
}

/**
 * 默认执行器实例
 */
let defaultExecutor: ScriptExecutor | null = null;

export function getScriptExecutor(workspacePath?: string): ScriptExecutor {
  if (!defaultExecutor) {
    defaultExecutor = new ScriptExecutor(workspacePath);
  }
  return defaultExecutor;
}
