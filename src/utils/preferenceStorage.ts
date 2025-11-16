/**
 * PreferenceStorage - 偏好存储工具
 * 负责偏好的持久化存储（JSON文件）
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Preference } from '../types/memory';
import { PathService } from '../services/PathService';
import { logger } from './logger';

/**
 * 存储的偏好项（包含ID和时间戳）
 */
export interface StoredPreference extends Preference {
  id: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 用户偏好文件数据结构
 */
interface UserPreferencesFile {
  userId: string;
  preferences: StoredPreference[];
  updatedAt: number;
}

export class PreferenceStorage {
  private pathService: PathService;
  private preferencesDir: string;

  constructor() {
    this.pathService = PathService.getInstance();
    this.preferencesDir = path.join(this.pathService.getConfigDir(), 'preferences');
    this.ensureDirectory();
  }

  /**
   * 确保偏好目录存在
   */
  private async ensureDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.preferencesDir, { recursive: true });
    } catch (error: any) {
      logger.error(`❌ Failed to create preferences directory: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取用户偏好文件路径
   */
  private getUserPreferencesPath(userId: string): string {
    // 使用安全的文件名（移除特殊字符）
    const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.preferencesDir, `${safeUserId}.json`);
  }

  /**
   * 读取用户偏好文件
   */
  private async readUserPreferences(userId: string): Promise<UserPreferencesFile> {
    const filePath = this.getUserPreferencesPath(userId);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // 文件不存在，返回空结构
        return {
          userId,
          preferences: [],
          updatedAt: Date.now()
        };
      }
      throw error;
    }
  }

  /**
   * 写入用户偏好文件
   */
  private async writeUserPreferences(data: UserPreferencesFile): Promise<void> {
    const filePath = this.getUserPreferencesPath(data.userId);
    
    try {
      await fs.writeFile(
        filePath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );
    } catch (error: any) {
      logger.error(`❌ Failed to write preferences file: ${error.message}`);
      throw error;
    }
  }

  /**
   * 生成偏好ID
   */
  private generatePreferenceId(): string {
    return `pref-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 保存偏好
   */
  async savePreference(userId: string, preference: Preference): Promise<StoredPreference> {
    const data = await this.readUserPreferences(userId);
    const now = Date.now();

    // 检查是否已存在相同类型的偏好
    const existingIndex = data.preferences.findIndex(
      p => p.type === preference.type
    );

    let storedPreference: StoredPreference;

    if (existingIndex >= 0) {
      // 更新现有偏好
      const existing = data.preferences[existingIndex];
      storedPreference = {
        ...existing,
        value: preference.value,
        confidence: preference.confidence ?? existing.confidence ?? 0.5,
        context: preference.context ?? existing.context,
        updatedAt: now
      };
      data.preferences[existingIndex] = storedPreference;
      logger.debug(`📝 Updated preference: ${preference.type} for user ${userId}`);
    } else {
      // 创建新偏好
      storedPreference = {
        id: this.generatePreferenceId(),
        userId,
        type: preference.type,
        value: preference.value,
        confidence: preference.confidence ?? 0.5,
        context: preference.context,
        createdAt: now,
        updatedAt: now
      };
      data.preferences.push(storedPreference);
      logger.debug(`➕ Added new preference: ${preference.type} for user ${userId}`);
    }

    data.updatedAt = now;
    await this.writeUserPreferences(data);

    return storedPreference;
  }

  /**
   * 获取用户所有偏好
   */
  async getUserPreferences(userId: string): Promise<StoredPreference[]> {
    const data = await this.readUserPreferences(userId);
    return data.preferences;
  }

  /**
   * 获取指定偏好
   */
  async getPreference(userId: string, preferenceId: string): Promise<StoredPreference | null> {
    const data = await this.readUserPreferences(userId);
    return data.preferences.find(p => p.id === preferenceId) || null;
  }

  /**
   * 更新偏好
   */
  async updatePreference(userId: string, preferenceId: string, updates: Partial<Preference>): Promise<StoredPreference | null> {
    const data = await this.readUserPreferences(userId);
    const index = data.preferences.findIndex(p => p.id === preferenceId);

    if (index < 0) {
      return null;
    }

    const existing = data.preferences[index];
    const updated: StoredPreference = {
      ...existing,
      ...updates,
      updatedAt: Date.now()
    };

    data.preferences[index] = updated;
    data.updatedAt = Date.now();
    await this.writeUserPreferences(data);

    return updated;
  }

  /**
   * 删除偏好
   */
  async deletePreference(userId: string, preferenceId: string): Promise<boolean> {
    const data = await this.readUserPreferences(userId);
    const initialLength = data.preferences.length;
    
    data.preferences = data.preferences.filter(p => p.id !== preferenceId);
    
    if (data.preferences.length === initialLength) {
      return false; // 未找到
    }

    data.updatedAt = Date.now();
    await this.writeUserPreferences(data);

    return true;
  }

  /**
   * 根据类型获取偏好
   */
  async getPreferenceByType(userId: string, type: string): Promise<StoredPreference | null> {
    const data = await this.readUserPreferences(userId);
    return data.preferences.find(p => p.type === type) || null;
  }
}

