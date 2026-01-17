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
import {
  SurrealDBErrorCode,
  isSurrealDBError,
  wrapSurrealDBError,
} from "../../../utils/surreal-error";

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
  private connecting = false;

  constructor() {
    this.client = SurrealDBClient.getInstance();
  }

  /**
   * Ensure connected to SurrealDB with lazy initialization
   */
  private async ensureConnected(): Promise<void> {
    if (this.client.isConnected()) {
      return;
    }

    if (this.connecting) {
      // Wait for other connection attempt
      await new Promise((resolve) => setTimeout(resolve, 100));
      return this.ensureConnected();
    }

    this.connecting = true;
    try {
      const url = process.env.SURREALDB_URL || "ws://localhost:8000/rpc";
      const user = process.env.SURREALDB_USER || "root";
      const pass = process.env.SURREALDB_PASS || "root";
      const ns = process.env.SURREALDB_NAMESPACE || "apexbridge";
      const db = process.env.SURREALDB_DATABASE || "staging";

      await this.client.connect({
        url,
        username: user,
        password: pass,
        namespace: ns,
        database: db,
        timeout: 10000,
        maxRetries: 3,
      });
    } finally {
      this.connecting = false;
    }
  }

  async get(id: string): Promise<ConversationMessage | null> {
    try {
      const fullId = `${TABLE_MESSAGES}:${id}`;
      const result = await this.client.selectById<ConversationMessageRecord>(fullId);
      if (!result) {
        return null;
      }
      return this.recordToMessage(result);
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to get conversation message:", { id, error });
      throw wrapSurrealDBError(error, "get", SurrealDBErrorCode.SELECT_FAILED, { id });
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

      // Handle SDK v2 query result format: [[record1], [record2], ...]
      const flatResult = result.flat();
      for (const row of flatResult) {
        const message = this.recordToMessage(row);
        map.set(String(row.id).replace(`${TABLE_MESSAGES}:`, ""), message);
      }

      return map;
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to get many conversation messages:", { ids, error });
      throw wrapSurrealDBError(error, "getMany", SurrealDBErrorCode.SELECT_FAILED, { ids });
    }
  }

  async save(entity: ConversationMessage): Promise<string> {
    const recordId = `${TABLE_MESSAGES}:${entity.id}`;
    const record: Omit<ConversationMessageRecord, "id"> = {
      conversation_id: entity.conversation_id,
      role: entity.role,
      content: entity.content,
      created_at: entity.created_at,
      metadata: entity.metadata,
    };

    try {
      await this.client.upsert(recordId, record);
      return String(entity.id);
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to save conversation message:", { id: entity.id, error });
      throw wrapSurrealDBError(error, "save", SurrealDBErrorCode.CREATE_FAILED, {
        id: entity.id,
      });
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.client.delete(`${TABLE_MESSAGES}:${id}`);
      return true;
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
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

      // Handle SDK v2 query result format: [[record1], [record2], ...] or [[record1, record2, ...]]
      const flatResult = result.flat();
      return flatResult.map((record) => this.recordToMessage(record));
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to find conversation messages:", { query, error });
      throw wrapSurrealDBError(error, "find", SurrealDBErrorCode.QUERY_FAILED, { query });
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
      // Handle SDK v2 query result format: [[{ count: n }]]
      const flatResult = result.flat();
      return flatResult[0]?.count ?? 0;
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to count conversation messages:", { query, error });
      throw wrapSurrealDBError(error, "count", SurrealDBErrorCode.QUERY_FAILED, { query });
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
      // Handle SDK v2 query result format: [[record]]
      const flatResult = result.flat();
      if (flatResult.length === 0) {
        return null;
      }
      return this.recordToMessage(flatResult[0]);
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to get last message:", { conversationId, error });
      throw wrapSurrealDBError(error, "getLastMessage", SurrealDBErrorCode.QUERY_FAILED, {
        conversationId,
      });
    }
  }

  async getFirstMessage(conversationId: string): Promise<ConversationMessage | null> {
    try {
      const result = await this.client.query<ConversationMessageRecord[]>(
        `SELECT * FROM ${TABLE_MESSAGES} WHERE conversation_id = $conversationId ORDER BY created_at ASC LIMIT 1`,
        { conversationId }
      );
      // Handle SDK v2 query result format: [[record]]
      const flatResult = result.flat();
      if (flatResult.length === 0) {
        return null;
      }
      return this.recordToMessage(flatResult[0]);
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to get first message:", { conversationId, error });
      throw wrapSurrealDBError(error, "getFirstMessage", SurrealDBErrorCode.QUERY_FAILED, {
        conversationId,
      });
    }
  }

  async deleteByConversationId(conversationId: string): Promise<number> {
    try {
      const result = await this.client.query<{ id: string }[]>(
        `SELECT id FROM ${TABLE_MESSAGES} WHERE conversation_id = $conversationId`,
        { conversationId }
      );
      // Handle SDK v2 query result format: [[{ id: "..." }]]
      const flatResult = result.flat();
      const ids = flatResult.map((r) => String(r.id).replace(`${TABLE_MESSAGES}:`, ""));
      return this.deleteMany(ids);
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to delete by conversationId:", { conversationId, error });
      throw wrapSurrealDBError(error, "deleteByConversationId", SurrealDBErrorCode.DELETE_FAILED, {
        conversationId,
      });
    }
  }

  async deleteBefore(timestamp: number): Promise<number> {
    try {
      const result = await this.client.query<{ id: string }[]>(
        `SELECT id FROM ${TABLE_MESSAGES} WHERE created_at < $timestamp`,
        { timestamp }
      );
      // Handle SDK v2 query result format: [[{ id: "..." }]]
      const flatResult = result.flat();
      const ids = flatResult.map((r) => String(r.id).replace(`${TABLE_MESSAGES}:`, ""));
      return this.deleteMany(ids);
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to delete messages before:", { timestamp, error });
      throw wrapSurrealDBError(error, "deleteBefore", SurrealDBErrorCode.DELETE_FAILED, {
        timestamp,
      });
    }
  }

  async saveMessages(conversationId: string, messages: Message[]): Promise<void> {
    logger.debug("[SurrealDBConversationStorage] saveMessages called", {
      conversationId,
      messageCount: messages.length,
    });
    await this.ensureConnected();

    let idSequence = 0;
    for (const message of messages) {
      const messageId = Date.now() + idSequence;
      idSequence += 1;

      const recordId = `${TABLE_MESSAGES}:${messageId}`;
      const record: Omit<ConversationMessageRecord, "id"> = {
        conversation_id: conversationId,
        role: message.role,
        content:
          typeof message.content === "string" ? message.content : JSON.stringify(message.content),
        created_at: Date.now(),
      };

      logger.debug("[SurrealDBConversationStorage] Upserting record", {
        id: recordId,
        conversation_id: record.conversation_id,
      });

      try {
        await this.client.upsert(recordId, record);
        logger.debug("[SurrealDBConversationStorage] Record upserted successfully", {
          id: recordId,
        });
      } catch (createError: unknown) {
        logger.error("[SurrealDBConversationStorage] Failed to upsert record:", {
          id: recordId,
          conversation_id: record.conversation_id,
          error: createError instanceof Error ? createError.message : String(createError),
          stack: createError instanceof Error ? createError.stack : undefined,
        });
        throw createError;
      }
    }
    logger.debug("[SurrealDBConversationStorage] saveMessages completed", {
      conversationId,
      totalMessages: idSequence,
    });
  }

  private recordToMessage(record: ConversationMessageRecord): ConversationMessage {
    let idStr = String(record.id || "");

    // Handle SurrealDB v2 ID format: "table:⟨table:id⟩" or "table:⟨id⟩"
    const v2Match = idStr.match(/⟨(\w+:)?(\d+)⟩$/);
    if (v2Match) {
      idStr = v2Match[2];
    } else {
      // Fallback to v1 format: "table:id"
      idStr = idStr.replace(`${TABLE_MESSAGES}:`, "");
    }

    // Debug log for ID parsing
    logger.debug("[SurrealDB] recordToMessage ID parsing:", {
      originalId: record.id,
      extractedIdStr: idStr,
      isNumeric: !isNaN(Number(idStr)),
    });

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
