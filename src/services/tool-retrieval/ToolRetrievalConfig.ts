/**
 * ToolRetrievalConfig - 工具检索服务配置类型定义
 */

import { LLMModelType } from "../../types/llm-models";

/**
 * 工具检索配置
 */
export interface ToolRetrievalConfig {
  /** 向量数据库路径 */
  vectorDbPath: string;
  /** 嵌入模型名称 */
  model: string;
  /** 向量维度 */
  dimensions: number;
  /** 缓存大小 */
  cacheSize: number;
  /** 相似度阈值 */
  similarityThreshold: number;
  /** 最大结果数 */
  maxResults?: number;
}

/**
 * 技能工具定义
 */
export interface SkillTool {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 工具类型 */
  type: "skill" | "mcp" | "builtin";
  /** 标签 */
  tags: string[];
  /** 版本 */
  version?: string;
  /** 路径 */
  path?: string;
  /** 来源 */
  source?: string;
  /** 元数据 */
  metadata?: Record<string, any>;
  /** 参数定义 */
  parameters?: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  /** 是否启用 */
  enabled?: boolean;
  /** 级别 */
  level?: number;
}

/**
 * 工具检索结果
 */
export interface ToolRetrievalResult {
  /** 工具信息 */
  tool: SkillTool;
  /** 相似度分数 (0-1) */
  score: number;
  /** 匹配原因 */
  reason: string;
}

/**
 * 工具错误代码
 */
export enum ToolErrorCode {
  VECTOR_DB_ERROR = "VECTOR_DB_ERROR",
  EMBEDDING_MODEL_ERROR = "EMBEDDING_MODEL_ERROR",
  TOOL_EXECUTION_FAILED = "TOOL_EXECUTION_FAILED",
  SKILL_NOT_FOUND = "SKILL_NOT_FOUND",
  SKILL_ALREADY_EXISTS = "SKILL_ALREADY_EXISTS",
  SKILL_INVALID_STRUCTURE = "SKILL_INVALID_STRUCTURE",
}

/**
 * 工具错误
 */
export class ToolError extends Error {
  code: ToolErrorCode;
  details?: Record<string, any>;

  constructor(message: string, code: ToolErrorCode, details?: Record<string, any>) {
    super(message);
    this.name = "ToolError";
    this.code = code;
    this.details = details;
  }
}

/**
 * 工具类型
 */
export enum ToolType {
  SKILL = "skill",
  MCP = "mcp",
  BUILTIN = "builtin",
}

/**
 * 默认配置
 */
export const DEFAULT_TOOL_RETRIEVAL_CONFIG: ToolRetrievalConfig = {
  vectorDbPath: "./.data",
  model: "nomic-embed-text:latest",
  cacheSize: 1000,
  dimensions: 768,
  similarityThreshold: 0.4,
  maxResults: 10,
};
