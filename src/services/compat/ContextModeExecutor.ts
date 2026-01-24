/**
 * ContextModeExecutor - Context 模式执行器
 * 支持 fork 和 inline 两种上下文隔离模式执行技能
 */

import * as fsSync from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { spawn, ChildProcess } from "child_process";
import {
  ContextMode,
  ContextModeConfig,
  SkillExecutionContext,
  ExecutionOptions,
  ExecutionResult,
} from "./types";
import { logger } from "../../utils/logger";

/**
 * 内部使用的执行结果类型（不含 mode）
 */
interface InternalExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
  durationMs: number;
  metadata?: Record<string, unknown>;
  stdout?: string;
  stderr?: string;
}

/**
 * 默认执行配置
 */
const DEFAULT_CONFIG: Required<ContextModeConfig> = {
  mode: "inline",
  workspacePath: path.join(os.tmpdir(), "skill-context"),
  isolated: false,
  maxMemory: 512,
  timeout: 60000,
};

/**
 * Cleanup retry configuration
 */
const CLEANUP_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 1000,
  backoffMultiplier: 2,
};

/**
 * 最大输出大小 (10MB)
 */
const MAX_OUTPUT_SIZE = 10 * 1024 * 1024;

/**
 * Context 模式执行器
 */
export class ContextModeExecutor {
  private readonly workspacePath: string;
  private readonly activeProcesses: Map<string, ChildProcess>;

