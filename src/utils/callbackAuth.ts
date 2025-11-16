/**
 * 插件回调认证工具
 * 支持多种认证方式：API Key、HMAC签名
 */

import * as crypto from 'crypto';
import { logger } from './logger';
import { ConfigService } from '../services/ConfigService';

export interface CallbackAuthOptions {
  configService: ConfigService;
  hmacWindowSeconds?: number;
}

/**
 * HMAC签名验证结果
 */
export interface HMACVerifyResult {
  valid: boolean;
  error?: string;
}

/**
 * 验证回调请求的认证
 * 支持（ABP-only）：
 * 1. API Key验证（从配置中的apiKeys 或 ABP_API_KEY）
 * 2. HMAC签名验证（推荐）
 */
export function verifyCallbackAuth(
  authHeader: string | undefined,
  body: any,
  timestamp: string | undefined,
  signature: string | undefined,
  options: CallbackAuthOptions
): { valid: boolean; method?: string; error?: string } {
  const { configService } = options;
  const hmacWindowSeconds = options.hmacWindowSeconds;

  if (!authHeader) {
    return { valid: false, error: 'Missing Authorization header' };
  }

  // 尝试Bearer Token认证
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const config = configService.readConfig();

    // 1. 验证API Key（优先）
    const apiKeys = config.auth?.apiKeys || [];
    const matchedApiKey = apiKeys.find(apiKey => apiKey.key === token);
    if (matchedApiKey) {
      // 更新使用时间（异步）
      updateApiKeyUsage(matchedApiKey.id, configService).catch(err => {
        logger.warn(`⚠️ Failed to update API key usage:`, err);
      });
      
      logger.debug(`✅ Callback authenticated with API Key: ${matchedApiKey.name}`);
      return { valid: true, method: 'api_key' };
    }

    // 2. 验证环境变量 ABP_API_KEY（单实例便捷方式）
    const envApiKey = process.env.ABP_API_KEY;
    if (envApiKey && token === envApiKey) {
      return { valid: true, method: 'api_key_env' };
    }
  }

  // 3. HMAC签名验证（如果提供了timestamp和signature）
  if (timestamp && signature) {
    const hmacResult = verifyHMACSignature(authHeader, body, timestamp, signature, {
      configService,
      hmacWindowSeconds
    });
    if (hmacResult.valid) {
      logger.debug('✅ Callback authenticated with HMAC signature');
      return { valid: true, method: 'hmac' };
    }
    return { valid: false, error: hmacResult.error };
  }

  return { valid: false, error: 'Invalid authentication token' };
}

/**
 * 验证HMAC签名
 * 签名算法：HMAC-SHA256(Authorization + timestamp + JSON.stringify(body), secret)
 */
export function verifyHMACSignature(
  authHeader: string,
  body: any,
  timestamp: string,
  signature: string,
  options: CallbackAuthOptions
): HMACVerifyResult {
  try {
    const { configService } = options;
    const config = configService.readConfig();

    // 获取用于HMAC的密钥（优先使用节点认证Key apiKey，也可以使用第一个客户端API Key）
    let secret: string | undefined;
    const nodeKey = config.auth?.apiKey;
    if (nodeKey) {
      secret = nodeKey;
    } else {
      const apiKeys = config.auth?.apiKeys || [];
      if (apiKeys.length > 0) {
        secret = apiKeys[0].key;
      }
    }

    if (!secret) {
      return { valid: false, error: 'No secret key configured for HMAC' };
    }

    // 验证时间戳（防止重放攻击）
    const timestampNum = parseInt(timestamp, 10);
    if (isNaN(timestampNum)) {
      return { valid: false, error: 'Invalid timestamp format' };
    }

    const now = Math.floor(Date.now() / 1000);
    const timestampDiff = Math.abs(now - timestampNum);
    const configuredWindow = options.hmacWindowSeconds ?? 300;
    const maxTimestampDiff = Math.max(1, configuredWindow);
    if (timestampDiff > maxTimestampDiff) {
      return {
        valid: false,
        error: `Timestamp outside allowed window (${maxTimestampDiff}s)`
      };
    }

    // 计算期望的签名
    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
    const message = `${authHeader}${timestamp}${bodyString}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('hex');

    // 使用常量时间比较防止时序攻击
    if (signature.length !== expectedSignature.length) {
      return { valid: false, error: 'Invalid signature format' };
    }

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );

    if (!isValid) {
      return { valid: false, error: 'Invalid signature' };
    }

    return { valid: true };
  } catch (error: any) {
    logger.error('HMAC signature verification error:', error);
    return { valid: false, error: error.message || 'Signature verification failed' };
  }
}

/**
 * 生成HMAC签名（用于客户端）
 */
export function generateHMACSignature(
  authHeader: string,
  body: any,
  timestamp: number,
  secret: string
): string {
  const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
  const message = `${authHeader}${timestamp}${bodyString}`;
  
  return crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');
}

/**
 * 异步更新API Key使用时间
 */
async function updateApiKeyUsage(apiKeyId: string, configService: ConfigService): Promise<void> {
  try {
    const config = configService.readConfig();
    const apiKeys = config.auth?.apiKeys || [];
    const apiKey = apiKeys.find(k => k.id === apiKeyId);
    
    if (apiKey) {
      apiKey.lastUsedAt = Date.now();
      configService.updateConfig({
        auth: {
          ...config.auth,
          apiKeys: apiKeys
        }
      });
    }
  } catch (error: any) {
    logger.warn(`⚠️ Failed to update API key usage: ${error.message}`);
  }
}

