/**
 * SurrealDB Conversation Storage Adapter
 *
 * Implements IConversationStorage interface using SurrealDB as the backend.
 */

import { SurrealDBClient } from "./client";
import type { IConversationStorage, ConversationQuery, ConversationMessage } from "../interfaces";
import type { Message } from "../../../types";
import { logger } from "../../../utils/logger";
import { parseStorageIdAsNumber, validatePagination } from "../utils";

const TABLE_CONVERSATIONS = "conversations";
const TABLE_MESSAGES = "conversation_messages";

interface ConversationMessageRecord {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: number;
  metadata?: string;
  [key: string]: unknown;
}

export class SurrealDBConversationStorage implements IConversationStorage {
  private client: SurrealDBClient;

  constructor() {
    this.client = SurrealDBClient.getInstance();
  }

  async get(id: string): Promise<ConversationMessage | null> {
    try {
      const result = await this.client.select<ConversationMessageRecord>(`${TABLE_MESSAGES}:${id}`);
      if (result.length === 0) {
        return null;
      }
      return this.recordToMessage(result[0]);
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to get conversation message:", { id, error });
      throw error;
    }
  }

  async getMany(ids: string[]): Promise<Map<string, ConversationMessage>> {
    const map = new Map<string, ConversationMessage>();
    if (ids.length === 0) {
      return map;
    }

    try {
      const placeholders = ids.map((_, i) => `$id${i}`).join(",");
      const vars: Record<string, unknown> = {};
      ids.forEach((id, i) => {
        vars[`$id${i}`] = `${TABLE_MESSAGES}:${id}`;
      });

      const result = await this.client.query<ConversationMessageRecord[]>(
        `SELECT * FROM ${TABLE_MESSAGES} WHERE id IN [${placeholders}]`,
        vars
      );

      for (const record of result) {
        const message = this.recordToMessage(record);
        map.set(record.id.replace(`${TABLE_MESSAGES}:`, ""), message);
      }

      return map;
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to get many conversation messages:", { ids, error });
      throw error;
    }
  }