  constructor(workspacePath?: string) {
    this.workspacePath = workspacePath || DEFAULT_CONFIG.workspacePath;
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
   * 根据 context 模式执行技能
   */
  async execute(
    skillPath: string,
    mode: ContextMode,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    switch (mode) {
      case "fork":
        return this.executeInForkedContext(skillPath, options, startTime);
      case "inline":
        return this.executeInInlineContext(skillPath, options, startTime);
      default:
        return {
          success: false,
          output: "",
          error: `Unknown context mode: ${mode}`,
          durationMs: Date.now() - startTime,
          mode: mode as ContextMode,
        };
    }
  }

  /**
   * Fork 模式：在独立进程中执行，完全隔离
   */
  private async executeInForkedContext(
    skillPath: string,
    options: ExecutionOptions,
    startTime: number
  ): Promise<ExecutionResult> {
    let workspaceDir: string | null = null;

    try {
      // 1. 创建独立工作区
      workspaceDir = await this.createIsolatedWorkspace(skillPath);

      // 2. 复制技能文件到工作区
      await this.copySkillFiles(skillPath, workspaceDir);

      // 3. 在子进程中执行
      const result = await this.spawnInChildProcess(workspaceDir, options, startTime);

      // 4. 清理工作区
      await this.cleanupWorkspace(workspaceDir);

      return {
        ...result,
        mode: "fork",
      };
    } catch (error) {
      // 清理工作区（如果创建了工作区）
      if (workspaceDir) {
        try {
          await this.cleanupWorkspace(workspaceDir);
        } catch (cleanupError) {
          // 清理失败时，记录原始错误和清理错误
          const cleanupErrorMessage =
            cleanupError instanceof Error ? cleanupError.message : "Unknown cleanup error";
          logger.error(
            `[ContextModeExecutor] Cleanup failed after execution error: ${cleanupErrorMessage}`
          );
          // 仍然抛出原始执行错误
        }
      }

      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Fork mode execution failed:", error);

      return {
        success: false,
        output: "",
        error: errorMessage,
        durationMs: Date.now() - startTime,
        mode: "fork",
      };
    }
  }

  /**
   * Inline 模式：在当前进程中执行，共享上下文
   */
  private async executeInInlineContext(
    skillPath: string,
    options: ExecutionOptions,
    startTime: number
  ): Promise<ExecutionResult> {
    try {
      // 1. 加载技能到当前上下文
      const context = await this.loadSkillContext(skillPath, options);

      // 2. 执行技能逻辑（使用当前的进程上下文）
      const result = await this.executeInCurrentProcess(context, options, startTime);

      return {
        ...result,
        mode: "inline",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Inline mode execution failed:", error);

      return {
        success: false,
        output: "",
        error: errorMessage,
        durationMs: Date.now() - startTime,
        mode: "inline",
      };
    }
  }

  /**
   * 创建隔离工作区
   */
  private async createIsolatedWorkspace(skillPath: string): Promise<string> {
    const workspaceId = `skill_fork_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const workspaceDir = path.join(this.workspacePath, "fork", workspaceId);

    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.chmod(workspaceDir, 0o700);

    logger.debug(`Created isolated workspace: ${workspaceDir}`);

    return workspaceDir;
  }

  /**
   * 复制技能文件到工作区
   */
  private async copySkillFiles(skillPath: string, workspaceDir: string): Promise<void> {
    try {
      const entries = await fs.readdir(skillPath, { withFileTypes: true });

      for (const entry of entries) {
        const srcPath = path.join(skillPath, entry.name);
        const destPath = path.join(workspaceDir, entry.name);

        if (entry.isDirectory()) {
          await fs.cp(srcPath, destPath, { recursive: true });
        } else {
          await fs.cp(srcPath, destPath);
        }
      }

      logger.debug(`Copied skill files to workspace: ${workspaceDir}`);
    } catch (error) {
      throw new Error(`Failed to copy skill files: ${error}`);
    }
  }

  /**
   * 在子进程中执行
   */
  private async spawnInChildProcess(
    workspaceDir: string,
    options: ExecutionOptions,
    startTime: number
  ): Promise<InternalExecutionResult> {
    return new Promise((resolve) => {
      // 查找主脚本文件
      const scriptPath = this.findMainScript(workspaceDir);

      if (!scriptPath) {
        resolve({
          success: false,
          output: "",
          error: "No executable script found in skill directory",
          durationMs: Date.now() - startTime,
        });
        return;
      }

      const timeout = options.timeout || DEFAULT_CONFIG.timeout;
      const memoryLimit = options.memoryLimit || DEFAULT_CONFIG.maxMemory;

      // 准备环境变量
      const env = this.prepareEnvironment(options.env, memoryLimit);

      // 设置 spawn 选项
      const spawnOptions = {
        env,
        cwd: workspaceDir,
        stdio: ["pipe", "pipe", "pipe"] as ("pipe" | "ipc" | "ignore" | "inherit")[],
        shell: false,
        detached: false,
      };

      // 确定执行命令
      const command = this.getExecuteCommand(scriptPath);
      const processArgs = this.getProcessArgs(options);

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

          if (outputSize > MAX_OUTPUT_SIZE && !truncated) {
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

      // 设置超时
      const timeoutHandle = setTimeout(() => {
        logger.warn(`Script execution timed out after ${timeout}ms`);
        this.terminateProcess(process);
        this.activeProcesses.delete(processId);

        resolve({
          success: false,
          output: stdout,
          stderr: stderr || "Execution timed out",
          exitCode: -1,
          error: `Execution timed out after ${timeout}ms`,
          durationMs: Date.now() - startTime,
          metadata: { truncated },
        });
      }, timeout);

      // 处理进程退出
      process.on("close", (code: number | null, signal: string | null) => {
        clearTimeout(timeoutHandle);
        this.activeProcesses.delete(processId);

        if (code !== 0 && signal) {
          logger.warn(`Process exited with signal: ${signal}`);
        }

        resolve({
          success: code === 0 && !signal,
          output: stdout,
          stderr,
          exitCode: code ?? (signal ? -1 : 0),
          error: code !== 0 ? stderr.trim() || `Process exited with code ${code}` : undefined,
          durationMs: Date.now() - startTime,
          metadata: { truncated },
        });
      });

      // 处理进程错误
      process.on("error", (error: Error) => {
        clearTimeout(timeoutHandle);
        this.activeProcesses.delete(processId);

        logger.error("Process error:", error);

        resolve({
          success: false,
          output: stdout,
          stderr,
          error: error.message,
          durationMs: Date.now() - startTime,
          metadata: { truncated },
        });
      });
    });
  }

  /**
   * 加载技能上下文
   */
  private async loadSkillContext(
    skillPath: string,
    options: ExecutionOptions
  ): Promise<SkillExecutionContext> {
    const skillName = path.basename(skillPath);

    // 读取技能目录内容
    const files: string[] = [];
    try {
      const entries = await fs.readdir(skillPath, { withFileTypes: true });
      for (const entry of entries) {
        files.push(entry.name);
      }
    } catch (error) {
      logger.warn(`[ContextModeExecutor] Failed to read skill directory: ${skillPath}`, error);
    }

    return {
      skillName,
      skillPath,
      mode: "inline",
      workspace: skillPath,
      env: options.env || {},
      files: options.files || files,
      metadata: {} as never,
    };
  }

  /**
   * 在当前进程中执行
   */
  private async executeInCurrentProcess(
    context: SkillExecutionContext,
    options: ExecutionOptions,
    startTime: number
  ): Promise<InternalExecutionResult> {
    // Inline 模式下，直接返回成功，因为技能逻辑由调用者处理
    // 这里只是标记执行模式，不实际执行脚本
    return {
      success: true,
      output: `Inline execution for skill: ${context.skillName}`,
      durationMs: Date.now() - startTime,
      metadata: {
        files: context.files,
        workspace: context.workspace,
      },
    };
  }

  /**
   * 查找主脚本文件
   */
  private findMainScript(workspaceDir: string): string | null {
    const priorityFiles = ["index.js", "index.mjs", "index.cjs", "index.ts", "run.js", "run.sh"];

    for (const file of priorityFiles) {
      const filePath = path.join(workspaceDir, file);
      if (this.fileExistsSync(filePath)) {
        return filePath;
      }
    }

    // 查找任意可执行文件
    return null;
  }

  /**
   * 同步检查文件是否存在
   */
  private fileExistsSync(filePath: string): boolean {
    try {
      fsSync.accessSync(filePath);
      return true;
    } catch (error) {
      logger.debug(`[ContextModeExecutor] File does not exist (sync): ${filePath}`);
      return false;
    }
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
   * 获取进程参数
   */
  private getProcessArgs(options: ExecutionOptions): string[] {
    const args: Record<string, unknown> = {
      ...options.metadata,
    };

    return [JSON.stringify(args)];
  }

  /**
   * 准备环境变量
   */
  private prepareEnvironment(
    customEnv: Record<string, string> | undefined,
    memoryLimit: number
  ): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...customEnv,
      NODE_OPTIONS: `--max-old-space-size=${memoryLimit}`,
      NODE_NO_WARNINGS: "1",
    };

    return env;
  }

  /**
   * 清理工作区（带重试机制）
   */
  private async cleanupWorkspace(workspacePath: string): Promise<void> {
    let lastError: Error | undefined;
    let delay = CLEANUP_RETRY_CONFIG.initialDelayMs;

    for (let attempt = 1; attempt <= CLEANUP_RETRY_CONFIG.maxRetries; attempt++) {
      try {
        await fs.rm(workspacePath, { recursive: true, force: true });
        logger.debug(`Cleaned up workspace: ${workspacePath}`);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < CLEANUP_RETRY_CONFIG.maxRetries) {
          logger.warn(
            `[ContextModeExecutor] Cleanup attempt ${attempt} failed for ${workspacePath}, retrying in ${delay}ms`,
            lastError
          );
          await this.sleep(delay);
          delay = Math.min(
            delay * CLEANUP_RETRY_CONFIG.backoffMultiplier,
            CLEANUP_RETRY_CONFIG.maxDelayMs
          );
        }
      }
    }

    // All retries exhausted
    logger.error(
      `[ContextModeExecutor] Failed to cleanup workspace after ${CLEANUP_RETRY_CONFIG.maxRetries} attempts: ${workspacePath}`,
      lastError
    );
    throw lastError;
  }

  /**
   * 睡眠辅助函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
let defaultExecutor: ContextModeExecutor | null = null;

export function getContextModeExecutor(workspacePath?: string): ContextModeExecutor {
  if (!defaultExecutor) {
    defaultExecutor = new ContextModeExecutor(workspacePath);
  }
  return defaultExecutor;
}
