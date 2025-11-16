/**
 * AdminController - 管理后台通用API控制器
 */

import { Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { ConfigService } from '../../services/ConfigService';
import { NodeService } from '../../services/NodeService';
import { generateJWT, getJWTConfig } from '../../utils/jwt';
import { createError } from '../../utils/errors';
import * as os from 'os';

const configService = ConfigService.getInstance();
const nodeService = NodeService.getInstance();

/**
 * 获取系统状态
 * GET /api/admin/system/status
 */
export async function getSystemStatus(req: Request, res: Response): Promise<void> {
  try {
    const config = configService.readConfig();
    const nodes = nodeService.getAllNodes();
    
    const onlineNodes = nodes.filter(n => n.status === 'online');
    const offlineNodes = nodes.filter(n => n.status === 'offline');
    
    res.json({
      success: true,
      status: {
        server: {
          running: true,
          uptime: process.uptime(),
          memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            systemTotal: Math.round(os.totalmem() / 1024 / 1024),
            systemFree: Math.round(os.freemem() / 1024 / 1024)
          },
          cpu: {
            usage: process.cpuUsage(),
            cores: os.cpus().length
          }
        },
        nodes: {
          total: nodes.length,
          online: onlineNodes.length,
          offline: offlineNodes.length
        },
        config: {
          setup_completed: config.setup_completed || false
        }
      }
    });
  } catch (error: any) {
    logger.error('❌ Failed to get system status:', error);
    res.status(500).json({
      error: 'Failed to get system status',
      message: error.message
    });
  }
}

/**
 * 获取统计信息
 * GET /api/admin/system/stats
 */
export async function getSystemStats(req: Request, res: Response): Promise<void> {
  try {
    // TODO: 实现实际的统计信息收集
    // 目前返回基础统计信息
    res.json({
      success: true,
      stats: {
        requests: {
          today: 0, // TODO: 从日志或统计服务获取
          total: 0
        },
        conversations: {
          today: 0,
          total: 0
        },
        nodes: {
          active: nodeService.getAllNodes().filter(n => n.status === 'online').length,
          total: nodeService.getAllNodes().length
        }
      }
    });
  } catch (error: any) {
    logger.error('❌ Failed to get system stats:', error);
    res.status(500).json({
      error: 'Failed to get system stats',
      message: error.message
    });
  }
}

/**
 * 获取安全统计信息
 * GET /api/admin/system/security-stats
 */
export async function getSecurityStats(req: Request, res: Response): Promise<void> {
  try {
    const { securityStatsCollector } = require('../../services/SecurityStatsService');
    const stats = securityStatsCollector.getStats();
    
    res.json({
      success: true,
      stats
    });
  } catch (error: any) {
    logger.error('❌ Failed to get security stats:', error);
    res.status(500).json({
      error: 'Failed to get security stats',
      message: error.message
    });
  }
}

/**
 * 获取安全告警列表
 * GET /api/admin/system/security-alerts
 */
export async function getSecurityAlerts(req: Request, res: Response): Promise<void> {
  try {
    const { securityAlertService } = require('../../services/SecurityAlertService');
    const limit = parseInt(req.query.limit as string) || 100;
    const alerts = securityAlertService.getAlerts(limit);
    
    res.json({
      success: true,
      alerts
    });
  } catch (error: any) {
    logger.error('❌ Failed to get security alerts:', error);
    res.status(500).json({
      error: 'Failed to get security alerts',
      message: error.message
    });
  }
}

/**
 * 确认安全告警
 * POST /api/admin/system/security-alerts/:id/acknowledge
 */
export async function acknowledgeSecurityAlert(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { securityAlertService } = require('../../services/SecurityAlertService');
    securityAlertService.acknowledgeAlert(id);
    
    res.json({
      success: true,
      message: 'Alert acknowledged'
    });
  } catch (error: any) {
    logger.error('❌ Failed to acknowledge security alert:', error);
    res.status(500).json({
      error: 'Failed to acknowledge security alert',
      message: error.message
    });
  }
}

