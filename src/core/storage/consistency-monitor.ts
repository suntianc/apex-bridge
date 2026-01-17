/**
 * Background Consistency Monitor for SurrealDB Migration
 *
 * Periodically checks consistency between SQLite (primary) and SurrealDB (secondary)
 * for high-risk domains, repairing any inconsistencies found.
 */

import { logger } from "../../utils/logger";
import type { IStorageAdapter } from "./interfaces";

interface ConsistencyMonitorConfig {
  intervalMs: number;
  sampleSize: number;
  enabled: boolean;
  domains: string[];
}

interface DomainAdapter {
  name: string;
  primary: IStorageAdapter<unknown>;
  secondary: IStorageAdapter<unknown>;
}

export class ConsistencyMonitor {
  private interval: NodeJS.Timeout | null = null;
  private config: ConsistencyMonitorConfig;
  private domains: Map<string, DomainAdapter> = new Map();

  constructor(config: Partial<ConsistencyMonitorConfig> = {}) {
    this.config = {
      intervalMs: config.intervalMs ?? 60000,
      sampleSize: config.sampleSize ?? 100,
      enabled: config.enabled ?? true,
      domains: config.domains ?? [],
    };
  }

  registerDomain(
    name: string,
    primary: IStorageAdapter<unknown>,
    secondary: IStorageAdapter<unknown>
  ): void {
    this.domains.set(name, { name, primary, secondary });
    logger.info(`[ConsistencyMonitor] Registered domain: ${name}`);
  }

  unregisterDomain(name: string): void {
    this.domains.delete(name);
    logger.info(`[ConsistencyMonitor] Unregistered domain: ${name}`);
  }

  start(): void {
    if (this.interval) {
      logger.warn("[ConsistencyMonitor] Already running");
      return;
    }

    if (!this.config.enabled) {
      logger.info("[ConsistencyMonitor] Disabled by configuration");
      return;
    }

    if (this.domains.size === 0) {
      logger.warn("[ConsistencyMonitor] No domains registered");
      return;
    }

    this.interval = setInterval(() => this.check(), this.config.intervalMs);
    logger.info(`[ConsistencyMonitor] Started with interval: ${this.config.intervalMs}ms`);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info("[ConsistencyMonitor] Stopped");
    }
  }

  private async check(): Promise<void> {
    for (const [name, domain] of this.domains) {
      try {
        await this.checkDomain(domain);
      } catch (err) {
        logger.error(`[ConsistencyMonitor] Error checking domain ${name}:`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private async checkDomain(domain: DomainAdapter): Promise<void> {
    const sampleIds = await this.getSampleIds(domain, this.config.sampleSize);
    let checked = 0;
    let repaired = 0;
    let inconsistent = 0;

    for (const id of sampleIds) {
      checked++;
      const isConsistent = await this.verifyAndRepair(domain, id);
      if (!isConsistent) {
        inconsistent++;
        repaired++;
      }
    }

    if (checked > 0) {
      logger.info(
        `[ConsistencyMonitor][${domain.name}] Checked: ${checked}, Inconsistent: ${inconsistent}, Repaired: ${repaired}`
      );
    }
  }

  private async getSampleIds(domain: DomainAdapter, sampleSize: number): Promise<string[]> {
    try {
      const allRecords = await domain.primary.getMany([]);
      const ids = Array.from(allRecords.keys());

      if (ids.length <= sampleSize) {
        return ids;
      }

      const shuffled = ids.sort(() => Math.random() - 0.5);
      return shuffled.slice(0, sampleSize);
    } catch {
      logger.warn(`[ConsistencyMonitor][${domain.name}] Failed to get sample IDs`);
      return [];
    }
  }

  private async verifyAndRepair(domain: DomainAdapter, id: string): Promise<boolean> {
    try {
      const primaryRecord = await domain.primary.get(id);
      if (!primaryRecord) {
        logger.warn(`[ConsistencyMonitor][${domain.name}] Primary record missing: ${id}`);
        return true;
      }

      let secondaryRecord: unknown = null;
      try {
        secondaryRecord = await domain.secondary.get(id);
      } catch {
        logger.warn(
          `[ConsistencyMonitor][${domain.name}] Secondary read failed, attempting repair: ${id}`
        );
      }

      if (!secondaryRecord) {
        (primaryRecord as { id?: string }).id = id;
        await domain.secondary.save(primaryRecord);
        logger.info(`[ConsistencyMonitor][${domain.name}] Repaired missing record: ${id}`);
        return false;
      }

      if (!this.deepEqual(primaryRecord, secondaryRecord)) {
        (primaryRecord as { id?: string }).id = id;
        await domain.secondary.save(primaryRecord);
        logger.warn(`[ConsistencyMonitor][${domain.name}] Repaired inconsistent record: ${id}`);
        return false;
      }

      return true;
    } catch (err) {
      logger.error(`[ConsistencyMonitor][${domain.name}] Verification error for ${id}:`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return true;
    }
  }

  private deepEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  getStatus(): { running: boolean; domainCount: number; config: ConsistencyMonitorConfig } {
    return {
      running: this.interval !== null,
      domainCount: this.domains.size,
      config: this.config,
    };
  }

  getRegisteredDomains(): string[] {
    return Array.from(this.domains.keys());
  }
}

export const consistencyMonitor = new ConsistencyMonitor();
