/**
 * ProcessPool - 进程池管理器
 * 实现子进程复用，减少进程创建开销
 */

import { spawn, ChildProcess } from "child_process";
import * as crypto from "crypto";
import { logger } from "../../utils/logger";
import { SandboxExecutionResult } from "../../types/tool-system";
import { PROCESS_POOL } from "../../constants";

export interface ProcessPoolConfig {
  minSize: number;
  maxSize: number;
  processTTL: number;
  idleTimeout: number;
  healthCheckInterval: number;
  maxConcurrent: number;
}

export interface PooledProcess {
  id: string;
  process: ChildProcess;
  skillPath: string;
  executeScript: string;
  state: "idle" | "busy" | "terminating";
  createdAt: number;
  lastAccess: number;
  executionCount: number;
}

export interface ExecutionTask {
  taskId: string;
  skillPath: string;
  executeScript: string;
  args: Record<string, any>;
  env: NodeJS.ProcessEnv;
  timeout: number;
  maxOutputSize: number;
  resolve: (result: SandboxExecutionResult) => void;
  reject: (error: Error) => void;
}

export interface ProcessPoolMetrics {
  poolSize: number;
  idleCount: number;
  busyCount: number;
  terminatingCount: number;
  totalExecuted: number;
  totalFailed: number;
  averageWaitTime: number;
  hitRate: number;
  totalWaitTime: number;
  totalTasks: number;
}

interface WaitingTask {
  task: ExecutionTask;
  timestamp: number;
}

