import { createClient } from "redis";
import { logger } from "../utils/logger";
import { ConfigService, RedisConfig } from "./ConfigService";

// ⚡️ 优化类型推导
type ClientType = ReturnType<typeof createClient>;

export class RedisService {
  private static instance: RedisService;
  private client: ClientType | null = null;
  private initializing: Promise<ClientType | null> | null = null;

  private constructor() {
    // 构造函数中不预加载配置，保持懒加载特性
    // 配置会在 getClient 时读取（依赖 ConfigService 的内部缓存）
  }

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

    // ⚡️ 增加 isOpen 检查更稳妥
    if (this.client && this.client.isOpen) {
      return this.client;
    }

    if (this.initializing) {
      return this.initializing;
    }

    // 开始初始化
    this.initializing = (async () => {
      let client: ClientType | null = null;
      try {
        client = this.createClient(redisConfig);
        if (!client) {
          throw new Error("Failed to create client instance");
        }

        await client.connect();

        logger.info("[RedisService] ✅ Redis client connected");
        this.client = client;
        return client;
      } catch (error) {
        logger.error("[RedisService] ❌ Failed to connect to Redis", error);

        if (client) {
          try {
            await client.disconnect();
          } catch {
            // ignore disconnect errors
          }
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
      // 🛠️ 修复：正确处理 TLS 配置
      // 如果 tls 是对象（包含 ca/cert/key），需要传递给 socket.tls
      // 如果 tls 是 true，则仅开启 TLS
      // 如果 tls 是 false/undefined，则不使用 TLS
      const tlsOptions =
        redisConfig.tls === true
          ? true // 仅开启 TLS，使用默认配置
          : typeof redisConfig.tls === "object" && redisConfig.tls !== null
            ? redisConfig.tls
            : false; // 传递证书对象或 false

      const socketConfig: any = {
        host: redisConfig.host,
        port: redisConfig.port,
        connectTimeout: redisConfig.connectTimeoutMs || 5000,
        keepAlive: 5000,
        // ⚡️ 建议：添加重试策略，防止无限挂起
        reconnectStrategy: (retries: number) => {
          if (retries > 20) {
            return new Error("Redis retry exhausted after 20 attempts");
          }
          // 指数退避，最大 3秒
          return Math.min(retries * 100, 3000);
        },
      };

      // 处理 TLS 配置
      // node-redis v4: socket.tls 可以是 boolean 或 TLS 配置对象
      if (tlsOptions !== false) {
        socketConfig.tls = tlsOptions;
      }

      const client = createClient({
        url: redisConfig.url, // 如果 url 存在，通常会覆盖 socket 中的 host/port
        socket: socketConfig,
        username: redisConfig.username,
        password: redisConfig.password,
        database: redisConfig.db,
        legacyMode: false,
        // ⚠️ 移除 maxRetriesPerRequest 的错误映射
        // maxRetriesPerRequest 在 node-redis 中不是 commandsQueueMaxLength
        // 如果需要控制队列长度，应该使用其他配置项
      });

      client.on("error", (err: any) => {
        // 忽略连接过程中的一些噪音错误，只记录严重的
        logger.error("[RedisService] ⚠️ Redis error event:", err?.message || err);
      });

      client.on("end", () => {
        logger.warn("[RedisService] ⚠️ Redis connection ended");
        this.client = null;
      });

      client.on("reconnecting", () => {
        logger.info("[RedisService] 🔁 Redis reconnecting...");
      });

      return client;
    } catch (error) {
      logger.error("[RedisService] ❌ Failed to create Redis client configuration", error);
      return null;
    }
  }
}
