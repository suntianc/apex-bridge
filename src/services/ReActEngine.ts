/**
 * ReAct Engine - 已废弃（ABP-only）
 *
 * 深度思考功能已完全移除，此类仅用于保持兼容性
 */

import { logger } from '../utils/logger';

export interface Tool {
  name: string;
  description: string;
  parameters: { [key: string]: any };
  execute: (params: any) => Promise<any>;
}

export interface ReActOptions {
  systemPrompt?: string;
  additionalPrompts?: string[];
  maxIterations?: number;
  timeout?: number;
  enableStreamThoughts?: boolean;
}

export interface ReActResult {
  content: string;
  iterations: number;
  thinkingProcess: string[];
  finalAnswer?: string;
  usage?: any;
}

/**
 * ReActEngine - 已废弃
 *
 * 所有方法都返回错误，因为深度思考功能已被完全移除
 */
export class ReActEngine {
  private tools: Map<string, Tool> = new Map();

  constructor(tools: Tool[] = []) {
    logger.warn('[ReActEngine] ⚠️ ReActEngine is deprecated and all methods will throw errors');
    tools.forEach(tool => this.registerTool(tool));
  }

  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * 已废弃 - 抛出错误
   */
  async execute(
    userQuery: string,
    llmClient: any,
    options: ReActOptions = {}
  ): Promise<ReActResult> {
    logger.error('[ReActEngine] ❌ ReAct functionality has been completely removed');
    throw new Error('ReAct functionality has been completely removed. Use normal chat instead.');
  }

  /**
   * 已废弃 - 抛出错误
   */
  async *executeStream(
    userQuery: string,
    llmClient: any,
    options: ReActOptions = {},
    abortSignal?: AbortSignal
  ): AsyncIterableIterator<string> {
    logger.error('[ReActEngine] ❌ ReAct functionality has been completely removed');
    throw new Error('ReAct functionality has been completely removed. Use normal chat instead.');
  }
}