export class ProcessPool {
  private config: ProcessPoolConfig;
  private processes: Map<string, PooledProcess> = new Map();
  private idleProcesses: Map<string, PooledProcess> = new Map();
  private taskQueue: WaitingTask[] = [];
  private activeCount: number = 0;
  private metrics: ProcessPoolMetrics = {
    poolSize: 0,
    idleCount: 0,
    busyCount: 0,
    terminatingCount: 0,
    totalExecuted: 0,
    totalFailed: 0,
    averageWaitTime: 0,
    hitRate: 0,
    totalWaitTime: 0,
    totalTasks: 0,
  };
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<ProcessPoolConfig> = {}) {
    this.config = {
      minSize: config.minSize ?? PROCESS_POOL.DEFAULT_MIN_SIZE,
      maxSize: config.maxSize ?? PROCESS_POOL.DEFAULT_MAX_SIZE,
      processTTL: config.processTTL ?? PROCESS_POOL.DEFAULT_TTL,
      idleTimeout: config.idleTimeout ?? PROCESS_POOL.DEFAULT_IDLE_TIMEOUT,
      healthCheckInterval: config.healthCheckInterval ?? PROCESS_POOL.DEFAULT_HEALTH_CHECK,
      maxConcurrent: config.maxConcurrent ?? 3,
    };

    this.startHealthCheck();
    this.startCleanup();

    logger.info("ProcessPool initialized", {
      minSize: this.config.minSize,
      maxSize: this.config.maxSize,
      processTTL: this.config.processTTL,
      idleTimeout: this.config.idleTimeout,
      maxConcurrent: this.config.maxConcurrent,
    });
  }

  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupIdleProcesses();
    }, this.config.idleTimeout);
  }

  private async performHealthCheck(): Promise<void> {
    for (const [id, proc] of this.processes) {
      if (proc.state === "idle") {
        const age = Date.now() - proc.createdAt;
        if (age > this.config.processTTL) {
          await this.terminateProcess(proc, "Process TTL exceeded");
          this.processes.delete(id);
          this.idleProcesses.delete(id);
        }
      }
    }
    this.updateMetrics();
  }

  private async cleanupIdleProcesses(): Promise<void> {
    const now = Date.now();

    for (const [id, proc] of this.idleProcesses) {
      if (proc.state === "idle") {
        const idleTime = now - proc.lastAccess;
        if (idleTime > this.config.idleTimeout) {
          await this.terminateProcess(proc, "Idle timeout");
          this.processes.delete(id);
          this.idleProcesses.delete(id);
        }
      }
    }

    while (this.processes.size > this.config.minSize && this.idleProcesses.size > 0) {
      const firstIdle = this.idleProcesses.values().next().value;
      if (firstIdle) {
        await this.terminateProcess(firstIdle, "Pool size reduction");
        this.processes.delete(firstIdle.id);
        this.idleProcesses.delete(firstIdle.id);
      }
    }

    this.updateMetrics();
  }

  private async terminateProcess(proc: PooledProcess, reason: string): Promise<void> {
    proc.state = "terminating";
    logger.debug(`Terminating process ${proc.id}`, { reason, pid: proc.process.pid });

    return new Promise((resolve) => {
      if (!proc.process.pid || proc.process.killed) {
        resolve();
        return;
      }

      proc.process.once("exit", () => {
        logger.debug(`Process ${proc.id} terminated`, { reason });
        resolve();
      });

      proc.process.once("error", () => {
        resolve();
      });

      try {
        proc.process.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.process.killed) {
            proc.process.kill("SIGKILL");
          }
          resolve();
        }, 5000);
      } catch {
        resolve();
      }
    });
  }

  async acquire(skillPath: string, executeScript: string): Promise<PooledProcess> {
    for (const [id, proc] of this.idleProcesses) {
      if (proc.skillPath === skillPath && proc.executeScript === executeScript) {
        proc.state = "busy";
        proc.lastAccess = Date.now();
        this.idleProcesses.delete(id);
        this.activeCount++;

        logger.debug(`Reused process ${id} from pool`, { skillPath, pid: proc.process.pid });
        this.updateMetrics();
        return proc;
      }
    }

    if (this.processes.size >= this.config.maxSize) {
      throw new Error("Process pool is at maximum capacity");
    }

    const proc = await this.createProcess(skillPath, executeScript);
    proc.state = "busy";
    proc.lastAccess = Date.now();
    this.activeCount++;

    this.processes.set(proc.id, proc);
    this.updateMetrics();

    logger.debug(`Created new process ${proc.id} in pool`, { skillPath, pid: proc.process.pid });
    return proc;
  }

  private async createProcess(skillPath: string, executeScript: string): Promise<PooledProcess> {
    return new Promise((resolve, reject) => {
      const proc = spawn("node", [executeScript], {
        env: {
          NODE_NO_WARNINGS: "1",
        },
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        detached: false,
      });

      if (!proc.pid) {
        reject(new Error("Failed to spawn process"));
        return;
      }

      const pooledProc: PooledProcess = {
        id: crypto.randomUUID(),
        process: proc,
        skillPath,
        executeScript,
        state: "idle",
        createdAt: Date.now(),
        lastAccess: Date.now(),
        executionCount: 0,
      };

      proc.on("error", (error) => {
        logger.error(`Process ${pooledProc.id} error:`, error);
        reject(error);
      });

      proc.on("exit", (code, signal) => {
        logger.debug(`Process ${pooledProc.id} exited`, { code, signal });
        this.processes.delete(pooledProc.id);
        this.idleProcesses.delete(pooledProc.id);
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.updateMetrics();
      });

      proc.stdout?.on("data", () => {});
      proc.stderr?.on("data", () => {});

      resolve(pooledProc);
    });
  }

  async release(proc: PooledProcess): Promise<void> {
    if (proc.state === "terminating") {
      return;
    }

    const now = Date.now();
    const age = now - proc.createdAt;
    const execCount = proc.executionCount;

    if (age > this.config.processTTL || execCount >= 100) {
      await this.terminateProcess(proc, "Process老化");
      this.processes.delete(proc.id);
    } else {
      proc.state = "idle";
      proc.lastAccess = now;
      this.idleProcesses.set(proc.id, proc);
      this.activeCount = Math.max(0, this.activeCount - 1);
    }

    this.processQueue();
    this.updateMetrics();
  }

  async execute(task: ExecutionTask): Promise<SandboxExecutionResult> {
    const startTime = Date.now();
    this.metrics.totalTasks++;

    let process: PooledProcess | null = null;

    try {
      process = await this.acquire(task.skillPath, task.executeScript);
      process.executionCount++;

      const result = await this.runTaskInProcess(process, task);

      this.metrics.totalExecuted++;
      const waitTime = Date.now() - startTime;
      this.metrics.totalWaitTime += waitTime;
      this.metrics.averageWaitTime = this.metrics.totalWaitTime / this.metrics.totalExecuted;
      this.metrics.hitRate = this.metrics.totalExecuted / this.metrics.totalTasks;

      return result;
    } catch (error) {
      this.metrics.totalFailed++;
      throw error;
    } finally {
      if (process) {
        await this.release(process);
      }
    }
  }

  private async runTaskInProcess(
    proc: PooledProcess,
    task: ExecutionTask
  ): Promise<SandboxExecutionResult> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        logger.warn(`Task ${task.taskId} timed out`);
        resolve({
          success: false,
          stdout: "",
          stderr: "Execution timed out",
          exitCode: -1,
          duration: Date.now() - startTime,
          error: `Execution timed out after ${task.timeout}ms`,
        });
      }, task.timeout);

      let stdout = "";
      let stderr = "";
      let outputSize = 0;
      let truncated = false;

      const dataHandler = (data: Buffer, stream: "stdout" | "stderr") => {
        const chunk = data.toString();
        outputSize += Buffer.byteLength(chunk);

        if (outputSize > task.maxOutputSize && !truncated) {
          truncated = true;
          stdout += "\n[TRUNCATED: Output exceeded size limit]";
          clearTimeout(timeout);
          resolve({
            success: false,
            stdout,
            stderr: stderr || "Output exceeded size limit",
            exitCode: -1,
            duration: Date.now() - startTime,
            error: `Output exceeded size limit (${task.maxOutputSize} bytes)`,
            truncated: true,
          });
        } else if (!truncated) {
          if (stream === "stdout") {
            stdout += chunk;
          } else {
            stderr += chunk;
          }
        }
      };

      proc.process.stdout?.on("data", (data: Buffer) => dataHandler(data, "stdout"));
      proc.process.stderr?.on("data", (data: Buffer) => dataHandler(data, "stderr"));

      proc.process.on("error", (error) => {
        clearTimeout(timeout);
        logger.error(`Task ${task.taskId} process error:`, error);
        reject(error);
      });

      proc.process.on("close", (code: number | null, signal: string | null) => {
        clearTimeout(timeout);
        this.activeCount = Math.max(0, this.activeCount - 1);

        const duration = Date.now() - startTime;
        const finalExitCode = code ?? (signal ? -1 : 0);

        resolve({
          success: code === 0 && !signal,
          stdout,
          stderr,
          exitCode: finalExitCode,
          duration,
          error: code !== 0 ? `Process exited with code ${code}` : undefined,
          truncated,
        });
      });

      try {
        const argsJson = JSON.stringify(task.args);
        proc.process.send?.({ type: "execute", args: argsJson });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  private processQueue(): void {
    while (this.taskQueue.length > 0 && this.activeCount < this.config.maxConcurrent) {
      const waiting = this.taskQueue.shift();
      if (waiting) {
        this.execute(waiting.task).catch(() => {});
      }
    }
  }

  private updateMetrics(): void {
    let idleCount = 0;
    let busyCount = 0;
    let terminatingCount = 0;

    for (const proc of this.processes.values()) {
      if (proc.state === "idle") idleCount++;
      else if (proc.state === "busy") busyCount++;
      else if (proc.state === "terminating") terminatingCount++;
    }

    this.metrics = {
      poolSize: this.processes.size,
      idleCount,
      busyCount,
      terminatingCount,
      totalExecuted: this.metrics.totalExecuted,
      totalFailed: this.metrics.totalFailed,
      averageWaitTime: this.metrics.averageWaitTime,
      hitRate: this.metrics.hitRate,
      totalWaitTime: this.metrics.totalWaitTime,
      totalTasks: this.metrics.totalTasks,
    };
  }

  getMetrics(): ProcessPoolMetrics {
    return { ...this.metrics };
  }

  async destroy(): Promise<void> {
    logger.info("Destroying ProcessPool...");

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    const terminationPromises: Promise<void>[] = [];

    for (const [, proc] of this.processes) {
      terminationPromises.push(this.terminateProcess(proc, "Pool destruction"));
    }

    await Promise.all(terminationPromises);

    this.processes.clear();
    this.idleProcesses.clear();
    this.taskQueue = [];
    this.activeCount = 0;

    logger.info("ProcessPool destroyed");
  }
}
