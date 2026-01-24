/**
 * ToolDispatcher - 工具调度器
 *
 * 统一路由 tool_action 调用到内置工具或 Skills
 * 复用现有 ToolExecutorManager 基础设施，优先从 ToolRegistry 获取工具
 */

import {
  type ToolActionCall,
  type ToolExecutionResult,
  type DispatcherConfig,
  type ToolDescription,
  ToolType,
} from "./types";
import type { BuiltInTool, SkillTool, ToolResult } from "../../types/tool-system";
import { BuiltInToolsRegistry, getBuiltInToolsRegistry } from "../../services/BuiltInToolsRegistry";
import { SkillsSandboxExecutor } from "../../services/executors/SkillsSandboxExecutor";
import { getSkillManager } from "../../services/skill/SkillManager";
import { mcpIntegration } from "../../services/MCPIntegrationService";
import { toolRegistry, ToolStatus } from "../tool/registry";
import type { Tool } from "../tool/tool";
import { logger } from "../../utils/logger";
import { ErrorClassifier } from "../../utils/error-classifier";
import { ErrorType } from "../../types/trajectory";
import { isNotFoundError } from "../../types/errors";

/**
 * 默认配置常量
 */
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MAX_CONCURRENCY = 3;

const DEFAULT_CONFIG: Required<DispatcherConfig> = {
  timeout: DEFAULT_TIMEOUT,
  maxConcurrency: DEFAULT_MAX_CONCURRENCY,
};

/**
 * 工具调度器
 * 负责将 tool_action 调用路由到正确的执行器
 */
export class ToolDispatcher {
  private config: Required<DispatcherConfig>;
  private builtInRegistry: BuiltInToolsRegistry;
  private skillExecutor: SkillsSandboxExecutor;

  constructor(config: DispatcherConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.builtInRegistry = getBuiltInToolsRegistry();
    this.skillExecutor = new SkillsSandboxExecutor({
      timeout: this.config.timeout,
      maxConcurrency: this.config.maxConcurrency,
    });
  }

  /**
   * 调度执行工具调用
   * 仅从 ToolRegistry 获取工具执行，ToolRegistry 作为唯一事实来源
   * @param toolCall 工具调用
   * @returns 执行结果
   */
  async dispatch(toolCall: ToolActionCall): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const { name, type, parameters } = toolCall;

    logger.info(`[ToolDispatcher] Dispatching tool call: ${name} (type: ${type})`);
    logger.debug(`[ToolDispatcher] Parameters:`, parameters);

    try {
      // 从 ToolRegistry 获取工具
      const toolInfo = await toolRegistry.get(name);
      if (!toolInfo) {
        logger.warn(`[ToolDispatcher] Tool not found in ToolRegistry: ${name}`);
        return {
          success: false,
          toolName: name,
          error: `Tool not found in registry: ${name}`,
          executionTime: Date.now() - startTime,
        };
      }

      logger.debug(`[ToolDispatcher] Found tool in ToolRegistry: ${name}`);
      return await this.executeToolInfo(toolInfo, parameters, startTime);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`[ToolDispatcher] Tool execution failed: ${name}`, error);

