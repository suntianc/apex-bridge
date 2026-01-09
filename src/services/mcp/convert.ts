/**
 * MCP Tool Converter - MCP 工具转换器
 * 将 MCP 工具定义转换为统一工具框架格式
 */

import type { MCPTool } from '../../types/mcp';
import type { Tool } from '../../core/tool/tool';

/**
 * MCP 工具转换器
 * 提供 MCP 工具定义到统一 Tool.Info 格式的转换功能
 */

/**
 * 工具类型
 */
export type ToolType = 'builtin' | 'skill' | 'mcp';

/**
 * 转换 MCP 工具为统一工具格式
 * @param serverId - MCP 服务器 ID
 * @param serverName - MCP 服务器名称
 * @param tool - MCP 工具定义
 * @returns 统一工具定义
 */
export function convertMcpTool(
  serverId: string,
  serverName: string,
  tool: MCPTool,
): Tool.Info {
  // 生成工具 ID：{clientName}_{toolName} 格式
  const toolId = `${serverName}_${tool.name}`;

  return {
    id: toolId,
    init: async () => {
      const parameters = tool.inputSchema || {
        type: 'object' as const,
        properties: {},
      };

      return {
        description: tool.description || '',
        parameters,
        execute: async (args, ctx) => {
          // 这里需要依赖 MCPIntegrationService 来执行实际的 MCP 工具调用
          // 由于循环依赖问题，我们在执行时动态获取服务
          const { mcpIntegration } = await import(
            '../../services/MCPIntegrationService'
          );

          try {
            const result = await mcpIntegration.callTool({
              toolName: tool.name,
              arguments: args,
              serverId,
            });

            // 转换 MCP 结果为统一格式
            let output = '';
            const metadata: Record<string, unknown> = {
              serverId,
              serverName,
              toolName: tool.name,
              success: result.success,
            };

            if (result.success && result.content) {
              // 聚合文本内容
              const textContents = result.content
                .filter((c) => c.type === 'text' && c.text)
                .map((c) => c.text as string);
              output = textContents.join('\n');

              // 提取资源附件
              const attachments = result.content
                .filter(
                  (c): c is {
                    type: 'resource';
                    resource: { uri: string; mimeType?: string; text?: string };
                  } =>
                    c.type === 'resource' &&
                    'resource' in c &&
                    typeof c.resource === 'object',
                )
                .map((c) => {
                  const resource = c.resource;
                  return {
                    type: 'file' as const,
                    file: {
                      filename: resource.uri.split('/').pop() || 'resource',
                      mimeType: resource.mimeType,
                      fileData: resource.text,
                    },
                  };
                });

              if (attachments.length > 0) {
                metadata.attachments = attachments;
              }
            } else if (result.error) {
              output = `Error: ${result.error.message}`;
              metadata.error = result.error;
            }

            return {
              title: tool.name,
              metadata,
              output,
            };
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            return {
              title: tool.name,
              metadata: {
                serverId,
                serverName,
                toolName: tool.name,
                success: false,
                error: errorMessage,
              },
              output: `Error executing MCP tool: ${errorMessage}`,
            };
          }
        },
      };
    },
  };
}

/**
 * 解析 MCP 资源 URI
 * @param uri - MCP 资源 URI，格式为 mcp://{clientName}/{resourcePath}
 * @returns 解析结果或 null（如果格式无效）
 */
export function parseMcpResourceUri(
  uri: string,
): { clientName: string; resourcePath: string } | null {
  if (!uri || typeof uri !== 'string') {
    return null;
  }

  // 检查是否为 mcp:// URI
  if (!uri.startsWith('mcp://')) {
    return null;
  }

  // 移除协议前缀
  const pathPart = uri.slice(6);

  // 查找第一个斜杠，分隔客户端名称和资源路径
  const slashIndex = pathPart.indexOf('/');

  if (slashIndex === -1) {
    // 没有资源路径，只有客户端名称
    return {
      clientName: pathPart,
      resourcePath: '',
    };
  }

  const clientName = pathPart.slice(0, slashIndex);
  const resourcePath = pathPart.slice(slashIndex + 1);

  // 验证客户端名称非空
  if (!clientName) {
    return null;
  }

  return { clientName, resourcePath };
}

/**
 * 生成 MCP 工具 URI
 * @param serverName - 服务器名称
 * @param toolName - 工具名称
 * @returns MCP 工具 URI
 */
export function createMcpToolUri(serverName: string, toolName: string): string {
  return `mcp://${serverName}/${toolName}`;
}

/**
 * 从工具 ID 提取 MCP 服务器名称和工具名称
 * @param toolId - 工具 ID，格式为 {clientName}_{toolName}
 * @returns 服务器名称和工具名称
 */
export function parseMcpToolId(
  toolId: string,
): { serverName: string; toolName: string } | null {
  const lastUnderscore = toolId.lastIndexOf('_');

  if (lastUnderscore === -1 || lastUnderscore === 0 || lastUnderscore === toolId.length - 1) {
    return null;
  }

  return {
    serverName: toolId.slice(0, lastUnderscore),
    toolName: toolId.slice(lastUnderscore + 1),
  };
}
