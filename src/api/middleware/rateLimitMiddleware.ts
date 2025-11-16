import { NextFunction, Request, Response } from 'express';
import {
  ConfigService,
  RateLimitMatcherConfig,
  RateLimitRuleConfig,
  RateLimitSettings,
  RateLimitStrategyConfig,
  RateLimitWhitelistConfig,
  createDefaultRateLimitSettings
} from '../../services/ConfigService';
import { logger } from '../../utils/logger';
import type { RedisClientType } from 'redis';
import { InMemoryRateLimiter } from './rateLimit/inMemoryRateLimiter';
import { RedisRateLimiter } from './rateLimit/redisRateLimiter';
import { RateLimiter, RateLimiterHitResult, RateLimiterMode } from './rateLimit/types';
import { RedisService } from '../../services/RedisService';

type StrategyType = 'ip' | 'apiKey' | 'user' | 'header';

interface NormalizedStrategy {
  type: StrategyType;
  headerName?: string;
  description?: string;
}

interface NormalizedRateLimitRule {
  id: string;
  name: string;
  description?: string;
  priority: number;
  windowMs: number;
  maxRequests: number;
  mode: RateLimiterMode;
  burstMultiplier: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
  responseHeaders: boolean;
  strategies: NormalizedStrategy[];
  matchers: Array<(req: Request) => boolean>;
  whitelist?: RateLimitWhitelistConfig;
  metadata?: Record<string, unknown>;
}

interface RateLimitHeaderNames {
  limit: string;
  remaining: string;
  reset: string;
  retryAfter: string;
}

interface RateLimitRuntimeConfig {
  enabled: boolean;
  provider: 'auto' | 'redis' | 'memory';
  trustProxy: boolean;
  keyPrefix: string;
  headers: RateLimitHeaderNames;
  globalWhitelist: RateLimitWhitelistConfig;
  rules: NormalizedRateLimitRule[];
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
  limit: 'X-RateLimit-Limit',
  remaining: 'X-RateLimit-Remaining',
  reset: 'X-RateLimit-Reset',
  retryAfter: 'Retry-After'
};

function normalizeSettings(settings: RateLimitSettings): RateLimitRuntimeConfig {
  const headers: RateLimitHeaderNames = {
    limit: settings.headers?.limit || DEFAULT_HEADERS.limit,
    remaining: settings.headers?.remaining || DEFAULT_HEADERS.remaining,
    reset: settings.headers?.reset || DEFAULT_HEADERS.reset,
    retryAfter: settings.headers?.retryAfter || DEFAULT_HEADERS.retryAfter
  };

  const defaultStrategies = settings.defaultStrategyOrder ?? ['apiKey', 'ip'];
  const globalWhitelist: RateLimitWhitelistConfig = {
    ips: normalizeStringArray(settings.whitelist?.ips),
    apiKeys: normalizeStringArray(settings.whitelist?.apiKeys),
    users: normalizeStringArray(settings.whitelist?.users)
  };

  const normalizedRules = (settings.rules || [])
    .map((rule) => normalizeRule(rule, defaultStrategies))
    .filter((rule): rule is NormalizedRateLimitRule => rule !== null)
    .sort((a, b) => a.priority - b.priority);

  return {
    enabled: settings.enabled !== false,
    provider: settings.provider === 'redis' || settings.provider === 'memory' ? settings.provider : 'auto',
    trustProxy: settings.trustProxy !== false,
    keyPrefix: settings.keyPrefix || 'rate_limit',
    headers,
    globalWhitelist,
    rules: normalizedRules
  };
}

