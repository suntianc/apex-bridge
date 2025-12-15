/**
 * ToolActionParser - <tool_action> 标签解析器
 *
 * 解析 LLM 输出中的 tool_action 标签格式工具调用
 * 标签格式:
 *   <tool_action name="工具名称" type="skill|mcp|builtin">
 *     <参数名 value="参数值" />
 *   </tool_action>
 */

import { ToolActionCall, ParseResult, TextSegment, ToolType } from './types';
import { logger } from '../../utils/logger';

export class ToolActionParser {
  // 匹配完整的 action 标签（支持 tool_action 向后兼容）
  private static readonly TAG_REGEX =
    /<(action|tool_action)\s+name="([^"]+)"(?:\s+type="([^"]+)")?\s*>([\s\S]*?)<\/\1>/g;

  // 匹配参数子标签 - 支持两种格式:
  // 1. 自闭合: <param value="xxx" />
  // 2. 标准闭合: <param value="xxx"></param>
  private static readonly PARAM_REGEX =
    /<(\w+)\s+value="([^"]*)"(?:\s*\/>|\s*><\/\1>)/g;

  // 检测未闭合的标签开始 - 更宽松的匹配
  private static readonly PENDING_TAG_REGEX = /<(action|tool_action)[^>]*>/;

  /**
   * 解析文本中的所有工具调用
   * @param text 要解析的文本
   * @returns 解析结果
   */
  parse(text: string): ParseResult {
    const toolCalls: ToolActionCall[] = [];
    const textSegments: TextSegment[] = [];

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    // 重置正则表达式状态
    ToolActionParser.TAG_REGEX.lastIndex = 0;

    while ((match = ToolActionParser.TAG_REGEX.exec(text)) !== null) {
      const [fullMatch, tagName, toolName, toolType, content] = match;
      const startIndex = match.index;
      const endIndex = startIndex + fullMatch.length;

      // 收集标签前的文本
      if (startIndex > lastIndex) {
        textSegments.push({
          content: text.slice(lastIndex, startIndex),
          startIndex: lastIndex,
          endIndex: startIndex
        });
      }

      // 解析参数
      const parameters = this.extractParameters(content);

      // 确定工具类型（默认为 builtin，如果明确指定则使用指定类型）
      let type: ToolType = ToolType.BUILTIN;
      if (toolType) {
        // 验证类型有效性
        const validTypes = Object.values(ToolType);
        if (validTypes.includes(toolType as ToolType)) {
          type = toolType as ToolType;
        } else {
          logger.warn(`[ToolActionParser] Invalid tool type: ${toolType}, using default: builtin`);
        }
      }

      toolCalls.push({
        name: toolName,
        type,
        parameters,
        rawText: fullMatch,
        startIndex,
        endIndex
      });

      lastIndex = endIndex;
    }

    // 收集最后一段文本
    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex);

      // 检查是否有未完成的标签（有开始但没有结束）
      if (this.hasPendingTag(remainingText)) {
        const openTagIndex = remainingText.indexOf('<tool_action');

        // 未完成标签前的文本
        if (openTagIndex > 0) {
          textSegments.push({
            content: remainingText.slice(0, openTagIndex),
            startIndex: lastIndex,
            endIndex: lastIndex + openTagIndex
          });
        }

        return {
          toolCalls,
          textSegments,
          pendingText: remainingText.slice(openTagIndex >= 0 ? openTagIndex : 0)
        };
      }

      textSegments.push({
        content: remainingText,
        startIndex: lastIndex,
        endIndex: text.length
      });
    }

    return {
      toolCalls,
      textSegments,
      pendingText: ''
    };
  }

  /**
   * 检测文本中是否有未完成的标签
   * @param text 要检测的文本
   * @returns 是否有未完成标签
   */
  hasPendingTag(text: string): boolean {
    // 检查是否有 <tool_action 开始但没有 </tool_action> 结束
    const openTagIndex = text.lastIndexOf('<tool_action');
    if (openTagIndex === -1) {
      return false;
    }

    const closeTagIndex = text.indexOf('</tool_action>', openTagIndex);
    return closeTagIndex === -1;
  }

  /**
   * 从标签内容中提取参数
   * @param content 标签内部内容
   * @returns 参数键值对
   */
  private extractParameters(content: string): Record<string, string> {
    const parameters: Record<string, string> = {};

    // 重置正则表达式状态
    ToolActionParser.PARAM_REGEX.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = ToolActionParser.PARAM_REGEX.exec(content)) !== null) {
      const [, paramName, paramValue] = match;
      parameters[paramName] = paramValue;
    }

    return parameters;
  }

  /**
   * 解析单个工具调用标签
   * @param tagText 完整的标签文本
   * @returns 工具调用对象或 null
   */
  parseSingleTag(tagText: string): ToolActionCall | null {
    // 重置正则表达式状态
    ToolActionParser.TAG_REGEX.lastIndex = 0;

    const match = ToolActionParser.TAG_REGEX.exec(tagText);
    if (!match) {
      return null;
    }

    const [fullMatch, tagName, toolName, toolType, content] = match;
    const parameters = this.extractParameters(content);

    // 确定工具类型
    let type: ToolType = ToolType.BUILTIN;
    if (toolType) {
      const validTypes = Object.values(ToolType);
      if (validTypes.includes(toolType as ToolType)) {
        type = toolType as ToolType;
      } else {
        logger.warn(`[ToolActionParser] Invalid tool type: ${toolType}, using default: builtin`);
      }
    }

    return {
      name: toolName,
      type,
      parameters,
      rawText: fullMatch,
      startIndex: 0,
      endIndex: fullMatch.length
    };
  }

  /**
   * 验证工具调用格式是否正确
   * @param toolAction 工具调用对象
   * @returns 是否有效
   */
  isValidToolAction(toolAction: ToolActionCall): boolean {
    return (
      typeof toolAction.name === 'string' &&
      toolAction.name.length > 0 &&
      typeof toolAction.parameters === 'object'
    );
  }
}

// 导出单例实例
export const toolActionParser = new ToolActionParser();
