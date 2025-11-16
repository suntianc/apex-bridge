/**
 * ConfigController - 配置管理API控制器
 */

import { Request, Response } from 'express';
import { ConfigService } from '../../services/ConfigService';
import { logger } from '../../utils/logger';

const configService = ConfigService.getInstance();

/**
 * 读取所有配置
 * GET /api/admin/config
 */
export async function getConfig(req: Request, res: Response): Promise<void> {
  try {
    const config = configService.readConfig();
    res.json({
      success: true,
      config: config
    });
  } catch (error: any) {
    logger.error('❌ Failed to read config:', error);
    res.status(500).json({
      error: 'Failed to read config',
      message: error.message
    });
  }
}

/**
 * 更新配置项
 * PUT /api/admin/config
 */
export async function updateConfig(req: Request, res: Response): Promise<void> {
  try {
    const { config } = req.body;
    
    // 注意：基本验证（config存在等）已由验证中间件处理
    // 这里使用异步更新方法，确保线程安全（原子性）
    
    // 使用异步更新方法（线程安全，带锁）
    const updatedConfig = await configService.updateConfigAsync(config);
    
    logger.info('✅ Configuration updated');
    
    res.json({
      success: true,
      message: 'Configuration updated successfully',
      config: updatedConfig,
      requires_restart: checkRequiresRestart(config)
    });
  } catch (error: any) {
    logger.error('❌ Failed to update config:', error);
    
    // 检查是否是验证错误
    if (error.message && error.message.includes('Configuration validation failed')) {
      res.status(400).json({
        error: 'Configuration validation failed',
        message: error.message
      });
      return;
    }
    
    res.status(500).json({
      error: 'Failed to update config',
      message: error.message
    });
  }
}

/**
 * 重置为默认配置
 * POST /api/admin/config/reset
 */
export async function resetConfig(req: Request, res: Response): Promise<void> {
  try {
    const defaultConfig = configService.resetConfig();
    
    logger.info('✅ Configuration reset to default');
    
    res.json({
      success: true,
      message: 'Configuration reset to default',
      config: defaultConfig
    });
  } catch (error: any) {
    logger.error('❌ Failed to reset config:', error);
    res.status(500).json({
      error: 'Failed to reset config',
      message: error.message
    });
  }
}

/**
 * 导出配置
 * GET /api/admin/config/export
 */
export async function exportConfig(req: Request, res: Response): Promise<void> {
  try {
    const config = configService.readConfig();
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=admin-config.json');
    res.json(config);
  } catch (error: any) {
    logger.error('❌ Failed to export config:', error);
    res.status(500).json({
      error: 'Failed to export config',
      message: error.message
    });
  }
}

/**
 * 导入配置
 * POST /api/admin/config/import
 */
export async function importConfig(req: Request, res: Response): Promise<void> {
  try {
    const { config } = req.body;
    
    if (!config) {
      res.status(400).json({
        error: 'Configuration is required'
      });
      return;
    }
    
    // 验证导入的配置
    const validation = configService.validateConfig(config);
    if (!validation.valid) {
      res.status(400).json({
        error: 'Configuration validation failed',
        errors: validation.errors
      });
      return;
    }
    
    // 保存配置（使用异步方法，确保线程安全）
    await configService.writeConfigAsync(config);
    
    logger.info('✅ Configuration imported');
    
    res.json({
      success: true,
      message: 'Configuration imported successfully',
      config: config,
      requires_restart: checkRequiresRestart(config)
    });
  } catch (error: any) {
    logger.error('❌ Failed to import config:', error);
    res.status(500).json({
      error: 'Failed to import config',
      message: error.message
    });
  }
}

/**
 * 检查是否需要重启服务
 * 如果修改了系统参数（PORT、HOST、NODE_ENV、DEBUG_MODE），需要重启
 */
function checkRequiresRestart(updates: any): boolean {
  if (updates.server) {
    return true; // 修改了server配置需要重启
  }
  return false;
}

