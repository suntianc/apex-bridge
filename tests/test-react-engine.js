#!/usr/bin/env node

/**
 * ReActEngine 简单功能测试
 * 运行: node tests/test-react-engine.js
 */

const path = require('path');

// 模拟 LLM 客户端
class MockLLMClient {
  async chat(messages, options) {
    // 模拟输出
    return {
      choices: [
        {
          message: {
            content: `<thought>我需要计算2+2</thought>
<answer>2+2=4</answer>`
          }
        }
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10 }
    };
  }

  async *streamChat(messages, options, abortSignal) {
    const response = `<thought>我需要计算2+2</thought>
<answer>2+2=4</answer>`;

    for (const char of response) {
      if (abortSignal?.aborted) {
        break;
      }
      yield char;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}

// 测试函数
async function testReActEngine() {
  console.log('🧪 ReActEngine 功能测试\n');

  try {
    // 导入模块（使用 require 转译后的 js 或直接用 ts-node）
    const { ReActEngine } = require('../dist/services/ReActEngine.js');

    console.log('✅ 模块导入成功\n');

    // 创建引擎
    const engine = new ReActEngine();
    console.log('✅ 创建 ReActEngine 实例\n');

    // 执行测试
    const llmClient = new MockLLMClient();
    const options = {
      maxIterations: 3,
      enableStreamThoughts: false
    };

    console.log('📝 执行非流式调用...\n');
    const result = await engine.execute("计算2+2", llmClient, options);

    console.log('✅ 执行完成！\n');
    console.log('结果:', JSON.stringify(result, null, 2));

    // 验证结果
    if (result.content && result.content.includes('4')) {
      console.log('\n' + '='.repeat(50));
      console.log('✅ 测试通过：ReActEngine 正常工作！');
      console.log('='.repeat(50) + '\n');
      return true;
    } else {
      console.log('\n' + '='.repeat(50));
      console.log('❌ 测试失败：结果不符合预期');
      console.log('='.repeat(50) + '\n');
      return false;
    }

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    console.error(error.stack);
    return false;
  }
}

// 主函数
(async () => {
  console.log('='.repeat(60));
  console.log('  ReActEngine 功能验证测试');
  console.log('='.repeat(60) + '\n');

  const success = await testReActEngine();

  console.log('='.repeat(60));
  console.log(success ? '✅ 所有测试通过！' : '❌ 测试失败');
  console.log('='.repeat(60) + '\n');

  process.exit(success ? 0 : 1);
})();
