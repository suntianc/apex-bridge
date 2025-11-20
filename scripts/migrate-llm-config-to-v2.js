#!/usr/bin/env node
/**
 * LLM 配置数据库迁移脚本 - v1 到 v2
 * 
 * 功能:
 * 1. 备份 v1 数据
 * 2. 创建 v2 表结构
 * 3. 迁移提供商和模型数据
 * 4. 验证数据完整性
 * 
 * 使用方法:
 *   node scripts/migrate-llm-config-to-v2.js
 *   node scripts/migrate-llm-config-to-v2.js --dry-run  # 预览，不实际执行
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DRY_RUN = process.argv.includes('--dry-run');
const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'llm_providers.db');
const backupPath = path.join(dataDir, `llm_providers_v1_backup_${Date.now()}.db`);

console.log('');
console.log('='.repeat(70));
console.log('  LLM 配置数据库迁移 v1 → v2');
console.log('='.repeat(70));
console.log('');

if (DRY_RUN) {
  console.log('🔍 DRY RUN 模式 - 仅预览，不实际执行');
  console.log('');
}

// 检查数据库是否存在
if (!fs.existsSync(dbPath)) {
  console.error('❌ 错误: 数据库文件不存在:', dbPath);
  console.log('');
  console.log('💡 请先运行: node scripts/init-llm-providers.js');
  console.log('');
  process.exit(1);
}

// 备份数据库
if (!DRY_RUN) {
  console.log('📦 步骤 1: 备份数据库');
  console.log('----------------------------------------------------------------------');
  fs.copyFileSync(dbPath, backupPath);
  console.log(`✅ 备份已创建: ${backupPath}`);
  console.log('');
}

const db = new Database(dbPath);

// 检查是否已经是 v2 结构
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
const hasModelsTable = tables.some(t => t.name === 'llm_models');

if (hasModelsTable) {
  console.log('ℹ️  数据库已经是 v2 结构，无需迁移');
  console.log('');
  db.close();
  process.exit(0);
}

console.log('📋 步骤 2: 分析 v1 数据');
console.log('----------------------------------------------------------------------');

// 读取 v1 数据
let v1Providers = [];
try {
  v1Providers = db.prepare('SELECT * FROM llm_providers').all();
  console.log(`✅ 找到 ${v1Providers.length} 个 v1 提供商记录`);
  console.log('');
} catch (error) {
  console.error('❌ 读取 v1 数据失败:', error.message);
  db.close();
  process.exit(1);
}

// 分析数据
console.log('📊 v1 数据预览:');
v1Providers.forEach((p, i) => {
  console.log(`  ${i + 1}. ${p.name} (${p.provider}) - ${p.enabled ? '已启用' : '未启用'}`);
});
console.log('');

if (DRY_RUN) {
  console.log('🔍 DRY RUN - 迁移预览:');
  console.log('----------------------------------------------------------------------');
  
  v1Providers.forEach((p, i) => {
    const config = JSON.parse(p.config_json);
    console.log(`\n提供商 ${i + 1}: ${p.name}`);
    console.log(`  → 保留提供商记录`);
    console.log(`  → 创建模型记录: ${config.defaultModel || p.provider + '-model'}`);
    console.log(`     类型: nlp`);
    console.log(`     端点: /chat/completions`);
  });
  
  console.log('');
  console.log('='.repeat(70));
  console.log('✅ 预览完成 - 要实际执行，请移除 --dry-run 参数');
  console.log('='.repeat(70));
  console.log('');
  db.close();
  process.exit(0);
}

console.log('🔧 步骤 3: 创建 v2 表结构');
console.log('----------------------------------------------------------------------');

// 重命名旧表
db.prepare('ALTER TABLE llm_providers RENAME TO llm_providers_v1_backup').run();
console.log('✅ 旧表已重命名为 llm_providers_v1_backup');

// 删除可能存在的旧索引
try {
  const oldIndexes = ['idx_provider', 'idx_provider_enabled', 'idx_model_provider', 
                      'idx_model_type', 'idx_model_enabled', 'idx_model_default', 
                      'idx_model_key', 'idx_model_type_default'];
  oldIndexes.forEach(idx => {
    try { db.prepare(`DROP INDEX IF EXISTS ${idx}`).run(); } catch(e) {}
  });
} catch (e) {
  // 忽略错误
}

// 创建新表
db.exec(`
  -- 提供商表
  CREATE TABLE llm_providers (
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

  -- 模型表
  CREATE TABLE llm_models (
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

  -- 提供商索引
  CREATE INDEX idx_provider ON llm_providers(provider);
  CREATE INDEX idx_provider_enabled ON llm_providers(enabled);

  -- 模型索引
  CREATE INDEX idx_model_provider ON llm_models(provider_id);
  CREATE INDEX idx_model_type ON llm_models(model_type);
  CREATE INDEX idx_model_enabled ON llm_models(enabled);
  CREATE INDEX idx_model_default ON llm_models(is_default);
  CREATE INDEX idx_model_key ON llm_models(model_key);
  CREATE INDEX idx_model_type_default ON llm_models(model_type, is_default);
`);

console.log('✅ v2 表结构已创建');
console.log('');

console.log('🔄 步骤 4: 迁移数据');
console.log('----------------------------------------------------------------------');

// 默认端点映射
const DEFAULT_ENDPOINTS = {
  nlp: '/chat/completions'
};

let migratedProviders = 0;
let migratedModels = 0;

v1Providers.forEach((oldProvider, index) => {
  try {
    const oldConfig = JSON.parse(oldProvider.config_json);
    
    // 提取基础配置
    const baseConfig = {
      apiKey: oldConfig.apiKey,
      baseURL: oldConfig.baseURL,
      timeout: oldConfig.timeout || 60000,
      maxRetries: oldConfig.maxRetries || 3
    };
    
    // 插入提供商
    const providerResult = db.prepare(`
      INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      oldProvider.provider,
      oldProvider.name,
      `从 v1 迁移: ${oldProvider.name}`,
      JSON.stringify(baseConfig),
      oldProvider.enabled,
      oldProvider.created_at,
      oldProvider.updated_at
    );
    
    const providerId = providerResult.lastInsertRowid;
    migratedProviders++;
    
    console.log(`✅ [${index + 1}/${v1Providers.length}] 提供商: ${oldProvider.name} (ID: ${providerId})`);
    
    // 创建默认 NLP 模型
    const modelKey = oldConfig.defaultModel || `${oldProvider.provider}-default`;
    const modelName = oldConfig.defaultModel || `${oldProvider.name} Default`;
    
    const modelConfig = {
      contextWindow: oldConfig.contextWindow,
      maxTokens: oldConfig.maxTokens,
      temperature: oldConfig.temperature
    };
    
    db.prepare(`
      INSERT INTO llm_models (
        provider_id, model_key, model_name, model_type,
        model_config, api_endpoint_suffix, enabled, is_default,
        display_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      providerId,
      modelKey,
      modelName,
      'nlp',
      JSON.stringify(modelConfig),
      DEFAULT_ENDPOINTS.nlp,
      1,
      1,  // 设为默认模型
      0,
      Date.now(),
      Date.now()
    );
    
    migratedModels++;
    console.log(`   → 创建模型: ${modelName} (nlp)`);
    
  } catch (error) {
    console.error(`❌ 迁移失败: ${oldProvider.name}`, error.message);
  }
});

console.log('');
console.log('='.repeat(70));
console.log(`✅ 迁移完成`);
console.log(`   提供商: ${migratedProviders}/${v1Providers.length}`);
console.log(`   模型: ${migratedModels}`);
console.log('='.repeat(70));
console.log('');

// 验证数据
console.log('🔍 步骤 5: 验证迁移结果');
console.log('----------------------------------------------------------------------');

const newProviders = db.prepare('SELECT * FROM llm_providers').all();
const newModels = db.prepare('SELECT * FROM llm_models').all();

console.log(`提供商表: ${newProviders.length} 条记录`);
console.log(`模型表: ${newModels.length} 条记录`);
console.log('');

// 显示迁移后的数据
console.log('📊 迁移后的数据结构:');
console.log('');

newProviders.forEach(p => {
  const models = db.prepare('SELECT * FROM llm_models WHERE provider_id = ?').all(p.id);
  const status = p.enabled === 1 ? '✅' : '⚪';
  
  console.log(`${status} [${p.id}] ${p.name} (${p.provider})`);
  models.forEach(m => {
    const modelStatus = m.enabled === 1 ? '✅' : '⚪';
    const defaultMark = m.is_default === 1 ? ' 🌟' : '';
    console.log(`    ${modelStatus} ${m.model_name} [${m.model_type}]${defaultMark}`);
  });
});

console.log('');
console.log('='.repeat(70));
console.log('📋 后续操作:');
console.log('='.repeat(70));
console.log('');
console.log('1. 验证应用功能:');
console.log('   npm run dev');
console.log('   curl http://localhost:8088/api/llm/providers');
console.log('');
console.log('2. 如需回滚:');
console.log('   node scripts/rollback-llm-config-v2.js');
console.log('');
console.log('3. 查看新结构:');
console.log('   node scripts/view-llm-providers.js');
console.log('');
console.log('4. 备份文件位置:');
console.log(`   ${backupPath}`);
console.log('');

db.close();

console.log('✅ 迁移脚本执行完成！');
console.log('');

