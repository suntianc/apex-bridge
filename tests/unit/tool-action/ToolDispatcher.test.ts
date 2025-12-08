/**
 * ToolDispatcher 单元测试
 */

import { ToolDispatcher, generateToolPrompt } from '../../../src/core/tool-action/ToolDispatcher';
import type { ToolDescription, ToolActionCall } from '../../../src/core/tool-action/types';

// Mock BuiltInToolsRegistry
jest.mock('../../../src/services/BuiltInToolsRegistry', () => {
  const mockTool = {
    name: 'mock-tool',
    description: 'A mock tool for testing',
    type: 'builtin' as const,
    category: 'test',
    level: 1,
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Input parameter' },
        count: { type: 'number', description: 'Count parameter' }
      },
      required: ['input']
    },
    enabled: true,
    execute: jest.fn().mockResolvedValue({ success: true, output: 'mock result', duration: 10 })
  };

  return {
    BuiltInToolsRegistry: jest.fn().mockImplementation(() => ({
      getTool: jest.fn().mockImplementation((name: string) => {
        if (name === 'mock-tool') return mockTool;
        return undefined;
      }),
      listTools: jest.fn().mockReturnValue([mockTool]),
      execute: jest.fn().mockResolvedValue({ success: true, output: 'mock result', duration: 10 })
    })),
    getBuiltInToolsRegistry: jest.fn().mockReturnValue({
      getTool: jest.fn().mockImplementation((name: string) => {
        if (name === 'mock-tool') return mockTool;
        return undefined;
      }),
      listTools: jest.fn().mockReturnValue([mockTool]),
      execute: jest.fn().mockResolvedValue({ success: true, output: 'mock result', duration: 10 })
    })
  };
});

describe('ToolDispatcher', () => {
  let dispatcher: ToolDispatcher;

  beforeEach(() => {
    dispatcher = new ToolDispatcher();
  });

  describe('dispatch()', () => {
    it('应该成功调度内置工具', async () => {
      const toolCall: ToolActionCall = {
        name: 'mock-tool',
        parameters: { input: 'test', count: '5' },
        rawText: '<tool_action name="mock-tool"></tool_action>',
        startIndex: 0,
        endIndex: 50
      };

      const result = await dispatcher.dispatch(toolCall);

      expect(result.success).toBe(true);
      expect(result.toolName).toBe('mock-tool');
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('应该返回错误对于不存在的工具', async () => {
      const toolCall: ToolActionCall = {
        name: 'non-existent-tool',
        parameters: {},
        rawText: '<tool_action name="non-existent-tool"></tool_action>',
        startIndex: 0,
        endIndex: 50
      };

      const result = await dispatcher.dispatch(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool not found');
    });
  });

  describe('hasTool()', () => {
    it('应该正确检查工具是否存在', () => {
      expect(dispatcher.hasTool('mock-tool')).toBe(true);
      expect(dispatcher.hasTool('non-existent')).toBe(false);
    });
  });

  describe('getAvailableTools()', () => {
    it('应该返回可用工具列表', () => {
      const tools = dispatcher.getAvailableTools();

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0]).toHaveProperty('name');
      expect(tools[0]).toHaveProperty('description');
      expect(tools[0]).toHaveProperty('parameters');
    });
  });
});

describe('generateToolPrompt()', () => {
  it('应该生成包含工具描述的提示词', () => {
    const tools: ToolDescription[] = [
      {
        name: 'vector-search',
        description: '在 Skills 向量数据库中搜索相关工具',
        parameters: [
          { name: 'query', type: 'string', description: '搜索查询', required: true },
          { name: 'limit', type: 'number', description: '返回结果数量', required: false }
        ]
      }
    ];

    const prompt = generateToolPrompt(tools);

    expect(prompt).toContain('可用工具');
    expect(prompt).toContain('vector-search');
    expect(prompt).toContain('搜索查询');
    expect(prompt).toContain('tool_action');
    expect(prompt).toContain('query');
    expect(prompt).toContain('limit');
  });

  it('应该为空工具列表生成提示', () => {
    const prompt = generateToolPrompt([]);

    expect(prompt).toContain('没有可用的工具');
  });

  it('应该正确标记必需参数', () => {
    const tools: ToolDescription[] = [
      {
        name: 'test-tool',
        description: 'Test tool',
        parameters: [
          { name: 'required_param', type: 'string', description: 'Required', required: true },
          { name: 'optional_param', type: 'string', description: 'Optional', required: false }
        ]
      }
    ];

    const prompt = generateToolPrompt(tools);

    expect(prompt).toContain('必需');
  });

  it('应该包含使用示例', () => {
    const tools: ToolDescription[] = [
      {
        name: 'example-tool',
        description: 'Example',
        parameters: []
      }
    ];

    const prompt = generateToolPrompt(tools);

    expect(prompt).toContain('示例');
    expect(prompt).toContain('<tool_action');
  });
});
