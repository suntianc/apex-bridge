/**
 * ABP Protocol Parser
 * 
 * 解析ABP协议格式的工具请求和格式化工具结果
 * 
 * ABP (ApexBridge Protocol) 是一个独立的协议（ABP-only）
 * 解决协议合规问题（CC BY-NC-SA 4.0约束）
 * 
 * @module core/protocol
 */

import {
  ABPToolCall,
  ABPParseResult,
  ABPProtocolConfig,
} from '../../types/abp';
import { logger } from '../../utils/logger';

/**
 * ABP协议解析器默认配置
 */
const DEFAULT_CONFIG: Required<ABPProtocolConfig> = {
  dualProtocolEnabled: false,
  errorRecoveryEnabled: true,
  jsonRepair: {
    enabled: true,
    strict: false,
  },
  noiseStripping: {
    enabled: true,
    aggressive: false,
  },
  boundaryValidation: {
    enabled: true,
    strict: false,
  },
  fallback: {
    enabled: true,
    toPlainText: true,
  },
  variable: {
    cacheEnabled: true,
    cacheTTL: 60000, // 1分钟
  },
};

/**
 * ABP协议解析器实现
 */
export class ABPProtocolParser {
  private config: Required<ABPProtocolConfig>;
  private toolCallIdCounter: number = 0;

