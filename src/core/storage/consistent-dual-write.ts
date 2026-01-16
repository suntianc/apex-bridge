/**
 * Consistent Dual-Write Adapter for High-Risk Domains
 *
 * Extends standard dual-write with:
 * - Asynchronous verification after write operations
 * - Automatic repair mechanism for consistency issues
 * - Background consistency monitoring support
 */

import type { IStorageAdapter, IQueryableStorage } from "./interfaces";
import type { LLMProviderV2, LLMModelV2, LLMModelFull } from "../../types/llm-models";
import type { ILLMConfigStorage, LLMConfigQuery } from "./interfaces";
import type { IConversationStorage, ConversationQuery, ConversationMessage } from "./interfaces";
import type { Message } from "../../types";
import { logger } from "../../utils/logger";
import {
  ReadWriteSplitAdapter,
  ReadWriteSplitQueryableAdapter,
  ReadWriteSplitConfig,
} from "./read-write-split";

export interface ConsistencyConfig {
  domain: string;
  verifyOnWrite: boolean;
  repairOnFailure: boolean;
  sampleSize: number;
}

export class ConsistentDualWriteAdapter<T> implements IStorageAdapter<T> {
  protected primary: IStorageAdapter<T>;
  protected secondary: IStorageAdapter<T>;
  protected config: ConsistencyConfig;

  constructor(
    primary: IStorageAdapter<T>,
    secondary: IStorageAdapter<T>,
    config: Partial<ConsistencyConfig> = {}
  ) {
    this.primary = primary;
    this.secondary = secondary;
    this.config = {
      domain: config.domain || "Unknown",
      verifyOnWrite: config.verifyOnWrite ?? true,
      repairOnFailure: config.repairOnFailure ?? true,
      sampleSize: config.sampleSize ?? 100,
    };
  }

  async get(id: string): Promise<T | null> {
    return this.primary.get(id);
  }

  async getMany(ids: string[]): Promise<Map<string, T>> {
    return this.primary.getMany(ids);
  }

