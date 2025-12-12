/**
 * VectorSearchTool - 向量搜索内置工具
 * 使用LanceDB搜索相关的Skills工具
 */

import { ToolResult, BuiltInTool, ToolType } from '../../../types/tool-system';
import { getToolRetrievalService, ToolRetrievalService } from '../../../services/ToolRetrievalService';
import { logger } from '../../../utils/logger';

/**
 * VectorSearchTool参数接口
 */
export interface VectorSearchArgs {
  /** 搜索查询 */
  query: string;
  /** 最大返回结果数 */
  limit?: number;
  /** 相似度阈值 */
  threshold?: number;
  /** 是否包含元数据 */
  includeMetadata?: boolean;
}

/**
 * 向量搜索工具
 * 基于用户查询在Skills向量库中搜索相关工具
 */
export class VectorSearchTool {
  private static readonly DEFAULT_LIMIT = 5;
  private static readonly DEFAULT_THRESHOLD = 0.15;
  private static readonly MAX_LIMIT = 20;

  /**
   * 执行向量搜索
   * @param args 搜索参数
   * @returns 搜索结果
   */
  static async execute(args: VectorSearchArgs): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // 参数验证
      this.validateArgs(args);

      // 获取工具检索服务
      const retrievalService = getToolRetrievalService();

      logger.info(`Vector search for query: "${args.query}"`);

      // 执行搜索
      const results = await retrievalService.findRelevantSkills(
        args.query,
        args.limit || this.DEFAULT_LIMIT,
        args.threshold || this.DEFAULT_THRESHOLD
      );

      const duration = Date.now() - startTime;

      // 格式化结果
      const formattedResults = this.formatSearchResults(results, args);

      logger.info(`Vector search completed in ${duration}ms, found ${results.length} results`);

