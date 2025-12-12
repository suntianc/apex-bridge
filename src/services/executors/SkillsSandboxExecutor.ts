/**
 * SkillsSandboxExecutor - Skills沙箱执行器
 * 在隔离的Node.js子进程中执行Skills，提供进程级安全沙箱
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { BaseToolExecutor } from './ToolExecutor';
import {
  ToolExecuteOptions,
  ToolResult,
  SandboxExecutionOptions,
  SandboxExecutionResult,
  SkillTool,
  ToolError,
  ToolErrorCode
} from '../../types/tool-system';
import { logger } from '../../utils/logger';
import { getSkillManager } from '../SkillManager';

/**
 * 执行统计记录
 */
interface ExecutionStats {
  callCount: number;
  successCount: number;
  totalDuration: number;
  errors: Array<{
    timestamp: number;
    error: string;
    toolName: string;
  }>;
}

/**
 * Skills沙箱执行器
 * 提供进程级隔离和资源限制的沙箱环境
 */
export class SkillsSandboxExecutor extends BaseToolExecutor {
  private stats: Map<string, ExecutionStats> = new Map();
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private executionOptions: SandboxExecutionOptions;

  constructor(options: SandboxExecutionOptions = {}) {
    super();
    this.executionOptions = {
      timeout: 60000,
      maxOutputSize: 10 * 1024 * 1024, // 10MB
      memoryLimit: 512, // 512MB
      maxConcurrency: 3,
      allowedEnvVars: ['PATH'],
      workspacePath: path.join(os.tmpdir(), 'skill-workspaces'),
      ...options
    };

    // 确保工作区目录存在
    this.ensureWorkspaceDirectory();

    logger.info('SkillsSandboxExecutor initialized', {
      timeout: this.executionOptions.timeout,
      maxOutputSize: this.executionOptions.maxOutputSize,
      memoryLimit: this.executionOptions.memoryLimit,
      maxConcurrency: this.executionOptions.maxConcurrency
    });
  }

