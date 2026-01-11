/**
 * ToolActionParser - <tool_action> 标签解析器
 *
 * 解析 LLM 输出中的 tool_action 标签格式工具调用
 * 标签格式:
 *   <tool_action name="工具名称" type="skill|mcp|builtin">
 *     <参数名 value="参数值" />
 *   </tool_action>
 */

import { ToolActionCall, ParseResult, TextSegment, ToolType } from "./types";
import { logger } from "../../utils/logger";

export class ToolActionParser {
  // 最大输入长度限制（防止 ReDoS 攻击）
  private static readonly MAX_INPUT_LENGTH = 50000;

  // 匹配完整的 action 标签（支持 tool_action 向后兼容）
  // 使用非贪婪匹配并添加长度限制，防止 ReDoS
  private static readonly TAG_REGEX =
    /<(action|tool_action)\s+name="([^"]{1,1000})"(?:\s+type="([^"]{1,100})")?\s*>([\s\S]{0,5000})<\/\1>/g;

  // 匹配参数子标签 - 支持两种格式:
  // 1. 自闭合: <param value="xxx" />
  // 2. 标准闭合: <param value="xxx"></param>
  private static readonly PARAM_REGEX =
    /<(\w{1,100})\s+value="([^"]{0,5000})"(?:\s*\/>|\s*><\/\1>)/g;

  // 检测未闭合的标签开始 - 更宽松的匹配
  private static readonly PENDING_TAG_REGEX = /<(action|tool_action)[^>]*>/;

  /**
   * 解析文本中的所有工具调用
   * @param text 要解析的文本
   * @returns 解析结果
   */
  parse(text: string): ParseResult {
    // 输入长度验证（防止 ReDoS 攻击）
    if (!text || typeof text !== "string" || text.length > ToolActionParser.MAX_INPUT_LENGTH) {
      logger.warn(`[ToolActionParser] Input too long or invalid: ${text?.length ?? 0} chars`);
      return { toolCalls: [], textSegments: [], pendingText: "" };
    }

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
          endIndex: startIndex,
        });
      }

      // 解析参数
      const parameters = this.extractParameters(content);

      // L-001 修复：使用公共方法解析工具类型
      const type = ToolActionParser.parseToolType(toolType);

      toolCalls.push({
        name: toolName,
        type,
        parameters,
        rawText: fullMatch,
        startIndex,
        endIndex,
      });

      lastIndex = endIndex;
    }

    // 收集最后一段文本
    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex);

      // 检查是否有未完成的标签（有开始但没有结束）
      if (this.hasPendingTag(remainingText)) {
        const openTagIndex = remainingText.indexOf("<tool_action");

        // 未完成标签前的文本
        if (openTagIndex > 0) {
          textSegments.push({
            content: remainingText.slice(0, openTagIndex),
            startIndex: lastIndex,
            endIndex: lastIndex + openTagIndex,
          });
        }

        return {
          toolCalls,
          textSegments,
          pendingText: remainingText.slice(openTagIndex >= 0 ? openTagIndex : 0),
        };
      }

      textSegments.push({
        content: remainingText,
        startIndex: lastIndex,
        endIndex: text.length,
      });
    }

    return {
      toolCalls,
      textSegments,
      pendingText: "",
    };
  }

  /**
   * 检测文本中是否有未完成的标签
   * @param text 要检测的文本
   * @returns 是否有未完成标签
   */
  hasPendingTag(text: string): boolean {
    // 检查是否有 <tool_action 开始但没有 </tool_action> 结束
    const openTagIndex = text.lastIndexOf("<tool_action");
    if (openTagIndex === -1) {
      return false;
    }

    const closeTagIndex = text.indexOf("</tool_action>", openTagIndex);
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
   * L-001 修复：提取公共方法，消除代码重复
   * 验证并解析工具类型
   */
  private static parseToolType(toolType: string | undefined): ToolType {
    if (!toolType) {
      return ToolType.BUILTIN;
    }

    const validTypes = Object.values(ToolType);
    if (validTypes.includes(toolType as ToolType)) {
      return toolType as ToolType;
    }

    logger.warn(`[ToolActionParser] Invalid tool type: ${toolType}, using default: builtin`);
    return ToolType.BUILTIN;
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

    // L-001 修复：使用公共方法解析工具类型
    const type = ToolActionParser.parseToolType(toolType);

    return {
      name: toolName,
      type,
      parameters,
      rawText: fullMatch,
      startIndex: 0,
      endIndex: fullMatch.length,
    };
  }

  /**
   * 验证工具调用格式是否正确
   * @param toolAction 工具调用对象
   * @returns 是否有效
   */
  isValidToolAction(toolAction: ToolActionCall): boolean {
    return (
      typeof toolAction.name === "string" &&
      toolAction.name.length > 0 &&
      typeof toolAction.parameters === "object"
    );
  }
}

// 导出单例实例
export const toolActionParser = new ToolActionParser();
