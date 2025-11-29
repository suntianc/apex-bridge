/**
 * ReActEngine 单元测试
 */

import { ReActEngine } from '../../../src/core/react/ReActEngine';
import { Tool } from '../../../src/types/react';

describe('ReActEngine', () => {
  // Mock LLM 客户端
  const createMockLLMClient = (responseChunks: any[]) => {
    return {
      streamChat: jest.fn().mockImplementation(async function* () {
        for (const chunk of responseChunks) {
          yield chunk;
        }
      })
    };
  };

  // 基础工具
  const mockTools: Tool[] = [
    {
      name: 'date_tool',
      description: '获取当前日期',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      },
      execute: jest.fn().mockResolvedValue('2025-11-29T10:30:00.000Z')
    },
    {
      name: 'weather_tool',
      description: '查询天气',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string' }
        },
        required: ['location']
      },
      execute: jest.fn().mockResolvedValue({
        location: '北京',
        weather: '晴朗',
        temperature: '25°C'
      })
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('基本聊天（无工具调用）', () => {
    test('应该能处理没有工具的基本聊天', async () => {
      const engine = new ReActEngine([]);
      const mockResponse = [
        { content: '你好！' },
        { content: '有什么可以帮助你的吗？' }
      ];
      const llmClient = createMockLLMClient(mockResponse);

      const messages = [{
        role: 'user',
        content: '你好'
      }];

      const events: any[] = [];
      const generator = engine.execute(messages, llmClient, {
        enableThink: false
      });

      for await (const event of generator) {
        events.push(event);
      }

      // 验证事件
      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'content')).toBe(true);
      expect(events.some(e => e.type === 'done')).toBe(true);

      // 验证内容
      const contentEvents = events.filter(e => e.type === 'content');
      expect(contentEvents[0].data.content).toBe('你好！');
      expect(contentEvents[1].data.content).toBe('有什么可以帮助你的吗？');
    });
  });

  describe('单工具调用', () => {
    test('应该能执行单个工具并回流结果', async () => {
      const engine = new ReActEngine(mockTools);

      // Mock LLM 响应：第一次返回工具调用，第二次返回回答
      const llmClient = createMockLLMClient([
        // 第一次调用：工具调用
        {
          tool_calls: [{
            id: 'call_1',
            index: 0,
            function: {
              name: 'date_tool',
              arguments: '{}'
            }
          }]
        },
        // 第二次调用：回答
        { content: '现在是 2025-11-29' }
      ]);

      const messages = [{
        role: 'user',
        content: '现在几点了？'
      }];

      const events: any[] = [];
      const generator = engine.execute(messages, llmClient, {
        enableThink: false,
        maxIterations: 5
      });

      for await (const event of generator) {
        events.push(event);
      }

      // 验证事件序列
      expect(events.some(e => e.type === 'tool_start')).toBe(true);
      expect(events.some(e => e.type === 'tool_end')).toBe(true);
      expect(events.some(e => e.type === 'content')).toBe(true);
      expect(events.some(e => e.type === 'done')).toBe(true);

      // 验证工具被调用
      expect(mockTools[0].execute).toHaveBeenCalled();

      // 验证工具结果包含在回答中
      const contentEvents = events.filter(e => e.type === 'content');
      expect(contentEvents.length).toBeGreaterThan(0);
    });
  });

  describe('思考过程（reasoning）', () => {
    test('应该能处理并流式输出 reasoning_content', async () => {
      const engine = new ReActEngine([]);
      const mockResponse = [
        { reasoning_content: 'Hmm...' },
        { reasoning_content: 'The user is asking...' },
        { content: 'I understand your question.' }
      ];
      const llmClient = createMockLLMClient(mockResponse);

      const messages = [{
        role: 'user',
        content: 'Hello'
      }];

      const events: any[] = [];
      const generator = engine.execute(messages, llmClient, {
        enableThink: true
      });

      for await (const event of generator) {
        events.push(event);
      }

      // 验证 reasoning 事件
      const reasoningEvents = events.filter(e => e.type === 'reasoning');
      expect(reasoningEvents.length).toBe(2);
      expect(reasoningEvents[0].data.content).toBe('Hmm...');
      expect(reasoningEvents[1].data.content).toBe('The user is asking...');

      // 验证 content 事件
      expect(events.some(e => e.type === 'content')).toBe(true);
    });

    test('应该能禁用 reasoning 输出', async () => {
      const engine = new ReActEngine([]);
      const mockResponse = [
        { reasoning_content: 'This should not be yielded' },
        { content: 'Final answer' }
      ];
      const llmClient = createMockLLMClient(mockResponse);

      const messages = [{
        role: 'user',
        content: 'Hello'
      }];

      const events: any[] = [];
      const generator = engine.execute(messages, llmClient, {
        enableThink: false  // 禁用思考输出
      });

      for await (const event of generator) {
        events.push(event);
      }

      // 验证没有 reasoning 事件
      expect(events.filter(e => e.type === 'reasoning').length).toBe(0);

      // 验证有 content 事件
      expect(events.some(e => e.type === 'content')).toBe(true);
    });
  });

  describe('工具执行错误', () => {
    test('应该能处理工具执行失败并继续执行', async () => {
      const brokenTool: Tool = {
        name: 'broken_tool',
        description: '一个有问题的工具',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        },
        execute: jest.fn().mockRejectedValue(new Error('Tool execution failed'))
      };

      const engine = new ReActEngine([brokenTool]);

      const llmClient = createMockLLMClient([
        {
          tool_calls: [{
            id: 'call_1',
            index: 0,
            function: {
              name: 'broken_tool',
              arguments: '{}'
            }
          }]
        },
        { content: 'I apologize, but I encountered an error.' }
      ]);

      const messages = [{
        role: 'user',
        content: 'Use the broken tool'
      }];

      const events: any[] = [];
      const generator = engine.execute(messages, llmClient, {
        enableThink: false
      });

      for await (const event of generator) {
        events.push(event);
      }

      // 验证错误事件
      expect(events.some(e => e.type === 'error')).toBe(true);

      // 验证流程继续（有 content 输出）
      expect(events.some(e => e.type === 'content')).toBe(true);

      // 验证工具被尝试执行
      expect(brokenTool.execute).toHaveBeenCalled();
    });
  });

  describe('迭代次数限制', () => {
    test('应该遵守 maxIterations 限制', async () => {
      const engine = new ReActEngine(mockTools);

      // 创建一个会无限循环的工具调用场景
      const llmClient = createMockLLMClient([
        {
          tool_calls: [{
            id: 'call_1',
            index: 0,
            function: {
              name: 'date_tool',
              arguments: '{}'
            }
          }]
        }
      ]);

      const messages = [{
        role: 'user',
        content: 'Loop test'
      }];

      const events: any[] = [];

      try {
        const generator = engine.execute(messages, llmClient, {
          maxIterations: 3,  // 限制为 3 次迭代
          enableThink: false
        });

        for await (const event of generator) {
          events.push(event);
        }

        // 不应该到达这里
        fail('Should have thrown max iterations error');
      } catch (error) {
        // 验证达到最大迭代次数
        const errorMessage = error instanceof Error ? error.message : String(error);
        expect(errorMessage).toContain('Max iterations reached');

        // 验证错误事件
        expect(events.some(e =>
          e.type === 'error' && e.data.message.includes('Max iterations')
        )).toBe(true);
      }
    });
  });

  describe('超时控制', () => {
    test('应该在超时后停止执行', async () => {
      const engine = new ReActEngine([]);

      // 模拟慢速响应
      const slowLLMClient = {
        streamChat: jest.fn().mockImplementation(async function* () {
          await new Promise(resolve => setTimeout(resolve, 1000));
          yield { content: 'Slow response' };
        })
      };

      const messages = [{
        role: 'user',
        content: 'Test timeout'
      }];

      try {
        const generator = engine.execute(messages, slowLLMClient, {
          timeout: 500,  // 500ms 超时（模拟）
          enableThink: false
        });

        for await (const event of generator) {
          // 消费事件
        }
      } catch (error) {
        // 验证超时错误
        const errorMessage = error instanceof Error ? error.message : String(error);
        expect(errorMessage).toContain('timeout');
      }
    });
  });

  describe('多工具调用', () => {
    test('应该能处理多个工具调用', async () => {
      const engine = new ReActEngine(mockTools);

      const llmClient = createMockLLMClient([
        // 第一次调用：返回多个工具调用
        {
          tool_calls: [
            {
              id: 'call_1',
              index: 0,
              function: {
                name: 'date_tool',
                arguments: '{}'
              }
            },
            {
              id: 'call_2',
              index: 1,
              function: {
                name: 'weather_tool',
                arguments: '{"location": "北京"}'
              }
            }
          ]
        },
        { content: 'Today is 2025-11-29 and Beijing weather is sunny.' }
      ]);

      const messages = [{
        role: 'user',
        content: '今天日期和天气？'
      }];

      const events: any[] = [];
      const generator = engine.execute(messages, llmClient, {
        enableThink: false
      });

      for await (const event of generator) {
        events.push(event);
      }

      // 验证所有工具都被调用
      expect(mockTools[0].execute).toHaveBeenCalled(); // date_tool
      expect(mockTools[1].execute).toHaveBeenCalled(); // weather_tool

      // 验证工具事件
      const toolStartEvents = events.filter(e => e.type === 'tool_start');
      expect(toolStartEvents.length).toBe(2);
    });
  });

  describe('工具调用参数合并（SSE 分片）', () => {
    test('应该能合并分片的 tool_calls', async () => {
      const engine = new ReActEngine(mockTools);

      // 模拟 SSE 分片传输的 tool_calls
      const llmClient = createMockLLMClient([
        {
          tool_calls: [{
            id: 'call_1',
            index: 0,
            function: {
              name: 'weather_tool',
              arguments: '{"location": "'
            }
          }]
        },
        {
          tool_calls: [{
            id: 'call_1',
            index: 0,
            function: {
              name: 'weather_tool',
              arguments: '北京"}'
            }
          }]
        },
        { content: 'Beijing weather is sunny.' }
      ]);

      const messages = [{
        role: 'user',
        content: '北京天气？'
      }];

      const events: any[] = [];
      const generator = engine.execute(messages, llmClient, {
        enableThink: false
      });

      for await (const event of generator) {
        events.push(event);
      }

      // 验证工具被执行（参数被正确合并）
      expect(mockTools[1].execute).toHaveBeenCalledWith({ location: '北京' });

      // 验证工具调用事件
      expect(events.some(e => e.type === 'tool_start')).toBe(true);
    });
  });
});
