/**
 * Plugin Callback API
 * 
 * 异步插件回调端点
 * 接收异步插件的执行结果回调
 * 
 * @module api/plugin-callback
 */

import { Router, Request, Response } from 'express';
import { AsyncResultData } from '../types/async-result';
import { logger } from '../utils/logger';
import { verifyCallbackAuth } from '../utils/callbackAuth';
import { ConfigService } from '../services/ConfigService';

const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX = 60;
const MIN_RATE_LIMIT_WINDOW_MS = 1_000;
const MIN_RATE_LIMIT_MAX = 1;
const DEFAULT_HMAC_WINDOW_SECONDS = 60;

interface RateBucket {
  count: number;
  resetAt: number;
}

export interface PluginCallbackDependencies {
  protocolEngine: any; // ProtocolEngine instance
  webSocketManager?: any; // WebSocketManager instance (optional)
  config: any;
  configService?: ConfigService; // ConfigService instance (optional, will create if not provided)
}

/**
 * 创建插件回调路由
 */
export function createPluginCallbackRouter(deps: PluginCallbackDependencies): Router {
  const router = Router();
  const { protocolEngine, webSocketManager } = deps;
  const configService = deps.configService || ConfigService.getInstance();

  const rateBuckets = new Map<string, RateBucket>();

  const loadPluginCallbackConfig = () => configService.readConfig().pluginCallback ?? {};

  const respondError = (res: Response, status: number, code: string, message: string): Response => {
    return res.status(status).json({ error: code, message });
  };

  router.post('/:pluginName/:taskId', async (req: Request, res: Response) => {
    const { pluginName, taskId } = req.params;
    const callbackData = req.body;

    logger.info(`[PluginCallback] Received callback for ${pluginName}::${taskId}`);

    try {
      const pluginCallbackConfig = loadPluginCallbackConfig();
      const allowLegacyVcpKey = pluginCallbackConfig.allowLegacyVcpKey ?? false;
      const hmacWindowSeconds = pluginCallbackConfig.hmacWindowSeconds ?? DEFAULT_HMAC_WINDOW_SECONDS;
      const rateLimitConfig = {
        enabled: pluginCallbackConfig.rateLimit?.enabled !== false,
        windowMs: pluginCallbackConfig.rateLimit?.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS,
        max: pluginCallbackConfig.rateLimit?.max ?? DEFAULT_RATE_LIMIT_MAX
      };

      const normalizedWindowMs = Math.max(MIN_RATE_LIMIT_WINDOW_MS, rateLimitConfig.windowMs);
      const normalizedMax = Math.max(MIN_RATE_LIMIT_MAX, rateLimitConfig.max);

      if (rateLimitConfig.enabled) {
        const now = Date.now();

        if (rateBuckets.size > 1000) {
          rateBuckets.forEach((bucket, key) => {
            if (bucket.resetAt <= now) {
              rateBuckets.delete(key);
            }
          });
        }

        const bucketKey = `${req.ip || 'unknown'}::${pluginName}`;
        const existing = rateBuckets.get(bucketKey);

        if (!existing || now >= existing.resetAt) {
          rateBuckets.set(bucketKey, { count: 1, resetAt: now + normalizedWindowMs });
        } else if (existing.count >= normalizedMax) {
          logger.warn(`⚠️ [PluginCallback] Rate limit exceeded for ${bucketKey} (window=${normalizedWindowMs}ms, max=${normalizedMax})`);
          return respondError(res, 429, 'too_many_requests', 'Too many callback requests, please retry later.');
        } else {
          existing.count += 1;
        }
      }

      const authHeader = req.headers.authorization;
      const timestamp = req.headers['x-timestamp'] as string;
      const signature = req.headers['x-signature'] as string;

      const authResult = verifyCallbackAuth(
        authHeader,
        callbackData,
        timestamp,
        signature,
        {
          configService,
          hmacWindowSeconds
        }
      );

      if (!authResult.valid) {
        logger.warn(`[PluginCallback] Authentication failed for ${pluginName}::${taskId}: ${authResult.error}`);
        return respondError(res, 401, 'unauthorized', authResult.error || 'Invalid or missing authentication token');
      }

      logger.debug(`[PluginCallback] Authenticated using method: ${authResult.method}`);

      if (!pluginName || !taskId) {
        logger.warn(`[PluginCallback] Invalid parameters: pluginName=${pluginName}, taskId=${taskId}`);
        return respondError(res, 400, 'invalid_request', 'Missing pluginName or taskId');
      }

      const resultData: AsyncResultData = {
        requestId: taskId,
        status: callbackData.status || 'Succeed',
        timestamp: Date.now(),
        pluginName: pluginName,
        ...callbackData
      };

      const asyncResultProvider = protocolEngine.variableEngine?.providers?.get?.('AsyncResultProvider');

      if (!asyncResultProvider) {
        logger.error('[PluginCallback] AsyncResultProvider not found in ProtocolEngine');
        return respondError(res, 500, 'internal_error', 'AsyncResultProvider not available');
      }

      await asyncResultProvider.saveAsyncResult(pluginName, taskId, resultData);

      logger.info(`[PluginCallback] Successfully saved result for ${pluginName}::${taskId}`);

      if (webSocketManager) {
        try {
          const abpLogChannel = webSocketManager.getChannel?.('ABPLog');

          if (abpLogChannel) {
            let friendlyContent = resultData.message || resultData.content;

            if (!friendlyContent && resultData.status === 'Succeed') {
              friendlyContent = '异步任务完成';
            } else if (!friendlyContent && resultData.status === 'Failed') {
              friendlyContent = `异步任务失败: ${resultData.reason || '未知原因'}`;
            }

            (abpLogChannel as any).pushToolLog?.({
              status: resultData.status === 'Succeed' ? 'success' : 'error',
              tool: pluginName,
              content: friendlyContent || JSON.stringify(resultData).substring(0, 200),
              source: 'async_callback'
            });

            logger.debug(`[PluginCallback] Pushed notification to ABPLog for ${pluginName}::${taskId}`);
          }
        } catch (wsError) {
          logger.warn(`[PluginCallback] WebSocket push failed (non-critical):`, wsError);
        }
      }

      res.json({
        status: 'success',
        message: 'Callback received and result saved',
        taskId,
        pluginName
      });
    } catch (error: any) {
      logger.error(`[PluginCallback] Error processing callback for ${pluginName}::${taskId}:`, error);
      return respondError(res, 500, 'internal_error', 'Failed to process callback');
    }
  });

  return router;
}

