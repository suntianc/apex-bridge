/**
 * LanceDBConnectionPool - Connection Pool Management
 *
 * Manages a pool of LanceDB connections for improved concurrency
 * and system stability. Replaces the single-connection pattern.
 */

import * as lancedb from "@lancedb/lancedb";
import * as fs from "fs/promises";
import { logger } from "../../utils/logger";

/**
 * Pool configuration interface
 */
export interface PoolConfig {
  maxInstances: number;
  instanceTTL: number;
  healthCheckInterval: number;
  minIdle: number;
  leakDetectionThreshold: number;
}

/**
 * Default pool configuration
 */
export const DEFAULT_POOL_CONFIG: PoolConfig = {
  maxInstances: 4,
  instanceTTL: 300000,
  healthCheckInterval: 60000,
  minIdle: 1,
  leakDetectionThreshold: 300000,
};

/**
 * Pooled connection interface
 */
export interface PooledConnection {
  connection: lancedb.Connection | null;
  dbPath: string;
  createdAt: number;
  lastAccess: number;
  accessCount: number;
  healthy: boolean;
  borrowedAt?: number;
}

/**
 * Pool statistics interface
 */
export interface PoolStats {
  size: number;
  maxSize: number;
  totalAccess: number;
  hitRate: number;
  healthyCount: number;
  idleCount: number;
  borrowedCount: number;
  potentialLeaks: number;
}

/**
 * LanceDBConnectionPool class
 */
export class LanceDBConnectionPool {
  private pool: Map<string, PooledConnection> = new Map();
  private config: PoolConfig;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private totalAccess: number = 0;
  private cacheHits: number = 0;
  private disposed: boolean = false;

