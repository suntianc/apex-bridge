/**
 * 消息工具函数
 * 用于处理多模态消息和纯文本消息的通用操作
 */

import { Message, ContentPart } from '../types';

/**
 * 提取消息中的纯文本内容
 * @param message 消息对象
 * @returns 纯文本字符串
 */
export function extractTextFromMessage(message: Message): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  // 多模态消息：提取所有文本部分
  if (Array.isArray(message.content)) {
    const textParts = message.content
      .filter((part: ContentPart) => part.type === 'text')
      .map((part: ContentPart) => part.text || '');
    return textParts.join(' ');
  }

  return '';
}

/**
 * 检查消息是否包含图像
 * @param message 消息对象
 * @returns 是否包含图像
 */
export function messageHasImage(message: Message): boolean {
  if (typeof message.content === 'string') {
    return false;
  }

  if (Array.isArray(message.content)) {
    return message.content.some((part: ContentPart) => part.type === 'image_url');
  }

  return false;
}

/**
 * 将消息转换为字符串表示（用于日志等）
 * @param message 消息对象
 * @returns 字符串表示
 */
export function messageToString(message: Message): string {
  const text = extractTextFromMessage(message);
  const hasImage = messageHasImage(message);
  const imageSuffix = hasImage ? ' [包含图像]' : '';
  return `${message.role}: ${text}${imageSuffix}`;
}

/**
 * 类型守卫：检查content是否为字符串
 */
export function isStringContent(message: Message): message is Message & { content: string } {
  return typeof message.content === 'string';
}

/**
 * 类型守卫：检查content是否为ContentPart数组
 */
export function isArrayContent(message: Message): message is Message & { content: ContentPart[] } {
  return Array.isArray(message.content);
}
