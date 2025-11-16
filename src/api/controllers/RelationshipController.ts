/**
 * RelationshipController - 关系管理API控制器
 */

import { Request, Response } from 'express';
import { Relationship, RelationshipType, StoredRelationship } from '../../types/memory';
import { RelationshipStorage } from '../../utils/relationshipStorage';
import { logger } from '../../utils/logger';
import { createError } from '../../utils/errors';

const relationshipStorage = new RelationshipStorage();

// 用于存储ProactivityScheduler实例（由server.ts注入）
let proactivitySchedulerInstance: any = null;

/**
 * 设置ProactivityScheduler实例（由server.ts调用）
 */
export function setProactivityScheduler(scheduler: any): void {
  proactivitySchedulerInstance = scheduler;
}

/**
 * 获取用户关系列表
 * GET /api/admin/relationships?userId=xxx
 */
export async function listRelationships(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      throw createError.validation('User ID is required');
    }

    const relationships = await relationshipStorage.getUserRelationships(userId);

    res.json({
      success: true,
      relationships: relationships,
      total: relationships.length
    });
  } catch (error: any) {
    logger.error('❌ Failed to list relationships:', error);

    if (error.statusCode) {
      throw error;
    }

    throw createError.internal(
      'Failed to list relationships',
      error.message
    );
  }
}

/**
 * 获取指定关系详情
 * GET /api/admin/relationships/:id?userId=xxx
 */
export async function getRelationship(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    if (!id || typeof id !== 'string') {
      throw createError.validation('Relationship ID is required');
    }

    if (!userId || typeof userId !== 'string') {
      throw createError.validation('User ID is required');
    }

    const relationship = await relationshipStorage.getRelationship(userId, id);

    if (!relationship) {
      throw createError.notFound(`Relationship '${id}' not found`);
    }

    res.json({
      success: true,
      relationship: relationship
    });
  } catch (error: any) {
    logger.error(`❌ Failed to get relationship ${req.params.id}:`, error);

    if (error.statusCode) {
      throw error;
    }

    throw createError.internal(
      'Failed to get relationship',
      error.message
    );
  }
}

/**
 * 创建新关系
 * POST /api/admin/relationships
 */
export async function createRelationship(req: Request, res: Response): Promise<void> {
  try {
    const { userId, relationship } = req.body;

    if (!userId || typeof userId !== 'string') {
      throw createError.validation('User ID is required');
    }

    if (!relationship || typeof relationship !== 'object') {
      throw createError.validation('Relationship data is required');
    }

    if (!relationship.name || typeof relationship.name !== 'string') {
      throw createError.validation('Relationship name is required');
    }

    if (!relationship.type || !['family', 'friend', 'colleague', 'other'].includes(relationship.type)) {
      throw createError.validation('Relationship type must be one of: family, friend, colleague, other');
    }

    // 验证日期格式
    if (relationship.birthday && !isValidDate(relationship.birthday)) {
      throw createError.validation('Birthday must be in YYYY-MM-DD or MM-DD format');
    }

    if (relationship.anniversary && !isValidDate(relationship.anniversary)) {
      throw createError.validation('Anniversary must be in YYYY-MM-DD or MM-DD format');
    }

    // 构建关系数据
    const relationshipData: Relationship = {
      type: relationship.type as RelationshipType,
      name: relationship.name,
      birthday: relationship.birthday,
      anniversary: relationship.anniversary,
      contact: relationship.contact,
      notes: relationship.notes
    };

    const storedRelationship = await relationshipStorage.saveRelationship(userId, relationshipData);

    logger.info(`✅ Created relationship: ${relationship.name} for user ${userId}`);

    // 🆕 如果设置了生日或纪念日，立即检查是否需要触发提醒
    if (storedRelationship.birthday || storedRelationship.anniversary) {
      try {
        // 异步触发提醒检查（不阻塞响应）
        // 使用 skipChecks: true 跳过工作日和触达窗检查，因为这是手动触发的
        if (proactivitySchedulerInstance) {
          // 等待一小段时间，确保关系已保存
          setTimeout(async () => {
            try {
              // 检查生日提醒
              if (storedRelationship.birthday) {
                logger.info(`🎂 Triggering birthday reminder check for ${storedRelationship.name} (${storedRelationship.birthday})`);
                await proactivitySchedulerInstance.trigger('birthday_reminder', { userId }, { skipChecks: true });
              }
              // 检查纪念日提醒
              if (storedRelationship.anniversary) {
                logger.info(`💝 Triggering anniversary reminder check for ${storedRelationship.name} (${storedRelationship.anniversary})`);
                await proactivitySchedulerInstance.trigger('anniversary_reminder', { userId }, { skipChecks: true });
              }
            } catch (err: any) {
              logger.error('❌ Failed to trigger reminder check:', err);
            }
          }, 500); // 等待500ms确保数据已保存
        }
      } catch (error: any) {
        // 不影响创建关系的响应
        logger.error('❌ Failed to trigger reminder check after creating relationship:', error);
      }
    }

    res.json({
      success: true,
      message: 'Relationship created successfully',
      relationship: storedRelationship
    });
  } catch (error: any) {
    logger.error(`❌ Failed to create relationship:`, error);

    if (error.statusCode) {
      throw error;
    }

    throw createError.internal(
      'Failed to create relationship',
      error.message
    );
  }
}

/**
 * 更新关系
 * PUT /api/admin/relationships/:id
 */