  constructor(config?: ABPProtocolConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config } as Required<ABPProtocolConfig>;
  }

  /**
   * 解析工具请求
   * 
   * 解析ABP协议格式的工具调用：
   * [[ABP_TOOL:ToolName]]
   * {
   *   "action": "action_name",
   *   "parameters": { ... }
   * }
   * [[END_ABP_TOOL]]
   * 
   * @param content - AI响应内容
   * @returns 解析结果
   */
  parseToolRequests(content: string): ABPParseResult {
    try {
      // 1. 噪声文本剥离（如果启用）
      let cleanedContent = content;
      if (this.config.noiseStripping?.enabled) {
        cleanedContent = this.stripNoiseText(content);
      }

      // 2. 协议边界校验（如果启用）
      if (this.config.boundaryValidation?.enabled) {
        const validationResult = this.validateBoundaries(cleanedContent);
        if (!validationResult.valid) {
          logger.warn('[ABPProtocolParser] Boundary validation failed:', validationResult.errors);
          if (this.config.boundaryValidation.strict) {
            return this.createErrorResult('Boundary validation failed', content);
          }
        }
      }

      // 3. 提取工具调用块
      const toolCalls = this.extractToolCalls(cleanedContent);

      if (toolCalls.length === 0) {
        // 没有找到工具调用，尝试fallback
        return this.handleFallback(content);
      }

      return {
        success: true,
        toolCalls,
        rawContent: content,
      };
    } catch (error: any) {
      logger.error('[ABPProtocolParser] Parse error:', error);
      return this.handleFallback(content, error.message);
    }
  }

  /**
   * 提取工具调用块
   */
  private extractToolCalls(content: string): ABPToolCall[] {
    const toolCalls: ABPToolCall[] = [];
    const startMarkerRegex = /\[\[ABP_TOOL:([^\]]+)\]\]/g;
    const endMarker = '[[END_ABP_TOOL]]';

    let match;
    while ((match = startMarkerRegex.exec(content)) !== null) {
      const toolName = match[1].trim();
      const startIndex = match.index + match[0].length;
      const endIndex = content.indexOf(endMarker, startIndex);

      if (endIndex === -1) {
        logger.warn(`[ABPProtocolParser] Found start marker for ${toolName} but no end marker`);
        continue;
      }

      // 提取JSON内容
      let jsonContent = content.substring(startIndex, endIndex).trim();

      // 处理多JSON块（取最后一个有效块）
      if (this.config.jsonRepair?.enabled) {
        const jsonBlocks = this.extractMultipleJSONBlocks(jsonContent);
        if (jsonBlocks.length > 0) {
          jsonContent = jsonBlocks[jsonBlocks.length - 1];
        }
      }

      try {
        // 尝试解析JSON
        let jsonData: any;
        try {
          jsonData = JSON.parse(jsonContent);
        } catch (parseError) {
          // JSON解析失败，尝试修复
          if (this.config.jsonRepair?.enabled) {
            const repairedJson = this.repairJSON(jsonContent);
            jsonData = JSON.parse(repairedJson);
          } else {
            throw parseError;
          }
        }

        // 验证JSON结构
        if (!jsonData.action || !jsonData.parameters) {
          logger.warn(`[ABPProtocolParser] Invalid JSON structure for ${toolName}`);
          continue;
        }

        // 创建工具调用
        const toolCall: ABPToolCall = {
          id: this.generateCallId(),
          tool: toolName,
          parameters: jsonData.parameters,
          timestamp: Date.now(),
        };

        toolCalls.push(toolCall);
      } catch (error: any) {
        logger.warn(`[ABPProtocolParser] Failed to parse tool call for ${toolName}:`, error.message);
        // 继续处理下一个工具调用
      }
    }

    return toolCalls;
  }

  /**
   * 噪声文本剥离
   * 
   * 从LLM输出中提取有效的ABP协议块，移除解释性文本
   */
  private stripNoiseText(content: string): string {
    if (!this.config.noiseStripping?.enabled) {
      return content;
    }

    // 1. 识别协议边界标记
    const startMarkerRegex = /\[\[ABP_TOOL:[^\]]+\]\]/g;
    const endMarker = '[[END_ABP_TOOL]]';

    let cleanedContent = '';
    let lastIndex = 0;
    let match;

    while ((match = startMarkerRegex.exec(content)) !== null) {
      const startIndex = match.index;
      const endIndex = content.indexOf(endMarker, startIndex + match[0].length);

      if (endIndex === -1) {
        // 没有找到结束标记，尝试提取到内容末尾
        if (this.config.noiseStripping.aggressive) {
          // 激进模式：提取到内容末尾
          const blockContent = content.substring(startIndex);
          cleanedContent += blockContent;
        }
        break;
      }

      // 提取标记之间的内容
      const blockContent = content.substring(startIndex, endIndex + endMarker.length);
      cleanedContent += blockContent;
      lastIndex = endIndex + endMarker.length;
    }

    // 如果没有找到任何标记，返回原始内容
    if (cleanedContent === '') {
      return content;
    }

    // 2. 提取JSON块（如果启用激进模式）
    if (this.config.noiseStripping.aggressive && cleanedContent.includes('{')) {
      cleanedContent = this.extractJSONBlocks(cleanedContent);
    }

    return cleanedContent;
  }

  /**
   * 提取JSON块
   * 
   * 从文本中提取所有有效的JSON块
   */
  private extractJSONBlocks(content: string): string {
    const jsonBlocks = this.extractMultipleJSONBlocks(content);
    
    // 返回最后一个有效的JSON块（通常是最完整的）
    if (jsonBlocks.length > 0) {
      return jsonBlocks[jsonBlocks.length - 1];
    }

    return content;
  }

  /**
   * 提取多个JSON块
   * 
   * 从文本中提取所有有效的JSON块
   */
  private extractMultipleJSONBlocks(content: string): string[] {
    const jsonBlocks: string[] = [];
    let braceCount = 0;
    let startIndex = -1;
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === '{') {
        if (braceCount === 0) {
          startIndex = i;
        }
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0 && startIndex !== -1) {
          const jsonBlock = content.substring(startIndex, i + 1);
          // 验证JSON块是否有效
          try {
            JSON.parse(jsonBlock);
            jsonBlocks.push(jsonBlock);
          } catch (error) {
            // 无效的JSON块，跳过
          }
          startIndex = -1;
        }
      }
    }

    return jsonBlocks;
  }

  /**
   * 协议边界校验
   */
  private validateBoundaries(content: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const startMarkerRegex = /\[\[ABP_TOOL:([^\]]+)\]\]/g;
    const endMarker = '[[END_ABP_TOOL]]';

    const startMarkers: Array<{ index: number; toolName: string }> = [];
    let match;

    // 收集所有开始标记
    while ((match = startMarkerRegex.exec(content)) !== null) {
      startMarkers.push({
        index: match.index,
        toolName: match[1].trim(),
      });
    }

    // 验证每个开始标记都有对应的结束标记
    for (const startMarker of startMarkers) {
      const startIndex = startMarker.index;
      const endIndex = content.indexOf(endMarker, startIndex);

      if (endIndex === -1) {
        errors.push(`Missing end marker for tool: ${startMarker.toolName}`);
      } else {
        // 检查是否有嵌套（不应该有）
        const nestedStart = content.indexOf('[[ABP_TOOL:', startIndex + 1);
        if (nestedStart !== -1 && nestedStart < endIndex) {
          errors.push(`Nested tool call detected for tool: ${startMarker.toolName}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * JSON修复
   * 
   * 自动修复常见的JSON格式错误：
   * - 补全缺失的括号
   * - 修复未闭合的引号
   * - 添加缺失的逗号
   * - 修复转义字符
   */
  private repairJSON(jsonString: string): string {
    if (!this.config.jsonRepair?.enabled) {
      return jsonString;
    }

    let repaired = jsonString.trim();

    // 1. 移除前导和尾随的非JSON字符（更激进的方式）
    if (this.config.noiseStripping?.aggressive) {
      repaired = repaired.replace(/^[^{\[\]]*/, '');
      repaired = repaired.replace(/[^}\]]*$/, '');
    }

    // 2. 补全缺失的括号（支持嵌套）
    repaired = this.repairBraces(repaired);

    // 3. 修复未闭合的引号
    repaired = this.repairQuotes(repaired);

    // 4. 添加缺失的逗号
    repaired = this.repairCommas(repaired);

    // 5. 修复转义字符（仅在严格模式下）
    if (this.config.jsonRepair?.strict) {
      repaired = this.repairEscapes(repaired);
    }

    // 6. 验证修复后的JSON
    try {
      JSON.parse(repaired);
      return repaired;
    } catch (error) {
      // 修复失败，返回原始内容
      logger.warn('[ABPProtocolParser] JSON repair failed, returning original');
      return jsonString;
    }
  }

  /**
   * 修复括号
   */
  private repairBraces(jsonString: string): string {
    const repaired = jsonString;
    const stack: string[] = [];

    for (let i = 0; i < repaired.length; i++) {
      const char = repaired[i];
      if (char === '{' || char === '[') {
        stack.push(char === '{' ? '}' : ']');
      } else if (char === '}' || char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
        }
      }
    }

    // 补全缺失的闭合括号
    return repaired + stack.reverse().join('');
  }

  /**
   * 修复引号
   */
  private repairQuotes(jsonString: string): string {
    let repaired = jsonString;
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < repaired.length; i++) {
      const char = repaired[i];
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
      }
    }

    // 如果字符串未闭合，添加闭合引号
    if (inString) {
      repaired += '"';
    }

    return repaired;
  }

  /**
   * 修复逗号
   */
  private repairCommas(jsonString: string): string {
    // 在对象和数组的键值对之间添加缺失的逗号
    let repaired = jsonString;
    
    // 匹配模式：值后跟新键（缺少逗号）
    // 例如: "key1": "value1" "key2": "value2"
    repaired = repaired.replace(/("(?:[^"\\]|\\.)*")\s*("(?:[^"\\]|\\.)*"\s*:)/g, '$1, $2');
    
    // 匹配模式：值后跟新值（在数组中）
    // 例如: "value1" "value2"
    repaired = repaired.replace(/(\])\s*("(?:[^"\\]|\\.)*")/g, '$1, $2');
    
    return repaired;
  }

  /**
   * 修复转义字符
   */
  private repairEscapes(jsonString: string): string {
    // 修复常见的转义字符错误
    let repaired = jsonString;
    
    // 修复未转义的换行符
    repaired = repaired.replace(/([^\\])\n/g, '$1\\n');
    
    // 修复未转义的制表符
    repaired = repaired.replace(/([^\\])\t/g, '$1\\t');
    
    return repaired;
  }

  /**
   * 处理Fallback
   */
  private handleFallback(content: string, error?: string): ABPParseResult {
    if (this.config.fallback?.enabled) {
      if (this.config.fallback.toPlainText) {
        // Fallback到纯文本响应
        logger.debug('[ABPProtocolParser] Falling back to plain text response');
        return {
          success: false,
          toolCalls: [],
          error: error || 'ABP parsing failed',
          rawContent: content,
          fallback: 'plain-text',
        };
      }
    }

    return this.createErrorResult(error || 'ABP parsing failed', content);
  }

  /**
   * 创建错误结果
   */
  private createErrorResult(error: string, rawContent: string): ABPParseResult {
    return {
      success: false,
      toolCalls: [],
      error,
      rawContent,
    };
  }

  /**
   * 生成调用ID
   */
  private generateCallId(): string {
    this.toolCallIdCounter++;
    return `abp_call_${Date.now()}_${this.toolCallIdCounter}`;
  }

  /**
   * 格式化工具结果
   * 
   * 将工具执行结果格式化为ABP协议格式
   * 
   * @param toolResult - 工具执行结果
   * @returns 格式化后的文本
   */
  formatToolResult(toolResult: { id: string; result: any; error?: string }): string {
    if (toolResult.error) {
      return `Tool execution failed: ${toolResult.error}`;
    }

    return JSON.stringify(toolResult.result, null, 2);
  }
}

