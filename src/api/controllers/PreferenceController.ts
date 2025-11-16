/**
 * PreferenceController - 偏好管理API控制器
 */

import { Request, Response } from 'express';
import { Preference } from '../../types/memory';
import { PreferenceStorage, StoredPreference } from '../../utils/preferenceStorage';
import { logger } from '../../utils/logger';
import { createError } from '../../utils/errors';

const preferenceStorage = new PreferenceStorage();

function shouldEnforceAdmin(): boolean {
  return String(process.env.APEX_REQUIRE_ADMIN || '').toLowerCase() === 'true';
}

function ensureAdmin(req: Request): void {
  if (!shouldEnforceAdmin()) return;
  // 允许通过常见位置识别管理员身份：req.user.role / header
  const role = (req as any)?.user?.role || req.headers['x-admin-role'];
  if (role !== 'admin') {
    throw createError.forbidden('Admin role required');
  }
}

/**
 * 批量导出用户偏好
 * GET /api/admin/preferences/export?userId=xxx
 */
export async function exportPreferences(req: Request, res: Response): Promise<void> {
  try {
    // 只读导出可不强制管理员；如需开启，取消下一行注释
    // ensureAdmin(req);
    const { userId } = req.query;
    if (!userId || typeof userId !== 'string') {
      throw createError.validation('User ID is required');
    }
    const preferences = await preferenceStorage.getUserPreferences(userId);
    res.setHeader('Content-Type', 'application/json');
    res.json({ success: true, userId, preferences });
  } catch (error: any) {
    logger.error('❌ Failed to export preferences:', error);
    if (error.statusCode) {
      throw error;
    }
    throw createError.internal('Failed to export preferences', error.message);
  }
}

/**
 * 批量导入用户偏好（覆盖写入相同type）
 * POST /api/admin/preferences/import
 * body: { userId: string, preferences: Array<{type,value,confidence?,context?}> }
 */
export async function importPreferences(req: Request, res: Response): Promise<void> {
  try {
    ensureAdmin(req);
    const { userId, preferences } = req.body || {};
    if (!userId || typeof userId !== 'string') {
      throw createError.validation('User ID is required');
    }
    if (!Array.isArray(preferences)) {
      throw createError.validation('preferences array is required');
    }
    const results: StoredPreference[] = [];
    for (const p of preferences) {
      if (!p || typeof p !== 'object' || typeof p.type !== 'string' || p.value === undefined) {
        continue;
      }
      const data: Preference = {
        type: p.type,
        value: p.value,
        confidence: p.confidence !== undefined ? Number(p.confidence) : undefined,
        context: p.context
      };
      const saved = await preferenceStorage.savePreference(userId, data);
      results.push(saved);
    }
    res.json({ success: true, imported: results.length, preferences: results });
  } catch (error: any) {
    logger.error('❌ Failed to import preferences:', error);
    if (error.statusCode) {
      throw error;
    }
    throw createError.internal('Failed to import preferences', error.message);
  }
}

/**
 * 获取用户偏好列表
 * GET /api/admin/preferences?userId=xxx
 */
export async function listPreferences(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      throw createError.validation('User ID is required');
    }

    const preferences = await preferenceStorage.getUserPreferences(userId);

    res.json({
      success: true,
      preferences: preferences,
      total: preferences.length
    });
  } catch (error: any) {
    logger.error('❌ Failed to list preferences:', error);

    // 如果已经是AppError，直接抛出
    if (error.statusCode) {
      throw error;
    }

    throw createError.internal(
      'Failed to list preferences',
      error.message
    );
  }
}

/**
 * 获取指定偏好
 * GET /api/admin/preferences/:id?userId=xxx
 */
export async function getPreference(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    if (!id || typeof id !== 'string') {
      throw createError.validation('Preference ID is required');
    }

    if (!userId || typeof userId !== 'string') {
      throw createError.validation('User ID is required');
    }

    const preference = await preferenceStorage.getPreference(userId, id);

    if (!preference) {
      throw createError.notFound(`Preference '${id}' not found`);
    }

    res.json({
      success: true,
      preference: preference
    });
  } catch (error: any) {
    logger.error(`❌ Failed to get preference ${req.params.id}:`, error);

    // 如果已经是AppError，直接抛出
    if (error.statusCode) {
      throw error;
    }

    throw createError.internal(
      'Failed to get preference',
      error.message
    );
  }
}

