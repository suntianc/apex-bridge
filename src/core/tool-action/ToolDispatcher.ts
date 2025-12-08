/**
 * ToolDispatcher - 工具调度器
 *
 * 统一路由 tool_action 调用到内置工具或 Skills
 * 复用现有 ToolExecutorManager 基础设施
 */

import type {
  ToolActionCall,
  ToolExecutionResult,
  DispatcherConfig,
  ToolDescription
} from './types';
import type {
  BuiltInTool,
  SkillTool,
  ToolResult
} from '../../types/tool-system';
import { BuiltInToolsRegistry, getBuiltInToolsRegistry } from '../../services/BuiltInToolsRegistry';
import { logger } from '../../utils/logger';

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<DispatcherConfig> = {
  timeout: 30000,
  maxConcurrency: 3
};

/**
 * 工具调度器
 * 负责将 tool_action 调用路由到正确的执行器
 */
export class ToolDispatcher {
  private config: Required<DispatcherConfig>;
  private builtInRegistry: BuiltInToolsRegistry;

  constructor(config: DispatcherConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.builtInRegistry = getBuiltInToolsRegistry();
  }

  /**
   * 调度执行工具调用
   * @param toolCall 工具调用
   * @returns 执行结果
   */
  async dispatch(toolCall: ToolActionCall): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const { name, parameters } = toolCall;

    logger.info(`[ToolDispatcher] Dispatching tool call: ${name}`);
    logger.debug(`[ToolDispatcher] Parameters:`, parameters);

    try {
      // 1. 检查内置工具
      const builtInTool = this.builtInRegistry.getTool(name);
      if (builtInTool && builtInTool.enabled) {
        return await this.executeBuiltIn(builtInTool, parameters, startTime);
      }

      // 2. 工具不存在
      logger.warn(`[ToolDispatcher] Tool not found: ${name}`);
      return {
        success: false,
        toolName: name,
        error: `Tool not found: ${name}`,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`[ToolDispatcher] Tool execution failed: ${name}`, error);

      return {
        success: false,
        toolName: name,
        error: errorMessage,
        executionTime
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
      timeoutPromise
    ]);

    const executionTime = Date.now() - startTime;

    return {
      success: result.success,
      toolName: tool.name,
      result: result.success ? result.output : undefined,
      error: result.success ? undefined : result.error,
      executionTime
    };
  }

  /**
   * 转换参数类型（字符串 -> 实际类型）
   */
  private convertParameters(
    params: Record<string, string>,
    schema: any
  ): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      const propSchema = schema?.properties?.[key];

      if (!propSchema) {
        result[key] = value;
        continue;
      }

      switch (propSchema.type) {
        case 'number':
          result[key] = Number(value);
          break;
        case 'boolean':
          result[key] = value === 'true' || value === '1';
          break;
        case 'array':
          try {
            result[key] = JSON.parse(value);
          } catch {
            result[key] = value.split(',').map(s => s.trim());
          }
          break;
        case 'object':
          try {
            result[key] = JSON.parse(value);
          } catch {
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
  getAvailableTools(): ToolDescription[] {
    const tools: ToolDescription[] = [];

    // 内置工具
    const builtInTools = this.builtInRegistry.listTools();
    for (const tool of builtInTools) {
      tools.push(this.convertToDescription(tool));
    }

    return tools;
  }

  /**
   * 转换工具定义为描述格式
   */
  private convertToDescription(tool: BuiltInTool | SkillTool): ToolDescription {
    const parameters: ToolDescription['parameters'] = [];

    if (tool.parameters?.properties) {
      for (const [name, prop] of Object.entries(tool.parameters.properties)) {
        parameters.push({
          name,
          type: prop.type,
          description: prop.description,
          required: tool.parameters.required?.includes(name) ?? false
        });
      }
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters
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

  const toolDescriptions = tools.map(tool => {
    const paramList = tool.parameters.length > 0
      ? tool.parameters.map(p =>
          `  - \`${p.name}\` (${p.type}${p.required ? ', 必需' : ''}): ${p.description}`
        ).join('\n')
      : '  无参数';

    return `
### ${tool.name}
${tool.description}

**参数:**
${paramList}
`;
  }).join('\n');

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
