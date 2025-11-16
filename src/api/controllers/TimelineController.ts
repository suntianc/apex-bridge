/**
 * TimelineController - 时间线管理API控制器
 */

import { Request, Response } from 'express';
import { TimelineEvent } from '../../types/memory';
import { logger } from '../../utils/logger';
import { createError } from '../../utils/errors';

/**
 * 获取用户时间线
 * GET /api/admin/timeline?userId=xxx&days=30
 */
export async function getTimeline(req: Request, res: Response): Promise<void> {
  try {
    const { userId, days } = req.query;

    if (!userId || typeof userId !== 'string') {
      throw createError.validation('User ID is required');
    }

    // 解析days参数（默认30天）
    let daysNum = 30;
    if (days !== undefined) {
      const parsed = Number(days);
      if (isNaN(parsed) || parsed < 0) {
        throw createError.validation('Days parameter must be a non-negative number');
      }
      daysNum = parsed;
      
      // 限制最大天数为365天（1年）
      if (daysNum > 365) {
        daysNum = 365;
        logger.warn(`⚠️ Days parameter capped at 365 days for user ${userId}`);
      }
    }

    // 获取memoryService实例（从请求对象中获取，由中间件注入）
    const memoryService = (req as any).memoryService;
    
    if (!memoryService || typeof memoryService.buildTimeline !== 'function') {
      throw createError.internal('Memory service not available or buildTimeline method not implemented');
    }

    const timeline = await memoryService.buildTimeline(userId, daysNum);

    res.json({
      success: true,
      timeline: timeline,
      total: timeline.length,
      days: daysNum,
      userId: userId
    });
  } catch (error: any) {
    logger.error('❌ Failed to get timeline:', error);

    // 如果已经是AppError，直接抛出
    if (error.statusCode) {
      throw error;
    }

    throw createError.internal(
      'Failed to get timeline',
      error.message
    );
  }
}

/**
 * 搜索时间线事件
 * GET /api/admin/timeline/search?userId=xxx&query=xxx&days=30
 */
export async function searchTimeline(req: Request, res: Response): Promise<void> {
  try {
    const { userId, query, days } = req.query;

    if (!userId || typeof userId !== 'string') {
      throw createError.validation('User ID is required');
    }

    if (!query || typeof query !== 'string') {
      throw createError.validation('Search query is required');
    }

    // 解析days参数（默认30天）
    let daysNum = 30;
    if (days !== undefined) {
      const parsed = Number(days);
      if (isNaN(parsed) || parsed < 0) {
        throw createError.validation('Days parameter must be a non-negative number');
      }
      daysNum = parsed;
      if (daysNum > 365) {
        daysNum = 365;
      }
    }

    // 获取memoryService实例（从请求对象中获取，由中间件注入）
    const memoryService = (req as any).memoryService;
    
    if (!memoryService || typeof memoryService.buildTimeline !== 'function') {
      throw createError.internal('Memory service not available or buildTimeline method not implemented');
    }

    // 构建时间线
    const timeline = await memoryService.buildTimeline(userId, daysNum);

    // 在时间线中搜索匹配的事件
    const searchQuery = query.toLowerCase();
    const matchedEvents = timeline.filter(event => {
      // 搜索内容和元数据
      const contentMatch = event.content.toLowerCase().includes(searchQuery);
      const typeMatch = event.type.toLowerCase().includes(searchQuery);
      const metadataMatch = JSON.stringify(event.metadata || {}).toLowerCase().includes(searchQuery);
      
      return contentMatch || typeMatch || metadataMatch;
    });

    res.json({
      success: true,
      timeline: matchedEvents,
      total: matchedEvents.length,
      days: daysNum,
      userId: userId,
      query: query
    });
  } catch (error: any) {
    logger.error('❌ Failed to search timeline:', error);

    // 如果已经是AppError，直接抛出
    if (error.statusCode) {
      throw error;
    }

    throw createError.internal(
      'Failed to search timeline',
      error.message
    );
  }
}

