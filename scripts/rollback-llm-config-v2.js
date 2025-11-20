#!/usr/bin/env node
/**
 * LLM 配置数据库回滚脚本 - v2 回滚到 v1
 * 
 * 使用方法:
 *   node scripts/rollback-llm-config-v2.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'llm_providers.db');

console.log('');
console.log('='.repeat(70));
console.log('  LLM 配置数据库回滚 v2 → v1');
console.log('='.repeat(70));
console.log('');

if (!fs.existsSync(dbPath)) {
  console.error('❌ 错误: 数据库文件不存在:', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

// 检查是否存在备份表
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
const hasBackup = tables.some(t => t.name === 'llm_providers_v1_backup');

if (!hasBackup) {
  console.error('❌ 错误: 未找到 v1 备份表 (llm_providers_v1_backup)');
  console.log('');
  console.log('💡 可能原因:');
  console.log('   1. 数据库已经是 v1 结构');
  console.log('   2. 从未执行过迁移');
  console.log('   3. 备份表已被删除');
  console.log('');
  db.close();
  process.exit(1);
}

console.log('⚠️  警告: 此操作将删除 v2 数据并恢复到 v1');
console.log('');
console.log('请确认要继续? (Ctrl+C 取消, Enter 继续)');

// 简单的确认机制
process.stdin.once('data', () => {
  console.log('');
  console.log('🔄 开始回滚...');
  console.log('');

  try {
    // 删除 v2 表
    console.log('1️⃣  删除 v2 表...');
    db.prepare('DROP TABLE IF EXISTS llm_models').run();
    db.prepare('DROP TABLE IF EXISTS llm_providers').run();
    console.log('✅ v2 表已删除');
    console.log('');

    // 恢复 v1 表
    console.log('2️⃣  恢复 v1 表...');
    db.prepare('ALTER TABLE llm_providers_v1_backup RENAME TO llm_providers').run();
    console.log('✅ v1 表已恢复');
    console.log('');

    // 验证
    const providers = db.prepare('SELECT * FROM llm_providers').all();
    console.log(`✅ 验证: ${providers.length} 条提供商记录`);
    console.log('');

    console.log('='.repeat(70));
    console.log('✅ 回滚完成！');
    console.log('='.repeat(70));
    console.log('');
    console.log('📋 下一步:');
    console.log('   1. 重启服务: npm run dev');
    console.log('   2. 验证功能: curl http://localhost:8088/api/llm/providers');
    console.log('');

  } catch (error) {
    console.error('❌ 回滚失败:', error.message);
    console.log('');
    console.log('💡 手动恢复方法:');
    console.log('   1. 停止服务');
    console.log(`   2. 恢复备份: cp ${backupPath} ${dbPath}`);
    console.log('   3. 重启服务');
    console.log('');
  }

  db.close();
  process.exit(0);
});

