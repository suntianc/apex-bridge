/**
 * 工具系统类型定义
 * 基于OpenSpec提案：内置工具与Skills外置工具融合架构
 */

/**
 * 工具类型枚举
 */
export enum ToolType {
  BUILTIN = 'builtin',
  SKILL = 'skill'
}

/**
 * 工具执行选项
 */
export interface ToolExecuteOptions {
  /** 工具名称 */
  name: string;
  /** 工具参数 */
  args: Record<string, any>;
  /** 执行超时时间（毫秒） */
  timeout?: number;
  /** 最大输出大小（字节） */
  maxOutputSize?: number;
  /** 并发限制 */
  concurrency?: number;
}

/**
 * 工具执行结果
 */
export interface ToolResult {
  /** 执行是否成功 */
  success: boolean;
  /** 输出内容 */
  output?: string;
  /** 标准错误输出 */
  stderr?: string;
  /** 退出码 */
  exitCode?: number;
  /** 执行耗时（毫秒） */
  duration: number;
  /** 错误信息 */
  error?: string;
  /** 错误代码 */
  errorCode?: string;
}

/**
 * 内置工具定义
 */
export interface BuiltInTool {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 工具类型 */
  type: ToolType.BUILTIN;
  /** 工具分类 */
  category: string;
  /** 工具级别（用于排序） */
  level: number;
  /** 工具参数模式 */
  parameters: ToolParameterSchema;
  /** 工具执行函数 */
  execute: (args: Record<string, any>) => Promise<ToolResult>;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * Skills工具定义
 */
export interface SkillTool {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 工具类型 */
  type: ToolType.SKILL;
  /** 工具标签 */
  tags: string[];
  /** Skills版本 */
  version: string;
  /** Skills安装路径 */
  path: string;
  /** 工具参数模式 */
  parameters: ToolParameterSchema;
  /** 作者信息 */
  author?: string;
  /** 是否启用 */
  enabled: boolean;
  /** 工具等级 */
  level: number;
}

/**
 * 工具参数模式
 */
export interface ToolParameterSchema {
  /** 参数类型 */
  type: 'object';
  /** 参数属性 */
  properties: Record<string, ToolParameterProperty>;
  /** 必需参数 */
  required?: string[];
  /** 额外属性是否允许 */
  additionalProperties?: boolean;
}

/**
 * 工具参数属性
 */
export interface ToolParameterProperty {
  /** 参数类型 */
  type: string;
  /** 参数描述 */
  description: string;
  /** 默认值 */
  default?: any;
  /** 枚举值 */
  enum?: any[];
  /** 最小值（数字类型） */
  minimum?: number;
  /** 最大值（数字类型） */
  maximum?: number;
  /** 最小长度（字符串类型） */
  minLength?: number;
  /** 最大长度（字符串类型） */
  maxLength?: number;
  /** 模式匹配（字符串类型） */
  pattern?: string;
}

/**
 * 工具执行器接口
 */
export interface ToolExecutor {
  /** 执行工具 */
  execute(options: ToolExecuteOptions): Promise<ToolResult>;
  /** 获取支持的工具列表 */
  listTools(): (BuiltInTool | SkillTool)[];
  /** 检查工具是否存在 */
  hasTool(name: string): boolean;
  /** 获取工具详情 */
  getTool(name: string): BuiltInTool | SkillTool | undefined;
}

/**
 * 工具检索结果
 */
export interface ToolRetrievalResult {
  /** 匹配的工具 */
  tool: BuiltInTool | SkillTool;
  /** 相似度分数 */
  score: number;
  /** 匹配原因 */
  reason?: string;
}

/**
 * Skills元数据
 */
export interface SkillMetadata {
  /** Skills名称 */
  name: string;
  /** Skills描述 */
  description: string;
  /** Skills版本 */
  version: string;
  /** Skills标签 */
  tags: string[];
  /** 作者信息 */
  author?: string;
  /** 依赖项 */
  dependencies?: string[];
  /** 参数模式 */
  parameters?: ToolParameterSchema;
  /** Skills分类 */
  category?: string;
  /** 工具列表 */
  tools?: string[];
}

/**
 * Skills安装选项
 */
export interface SkillInstallOptions {
  /** 是否覆盖已存在的Skills */
  overwrite?: boolean;
  /** 是否跳过向量化 */
  skipVectorization?: boolean;
  /** 验证级别 */
  validationLevel?: 'strict' | 'basic' | 'none';
}

/**
 * Skills列表查询选项
 */
export interface SkillListOptions {
  /** 名称过滤 */
  name?: string;
  /** 标签过滤 */
  tags?: string[];
  /** 分页页码 */
  page?: number;
  /** 每页限制 */
  limit?: number;
  /** 排序字段 */
  sortBy?: 'name' | 'installedAt' | 'updatedAt';
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Skills列表结果
 */
export interface SkillListResult {
  /** Skills列表 */
  skills: SkillTool[];
  /** 总数 */
  total: number;
  /** 当前页码 */
  page: number;
  /** 每页数量 */
  limit: number;
  /** 总页数 */
  totalPages: number;
}

/**
 * Skills统计信息
 */
export interface SkillStatistics {
  /** 总数 */
  total: number;
  /** 按标签统计 */
  byTag?: Record<string, number>;
  /** 按分类统计 */
  byCategory?: Record<string, number>;
  /** 安装趋势 */
  growth?: Array<{
    date: string;
    count: number;
  }>;
}

/**
 * 沙箱执行选项
 */
export interface SandboxExecutionOptions {
  /** 执行超时时间（毫秒） */
  timeout?: number;
  /** 最大输出大小（字节） */
  maxOutputSize?: number;
  /** 内存限制（MB） */
  memoryLimit?: number;
  /** 并发限制 */
  maxConcurrency?: number;
  /** 环境变量白名单 */
  allowedEnvVars?: string[];
  /** 工作区路径 */
  workspacePath?: string;
}

/**
 * 沙箱执行结果
 */
export interface SandboxExecutionResult {
  /** 执行是否成功 */
  success: boolean;
  /** 标准输出 */
  stdout: string;
  /** 标准错误 */
  stderr: string;
  /** 退出码 */
  exitCode: number;
  /** 执行耗时（毫秒） */
  duration: number;
  /** 错误信息 */
  error?: string;
  /** 是否被截断 */
  truncated?: boolean;
}

/**
 * 工具检索服务配置
 */
export interface ToolRetrievalConfig {
  /** 向量数据库路径 */
  vectorDbPath: string;
  /** 嵌入模型名称 */
  model: string;
  /** 向量维度 */
  dimensions: number;
  /** 相似度阈值 */
  similarityThreshold: number;
  /** 缓存大小 */
  cacheSize: number;
  /** 最大返回结果数 */
  maxResults?: number;
}

/**
 * Skills配置
 */
export interface SkillsConfig {
  /** 存储配置 */
  storage: {
    /** Skills存储路径 */
    path: string;
    /** 向量数据库路径 */
    vectorDbPath: string;
  };
  /** 检索配置 */
  retrieval: ToolRetrievalConfig;
  /** 执行配置 */
  execution: SandboxExecutionOptions;
}

/**
 * 错误代码枚举
 */
export enum ToolErrorCode {
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  TOOL_TIMEOUT = 'TOOL_TIMEOUT',
  TOOL_OUTPUT_EXCEEDED = 'TOOL_OUTPUT_EXCEEDED',
  TOOL_MEMORY_EXCEEDED = 'TOOL_MEMORY_EXCEEDED',
  SKILL_NOT_FOUND = 'SKILL_NOT_FOUND',
  SKILL_INVALID_STRUCTURE = 'INVALID_SKILL_STRUCTURE',
  SKILL_ALREADY_EXISTS = 'SKILL_ALREADY_EXISTS',
  VECTOR_DB_ERROR = 'VECTOR_DB_ERROR',
  EMBEDDING_MODEL_ERROR = 'EMBEDDING_MODEL_ERROR'
}

/**
 * 工具错误类
 */
export class ToolError extends Error {
  constructor(
    message: string,
    public code: ToolErrorCode,
    public details?: any
  ) {
    super(message);
    this.name = 'ToolError';
  }
}