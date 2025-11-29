/**
 * ReAct Engine 前端使用示例（Node.js）
 *
 * 演示如何消费 ReActEngine 的流式事件
 */

import { ReActEngine } from '../src/core/react/ReActEngine';
import { tools } from '../src/core/react/tools';
import { BaseOpenAICompatibleAdapter } from '../src/core/llm/adapters/BaseAdapter';

// 初始化 LLM 客户端（GLM）
const llmClient = new BaseOpenAICompatibleAdapter('custom', {
  baseURL: 'https://open.bigmodel.cn/api/paas/v4',
  apiKey: process.env.GLM_API_KEY || '',
  timeout: 60000
}) as any;

/**
 * 示例 1: 天气查询（需要 web_search 工具）
 */
async function exampleWeatherQuery() {
  console.log('\n' + '='.repeat(80));
  console.log('示例 1: 天气查询');
  console.log('='.repeat(80) + '\n');

  const reactEngine = new ReActEngine(tools);

  const messages = [{
    role: 'user',
    content: '今天北京天气如何？'
  }];

  try {
    for await (const event of reactEngine.execute(messages, llmClient, {
      maxIterations: 5,
      enableThink: true
    })) {
      switch (event.type) {
        case 'reasoning':
          process.stdout.write('\x1b[90m' + event.data.content + '\x1b[0m');
          break;

        case 'content':
          process.stdout.write('\x1b[32m' + event.data.content + '\x1b[0m');
          break;

        case 'tool_start':
          console.log('\n\x1b[33m[工具调用] \x1b[0m\x1b[36m' + event.data.toolName + '\x1b[0m');
          console.log('\x1b[33m[参数] \x1b[0m' + event.data.args);
          break;

        case 'tool_end':
          console.log('\n\x1b[33m[工具结果] \x1b[0m\x1b[35m' +
            JSON.stringify(event.data.result, null, 2).substring(0, 200) + '\x1b[0m');
          break;

        case 'error':
          console.error('\n\x1b[31m[错误] \x1b[0m' + event.data.message);
          break;

        case 'done':
          console.log('\n\n\x1b[32m✓ 对话完成\x1b[0m');
          break;
      }
    }
  } catch (error) {
    console.error('\n\x1b[31m✗ 执行失败:', error.message + '\x1b[0m');
  }
}

/**
 * 示例 2: 日期查询（需要 date 工具）
 */
async function exampleDateQuery() {
  console.log('\n' + '='.repeat(80));
  console.log('示例 2: 日期查询');
  console.log('='.repeat(80) + '\n');

  const reactEngine = new ReActEngine(tools);

  const messages = [{
    role: 'user',
    content: '现在几点了？今天的日期是？'
  }];

  try {
    const events = [];
    for await (const event of reactEngine.execute(messages, llmClient, {
      maxIterations: 5,
      enableThink: true
    })) {
      events.push(event);

      switch (event.type) {
        case 'reasoning':
          process.stdout.write('\x1b[90m' + event.data.content + '\x1b[0m');
          break;

        case 'content':
          process.stdout.write('\x1b[32m' + event.data.content + '\x1b[0m');
          break;

        case 'tool_start':
          console.log('\n\x1b[33m[工具调用] \x1b[36m' + event.data.toolName + '\x1b[0m');
          break;

        case 'tool_end':
          console.log('\n\x1b[33m[工具结果] \x1b[35m' +
            JSON.stringify(event.data.result) + '\x1b[0m');
          break;

        case 'error':
          console.error('\n\x1b[31m[错误] ' + event.data.message + '\x1b[0m');
          break;

        case 'done':
          console.log('\n\n\x1b[32m✓ 对话完成\x1b[0m');
          console.log('\x1b[34m事件统计:\x1b[0m', {
            reasoning: events.filter(e => e.type === 'reasoning').length,
            content: events.filter(e => e.type === 'content').length,
            toolCalls: events.filter(e => e.type === 'tool_start').length,
            errors: events.filter(e => e.type === 'error').length
          });
          break;
      }
    }
  } catch (error) {
    console.error('\n\x1b[31m✗ 执行失败:', error.message + '\x1b[0m');
  }
}

/**
 * 示例 3: 多轮对话（多个工具连续调用）
 */
async function exampleMultiTurn() {
  console.log('\n' + '='.repeat(80));
  console.log('示例 3: 多轮对话（天气 + 日期）');
  console.log('='.repeat(80) + '\n');

  const reactEngine = new ReActEngine(tools);

  const messages = [{
    role: 'user',
    content: '今天北京天气如何？顺便告诉我现在几点了。'
  }];

  try {
    for await (const event of reactEngine.execute(messages, llmClient, {
      maxIterations: 10,
      enableThink: true
    })) {
      switch (event.type) {
        case 'reasoning':
          process.stdout.write('\x1b[90m[思考] ' + event.data.content + '\x1b[0m\n');
          break;

        case 'content':
          process.stdout.write('\x1b[32m[回答] ' + event.data.content + '\x1b[0m');
          break;

        case 'tool_start':
          console.log('\x1b[33m[工具] 执行 ' + event.data.toolName + '\x1b[0m');
          break;

        case 'tool_end':
          console.log('\x1b[33m[结果] ' + JSON.stringify(event.data.result).substring(0, 100) + '\x1b[0m');
          break;

        case 'done':
          console.log('\n\x1b[32m✓ 完成\x1b[0m');
          return;

        case 'error':
          console.error('\x1b[31m✗ 错误: ' + event.data.message + '\x1b[0m');
          return;
      }
    }
  } catch (error) {
    console.error('\n\x1b[31m✗ 执行失败:', error.message + '\x1b[0m');
  }
}

/**
 * 主函数
 */
async function main() {
  // 检查 API Key
  if (!process.env.GLM_API_KEY) {
    console.error('错误: 请设置 GLM_API_KEY 环境变量');
    process.exit(1);
  }

  console.log('\x1b[36mReAct Engine 示例程序\x1b[0m');
  console.log('\x1b[34m======================\x1b[0m\n');

  try {
    await exampleWeatherQuery();
    await new Promise(resolve => setTimeout(resolve, 2000));

    await exampleDateQuery();
    await new Promise(resolve => setTimeout(resolve, 2000));

    await exampleMultiTurn();
  } catch (error) {
    console.error('\x1b[31m程序错误:', error + '\x1b[0m');
    process.exit(1);
  }
}

// 运行
if (require.main === module) {
  main();
}

export { exampleWeatherQuery, exampleDateQuery, exampleMultiTurn };
