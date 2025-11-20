#!/usr/bin/env node
/**
 * 检查数据库结构
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'llm_providers.db');
const db = new Database(dbPath, { readonly: true });

console.log('');
console.log('='.repeat(70));
console.log('  数据库结构检查');
console.log('='.repeat(70));
console.log('');

// 查看所有表
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();

console.log('📊 表列表:');
tables.forEach(t => {
  console.log(`  - ${t.name}`);
});
console.log('');

// 查看 llm_providers 表结构
if (tables.some(t => t.name === 'llm_providers')) {
  console.log('📋 llm_providers 表结构:');
  const pragma = db.prepare('PRAGMA table_info(llm_providers)').all();
  pragma.forEach(col => {
    console.log(`  - ${col.name} (${col.type})`);
  });
  console.log('');
  
  const hasConfigJson = pragma.some(col => col.name === 'config_json');
  const hasBaseConfig = pragma.some(col => col.name === 'base_config');
  
  if (hasConfigJson) {
    console.log('❌ 数据库是 v1 结构 (有 config_json 列)');
  } else if (hasBaseConfig) {
    console.log('✅ 数据库是 v2 结构 (有 base_config 列)');
  }
}

// 查看 llm_models 表结构
if (tables.some(t => t.name === 'llm_models')) {
  console.log('📋 llm_models 表结构:');
  const pragma = db.prepare('PRAGMA table_info(llm_models)').all();
  pragma.forEach(col => {
    console.log(`  - ${col.name} (${col.type})`);
  });
  console.log('');
  console.log('✅ 存在 llm_models 表 (v2 结构)');
} else {
  console.log('❌ 不存在 llm_models 表 (v1 结构)');
}

console.log('');
db.close();