/**
 * 创建新偏好
 * POST /api/admin/preferences
 */
export async function createPreference(req: Request, res: Response): Promise<void> {
  try {
    ensureAdmin(req);
    const { userId, preference } = req.body;

    if (!userId || typeof userId !== 'string') {
      throw createError.validation('User ID is required');
    }

    if (!preference || typeof preference !== 'object') {
      throw createError.validation('Preference data is required');
    }

    if (!preference.type || typeof preference.type !== 'string') {
      throw createError.validation('Preference type is required');
    }

    if (preference.value === undefined) {
      throw createError.validation('Preference value is required');
    }

    // 验证偏好格式
    const preferenceData: Preference = {
      type: preference.type,
      value: preference.value,
      confidence: preference.confidence !== undefined ? Number(preference.confidence) : undefined,
      context: preference.context
    };

    // 验证confidence范围
    if (preferenceData.confidence !== undefined) {
      if (preferenceData.confidence < 0 || preferenceData.confidence > 1) {
        throw createError.validation('Confidence must be between 0 and 1');
      }
    }

    const storedPreference = await preferenceStorage.savePreference(userId, preferenceData);

    logger.info(`✅ Created preference: ${preference.type} for user ${userId}`);

    res.json({
      success: true,
      message: 'Preference created successfully',
      preference: storedPreference
    });
  } catch (error: any) {
    logger.error(`❌ Failed to create preference:`, error);

    // 如果已经是AppError，直接抛出
    if (error.statusCode) {
      throw error;
    }

    throw createError.internal(
      'Failed to create preference',
      error.message
    );
  }
}

/**
 * 更新偏好
 * PUT /api/admin/preferences/:id
 */
export async function updatePreference(req: Request, res: Response): Promise<void> {
  try {
    ensureAdmin(req);
    const { id } = req.params;
    const { userId, preference } = req.body;

    if (!id || typeof id !== 'string') {
      throw createError.validation('Preference ID is required');
    }

    if (!userId || typeof userId !== 'string') {
      throw createError.validation('User ID is required');
    }

    if (!preference || typeof preference !== 'object') {
      throw createError.validation('Preference data is required');
    }

    // 准备更新数据
    const updates: Partial<Preference> = {};
    if (preference.type !== undefined) updates.type = preference.type;
    if (preference.value !== undefined) updates.value = preference.value;
    if (preference.confidence !== undefined) {
      const confidence = Number(preference.confidence);
      if (confidence < 0 || confidence > 1) {
        throw createError.validation('Confidence must be between 0 and 1');
      }
      updates.confidence = confidence;
    }
    if (preference.context !== undefined) updates.context = preference.context;

    const updated = await preferenceStorage.updatePreference(userId, id, updates);

    if (!updated) {
      throw createError.notFound(`Preference '${id}' not found`);
    }

    logger.info(`✅ Updated preference: ${id} for user ${userId}`);

    res.json({
      success: true,
      message: 'Preference updated successfully',
      preference: updated
    });
  } catch (error: any) {
    logger.error(`❌ Failed to update preference ${req.params.id}:`, error);

    // 如果已经是AppError，直接抛出
    if (error.statusCode) {
      throw error;
    }

    throw createError.internal(
      'Failed to update preference',
      error.message
    );
  }
}

/**
 * 删除偏好
 * DELETE /api/admin/preferences/:id?userId=xxx
 */
export async function deletePreference(req: Request, res: Response): Promise<void> {
  try {
    ensureAdmin(req);
    const { id } = req.params;
    const { userId } = req.query;

    if (!id || typeof id !== 'string') {
      throw createError.validation('Preference ID is required');
    }

    if (!userId || typeof userId !== 'string') {
      throw createError.validation('User ID is required');
    }

    const success = await preferenceStorage.deletePreference(userId, id);

    if (!success) {
      throw createError.notFound(`Preference '${id}' not found`);
    }

    logger.info(`✅ Deleted preference: ${id} for user ${userId}`);

    res.json({
      success: true,
      message: 'Preference deleted successfully'
    });
  } catch (error: any) {
    logger.error(`❌ Failed to delete preference ${req.params.id}:`, error);

    // 如果已经是AppError，直接抛出
    if (error.statusCode) {
      throw error;
    }

    throw createError.internal(
      'Failed to delete preference',
      error.message
    );
  }
}

