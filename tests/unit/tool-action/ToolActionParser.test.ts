/**
 * ToolActionParser 单元测试
 */

import { ToolActionParser, toolActionParser } from '../../../src/core/tool-action/ToolActionParser';

describe('ToolActionParser', () => {
  let parser: ToolActionParser;

  beforeEach(() => {
    parser = new ToolActionParser();
  });

  describe('parse()', () => {
    it('应该解析单个完整的工具调用标签', () => {
      const text = `<tool_action name="vector-search">
  <query value="读取文件" />
  <limit value="5" />
</tool_action>`;

      const result = parser.parse(text);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe('vector-search');
      expect(result.toolCalls[0].parameters).toEqual({
        query: '读取文件',
        limit: '5'
      });
      expect(result.pendingText).toBe('');
    });

    it('应该解析多个连续的工具调用标签', () => {
      const text = `先进行搜索
<tool_action name="search">
  <keyword value="test" />
</tool_action>
然后读取文件
<tool_action name="read-file">
  <path value="/path/to/file.txt" />
</tool_action>
最后输出结果`;

      const result = parser.parse(text);

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].name).toBe('search');
      expect(result.toolCalls[1].name).toBe('read-file');
      expect(result.textSegments).toHaveLength(3);
      expect(result.textSegments[0].content).toContain('先进行搜索');
      expect(result.textSegments[1].content).toContain('然后读取文件');
      expect(result.textSegments[2].content).toContain('最后输出结果');
    });

    it('应该正确处理无参数的工具调用', () => {
      const text = `<tool_action name="list-tools"></tool_action>`;

      const result = parser.parse(text);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe('list-tools');
      expect(result.toolCalls[0].parameters).toEqual({});
    });

    it('应该处理标准闭合格式的参数', () => {
      const text = `<tool_action name="test">
  <param value="value"></param>
</tool_action>`;

      const result = parser.parse(text);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].parameters).toEqual({ param: 'value' });
    });

    it('应该检测未完成的标签', () => {
      const text = `前面的文本<tool_action name="incomplete">
  <query value="test"`;

      const result = parser.parse(text);

      expect(result.toolCalls).toHaveLength(0);
      expect(result.pendingText).toContain('<tool_action');
    });

    it('应该正确处理空文本', () => {
      const result = parser.parse('');

      expect(result.toolCalls).toHaveLength(0);
      expect(result.textSegments).toHaveLength(0);
      expect(result.pendingText).toBe('');
    });

    it('应该正确处理没有标签的纯文本', () => {
      const text = '这是一段普通的文本，没有任何工具调用标签。';

      const result = parser.parse(text);

      expect(result.toolCalls).toHaveLength(0);
      expect(result.textSegments).toHaveLength(1);
      expect(result.textSegments[0].content).toBe(text);
    });
  });

  describe('hasPendingTag()', () => {
    it('应该检测到未完成的标签', () => {
      expect(parser.hasPendingTag('<tool_action name="test">')).toBe(true);
      expect(parser.hasPendingTag('text <tool_action name="test">')).toBe(true);
    });

    it('应该正确识别完整的标签', () => {
      expect(parser.hasPendingTag('<tool_action name="test"></tool_action>')).toBe(false);
    });

    it('应该正确处理没有标签的文本', () => {
      expect(parser.hasPendingTag('没有标签的文本')).toBe(false);
    });
  });

  describe('parseSingleTag()', () => {
    it('应该解析单个工具调用', () => {
      const tagText = `<tool_action name="vector-search">
  <query value="test" />
</tool_action>`;

      const result = parser.parseSingleTag(tagText);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('vector-search');
      expect(result!.parameters).toEqual({ query: 'test' });
    });

    it('应该返回null对于无效标签', () => {
      expect(parser.parseSingleTag('invalid text')).toBeNull();
      expect(parser.parseSingleTag('<tool_action name="incomplete">')).toBeNull();
    });
  });

  describe('isValidToolAction()', () => {
    it('应该验证有效的工具调用', () => {
      const valid = {
        name: 'test',
        parameters: { key: 'value' },
        rawText: '<tool_action name="test"></tool_action>',
        startIndex: 0,
        endIndex: 10
      };

      expect(parser.isValidToolAction(valid)).toBe(true);
    });

    it('应该拒绝无效的工具调用', () => {
      expect(parser.isValidToolAction({
        name: '',
        parameters: {},
        rawText: '',
        startIndex: 0,
        endIndex: 0
      })).toBe(false);
    });
  });
});

describe('toolActionParser singleton', () => {
  it('应该导出单例实例', () => {
    expect(toolActionParser).toBeInstanceOf(ToolActionParser);
  });
});
