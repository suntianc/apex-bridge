import { NextFunction, Request, Response } from "express";
import {
  ConfigService,
  RateLimitRuleConfig,
  RateLimitSettings,
  RateLimitMatcherConfig,
  RateLimitStrategyConfig,
  createDefaultRateLimitSettings,
} from "../../services/ConfigService";
import { logger } from "../../utils/logger";
import { InMemoryRateLimiter } from "./rateLimit/inMemoryRateLimiter";
import { RedisRateLimiter } from "./rateLimit/redisRateLimiter";
import { RateLimiter, RateLimiterMode } from "./rateLimit/types";
import { RedisService } from "../../services/RedisService";
import { tooManyRequests } from "../../utils/http-response";

type StrategyType = "ip" | "apiKey";

interface SimpleRateLimitRule {
  id: string;
  name: string;
  description?: string;
  priority: number;
  windowMs: number;
  maxRequests: number;
  mode: RateLimiterMode;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
  responseHeaders: boolean;
  strategyOrder: StrategyType[];
  matchers: Array<(req: Request) => boolean>;
}

interface RateLimitHeaderNames {
  limit: string;
  remaining: string;
  reset: string;
  retryAfter: string;
}

interface SimpleRateLimitRuntimeConfig {
  enabled: boolean;
  provider: "auto" | "redis" | "memory";
  trustProxy: boolean;
  keyPrefix: string;
  headers: RateLimitHeaderNames;
  rules: SimpleRateLimitRule[];
}

interface RateLimitIdentity {
  strategy: StrategyType;
  value: string;
  key: string;
}

export interface RateLimitMiddlewareOptions {
  configService?: ConfigService;
  limiter?: RateLimiter;
  clock?: () => number;
}

const DEFAULT_HEADERS: RateLimitHeaderNames = {
  limit: "X-RateLimit-Limit",
  remaining: "X-RateLimit-Remaining",
  reset: "X-RateLimit-Reset",
  retryAfter: "Retry-After",
};

function normalizeSettings(settings: RateLimitSettings): SimpleRateLimitRuntimeConfig {
  const headers: RateLimitHeaderNames = {
    limit: settings.headers?.limit || DEFAULT_HEADERS.limit,
    remaining: settings.headers?.remaining || DEFAULT_HEADERS.remaining,
    reset: settings.headers?.reset || DEFAULT_HEADERS.reset,
    retryAfter: settings.headers?.retryAfter || DEFAULT_HEADERS.retryAfter,
  };

  const defaultStrategies: StrategyType[] = (
    settings.defaultStrategyOrder ?? ["apiKey", "ip"]
  ).filter((s): s is StrategyType => s === "ip" || s === "apiKey");

  const normalizedRules = (settings.rules || [])
    .map((rule) => normalizeRule(rule, defaultStrategies))
    .filter((rule): rule is SimpleRateLimitRule => rule !== null)
    .sort((a, b) => a.priority - b.priority);

  return {
    enabled: settings.enabled ?? true,
    provider: settings.provider ?? "auto",
    trustProxy: settings.trustProxy ?? true,
    keyPrefix: settings.keyPrefix ?? "rate_limit",
    headers,
    rules: normalizedRules,
  };
}

function normalizeRule(
  rule: RateLimitRuleConfig,
  defaultStrategies: StrategyType[]
): SimpleRateLimitRule | null {
  if (!rule.id || !rule.name || !rule.windowMs || !rule.maxRequests) {
    logger.warn(`[RateLimit] 规则 ${rule.id || "(unknown)"} 缺少必要字段，已跳过`);
    return null;
  }

  const matchers = (rule.matchers || [])
    .map((matcher) => compileSimpleMatcher(matcher))
    .filter((matcher): matcher is (req: Request) => boolean => matcher !== null);

  if (matchers.length === 0) {
    logger.warn(`[RateLimit] 规则 ${rule.id} 缺少有效的匹配器，已跳过`);
    return null;
  }

  const rawMode = rule.mode ?? "sliding";
  const mode: RateLimiterMode = rawMode === "fixed" ? "fixed" : "sliding";

  const strategyOrder: StrategyType[] = (rule.strategyOrder || defaultStrategies).filter(
    (s): s is StrategyType => s === "ip" || s === "apiKey"
  );

  return {
    id: rule.id,
    name: rule.name,
    description: rule.description,
    priority: rule.priority || 0,
    windowMs: rule.windowMs,
    maxRequests: rule.maxRequests,
    mode,
    skipSuccessfulRequests: rule.skipSuccessfulRequests ?? false,
    skipFailedRequests: rule.skipFailedRequests ?? false,
    responseHeaders: rule.responseHeaders ?? true,
    strategyOrder,
    matchers,
  };
}

function compileSimpleMatcher(config: RateLimitMatcherConfig): ((req: Request) => boolean) | null {
  const methods = config.methods?.map((method) => method.toUpperCase());

  if (config.prefix) {
    const prefix = config.prefix.endsWith("/") ? config.prefix : `${config.prefix}`;
    return (req: Request) => matchMethod(req, methods) && req.path.startsWith(prefix);
  }

  logger.warn("[RateLimit] 匹配器配置缺少 prefix 信息");
  return null;
}

function matchMethod(req: Request, allowedMethods?: string[]): boolean {
  if (!allowedMethods || allowedMethods.length === 0) {
    return true;
  }
  return allowedMethods.includes(req.method?.toUpperCase() || "GET");
}

function resolveIdentity(
  req: Request,
  res: Response,
  rule: SimpleRateLimitRule,
  runtime: SimpleRateLimitRuntimeConfig
): RateLimitIdentity | null {
  for (const strategyType of rule.strategyOrder) {
    const identity = resolveIdentityByStrategy(req, res, strategyType);
    if (identity) {
      return identity;
    }
  }
  return null;
}

