/**
 * ApexBridge (ABP-only) - 管理后台认证中间件
 * 独立的管理后台认证逻辑，与VCP协议API认证分离
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';
import { ConfigService } from '../../services/ConfigService';
import { isSetupCompleted } from '../../config';
import { verifyJWT, getJWTConfig } from '../../utils/jwt';

const configService = ConfigService.getInstance();

/**
 * 验证旧版 Base64 token（向后兼容）
 */
function validateLegacyToken(token: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [username, timestamp] = decoded.split(':');
    const config = configService.readConfig();
    const adminUser = config.auth?.admin?.username || 'admin';
    
    // 验证用户名匹配且timestamp有效
    if (username === adminUser && timestamp && !isNaN(Number(timestamp))) {
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * 验证管理后台登录token（支持JWT和旧版Base64）
 */
function validateAdminToken(token: string): { valid: boolean; isLegacy?: boolean } {
  // 首先尝试 JWT 验证
  const jwtConfig = getJWTConfig(configService);
  const jwtResult = verifyJWT(token, jwtConfig);
  
  if (jwtResult.valid) {
    // JWT 验证成功，还需要验证用户名
    const config = configService.readConfig();
    const adminUser = config.auth?.admin?.username || 'admin';
    
    if (jwtResult.payload?.username === adminUser) {
      return { valid: true };
    } else {
      logger.warn('⚠️ JWT token username mismatch');
      return { valid: false };
    }
  }

  // JWT 验证失败，尝试旧版 Base64 token（向后兼容）
  if (validateLegacyToken(token)) {
    logger.debug('⚠️ Using legacy Base64 token (deprecated)');
    return { valid: true, isLegacy: true };
  }

  return { valid: false };
}

/**
 * 管理后台认证中间件
 * 只用于保护管理后台API（/api/admin/*），与VCP协议API认证完全独立
 * 
 * 注意：此中间件通过 app.use('/api/admin', adminAuthMiddleware) 应用
 * Express会自动移除路径前缀，所以 req.path 是相对于 /api/admin 的路径
 * 例如：/config, /nodes, /system/status, /auth/login 等
 */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 如果是登录/登出/生成密钥API，跳过认证（路径已经去除了 /api/admin 前缀）
  const unauthenticatedPaths = ['/auth/login', '/auth/logout'];
  if (unauthenticatedPaths.some((openPath) => req.path === openPath || req.path.startsWith(`${openPath}/`))) {
    logger.debug(`✅ Skipping auth for auth API: ${req.path}`);
    return next();
  }
  
  // 如果设置未完成，管理后台API不需要认证
  const setupCompleted = isSetupCompleted();
  if (!setupCompleted) {
    logger.debug(`✅ Admin API (setup not completed, skipping auth): ${req.path}`);
    return next();
  }
  
  // 🆕 设置完成后，需要验证登录token
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    logger.warn(`⚠️  Admin API request without Authorization header: ${req.path}`);
    res.status(401).json({
      error: {
        message: 'Missing Authorization header. Please login first.',
        type: 'authentication_error'
      }
    });
    return;
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  const validationResult = validateAdminToken(token);
  if (!validationResult.valid) {
    logger.warn(`⚠️  Invalid admin token for ${req.path}`);
    res.status(401).json({
      error: {
        message: 'Invalid or expired authentication token. Please login again.',
        type: 'authentication_error'
      }
    });
    return;
  }

  if (validationResult.isLegacy) {
    logger.debug(`⚠️ Legacy token used for ${req.path} (please update to JWT)`);
  }
  
  const config = configService.readConfig();
  const adminUser = config.auth?.admin?.username || 'admin';
  const existingRoles = new Set(res.locals.auth?.roles || []);
  existingRoles.add('admin');

  res.locals.auth = {
    ...(res.locals.auth || {}),
    userId: adminUser,
    roles: Array.from(existingRoles),
    metadata: {
      ...(res.locals.auth?.metadata || {}),
      adminTokenType: validationResult.isLegacy ? 'legacy' : 'jwt'
    }
  };

  logger.debug(`✅ Admin token validated for ${req.path}`);
  next();
}

