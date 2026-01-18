/**
 * SurrealDB Client Wrapper
 *
 * Wrapper around SurrealDB SDK v2 providing connection management,
 * health checks, retry logic, timeouts, and safe logging.
 */

import { Surreal, createRemoteEngines, Table, RecordId } from "surrealdb";
import { logger } from "../../../utils/logger";
import type { SurrealDBConfig } from "../interfaces";
import {
  SurrealDBError,
  SurrealDBErrorCode,
  isSurrealDBError,
  wrapSurrealDBError,
} from "../../../utils/surreal-error";

type ConnectionState = "disconnected" | "connecting" | "connected";

function normalizeUrlForLogging(url: string): string {
  return url.replace(/^(wss?|https?):\/\/([^:@/]+):[^@/]*@/i, "$1//$2:***@");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateBackoffDelayMs(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number
): number {
  const exponential = initialDelayMs * Math.pow(2, attempt - 1);
  const capped = Math.min(exponential, maxDelayMs);

  const jitterFactor = 0.8 + Math.random() * 0.4;
  return Math.floor(capped * jitterFactor);
}

async function withTimeout<T>(
  operation: string,
  timeoutMs: number,
  promise: Promise<T>
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(
        new SurrealDBError(
          SurrealDBErrorCode.CONNECTION_TIMEOUT,
          `${operation} timed out after ${timeoutMs}ms`,
          operation
        )
      );
    }, timeoutMs);

    promise
      .then((value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

function isSameConfig(a: SurrealDBConfig | null, b: SurrealDBConfig): boolean {
  if (!a) {
    return false;
  }

  return (
    a.url === b.url &&
    a.namespace === b.namespace &&
    a.database === b.database &&
    a.username === b.username &&
    a.password === b.password &&
    (a.timeout ?? 0) === (b.timeout ?? 0) &&
    (a.maxRetries ?? 0) === (b.maxRetries ?? 0)
  );
}

function buildRpcUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  if (trimmed.endsWith("/rpc")) {
    return trimmed;
  }
  return `${trimmed}/rpc`;
}

class SurrealDBClient {
  private static instance: SurrealDBClient;
  private client: Surreal | null = null;
  private config: SurrealDBConfig | null = null;
  private state: ConnectionState = "disconnected";

  private connectPromise: Promise<void> | null = null;
  private disconnectPromise: Promise<void> | null = null;

  private transactionDepth: number = 0;

  private constructor() {}

  static getInstance(): SurrealDBClient {
    if (!SurrealDBClient.instance) {
      SurrealDBClient.instance = new SurrealDBClient();
    }
    return SurrealDBClient.instance;
  }

  /**
   * Get current connection config (if connected)
   */
  getConfig(): SurrealDBConfig | null {
    return this.config;
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.state === "connected" && this.client !== null;
  }

  async connect(config: SurrealDBConfig): Promise<void> {
    const normalizedConfig: SurrealDBConfig = {
      ...config,
      timeout: config.timeout ?? 5000,
      maxRetries: config.maxRetries ?? 3,
    };

    if (this.state === "connected") {
      if (isSameConfig(this.config, normalizedConfig)) {
        return;
      }
      throw new Error("[SurrealDB] Already connected with a different config");
    }

    if (this.connectPromise) {
      if (isSameConfig(this.config, normalizedConfig)) {
        return this.connectPromise;
      }
      throw new Error("[SurrealDB] Connect already in progress with a different config");
    }

    if (this.disconnectPromise) {
      await this.disconnectPromise;
    }

    this.config = normalizedConfig;
    this.state = "connecting";

    this.connectPromise = this.connectWithRetry(normalizedConfig)
      .then(() => {
        this.state = "connected";
      })
      .catch((error: unknown) => {
        this.state = "disconnected";
        this.client = null;
        logger.error("[SurrealDB] Connection failed", { error });
        throw error;
      })
      .finally(() => {
        this.connectPromise = null;
      });

    return this.connectPromise;
  }

  async disconnect(): Promise<void> {
    if (this.disconnectPromise) {
      return this.disconnectPromise;
    }

    this.disconnectPromise = this.doDisconnect().finally(() => {
      this.disconnectPromise = null;
    });

    return this.disconnectPromise;
  }

  private async doDisconnect(): Promise<void> {
    if (this.connectPromise) {
      try {
        await this.connectPromise;
      } catch (error: unknown) {
        logger.warn("[SurrealDB] Disconnect called while connect failed", { error });
      }
    }

    if (!this.client) {
      this.state = "disconnected";
      return;
    }

    try {
      await this.client.close();
    } catch (error: unknown) {
      logger.warn("[SurrealDB] Disconnect failed", { error });
    } finally {
      this.client = null;
      this.state = "disconnected";
      logger.info("[SurrealDB] Disconnected");
    }
  }

  private async connectWithRetry(config: SurrealDBConfig): Promise<void> {
    const maxRetries = config.maxRetries ?? 3;
    const timeoutMs = config.timeout ?? 5000;

    const totalAttempts = maxRetries + 1;
    const initialDelayMs = 250;
    const maxDelayMs = 5000;

    const rpcUrl = buildRpcUrl(config.url);
    const safeUrl = normalizeUrlForLogging(rpcUrl);

    let lastError: unknown = null;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      const attemptClient = new Surreal({
        engines: createRemoteEngines(),
      });

      try {
        logger.info("[SurrealDB] Connecting", {
          attempt,
          totalAttempts,
          url: safeUrl,
          namespace: config.namespace,
          database: config.database,
        });

        await withTimeout(
          "connect",
          timeoutMs,
          attemptClient.connect(rpcUrl, {
            namespace: config.namespace,
            database: config.database,
            authentication: {
              username: config.username,
              password: config.password,
            },
          })
        );

        this.client = attemptClient;

        logger.info("[SurrealDB] Connected successfully", {
          namespace: config.namespace,
          database: config.database,
        });

        return;
      } catch (error: unknown) {
        lastError = error;

        try {
          await attemptClient.close();
        } catch (closeError: unknown) {
          logger.debug("[SurrealDB] Failed to close client after connect error", { closeError });
        }

        const isLastAttempt = attempt >= totalAttempts;

        logger.warn("[SurrealDB] Connect attempt failed", {
          attempt,
          totalAttempts,
          isLastAttempt,
          url: safeUrl,
          namespace: config.namespace,
          database: config.database,
          error,
        });

        if (isLastAttempt) {
          throw error;
        }

        const delayMs = calculateBackoffDelayMs(attempt, initialDelayMs, maxDelayMs);
        await sleep(delayMs);
      }
    }

    throw lastError ?? new Error("[SurrealDB] Unexpected connect retry loop termination");
  }

  private async getConnectedClient(operation: string): Promise<Surreal> {
    if (this.state === "connected" && this.client) {
      return this.client;
    }

    if (this.connectPromise) {
      await this.connectPromise;
      if (this.state === "connected" && this.client) {
        return this.client;
      }
    }

    throw new SurrealDBError(
      SurrealDBErrorCode.NOT_CONNECTED,
      `Not connected: call connect() before ${operation}`,
      operation
    );
  }

  async beginTransaction(): Promise<void> {
    if (this.transactionDepth > 0) {
      throw new SurrealDBError(
        SurrealDBErrorCode.NESTED_TRANSACTION,
        "Nested transactions not supported",
        "beginTransaction"
      );
    }

    this.transactionDepth = 1;
    await this.query("BEGIN");
  }

  async commitTransaction(): Promise<void> {
    if (this.transactionDepth !== 1) {
      throw new SurrealDBError(
        SurrealDBErrorCode.TRANSACTION_FAILED,
        "No active transaction to commit",
        "commitTransaction"
      );
    }

    await this.query("COMMIT");
    this.transactionDepth = 0;
  }

  async rollbackTransaction(): Promise<void> {
    if (this.transactionDepth === 0) {
      return;
    }

    try {
      await this.query("CANCEL");
    } catch (error: unknown) {
      logger.warn("[SurrealDB] Rollback failed (may already be rolled back)", { error });
    } finally {
      this.transactionDepth = 0;
    }
  }

  private areTransactionsEnabled(): boolean {
    const raw = process.env.SURREALDB_ENABLE_TRANSACTIONS;
    if (!raw) {
      return false;
    }
    const value = raw.trim().toLowerCase();
    return value === "1" || value === "true";
  }

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.areTransactionsEnabled()) {
      return fn();
    }

    await this.beginTransaction();
    try {
      const result = await fn();
      await this.commitTransaction();
      return result;
    } catch (error: unknown) {
      await this.rollbackTransaction();
      throw error;
    }
  }

  private mapToSurrealDBError(
    error: unknown,
    operation: string,
    details?: unknown
  ): SurrealDBError {
    if (isSurrealDBError(error)) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const lowerMessage = message.toLowerCase();

    // Connection-related errors
    if (lowerMessage.includes("not connected")) {
      return wrapSurrealDBError(error, operation, SurrealDBErrorCode.NOT_CONNECTED, details);
    }

    if (lowerMessage.includes("timeout") || lowerMessage.includes("timed out")) {
      return wrapSurrealDBError(error, operation, SurrealDBErrorCode.CONNECTION_TIMEOUT, details);
    }

    if (lowerMessage.includes("already exists") || lowerMessage.includes("already registered")) {
      return wrapSurrealDBError(
        error,
        operation,
        SurrealDBErrorCode.RECORD_ALREADY_EXISTS,
        details
      );
    }

    if (
      lowerMessage.includes("not found") ||
      lowerMessage.includes("record not found") ||
      lowerMessage.includes("no such")
    ) {
      return wrapSurrealDBError(error, operation, SurrealDBErrorCode.RECORD_NOT_FOUND, details);
    }

    return wrapSurrealDBError(error, operation, SurrealDBErrorCode.QUERY_FAILED, details);
  }

  private extractOperation(sql: string): string {
    const trimmed = sql.trim().toUpperCase();
    if (trimmed.startsWith("SELECT")) return "select";
    if (trimmed.startsWith("CREATE")) return "create";
    if (trimmed.startsWith("UPDATE")) return "update";
    if (trimmed.startsWith("DELETE")) return "delete";
    if (trimmed.startsWith("INSERT")) return "insert";
    if (trimmed.startsWith("BEGIN")) return "beginTransaction";
    if (trimmed.startsWith("COMMIT")) return "commitTransaction";
    if (trimmed.startsWith("CANCEL")) return "rollbackTransaction";
    return "query";
  }

  async query<T extends unknown[]>(sql: string, vars?: Record<string, unknown>): Promise<T> {
    const operation = this.extractOperation(sql);

    try {
      const client = await this.getConnectedClient(operation);
      return (await client.query<T>(sql, vars).collect<T>()) as unknown as Promise<T>;
    } catch (error: unknown) {
      const mappedError = this.mapToSurrealDBError(error, operation, {
        sqlLength: sql.length,
        varsKeys: vars ? Object.keys(vars) : [],
      });
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : "";
      logger.error("[SurrealDB] Query failed", {
        operation,
        sqlLength: sql.length,
        varsKeys: vars ? Object.keys(vars) : [],
        error: mappedError.message,
        originalError: errorMessage,
        originalStack: errorStack,
      });
      throw mappedError;
    }
  }

  async select<T extends Record<string, unknown>>(tableOrId: string): Promise<T[]> {
    const operation = "select";

    try {
      const client = await this.getConnectedClient(operation);

      const lastColonIndex = tableOrId.lastIndexOf(":");
      if (lastColonIndex > 0) {
        const tableName = tableOrId.substring(0, lastColonIndex);
        const idValue = tableOrId.substring(lastColonIndex + 1);
        const recordId = new RecordId(tableName, idValue);
        const record = (await client.select<T>(recordId)) as T;
        return record ? [record] : [];
      }

      const table = new Table(tableOrId);
      const result = (await client.select<T>(table)) as T[];
      return Array.isArray(result) ? result : [result];
    } catch (error: unknown) {
      const mappedError = this.mapToSurrealDBError(error, operation, { tableOrId });
      logger.error("[SurrealDB] Select failed", {
        operation,
        tableOrId,
        error: mappedError.message,
      });
      throw mappedError;
    }
  }

  /**
   * Select a single record by its full ID (e.g., "table:id")
   */
  async selectById<T extends Record<string, unknown>>(fullId: string): Promise<T | null> {
    const operation = "selectById";

    try {
      const client = await this.getConnectedClient(operation);
      // Parse "table:id" format
      const lastColonIndex = fullId.lastIndexOf(":");
      if (lastColonIndex === -1) {
        throw new SurrealDBError(
          SurrealDBErrorCode.INVALID_PARAMETER,
          `Invalid full ID format: ${fullId}`,
          operation
        );
      }
      const tableName = fullId.substring(0, lastColonIndex);
      const idValue = fullId.substring(lastColonIndex + 1);

      // Query all records from the table and filter in code
      // This is necessary because SurrealDB v2 has a complex ID format: table:⟨table:id⟩
      const result = await client.query<[T]>(`SELECT * FROM ${tableName} LIMIT 100`);

      // Find the record with matching numeric ID
      // The ID in v2 is stored as "table:⟨table:id⟩", extract the inner id
      for (const row of result) {
        // SDK v2 query returns rows as arrays, extract the first element
        const record = Array.isArray(row) ? row[0] : row;
        if (record && typeof record === "object" && "id" in record) {
          const recordId = String(record.id);
          // Check if the inner numeric ID matches
          // Format: "table:⟨table:id⟩" - extract id between ⟨ and ⟩
          const match = recordId.match(/⟨(\w+:)?(\d+)⟩$/);
          if (match && match[2] === String(idValue)) {
            return record;
          }
        }
      }

      return null;
    } catch (error: unknown) {
      const mappedError = this.mapToSurrealDBError(error, operation, { fullId });
      logger.error("[SurrealDB] SelectById failed", {
        operation,
        fullId,
        error: mappedError.message,
      });
      throw mappedError;
    }
  }

  async create<T extends Record<string, unknown>>(tableOrId: string, data: T): Promise<T> {
    const operation = "create";

    try {
      const client = await this.getConnectedClient(operation);

      // Check if tableOrId contains a colon (indicating a specific ID)
      const lastColonIndex = tableOrId.lastIndexOf(":");
      let result: unknown | unknown[] | null = null;

      if (lastColonIndex > 0) {
        // It's a full ID like "table:id" - create with RecordId
        // Remove id from data to avoid conflict with recordId
        const { id, ...dataWithoutId } = data as T & { id?: unknown };
        const tableName = tableOrId.substring(0, lastColonIndex);
        const idValue = tableOrId.substring(lastColonIndex + 1);
        const recordId = new RecordId(tableName, idValue);
        result = await client.create<T>(recordId).content(dataWithoutId as T);
      } else {
        // Just a table name - auto-generate ID
        const table = new Table(tableOrId);
        result = await client.create<T>(table).content(data);
      }

      if (!result) {
        throw new SurrealDBError(
          SurrealDBErrorCode.QUERY_FAILED,
          "Create returned empty result",
          operation
        );
      }

      const value = Array.isArray(result) ? result[0] : result;
      return value as T;
    } catch (error: unknown) {
      const mappedError = this.mapToSurrealDBError(error, operation, {
        tableOrId,
        dataKeys: Object.keys(data),
      });
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        `[SurrealDB] Create failed: ${mappedError.message} (original: ${errorMessage})`,
        {
          operation,
          tableOrId,
          dataKeys: Object.keys(data),
        }
      );

      throw mappedError;
    }
  }

  async update<T extends Record<string, unknown>>(idOrTable: string, data: T): Promise<T | T[]> {
    const operation = "update";

    try {
      const client = await this.getConnectedClient(operation);

      const lastColonIndex = idOrTable.lastIndexOf(":");
      if (lastColonIndex > 0) {
        const tableName = idOrTable.substring(0, lastColonIndex);
        const idValue = idOrTable.substring(lastColonIndex + 1);
        const recordId = new RecordId(tableName, idValue);
        const { id, ...dataWithoutId } = data as T & { id?: unknown };
        return (await client.update<T>(recordId).content(dataWithoutId as T)) as T | T[];
      }

      const table = new Table(idOrTable);
      return (await client.update<T>(table).content(data)) as T | T[];
    } catch (error: unknown) {
      const mappedError = this.mapToSurrealDBError(error, operation, {
        idOrTable,
        dataKeys: Object.keys(data),
      });
      logger.error("[SurrealDB] Update failed", {
        operation,
        idOrTable,
        dataKeys: Object.keys(data),
        error: mappedError.message,
      });
      throw mappedError;
    }
  }

  async upsert<T extends Record<string, unknown>>(tableOrId: string, data: T): Promise<T> {
    const operation = "upsert";

    try {
      const client = await this.getConnectedClient(operation);
      const lastColonIndex = tableOrId.lastIndexOf(":");
      let result: unknown | unknown[] | null = null;

      if (lastColonIndex > 0) {
        const tableName = tableOrId.substring(0, lastColonIndex);
        const idValue = tableOrId.substring(lastColonIndex + 1);
        const recordId = new RecordId(tableName, idValue);
        const { id, ...dataWithoutId } = data as T & { id?: unknown };
        result = await client.upsert<T>(recordId).content(dataWithoutId as T);
      } else {
        const table = new Table(tableOrId);
        result = await client.upsert<T>(table).content(data);
      }

      if (!result) {
        throw new SurrealDBError(
          SurrealDBErrorCode.QUERY_FAILED,
          "Upsert returned empty result",
          operation
        );
      }

      const value = Array.isArray(result) ? result[0] : result;
      return value as T;
    } catch (error: unknown) {
      const mappedError = this.mapToSurrealDBError(error, operation, {
        tableOrId,
        dataKeys: Object.keys(data),
      });
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        `[SurrealDB] Upsert failed: ${mappedError.message} (original: ${errorMessage})`,
        {
          operation,
          tableOrId,
          dataKeys: Object.keys(data),
        }
      );
      throw mappedError;
    }
  }

  async delete(id: string): Promise<boolean> {
    const operation = "delete";

    try {
      const client = await this.getConnectedClient(operation);
      const table = new Table(id);
      await client.delete(table);
      return true;
    } catch (error: unknown) {
      const mappedError = this.mapToSurrealDBError(error, operation, { id });
      logger.error("[SurrealDB] Delete failed", { operation, id, error: mappedError.message });

      if (isSurrealDBError(error) && error.code === SurrealDBErrorCode.NOT_CONNECTED) {
        throw mappedError;
      }

      return false;
    }
  }

  async healthCheck(): Promise<boolean> {
    if (this.state !== "connected" || !this.client) {
      logger.debug("[SurrealDB] Health check failed: not connected");
      return false;
    }

    try {
      await this.client.health();
      return true;
    } catch (error: unknown) {
      logger.warn("[SurrealDB] Health check failed", { error });
      return false;
    }
  }

  get connected(): boolean {
    return this.state === "connected";
  }

  getConnectionInfo(): { namespace: string; database: string; url: string } | null {
    if (!this.config) {
      return null;
    }

    return {
      namespace: this.config.namespace,
      database: this.config.database,
      url: this.config.url,
    };
  }
}

export { SurrealDBClient };
export type { SurrealDBConfig };