  /**
   * 确保工作区目录存在
   */
  private async ensureWorkspaceDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.executionOptions.workspacePath!, { recursive: true });
      logger.debug(`Workspace directory created: ${this.executionOptions.workspacePath}`);
    } catch (error) {
      logger.error('Failed to create workspace directory:', error);
      throw new Error(`Failed to create workspace directory: ${this.executionOptions.workspacePath}`);
    }
  }

  /**
   * 执行Skills
   * @param options 执行选项
   * @returns 执行结果
   */
  async execute(options: ToolExecuteOptions): Promise<ToolResult> {
    const startTime = Date.now();
    const toolName = options.name;

    try {
      // 验证执行选项
      this.validateExecuteOptions(options);

      logger.info(`Executing Skills: ${toolName}`);
      logger.debug(`Skills arguments:`, options.args);

      // 检查Skills是否存在
      const skillPath = await this.getSkillPath(toolName);
      const executeScript = path.join(skillPath, 'scripts', 'execute.js');

      if (!(await this.fileExists(executeScript))) {
        throw new ToolError(
          `Skills not found: ${toolName}`,
          ToolErrorCode.SKILL_NOT_FOUND
        );
      }

      // 创建隔离工作区
      const workspaceDir = await this.createIsolatedWorkspace(toolName);
      logger.debug(`Created isolated workspace: ${workspaceDir}`);

      // 准备执行参数
      const execArgs = {
        toolName,
        args: options.args,
        workspace: workspaceDir,
        skillPath
      };

      // 执行Skills
      const result = await this.executeInSandbox(execArgs);

      // 记录统计
      this.recordStats(toolName, true, result.duration);

      // 清理工作区（可选，可以保留用于调试）
      if (!options.args?.preserveWorkspace) {
        await this.cleanupWorkspace(workspaceDir);
      }

      logger.info(`Skills ${toolName} completed successfully in ${result.duration}ms`);

      return {
        success: true,
        output: result.stdout,
        stderr: result.stderr,
        duration: result.duration,
        exitCode: result.exitCode
      };

    } catch (error) {
      const duration = this.calculateDuration(startTime);

      // 记录统计
      this.recordStats(toolName, false, duration, error);

      if (error instanceof ToolError) {
        logger.error(`Skills ${toolName} failed: ${error.message}`);
        return this.createErrorResult(error.message, duration, error.code);
      }

      logger.error(`Skills ${toolName} failed with unexpected error:`, error);
      return this.createErrorResult(
        `Skills execution failed: ${this.formatError(error)}`,
        duration,
        ToolErrorCode.TOOL_EXECUTION_FAILED
      );
    }
  }

  /**
   * 在沙箱中执行Skills
   */
  private async executeInSandbox(execArgs: {
    toolName: string;
    args: Record<string, any>;
    workspace: string;
    skillPath: string;
  }): Promise<SandboxExecutionResult> {
    const {
      toolName,
      args,
      workspace,
      skillPath
    } = execArgs;

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      // 准备进程参数
      const processArgs = this.prepareProcessArgs(args);

      // 设置环境变量（清理后的）
      const env = this.prepareCleanEnvironment();

      // 设置进程选项
      const spawnOptions = this.prepareSpawnOptions(workspace, env);

      // 启动子进程
      const executeScript = path.join(skillPath, 'scripts', 'execute.js');
      const process = spawn(
        'node',
        [executeScript, ...processArgs],
        spawnOptions
      );

      // 记录活跃进程
      const processId = crypto.randomUUID();
      this.activeProcesses.set(processId, process);

      // 设置输出收集
      let stdout = '';
      let stderr = '';
      let outputSize = 0;
      let truncated = false;
      const maxOutputSize = this.executionOptions.maxOutputSize!;

      process.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();

        // 检查输出大小限制
        outputSize += Buffer.byteLength(chunk);

        if (outputSize > maxOutputSize && !truncated) {
          truncated = true;
          stdout += '\n[TRUNCATED: Output exceeded size limit]';
          logger.warn(`Skills ${toolName} output exceeded size limit (${maxOutputSize} bytes)`);

          // 终止进程
          this.terminateProcess(process, 'SIGKILL');
        } else if (!truncated) {
          stdout += chunk;
        }
      });

      process.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();

        if (!truncated) {
          stderr += chunk;
        }
      });

      // 设置超时
      const timeout = setTimeout(() => {
        logger.warn(`Skills ${toolName} execution timed out after ${this.executionOptions.timeout}ms`);
        this.terminateProcess(process, 'SIGKILL');

        const duration = this.calculateDuration(startTime);
        resolve({
          success: false,
          stdout,
          stderr: stderr || 'Execution timed out',
          exitCode: -1,
          duration,
          error: `Execution timed out after ${this.executionOptions.timeout}ms`,
          truncated
        });
      }, this.executionOptions.timeout);

      // 处理进程退出
      process.on('close', (code: number | null, signal: string | null) => {
        // 清理活跃进程记录
        this.activeProcesses.delete(processId);
        clearTimeout(timeout);

        const duration = this.calculateDuration(startTime);

        // 检查是否有错误
        if (code !== 0 || signal) {
          logger.warn(`Skills ${toolName} exited with code ${code}, signal ${signal}`);
          if (stderr && stderr.trim()) {
            logger.warn(`Skills ${toolName} stderr output:\n${stderr}`);
          }
        }

        const finalExitCode = code ?? (signal ? -1 : 0);

        resolve({
          success: code === 0 && !signal,
          stdout,
          stderr,
          exitCode: finalExitCode,
          duration,
          error: code !== 0 ? `Process exited with code ${code}` : undefined,
          truncated
        });
      });

      // 处理进程错误
      process.on('error', (error: Error) => {
        // 清理活跃进程记录
        this.activeProcesses.delete(processId);
        clearTimeout(timeout);

        logger.error(`Skills ${toolName} process error:`, error);
        reject(error);
      });
    });
  }

  /**
   * 准备进程参数
   */
  private prepareProcessArgs(args: Record<string, any>): string[] {
    // 将参数序列化为JSON字符串
    return [JSON.stringify(args)];
  }

  /**
   * 准备干净的环境变量
   */
  private prepareCleanEnvironment(): NodeJS.ProcessEnv {
    const allowedVars = this.executionOptions.allowedEnvVars!;
    const env: NodeJS.ProcessEnv = {};

    // 只允许指定的环境变量
    allowedVars.forEach(varName => {
      const value = process.env[varName];
      if (value !== undefined) {
        env[varName] = value;
      }
    });

    // 设置Node.js内存限制
    env.NODE_OPTIONS = `--max-old-space-size=${this.executionOptions.memoryLimit}`;

    // 设置其他安全选项
    env.NODE_NO_WARNINGS = '1';

    return env;
  }

  /**
   * 准备spawn选项
   */
  private prepareSpawnOptions(
    cwd: string,
    env: NodeJS.ProcessEnv
  ): any {
    // 注意：不设置 cwd，使用脚本的绝对路径
    // workspace 只用于技能执行时的临时文件操作
    return {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false, // 不使用shell，防止注入
      detached: false
    };
  }

  /**
   * 创建隔离工作区
   */
  private async createIsolatedWorkspace(toolName: string): Promise<string> {
    const workspaceId = `${toolName}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const workspacePath = path.join(this.executionOptions.workspacePath!, workspaceId);

    try {
      await fs.mkdir(workspacePath, { recursive: true });

      // 设置只有所有者可以访问（安全最佳实践）
      await fs.chmod(workspacePath, 0o700);

      return workspacePath;
    } catch (error) {
      throw new ToolError(
        `Failed to create workspace: ${this.formatError(error)}`,
        ToolErrorCode.TOOL_EXECUTION_FAILED
      );
    }
  }

  /**
   * 清理工作区
   */
  private async cleanupWorkspace(workspacePath: string): Promise<void> {
    try {
      // 递归删除工作区目录
      await fs.rm(workspacePath, { recursive: true, force: true });
      logger.debug(`Cleaned up workspace: ${workspacePath}`);
    } catch (error) {
      logger.warn(`Failed to cleanup workspace ${workspacePath}:`, error);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 终止进程
   */
  private terminateProcess(process: ChildProcess, signal: string = 'SIGTERM'): void {
    if (!process.killed && process.pid) {
      try {
        process.kill(signal as any);
        logger.debug(`Sent ${signal} signal to process ${process.pid}`);
      } catch (error) {
        logger.warn(`Failed to terminate process ${process.pid}:`, error);
      }
    }
  }

  /**
   * 获取Skills路径
   * 通过SkillManager查询Skill的实际路径，支持name与目录名不一致的情况
   */
  private async getSkillPath(skillName: string): Promise<string> {
    try {
      // 尝试通过SkillManager查询Skill
      const skillManager = getSkillManager();
      const skill = await skillManager.getSkillByName(skillName);

      if (skill && skill.path) {
        return skill.path;
      }

      // 如果找不到，尝试使用目录名直接拼接（兼容旧逻辑）
      const basePath = './.data/skills';
      return path.join(basePath, skillName);
    } catch (error) {
      // 如果查询失败，回退到直接拼接
      logger.debug(`Failed to query skill path from SkillManager: ${error}`);
      const basePath = './.data/skills';
      return path.join(basePath, skillName);
    }
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 记录统计
   */
  private recordStats(
    toolName: string,
    success: boolean,
    duration: number,
    error?: any
  ): void {
    if (!this.stats.has(toolName)) {
      this.stats.set(toolName, {
        callCount: 0,
        successCount: 0,
        totalDuration: 0,
        errors: []
      });
    }

    const stats = this.stats.get(toolName)!;
    stats.callCount++;
    stats.totalDuration += duration;

    if (success) {
      stats.successCount++;
    } else {
      stats.errors.push({
        timestamp: Date.now(),
        error: this.formatError(error),
        toolName
      });
    }
  }

  /**
   * 获取支持的工具列表（Skills）
   */
  listTools(): SkillTool[] {
    // Skills是动态加载的，这里返回空列表
    // 实际Skills由SkillManager管理
    return [];
  }

  /**
   * 获取执行统计
   */
  getStats(toolName?: string): Record<string, ExecutionStats> | ExecutionStats | null {
    if (toolName) {
      return this.stats.get(toolName) || null;
    }

    const allStats: Record<string, ExecutionStats> = {};
    for (const [name, stats] of this.stats) {
      allStats[name] = stats;
    }
    return allStats;
  }

  /**
   * 获取所有活跃进程
   */
  getActiveProcesses(): Array<{ pid: number; toolName: string }> {
    const processes: Array<{ pid: number; toolName: string }> = [];

    for (const process of this.activeProcesses.values()) {
      if (process.pid) {
        // 从工作区路径中提取工具名称
        const cwd = (process as any).spawnfile || '';
        const match = cwd.match(/\/data\/skills\/([^\/]+)/);
        const toolName = match ? match[1] : 'unknown';

        processes.push({
          pid: process.pid,
          toolName
        });
      }
    }

    return processes;
  }

  /**
   * 终止所有活跃进程
   */
  async terminateAllProcesses(): Promise<void> {
    const terminationPromises: Promise<void>[] = [];

    for (const process of this.activeProcesses.values()) {
      if (process.pid && !process.killed) {
        terminationPromises.push(
          new Promise(resolve => {
            process.once('exit', () => resolve());
            try {
              process.kill('SIGKILL');
            } catch {
              resolve();
            }
          })
        );
      }
    }

    await Promise.all(terminationPromises);
    this.activeProcesses.clear();

    logger.info('Terminated all active Skills processes');
  }

  /**
   * 清理资源（优雅关闭）
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up SkillsSandboxExecutor...');

    // 终止所有进程
    await this.terminateAllProcesses();

    // 清理工作区
    try {
      await fs.rm(this.executionOptions.workspacePath!, { recursive: true, force: true });
      logger.debug('Cleaned up workspace directory');
    } catch (error) {
      logger.warn('Failed to cleanup workspace directory:', error);
    }

    logger.info('SkillsSandboxExecutor cleanup completed');
  }

  /**
   * 格式化错误信息
   */
  protected formatError(error: any): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error occurred in Skills sandbox';
  }
}

/**
 * Skills沙箱执行器工厂
 */
export class SkillsSandboxExecutorFactory {
  private static instance: SkillsSandboxExecutor | null = null;

  /**
   * 获取沙箱执行器实例
   */
  static getInstance(options?: SandboxExecutionOptions): SkillsSandboxExecutor {
    if (!this.instance) {
      this.instance = new SkillsSandboxExecutor(options);
    }
    return this.instance;
  }

  /**
   * 重置实例（用于测试）
   */
  static resetInstance(): void {
    this.instance = null;
  }

  /**
   * 清理所有资源（全局清理）
   */
  static async cleanupAll(): Promise<void> {
    if (this.instance) {
      await this.instance.cleanup();
      this.instance = null;
    }
  }
}

/**
 * 获取默认的Skills沙箱执行器
 */
export function getSkillsSandboxExecutor(options?: SandboxExecutionOptions): SkillsSandboxExecutor {
  return SkillsSandboxExecutorFactory.getInstance(options);
}