  async save(entity: T): Promise<string> {
    const id = await this.primary.save(entity);

    this.verifyAndRepair(id).catch((err) => {
      logger.error(`[ConsistentDualWrite][${this.config.domain}] Verification failed for ${id}:`, {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return id;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.primary.delete(id);

    this.secondary
      .delete(id)
      .then(() => {
        logger.debug(
          `[ConsistentDualWrite][${this.config.domain}] Secondary delete succeeded: ${id}`
        );
      })
      .catch((err) => {
        logger.error(`[ConsistentDualWrite][${this.config.domain}] Secondary delete failed:`, {
          id,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return result;
  }

  async deleteMany(ids: string[]): Promise<number> {
    const result = await this.primary.deleteMany(ids);

    this.secondary
      .deleteMany(ids)
      .then((count) => {
        logger.debug(
          `[ConsistentDualWrite][${this.config.domain}] Secondary deleteMany succeeded: ${count}`
        );
      })
      .catch((err) => {
        logger.error(`[ConsistentDualWrite][${this.config.domain}] Secondary deleteMany failed:`, {
          count: ids.length,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return result;
  }

  private async verifyAndRepair(id: string): Promise<void> {
    if (!this.config.verifyOnWrite) {
      return;
    }

    try {
      const primaryRecord = await this.primary.get(id);
      if (!primaryRecord) {
        logger.warn(`[ConsistentDualWrite][${this.config.domain}] Primary record missing: ${id}`);
        return;
      }

      let secondaryRecord: T | null = null;
      try {
        secondaryRecord = await this.secondary.get(id);
      } catch {
        logger.warn(
          `[ConsistentDualWrite][${this.config.domain}] Secondary read failed, attempting repair: ${id}`
        );
      }

      if (!secondaryRecord) {
        await this.secondary.save(primaryRecord);
        logger.info(`[ConsistentDualWrite][${this.config.domain}] Record repaired: ${id}`);
      } else if (!this.deepEqual(primaryRecord, secondaryRecord)) {
        await this.secondary.save(primaryRecord);
        logger.warn(
          `[ConsistentDualWrite][${this.config.domain}] Record out of sync, repaired: ${id}`
        );
      }
    } catch (err) {
      logger.error(`[ConsistentDualWrite][${this.config.domain}] Verify and repair error:`, {
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private deepEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  getConfig(): ConsistencyConfig {
    return this.config;
  }
}

export class ConsistentDualWriteQueryableAdapter<T, Q = Record<string, unknown>>
  extends ConsistentDualWriteAdapter<T>
  implements IQueryableStorage<T, Q>
{
  constructor(
    primary: IQueryableStorage<T, Q>,
    secondary: IQueryableStorage<T, Q>,
    config: Partial<ConsistencyConfig> = {}
  ) {
    super(primary, secondary, config);
  }

  async find(query: Q): Promise<T[]> {
    return (this.primary as IQueryableStorage<T, Q>).find(query);
  }

  async count(query: Q): Promise<number> {
    return (this.primary as IQueryableStorage<T, Q>).count(query);
  }
}

export class ConsistentDualWriteLLMConfigAdapter
  extends ConsistentDualWriteQueryableAdapter<LLMProviderV2, LLMConfigQuery>
  implements ILLMConfigStorage
{
  private primaryLLM: ILLMConfigStorage;

  constructor(
    primary: ILLMConfigStorage,
    secondary: ILLMConfigStorage,
    config: Partial<ConsistencyConfig> = {}
  ) {
    super(primary, secondary, { ...config, domain: config.domain || "LLMConfig" });
    this.primaryLLM = primary;
  }

  async getProviderByName(provider: string): Promise<LLMProviderV2 | null> {
    return this.primaryLLM.getProviderByName(provider);
  }

  async getEnabledProviders(): Promise<string[]> {
    return this.primaryLLM.getEnabledProviders();
  }

  async getModelsByProvider(providerId: string): Promise<LLMModelV2[]> {
    return this.primaryLLM.getModelsByProvider(providerId);
  }

  async getModelByKey(providerId: string, modelKey: string): Promise<LLMModelV2 | null> {
    return this.primaryLLM.getModelByKey(providerId, modelKey);
  }

  async getDefaultModelByType(modelType: string): Promise<LLMModelV2 | null> {
    return this.primaryLLM.getDefaultModelByType(modelType);
  }

  async createProviderWithModels(provider: LLMProviderV2, models: LLMModelV2[]): Promise<string> {
    return this.primaryLLM.createProviderWithModels(provider, models);
  }

  async getAceEvolutionModel(): Promise<LLMModelFull | null> {
    return this.primaryLLM.getAceEvolutionModel();
  }
}

export class ReadWriteSplitLLMConfigAdapter
  extends ReadWriteSplitQueryableAdapter<LLMProviderV2, LLMConfigQuery>
  implements ILLMConfigStorage
{
  private primaryLLM: ILLMConfigStorage;

  constructor(
    primary: ILLMConfigStorage,
    secondary: ILLMConfigStorage | null,
    config: Partial<ReadWriteSplitConfig> = {}
  ) {
    super(primary, secondary, { ...config, domain: config.domain || "LLMConfig" });
    this.primaryLLM = primary;
  }

  async getProviderByName(provider: string): Promise<LLMProviderV2 | null> {
    return this.get(provider) as Promise<LLMProviderV2 | null>;
  }

  async getEnabledProviders(): Promise<string[]> {
    return this.primaryLLM.getEnabledProviders();
  }

  async getModelsByProvider(providerId: string): Promise<LLMModelV2[]> {
    return this.primaryLLM.getModelsByProvider(providerId);
  }

  async getModelByKey(providerId: string, modelKey: string): Promise<LLMModelV2 | null> {
    return this.primaryLLM.getModelByKey(providerId, modelKey);
  }

  async getDefaultModelByType(modelType: string): Promise<LLMModelV2 | null> {
    return this.primaryLLM.getDefaultModelByType(modelType);
  }

  async createProviderWithModels(provider: LLMProviderV2, models: LLMModelV2[]): Promise<string> {
    return this.primaryLLM.createProviderWithModels(provider, models);
  }

  async getAceEvolutionModel(): Promise<LLMModelFull | null> {
    return this.primaryLLM.getAceEvolutionModel();
  }
}

export class ConsistentDualWriteConversationAdapter
  extends ConsistentDualWriteQueryableAdapter<ConversationMessage, ConversationQuery>
  implements IConversationStorage
{
  private primaryConversation: IConversationStorage;
  private secondaryConversation: IConversationStorage;

  constructor(
    primary: IConversationStorage,
    secondary: IConversationStorage,
    config: Partial<ConsistencyConfig> = {}
  ) {
    super(primary, secondary, { ...config, domain: config.domain || "Conversation" });
    this.primaryConversation = primary;
    this.secondaryConversation = secondary;
  }

  async getByConversationId(
    conversationId: string,
    limit?: number,
    offset?: number
  ): Promise<ConversationMessage[]> {
    return this.primaryConversation.getByConversationId(conversationId, limit, offset);
  }

  async getMessageCount(conversationId: string): Promise<number> {
    return this.primaryConversation.getMessageCount(conversationId);
  }

  async getLastMessage(conversationId: string): Promise<ConversationMessage | null> {
    return this.primaryConversation.getLastMessage(conversationId);
  }

  async getFirstMessage(conversationId: string): Promise<ConversationMessage | null> {
    return this.primaryConversation.getFirstMessage(conversationId);
  }

  async deleteByConversationId(conversationId: string): Promise<number> {
    const deleted = await this.primaryConversation.deleteByConversationId(conversationId);

    this.secondaryConversation.deleteByConversationId(conversationId).catch((err) => {
      logger.error("[ConsistentDualWrite][Conversation] Secondary deleteByConversationId failed:", {
        conversationId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return deleted;
  }

  async deleteBefore(timestamp: number): Promise<number> {
    const deleted = await this.primaryConversation.deleteBefore(timestamp);

    this.secondaryConversation.deleteBefore(timestamp).catch((err) => {
      logger.error("[ConsistentDualWrite][Conversation] Secondary deleteBefore failed:", {
        timestamp,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return deleted;
  }

  async saveMessages(conversationId: string, messages: Message[]): Promise<void> {
    await this.primaryConversation.saveMessages(conversationId, messages);

    this.secondaryConversation.saveMessages(conversationId, messages).catch((err) => {
      logger.error("[ConsistentDualWrite][Conversation] Secondary saveMessages failed:", {
        conversationId,
        count: messages.length,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

export class ReadWriteSplitConversationAdapter
  extends ReadWriteSplitAdapter<ConversationMessage>
  implements IConversationStorage
{
  private primaryConversation: IConversationStorage;

  constructor(
    primary: IConversationStorage,
    secondary: IConversationStorage | null,
    config: Partial<ReadWriteSplitConfig> = {}
  ) {
    super(primary, secondary, { ...config, domain: config.domain || "Conversation" });
    this.primaryConversation = primary;
  }

  async find(query: ConversationQuery): Promise<ConversationMessage[]> {
    return this.primaryConversation.find(query);
  }

  async count(query: ConversationQuery): Promise<number> {
    return this.primaryConversation.count(query);
  }

  async getByConversationId(
    conversationId: string,
    limit?: number,
    offset?: number
  ): Promise<ConversationMessage[]> {
    return this.primaryConversation.getByConversationId(conversationId, limit, offset);
  }

  async getMessageCount(conversationId: string): Promise<number> {
    return this.primaryConversation.getMessageCount(conversationId);
  }

  async getLastMessage(conversationId: string): Promise<ConversationMessage | null> {
    return this.primaryConversation.getLastMessage(conversationId);
  }

  async getFirstMessage(conversationId: string): Promise<ConversationMessage | null> {
    return this.primaryConversation.getFirstMessage(conversationId);
  }

  async deleteByConversationId(conversationId: string): Promise<number> {
    return this.primaryConversation.deleteByConversationId(conversationId);
  }

  async deleteBefore(timestamp: number): Promise<number> {
    return this.primaryConversation.deleteBefore(timestamp);
  }

  async saveMessages(
    conversationId: string,
    messages: import("../../types").Message[]
  ): Promise<void> {
    return this.primaryConversation.saveMessages(conversationId, messages);
  }
}
