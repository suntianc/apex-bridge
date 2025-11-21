/**
 * 数据库迁移脚本：为 llm_models 表添加 is_ace_evolution 字段
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import { PathService } from '../src/services/PathService';

async function main() {
    console.log('🔄 Database Migration: Adding is_ace_evolution field\n');

    const pathService = PathService.getInstance();
    const dataDir = pathService.getDataDir();
    const dbPath = path.join(dataDir, 'llm_providers.db');

    console.log(`📁 Database path: ${dbPath}`);

    const db = new Database(dbPath);

    try {
        // 检查字段是否已存在
        const tableInfo = db.pragma('table_info(llm_models)') as Array<{ name: string }>;
        const hasColumn = tableInfo.some((col) => col.name === 'is_ace_evolution');

        if (hasColumn) {
            console.log('✅ Column is_ace_evolution already exists. No migration needed.\n');
            db.close();
            return;
        }

        console.log('🔧 Adding is_ace_evolution column...');

        // 添加新字段
        db.exec(`
      ALTER TABLE llm_models
      ADD COLUMN is_ace_evolution INTEGER DEFAULT 0;
    `);

        console.log('✅ Column added successfully!');

        // 验证
        const updatedTableInfo = db.pragma('table_info(llm_models)') as Array<{ name: string }>;
        const columnAdded = updatedTableInfo.some((col) => col.name === 'is_ace_evolution');

        if (columnAdded) {
            console.log('✅ Migration completed successfully!\n');
        } else {
            throw new Error('Column verification failed');
        }

        db.close();

        console.log('💡 Next step: Run the configuration script to mark a model as ACE evolution model.');
        console.log('   Command: npx ts-node scripts/configure-ace-model.ts\n');

    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        db.close();
        process.exit(1);
    }
}

main().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
});
