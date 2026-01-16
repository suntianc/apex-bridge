/**
 * SurrealDB Storage Adapter
 *
 * Unified adapter that combines all SurrealDB storage operations.
 */

import { SurrealDBClient } from "./client";
import { SurrealDBConversationStorage } from "./conversation";
import { SurrealDBLLMConfigStorage } from "./llm-config";
import { SurrealDBMCPConfigStorage } from "./mcp-config";
import { SurrealDBTrajectoryStorage } from "./trajectory";
import { SurrealDBVectorStorage } from "./vector-storage";
import type {
  IConversationStorage,
  ILLMConfigStorage,
  IMCPConfigStorage,
  ITrajectoryStorage,
  IVectorStorage,
} from "../interfaces";
import { logger } from "../../../utils/logger";

interface SurrealDBStorageAdapterOptions {
  url: string;
  namespace: string;
  database: string;
  username: string;
  password: string;
  timeout?: number;
  maxRetries?: number;
}

export class SurrealDBStorageAdapter {
  private client: SurrealDBClient;
  llmConfig: ILLMConfigStorage;
  mcpConfig: IMCPConfigStorage;
  conversation: IConversationStorage;
  trajectory: ITrajectoryStorage;
  vector: IVectorStorage;

  constructor(options: SurrealDBStorageAdapterOptions) {
    this.client = SurrealDBClient.getInstance();

    if (!this.client.connected) {
      const connectPromise = this.client.connect({
        url: options.url,
        username: options.username,
        password: options.password,
        namespace: options.namespace,
        database: options.database,
        timeout: options.timeout ?? 5000,
        maxRetries: options.maxRetries ?? 3,
      });

      void connectPromise.catch((error: unknown) => {
        logger.error("[SurrealDB] Initial connection failed", { error });
      });
    }

    this.llmConfig = new SurrealDBLLMConfigStorage();
    this.mcpConfig = new SurrealDBMCPConfigStorage();
    this.conversation = new SurrealDBConversationStorage();
    this.trajectory = new SurrealDBTrajectoryStorage();
    this.vector = new SurrealDBVectorStorage();
  }

  async close(): Promise<void> {
    await this.client.disconnect();
  }
}

export type { SurrealDBStorageAdapterOptions };
