#!/usr/bin/env node

/**
 * 测试流式思考输出功能
 * 运行: node tests/test-stream-thinking.js
 */

const { fetch } = require('undici');
const readline = require('readline');

// ANSI 颜色代码
const colors = {
  reset: '\x1b[0m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  gray: '\x1b[90m'
};

function colorize(color, text) {
  return `${colors[color]}${text}${colors.reset}`;
}

async function testStreamThinking() {
  console.log('🧪 测试流式思考输出功能\n');
  console.log(colorize('gray', '=' .repeat(60)));

  try {
    const response = await fetch('http://localhost:3000/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [{
          role: 'user',
          content: '请计算这个算法的时间复杂度：for(i=0;i<n;i++) for(j=0;j<n;j++) sum += arr[i][j];'
        }],
        model: 'gpt-4',
        stream: true,
        selfThinking: {
          enabled: true,
          maxIterations: 3,
          includeThoughtsInResponse: true,
          enableStreamThoughts: true  // ⭐ 启用思考流式输出
        }
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let eventType = null;
    let chunkCount = 0;

    console.log('\n' + colorize('cyan', '▶ 开始接收流式数据\n'));

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('event: ')) {
          eventType = line.replace('event: ', '').trim();
          continue;
        }

        if (line.startsWith('data: ')) {
          const data = line.replace('data: ', '').trim();

          if (data === '[DONE]') {
            console.log('\n' + colorize('yellow', '=' .repeat(60)));
            console.log(colorize('green', '✅ 流式传输完成！'));
            console.log(colorize('yellow', '=' .repeat(60)));
            return;
          }

          chunkCount++;

          try {
            const parsed = JSON.parse(data);

            // 处理 requestId
            if (parsed.requestId) {
              console.log(colorize('gray', `📡 Request ID: ${parsed.requestId}`));
            }
            // 处理思考过程
            else if (parsed._type === 'thought') {
              const iteration = parsed._iteration;
              const content = parsed.choices?.[0]?.delta?.content || '';
              console.log(
                colorize('blue', `🤔 思考 ${iteration}:`),
                colorize('white', content)
              );
            }
            // 处理最终答案
            else if (parsed._type === 'answer') {
              const content = parsed.choices?.[0]?.delta?.content || '';
              console.log(
                colorize('green', `📝 答案:`),
                colorize('white', content)
              );
            }
            // 处理自定义事件（action_start, observation 等）
            else {
              handleCustomEvent(eventType, data);
            }
          } catch (e) {
            console.log(colorize('gray', '→ 未解析数据:'), data);
          }

          eventType = null; // 重置事件类型
        }
      }
    }

    console.log(`\n${colorize('gray', `收到 ${chunkCount} 个数据块`)}`);

  } catch (error) {
    console.error(colorize('red', `❌ 错误: ${error.message}`));
    process.exit(1);
  }
}

function handleCustomEvent(eventType, data) {
  if (!eventType) return;

  try {
    const parsed = JSON.parse(data);

    switch (eventType) {
      case 'thought_start':
        console.log(colorize('cyan', `\n→ 思考开始 (第 ${parsed.iteration} 轮)`));
        break;

      case 'thought_end':
        console.log(colorize('cyan', `→ 思考结束 (第 ${parsed.iteration} 轮)\n`));
        break;

      case 'action_start':
        console.log(
          colorize('yellow', `→ 工具执行: ${parsed.tool}`),
          colorize('gray', `参数: ${JSON.stringify(parsed.params)}`)
        );
        break;

      case 'observation':
        const result = parsed.result || parsed.error || '无结果';
        console.log(
          colorize('green', `→ 观察结果: ${parsed.tool}`),
          colorize('gray', `结果: ${result.substring(0, 100)}...`)
        );
        break;

      case 'answer_start':
        console.log(colorize('magenta', '\n→ 开始生成最终答案'));
        break;

      case 'answer_end':
        console.log(colorize('magenta', '→ 最终答案生成完成\n'));
        break;
    }
  } catch (e) {
    // 如果解析失败，打印原始数据
    console.log(colorize('gray', `→ ${eventType}:`), data);
  }
}

// 主函数
(async () => {
  console.log(colorize('blue', '🚀 ApexBridge 流式思考测试\n'));
  console.log(colorize('gray', '配置:'));
  console.log(colorize('gray', '  enableStreamThoughts: true'));
  console.log(colorize('gray', '  maxIterations: 3'));
  console.log(colorize('gray', '  model: gpt-4'));
  console.log();

  await testStreamThinking();

  console.log('\n' + colorize('gray', '测试完成！'));
  process.exit(0);
})();
