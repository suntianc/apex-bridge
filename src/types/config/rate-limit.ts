/**
 * 速率限制策略类型
 */
export type RateLimitStrategyType = 'ip' | 'apiKey' | 'user' | 'header';

/**
 * 速率限制策略配置
 */
export interface RateLimitStrategyConfig {
  /** 策略类型 */
  type: RateLimitStrategyType | string;
  /** Header 名称（当 type='header' 时使用） */
  headerName?: string;
  /** 策略描述 */
  description?: string;
}

/**
 * 速率限制匹配器配置
 */
export interface RateLimitMatcherConfig {
  /** 路径匹配 */
  path?: string;
  /** 路径前缀 */
  prefix?: string;
  /** 正则表达式 */
  regex?: string;
  /** HTTP 方法 */
  methods?: string[];
}

/**
 * 速率限制规则配置
 */
export interface RateLimitRuleConfig {
  /** 规则唯一标识 */
  id: string;
  /** 规则名称 */
  name?: string;
  /** 规则描述 */
  description?: string;
  /** 优先级（数值越大优先级越高） */
  priority?: number;
  /** 时间窗口（毫秒） */
  windowMs: number;
  /** 窗口内最大请求数 */
  maxRequests: number;
  /** 匹配策略 */
  strategy: RateLimitStrategyConfig;
  /** 主匹配器 */
  matcher: RateLimitMatcherConfig;
  /** 附加匹配器列表 */
  matchers?: RateLimitMatcherConfig[];
  /** 窗口模式 */
  mode?: 'sliding' | 'fixed';
  /** 策略执行顺序 */
  strategyOrder?: RateLimitStrategyType[];
  /** 是否返回响应头 */
  responseHeaders?: boolean;
  /** 是否跳过成功请求 */
  skipSuccessfulRequests?: boolean;
  /** 是否跳过失败请求 */
  skipFailedRequests?: boolean;
  /** 是否启用 */
  enabled?: boolean;
}

/**
 * 速率限制响应头配置
 */
export interface RateLimitHeadersConfig {
  /** 限制数量头 */
  limit?: string;
  /** 剩余数量头 */
  remaining?: string;
  /** 重置时间头 */
  reset?: string;
  /** 重试后时间头 */
  retryAfter?: string;
}

/**
 * 速率限制设置
 */
export interface RateLimitSettings {
  /** 是否启用 */
  enabled: boolean;
  /** 默认时间窗口（毫秒） */
  windowMs: number;
  /** 默认最大请求数 */
  max: number;
  /** 超出限制时的消息 */
  message?: string;
  /** 是否使用标准响应头 */
  standardHeaders?: boolean;
  /** 是否使用传统响应头 */
  legacyHeaders?: boolean;
  /** 是否信任代理 */
  trustProxy?: boolean;
  /** 速率限制规则 */
  rules?: RateLimitRuleConfig[];
  /** 响应头配置 */
  headers?: RateLimitHeadersConfig;
  /** 默认策略顺序 */
  defaultStrategyOrder?: RateLimitStrategyType[];
  /** 提供商类型 */
  provider?: 'auto' | 'redis' | 'memory';
  /** 键前缀 */
  keyPrefix?: string;
}
