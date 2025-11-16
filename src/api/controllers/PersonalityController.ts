/**
 * PersonalityController - 人格配置管理API控制器
 */

import { Request, Response } from 'express';
import { PersonalityEngine } from '../../core/PersonalityEngine';
import { PersonalityConfig } from '../../types/personality';
import { PathService } from '../../services/PathService';
import { logger } from '../../utils/logger';
import { createError } from '../../utils/errors';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 获取所有人格配置列表
 * GET /api/admin/personalities
 */
export async function listPersonalities(req: Request, res: Response): Promise<void> {
  try {
    const pathService = PathService.getInstance();
    const personalityDir = path.join(pathService.getConfigDir(), 'personality');
    
    // 确保目录存在
    await fs.mkdir(personalityDir, { recursive: true });
    
    // 读取目录中的所有JSON文件
    const files = await fs.readdir(personalityDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    const personalities: Array<{
      id: string;
      name: string;
      description?: string;
      avatar?: string;
      role?: string;
      status: 'active' | 'inactive';
      filePath: string;
    }> = [];
    
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(personalityDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const config: PersonalityConfig = JSON.parse(content);
        const agentId = path.basename(file, '.json');
        
        personalities.push({
          id: agentId,
          name: config.identity.name,
          description: config.metadata?.description,
          avatar: config.identity.avatar,
          role: config.identity.role,
          status: 'active',
          filePath: file
        });
      } catch (error: any) {
        logger.warn(`⚠️ Failed to parse personality file ${file}: ${error.message}`);
        // 继续处理其他文件
      }
    }
    
    // 按名称排序
    personalities.sort((a, b) => a.name.localeCompare(b.name));
    
    res.json({
      success: true,
      personalities: personalities,
      total: personalities.length
    });
  } catch (error: any) {
    logger.error('❌ Failed to list personalities:', error);
    throw createError.internal(
      'Failed to list personalities',
      error.message
    );
  }
}

/**
 * 获取指定人格配置
 * GET /api/admin/personalities/:id
 */
export async function getPersonality(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    // 注意：基本验证（id格式等）已由验证中间件处理
    
    const pathService = PathService.getInstance();
    const personalityDir = path.join(pathService.getConfigDir(), 'personality');
    const filePath = path.join(personalityDir, `${id}.json`);
    
    // 检查文件是否存在
    try {
      await fs.access(filePath);
    } catch {
      throw createError.notFound(`Personality '${id}' not found`);
    }
    
    // 读取并解析配置文件
    const content = await fs.readFile(filePath, 'utf-8');
    const config: PersonalityConfig = JSON.parse(content);
    
    res.json({
      success: true,
      personality: config,
      id: id
    });
  } catch (error: any) {
    logger.error(`❌ Failed to get personality ${req.params.id}:`, error);
    
    // 如果已经是AppError，直接抛出
    if (error.statusCode) {
      throw error;
    }
    
    throw createError.internal(
      'Failed to get personality',
      error.message
    );
  }
}

/**
 * 创建新人格配置
 * POST /api/admin/personalities
 */
export async function createPersonality(req: Request, res: Response): Promise<void> {
  try {
    const { id, config: personalityConfig } = req.body;
    
    // 注意：基本验证（id格式、config存在等）已由验证中间件处理
    // 这里只进行业务逻辑验证
    
    // 不允许创建default人格（受保护）
    if (id === 'default') {
      throw createError.validation('Cannot create personality with ID "default" (protected)');
    }
    
    // 验证配置格式（使用PersonalityEngine的验证逻辑）
    const validationResult = validatePersonalityConfig(personalityConfig);
    if (!validationResult.valid) {
      throw createError.validation(
        `Invalid personality configuration: ${validationResult.errors.join(', ')}`
      );
    }
    
    const pathService = PathService.getInstance();
    const personalityDir = path.join(pathService.getConfigDir(), 'personality');
    const filePath = path.join(personalityDir, `${id}.json`);
    
    // 检查是否已存在
    try {
      await fs.access(filePath);
      // 文件已存在，抛出错误
      throw createError.validation(`Personality '${id}' already exists`);
    } catch (error: any) {
      // 如果文件不存在（ENOENT），继续创建
      if (error.code === 'ENOENT') {
        // 文件不存在，继续创建
      } else if (error.statusCode) {
        // 是其他验证错误，直接抛出
        throw error;
      } else {
        // 其他错误，也继续创建（可能是权限问题等，让后续写入时再报错）
      }
    }
    
    // 确保目录存在
    await fs.mkdir(personalityDir, { recursive: true });
    
    // 保存配置文件
    const configToSave: PersonalityConfig = {
      ...personalityConfig,
      // 确保metadata存在
      metadata: {
        ...personalityConfig.metadata,
        version: personalityConfig.metadata?.version || '1.0'
      }
    };
    
    await fs.writeFile(
      filePath,
      JSON.stringify(configToSave, null, 2),
      'utf-8'
    );
    
    logger.info(`✅ Created personality: ${id}`);
    
    // 清除PersonalityEngine缓存（如果已初始化）
    // 注意：这里我们需要通过某种方式访问PersonalityEngine实例
    // 暂时先不处理缓存，等路由注册时再处理
    
    res.json({
      success: true,
      message: 'Personality created successfully',
      personality: configToSave,
      id: id
    });
  } catch (error: any) {
    logger.error(`❌ Failed to create personality:`, error);
    
    // 如果已经是AppError，直接抛出
    if (error.statusCode) {
      throw error;
    }
    
    throw createError.internal(
      'Failed to create personality',
      error.message
    );
  }
}

