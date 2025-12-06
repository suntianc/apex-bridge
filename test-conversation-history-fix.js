/**
 * 测试脚本：验证对话历史存储修复
 * 测试场景：
 * 1. 深度思考模式（非流式）- 验证无重复、无system消息
 * 2. 深度思考模式（流式）- 验证无重复、无system消息
 * 3. 普通模式 - 验证无重复、无system消息
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 数据目录
const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'conversation_history.db');

// 清理并重新创建测试数据
function resetDatabase() {
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('✅ 已清理旧数据库');
  }

  // 创建数据目录
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 初始化数据库结构
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      metadata TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_conversation_id ON conversation_messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_conversation_created ON conversation_messages(conversation_id, created_at);
  `);
  db.close();
  console.log('✅ 已创建新数据库\n');
}

// 查询对话历史
function queryHistory(conversationId) {
  const db = new Database(dbPath);
  const stmt = db.prepare(`
    SELECT id, role, content, LENGTH(content) as content_length
    FROM conversation_messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `);
  const rows = stmt.all(conversationId);
  db.close();
  return rows;
}

// 分析历史记录
function analyzeHistory(conversationId, testName) {
  console.log(`\n===== ${testName} =====`);
  const history = queryHistory(conversationId);

  console.log(`总消息数: ${history.length}`);

  // 检查system消息
  const systemMessages = history.filter(m => m.role === 'system');
  console.log(`System消息数: ${systemMessages.length} ${systemMessages.length > 0 ? '❌ 错误！' : '✅ 正确'}`);

  // 检查重复
  const userMessages = history.filter(m => m.role === 'user').map(m => m.content);
  const uniqueUserMessages = new Set(userMessages);
  const hasDuplicateUsers = userMessages.length !== uniqueUserMessages.size;
  console.log(`User消息重复: ${hasDuplicateUsers ? '❌ 错误！' : '✅ 正确'}`);

  // 显示详细内容
  console.log('\n消息详情:');
  history.forEach((msg, idx) => {
    const preview = msg.content.substring(0, 100).replace(/\n/g, ' ');
    const hasThinking = msg.content.includes('<thinking>');
    console.log(`${idx + 1}. [${msg.role.toUpperCase()}] ${preview}...${hasThinking ? ' [含思考]' : ''}`);
  });

  // 总结
  const passed = systemMessages.length === 0 && !hasDuplicateUsers;
  console.log(`\n测试结果: ${passed ? '✅ 通过' : '❌ 失败'}`);

  return passed;
}

// 主测试流程
async function runTests() {
  console.log('🚀 开始对话历史存储修复验证\n');

  resetDatabase();

  // 注意：这里我们无法直接调用ChatService，因为需要完整的初始化
  // 实际的测试需要通过API接口或测试用例来进行
  // 这里只是创建一个框架，用于手动测试后验证数据库内容

  console.log('\n📋 手动测试步骤:');
  console.log('1. 启动服务: npm run dev');
  console.log('2. 使用深度思考模式发送几条消息');
  console.log('3. 查看数据库: sqlite3 data/conversation_history.db');
  console.log('4. 执行查询: SELECT * FROM conversation_messages WHERE conversation_id = "your-id";');
  console.log('5. 验证: 无system消息，无重复记录');

  console.log('\n✅ 测试框架已准备完成');
}

// 如果有提供conversationId参数，则直接分析
const args = process.argv.slice(2);
if (args.length > 0) {
  const conversationId = args[0];
  analyzeHistory(conversationId, '手动测试分析');
} else {
  runTests();
}
