/**
 * ConversationHistoryService - 对话消息历史管理服务
 * 负责存储、查询和删除对话消息历史
 */

import type { IConversationStorage, ConversationMessage } from "../core/storage/interfaces";
import { SQLiteConversationStorage } from "../core/storage/sqlite/conversation";
import { logger } from "../utils/logger";
import type { Message } from "../types";

export { ConversationMessage };

/**
 * 对话历史服务
 */
export class ConversationHistoryService {
  private static instance: ConversationHistoryService;
  private storage: IConversationStorage;

  private constructor() {
    this.storage = new SQLiteConversationStorage();
    logger.debug("[ConversationHistoryService] Initialized with SQLiteConversationStorage adapter");
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): ConversationHistoryService {
    if (!ConversationHistoryService.instance) {
      ConversationHistoryService.instance = new ConversationHistoryService();
    }
    return ConversationHistoryService.instance;
  }

  /**
   * 格式化多模态消息内容为可读格式
   * 将 content 数组转换为 "文本内容\n<img>base64...</img>\n<img>base64...</img>"
   */
  private formatMultimodalContent(content: string | any[]): string {
    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      const parts: string[] = [];

      for (const part of content) {
        if (part.type === "text" && part.text) {
          parts.push(part.text);
        } else if (part.type === "image_url") {
          let imageUrl: string = "";
          if (typeof part.image_url === "string") {
            imageUrl = part.image_url;
          } else if (part.image_url?.url) {
            imageUrl = part.image_url.url;
          }

          if (imageUrl) {
            parts.push(`<img>${imageUrl}</img>`);
          }
        }
      }

      return parts.join("\n");
    }

    return JSON.stringify(content);
  }

  /**
   * 保存消息到历史记录
   * @param conversationId 对话ID
   * @param messages 消息列表
   */
  async saveMessages(conversationId: string, messages: Message[]): Promise<void> {
    try {
      const formattedMessages = messages.map((msg) => ({
        ...msg,
        content: this.formatMultimodalContent(msg.content),
      }));
      await this.storage.saveMessages(conversationId, formattedMessages);
      logger.debug(
        `[ConversationHistory] Saved ${messages.length} messages for conversation: ${conversationId}`
      );
    } catch (error: any) {
      logger.error(`[ConversationHistory] Failed to save messages: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取对话消息历史
   * @param conversationId 对话ID
   * @param limit 限制返回数量，默认 100
   * @param offset 偏移量，默认 0
   * @returns 消息列表
   */
  async getMessages(
    conversationId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<ConversationMessage[]> {
    try {
      return await this.storage.getByConversationId(conversationId, limit, offset);
    } catch (error: any) {
      logger.error(`[ConversationHistory] Failed to get messages: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取对话消息总数
   * @param conversationId 对话ID
   * @returns 消息总数
   */
  async getMessageCount(conversationId: string): Promise<number> {
    try {
      return await this.storage.getMessageCount(conversationId);
    } catch (error: any) {
      logger.error(`[ConversationHistory] Failed to get message count: ${error.message}`);
      throw error;
    }
  }

  /**
   * 删除对话的所有消息历史
   * @param conversationId 对话ID
   */
  async deleteMessages(conversationId: string): Promise<void> {
    try {
      const count = await this.storage.deleteByConversationId(conversationId);
      logger.info(
        `[ConversationHistory] Deleted ${count} messages for conversation: ${conversationId}`
      );
    } catch (error: any) {
      logger.error(`[ConversationHistory] Failed to delete messages: ${error.message}`);
      throw error;
    }
  }

  /**
   * 删除指定时间之前的消息（用于清理旧数据）
   * @param beforeTimestamp 时间戳（毫秒）
   * @returns 删除的消息数量
   */
  async deleteMessagesBefore(beforeTimestamp: number): Promise<number> {
    try {
      const count = await this.storage.deleteBefore(beforeTimestamp);
      logger.info(
        `[ConversationHistory] Deleted ${count} messages before ${new Date(beforeTimestamp).toISOString()}`
      );
      return count;
    } catch (error: any) {
      logger.error(`[ConversationHistory] Failed to delete old messages: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取所有有消息历史的对话ID
   * @returns conversation_id 列表，按最后消息时间倒序排列
   */
  async getAllConversationIds(): Promise<string[]> {
    try {
      const messages = await this.storage.find({});
      const conversationMap = new Map<string, number>();

      for (const msg of messages) {
        const existing = conversationMap.get(msg.conversation_id);
        if (!existing || msg.created_at > existing) {
          conversationMap.set(msg.conversation_id, msg.created_at);
        }
      }

      return Array.from(conversationMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);
    } catch (error) {
      logger.error("❌ Failed to get all conversation IDs:", error);
      throw error;
    }
  }

  /**
   * 获取对话的最后一条消息
   * @param conversationId 对话ID
   * @returns 最后一条消息或null（如果不存在）
   * @throws {Error} 数据库错误时抛出错误
   */
  async getLastMessage(conversationId: string): Promise<ConversationMessage | null> {
    try {
      return await this.storage.getLastMessage(conversationId);
    } catch (error: any) {
      logger.error(`[ConversationHistory] Failed to get last message: ${error.message}`);
      throw new Error(
        `Failed to get last message for conversation ${conversationId}: ${error.message}`
      );
    }
  }

  /**
   * 获取对话的第一条消息
   * @param conversationId 对话ID
   * @returns 第一条消息或null（如果不存在）
   * @throws {Error} 数据库错误时抛出错误
   */
  async getFirstMessage(conversationId: string): Promise<ConversationMessage | null> {
    try {
      return await this.storage.getFirstMessage(conversationId);
    } catch (error: any) {
      logger.error(`[ConversationHistory] Failed to get first message: ${error.message}`);
      throw new Error(
        `Failed to get first message for conversation ${conversationId}: ${error.message}`
      );
    }
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (typeof (this.storage as any).close === "function") {
      (this.storage as any).close();
      logger.info("[ConversationHistoryService] database closed");
    }
  }
}
