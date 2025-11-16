#!/usr/bin/env ts-node

import { PluginMigrationTool } from '../src/tools/PluginMigrationTool';
import * as path from 'path';
import logger from '../src/utils/logger';

/**
 * 插件迁移CLI工具
 * 
 * 用法:
 *   npm run migrate:plugins [--dry-run] [--overwrite] [--source=path] [--target=path]
 */

async function main() {
  const args = process.argv.slice(2);
  
  const options = {
    dryRun: args.includes('--dry-run'),
    overwrite: args.includes('--overwrite'),
    sourceDir: getArgValue(args, '--source') || path.join(__dirname, '../plugins'),
    targetDir: getArgValue(args, '--target') || path.join(__dirname, '../skills')
  };

  logger.info('🚀 开始插件迁移');
  logger.info(`源目录: ${options.sourceDir}`);
  logger.info(`目标目录: ${options.targetDir}`);
  logger.info(`干运行: ${options.dryRun ? '是' : '否'}`);
  logger.info(`覆盖已存在: ${options.overwrite ? '是' : '否'}`);

  const tool = new PluginMigrationTool({
    ...options,
    generateMetadata: true,
    generateSkillDoc: true,
    preserveResources: true,
    preserveOriginal: true
  });

  try {
    const results = await tool.migrateAll();

    // 统计结果
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalFiles = results.reduce((sum, r) => sum + r.migratedFiles.length, 0);

    logger.info('\n📊 迁移统计:');
    logger.info(`  成功: ${successful}`);
    logger.info(`  失败: ${failed}`);
    logger.info(`  迁移文件总数: ${totalFiles}`);

    if (failed > 0) {
      logger.warn('\n❌ 失败的插件:');
      for (const result of results) {
        if (!result.success) {
          logger.warn(`  - ${result.pluginName}: ${result.errors.join(', ')}`);
        }
      }
    }

    if (successful > 0) {
      logger.info('\n✅ 成功迁移的插件:');
      for (const result of results) {
        if (result.success) {
          logger.info(`  - ${result.pluginName} -> ${result.targetPath}`);
          if (result.warnings.length > 0) {
            logger.warn(`    警告: ${result.warnings.join(', ')}`);
          }
        }
      }
    }

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    logger.error('迁移过程出错:', error);
    process.exit(1);
  }
}

function getArgValue(args: string[], flag: string): string | undefined {
  const index = args.findIndex(arg => arg.startsWith(flag + '='));
  if (index >= 0) {
    return args[index].split('=')[1];
  }
  return undefined;
}

if (require.main === module) {
  main().catch(error => {
    logger.error('未处理的错误:', error);
    process.exit(1);
  });
}

