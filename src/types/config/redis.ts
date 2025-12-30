/**
 * Redis 配置
 */
export interface RedisConfig {
  /** 是否启用 */
  enabled: boolean;
  /** Redis 主机地址 */
  host?: string;
  /** Redis 端口 */
  port?: number;
  /** 密码 */
  password?: string;
  /** 数据库编号 */
  db?: number;
  /** 键前缀 */
  keyPrefix?: string;
  /** 连接 URL */
  url?: string;
  /** Socket 配置 */
  socket?: {
    host?: string;
    port?: number;
  };
  /** 连接超时（毫秒） */
  connectTimeout?: number;
  /** 连接超时（毫秒，兼容旧名称） */
  connectTimeoutMs?: number;
  /** 延迟连接 */
  lazyConnect?: boolean;
  /** 每个请求最大重试次数 */
  maxRetriesPerRequest?: number;
  /** 故障转移重试延迟（毫秒） */
  retryDelayOnFailover?: number;
  /** 用户名 */
  username?: string;
  /** TLS 配置：true 启用TLS，对象传递证书配置 */
  tls?: boolean | Record<string, unknown>;
}
