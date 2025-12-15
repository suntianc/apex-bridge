#!/usr/bin/env node
/**
 * LLM 提供商配置初始化脚本
 * 
 * 使用方法：
 *   node scripts/init-llm-providers.js
 * 
 * 环境变量（可选）：
 *   DEEPSEEK_API_KEY - DeepSeek API Key
 *   OPENAI_API_KEY - OpenAI API Key
 *   ZHIPU_API_KEY - 智谱 AI API Key
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 确保数据目录存在
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('✅ 创建数据目录:', dataDir);
}

const dbPath = path.join(dataDir, 'llm_providers.db');
const db = new Database(dbPath);

console.log('');
console.log('='.repeat(70));
console.log('  ApexBridge LLM 提供商配置初始化');
console.log('='.repeat(70));
console.log('');
console.log('📦 数据库路径:', dbPath);
console.log('');

// 初始化表结构
db.exec(`
  CREATE TABLE IF NOT EXISTS llm_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    config_json TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_provider ON llm_providers(provider);
  CREATE INDEX IF NOT EXISTS idx_enabled ON llm_providers(enabled);
`);

console.log('✅ 数据库表结构已初始化\n');

// LLM 提供商配置
const providers = [
  {
    provider: 'deepseek',
    name: 'DeepSeek AI',
    config: {
      apiKey: process.env.DEEPSEEK_API_KEY || 'sk-your-deepseek-api-key',
      baseURL: 'https://api.deepseek.com',
      defaultModel: 'deepseek-chat',
      timeout: 60000,
      maxRetries: 3
    },
    enabled: true,
    description: '推荐使用，性价比高'
  },
  {
    provider: 'openai',
    name: 'OpenAI GPT',
    config: {
      apiKey: process.env.OPENAI_API_KEY || 'sk-your-openai-api-key',
      baseURL: 'https://api.openai.com/v1',
      defaultModel: 'gpt-3.5-turbo',
      timeout: 60000,
      maxRetries: 3
    },
    enabled: false,
    description: '功能强大，需要国际网络'
  },
  {
    provider: 'zhipu',
    name: '智谱 AI',
    config: {
      apiKey: process.env.ZHIPU_API_KEY || 'your-zhipu-api-key',
      baseURL: 'https://open.bigmodel.cn/api/paas/v4',
      defaultModel: 'glm-4',
      timeout: 60000,
      maxRetries: 3
    },
    enabled: false,
    description: '国产模型，支持中文'
  },
  {
    provider: 'ollama',
    name: 'Ollama 本地模型',
    config: {
      baseURL: 'http://localhost:11434',
      defaultModel: 'qwen3-vl:4b',
      timeout: 120000
    },
    enabled: false,
    description: '本地部署Open，支持AI兼容格式，无需 API Key'
  }
];

const stmt = db.prepare(`
  INSERT OR REPLACE INTO llm_providers (provider, name, config_json, enabled, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const now = Date.now();
let addedCount = 0;

console.log('📝 添加 LLM 提供商配置...\n');

providers.forEach(p => {
  try {
    stmt.run(
      p.provider,
      p.name,
      JSON.stringify(p.config),
      p.enabled ? 1 : 0,
      now,
      now
    );
    
    const status = p.enabled ? '✅ 已启用' : '⚪ 未启用';
    console.log(`${status} ${p.name.padEnd(20)} (${p.provider})`);
    console.log(`       ${p.description}`);
    console.log('');
    
    addedCount++;
  } catch (error) {
    console.error(`❌ 添加 ${p.name} 失败:`, error.message);
  }
});

// 查询并显示最终结果
console.log('='.repeat(70));
console.log(`✅ 成功添加 ${addedCount}/${providers.length} 个 LLM 提供商配置`);
console.log('='.repeat(70));
console.log('');

const allProviders = db.prepare('SELECT id, provider, name, enabled FROM llm_providers ORDER BY id').all();

console.log('📊 当前配置的提供商：\n');
allProviders.forEach(p => {
  const status = p.enabled === 1 ? '✅' : '⚪';
  console.log(`  ${status} [ID: ${p.id}] ${p.name} (${p.provider})`);
});

console.log('');
console.log('='.repeat(70));
console.log('📋 下一步操作：');
console.log('='.repeat(70));
console.log('');
console.log('1. 更新 API Key（如果使用占位符）：');
console.log('   方法 A: 设置环境变量后重新运行此脚本');
console.log('   export DEEPSEEK_API_KEY="sk-your-actual-key"');
console.log('   node scripts/init-llm-providers.js');
console.log('');
console.log('   方法 B: 直接编辑数据库');
console.log('   sqlite3 data/llm_providers.db');
console.log('   UPDATE llm_providers SET config_json = \'...\' WHERE provider = \'deepseek\';');
console.log('');
console.log('   方法 C: 使用 API 接口更新');
console.log('   curl -X PUT http://localhost:8088/api/llm/providers/1 \\');
console.log('     -H "Content-Type: application/json" \\');
console.log('     -d \'{"config": {"apiKey": "sk-your-actual-key"}}\'');
console.log('');
console.log('2. 设置默认提供商（在 config/admin-config.json）：');
console.log('   "llm": {');
console.log('     "defaultProvider": "deepseek"');
console.log('   }');
console.log('');
console.log('3. 启动或重启服务：');
console.log('   npm run dev');
console.log('');
console.log('4. 测试聊天功能：');
console.log('   curl -X POST http://localhost:8088/v1/chat/completions \\');
console.log('     -H "Content-Type: application/json" \\');
console.log('     -d \'{"messages": [{"role": "user", "content": "你好"}]}\'');
console.log('');

db.close();

