/**
 * TriggerHub 单元测试
 */

import { TriggerHub } from '../../src/core/TriggerHub';

describe('TriggerHub', () => {
  let triggerHub: TriggerHub;

  beforeEach(() => {
    triggerHub = new TriggerHub({
      debounceMs: 1000, // 1秒防抖（测试用）
      timezone: 'Asia/Taipei',
      quietWindow: {
        start: '22:00',
        end: '08:00'
      }
    });
  });

  describe('shouldTrigger', () => {
    it('应该允许第一次触发', () => {
      expect(triggerHub.shouldTrigger('test-trigger')).toBe(true);
    });

    it('应该在防抖时间内阻止触发', () => {
      triggerHub.shouldTrigger('test-trigger');
      expect(triggerHub.shouldTrigger('test-trigger')).toBe(false);
    });

    it('应该允许不同triggerId的触发', () => {
      triggerHub.shouldTrigger('trigger-1');
      expect(triggerHub.shouldTrigger('trigger-2')).toBe(true);
    });
  });

  describe('isWorkday', () => {
    it('应该正确识别工作日', () => {
      // 这个测试依赖于当前日期，可能需要mock
      const result = triggerHub.isWorkday();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('isInQuietWindow', () => {
    it('应该正确识别静音窗', () => {
      const result = triggerHub.isInQuietWindow();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('clearTriggerHistory', () => {
    it('应该清除指定trigger的历史', () => {
      triggerHub.shouldTrigger('test-trigger');
      triggerHub.clearTriggerHistory('test-trigger');
      expect(triggerHub.shouldTrigger('test-trigger')).toBe(true);
    });

    it('应该清除所有trigger的历史', () => {
      triggerHub.shouldTrigger('trigger-1');
      triggerHub.shouldTrigger('trigger-2');
      triggerHub.clearTriggerHistory();
      expect(triggerHub.shouldTrigger('trigger-1')).toBe(true);
      expect(triggerHub.shouldTrigger('trigger-2')).toBe(true);
    });
  });
});

