/**
 * Tool State - ToolState 状态机定义
 */

import type {
  FilePart,
  ToolState,
  ToolStatePending,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,
} from "./message-v2";

// ==================== Tool State 类型守卫 ====================

export function isToolStatePending(state: ToolState): state is ToolStatePending {
  return state.status === "pending";
}

export function isToolStateRunning(state: ToolState): state is ToolStateRunning {
  return state.status === "running";
}

export function isToolStateCompleted(state: ToolState): state is ToolStateCompleted {
  return state.status === "completed";
}

export function isToolStateError(state: ToolState): state is ToolStateError {
  return state.status === "error";
}

// ==================== Tool State 工厂函数 ====================

export interface CreateToolStatePendingOptions {
  input: Record<string, unknown>;
  raw: string;
}

export function createToolStatePending(options: CreateToolStatePendingOptions): ToolStatePending {
  return {
    status: "pending",
    input: options.input,
    raw: options.raw,
  };
}

export interface CreateToolStateRunningOptions {
  input: Record<string, unknown>;
  title?: string;
  metadata?: Record<string, unknown>;
  startTime?: number;
}

export function createToolStateRunning(options: CreateToolStateRunningOptions): ToolStateRunning {
  return {
    status: "running",
    input: options.input,
    title: options.title,
    metadata: options.metadata,
    time: { start: options.startTime || Date.now() },
  };
}

export interface CreateToolStateCompletedOptions {
  input: Record<string, unknown>;
  output: string;
  title: string;
  metadata?: Record<string, unknown>;
  attachments?: FilePart[];
  startTime?: number;
  endTime?: number;
}

export function createToolStateCompleted(
  options: CreateToolStateCompletedOptions
): ToolStateCompleted {
  const startTime = options.startTime || Date.now();
  return {
    status: "completed",
    input: options.input,
    output: options.output,
    title: options.title,
    metadata: options.metadata || {},
    time: {
      start: startTime,
      end: options.endTime || Date.now(),
    },
    attachments: options.attachments,
  };
}

export interface CreateToolStateErrorOptions {
  input: Record<string, unknown>;
  error: string;
  metadata?: Record<string, unknown>;
  startTime?: number;
  endTime?: number;
}

export function createToolStateError(options: CreateToolStateErrorOptions): ToolStateError {
  const startTime = options.startTime || Date.now();
  return {
    status: "error",
    input: options.input,
    error: options.error,
    metadata: options.metadata,
    time: {
      start: startTime,
      end: options.endTime || Date.now(),
    },
  };
}

// ==================== Tool State 转换函数 ====================

export function pendingToRunning(pending: ToolStatePending, title?: string): ToolStateRunning {
  return {
    status: "running",
    input: pending.input,
    title,
    time: { start: Date.now() },
  };
}

export function runningToCompleted(
  running: ToolStateRunning,
  output: string,
  title: string,
  attachments?: FilePart[]
): ToolStateCompleted {
  return {
    status: "completed",
    input: running.input,
    output,
    title,
    metadata: running.metadata || {},
    time: {
      start: running.time.start,
      end: Date.now(),
    },
    attachments,
  };
}

export function runningToError(
  running: ToolStateRunning,
  error: string,
  metadata?: Record<string, unknown>
): ToolStateError {
  return {
    status: "error",
    input: running.input,
    error,
    metadata: metadata || running.metadata,
    time: {
      start: running.time.start,
      end: Date.now(),
    },
  };
}

// ==================== Tool State 工具函数 ====================

/**
 * 检查 Tool 是否已完成（成功或失败）
 */
export function isToolCompleted(state: ToolState): boolean {
  return state.status === "completed" || state.status === "error";
}

/**
 * 获取 Tool 执行的持续时间（毫秒）
 */
export function getToolDuration(state: ToolState): number | null {
  if (state.status === "pending" || state.status === "running") return null;
  return state.time.end - state.time.start;
}

/**
 * 标记 Tool 为已完成（压缩状态）
 */
export function compactToolState(completed: ToolStateCompleted): ToolStateCompleted {
  return {
    ...completed,
    time: {
      ...completed.time,
      compacted: Date.now(),
    },
    output: "[Old tool result content cleared]",
  };
}
