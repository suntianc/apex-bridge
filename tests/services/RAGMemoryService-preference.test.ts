/**
 * RAGMemoryService - 偏好学习功能测试
 */

import { RAGMemoryService } from '../../src/services/RAGMemoryService';
import { Preference } from '../../src/types/memory';
import { PreferenceStorage } from '../../src/utils/preferenceStorage';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PathService } from '../../src/services/PathService';

// Mock RAG Service
const mockRAGService = {
  addDocument: jest.fn().mockResolvedValue(undefined),
  search: jest.fn().mockResolvedValue([])
};

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('RAGMemoryService - Preference Learning', () => {
  let memoryService: RAGMemoryService;
  let preferenceStorage: PreferenceStorage;
  const testUserId = 'test-user-preference';
  const testPreferencesDir = path.join(PathService.getInstance().getConfigDir(), 'preferences');

  beforeEach(async () => {
    // 清理测试数据
    try {
      const testFile = path.join(testPreferencesDir, `${testUserId}.json`);
      if (await fs.access(testFile).then(() => true).catch(() => false)) {
        await fs.unlink(testFile);
      }
    } catch (error) {
      // 忽略错误
    }

    memoryService = new RAGMemoryService(mockRAGService, {
      defaultKnowledgeBase: 'test',
      enableLogging: false
    });

    preferenceStorage = new PreferenceStorage();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // 清理测试数据
    try {
      const testFile = path.join(testPreferencesDir, `${testUserId}.json`);
      if (await fs.access(testFile).then(() => true).catch(() => false)) {
        await fs.unlink(testFile);
      }
    } catch (error) {
      // 忽略错误
    }
  });

  describe('learnPreference', () => {
    it('应该成功保存偏好', async () => {
      const preference: Preference = {
        type: 'movie_genre',
        value: '科幻',
        confidence: 0.8,
        context: '用户提到喜欢看科幻电影'
      };

      await memoryService.learnPreference(testUserId, preference);

      // 验证偏好已保存
      const storedPreferences = await preferenceStorage.getUserPreferences(testUserId);
      expect(storedPreferences.length).toBeGreaterThan(0);
      expect(storedPreferences[0].type).toBe('movie_genre');
      expect(storedPreferences[0].value).toBe('科幻');

      // 验证偏好也保存为记忆
      expect(mockRAGService.addDocument).toHaveBeenCalled();
    });

    it('应该更新已存在的偏好', async () => {
      // 第一次保存
      const preference1: Preference = {
        type: 'food_preference',
        value: '辣',
        confidence: 0.6
      };
      await memoryService.learnPreference(testUserId, preference1);

      // 第二次保存相同类型
      const preference2: Preference = {
        type: 'food_preference',
        value: '不辣',
        confidence: 0.9
      };
      await memoryService.learnPreference(testUserId, preference2);

      // 验证只有一个偏好，且值为最新
      const storedPreferences = await preferenceStorage.getUserPreferences(testUserId);
      expect(storedPreferences.length).toBe(1);
      expect(storedPreferences[0].value).toBe('不辣');
      expect(storedPreferences[0].confidence).toBe(0.9);
    });

    it('应该处理无效的偏好数据', async () => {
      // 缺少type
      await expect(
        memoryService.learnPreference(testUserId, { value: 'test' } as any)
      ).resolves.not.toThrow();

      // 缺少userId
      await expect(
        memoryService.learnPreference('', { type: 'test', value: 'test' })
      ).resolves.not.toThrow();
    });
  });

  describe('getUserPreferences', () => {
    it('应该返回用户的所有偏好', async () => {
      // 保存多个偏好
      await memoryService.learnPreference(testUserId, {
        type: 'movie_genre',
        value: '科幻',
        confidence: 0.8
      });
      await memoryService.learnPreference(testUserId, {
        type: 'food_preference',
        value: '不辣',
        confidence: 0.7
      });

      const preferences = await memoryService.getUserPreferences(testUserId);
      expect(preferences.length).toBe(2);
      expect(preferences.some(p => p.type === 'movie_genre')).toBe(true);
      expect(preferences.some(p => p.type === 'food_preference')).toBe(true);
    });
  });
});