      return {
        success: false,
        toolName: name,
        error: errorMessage,
        executionTime,
      };
    }
  }

  /**
   * 使用 Tool.Info 执行工具调用
   * @param tool 工具信息
   * @param parameters 工具参数
   * @param startTime 开始时间
   * @returns 执行结果
   */
  private async executeToolInfo(
    tool: Tool.Info,
    parameters: Record<string, string>,
    startTime: number
  ): Promise<ToolExecutionResult> {
    logger.debug(`[ToolDispatcher] Executing tool from ToolRegistry: ${tool.id}`);

    try {
      // 创建超时 Promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Tool execution timeout after ${this.config.timeout}ms`));
        }, this.config.timeout);
      });

      // 初始化工具获取执行函数
      const toolInit = await tool.init();
      const abortController = new AbortController();

      // 创建执行上下文
      const ctx: Tool.Context = {
        sessionID: "",
        messageID: "",
        agent: "dispatcher",
        abort: abortController.signal,
        metadata: () => {},
      };

      // 执行工具
      const result = await Promise.race([toolInit.execute(parameters, ctx), timeoutPromise]);

      const executionTime = Date.now() - startTime;
      const outputContent = String(result.output || "");

      logger.info(`[ToolDispatcher] Tool ${tool.id} executed successfully in ${executionTime}ms`);

      return {
        success: true,
        toolName: tool.id,
        result: result.output,
        executionTime,
        tool_details: {
          tool_name: tool.id,
          input_params: parameters,
          output_content: outputContent,
          output_metadata: {
            token_count: ErrorClassifier.estimateTokens(outputContent),
            execution_time_ms: executionTime,
            ...result.metadata,
          },
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      const errorType = ErrorClassifier.classifyError(error);
      const errorDetails = {
        error_type: errorType,
        error_message: errorMessage,
        error_stack: error instanceof Error ? error.stack : undefined,
        context: {
          tool_name: tool.id,
          input_params: parameters,
          timestamp: Date.now(),
          execution_time_ms: executionTime,
        },
      };

      logger.error(`[ToolDispatcher] Tool execution failed: ${tool.id}`, {
        error_type: errorType,
        error_message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      // 更新工具状态为 unhealthy
      await toolRegistry.updateStatus(tool.id, ToolStatus.UNHEALTHY, errorMessage);

      return {
        success: false,
        toolName: tool.id,
        error: errorMessage,
        executionTime,
        error_details: errorDetails,
      };
    }
  }

  /**
   * 执行内置工具
   */
  private async executeBuiltInTool(
    name: string,
    parameters: Record<string, string>,
    startTime: number
  ): Promise<ToolExecutionResult> {
    const builtInTool = this.builtInRegistry.getTool(name);
    if (builtInTool && builtInTool.enabled) {
      return await this.executeBuiltIn(builtInTool, parameters, startTime);
    }

    logger.warn(`[ToolDispatcher] Built-in tool not found or disabled: ${name}`);
    return {
      success: false,
      toolName: name,
      error: `Built-in tool not found or disabled: ${name}`,
      executionTime: Date.now() - startTime,
    };
  }

  /**
   * 执行 Skill 工具
   */
  private async executeSkillTool(
    name: string,
    parameters: Record<string, string>,
    startTime: number
  ): Promise<ToolExecutionResult> {
    logger.debug(`[ToolDispatcher] Trying to execute as Skill: ${name}`);
    const skillResult = await this.executeSkill(name, parameters, startTime);
    if (skillResult) {
      return skillResult;
    }

    logger.warn(`[ToolDispatcher] Skill not found: ${name}`);
    return {
      success: false,
      toolName: name,
      error: `Skill not found: ${name}`,
      executionTime: Date.now() - startTime,
    };
  }

  /**
   * 执行 MCP 工具
   */
  private async executeMCPTool(
    name: string,
    parameters: Record<string, string>,
    startTime: number
  ): Promise<ToolExecutionResult> {
    try {
      logger.info(`[ToolDispatcher] Calling MCP tool: ${name}`);

      // 调用 MCP 工具
      const result = await mcpIntegration.callTool({
        toolName: name,
        arguments: parameters,
      });

      const executionTime = Date.now() - startTime;

      // 🆕 成功情况：返回详细信息
      if (result.success) {
        const outputContent = String(result.content || "");
        return {
          success: true,
          toolName: name,
          result: result.content,
          executionTime,
          tool_details: {
            tool_name: name,
            input_params: parameters,
            output_content: outputContent,
            output_metadata: {
              token_count: ErrorClassifier.estimateTokens(outputContent),
              execution_time_ms: executionTime,
            },
          },
        };
      }

      // 🆕 失败情况：分类错误类型
      const errorType = ErrorClassifier.classifyError(
        new Error(result.error?.message || "MCP tool execution failed")
      );
      const errorDetails = {
        error_type: errorType,
        error_message: result.error?.message || "MCP tool execution failed",
        context: {
          tool_name: name,
          input_params: parameters,
          timestamp: Date.now(),
          execution_time_ms: executionTime,
        },
      };

      logger.error(`[ToolDispatcher] MCP tool execution failed: ${name}`, {
        error_type: errorType,
        error_message: result.error?.message,
        params: parameters,
      });

      // 更新工具状态为 unhealthy
      await toolRegistry.updateStatus(name, ToolStatus.UNHEALTHY, result.error?.message);

      return {
        success: false,
        toolName: name,
        error: result.error?.message || "MCP tool execution failed",
        executionTime,
        error_details: errorDetails,
      };
    } catch (error: any) {
      // 🆕 捕获异常：分类错误类型
      const errorType = ErrorClassifier.classifyError(error);
      const errorDetails = {
        error_type: errorType,
        error_message: error.message || "MCP tool execution failed",
        error_stack: error.stack,
        context: {
          tool_name: name,
          input_params: parameters,
          timestamp: Date.now(),
          execution_time_ms: Date.now() - startTime,
        },
      };

      logger.error(`[ToolDispatcher] MCP tool execution failed: ${name}`, {
        error_type: errorType,
        error_message: error.message,
        stack: error.stack,
      });

      // 更新工具状态为 unhealthy
      await toolRegistry.updateStatus(name, ToolStatus.UNHEALTHY, error.message);

      return {
        success: false,
        toolName: name,
        error: error.message || "MCP tool execution failed",
        executionTime: Date.now() - startTime,
        error_details: errorDetails,
      };
    }
  }

  /**
   * 执行内置工具
   */
  private async executeBuiltIn(
    tool: BuiltInTool,
    parameters: Record<string, string>,
    startTime: number
  ): Promise<ToolExecutionResult> {
    logger.debug(`[ToolDispatcher] Executing built-in tool: ${tool.name}`);

    // 转换参数类型
    const typedArgs = this.convertParameters(parameters, tool.parameters);

    // 创建超时 Promise
    const timeoutPromise = new Promise<ToolResult>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Tool execution timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);
    });

    // 执行工具
    const result = await Promise.race([
      this.builtInRegistry.execute({ name: tool.name, args: typedArgs }),
      timeoutPromise,
    ]);

    const executionTime = Date.now() - startTime;

    // 🆕 成功情况：返回详细信息
    if (result.success) {
      const outputContent = String(result.output || "");
      const isHiddenTool = tool.name === "vector-search";
      return {
        success: true,
        toolName: tool.name,
        result: result.output,
        executionTime,
        hiddenFromUser: isHiddenTool,
        tool_details: {
          tool_name: tool.name,
          input_params: typedArgs,
          output_content: outputContent,
          output_metadata: {
            token_count: ErrorClassifier.estimateTokens(outputContent),
            execution_time_ms: executionTime,
          },
        },
      };
    }

    // 🆕 失败情况：分类错误类型
    const errorType = ErrorClassifier.classifyError(new Error(result.error));
    const errorDetails = {
      error_type: errorType,
      error_message: result.error || "Unknown error",
      context: {
        tool_name: tool.name,
        input_params: typedArgs,
        timestamp: Date.now(),
        execution_time_ms: executionTime,
      },
    };

    logger.error(`[ToolDispatcher] Built-in tool execution failed: ${tool.name}`, {
      error_type: errorType,
      error_message: result.error,
      params: typedArgs,
    });

    // 更新工具状态为 unhealthy
    await toolRegistry.updateStatus(tool.name, ToolStatus.UNHEALTHY, result.error);

    return {
      success: false,
      toolName: tool.name,
      error: result.error,
      executionTime,
      error_details: errorDetails,
    };
  }

  /**
   * 执行 Skill（可执行型 Skill）
   */
  private async executeSkill(
    name: string,
    parameters: Record<string, string>,
    startTime: number
  ): Promise<ToolExecutionResult | null> {
    try {
      logger.debug(`[ToolDispatcher] Attempting to execute Skill: ${name}`);

      // 转换参数（Skills 也需要类型转换）
      const typedArgs = this.convertParameters(parameters, null);

      // 执行 Skill
      const result = await this.skillExecutor.execute({
        name,
        args: typedArgs,
      });

      const executionTime = Date.now() - startTime;

      // 如果 Skill 不存在，返回 null（让调度器继续尝试其他路径）
      if (!result.success && isNotFoundError(result.error)) {
        logger.debug(`[ToolDispatcher] Skill not found: ${name}`);
        return null;
      }

      // 🆕 成功情况：返回详细信息
      if (result.success) {
        const outputContent = String(result.output || "");
        return {
          success: true,
          toolName: name,
          result: result.output,
          executionTime,
          tool_details: {
            tool_name: name,
            input_params: typedArgs,
            output_content: outputContent,
            output_metadata: {
              token_count: ErrorClassifier.estimateTokens(outputContent),
              execution_time_ms: executionTime,
            },
          },
        };
      }

      // 🆕 失败情况：分类错误类型
      const errorType = ErrorClassifier.classifyError(new Error(result.error));
      const errorDetails = {
        error_type: errorType,
        error_message: result.error || "Unknown error",
        context: {
          tool_name: name,
          input_params: typedArgs,
          timestamp: Date.now(),
          execution_time_ms: executionTime,
        },
      };

      logger.error(`[ToolDispatcher] Skill execution failed: ${name}`, {
        error_type: errorType,
        error_message: result.error,
        params: typedArgs,
      });

      // 更新工具状态为 unhealthy
      await toolRegistry.updateStatus(name, ToolStatus.UNHEALTHY, result.error);

      return {
        success: false,
        toolName: name,
        error: result.error,
        executionTime,
        error_details: errorDetails,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 如果是 Skill 不存在的错误，返回 null
      if (isNotFoundError(error)) {
        logger.debug(`[ToolDispatcher] Skill does not exist: ${name}`);
        return null;
      }

      // 🆕 其他错误，分类并记录详细信息
      const errorType = ErrorClassifier.classifyError(error);
      const errorDetails = {
        error_type: errorType,
        error_message: errorMessage,
        error_stack: error instanceof Error ? error.stack : undefined,
        context: {
          tool_name: name,
          input_params: this.convertParameters(parameters, null),
          timestamp: Date.now(),
          execution_time_ms: Date.now() - startTime,
        },
      };

      logger.error(`[ToolDispatcher] Skill execution error: ${name}`, {
        error_type: errorType,
        error_message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      // 更新工具状态为 unhealthy
      await toolRegistry.updateStatus(name, ToolStatus.UNHEALTHY, errorMessage);

      return {
        success: false,
        toolName: name,
        error: errorMessage,
        executionTime: Date.now() - startTime,
        error_details: errorDetails,
      };
    }
  }

  /**
   * 转换参数类型（字符串 -> 实际类型）
   */
  private convertParameters(params: Record<string, string>, schema: any): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      const propSchema = schema?.properties?.[key];

      if (!propSchema) {
        result[key] = value;
        continue;
      }

      switch (propSchema.type) {
        case "number":
          result[key] = Number(value);
          break;
        case "boolean":
          result[key] = value === "true" || value === "1";
          break;
        case "array":
          try {
            result[key] = JSON.parse(value);
          } catch (error) {
            logger.debug(
              `[ToolDispatcher] Failed to parse array parameter "${key}", using comma-split fallback`,
              error
            );
            result[key] = value.split(",").map((s) => s.trim());
          }
          break;
        case "object":
          try {
            result[key] = JSON.parse(value);
          } catch (error) {
            logger.debug(`[ToolDispatcher] Failed to parse object parameter "${key}"`, error);
            result[key] = value;
          }
          break;
        default:
          result[key] = value;
      }
    }

    return result;
  }

  /**
   * 执行 Skill Direct 模式 - 直接返回 SKILL.md 内容，无需沙箱执行
   * 用于 FR-37~FR-40 场景
   * @param toolName 工具名称（包含 skill: 前缀或直接是 Skill 名称）
   * @param parameters 工具参数
   * @returns 执行结果
   */
  async executeDirect(
    toolName: string,
    parameters: Record<string, string>
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    // 提取 Skill 名称（支持带 skill: 前缀）
    let skillName = toolName;
    if (toolName.startsWith("skill:")) {
      skillName = toolName.substring(6);
    }

    logger.info(`[ToolDispatcher] Executing Skill Direct: ${skillName}`);

    try {
      const skillManager = getSkillManager();
      const result = await skillManager.executeDirect(skillName, parameters);

      return {
        success: true,
        toolName: toolName,
        result: result,
        executionTime: Date.now() - startTime,
        tool_details: {
          tool_name: toolName,
          input_params: parameters,
          output_content: result,
          output_metadata: {
            token_count: ErrorClassifier.estimateTokens(result),
            execution_time_ms: Date.now() - startTime,
            mode: "direct",
          },
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = ErrorClassifier.classifyError(error);
      const errorDetails = {
        error_type: errorType,
        error_message: errorMessage,
        context: {
          tool_name: toolName,
          input_params: parameters,
          timestamp: Date.now(),
          execution_time_ms: Date.now() - startTime,
        },
      };

      logger.error(`[ToolDispatcher] Skill Direct execution failed: ${skillName}`, {
        error_type: errorType,
        error_message: errorMessage,
      });

      return {
        success: false,
        toolName: toolName,
        error: errorMessage,
        executionTime: Date.now() - startTime,
        error_details: errorDetails,
      };
    }
  }

  /**
   * 检查工具是否存在
   * @param name 工具名称
   * @returns 是否存在
   */
  hasTool(name: string): boolean {
    const builtIn = this.builtInRegistry.getTool(name);
    return !!builtIn?.enabled;
  }

  /**
   * 获取可用工具列表
   * @returns 工具描述列表
   */
  async getAvailableTools(): Promise<ToolDescription[]> {
    return toolRegistry.listDescriptions();
  }

  /**
   * Convert MCP tool definition to description format
   */
  private convertMcpToolToDescription(
    tool: { name: string; description: string; inputSchema?: any },
    serverId: string
  ): ToolDescription {
    const parameters: ToolDescription["parameters"] = [];

    if (tool.inputSchema?.properties) {
      for (const [name, prop] of Object.entries(tool.inputSchema.properties)) {
        const propObj = prop as { type?: string; description?: string };
        parameters.push({
          name,
          type: propObj.type || "string",
          description: propObj.description || "",
          required: tool.inputSchema.required?.includes(name) ?? false,
        });
      }
    }

    return {
      name: tool.name,
      description: `[MCP:${serverId}] ${tool.description}`,
      parameters,
    };
  }

  /**
   * Convert tool definition to description format
   */
  private convertToDescription(tool: BuiltInTool | SkillTool): ToolDescription {
    const parameters: ToolDescription["parameters"] = [];

    if (tool.parameters?.properties) {
      for (const [name, prop] of Object.entries(tool.parameters.properties)) {
        parameters.push({
          name,
          type: prop.type,
          description: prop.description,
          required: tool.parameters.required?.includes(name) ?? false,
        });
      }
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters,
    };
  }
}

/**
 * 生成工具描述文本（用于系统提示词）
 * @param tools 工具描述列表
 * @returns 格式化的工具描述文本
 */
export function generateToolPrompt(tools: ToolDescription[]): string {
  if (tools.length === 0) {
    return `
## 可用工具

当前没有可用的工具。
`;
  }

  const toolDescriptions = tools
    .map((tool) => {
      const paramList =
        tool.parameters.length > 0
          ? tool.parameters
              .map(
                (p) =>
                  `  - \`${p.name}\` (${p.type}${p.required ? ", 必需" : ""}): ${p.description}`
              )
              .join("\n")
          : "  无参数";

      return `
### ${tool.name}
${tool.description}

**参数:**
${paramList}
`;
    })
    .join("\n");

  return `
## 可用工具

你可以通过以下格式调用工具：

\`\`\`xml
<tool_action name="工具名称">
  <参数名 value="参数值" />
</tool_action>
\`\`\`

### 工具列表
${toolDescriptions}

### 使用说明
1. 在需要使用工具时，输出完整的 \`<tool_action>\` 标签
2. 标签必须包含 \`name\` 属性指定工具名称
3. 参数使用子标签 \`<参数名 value="值" />\` 格式传递
4. 系统会自动执行工具并返回结果
5. 你可以根据工具结果继续思考和行动

### 示例
\`\`\`xml
<tool_action name="vector-search">
  <query value="读取文件相关的工具" />
  <limit value="5" />
</tool_action>
\`\`\`
`;
}