      return {
        success: true,
        output: formattedResults,
        duration,
        exitCode: 0
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error(`Vector search failed:`, error);

      return {
        success: false,
        error: this.formatError(error),
        duration,
        errorCode: 'VECTOR_SEARCH_ERROR',
        exitCode: 1
      };
    }
  }

  /**
   * 验证参数
   */
  private static validateArgs(args: VectorSearchArgs): void {
    if (!args.query || typeof args.query !== 'string') {
      throw new Error('Query is required and must be a non-empty string');
    }

    if (args.query.trim().length === 0) {
      throw new Error('Query cannot be empty or whitespace only');
    }

    if (args.limit !== undefined) {
      if (typeof args.limit !== 'number') {
        throw new Error('Limit must be a number');
      }
      if (args.limit < 1 || args.limit > this.MAX_LIMIT) {
        throw new Error(`Limit must be between 1 and ${this.MAX_LIMIT}`);
      }
    }

    if (args.threshold !== undefined) {
      if (typeof args.threshold !== 'number') {
        throw new Error('Threshold must be a number');
      }
      if (args.threshold < 0 || args.threshold > 1) {
        throw new Error('Threshold must be between 0.0 and 1.0');
      }
    }
  }

  /**
   * 格式化搜索结果
   */
  private static formatSearchResults(
    results: Array<{
      tool: any;
      score: number;
      reason?: string;
    }>,
    args: VectorSearchArgs
  ): string {
    if (results.length === 0) {
      return `No relevant Skills found for query: "${args.query}"`;
    }

    let output = `Found ${results.length} relevant Skill(s) for: "${args.query}"\n\n`;

    results.forEach((result, index) => {
      output += this.formatResult(result, index + 1, args);
    });

    output += '\n';
    output += '=== How to Use These Skills ===\n\n';

    // 检查第一个结果是否有可执行脚本
    const firstTool = results[0]?.tool;
    const hasExecuteScript = firstTool?.path && this.checkIfExecutable(firstTool.path);

    if (hasExecuteScript) {
      output += '✓ Executable Skill: Use tool_action to execute\n';
      output += `Example:\n`;
      output += `<tool_action name="${firstTool.name}">\n`;
      if (firstTool.parameters?.properties) {
        const firstParam = Object.keys(firstTool.parameters.properties)[0];
        if (firstParam) {
          output += `  <${firstParam} value="your-value" />\n`;
        }
      }
      output += `</tool_action>\n\n`;
    } else {
      output += '✓ Knowledge Skill: Use read-skill to get full documentation\n';
      output += `Example:\n`;
      output += `<tool_action name="read-skill">\n`;
      output += `  <skillName value="${firstTool?.name || 'skill-name'}" />\n`;
      output += `</tool_action>\n\n`;
    }

    output += 'Note: After reading the Skill documentation, you can apply the knowledge to help the user.\n';

    return output;
  }

  /**
   * 检查 Skill 是否可执行（简单检查，实际检查在运行时）
   */
  private static checkIfExecutable(_skillPath: string): boolean {
    // 这里只是一个提示，实际的可执行性检查在 SkillsSandboxExecutor 中
    // 我们假设有 path 的 Skill 可能是可执行的
    return true;
  }

  /**
   * 格式化单个结果
   */
  private static formatResult(
    result: {
      tool: any;
      score: number;
      reason?: string;
    },
    index: number,
    args: VectorSearchArgs
  ): string {
    const tool = result.tool;

    // 判断 Skill 类型
    const isExecutable = tool.parameters &&
                        tool.parameters.properties &&
                        Object.keys(tool.parameters.properties).length > 0;
    const skillType = isExecutable ? '🔧 Executable' : '📚 Knowledge';

    let output = `${index}. ${tool.name} [${skillType}]\n`;
    output += `   Score: ${(result.score * 100).toFixed(2)}%\n`;
    output += `   Description: ${tool.description}\n`;
    output += `   Category: ${tool.category || 'N/A'}\n`;

    if (tool.tags && Array.isArray(tool.tags) && tool.tags.length > 0) {
      output += `   Tags: ${tool.tags.join(', ')}\n`;
    }

    if (isExecutable && tool.parameters.properties) {
      output += `   Parameters:\n`;
      const properties = tool.parameters.properties;
      const required = tool.parameters.required || [];

      Object.entries(properties).forEach(([paramName, paramSchema]) => {
        const schema: any = paramSchema;
        const isRequired = required.includes(paramName);
        const requiredMarker = isRequired ? ' (required)' : '';
        output += `     - ${paramName}${requiredMarker}: ${schema.description}\n`;

        if (schema.type) {
          output += `       Type: ${schema.type}\n`;
        }

        if (schema.default !== undefined) {
          output += `       Default: ${JSON.stringify(schema.default)}\n`;
        }

        if (schema.enum) {
          output += `       Enum: ${schema.enum.join(', ')}\n`;
        }
      });
    } else if (!isExecutable) {
      output += `   Type: Knowledge-based Skill (use read-skill to get full documentation)\n`;
    }

    if (args.includeMetadata && tool.metadata) {
      output += `   Metadata: ${JSON.stringify(tool.metadata, null, 2)}\n`;
    }

    if (result.reason) {
      output += `   Reason: ${result.reason}\n`;
    }

    output += '\n';
    return output;
  }

  /**
   * 格式化错误信息
   */
  private static formatError(error: any): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error occurred during vector search';
  }

  /**
   * 获取工具元数据
   */
  static getMetadata() {
    return {
      name: 'vector-search',
      description: 'Search for relevant Skills tools using vector similarity. Use this when you need to find tools to help with a task.',
      category: 'search',
      level: 1,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query describing what kind of tool or functionality you need'
          },
          limit: {
            type: 'number',
            description: `Maximum number of results to return (default: ${this.DEFAULT_LIMIT}, max: ${this.MAX_LIMIT})`,
            default: this.DEFAULT_LIMIT,
            minimum: 1,
            maximum: this.MAX_LIMIT
          },
          threshold: {
            type: 'number',
            description: 'Similarity threshold (0.0 to 1.0, default: 0.15). Higher values = more strict matching',
            default: this.DEFAULT_THRESHOLD,
            minimum: 0.0,
            maximum: 1.0
          },
          includeMetadata: {
            type: 'boolean',
            description: 'Include additional metadata in results',
            default: false
          }
        },
        required: ['query']
      }
    };
  }

  /**
   * 计算搜索查询的向量嵌入（备用方法）
   */
  private static async getQueryEmbedding(query: string): Promise<number[]> {
    // 这个方法将由ToolRetrievalService实现
    // 这里只是占位符
    throw new Error('getQueryEmbedding not implemented');
  }

  /**
   * 从搜索结果中提取工具参数模式（用于动态生成工具调用）
   */
  private static extractParametersFromResults(results: any[]): string {
    if (results.length === 0) {
      return 'No tools found';
    }

    const tool = results[0].tool;
    if (!tool.parameters || !tool.parameters.properties) {
      return 'No parameters defined';
    }

    const params = Object.entries(tool.parameters.properties).map(([name, schema]: [string, any]) => {
      const required = tool.parameters.required?.includes(name) ? ' (required)' : '';
      return `    ${name}${required}: ${schema.type} - ${schema.description}`;
    });

    return params.join('\n');
  }
}

/**
 * 创建VectorSearchTool实例（用于注册表）
 */
export function createVectorSearchTool() {
  return {
    ...VectorSearchTool.getMetadata(),
    type: ToolType.BUILTIN,
    enabled: true,
    execute: async (args: Record<string, any>) => {
      return VectorSearchTool.execute(args as VectorSearchArgs);
    }
  } as BuiltInTool;
}