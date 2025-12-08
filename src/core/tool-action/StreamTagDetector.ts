/**
 * StreamTagDetector - 流式标签检测器
 *
 * 在流式输出中实时检测 <tool_action> 标签
 * 使用状态机模式处理跨 chunk 的标签检测
 */

import type { ToolActionCall, DetectionResult } from './types';
import { DetectorState } from './types';
import { ToolActionParser } from './ToolActionParser';

export class StreamTagDetector {
  private buffer: string = '';
  private state: DetectorState = DetectorState.NORMAL;
  private parser: ToolActionParser;

  // 标签标识符
  private static readonly OPEN_TAG_START = '<tool_action';
  private static readonly CLOSE_TAG = '</tool_action>';

  constructor() {
    this.parser = new ToolActionParser();
  }

  /**
   * 处理流式输入的文本块
   * @param chunk 输入的文本块
   * @returns 检测结果
   */
  processChunk(chunk: string): DetectionResult {
    // 将新 chunk 添加到缓冲区
    this.buffer += chunk;

    // 根据当前状态处理
    switch (this.state) {
      case DetectorState.NORMAL:
        return this.handleNormalState();

      case DetectorState.TAG_OPENING:
      case DetectorState.TAG_CONTENT:
        return this.handleTagState();

      default:
        return this.handleNormalState();
    }
  }

  /**
   * 处理正常状态（无标签检测中）
   */
  private handleNormalState(): DetectionResult {
    const openTagIndex = this.buffer.indexOf(StreamTagDetector.OPEN_TAG_START);

    // 没有检测到完整的标签开始
    if (openTagIndex === -1) {
      // 检查缓冲区末尾是否可能是标签开始的一部分
      const safeOutputEnd = this.findPotentialTagStart();

      if (safeOutputEnd < this.buffer.length) {
        // 缓冲区末尾可能是标签开始的一部分，只输出安全部分
        const textToEmit = safeOutputEnd > 0 ? this.buffer.slice(0, safeOutputEnd) : '';
        this.buffer = this.buffer.slice(safeOutputEnd);

        return {
          complete: false,
          textToEmit,
          bufferRemainder: this.buffer
        };
      }

      // 没有潜在的标签开始，安全输出全部内容
      const textToEmit = this.buffer;
      this.buffer = '';

      return {
        complete: false,
        textToEmit,
        bufferRemainder: ''
      };
    }

    // 检测到标签开始
    this.state = DetectorState.TAG_OPENING;

    // 输出标签开始前的文本
    const textToEmit = this.buffer.slice(0, openTagIndex);
    this.buffer = this.buffer.slice(openTagIndex);

    // 继续检查是否有完整标签
    return this.handleTagState(textToEmit);
  }

  /**
   * 处理标签状态（标签检测中）
   */
  private handleTagState(previousText: string = ''): DetectionResult {
    // 检查是否有完整的闭合标签
    const closeTagIndex = this.buffer.indexOf(StreamTagDetector.CLOSE_TAG);

    if (closeTagIndex === -1) {
      // 标签还未完整，继续缓冲
      this.state = DetectorState.TAG_CONTENT;

      return {
        complete: false,
        textToEmit: previousText,
        bufferRemainder: this.buffer
      };
    }

    // 找到完整标签
    const tagEndIndex = closeTagIndex + StreamTagDetector.CLOSE_TAG.length;
    const fullTagText = this.buffer.slice(0, tagEndIndex);

    // 解析标签
    const toolAction = this.parser.parseSingleTag(fullTagText);

    if (!toolAction) {
      // 解析失败，作为普通文本处理
      this.state = DetectorState.NORMAL;
      const textToEmit = previousText + this.buffer.slice(0, tagEndIndex);
      this.buffer = this.buffer.slice(tagEndIndex);

      return {
        complete: false,
        textToEmit,
        bufferRemainder: this.buffer
      };
    }

    // 解析成功
    this.state = DetectorState.NORMAL;
    const remainingText = this.buffer.slice(tagEndIndex);
    this.buffer = remainingText;

    return {
      complete: true,
      toolAction,
      textToEmit: previousText,
      bufferRemainder: remainingText
    };
  }

  /**
   * 查找缓冲区末尾可能的标签开始
   * 返回安全输出的位置（0 表示整个缓冲区都可能是标签开始）
   */
  private findPotentialTagStart(): number {
    const tag = StreamTagDetector.OPEN_TAG_START; // '<tool_action'

    // 从缓冲区末尾向前检查是否有部分匹配
    // 例如: buffer = "text<too" -> 应该返回 4 (保留 "<too")
    // 例如: buffer = "<tool_" -> 应该返回 0 (保留整个缓冲区)
    for (let matchLen = Math.min(tag.length - 1, this.buffer.length); matchLen >= 1; matchLen--) {
      const suffix = this.buffer.slice(-matchLen);
      const prefix = tag.slice(0, matchLen);
      if (suffix === prefix) {
        // 找到匹配，返回安全输出位置
        return this.buffer.length - matchLen;
      }
    }

    // 没有找到潜在的标签开始，可以输出整个缓冲区
    return this.buffer.length;
  }

  /**
   * 重置检测器状态
   */
  reset(): void {
    this.buffer = '';
    this.state = DetectorState.NORMAL;
  }

  /**
   * 强制刷新缓冲区（流结束时调用）
   * @returns 缓冲区中剩余的文本
   */
  flush(): string {
    const remaining = this.buffer;
    this.reset();
    return remaining;
  }

  /**
   * 获取当前状态
   */
  getState(): DetectorState {
    return this.state;
  }

  /**
   * 获取当前缓冲区内容
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * 检查是否在标签检测中
   */
  isDetecting(): boolean {
    return this.state !== DetectorState.NORMAL;
  }
}
