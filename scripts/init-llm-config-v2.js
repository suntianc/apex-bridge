#!/usr/bin/env node
/**
 * 初始化 LLM 配置 v2 架构
 * 
 * 使用方法:
 *   node scripts/init-llm-config-v2.js
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
console.log('  ApexBridge LLM 配置初始化 v2.0');
console.log('='.repeat(70));
console.log('');
console.log('📦 数据库路径:', dbPath);
console.log('');

// 初始化表结构（如果不存在）
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
    CHECK(model_type IN ('nlp', 'embedding', 'rerank', 'image', 'multimodal', 'audio', 'other'))
  );
  
  CREATE INDEX IF NOT EXISTS idx_provider ON llm_providers(provider);
  CREATE INDEX IF NOT EXISTS idx_provider_enabled ON llm_providers(enabled);
  CREATE INDEX IF NOT EXISTS idx_model_provider ON llm_models(provider_id);
  CREATE INDEX IF NOT EXISTS idx_model_type ON llm_models(model_type);
  CREATE INDEX IF NOT EXISTS idx_model_enabled ON llm_models(enabled);
  CREATE INDEX IF NOT EXISTS idx_model_default ON llm_models(is_default);
  CREATE INDEX IF NOT EXISTS idx_model_key ON llm_models(model_key);
  CREATE INDEX IF NOT EXISTS idx_model_type_default ON llm_models(model_type, is_default);
`);

console.log('✅ 数据库表结构已确认\n');

// 提供商配置
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
    enabled: true,
    models: [
      {
        modelKey: 'deepseek-chat',
        modelName: 'DeepSeek Chat',
        modelType: 'nlp',
        modelConfig: { contextWindow: 32000, maxTokens: 4096 },
        apiEndpointSuffix: '/chat/completions',
        enabled: true,
        isDefault: true
      },
      {
        modelKey: 'deepseek-coder',
        modelName: 'DeepSeek Coder',
        modelType: 'nlp',
        modelConfig: { contextWindow: 16000, maxTokens: 4096 },
        apiEndpointSuffix: '/chat/completions',
        enabled: true,
        isDefault: false
      }
    ]
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
    enabled: false,
    models: [
      {
        modelKey: 'gpt-4',
        modelName: 'GPT-4',
        modelType: 'nlp',
        modelConfig: { contextWindow: 128000, maxTokens: 4096 },
        apiEndpointSuffix: '/chat/completions',
        enabled: true,
        isDefault: true
      },
      {
        modelKey: 'gpt-3.5-turbo',
        modelName: 'GPT-3.5 Turbo',
        modelType: 'nlp',
        modelConfig: { contextWindow: 16384, maxTokens: 4096 },
        apiEndpointSuffix: '/chat/completions',
        enabled: true,
        isDefault: false
      },
      {
        modelKey: 'text-embedding-ada-002',
        modelName: 'Ada Embeddings v2',
        modelType: 'embedding',
        modelConfig: { dimensions: 1536 },
        apiEndpointSuffix: '/embeddings',
        enabled: true,
        isDefault: true
      },
      {
        modelKey: 'gpt-4o',
        modelName: 'GPT-4o (多模态)',
        modelType: 'multimodal',
        modelConfig: { contextWindow: 128000, maxTokens: 4096 },
        apiEndpointSuffix: '/chat/completions',
        enabled: false,
        isDefault: false
      }
    ]
  },
  {
    provider: 'qwen',
    name: 'Qwen (通义千问)',
    description: '阿里云通义千问 VL 模型',
    baseConfig: {
      apiKey: process.env.QWEN_API_KEY || 'sk-your-qwen-api-key',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      timeout: 60000,
      maxRetries: 3
    },
    enabled: false,
    models: [
      {
        modelKey: 'qwen2-vl-72b-instruct',
        modelName: 'Qwen2-VL 72B',
        modelType: 'multimodal',
        modelConfig: { contextWindow: 128000, maxTokens: 4096 },
        apiEndpointSuffix: '/chat/completions',
        enabled: false,
        isDefault: true
      },
      {
        modelKey: 'qwen-turbo',
        modelName: 'Qwen Turbo',
        modelType: 'nlp',
        modelConfig: { contextWindow: 8000, maxTokens: 2000 },
        apiEndpointSuffix: '/chat/completions',
        enabled: false,
        isDefault: false
      }
    ]
  }
];

console.log('📝 添加提供商和模型配置...\n');

const now = Date.now();
let providerCount = 0;
let modelCount = 0;

const providerStmt = db.prepare(`
  INSERT OR REPLACE INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const modelStmt = db.prepare(`
  INSERT OR REPLACE INTO llm_models (
    provider_id, model_key, model_name, model_type, model_config,
    api_endpoint_suffix, enabled, is_default, display_order, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

providers.forEach(p => {
  try {
    // 插入提供商
    const result = providerStmt.run(
      p.provider,
      p.name,
      p.description,
      JSON.stringify(p.baseConfig),
      p.enabled ? 1 : 0,
      now,
      now
    );
    
    const providerId = result.lastInsertRowid || db.prepare('SELECT id FROM llm_providers WHERE provider = ?').get(p.provider).id;
    providerCount++;
    
    const status = p.enabled ? '✅' : '⚪';
    console.log(`${status} ${p.name} (${p.provider})`);
    
    // 插入模型
    p.models.forEach((m, idx) => {
      modelStmt.run(
        providerId,
        m.modelKey,
        m.modelName,
        m.modelType,
        JSON.stringify(m.modelConfig),
        m.apiEndpointSuffix,
        m.enabled ? 1 : 0,
        m.isDefault ? 1 : 0,
        idx,
        now,
        now
      );
      
      const modelStatus = m.enabled ? '✅' : '⚪';
      const defaultMark = m.isDefault ? ' 🌟' : '';
      console.log(`    ${modelStatus} ${m.modelName} [${m.modelType}]${defaultMark}`);
      modelCount++;
    });
    
    console.log('');
  } catch (error) {
    console.error(`❌ 添加 ${p.name} 失败:`, error.message);
  }
});

console.log('='.repeat(70));
console.log(`✅ 成功添加 ${providerCount} 个提供商, ${modelCount} 个模型`);
console.log('='.repeat(70));
console.log('');

// 显示统计
const stats = db.prepare(`
  SELECT 
    p.name as provider_name,
    COUNT(m.id) as model_count,
    SUM(CASE WHEN m.enabled = 1 THEN 1 ELSE 0 END) as enabled_models
  FROM llm_providers p
  LEFT JOIN llm_models m ON p.id = m.provider_id
  GROUP BY p.id, p.name
`).all();

console.log('📊 配置统计:');
stats.forEach(s => {
  console.log(`  ${s.provider_name}: ${s.model_count} 个模型 (${s.enabled_models} 个已启用)`);
});
console.log('');

db.close();

console.log('📋 下一步操作:');
console.log('  1. 查看配置: node scripts/view-llm-config-v2.js');
console.log('  2. 启动服务: npm run dev');
console.log('  3. 测试 API: curl http://localhost:8088/api/llm/providers');
console.log('');

