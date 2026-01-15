/**
 * SQLite Conversation Storage Adapter
 *
 * Implements IConversationStorage interface using better-sqlite3.
 * This is the concrete implementation that ConversationHistoryService depends on.
 */

import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import type { IConversationStorage, ConversationQuery, ConversationMessage } from "../interfaces";
import type { Message } from "../../../types";
import { logger } from "../../../utils/logger";
import { PathService } from "../../../services/PathService";

export class SQLiteConversationStorage implements IConversationStorage {
  private db: Database.Database;
  private dbPath: string;

  constructor() {
    const pathService = PathService.getInstance();
    const dataDir = pathService.getDataDir();

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = path.join(dataDir, "conversation_history.db");
    this.db = new Database(this.dbPath);

    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    this.initializeDatabase();
    logger.debug(`SQLiteConversationStorage initialized (database: ${this.dbPath})`);
  }

  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_conversation_id ON conversation_messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_conversation_created ON conversation_messages(conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_created_at ON conversation_messages(created_at);
    `);

    logger.debug("✅ Conversation history tables initialized");
  }

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

  async get(id: string): Promise<ConversationMessage | null> {
    try {
      const messages = await this.getByConversationId(id, 1, 0);
      return messages[0] ?? null;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to get conversation message:", { id, error });
      throw error;
    }
  }

  async getMany(ids: string[]): Promise<Map<string, ConversationMessage>> {
    const map = new Map<string, ConversationMessage>();
    if (ids.length === 0) {
      return map;
    }

    try {
      for (const id of ids) {
        const messages = await this.getByConversationId(id, 1, 0);
        if (messages.length > 0) {
          map.set(id, messages[0]);
        }
      }
      return map;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to get many conversation messages:", { ids, error });
      throw error;
    }
  }

  async save(entity: ConversationMessage): Promise<string> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO conversation_messages (conversation_id, role, content, created_at, metadata)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(
        entity.conversation_id,
        entity.role,
        entity.content,
        entity.created_at,
        entity.metadata
      );
      return String(entity.id);
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to save conversation message:", { id: entity.id, error });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.deleteByConversationId(id);
      return true;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to delete conversation message:", { id, error });
      return false;
    }
  }

  async deleteMany(ids: string[]): Promise<number> {
    let deleted = 0;
    for (const id of ids) {
      if (await this.delete(id)) {
        deleted++;
      }
    }
    return deleted;
  }

  async find(query: ConversationQuery): Promise<ConversationMessage[]> {
    try {
      if (query.conversationId) {
        return await this.getByConversationId(
          query.conversationId,
          query.limit || 100,
          query.offset || 0
        );
      }
      return [];
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to find conversation messages:", { query, error });
      throw error;
    }
  }

  async count(query: ConversationQuery): Promise<number> {
    try {
      if (query.conversationId) {
        return await this.getMessageCount(query.conversationId);
      }
      return 0;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to count conversation messages:", { query, error });
      throw error;
    }
  }

  async getByConversationId(
    conversationId: string,
    limit?: number,
    offset?: number
  ): Promise<ConversationMessage[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT id, conversation_id, role, content, created_at, metadata
        FROM conversation_messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
        LIMIT ? OFFSET ?
      `);

      const rows = stmt.all(conversationId, limit || 100, offset || 0) as ConversationMessage[];
      return rows;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to get messages by conversationId:", { conversationId, error });
      throw error;
    }
  }

  async getMessageCount(conversationId: string): Promise<number> {
    try {
      const stmt = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM conversation_messages
        WHERE conversation_id = ?
      `);

      const result = stmt.get(conversationId) as { count: number };
      return result.count;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to get message count:", { conversationId, error });
      throw error;
    }
  }

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
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to get last message:", { conversationId, error });
      throw error;
    }
  }

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
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to get first message:", { conversationId, error });
      throw error;
    }
  }

  async deleteByConversationId(conversationId: string): Promise<number> {
    try {
      const count = await this.getMessageCount(conversationId);
      const stmt = this.db.prepare(`
        DELETE FROM conversation_messages
        WHERE conversation_id = ?
      `);

      stmt.run(conversationId);
      return count;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to delete by conversationId:", { conversationId, error });
      throw error;
    }
  }

  async deleteBefore(timestamp: number): Promise<number> {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM conversation_messages
        WHERE created_at < ?
      `);

      const result = stmt.run(timestamp);
      return result.changes;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to delete messages before:", { timestamp, error });
      throw error;
    }
  }

  async saveMessages(conversationId: string, messages: Message[]): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO conversation_messages (conversation_id, role, content, created_at, metadata)
        VALUES (?, ?, ?, ?, ?)
      `);

      const insertMany = this.db.transaction((msgs: Message[]) => {
        for (const msg of msgs) {
          const metadata = msg.metadata ? JSON.stringify(msg.metadata) : null;
          const contentToStore = this.formatMultimodalContent(msg.content);
          stmt.run(conversationId, msg.role, contentToStore, Date.now(), metadata);
        }
      });

      insertMany(messages);
      logger.debug(
        `[SQLite] Saved ${messages.length} messages for conversation: ${conversationId}`
      );
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to save messages:", { conversationId, error });
      throw error;
    }
  }

  close(): void {
    this.db.close();
    logger.info("✅ SQLiteConversationStorage database closed");
  }
}
