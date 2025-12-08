/**
 * StreamTagDetector 单元测试
 */

import { StreamTagDetector } from '../../../src/core/tool-action/StreamTagDetector';
import { DetectorState } from '../../../src/core/tool-action/types';

describe('StreamTagDetector', () => {
  let detector: StreamTagDetector;

  beforeEach(() => {
    detector = new StreamTagDetector();
  });

  describe('processChunk()', () => {
    it('应该直接输出不包含标签的文本', () => {
      const result = detector.processChunk('这是一段普通文本');

      expect(result.complete).toBe(false);
      expect(result.textToEmit).toBe('这是一段普通文本');
      expect(result.toolAction).toBeUndefined();
    });

    it('应该检测完整的工具调用标签', () => {
      const text = `<tool_action name="test">
  <param value="value" />
</tool_action>`;

      const result = detector.processChunk(text);

      expect(result.complete).toBe(true);
      expect(result.toolAction).toBeDefined();
      expect(result.toolAction!.name).toBe('test');
      expect(result.toolAction!.parameters).toEqual({ param: 'value' });
    });

    it('应该处理跨 chunk 的标签检测', () => {
      // 第一个 chunk：标签开始
      const result1 = detector.processChunk('前置文本<tool_action name="');

      expect(result1.complete).toBe(false);
      expect(result1.textToEmit).toBe('前置文本');

      // 第二个 chunk：继续标签内容
      const result2 = detector.processChunk('vector-search"><query value="test"');

      expect(result2.complete).toBe(false);
      expect(result2.textToEmit).toBe('');

      // 第三个 chunk：标签结束
      const result3 = detector.processChunk(' /></tool_action>后续文本');

      expect(result3.complete).toBe(true);
      expect(result3.toolAction).toBeDefined();
      expect(result3.toolAction!.name).toBe('vector-search');
      expect(result3.bufferRemainder).toBe('后续文本');
    });

    it('应该正确处理标签前后的文本', () => {
      const result = detector.processChunk(
        '思考：我需要搜索<tool_action name="search"><q value="test" /></tool_action>继续处理'
      );

      expect(result.complete).toBe(true);
      expect(result.textToEmit).toBe('思考：我需要搜索');
      expect(result.toolAction!.name).toBe('search');
      expect(result.bufferRemainder).toBe('继续处理');
    });

    it('应该缓冲可能的标签开始部分', () => {
      // 输入以 < 结尾，可能是标签开始
      const result = detector.processChunk('文本内容<');

      // 应该安全输出 "文本内容"，缓冲 "<"
      expect(result.textToEmit).toBe('文本内容');
      expect(detector.getBuffer()).toBe('<');
    });

    it('应该处理多个连续的工具调用', () => {
      const text = `<tool_action name="tool1">
  <p value="1" />
</tool_action>`;

      const result1 = detector.processChunk(text);
      expect(result1.complete).toBe(true);
      expect(result1.toolAction!.name).toBe('tool1');

      // 重置后处理下一个
      detector.reset();

      const text2 = `<tool_action name="tool2">
  <p value="2" />
</tool_action>`;

      const result2 = detector.processChunk(text2);
      expect(result2.complete).toBe(true);
      expect(result2.toolAction!.name).toBe('tool2');
    });
  });

  describe('reset()', () => {
    it('应该重置检测器状态', () => {
      detector.processChunk('<tool_action name="test">');

      expect(detector.isDetecting()).toBe(true);
      expect(detector.getBuffer().length).toBeGreaterThan(0);

      detector.reset();

      expect(detector.isDetecting()).toBe(false);
      expect(detector.getBuffer()).toBe('');
      expect(detector.getState()).toBe(DetectorState.NORMAL);
    });
  });

  describe('flush()', () => {
    it('应该返回缓冲区内容并重置', () => {
      detector.processChunk('<tool_action name="incomplete">');

      const flushed = detector.flush();

      expect(flushed).toContain('<tool_action');
      expect(detector.getBuffer()).toBe('');
      expect(detector.getState()).toBe(DetectorState.NORMAL);
    });

    it('应该对空缓冲区返回空字符串', () => {
      const flushed = detector.flush();
      expect(flushed).toBe('');
    });
  });

  describe('getState()', () => {
    it('应该返回正确的状态', () => {
      expect(detector.getState()).toBe(DetectorState.NORMAL);

      detector.processChunk('<tool_action name="test">');
      expect(detector.getState()).toBe(DetectorState.TAG_CONTENT);
    });
  });

  describe('isDetecting()', () => {
    it('应该正确指示是否在检测标签', () => {
      expect(detector.isDetecting()).toBe(false);

      detector.processChunk('<tool_action name="test">');
      expect(detector.isDetecting()).toBe(true);

      detector.reset();
      expect(detector.isDetecting()).toBe(false);
    });
  });
});
