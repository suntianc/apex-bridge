#!/usr/bin/env node
/**
 * 仅初始化提供商（不添加模型）
 * 
 * 使用方法:
 *   node scripts/init-providers-only.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'llm_providers.db');
const db = new Database(dbPath);

console.log('');
console.log('='.repeat(70));
console.log('  初始化 LLM 提供商（仅提供商，不含模型）');
console.log('='.repeat(70));
console.log('');

// 确保表结构存在
db.exec(`
  CREATE TABLE IF NOT EXISTS llm_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    base_config TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    CHECK(enabled IN (0, 1))
  );

  CREATE TABLE IF NOT EXISTS llm_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER NOT NULL,
    model_key TEXT NOT NULL,
    model_name TEXT NOT NULL,
    model_type TEXT NOT NULL,
    model_config TEXT NOT NULL,
    api_endpoint_suffix TEXT,
    enabled INTEGER DEFAULT 1,
    is_default INTEGER DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (provider_id) REFERENCES llm_providers(id) ON DELETE CASCADE,
    UNIQUE(provider_id, model_key),
    CHECK(enabled IN (0, 1)),
    CHECK(is_default IN (0, 1)),
    CHECK(model_type IN ('nlp', 'embedding', 'rerank', 'image', 'audio', 'other'))
  );
`);

// 提供商配置（不含模型）
const providers = [
  {
    provider: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek AI - 高性价比聊天和代码模型',
    baseConfig: {
      apiKey: process.env.DEEPSEEK_API_KEY || 'sk-your-deepseek-api-key',
      baseURL: 'https://api.deepseek.com',
      timeout: 60000,
      maxRetries: 3
    },
    enabled: true
  },
  {
    provider: 'openai',
    name: 'OpenAI',
    description: 'OpenAI GPT 系列模型',
    baseConfig: {
      apiKey: process.env.OPENAI_API_KEY || 'sk-your-openai-api-key',
      baseURL: 'https://api.openai.com/v1',
      timeout: 60000,
      maxRetries: 3
    },
    enabled: false
  }
];

const stmt = db.prepare(`
  INSERT OR REPLACE INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const now = Date.now();
let count = 0;

console.log('📝 添加提供商...\n');

providers.forEach(p => {
  try {
    stmt.run(
      p.provider,
      p.name,
      p.description,
      JSON.stringify(p.baseConfig),
      p.enabled ? 1 : 0,
      now,
      now
    );
    
    const status = p.enabled ? '✅' : '⚪';
    console.log(`${status} ${p.name} (${p.provider})`);
    console.log(`   Base URL: ${p.baseConfig.baseURL}`);
    console.log(`   模型数: 0 (待手动添加)`);
    console.log('');
    
    count++;
  } catch (error) {
    console.error(`❌ 添加 ${p.name} 失败:`, error.message);
  }
});

console.log('='.repeat(70));
console.log(`✅ 成功添加 ${count} 个提供商，0 个模型`);
console.log('='.repeat(70));
console.log('');
console.log('📋 下一步操作:');
console.log('  1. 手动添加模型:');
console.log('     curl -X POST http://localhost:8088/api/llm/providers/1/models \\');
console.log('       -d \'{"modelKey": "...", "modelType": "nlp", ...}\'');
console.log('');
console.log('  2. 查看提供商:');
console.log('     curl http://localhost:8088/api/llm/providers');
console.log('');
console.log('  3. 参考文档:');
console.log('     docs/LLM_CONFIG_MANUAL_SETUP.md');
console.log('');

db.close();

