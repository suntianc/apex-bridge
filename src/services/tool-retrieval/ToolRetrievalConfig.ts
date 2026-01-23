/**
 * ToolRetrievalConfig - 工具检索服务配置类型定义
 * @deprecated Re-export from types.ts for backward compatibility
 */

import {
  ToolRetrievalConfig as _ToolRetrievalConfig,
  SkillTool,
  ToolRetrievalResult,
  ToolErrorCode,
  ToolError,
  ToolType,
} from "./types";

// Re-export for backward compatibility
export type { _ToolRetrievalConfig as ToolRetrievalConfig };
export type { SkillTool, ToolRetrievalResult, ToolErrorCode, ToolError, ToolType };

// Legacy DEFAULT_TOOL_RETRIEVAL_CONFIG for callers that depend on it
export const DEFAULT_TOOL_RETRIEVAL_CONFIG: _ToolRetrievalConfig = {
  vectorDbPath: "./.data/vector-store",
  model: "nomic-embed-text:latest",
  dimensions: 768,
  cacheSize: 1000,
  similarityThreshold: 0.4,
  maxResults: 10,
};
