/**
 * VCP IntelliCore (智脑) - 配置管理
 * 
 * 注意：已完全取消.env配置读取，所有配置从JSON文件（config/admin-config.json）读取
 */

import { } from '../types';
import { ConfigService } from '../services/ConfigService';
import { logger } from '../utils/logger';

// ConfigService实例（单例）
const configService = ConfigService.getInstance();

/**
 * 加载配置（从JSON文件读取）
 */
export function loadConfig() {
  try {
    // 从ConfigService读取配置
    const adminConfig = configService.readConfig();
    
    logger.debug('✅ Configuration loaded from JSON file');
    return adminConfig;
  } catch (error: any) {
    logger.error('❌ Failed to load config from JSON file:', error);
    throw new Error(`Configuration loading failed: ${error.message}`);
  }
}

/**
 * 验证配置
 * 如果设置未完成，跳过严格验证（允许系统启动进入设置向导）
 */
export function validateConfig(): void {
  const adminConfig = configService.readConfig();
  
  // 如果设置未完成，允许配置不完整（系统将引导用户完成设置）
  if (!adminConfig.setup_completed) {
    logger.debug('⚠️ Setup not completed, skipping strict validation');
    return; // 跳过验证，允许系统启动
  }
  
  // 设置完成后，进行严格验证
  const validation = configService.validateConfig(adminConfig);
  
  if (!validation.valid) {
    throw new Error(`Configuration errors:\n${validation.errors.join('\n')}`);
  }
}

/**
 * 检查首次启动状态
 */
export function isSetupCompleted(): boolean {
  return configService.isSetupCompleted();
}

