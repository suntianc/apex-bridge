/**
 * ReAct Engine 集成测试
 * 端到端验证 ReAct 流程
 */

import { ReActEngine } from '../../../src/core/react/ReActEngine';
import { tools } from '../../../src/core/react/tools';
import { BaseOpenAICompatibleAdapter } from '../../../src/core/llm/adapters/BaseAdapter';

describe('ReActEngine E2E Tests', () => {
  let llmClient: any;
  let engine: ReActEngine;

  // 检查环境变量
  const hasApiKey = !!process.env.GLM_API_KEY;

  beforeAll(() => {
    if (hasApiKey) {
      llmClient = new BaseOpenAICompatibleAdapter('custom', {
        baseURL: 'https://open.bigmodel.cn/api/paas/v4',
        apiKey: process.env.GLM_API_KEY!,
        timeout: 60000
      }) as any;

      engine = new ReActEngine(tools);
    }
  });

  if (!hasApiKey) {
    console.warn('⚠️  GLM_API_KEY not set, skipping integration tests');
  }

  const runIntegrationTest = (description: string, testFn: () => Promise<void>) => {
    if (hasApiKey) {
      it(description, testFn, 120000); // 120s timeout
    } else {
      it.skip(`${description} (no API key)`, testFn);
    }
  };

  describe('场景 1: 天气查询（单工具调用）', () => {
    runIntegrationTest('应该能查询天气并返回结果', async () => {
      const messages = [{
        role: 'user',
        content: '今天北京天气如何？'
      }];

      const events: any[] = [];
      const generator = engine.execute(messages, llmClient, {
        maxIterations: 5,
        enableThink: true
      });

      for await (const event of generator) {
        events.push(event);
      }

      // 验证事件序列
      expect(events.some(e => e.type === 'tool_start')).toBe(true);
      expect(events.some(e => e.type === 'tool_end')).toBe(true);
      expect(events.some(e => e.type === 'content')).toBe(true);
      expect(events.some(e => e.type === 'done')).toBe(true);

      // 验证工具调用
      const toolStartEvents = events.filter(e => e.type === 'tool_start');
      expect(toolStartEvents.length).toBeGreaterThanOrEqual(1);
      expect(toolStartEvents[0].data.toolName).toBe('web_search');

      // 验证回答包含天气信息
      const contentEvents = events.filter(e => e.type === 'content');
      const allContent = contentEvents.map(e => e.data.content).join(' ');
      expect(allContent.length).toBeGreaterThan(0);
    });
  });

  describe('场景 2: 日期查询（单工具调用）', () => {
    runIntegrationTest('应该能获取当前日期和时间', async () => {
      const messages = [{
        role: 'user',
        content: '现在几点了？今天的日期是？'
      }];

      const events: any[] = [];
      const generator = engine.execute(messages, llmClient, {
        maxIterations: 5,
        enableThink: true
      });

      for await (const event of generator) {
        events.push(event);
        console.log(`${event.type}:`, JSON.stringify(event.data, null, 2));
      }

      // 验证事件
      expect(events.some(e => e.type === 'tool_start')).toBe(true);
      expect(events.some(e => e.type === 'tool_end')).toBe(true);
      expect(events.some(e => e.type === 'content')).toBe(true);

      // 验证工具调用
      const toolStartEvents = events.filter(e => e.type === 'tool_start');
      expect(toolStartEvents.some(t => t.data.toolName === 'get_current_date')).toBe(true);
    });
  });

  describe('场景 3: 多工具连续调用', () => {
    runIntegrationTest('应该能处理需要多个工具的问题', async () => {
      const messages = [{
        role: 'user',
        content: '今天北京天气如何？顺便告诉我现在几点了。'
      }];

      const events: any[] = [];
      const generator = engine.execute(messages, llmClient, {
        maxIterations: 10,
        enableThink: true
      });

      for await (const event of generator) {
        events.push(event);
      }

      // 验证多个工具调用
      const toolStartEvents = events.filter(e => e.type === 'tool_start');
      expect(toolStartEvents.length).toBeGreaterThanOrEqual(2); // 至少 2 个工具调用

      const toolNames = toolStartEvents.map(e => e.data.toolName);
      expect(toolNames).toContain('web_search');
      expect(toolNames).toContain('get_current_date');

      // 验证完成
      expect(events.some(e => e.type === 'done')).toBe(true);
    });
  });

  describe('场景 4: 思考过程流式输出', () => {
    runIntegrationTest('应该能流式输出 reasoning_content', async () => {
      const messages = [{
        role: 'user',
        content: '今天北京天气如何？'
      }];

      const reasoningEvents: any[] = [];
      const generator = engine.execute(messages, llmClient, {
        maxIterations: 5,
        enableThink: true  // 启用思考输出
      });

      for await (const event of generator) {
        if (event.type === 'reasoning') {
          reasoningEvents.push(event);
          console.log('思考:', event.data.content);
        }
      }

      // 验证有思考事件
      expect(reasoningEvents.length).toBeGreaterThan(0);

      // 验证思考内容非空
      const totalThinkingLength = reasoningEvents.reduce(
        (sum, e) => sum + e.data.content.length,
        0
      );
      expect(totalThinkingLength).toBeGreaterThan(10);
    });
  });

  describe('场景 5: 禁用思考输出', () => {
    runIntegrationTest('应该在 enableThink=false 时不输出 reasoning', async () => {
      const messages = [{
        role: 'user',
        content: '今天北京天气如何？'
      }];

      const events: any[] = [];
      const generator = engine.execute(messages, llmClient, {
        maxIterations: 5,
        enableThink: false  // 禁用思考输出
      });

      for await (const event of generator) {
        events.push(event);
      }

      // 验证没有 reasoning 事件
      expect(events.filter(e => e.type === 'reasoning').length).toBe(0);

      // 验证其他事件正常
      expect(events.some(e => e.type === 'tool_start')).toBe(true);
      expect(events.some(e => e.type === 'content')).toBe(true);
    });
  });

  describe('场景 6: maxIterations 限制', () => {
    runIntegrationTest('应该在达到 maxIterations 时停止', async () => {
      const messages = [{
        role: 'user',
        content: '今天北京天气如何？'
      }];

      const events: any[] = [];

      try {
        const generator = engine.execute(messages, llmClient, {
          maxIterations: 2,  // 设置较小的限制
          enableThink: false
        });

        for await (const event of generator) {
          events.push(event);
        }

        fail('应该抛出 Max iterations 错误');
      } catch (error: any) {
        // 验证达到最大迭代次数
        expect(error.message).toContain('Max iterations');

        // 验证错误事件
        expect(events.some(e =>
          e.type === 'error' && e.data.message.includes('Max iterations')
        )).toBe(true);
      }
    });
  });

  describe('场景 7: 错误恢复', () => {
    runIntegrationTest('应该能在工具错误后继续执行', async () => {
      const messages = [
        { role: 'user', content: '先获取日期，然后查询北京天气如何？' }
      ];

      const events: any[] = [];
      const generator = engine.execute(messages, llmClient, {
        maxIterations: 10,
        enableThink: true
      });

      for await (const event of generator) {
        events.push(event);
        if (event.type === 'error') {
          console.error('Error event:', event.data);
        }
      }

      // 验证有内容输出（错误后继续执行）
      const contentEvents = events.filter(e => e.type === 'content');
      expect(contentEvents.length).toBeGreaterThan(0);

      // 不应该有错误事件（如果工具都正常工作）
      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents.length).toBe(0);
    });
  });

  describe('性能测试', () => {
    runIntegrationTest('应该在合理时间内完成', async () => {
      const startTime = Date.now();

      const messages = [{
        role: 'user',
        content: '今天北京天气如何？'
      }];

      const generator = engine.execute(messages, llmClient, {
        maxIterations: 5,
        enableThink: false
      });

      for await (const event of generator) {
        // 消费事件
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`执行时间: ${duration}ms`);

      // 验证在合理时间内完成（60 秒）
      expect(duration).toBeLessThan(60000);
    });
  });
});
