#!/usr/bin/env node
/**
 * 查看 LLM 提供商配置
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'llm_providers.db');

try {
  const db = new Database(dbPath, { readonly: true });
  
  const providers = db.prepare('SELECT * FROM llm_providers ORDER BY id').all();
  
  console.log('');
  console.log('='.repeat(70));
  console.log('  LLM 提供商配置列表');
  console.log('='.repeat(70));
  console.log('');
  
  if (providers.length === 0) {
    console.log('⚠️  数据库为空，请先运行: node scripts/init-llm-providers.js');
    console.log('');
  } else {
    providers.forEach(p => {
      const config = JSON.parse(p.config_json);
      const status = p.enabled === 1 ? '✅ 已启用' : '⚪ 未启用';
      
      console.log(`${status} [ID: ${p.id}] ${p.name} (${p.provider})`);
      console.log(`       Base URL: ${config.baseURL}`);
      console.log(`       Model: ${config.defaultModel}`);
      console.log(`       API Key: ${config.apiKey ? maskApiKey(config.apiKey) : 'N/A'}`);
      console.log(`       创建时间: ${new Date(p.created_at).toLocaleString()}`);
      console.log('');
    });
    
    console.log('='.repeat(70));
    console.log(`  总计: ${providers.length} 个提供商`);
    console.log('='.repeat(70));
    console.log('');
  }
  
  db.close();
} catch (error) {
  console.error('❌ 错误:', error.message);
  console.log('');
  console.log('💡 提示: 请先运行初始化脚本:');
  console.log('   node scripts/init-llm-providers.js');
  console.log('');
}

function maskApiKey(key) {
  if (!key || key.length < 8) return '***';
  return key.substring(0, 7) + '...' + key.substring(key.length - 4);
}