  async save(entity: ConversationMessage): Promise<string> {
    const record: ConversationMessageRecord = {
      id: `${TABLE_MESSAGES}:${entity.id}`,
      conversation_id: entity.conversation_id,
      role: entity.role,
      content: entity.content,
      created_at: entity.created_at,
      metadata: entity.metadata,
    };

    try {
      await this.client.create(`${TABLE_MESSAGES}:${entity.id}`, record);
      return String(entity.id);
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to save conversation message:", { id: entity.id, error });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.client.delete(`${TABLE_MESSAGES}:${id}`);
      return true;
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to delete conversation message:", { id, error });
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
    const conditions: string[] = [];
    const vars: Record<string, unknown> = {};

    if (query.conversationId) {
      conditions.push("conversation_id = $conversationId");
      vars["conversationId"] = query.conversationId;
    }

    if (query.role) {
      conditions.push("role = $role");
      vars["role"] = query.role;
    }

    if (query.startTime) {
      conditions.push("created_at >= $startTime");
      vars["startTime"] = query.startTime;
    }

    if (query.endTime) {
      conditions.push("created_at <= $endTime");
      vars["endTime"] = query.endTime;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderClause = "ORDER BY created_at ASC";
    const pagination = validatePagination({ limit: query.limit, offset: query.offset });
    const limitClause = pagination.limit > 0 ? `LIMIT ${pagination.limit}` : "";
    const offsetClause = pagination.offset > 0 ? `OFFSET ${pagination.offset}` : "";

    try {
      const result = await this.client.query<ConversationMessageRecord[]>(
        `SELECT * FROM ${TABLE_MESSAGES} ${whereClause} ${orderClause} ${limitClause} ${offsetClause}`.trim(),
        vars
      );

      return result.map((record) => this.recordToMessage(record));
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to find conversation messages:", { query, error });
      throw error;
    }
  }

  async count(query: ConversationQuery): Promise<number> {
    const conditions: string[] = [];
    const vars: Record<string, unknown> = {};

    if (query.conversationId) {
      conditions.push("conversation_id = $conversationId");
      vars["conversationId"] = query.conversationId;
    }

    if (query.role) {
      conditions.push("role = $role");
      vars["role"] = query.role;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    try {
      const result = await this.client.query<{ count: number }[]>(
        `SELECT count() as count FROM ${TABLE_MESSAGES} ${whereClause}`,
        vars
      );
      return result[0]?.count ?? 0;
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to count conversation messages:", { query, error });
      throw error;
    }
  }

  async getByConversationId(
    conversationId: string,
    limit?: number,
    offset?: number
  ): Promise<ConversationMessage[]> {
    return this.find({ conversationId, limit, offset });
  }

  async getMessageCount(conversationId: string): Promise<number> {
    return this.count({ conversationId });
  }

  async getLastMessage(conversationId: string): Promise<ConversationMessage | null> {
    try {
      const result = await this.client.query<ConversationMessageRecord[]>(
        `SELECT * FROM ${TABLE_MESSAGES} WHERE conversation_id = $conversationId ORDER BY created_at DESC LIMIT 1`,
        { conversationId }
      );
      if (result.length === 0) {
        return null;
      }
      return this.recordToMessage(result[0]);
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to get last message:", { conversationId, error });
      throw error;
    }
  }

  async getFirstMessage(conversationId: string): Promise<ConversationMessage | null> {
    try {
      const result = await this.client.query<ConversationMessageRecord[]>(
        `SELECT * FROM ${TABLE_MESSAGES} WHERE conversation_id = $conversationId ORDER BY created_at ASC LIMIT 1`,
        { conversationId }
      );
      if (result.length === 0) {
        return null;
      }
      return this.recordToMessage(result[0]);
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to get first message:", { conversationId, error });
      throw error;
    }
  }

  async deleteByConversationId(conversationId: string): Promise<number> {
    try {
      const result = await this.client.query<{ id: string }[]>(
        `SELECT id FROM ${TABLE_MESSAGES} WHERE conversation_id = $conversationId`,
        { conversationId }
      );
      const ids = result.map((r) => r.id.replace(`${TABLE_MESSAGES}:`, ""));
      return this.deleteMany(ids);
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to delete by conversationId:", { conversationId, error });
      throw error;
    }
  }

  async deleteBefore(timestamp: number): Promise<number> {
    try {
      const result = await this.client.query<{ id: string }[]>(
        `SELECT id FROM ${TABLE_MESSAGES} WHERE created_at < $timestamp`,
        { timestamp }
      );
      const ids = result.map((r) => r.id.replace(`${TABLE_MESSAGES}:`, ""));
      return this.deleteMany(ids);
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to delete messages before:", { timestamp, error });
      throw error;
    }
  }

  async saveMessages(conversationId: string, messages: Message[]): Promise<void> {
    let idSequence = 0;
    for (const message of messages) {
      const messageId = Date.now() + idSequence;
      idSequence += 1;

      const record: ConversationMessageRecord = {
        id: `${TABLE_MESSAGES}:${messageId}`,
        conversation_id: conversationId,
        role: message.role,
        content:
          typeof message.content === "string" ? message.content : JSON.stringify(message.content),
        created_at: Date.now(),
      };

      await this.client.create(TABLE_MESSAGES, record);
    }
  }

  private recordToMessage(record: ConversationMessageRecord): ConversationMessage {
    const idStr = String(record.id || "").replace(`${TABLE_MESSAGES}:`, "");

    return {
      id: parseStorageIdAsNumber(idStr),
      conversation_id: record.conversation_id,
      role: record.role,
      content: record.content,
      created_at: record.created_at,
      metadata: record.metadata,
    };
  }
}
