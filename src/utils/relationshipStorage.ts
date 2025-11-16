/**
 * RelationshipStorage - 关系存储工具
 * 负责关系的持久化存储（JSON文件）
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Relationship, StoredRelationship, RelationshipReminder } from '../types/memory';
import { PathService } from '../services/PathService';
import { logger } from './logger';

/**
 * 用户关系文件数据结构
 */
interface UserRelationshipsFile {
  userId: string;
  relationships: StoredRelationship[];
  updatedAt: number;
}

export class RelationshipStorage {
  private pathService: PathService;
  private relationshipsDir: string;

  constructor() {
    this.pathService = PathService.getInstance();
    this.relationshipsDir = path.join(this.pathService.getConfigDir(), 'relationships');
    this.ensureDirectory();
  }

  /**
   * 确保关系目录存在
   */
  private async ensureDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.relationshipsDir, { recursive: true });
    } catch (error: any) {
      logger.error(`❌ Failed to create relationships directory: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取用户关系文件路径
   */
  private getUserRelationshipsPath(userId: string): string {
    // 使用安全的文件名（移除特殊字符）
    const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.relationshipsDir, `${safeUserId}.json`);
  }

  /**
   * 读取用户关系数据
   */
  private async readUserRelationships(userId: string): Promise<UserRelationshipsFile> {
    const filePath = this.getUserRelationshipsPath(userId);
    
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // 文件不存在，返回空数据
        return {
          userId,
          relationships: [],
          updatedAt: 0
        };
      }
      logger.error(`❌ Failed to read relationships for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * 写入用户关系数据
   */
  private async writeUserRelationships(data: UserRelationshipsFile): Promise<void> {
    const filePath = this.getUserRelationshipsPath(data.userId);
    
    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error: any) {
      logger.error(`❌ Failed to write relationships for user ${data.userId}:`, error);
      throw error;
    }
  }

  /**
   * 生成关系ID
   */
  private generateRelationshipId(): string {
    return `rel-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 保存关系
   */
  async saveRelationship(userId: string, relationship: Relationship): Promise<StoredRelationship> {
    const data = await this.readUserRelationships(userId);
    const now = Date.now();

    const storedRelationship: StoredRelationship = {
      id: this.generateRelationshipId(),
      userId,
      ...relationship,
      createdAt: now,
      updatedAt: now
    };

    data.relationships.push(storedRelationship);
    data.updatedAt = now;
    await this.writeUserRelationships(data);

    logger.debug(`➕ Added new relationship: ${relationship.name} for user ${userId}`);
    return storedRelationship;
  }

  /**
   * 获取用户所有关系
   */
  async getUserRelationships(userId: string): Promise<StoredRelationship[]> {
    const data = await this.readUserRelationships(userId);
    return data.relationships;
  }

  /**
   * 获取指定关系
   */
  async getRelationship(userId: string, relationshipId: string): Promise<StoredRelationship | null> {
    const relationships = await this.getUserRelationships(userId);
    return relationships.find(r => r.id === relationshipId) || null;
  }

  /**
   * 更新关系
   */
  async updateRelationship(
    userId: string,
    relationshipId: string,
    updates: Partial<Relationship>
  ): Promise<StoredRelationship | null> {
    const data = await this.readUserRelationships(userId);
    const index = data.relationships.findIndex(r => r.id === relationshipId);

    if (index === -1) {
      return null;
    }

    const existing = data.relationships[index];
    const updated: StoredRelationship = {
      ...existing,
      ...updates,
      updatedAt: Date.now()
    };

    data.relationships[index] = updated;
    data.updatedAt = Date.now();
    await this.writeUserRelationships(data);

    logger.debug(`📝 Updated relationship: ${relationshipId} for user ${userId}`);
    return updated;
  }

  /**
   * 删除关系
   */
  async deleteRelationship(userId: string, relationshipId: string): Promise<boolean> {
    const data = await this.readUserRelationships(userId);
    const initialLength = data.relationships.length;
    
    data.relationships = data.relationships.filter(r => r.id !== relationshipId);
    
    if (data.relationships.length === initialLength) {
      return false; // 关系不存在
    }

    data.updatedAt = Date.now();
    await this.writeUserRelationships(data);

    logger.debug(`🗑️ Deleted relationship: ${relationshipId} for user ${userId}`);
    return true;
  }

  /**
   * 获取即将到来的提醒（生日/纪念日）
   * @param userId - 用户ID
   * @param daysAhead - 提前天数（默认7天）
   * @returns 提醒列表
   */
  async getUpcomingReminders(userId: string, daysAhead: number = 7): Promise<RelationshipReminder[]> {
    const relationships = await this.getUserRelationships(userId);
    const reminders: RelationshipReminder[] = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + daysAhead);

    for (const rel of relationships) {
      // 检查生日
      if (rel.birthday) {
        const reminder = this.calculateReminder(rel, 'birthday', rel.birthday, today, targetDate);
        if (reminder) {
          reminders.push(reminder);
        }
      }

      // 检查纪念日
      if (rel.anniversary) {
        const reminder = this.calculateReminder(rel, 'anniversary', rel.anniversary, today, targetDate);
        if (reminder) {
          reminders.push(reminder);
        }
      }
    }

    // 按距离天数排序
    reminders.sort((a, b) => a.daysUntil - b.daysUntil);
    return reminders;
  }

  /**
   * 计算提醒信息
   */
  private calculateReminder(
    relationship: StoredRelationship,
    eventType: 'birthday' | 'anniversary',
    dateString: string,
    today: Date,
    targetDate: Date
  ): RelationshipReminder | null {
    // 解析日期（支持 YYYY-MM-DD 或 MM-DD 格式）
    const dateParts = dateString.split('-');
    let eventDate: Date;

    if (dateParts.length === 3) {
      // YYYY-MM-DD 格式
      eventDate = new Date(dateString);
    } else if (dateParts.length === 2) {
      // MM-DD 格式（每年重复）
      const year = today.getFullYear();
      const month = parseInt(dateParts[0]);
      const day = parseInt(dateParts[1]);
      
      // 验证月份和日期有效性
      if (isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
        logger.warn(`⚠️ Invalid date format: ${dateString} (month: ${month}, day: ${day})`);
        return null;
      }
      
      eventDate = new Date(year, month - 1, day);
      
      // 如果今年的日期已过，使用明年
      if (eventDate < today) {
        eventDate = new Date(year + 1, month - 1, day);
      }
      
      logger.debug(`📅 Parsed MM-DD date: ${dateString} -> ${eventDate.toISOString().split('T')[0]}`);
    } else {
      logger.warn(`⚠️ Invalid date format: ${dateString} (expected YYYY-MM-DD or MM-DD)`);
      return null;
    }

    // 检查是否在提醒窗口内（包括今天）
    // 注意：使用日期比较，忽略时间部分
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const eventDateStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
    const targetDateStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    
    if (eventDateStart >= todayStart && eventDateStart <= targetDateStart) {
      const daysUntil = Math.ceil((eventDateStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
      
      logger.debug(`📅 Reminder calculated: ${relationship.name} ${eventType} on ${eventDateStart.toISOString().split('T')[0]}, ${daysUntil} days until`);
      
      return {
        relationshipId: relationship.id,
        relationshipName: relationship.name,
        eventType,
        eventDate: eventDateStart.toISOString().split('T')[0],
        daysUntil
      };
    }
    
    logger.debug(`⏸️ Reminder not in window: ${relationship.name} ${eventType} on ${eventDateStart.toISOString().split('T')[0]}, today=${todayStart.toISOString().split('T')[0]}, target=${targetDateStart.toISOString().split('T')[0]}`);

    return null;
  }

  /**
   * 获取指定关系的提醒
   */
  async getRelationshipReminders(userId: string, relationshipId: string): Promise<RelationshipReminder[]> {
    const relationship = await this.getRelationship(userId, relationshipId);
    if (!relationship) {
      return [];
    }

    const reminders: RelationshipReminder[] = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + 365); // 检查未来一年

    // 检查生日
    if (relationship.birthday) {
      const reminder = this.calculateReminder(relationship, 'birthday', relationship.birthday, today, targetDate);
      if (reminder) {
        reminders.push(reminder);
      }
    }

    // 检查纪念日
    if (relationship.anniversary) {
      const reminder = this.calculateReminder(relationship, 'anniversary', relationship.anniversary, today, targetDate);
      if (reminder) {
        reminders.push(reminder);
      }
    }

    return reminders;
  }
}