/**
 * 管理员登录（使用JWT认证）
 * POST /api/admin/auth/login
 */
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      throw createError.validation('Username and password are required');
    }
    
    // 从配置中读取管理员账户
    const config = configService.readConfig();
    const adminUser = config.auth?.admin?.username || 'admin';
    const adminPassword = config.auth?.admin?.password || 'admin';
    
    if (username === adminUser && password === adminPassword) {
      // 生成 JWT token
      const jwtConfig = getJWTConfig(configService);
      const token = generateJWT(
        { username },
        jwtConfig
      );
      
      logger.info(`✅ Admin user logged in: ${username}`);
      
      res.json({
        success: true,
        token: token,
        user: {
          username: username
        },
        expiresIn: jwtConfig.expiresIn
      });
    } else {
      logger.warn(`⚠️ Failed login attempt for user: ${username}`);
      throw createError.authentication('Invalid credentials');
    }
  } catch (error: any) {
    // 让errorHandler中间件处理错误
    throw error;
  }
}

/**
 * 登出
 * POST /api/admin/auth/logout
 * 
 * 注意：JWT token是无状态的，无法主动失效。
 * 客户端需要删除本地存储的token。
 * 未来可以实现token黑名单机制来主动失效token。
 */
export async function logout(req: Request, res: Response): Promise<void> {
  try {
    // JWT token是无状态的，服务端无法主动失效
    // 客户端应该删除本地存储的token
    // TODO: 未来可以实现token黑名单机制（Redis等）来支持主动失效
    res.json({
      success: true,
      message: 'Logged out successfully. Please delete the token from client storage.'
    });
  } catch (error: any) {
    logger.error('❌ Failed to logout:', error);
    res.status(500).json({
      error: 'Failed to logout',
      message: error.message
    });
  }
}

/**
 * 🆕 生成节点认证Key（节点之间的认证，原VCP Key，现改为API Key）
 * POST /api/admin/auth/generate-node-key
 * @deprecated 旧路由 /api/admin/auth/generate-vcp-key 已废弃
 */
export async function generateVCPKey(req: Request, res: Response): Promise<void> {
  // 向后兼容：调用新的generateNodeKey
  return generateNodeKey(req, res);
}

/**
 * 🆕 生成节点认证Key（节点之间的认证，用于WebSocket连接）
 * POST /api/admin/auth/generate-node-key
 */
export async function generateNodeKey(req: Request, res: Response): Promise<void> {
  try {
    const crypto = require('crypto');
    
    // 生成节点认证Key
    // 格式: sk-apexbridge-{timestamp}-{random1}-{random2}
    const prefix = 'sk-apexbridge-';
    const timestamp = Date.now().toString(36); // 时间戳的36进制表示
    const randomPart1 = crypto.randomBytes(8).toString('base64url').slice(0, 12); // base64url编码的随机部分
    const randomPart2 = crypto.randomBytes(8).toString('hex').slice(0, 8); // hex编码的随机部分
    
    const generatedKey = `${prefix}${timestamp}-${randomPart1}-${randomPart2}`;
    
    // 更新配置中的 apiKey
    const config = configService.readConfig();
    const updatedAuth = {
      ...config.auth,
      apiKey: generatedKey
    };
    configService.updateConfig({
      auth: updatedAuth
    });
    
    logger.info('✅ Node authentication key generated');
    
    res.json({
      success: true,
      key: generatedKey
    });
  } catch (error: any) {
    logger.error('❌ Failed to generate node authentication key:', error);
    res.status(500).json({
      error: 'Failed to generate node authentication key',
      message: error.message
    });
  }
}

/**
 * 🆕 生成客户端API Key（客户端连接用，HTTP API认证）
 * POST /api/admin/auth/api-keys
 */