function normalizeRule(
  rule: RateLimitRuleConfig,
  fallbackStrategies: Array<string | RateLimitStrategyConfig>
): NormalizedRateLimitRule | null {
  const strategies = (rule.strategyOrder ?? fallbackStrategies)
    .map((candidate) => normalizeStrategy(candidate))
    .filter((strategy): strategy is NormalizedStrategy => strategy !== null);

  if (strategies.length === 0) {
    strategies.push({ type: 'ip' });
  }

  const matchers = (rule.matchers ?? [{ prefix: '/' }])
    .map((matcher) => compileMatcher(matcher))
    .filter((matcher): matcher is (req: Request) => boolean => matcher !== null);

  if (matchers.length === 0) {
    logger.warn(`[RateLimit] 规则 ${rule.id} 缺少有效的匹配器，已跳过`);
    return null;
  }

  const rawMode =
    rule.mode ??
    (typeof rule.metadata?.mode === 'string' ? (rule.metadata.mode as string) : undefined);
  const mode: RateLimiterMode = rawMode === 'fixed' ? 'fixed' : 'sliding';
  const rawBurst =
    typeof rule.burstMultiplier === 'number'
      ? rule.burstMultiplier
      : typeof rule.metadata?.burstMultiplier === 'number'
        ? Number(rule.metadata.burstMultiplier)
        : undefined;
  const burstMultiplier = Math.max(rawBurst ?? 1, 1);

  return {
    id: rule.id,
    name: rule.name ?? rule.id,
    description: rule.description,
    priority: rule.priority ?? 100,
    windowMs: rule.windowMs,
    maxRequests: rule.maxRequests,
    mode,
    burstMultiplier,
    skipSuccessfulRequests: rule.skipSuccessfulRequests ?? false,
    skipFailedRequests: rule.skipFailedRequests ?? false,
    responseHeaders: rule.responseHeaders !== false,
    strategies,
    matchers,
    whitelist: {
      ips: normalizeStringArray(rule.whitelist?.ips),
      apiKeys: normalizeStringArray(rule.whitelist?.apiKeys),
      users: normalizeStringArray(rule.whitelist?.users)
    },
    metadata: rule.metadata
  };
}

function normalizeStrategy(strategy: string | RateLimitStrategyConfig): NormalizedStrategy | null {
  const candidate = typeof strategy === 'string' ? strategy : strategy.type;
  const description = typeof strategy === 'string' ? undefined : strategy.description;
  if (!candidate) {
    return null;
  }

  if (candidate.startsWith('header:')) {
    const headerName = candidate.slice('header:'.length).trim();
    if (!headerName) {
      logger.warn('[RateLimit] Header strategy 缺少 headerName 配置，已忽略');
      return null;
    }
    return { type: 'header', headerName: headerName.toLowerCase(), description };
  }

  const normalized = candidate as StrategyType;
  switch (normalized) {
    case 'apiKey':
    case 'ip':
    case 'user':
      return { type: normalized, headerName: typeof strategy === 'string' ? undefined : strategy.headerName, description };
    case 'header':
      {
        const headerName =
          typeof strategy === 'string'
            ? undefined
            : (strategy.headerName || '').toLowerCase();
        if (!headerName) {
          logger.warn('[RateLimit] Header strategy 缺少 headerName 配置，已忽略');
          return null;
        }
        return { type: 'header', headerName, description };
      }
    default:
      logger.warn(`[RateLimit] 未知的策略类型: ${candidate}`);
      return null;
  }
}

function compileMatcher(config: RateLimitMatcherConfig): ((req: Request) => boolean) | null {
  const methods = config.methods?.map((method) => method.toUpperCase());

  if (config.regex) {
    try {
      const regex = new RegExp(config.regex);
      return (req: Request) =>
        matchMethod(req, methods) && regex.test(req.path);
    } catch (error) {
      logger.warn(`[RateLimit] 无法编译正则: ${config.regex}`, { error });
      return null;
    }
  }

  if (config.path) {
    const path = config.path;
    if (path.includes('*')) {
      const escaped = path
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      const regex = new RegExp(`^${escaped}$`);
      return (req: Request) =>
        matchMethod(req, methods) && regex.test(req.path);
    }

    return (req: Request) => matchMethod(req, methods) && req.path === path;
  }

  if (config.prefix) {
    const prefix = config.prefix.endsWith('/') ? config.prefix : `${config.prefix}`;
    return (req: Request) =>
      matchMethod(req, methods) && req.path.startsWith(prefix);
  }

  logger.warn('[RateLimit] 匹配器配置缺少 path/prefix/regex 信息');
  return null;
}

