/**
 * MCPConfigService - MCP 配置管理服务
 *
 * 负责MCP服务器配置的持久化存储和管理
 */

import type { MCPServerRecord } from "../core/storage/interfaces";
import type { MCPServerConfig } from "../types/mcp";
import type { IMCPConfigStorage } from "../core/storage/interfaces";
import { logger } from "../utils/logger";
import { StorageAdapterFactory } from "../core/storage/adapter-factory";

export class MCPConfigService {
  private static instance: MCPConfigService | null = null;
  private storage: IMCPConfigStorage;

  private constructor(storage: IMCPConfigStorage) {
    this.storage = storage;
    logger.debug("[MCPConfigService] Initialized with storage adapter");
  }

  public static async initialize(): Promise<void> {
    if (!MCPConfigService.instance) {
      const storage = StorageAdapterFactory.getMCPConfigStorage();
      MCPConfigService.instance = new MCPConfigService(storage);
    }
  }

  public static getInstance(): MCPConfigService {
    if (!MCPConfigService.instance) {
      throw new Error("[MCPConfigService] Not initialized. Call initialize() first.");
    }
    return MCPConfigService.instance;
  }

  public static resetInstance(): void {
    MCPConfigService.instance = null;
  }

  async saveServer(config: MCPServerConfig): Promise<void> {
    try {
      await this.storage.upsertServer(config);
      logger.debug(`[MCPConfigService] Server ${config.id} saved`);
    } catch (error: unknown) {
      logger.error(`[MCPConfigService] Failed to save server ${config.id}:`, error);
      throw error;
    }
  }

  async deleteServer(serverId: string): Promise<void> {
    try {
      await this.storage.delete(serverId);
      logger.debug(`[MCPConfigService] Server ${serverId} deleted`);
    } catch (error: unknown) {
      logger.error(`[MCPConfigService] Failed to delete server ${serverId}:`, error);
      throw error;
    }
  }

  async getAllServers(): Promise<MCPServerRecord[]> {
    try {
      return await this.storage.find({});
    } catch (error: unknown) {
      logger.error("[MCPConfigService] Failed to get all servers:", error);
      throw error;
    }
  }

  async getServer(serverId: string): Promise<MCPServerRecord | undefined> {
    try {
      const server = await this.storage.getByServerId(serverId);
      return server ?? undefined;
    } catch (error: unknown) {
      logger.error(`[MCPConfigService] Failed to get server ${serverId}:`, error);
      throw error;
    }
  }

  async exists(serverId: string): Promise<boolean> {
    try {
      return await this.storage.exists(serverId);
    } catch (error: unknown) {
      logger.error(`[MCPConfigService] Failed to check server ${serverId}:`, error);
      return false;
    }
  }
}