export async function generateClientApiKey(req: Request, res: Response): Promise<void> {
  try {
    const { name } = req.body;
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw createError.validation('API Key name is required');
    }
    
    const crypto = require('crypto');
    
    // 生成复杂的 API Key
    // 格式: sk-intellicore-api-{timestamp}-{random1}-{random2}
    const prefix = 'sk-intellicore-api-';
    const timestamp = Date.now().toString(36);
    const randomPart1 = crypto.randomBytes(8).toString('base64url').slice(0, 12);
    const randomPart2 = crypto.randomBytes(8).toString('hex').slice(0, 8);
    
    const generatedKey = `${prefix}${timestamp}-${randomPart1}-${randomPart2}`;
    const apiKeyId = `api-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    
    // 添加到配置
    const config = configService.readConfig();
    const apiKeys = config.auth?.apiKeys || [];
    const newApiKey = {
      id: apiKeyId,
      name: name.trim(),
      key: generatedKey,
      createdAt: Date.now(),
      lastUsedAt: undefined,
      ownerId: undefined
    };
    
    // 保留 auth 的所有字段（admin 等）
    const updatedApiKeys = [...apiKeys, newApiKey];
    
    configService.updateConfig({
      auth: {
        ...config.auth,
        apiKeys: updatedApiKeys
      }
    });
    
    // 🆕 验证保存是否成功（调试用）
    const savedConfig = configService.readConfig();
    if (savedConfig.auth?.apiKeys?.length !== updatedApiKeys.length) {
      logger.error(`❌ API Key save verification failed: expected ${updatedApiKeys.length}, got ${savedConfig.auth?.apiKeys?.length || 0}`);
    } else {
      logger.info(`✅ API Key saved successfully: ${name} (${apiKeyId}), total keys: ${updatedApiKeys.length}`);
    }
    
    logger.info(`✅ API Key generated: ${name} (${apiKeyId})`);
    
    res.json({
      success: true,
      apiKey: newApiKey
    });
  } catch (error: any) {
    logger.error('❌ Failed to generate API Key:', error);
    res.status(500).json({
      error: 'Failed to generate API Key',
      message: error.message
    });
  }
}

/**
 * 🆕 获取所有 API Keys
 * GET /api/admin/auth/api-keys
 */
export async function listApiKeys(req: Request, res: Response): Promise<void> {
  try {
    const config = configService.readConfig();
    const apiKeys = config.auth?.apiKeys || [];
    
    // 返回时不包含完整的 key（安全考虑），只显示部分
    const safeApiKeys = apiKeys.map(apiKey => ({
      id: apiKey.id,
      name: apiKey.name,
      key: `${apiKey.key.substring(0, 4)}...${apiKey.key.substring(apiKey.key.length - 4)}`, // 只显示前4位和后4位
      fullKey: apiKey.key, // 🆕 前端需要完整key用于复制，但要在安全的情况下传递
      createdAt: apiKey.createdAt,
      lastUsedAt: apiKey.lastUsedAt,
      ownerId: apiKey.ownerId
    }));
    
    res.json({
      success: true,
      apiKeys: safeApiKeys
    });
  } catch (error: any) {
    logger.error('❌ Failed to list API Keys:', error);
    res.status(500).json({
      error: 'Failed to list API Keys',
      message: error.message
    });
  }
}

/**
 * 🆕 删除 API Key
 * DELETE /api/admin/auth/api-keys/:id
 */
export async function deleteApiKey(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    const config = configService.readConfig();
    const apiKeys = config.auth?.apiKeys || [];
    const filteredApiKeys = apiKeys.filter(apiKey => apiKey.id !== id);
    
    if (filteredApiKeys.length === apiKeys.length) {
      res.status(404).json({
        error: 'API Key not found'
      });
      return;
    }
    
    configService.updateConfig({
      auth: {
        ...config.auth,
        apiKeys: filteredApiKeys
      }
    });
    
    logger.info(`✅ API Key deleted: ${id}`);
    
    res.json({
      success: true,
      message: 'API Key deleted successfully'
    });
  } catch (error: any) {
    logger.error('❌ Failed to delete API Key:', error);
    res.status(500).json({
      error: 'Failed to delete API Key',
      message: error.message
    });
  }
}

