#!/usr/bin/env node
/**
 * 清空 LLM 配置
 * 
 * 使用方法:
 *   node scripts/clear-llm-config.js              # 清空所有
 *   node scripts/clear-llm-config.js --models-only # 仅清空模型
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'llm_providers.db');
const db = new Database(dbPath);

const modelsOnly = process.argv.includes('--models-only');

console.log('');
console.log('='.repeat(70));
console.log('  清空 LLM 配置');
console.log('='.repeat(70));
console.log('');

if (modelsOnly) {
  console.log('⚠️  模式: 仅清空模型，保留提供商');
} else {
  console.log('⚠️  模式: 清空所有（提供商 + 模型）');
}
console.log('');

// 统计当前数据
const providerCount = db.prepare('SELECT COUNT(*) as count FROM llm_providers').get().count;
const modelCount = db.prepare('SELECT COUNT(*) as count FROM llm_models').get().count;

console.log('📊 当前数据:');
console.log(`  提供商: ${providerCount} 个`);
console.log(`  模型: ${modelCount} 个`);
console.log('');

if (providerCount === 0 && modelCount === 0) {
  console.log('ℹ️  数据库已经是空的');
  console.log('');
  db.close();
  process.exit(0);
}

console.log('⚠️  确认要清空吗? (此操作不可恢复)');
console.log('   输入 yes 确认，其他任何键取消:');
console.log('');

process.stdin.once('data', (data) => {
  const input = data.toString().trim().toLowerCase();
  
  if (input !== 'yes') {
    console.log('❌ 操作已取消');
    console.log('');
    db.close();
    process.exit(0);
  }

  console.log('');
  console.log('🗑️  开始清空...');
  console.log('');

  try {
    if (modelsOnly) {
      // 仅删除模型
      db.prepare('DELETE FROM llm_models').run();
      console.log('✅ 已清空所有模型');
    } else {
      // 删除所有（提供商会级联删除模型）
      db.prepare('DELETE FROM llm_models').run();
      db.prepare('DELETE FROM llm_providers').run();
      console.log('✅ 已清空所有提供商');
      console.log('✅ 已清空所有模型（级联删除）');
    }

    // 重置自增ID
    db.prepare('DELETE FROM sqlite_sequence WHERE name IN (?, ?)').run('llm_providers', 'llm_models');
    console.log('✅ 已重置自增 ID');
    
    console.log('');
    console.log('='.repeat(70));
    console.log('✅ 清空完成！');
    console.log('='.repeat(70));
    console.log('');
    console.log('📋 下一步操作:');
    console.log('  1. 手动添加提供商和模型');
    console.log('  2. 或运行初始化脚本: node scripts/init-llm-config-v2.js');
    console.log('');
  } catch (error) {
    console.error('❌ 清空失败:', error.message);
    console.log('');
  }

  db.close();
  process.exit(0);
});

// 等待用户输入
process.stdin.resume();