  /**
   * Create a new connection pool
   */
  constructor(config: Partial<PoolConfig> = {}) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
    this.startHealthCheck();
    logger.info("[LanceDBConnectionPool] Pool initialized with config:", this.config);
  }

  /**
   * Get a connection from the pool
   */
  async getConnection(dbPath: string): Promise<lancedb.Connection> {
    const normalizedPath = this.normalizePath(dbPath);
    this.totalAccess++;

    // Check for existing connection
    const existing = this.pool.get(normalizedPath);
    if (existing) {
      if (existing.healthy) {
        existing.lastAccess = Date.now();
        existing.accessCount++;
        this.cacheHits++;
        logger.debug(`[LanceDBConnectionPool] Reusing existing connection for: ${normalizedPath}`);
        return existing.connection;
      } else {
        // Remove unhealthy connection
        await this.removeConnection(normalizedPath);
      }
    }

    // Check pool size limit
    if (this.pool.size >= this.config.maxInstances) {
      logger.warn(
        `[LanceDBConnectionPool] Pool at max capacity (${this.config.maxInstances}), attempting to evict expired connections`
      );
      await this.evictExpired();

      // If still at capacity, remove the least recently used connection
      if (this.pool.size >= this.config.maxInstances) {
        const lruPath = this.findLeastRecentlyUsed();
        if (lruPath) {
          logger.info(`[LanceDBConnectionPool] Evicting LRU connection: ${lruPath}`);
          await this.removeConnection(lruPath);
        }
      }
    }

    // Create new connection
    const connection = await this.createConnection(normalizedPath);
    const pooledConnection: PooledConnection = {
      connection,
      dbPath: normalizedPath,
      createdAt: Date.now(),
      lastAccess: Date.now(),
      accessCount: 1,
      healthy: true,
    };

    this.pool.set(normalizedPath, pooledConnection);
    logger.info(
      `[LanceDBConnectionPool] Created new connection for: ${normalizedPath}, pool size: ${this.pool.size}`
    );

    return connection;
  }

  /**
   * Release a connection back to the pool
   */
  async releaseConnection(dbPath: string): Promise<void> {
    const normalizedPath = this.normalizePath(dbPath);
    const connection = this.pool.get(normalizedPath);

    if (connection) {
      connection.lastAccess = Date.now();
      logger.debug(`[LanceDBConnectionPool] Released connection for: ${normalizedPath}`);
    }
  }

  /**
   * Close a specific connection
   */
  async closeConnection(dbPath: string): Promise<void> {
    const normalizedPath = this.normalizePath(dbPath);
    await this.removeConnection(normalizedPath);
  }

  /**
   * Close all connections in the pool
   */
  async closeAll(): Promise<void> {
    // Stop health check timer
    this.stopHealthCheck();

    // Close all connections
    for (const [dbPath, pooledConnection] of this.pool) {
      try {
        await this.closeSingleConnection(pooledConnection);
        logger.info(`[LanceDBConnectionPool] Closed connection for: ${dbPath}`);
      } catch (error) {
        logger.error(`[LanceDBConnectionPool] Error closing connection for ${dbPath}:`, error);
      }
    }

    this.pool.clear();
    logger.info("[LanceDBConnectionPool] All connections closed");
  }

  /**
   * Dispose of the pool and cleanup resources
   * Implements IDisposable pattern for proper resource cleanup
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    logger.info("[LanceDBConnectionPool] Disposing connection pool...");

    // Stop health check
    this.stopHealthCheck();

    // Close all connections
    await this.closeAll();

    // Reset statistics
    this.totalAccess = 0;
    this.cacheHits = 0;

    logger.info("[LanceDBConnectionPool] Connection pool disposed");
  }

  /**
   * Stop the health check timer
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
      logger.debug("[LanceDBConnectionPool] Health check timer stopped");
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    const hitRate = this.totalAccess > 0 ? this.cacheHits / this.totalAccess : 0;
    let healthyCount = 0;
    let idleCount = 0;
    let borrowedCount = 0;
    let potentialLeaks = 0;
    const now = Date.now();

    for (const connection of this.pool.values()) {
      if (connection.healthy) {
        healthyCount++;
        // Consider idle if not accessed in the last 30 seconds
        if (Date.now() - connection.lastAccess > 30000) {
          idleCount++;
        }
      }
      // Track borrowed connections (if we implement lease tracking)
      if (connection.borrowedAt) {
        borrowedCount++;
        // Check for potential leaks
        if (now - connection.borrowedAt > this.config.leakDetectionThreshold) {
          potentialLeaks++;
        }
      }
    }

    return {
      size: this.pool.size,
      maxSize: this.config.maxInstances,
      totalAccess: this.totalAccess,
      hitRate: Math.round(hitRate * 100) / 100,
      healthyCount,
      idleCount,
      borrowedCount,
      potentialLeaks,
    };
  }

  /**
   * Check if a connection is healthy
   */
  async isHealthy(dbPath: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(dbPath);
    const connection = this.pool.get(normalizedPath);

    if (!connection || !connection.healthy) {
      return false;
    }

    try {
      // Simple health check - try to get table names
      const tableNames = await connection.connection.tableNames();
      return Array.isArray(tableNames);
    } catch (error) {
      logger.warn(`[LanceDBConnectionPool] Connection health check failed for ${dbPath}:`, error);
      return false;
    }
  }

  /**
   * Force refresh a connection
   */
  async refreshConnection(dbPath: string): Promise<lancedb.Connection> {
    const normalizedPath = this.normalizePath(dbPath);
    await this.removeConnection(normalizedPath);
    return this.getConnection(normalizedPath);
  }

  /**
   * Get the number of active connections
   */
  getSize(): number {
    return this.pool.size;
  }

  /**
   * Start periodic health check
   */
  private startHealthCheck(): void {
    if (this.disposed) {
      logger.debug("[LanceDBConnectionPool] Skipping health check start - pool already disposed");
      return;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      if (!this.disposed) {
        await this.performHealthCheck();
      }
    }, this.config.healthCheckInterval);

    logger.info(
      `[LanceDBConnectionPool] Health check started (interval: ${this.config.healthCheckInterval}ms)`
    );
  }

  /**
   * Perform health check on all connections
   */
  private async performHealthCheck(): Promise<void> {
    logger.debug(
      `[LanceDBConnectionPool] Performing health check on ${this.pool.size} connections`
    );

    for (const [dbPath, connection] of this.pool) {
      try {
        const isHealthy = await this.checkConnectionHealth(connection);
        connection.healthy = isHealthy;

        if (!isHealthy) {
          logger.warn(`[LanceDBConnectionPool] Connection marked unhealthy: ${dbPath}`);
        }
      } catch (error) {
        logger.error(`[LanceDBConnectionPool] Health check error for ${dbPath}:`, error);
        connection.healthy = false;
      }
    }

    // Evict unhealthy connections
    await this.evictUnhealthy();
  }

  /**
   * Check individual connection health
   */
  private async checkConnectionHealth(pooledConnection: PooledConnection): Promise<boolean> {
    try {
      // Try to get table names as a simple health check
      await pooledConnection.connection.tableNames();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Evict expired connections based on TTL
   */
  private async evictExpired(): Promise<void> {
    const now = Date.now();
    const expiredPaths: string[] = [];

    for (const [dbPath, connection] of this.pool) {
      const age = now - connection.createdAt;
      const idleTime = now - connection.lastAccess;

      // Remove if past TTL and idle, or extremely old (over 2x TTL)
      if (
        (age > this.config.instanceTTL && idleTime > 60000) ||
        age > this.config.instanceTTL * 2
      ) {
        expiredPaths.push(dbPath);
      }
    }

    for (const dbPath of expiredPaths) {
      logger.info(`[LanceDBConnectionPool] Evicting expired connection: ${dbPath}`);
      await this.removeConnection(dbPath);
    }

    if (expiredPaths.length > 0) {
      logger.info(`[LanceDBConnectionPool] Evicted ${expiredPaths.length} expired connections`);
    }
  }

  /**
   * Evict unhealthy connections
   */
  private async evictUnhealthy(): Promise<void> {
    const unhealthyPaths: string[] = [];

    for (const [dbPath, connection] of this.pool) {
      if (!connection.healthy) {
        unhealthyPaths.push(dbPath);
      }
    }

    for (const dbPath of unhealthyPaths) {
      logger.info(`[LanceDBConnectionPool] Removing unhealthy connection: ${dbPath}`);
      await this.removeConnection(dbPath);
    }
  }

  /**
   * Find the least recently used connection
   */
  private findLeastRecentlyUsed(): string | null {
    let oldestAccess = Infinity;
    let lruPath: string | null = null;

    for (const [dbPath, connection] of this.pool) {
      if (connection.lastAccess < oldestAccess) {
        oldestAccess = connection.lastAccess;
        lruPath = dbPath;
      }
    }

    return lruPath;
  }

  /**
   * Create a new LanceDB connection
   */
  private async createConnection(dbPath: string): Promise<lancedb.Connection> {
    try {
      // Ensure database directory exists
      await fs.mkdir(dbPath, { recursive: true });

      // Connect to LanceDB
      const connection = await lancedb.connect(dbPath);
      logger.debug(`[LanceDBConnectionPool] Created connection for: ${dbPath}`);

      return connection;
    } catch (error) {
      logger.error(`[LanceDBConnectionPool] Failed to create connection for ${dbPath}:`, error);
      throw error;
    }
  }

  /**
   * Close a single connection
   */
  private async closeSingleConnection(pooledConnection: PooledConnection): Promise<void> {
    try {
      // LanceDB doesn't have an explicit close method in the Connection interface
      // The connection will be garbage collected when the object is destroyed
      pooledConnection.connection = null;
      pooledConnection.healthy = false;
    } catch (error) {
      logger.error("[LanceDBConnectionPool] Error closing connection:", error);
    }
  }

  /**
   * Remove a connection from the pool
   */
  private async removeConnection(dbPath: string): Promise<void> {
    const pooledConnection = this.pool.get(dbPath);
    if (pooledConnection) {
      await this.closeSingleConnection(pooledConnection);
      this.pool.delete(dbPath);
      logger.debug(`[LanceDBConnectionPool] Removed connection for: ${dbPath}`);
    }
  }

  /**
   * Normalize database path
   */
  private normalizePath(dbPath: string): string {
    return path.normalize(dbPath);
  }
}

// Import path module at the end to avoid circular dependencies
import * as path from "path";
