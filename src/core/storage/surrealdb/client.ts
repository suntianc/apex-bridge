/**
 * SurrealDB Client Wrapper
 *
 * Wrapper around SurrealDB SDK v1 providing connection management,
 * health checks, retry logic, timeouts, and safe logging.
 */

import Surreal from "surrealdb";
import { logger } from "../../../utils/logger";
import type { SurrealDBConfig } from "../interfaces";

class SurrealDBNotConnectedError extends Error {
  constructor(operation: string) {
    super(`[SurrealDB] Not connected: call connect() before ${operation}`);
    this.name = "SurrealDBNotConnectedError";
  }
}

class SurrealDBTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`[SurrealDB] ${operation} timed out after ${timeoutMs}ms`);
    this.name = "SurrealDBTimeoutError";
  }
}

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
      reject(new SurrealDBTimeoutError(operation, timeoutMs));
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

  private constructor() {}

  static getInstance(): SurrealDBClient {
    if (!SurrealDBClient.instance) {
      SurrealDBClient.instance = new SurrealDBClient();
    }
    return SurrealDBClient.instance;
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
      const attemptClient = new Surreal();

      try {
        logger.info("[SurrealDB] Connecting", {
          attempt,
          totalAttempts,
          url: safeUrl,
          namespace: config.namespace,
          database: config.database,
        });

        await withTimeout("connect", timeoutMs, attemptClient.connect(rpcUrl));
        await withTimeout(
          "signin",
          timeoutMs,
          attemptClient.signin({
            username: config.username,
            password: config.password,
          })
        );
        await withTimeout(
          "use",
          timeoutMs,
          attemptClient.use({ namespace: config.namespace, database: config.database })
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

    throw new SurrealDBNotConnectedError(operation);
  }

  async query<T extends unknown[]>(sql: string, vars?: Record<string, unknown>): Promise<T> {
    const operation = "query";

    try {
      const client = await this.getConnectedClient(operation);
      return await client.query<T>(sql, vars);
    } catch (error: unknown) {
      logger.error("[SurrealDB] Query failed", {
        operation,
        sqlLength: sql.length,
        varsKeys: vars ? Object.keys(vars) : [],
        error,
      });
      throw error;
    }
  }

  async select<T extends Record<string, unknown>>(tableOrId: string): Promise<T[]> {
    const operation = "select";

    try {
      const client = await this.getConnectedClient(operation);
      const result = await client.select<T>(tableOrId);
      return Array.isArray(result) ? result : [result];
    } catch (error: unknown) {
      logger.error("[SurrealDB] Select failed", { operation, tableOrId, error });
      throw error;
    }
  }

  async create<T extends Record<string, unknown>>(tableOrId: string, data: T): Promise<T> {
    const operation = "create";

    try {
      const client = await this.getConnectedClient(operation);
      const result = await client.create<T>(tableOrId, data);
      return Array.isArray(result) ? result[0] : result;
    } catch (error: unknown) {
      logger.error("[SurrealDB] Create failed", {
        operation,
        tableOrId,
        dataKeys: Object.keys(data),
        error,
      });
      throw error;
    }
  }

  async update<T extends Record<string, unknown>>(idOrTable: string, data: T): Promise<T | T[]> {
    const operation = "update";

    try {
      const client = await this.getConnectedClient(operation);
      return await client.update<T>(idOrTable, data);
    } catch (error: unknown) {
      logger.error("[SurrealDB] Update failed", {
        operation,
        idOrTable,
        dataKeys: Object.keys(data),
        error,
      });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const operation = "delete";

    try {
      const client = await this.getConnectedClient(operation);
      await client.delete(id);
      return true;
    } catch (error: unknown) {
      logger.error("[SurrealDB] Delete failed", { operation, id, error });

      if (error instanceof SurrealDBNotConnectedError) {
        throw error;
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
      const result = await this.client.query("SELECT * FROM $session");
      const isHealthy = Array.isArray(result);

      if (!isHealthy) {
        logger.warn("[SurrealDB] Health check returned unexpected result shape");
      }

      return isHealthy;
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