function matchMethod(req: Request, methods?: string[]): boolean {
  if (!methods || methods.length === 0) {
    return true;
  }
  return methods.includes(req.method.toUpperCase());
}

function normalizeStringArray(input?: string[]): string[] | undefined {
  if (!input || input.length === 0) {
    return undefined;
  }
  const unique = new Set(
    input
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
  );
  return unique.size > 0 ? Array.from(unique) : undefined;
}

function resolveIdentity(
  req: Request,
  res: Response,
  rule: NormalizedRateLimitRule,
  runtime: RateLimitRuntimeConfig
): RateLimitIdentity | null {
  for (const strategy of rule.strategies) {
    const identity = resolveIdentityByStrategy(req, res, strategy, runtime);
    if (identity) {
      return identity;
    }
  }
  return null;
}

function resolveIdentityByStrategy(
  req: Request,
  res: Response,
  strategy: NormalizedStrategy,
  runtime: RateLimitRuntimeConfig
): RateLimitIdentity | null {
  switch (strategy.type) {
    case 'ip': {
      const value = extractClientIp(req, runtime.trustProxy);
      if (!value) return null;
      return {
        strategy: 'ip',
        value,
        key: `ip:${value}`
      };
    }
    case 'apiKey': {
      const localsKey = res.locals.auth?.apiKeyId || res.locals.auth?.apiKeyToken;
      const headerKey =
        (req.headers['x-api-key'] as string | undefined) ??
        extractBearerToken(req.headers.authorization);
      const value = localsKey || headerKey;
      if (!value) return null;
      return {
        strategy: 'apiKey',
        value,
        key: `apiKey:${value}`
      };
    }
    case 'user': {
      const value =
        res.locals.auth?.userId ||
        (req.headers['x-user-id'] as string | undefined) ||
        (req.body && typeof req.body.userId === 'string' ? req.body.userId : undefined) ||
        (req.query.userId as string | undefined);
      if (!value) return null;
      return {
        strategy: 'user',
        value,
        key: `user:${value}`
      };
    }
    case 'header': {
      const headerName = strategy.headerName;
      if (!headerName) {
        return null;
      }
      const value = req.get(headerName);
      if (!value) return null;
      return {
        strategy: 'header',
        value,
        key: `header:${headerName}:${value}`
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
  if (!authHeader.toLowerCase().startsWith('bearer')) {
    return authHeader;
  }
  return authHeader.replace(/^[Bb]earer\s+/u, '').trim();
}

function isWhitelisted(
  identity: RateLimitIdentity,
  res: Response,
  rule: NormalizedRateLimitRule,
  runtime: RateLimitRuntimeConfig
): boolean {
  const ruleWhitelist = rule.whitelist;
  const globalWhitelist = runtime.globalWhitelist;

  if (matchesWhitelist(identity, res, ruleWhitelist)) {
    return true;
  }

  if (matchesWhitelist(identity, res, globalWhitelist)) {
    return true;
  }

  return false;
}

function matchesWhitelist(
  identity: RateLimitIdentity,
  res: Response,
  whitelist?: RateLimitWhitelistConfig
): boolean {
  if (!whitelist) {
    return false;
  }

  switch (identity.strategy) {
    case 'ip':
      return whitelist.ips?.includes(identity.value) ?? false;
    case 'user':
      return whitelist.users?.includes(identity.value) ?? false;
    case 'apiKey': {
      const candidates = [
        identity.value,
        res.locals.auth?.apiKeyId,
        res.locals.auth?.apiKeyToken
      ].filter((value): value is string => Boolean(value));
      return (whitelist.apiKeys || []).some((allowed) => candidates.includes(allowed));
    }
    case 'header':
      return (
        (whitelist.apiKeys?.includes(identity.value) ?? false) ||
        (whitelist.users?.includes(identity.value) ?? false) ||
        (whitelist.ips?.includes(identity.value) ?? false)
      );
    default:
      return false;
  }
}

function applyHeaders(
  res: Response,
  rule: NormalizedRateLimitRule,
  headers: RateLimitHeaderNames,
  data: { limit: number; remaining: number; reset: number; retryAfterSeconds?: number }
): void {
  if (!rule.responseHeaders) {
    return;
  }

  res.setHeader(headers.limit, data.limit);
  res.setHeader(headers.remaining, Math.max(data.remaining, 0));
  res.setHeader(headers.reset, Math.floor(data.reset / 1000));

  if (typeof data.retryAfterSeconds === 'number') {
    res.setHeader(headers.retryAfter, Math.max(data.retryAfterSeconds, 0));
  }
}

function shouldCountRequest(statusCode: number, rule: NormalizedRateLimitRule): boolean {
  const isSuccess = statusCode < 400;
  if (isSuccess && rule.skipSuccessfulRequests) {
    return false;
  }
  if (!isSuccess && rule.skipFailedRequests) {
    return false;
  }
  return true;
}

export function createRateLimitMiddleware(
  options?: RateLimitMiddlewareOptions
) {
  const configService = options?.configService ?? ConfigService.getInstance();
  const fallbackLimiter =
    options?.limiter ?? new InMemoryRateLimiter({ now: options?.clock });
  const redisService = RedisService.getInstance();
  let redisLimiter: RedisRateLimiter | null = null;
  let redisClientRef: RedisClientType<any, any, any> | null = null;

  let cachedSettingsHash: string | null = null;
  let cachedRuntimeConfig: RateLimitRuntimeConfig | null = null;

  const getRuntimeConfig = (): RateLimitRuntimeConfig => {
    const adminConfig = configService.readConfig();
    const settings =
      adminConfig.security?.rateLimit ?? createDefaultRateLimitSettings();

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

      const rule = runtimeConfig.rules.find((candidate) => candidate.matchers.some((matcher) => matcher(req)));

      if (!rule) {
        return next();
      }

      const identity = resolveIdentity(req, res, rule, runtimeConfig);
      if (!identity) {
        logger.debug(`[RateLimit] 无法为规则 ${rule.id} 生成标识，跳过限流`);
        return next();
      }

      if (isWhitelisted(identity, res, rule, runtimeConfig)) {
        logger.debug(`[RateLimit] 标识 ${identity.strategy}:${identity.value} 匹配白名单，跳过限流 (rule=${rule.id})`);
        return next();
      }

      let provider: 'memory' | 'redis' = 'memory';
      let activeLimiter: RateLimiter = fallbackLimiter;
      let limiterUsed: RateLimiter = fallbackLimiter;
      let hitResult: RateLimiterHitResult;

      let redisClient: RedisClientType<any, any, any> | null = null;
      if (runtimeConfig.provider !== 'memory') {
        redisClient = await redisService.getClient();
      }

      const preferRedis = runtimeConfig.provider === 'redis';
      const allowRedis =
        (preferRedis && redisClient !== null) ||
        (runtimeConfig.provider === 'auto' && redisClient !== null);

      if (allowRedis && redisClient) {
        if (!redisLimiter || redisClientRef !== redisClient) {
          redisLimiter = new RedisRateLimiter({
            client: redisClient,
            keyPrefix: runtimeConfig.keyPrefix,
            now: options?.clock
          });
          redisClientRef = redisClient;
        }
        activeLimiter = redisLimiter;
        provider = 'redis';
      } else if (preferRedis && !redisClient) {
        logger.warn('[RateLimit] Redis provider requested but Redis client is unavailable, using in-memory limiter');
      }

      try {
        hitResult = await activeLimiter.hit(identity.key, {
          id: rule.id,
          windowMs: rule.windowMs,
          maxRequests: rule.maxRequests,
          mode: rule.mode,
          burstMultiplier: rule.burstMultiplier
        });
        limiterUsed = activeLimiter;
      } catch (error) {
        if (provider === 'redis') {
          logger.error('[RateLimit] Redis limiter failed, falling back to in-memory limiter', error);
          provider = 'memory';
          hitResult = await fallbackLimiter.hit(identity.key, {
            id: rule.id,
            windowMs: rule.windowMs,
            maxRequests: rule.maxRequests,
            mode: rule.mode,
            burstMultiplier: rule.burstMultiplier
          });
          limiterUsed = fallbackLimiter;
        } else {
          throw error;
        }
      }

      res.locals.rateLimit = {
        ruleId: rule.id,
        key: identity.key,
        strategy: identity.strategy,
        limit: hitResult.limit,
        remaining: hitResult.remaining,
        reset: hitResult.reset,
        exceeded: !hitResult.allowed,
        provider
      };

      if (!hitResult.allowed) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((hitResult.reset - Date.now()) / 1000)
        );

        applyHeaders(res, rule, runtimeConfig.headers, {
          limit: hitResult.limit,
          remaining: 0,
          reset: hitResult.reset,
          retryAfterSeconds
        });

        res.locals.rateLimited = true;

        logger.warn('[RateLimit] 触发限流', {
          ruleId: rule.id,
          strategy: identity.strategy,
          identifier: identity.value,
          path: req.path,
          method: req.method
        });

        // 记录统计
        try {
          const { securityStatsCollector } = require('../../services/SecurityStatsService');
          securityStatsCollector.recordRateLimitRequest(
            true,
            rule.id,
            `${identity.strategy}:${identity.value}`
          );
        } catch (e) {
          // 忽略统计收集错误
        }

        res.status(429).json({
          error: {
            message: 'Rate limit exceeded',
            type: 'rate_limit_exceeded',
            code: 'rate_limit',
            retry_after: retryAfterSeconds,
            limit: hitResult.limit,
            remaining: 0,
            reset: Math.floor(hitResult.reset / 1000),
            rule_id: rule.id,
            strategy: identity.strategy
          }
        });
        return;
      }

      applyHeaders(res, rule, runtimeConfig.headers, {
        limit: hitResult.limit,
        remaining: hitResult.remaining,
        reset: hitResult.reset
      });

      // 记录统计（允许的请求）
      try {
        const { securityStatsCollector } = require('../../services/SecurityStatsService');
        securityStatsCollector.recordRateLimitRequest(false, rule.id);
      } catch (e) {
        // 忽略统计收集错误
      }

      let finalized = false;
      const finalize = () => {
        if (finalized) {
          return;
        }
        finalized = true;

        const shouldKeep = shouldCountRequest(res.statusCode, rule);
        if (!shouldKeep && hitResult.context) {
          limiterUsed
            .undo(hitResult.context)
            .catch((error) => {
              logger.warn('[RateLimit] 回滚限流记录失败', {
                ruleId: rule.id,
                error
              });
            });

          if (res.locals.rateLimit) {
            res.locals.rateLimit.remaining = Math.min(
              hitResult.remaining + 1,
              hitResult.limit
            );
            res.locals.rateLimit.exceeded = false;
          }
        }
      };

      res.once('finish', finalize);
      res.once('close', finalize);
      res.once('error', finalize);

      next();
    } catch (error) {
      logger.error('[RateLimit] 中间件执行异常', { error });
      next(error);
    }
  };
}

export const rateLimitMiddleware = createRateLimitMiddleware();


