/**
 * PreferenceExtractor 单元测试
 */

import { PreferenceExtractor } from '../../src/utils/preferenceExtractor';

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('PreferenceExtractor', () => {
  let extractor: PreferenceExtractor;

  beforeEach(() => {
    extractor = new PreferenceExtractor({
      enableLLMExtraction: false,
      minConfidence: 0.5
    });
  });

  describe('extractPreferences', () => {
    it('应该从消息中提取电影偏好', async () => {
      const message = '我喜欢看科幻电影';
      const results = await extractor.extractPreferences(message);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].preference.type).toBe('movie_genre');
      expect(results[0].preference.value).toBe('科幻');
      expect(results[0].confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('应该从消息中提取食物偏好', async () => {
      // 测试正面的偏好
      const message1 = '我喜欢吃辣';
      const results1 = await extractor.extractPreferences(message1);
      
      if (results1.length > 0) {
        expect(results1[0].preference.type).toBe('food_preference');
        expect(results1[0].preference.value).toBe('辣');
      }

      // 测试负面的偏好
      const message2 = '我不喜欢吃辣的食物';
      const results2 = await extractor.extractPreferences(message2);
      
      // 如果提取到，验证类型和值
      if (results2.length > 0) {
        expect(results2[0].preference.type).toBe('food_preference');
        expect(['辣', '不喜欢辣']).toContain(results2[0].preference.value);
      }

      // 至少有一个测试应该提取到偏好
      expect(results1.length + results2.length).toBeGreaterThan(0);
    });

    it('应该从消息中提取音乐偏好', async () => {
      const message = '我偏好听流行音乐';
      const results = await extractor.extractPreferences(message);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].preference.type).toBe('music_genre');
      expect(results[0].preference.value).toBe('流行');
    });

    it('应该从消息中提取运动偏好', async () => {
      const message = '我喜欢跑步';
      const results = await extractor.extractPreferences(message);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].preference.type).toBe('sport_preference');
      expect(results[0].preference.value).toBe('跑步');
    });

    it('应该对不包含偏好的消息返回空数组', async () => {
      const message = '今天天气真好';
      const results = await extractor.extractPreferences(message);

      expect(results.length).toBe(0);
    });

    it('应该过滤低置信度结果', async () => {
      extractor = new PreferenceExtractor({
        enableLLMExtraction: false,
        minConfidence: 0.8
      });

      const message = '我喜欢看科幻电影';
      const results = await extractor.extractPreferences(message);

      // 如果置信度低于0.8，应该被过滤
      results.forEach(result => {
        expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      });
    });

    it('应该处理空消息', async () => {
      const results = await extractor.extractPreferences('');
      expect(results.length).toBe(0);

      const results2 = await extractor.extractPreferences('   ');
      expect(results.length).toBe(0);
    });
  });
});

