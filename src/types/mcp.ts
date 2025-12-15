/**
 * MCP (Model Context Protocol) 相关类型定义
 */

export interface MCPServerConfig {
  id: string;
  type: 'stdio' | 'sse' | 'websocket';
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  transportOptions?: Record<string, any>;
}

export interface MCPServerStatus {
  phase: 'not-started' | 'initializing' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error' | 'shutting-down';
  message: string;
  uptime: number;
  startTime?: Date;
  error?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema?: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface MCPToolCall {
  tool: string;
  arguments: Record<string, any>;
}

export interface MCPToolContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  mimeType?: string;
  data?: string | Uint8Array;
}

export interface MCPToolResult {
  success: boolean;
  content: MCPToolContent[];
  duration: number;
  metadata?: {
    toolType: 'mcp';
    source?: string;
    toolName?: string;
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface MCPInitializeParams {
  protocolVersion: string;
  capabilities: Record<string, any>;
  clientInfo: {
    name: string;
    version: string;
  };
}

export interface MCPJSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

export interface MCPJSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}
