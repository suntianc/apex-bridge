#!/usr/bin/env node

/**
 * 测试深度思考过程是否保存到对话历史
 * 运行: node tests/test-history-thinking.js
 */

const Database = require('better-sqlite3');
const path = require('path');

// ANSI 颜色代码
const colors = {
  reset: '\x1b[0m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m'
};

function colorize(color, text) {
  return `${colors[color]}${text}${colors.reset}`;
}

async function testHistoryThinking() {
  console.log(colorize('blue', '🧪 测试深度思考历史保存\n'));

  // 连接到数据库
  const dbPath = path.join(__dirname, '../data/conversations.db');
  console.log(colorize('gray', `数据库路径: ${dbPath}`));

  try {
    const db = new Database(dbPath);

    // 查询最近的对话历史
    const query = `
      SELECT
        conversation_id,
        role,
        content,
        timestamp
      FROM messages
      WHERE role = 'assistant'
        AND content LIKE '%思考过程:%'
      ORDER BY timestamp DESC
      LIMIT 5
    `;

    const rows = db.prepare(query).all();

    console.log(colorize('yellow', '\n→ 查询包含思考过程的 AI 回复:\n'));

    if (rows.length === 0) {
      console.log(colorize('red', '❌ 未找到包含思考过程的对话历史'));
      console.log(colorize('gray', '\n这可能是因为:'));
      console.log(colorize('gray', '  1. 还没有进行过深度思考对话'));
      console.log(colorize('gray', '  2. 对话历史保存功能未启用'));
      console.log(colorize('gray', '  3. 思考过程未被正确保存'));
      return false;
    }

    console.log(colorize('green', `✅ 找到 ${rows.length} 条包含思考过程的记录\n`));

    rows.forEach((row, index) => {
      console.log(colorize('cyan', `\n━━━ 记录 #${index + 1} ━━━━`));
      console.log(colorize('gray', `会话ID: ${row.conversation_id}`));
      console.log(colorize('gray', `时间: ${new Date(row.timestamp).toLocaleString()}`));
      console.log(colorize('yellow', '\n思考过程预览:'));

      // 提取思考过程部分
      const content = row.content;
      const thoughtMatch = content.match(/思考过程:([\s\S]*?)\n\n/);

      if (thoughtMatch) {
        const thinkingProcess = thoughtMatch[1].trim();
        const lines = thinkingProcess.split('\n').slice(0, 10); // 显示前10行

        lines.forEach(line => {
          if (line.includes('[思考')) {
            console.log(colorize('blue', `  ${line}`));
          } else if (line.includes('[执行工具')) {
            console.log(colorize('yellow', `  ${line}`));
          } else if (line.includes('[观察')) {
            console.log(colorize('green', `  ${line}`));
          } else {
            console.log(colorize('gray', `  ${line}`));
          }
        });

        if (thinkingProcess.split('\n').length > 10) {
          console.log(colorize('gray', '  ...（更多内容省略）'));
        }
      }

      // 显示最终答案
      const answerMatch = content.match(/\n\n([\s\S]*)$/);
      if (answerMatch) {
        console.log(colorize('magenta', '\n最终答案:'));
        console.log(colorize('white', `  ${answerMatch[1].substring(0, 150)}...`));
      }
    });

    // 统计所有对话中的思考步骤数量
    const statsQuery = `
      SELECT
        COUNT(*) as total_messages,
        SUM(CASE WHEN content LIKE '%思考%' THEN 1 ELSE 0 END) as thought_count,
        SUM(CASE WHEN content LIKE '%执行工具%' THEN 1 ELSE 0 END) as action_count,
        SUM(CASE WHEN content LIKE '%观察%' THEN 1 ELSE 0 END) as observation_count
      FROM messages
      WHERE role = 'assistant'
    `;

    const stats = db.prepare(statsQuery).get();

    console.log(colorize('cyan', '\n┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓'));
    console.log(colorize('cyan', '┃  统计信息                        ┃'));
    console.log(colorize('cyan', '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛'));
    console.log(colorize('gray', `  总 AI 消息数: ${stats.total_messages}`));
    console.log(colorize('blue', `  包含思考: ${stats.thought_count}`));
    console.log(colorize('yellow', `  包含工具执行: ${stats.action_count}`));
    console.log(colorize('green', `  包含观察: ${stats.observation_count}`));
    console.log();

    db.close();
    return true;

  } catch (error) {
    console.error(colorize('red', `❌ 错误: ${error.message}`));
    return false;
  }
}

// 主函数
(async () => {
  console.log(colorize('blue', '=' .repeat(60)));
  console.log(colorize('blue', '  ApexBridge 深度思考历史保存测试'));
  console.log(colorize('blue', '=' .repeat(60)));
  console.log();

  const success = await testHistoryThinking();

  console.log(colorize('blue', '=' .repeat(60)));
  console.log(
    colorize(success ? 'green' : 'red',
      success ? '✅ 测试完成' : '⚠️  测试失败'
    )
  );
  console.log(colorize('blue', '=' .repeat(60)));

  process.exit(success ? 0 : 1);
})();
