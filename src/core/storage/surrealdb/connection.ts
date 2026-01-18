/**
 * SurrealDB Connection Utility
 *
 * Shared connection management for SurrealDB storage adapters.
 * Ensures single connection initialization across all adapters.
 */

import { SurrealDBClient } from "./client";
import { logger } from "../../../utils/logger";

interface SurrealDBConnectionConfig {
  url?: string;
  username?: string;
  password?: string;
  namespace?: string;
  database?: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * Shared connection state to prevent duplicate initialization
 */
let connecting = false;
let connectionPromise: Promise<void> | null = null;

/**
 * Get default connection configuration from environment variables
 */
function getDefaultConfig(): Required<SurrealDBConnectionConfig> {
  return {
    url: process.env.SURREALDB_URL || "ws://localhost:8000/rpc",
    username: process.env.SURREALDB_USER || "root",
    password: process.env.SURREALDB_PASS || "root",
    namespace: process.env.SURREALDB_NAMESPACE || "apexbridge",
    database: process.env.SURREALDB_DATABASE || "staging",
    timeout: 10000,
    maxRetries: 3,
  };
}

/**
 * Ensure SurrealDB connection is established before operations
 *
 * This is a shared utility that prevents:
 * 1. Duplicate connection attempts
 * 2. Connection logic duplication across adapters
 * 3. Race conditions during concurrent initialization
 */
export async function ensureSurrealDBConnected(): Promise<void> {
  const client = SurrealDBClient.getInstance();

  // Fast path: already connected
  if (client.isConnected()) {
    return;
  }

  // Prevent concurrent connection attempts
  if (connecting) {
    if (connectionPromise) {
      await connectionPromise;
    }
    // Re-check after waiting
    if (client.isConnected()) {
      return;
    }
    throw new Error("[SurrealDB] Connection attempt failed");
  }

  connecting = true;

  try {
    const config = getDefaultConfig();

    connectionPromise = client.connect({
      url: config.url,
      username: config.username,
      password: config.password,
      namespace: config.namespace,
      database: config.database,
      timeout: config.timeout,
      maxRetries: config.maxRetries,
    });

    await connectionPromise;

    logger.info("[SurrealDB] Connection established via shared utility", {
      namespace: config.namespace,
      database: config.database,
    });
  } catch (error: unknown) {
    logger.error("[SurrealDB] Failed to establish connection", { error });
    throw error;
  } finally {
    connecting = false;
    connectionPromise = null;
  }
}

/**
 * Check if SurrealDB is connected
 */
export function isSurrealDBConnected(): boolean {
  return SurrealDBClient.getInstance().isConnected();
}

/**
 * Get connection info if available
 */
export function getSurrealDBConnectionInfo(): {
  namespace: string;
  database: string;
  url: string;
} | null {
  return SurrealDBClient.getInstance().getConnectionInfo();
}
