/**
 * ApexBridge (ABP-only) - API认证中间件
 * 专门用于客户端API的认证（使用API Keys）
 * 
 * 注意：
 * - API Key 用于节点之间的认证（WebSocket）
 * - API Keys 用于客户端连接服务器的认证（HTTP API）
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';
import { ConfigService } from '../../services/ConfigService';

const configService = ConfigService.getInstance();

/**
 * 验证 API Key 并记录使用时间
 */
function validateApiKey(token: string): { valid: boolean; apiKeyId?: string } {
  try {
    const config = configService.readConfig();
    const apiKeys = config.auth?.apiKeys || [];
    
    // 查找匹配的 API Key
    const matchedKey = apiKeys.find(apiKey => apiKey.key === token);
    
    if (matchedKey) {
      // 🆕 记录使用时间（异步更新，不阻塞请求）
      updateLastUsedTime(matchedKey.id).catch(err => {
        logger.warn(`⚠️  Failed to update last used time for API key ${matchedKey.id}:`, err);
      });
      
      return { valid: true, apiKeyId: matchedKey.id };
    }
    
    return { valid: false };
  } catch (error) {
    logger.error('❌ Error validating API key:', error);
    return { valid: false };
  }
}

/**
 * 更新 API Key 的上次使用时间（异步）
 */
async function updateLastUsedTime(apiKeyId: string): Promise<void> {
  try {
    const config = configService.readConfig();
    const apiKeys = config.auth?.apiKeys || [];
    const apiKeyIndex = apiKeys.findIndex(k => k.id === apiKeyId);
    
    if (apiKeyIndex >= 0) {
      // 更新 lastUsedAt
      const updatedApiKeys = [...apiKeys];
      updatedApiKeys[apiKeyIndex] = {
        ...updatedApiKeys[apiKeyIndex],
        lastUsedAt: Date.now()
      };
      
      // 更新配置（异步写入，不阻塞）
      configService.updateConfig({
        auth: {
          ...config.auth,
          apiKeys: updatedApiKeys
        }
      });
    }
  } catch (error) {
    // 静默失败，不影响主要认证流程
    logger.debug(`Failed to update API key last used time: ${error}`);
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 检查是否启用认证
  const config = configService.readConfig();
  if (!config.auth?.enabled) {
    // 认证未启用，直接放行
    return next();
  }
  
  // 🆕 跳过某些路径的认证（公共API和静态资源）
  const publicPaths = ['/health', '/metrics', '/vite.svg', '/favicon.ico', '/'];
  if (publicPaths.includes(req.path)) {
    return next();
  }
  
  // 🆕 跳过所有静态资源（.svg, .ico, .png, .jpg等）
  if (/\.(svg|ico|png|jpg|jpeg|gif|css|js|woff|woff2|ttf|eot)$/i.test(req.path)) {
    return next();
  }
  
  // 🆕 对于客户端API，需要验证 API Key（从配置文件读取）
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    logger.warn('⚠️  Request without Authorization header');
    res.status(401).json({
      error: {
        message: 'Missing Authorization header',
        type: 'authentication_error'
      }
    });
    return;
  }
  
  // 验证Bearer token
  const token = authHeader.replace('Bearer ', '');
  
  // 🆕 从配置文件验证 API Key
  const validation = validateApiKey(token);
  
  if (!validation.valid) {
    logger.warn(`⚠️  Invalid API key for ${req.path}`);
    res.status(401).json({
      error: {
        message: 'Invalid API key',
        type: 'authentication_error'
      }
    });
    return;
  }
  
  res.locals.auth = {
    ...(res.locals.auth || {}),
    apiKeyId: validation.apiKeyId,
    apiKeyToken: token
  };

  logger.debug(`✅ API key validated for ${req.path} (key ID: ${validation.apiKeyId})`);
  next();
}
