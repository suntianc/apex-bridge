/**
 * ConversationHistoryService - 对话消息历史管理服务
 * 负责存储、查询和删除对话消息历史
 */

import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import { logger } from "../utils/logger";
import { PathService } from "./PathService";
import { Message } from "../types";

export interface ConversationMessage {
  id: number;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: number;
  metadata?: string; // JSON string for additional metadata
}

/**
 * 对话历史服务
 */
export class ConversationHistoryService {
  private static instance: ConversationHistoryService;
  private db: Database.Database;
  private dbPath: string;

  private constructor() {
    const pathService = PathService.getInstance();
    const dataDir = pathService.getDataDir();

    // 确保数据目录存在
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = path.join(dataDir, "conversation_history.db");
    this.db = new Database(this.dbPath);

    // 启用 WAL 模式提升性能
    this.db.pragma("journal_mode = WAL");
    // 启用外键约束
    this.db.pragma("foreign_keys = ON");

    this.initializeDatabase();
    logger.debug(`ConversationHistoryService initialized (database: ${this.dbPath})`);
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
   * 初始化数据库表结构
   */
  private initializeDatabase(): void {
    this.db.exec(`
      -- 对话消息表
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        metadata TEXT
      );

      -- 创建索引以提升查询性能
      CREATE INDEX IF NOT EXISTS idx_conversation_id ON conversation_messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_conversation_created ON conversation_messages(conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_created_at ON conversation_messages(created_at);
    `);

    logger.debug("✅ Conversation history tables initialized");
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
          // 提取图片URL
          let imageUrl: string = "";
          if (typeof part.image_url === "string") {
            imageUrl = part.image_url;
          } else if (part.image_url?.url) {
            imageUrl = part.image_url.url;
          }

          if (imageUrl) {
            // 使用XML标签包裹图片，方便后续解析和渲染
            parts.push(`<img>${imageUrl}</img>`);
          }
        }
      }

      return parts.join("\n");
    }

    // 其他类型（如对象），回退到JSON序列化
    return JSON.stringify(content);
  }

  /**
   * 保存消息到历史记录
   * @param conversationId 对话ID
   * @param messages 消息列表
   */
  async saveMessages(conversationId: string, messages: Message[]): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO conversation_messages (conversation_id, role, content, created_at, metadata)
        VALUES (?, ?, ?, ?, ?)
      `);

      const insertMany = this.db.transaction((msgs: Message[]) => {
        for (const msg of msgs) {
          // Message 类型可能没有 metadata 属性，使用类型断言或可选链
          const metadata = (msg as any).metadata ? JSON.stringify((msg as any).metadata) : null;

          // 🐾 格式化多模态消息内容
          const contentToStore = this.formatMultimodalContent(msg.content);

          stmt.run(conversationId, msg.role, contentToStore, Date.now(), metadata);
        }
      });

      insertMany(messages);
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
      const stmt = this.db.prepare(`
        SELECT id, conversation_id, role, content, created_at, metadata
        FROM conversation_messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
        LIMIT ? OFFSET ?
      `);

      const rows = stmt.all(conversationId, limit, offset) as ConversationMessage[];
      return rows;
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
      const stmt = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM conversation_messages
        WHERE conversation_id = ?
      `);

      const result = stmt.get(conversationId) as { count: number };
      return result.count;
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
      const stmt = this.db.prepare(`
        DELETE FROM conversation_messages
        WHERE conversation_id = ?
      `);

      const result = stmt.run(conversationId);
      logger.info(
        `[ConversationHistory] Deleted ${result.changes} messages for conversation: ${conversationId}`
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
      const stmt = this.db.prepare(`
        DELETE FROM conversation_messages
        WHERE created_at < ?
      `);

      const result = stmt.run(beforeTimestamp);
      logger.info(
        `[ConversationHistory] Deleted ${result.changes} messages before ${new Date(beforeTimestamp).toISOString()}`
      );
      return result.changes;
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
      const stmt = this.db.prepare(`
        SELECT conversation_id, MAX(created_at) as last_message_at
        FROM conversation_messages
        GROUP BY conversation_id
        ORDER BY last_message_at DESC
      `);

      const rows = stmt.all() as Array<{ conversation_id: string; last_message_at: number }>;
      return rows.map((row) => row.conversation_id);
    } catch (error) {
      logger.error("❌ Failed to get all conversation IDs:", error);
      throw error;
    }
  }

  /**
   * 获取对话的最后一条消息
   * @param conversationId 对话ID
   * @returns 最后一条消息或null
   */
  async getLastMessage(conversationId: string): Promise<ConversationMessage | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT id, conversation_id, role, content, created_at, metadata
        FROM conversation_messages
        WHERE conversation_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `);

      const row = stmt.get(conversationId) as ConversationMessage | undefined;
      return row || null;
    } catch (error: any) {
      logger.error(`[ConversationHistory] Failed to get last message: ${error.message}`);
      return null;
    }
  }

  /**
   * 获取对话的第一条消息
   * @param conversationId 对话ID
   * @returns 第一条消息或null
   */
  async getFirstMessage(conversationId: string): Promise<ConversationMessage | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT id, conversation_id, role, content, created_at, metadata
        FROM conversation_messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
        LIMIT 1
      `);

      const row = stmt.get(conversationId) as ConversationMessage | undefined;
      return row || null;
    } catch (error: any) {
      logger.error(`[ConversationHistory] Failed to get first message: ${error.message}`);
      return null;
    }
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
    logger.info("✅ ConversationHistoryService database closed");
  }
}