/**
 * 更新人格配置
 * PUT /api/admin/personalities/:id
 */
export async function updatePersonality(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const personalityConfig = req.body;
    
    // 注意：基本验证（id格式、config存在等）已由验证中间件处理
    // 这里只进行业务逻辑验证
    
    // 验证配置格式
    const validationResult = validatePersonalityConfig(personalityConfig);
    if (!validationResult.valid) {
      throw createError.validation(
        `Invalid personality configuration: ${validationResult.errors.join(', ')}`
      );
    }
    
    const pathService = PathService.getInstance();
    const personalityDir = path.join(pathService.getConfigDir(), 'personality');
    const filePath = path.join(personalityDir, `${id}.json`);
    
    // 检查文件是否存在
    try {
      await fs.access(filePath);
    } catch {
      throw createError.notFound(`Personality '${id}' not found`);
    }
    
    // 准备更新的配置
    const configToSave: PersonalityConfig = {
      ...personalityConfig,
      metadata: {
        ...personalityConfig.metadata,
        version: personalityConfig.metadata?.version || '1.0'
      }
    };
    
    // 保存配置文件
    await fs.writeFile(
      filePath,
      JSON.stringify(configToSave, null, 2),
      'utf-8'
    );
    
    logger.info(`✅ Updated personality: ${id}`);
    
    // 清除PersonalityEngine缓存（如果已初始化）
    // 注意：这里我们需要通过某种方式访问PersonalityEngine实例
    // 暂时先不处理缓存，等路由注册时再处理
    
    res.json({
      success: true,
      message: 'Personality updated successfully',
      personality: configToSave,
      id: id
    });
  } catch (error: any) {
    logger.error(`❌ Failed to update personality ${req.params.id}:`, error);
    
    // 如果已经是AppError，直接抛出
    if (error.statusCode) {
      throw error;
    }
    
    throw createError.internal(
      'Failed to update personality',
      error.message
    );
  }
}

/**
 * 删除人格配置
 * DELETE /api/admin/personalities/:id
 */
export async function deletePersonality(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    // 注意：基本验证（id格式等）已由验证中间件处理
    // 这里只进行业务逻辑验证
    
    // 不允许删除default人格（受保护）
    if (id === 'default') {
      throw createError.validation('Cannot delete personality with ID "default" (protected)');
    }
    
    const pathService = PathService.getInstance();
    const personalityDir = path.join(pathService.getConfigDir(), 'personality');
    const filePath = path.join(personalityDir, `${id}.json`);
    
    // 检查文件是否存在
    try {
      await fs.access(filePath);
    } catch {
      throw createError.notFound(`Personality '${id}' not found`);
    }
    
    // 删除文件
    await fs.unlink(filePath);
    
    logger.info(`✅ Deleted personality: ${id}`);
    
    // 清除PersonalityEngine缓存（如果已初始化）
    // 注意：这里我们需要通过某种方式访问PersonalityEngine实例
    // 暂时先不处理缓存，等路由注册时再处理
    
    res.json({
      success: true,
      message: 'Personality deleted successfully'
    });
  } catch (error: any) {
    logger.error(`❌ Failed to delete personality ${req.params.id}:`, error);
    
    // 如果已经是AppError，直接抛出
    if (error.statusCode) {
      throw error;
    }
    
    throw createError.internal(
      'Failed to delete personality',
      error.message
    );
  }
}

/**
 * 验证人格配置格式
 * 使用与PersonalityEngine相同的验证逻辑
 */
function validatePersonalityConfig(config: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!config || typeof config !== 'object') {
    errors.push('Configuration must be an object');
    return { valid: false, errors };
  }
  
  // 验证identity字段
  if (!config.identity || typeof config.identity !== 'object') {
    errors.push('Missing or invalid field: identity');
  } else {
    if (!config.identity.name || typeof config.identity.name !== 'string') {
      errors.push('Missing or invalid field: identity.name');
    }
  }
  
  // 验证traits字段
  if (!config.traits || typeof config.traits !== 'object') {
    errors.push('Missing or invalid field: traits');
  } else {
    if (!config.traits.core || !Array.isArray(config.traits.core) || config.traits.core.length === 0) {
      errors.push('Missing or invalid field: traits.core (must be a non-empty array)');
    }
  }
  
  // 验证style字段
  if (!config.style || typeof config.style !== 'object') {
    errors.push('Missing or invalid field: style');
  } else {
    if (!config.style.tone || typeof config.style.tone !== 'string') {
      errors.push('Missing or invalid field: style.tone');
    }
    if (!config.style.address || typeof config.style.address !== 'string') {
      errors.push('Missing or invalid field: style.address');
    }
    if (!config.style.emojiUsage || !['frequent', 'moderate', 'rare'].includes(config.style.emojiUsage)) {
      errors.push('Missing or invalid field: style.emojiUsage (must be "frequent", "moderate", or "rare")');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

