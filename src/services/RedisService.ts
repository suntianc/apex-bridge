import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';
import { ConfigService, RedisConfig } from './ConfigService';

type ClientType = RedisClientType<any, any, any>;

export class RedisService {
  private static instance: RedisService;
  private client: ClientType | null = null;
  private initializing: Promise<ClientType | null> | null = null;

  private constructor() {}

  public static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  public async getClient(): Promise<ClientType | null> {
    const configService = ConfigService.getInstance();
    const adminConfig = configService.readConfig();
    const redisConfig = adminConfig.redis;

    if (!redisConfig?.enabled) {
      return null;
    }

    if (this.client) {
      return this.client;
    }

    if (this.initializing) {
      return this.initializing;
    }

    const client = this.createClient(redisConfig);
    if (!client) {
      this.initializing = null;
      return Promise.resolve(null);
    }

    this.initializing = (async () => {
      try {
        await client.connect();
        logger.info('[RedisService] ✅ Redis client connected');
        this.client = client;
        return client;
      } catch (error) {
        logger.error('[RedisService] ❌ Failed to connect to Redis', error);
        try {
          await client.disconnect();
        } catch {
          // ignore
        }
        return null;
      } finally {
        this.initializing = null;
      }
    })();

    return this.initializing;
  }

  private createClient(redisConfig: RedisConfig): ClientType | null {
    try {
      const client = createClient({
        url: redisConfig.url,
        socket: {
          host: redisConfig.host,
          port: redisConfig.port,
          tls: redisConfig.tls ? true : false,
          connectTimeout: redisConfig.connectTimeoutMs,
          keepAlive: 5000
        },
        username: redisConfig.username,
        password: redisConfig.password,
        database: redisConfig.db,
        legacyMode: false,
        ...(typeof redisConfig.maxRetriesPerRequest === 'number' && {
          commandsQueueMaxLength: redisConfig.maxRetriesPerRequest
        })
      });

      client.on('error', (err: unknown) => {
        logger.error('[RedisService] ⚠️ Redis error', err);
      });

      client.on('end', () => {
        logger.warn('[RedisService] ⚠️ Redis connection closed');
        this.client = null;
      });

      client.on('reconnecting', () => {
        logger.info('[RedisService] 🔁 Redis reconnecting...');
      });

      return client;
    } catch (error) {
      logger.error('[RedisService] ❌ Failed to create Redis client', error);
      return null;
    }
  }
}