export async function updateRelationship(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { userId, relationship } = req.body;

    if (!id || typeof id !== 'string') {
      throw createError.validation('Relationship ID is required');
    }

    if (!userId || typeof userId !== 'string') {
      throw createError.validation('User ID is required');
    }

    if (!relationship || typeof relationship !== 'object') {
      throw createError.validation('Relationship data is required');
    }

    // 验证日期格式
    if (relationship.birthday !== undefined && relationship.birthday !== null && !isValidDate(relationship.birthday)) {
      throw createError.validation('Birthday must be in YYYY-MM-DD or MM-DD format');
    }

    if (relationship.anniversary !== undefined && relationship.anniversary !== null && !isValidDate(relationship.anniversary)) {
      throw createError.validation('Anniversary must be in YYYY-MM-DD or MM-DD format');
    }

    // 验证类型
    if (relationship.type && !['family', 'friend', 'colleague', 'other'].includes(relationship.type)) {
      throw createError.validation('Relationship type must be one of: family, friend, colleague, other');
    }

    const updates: Partial<Relationship> = {};
    if (relationship.type !== undefined) updates.type = relationship.type as RelationshipType;
    if (relationship.name !== undefined) updates.name = relationship.name;
    if (relationship.birthday !== undefined) updates.birthday = relationship.birthday || undefined;
    if (relationship.anniversary !== undefined) updates.anniversary = relationship.anniversary || undefined;
    if (relationship.contact !== undefined) updates.contact = relationship.contact;
    if (relationship.notes !== undefined) updates.notes = relationship.notes;

    const updatedRelationship = await relationshipStorage.updateRelationship(userId, id, updates);

    if (!updatedRelationship) {
      throw createError.notFound(`Relationship '${id}' not found`);
    }

    logger.info(`✅ Updated relationship: ${id} for user ${userId}`);

    // 🆕 如果设置了生日或纪念日，立即检查是否需要触发提醒
    if (updatedRelationship.birthday || updatedRelationship.anniversary) {
      try {
        // 异步触发提醒检查（不阻塞响应）
        // 使用 skipChecks: true 跳过工作日和触达窗检查，因为这是手动触发的
        if (proactivitySchedulerInstance) {
          // 等待一小段时间，确保关系已更新
          setTimeout(async () => {
            try {
              // 检查生日提醒
              if (updatedRelationship.birthday) {
                logger.info(`🎂 Triggering birthday reminder check for ${updatedRelationship.name} (${updatedRelationship.birthday})`);
                await proactivitySchedulerInstance.trigger('birthday_reminder', { userId }, { skipChecks: true });
              }
              // 检查纪念日提醒
              if (updatedRelationship.anniversary) {
                logger.info(`💝 Triggering anniversary reminder check for ${updatedRelationship.name} (${updatedRelationship.anniversary})`);
                await proactivitySchedulerInstance.trigger('anniversary_reminder', { userId }, { skipChecks: true });
              }
            } catch (err: any) {
              logger.error('❌ Failed to trigger reminder check:', err);
            }
          }, 500); // 等待500ms确保数据已更新
        }
      } catch (error: any) {
        // 不影响更新关系的响应
        logger.error('❌ Failed to trigger reminder check after updating relationship:', error);
      }
    }

    res.json({
      success: true,
      message: 'Relationship updated successfully',
      relationship: updatedRelationship
    });
  } catch (error: any) {
    logger.error(`❌ Failed to update relationship ${req.params.id}:`, error);

    if (error.statusCode) {
      throw error;
    }

    throw createError.internal(
      'Failed to update relationship',
      error.message
    );
  }
}

/**
 * 删除关系
 * DELETE /api/admin/relationships/:id
 */
export async function deleteRelationship(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    if (!id || typeof id !== 'string') {
      throw createError.validation('Relationship ID is required');
    }

    if (!userId || typeof userId !== 'string') {
      throw createError.validation('User ID is required');
    }

    const deleted = await relationshipStorage.deleteRelationship(userId, id);

    if (!deleted) {
      throw createError.notFound(`Relationship '${id}' not found`);
    }

    logger.info(`✅ Deleted relationship: ${id} for user ${userId}`);

    res.json({
      success: true,
      message: 'Relationship deleted successfully'
    });
  } catch (error: any) {
    logger.error(`❌ Failed to delete relationship ${req.params.id}:`, error);

    if (error.statusCode) {
      throw error;
    }

    throw createError.internal(
      'Failed to delete relationship',
      error.message
    );
  }
}

/**
 * 获取关系提醒
 * GET /api/admin/relationships/:id/reminders?userId=xxx
 */
export async function getRelationshipReminders(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    if (!id || typeof id !== 'string') {
      throw createError.validation('Relationship ID is required');
    }

    if (!userId || typeof userId !== 'string') {
      throw createError.validation('User ID is required');
    }

    const reminders = await relationshipStorage.getRelationshipReminders(userId, id);

    res.json({
      success: true,
      reminders: reminders,
      total: reminders.length
    });
  } catch (error: any) {
    logger.error(`❌ Failed to get relationship reminders for ${req.params.id}:`, error);

    if (error.statusCode) {
      throw error;
    }

    throw createError.internal(
      'Failed to get relationship reminders',
      error.message
    );
  }
}

/**
 * 验证日期格式（支持 YYYY-MM-DD 或 MM-DD）
 */
function isValidDate(dateString: string): boolean {
  if (!dateString || typeof dateString !== 'string') {
    return false;
  }

  // 支持 YYYY-MM-DD 格式
  const fullDatePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (fullDatePattern.test(dateString)) {
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  }

  // 支持 MM-DD 格式
  const monthDayPattern = /^\d{2}-\d{2}$/;
  if (monthDayPattern.test(dateString)) {
    const parts = dateString.split('-');
    const month = parseInt(parts[0]);
    const day = parseInt(parts[1]);
    return month >= 1 && month <= 12 && day >= 1 && day <= 31;
  }

  return false;
}

// 导出验证函数供其他函数使用
export { isValidDate };