function resolveIdentityByStrategy(
  req: Request,
  res: Response,
  strategyType: StrategyType
): RateLimitIdentity | null {
  switch (strategyType) {
    case "ip": {
      const value = extractClientIp(req, true); // 总是启用代理信任
      if (!value) return null;
      return {
        strategy: "ip",
        value,
        key: `ip:${value}`,
      };
    }
    case "apiKey": {
      const localsKey = res.locals.auth?.apiKeyId || res.locals.auth?.apiKeyToken;
      const headerKey =
        (req.headers["x-api-key"] as string | undefined) ??
        extractBearerToken(req.headers.authorization);

      const value = localsKey || headerKey;
      if (!value) return null;
      return {
        strategy: "apiKey",
        value,
        key: `apiKey:${value}`,
      };
    }
    default:
      return null;
  }
}

function extractClientIp(req: Request, trustProxy: boolean): string | null {
  if (trustProxy && Array.isArray(req.ips) && req.ips.length > 0) {
    return req.ips[0];
  }
  if (req.ip) {
    return req.ip;
  }
  return null;
}

function extractBearerToken(authHeader?: string): string | undefined {
  if (!authHeader) {
    return undefined;
  }
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return undefined;
  }
  return parts[1];
}

function applyHeaders(
  res: Response,
  rule: SimpleRateLimitRule,
  headers: RateLimitHeaderNames,
  data: { limit: number; remaining: number; reset: number; retryAfterSeconds?: number }
): void {
  if (!rule.responseHeaders) {
    return;
  }

  res.setHeader(headers.limit, data.limit);
  res.setHeader(headers.remaining, Math.max(data.remaining, 0));
  res.setHeader(headers.reset, Math.floor(data.reset / 1000));

  if (typeof data.retryAfterSeconds === "number") {
    res.setHeader(headers.retryAfter, Math.max(data.retryAfterSeconds, 0));
  }
}

function shouldCountRequest(statusCode: number, rule: SimpleRateLimitRule): boolean {
  if (rule.skipSuccessfulRequests && statusCode >= 200 && statusCode < 300) {
    return false;
  }
  if (rule.skipFailedRequests && statusCode >= 400) {
    return false;
  }
  return true;
}

export function createRateLimitMiddleware(options?: RateLimitMiddlewareOptions) {
  const configService = options?.configService ?? ConfigService.getInstance();
  const fallbackLimiter = options?.limiter ?? new InMemoryRateLimiter({ now: options?.clock });
  const redisService = RedisService.getInstance();
  let redisLimiter: RedisRateLimiter | null = null;
  let redisClientRef: any = null;

  let cachedSettingsHash: string | null = null;
  let cachedRuntimeConfig: SimpleRateLimitRuntimeConfig | null = null;

  const getRuntimeConfig = (): SimpleRateLimitRuntimeConfig => {
    const adminConfig = configService.readConfig();
    const settings = adminConfig.security?.rateLimit ?? createDefaultRateLimitSettings();

    const serialized = JSON.stringify(settings);
    if (cachedRuntimeConfig && cachedSettingsHash === serialized) {
      return cachedRuntimeConfig;
    }

    cachedRuntimeConfig = normalizeSettings(settings);
    cachedSettingsHash = serialized;
    return cachedRuntimeConfig;
  };

  return async function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const runtimeConfig = getRuntimeConfig();

      if (!runtimeConfig.enabled) {
        return next();
      }

      const rule = runtimeConfig.rules.find((candidate) =>
        candidate.matchers.some((matcher) => matcher(req))
      );

      if (!rule) {
        return next();
      }

      const identity = resolveIdentity(req, res, rule, runtimeConfig);
      if (!identity) {
        return next();
      }

      const key = `${runtimeConfig.keyPrefix}:${rule.id}:${identity.key}`;
      let limiter: RateLimiter = fallbackLimiter;

      if (runtimeConfig.provider === "redis") {
        if (!redisLimiter) {
          try {
            const redisClient = await redisService.getClient();
            if (redisClient) {
              redisClientRef = redisClient;
              redisLimiter = new RedisRateLimiter({ client: redisClient });
            }
          } catch (error: any) {
            logger.warn("[RateLimit] Redis client unavailable, using memory limiter");
          }
        }

        if (redisLimiter) {
          limiter = redisLimiter;
        }
      }

      const result = await limiter.hit(key, {
        id: rule.id,
        windowMs: rule.windowMs,
        maxRequests: rule.maxRequests,
        mode: rule.mode,
      });

      if (result.allowed) {
        applyHeaders(res, rule, runtimeConfig.headers, {
          limit: rule.maxRequests,
          remaining: result.remaining,
          reset: result.reset,
        });

        res.on("finish", () => {
          if (!shouldCountRequest(res.statusCode, rule) && identity && result.context) {
            limiter.undo?.(result.context).catch((error: any) => {
              logger.warn("[RateLimit] Failed to undo rate limit hit", { error });
            });
          }
        });

        next();
        return;
      }

      applyHeaders(res, rule, runtimeConfig.headers, {
        limit: rule.maxRequests,
        remaining: 0,
        reset: result.reset,
      });

      const retryAfterSeconds = result.reset
        ? Math.ceil((result.reset - Date.now()) / 1000)
        : undefined;

      tooManyRequests(res, `Rate limit exceeded for ${rule.name}`, retryAfterSeconds);
    } catch (error: any) {
      logger.error("[RateLimit] Rate limit middleware error", { error });
      next();
    }
  };
}

export const rateLimitMiddleware = createRateLimitMiddleware();
