#!/usr/bin/env ts-node

import { SkillValidationTool } from '../src/tools/SkillValidationTool';
import * as path from 'path';
import logger from '../src/utils/logger';

/**
 * Skills验证CLI工具
 * 
 * 用法:
 *   npm run validate:skills [--strict] [--skills-dir=path]
 */

async function main() {
  const args = process.argv.slice(2);
  
  const options = {
    skillsRoot: getArgValue(args, '--skills-dir') || path.join(__dirname, '../skills'),
    strict: args.includes('--strict')
  };

  logger.info('🔍 开始验证Skills');
  logger.info(`Skills目录: ${options.skillsRoot}`);
  logger.info(`严格模式: ${options.strict ? '是' : '否'}`);

  const validator = new SkillValidationTool({
    skillsRoot: options.skillsRoot,
    validateMetadata: true,
    validateContent: true,
    validateResources: true,
    validateCode: true,
    strict: options.strict
  });

  try {
    const results = await validator.validateAll();

    // 统计结果
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);

    logger.info('\n📊 验证统计:');
    logger.info(`  通过: ${passed}`);
    logger.info(`  失败: ${failed}`);
    logger.info(`  总错误: ${totalErrors}`);
    logger.info(`  总警告: ${totalWarnings}`);

    if (failed > 0) {
      logger.warn('\n❌ 验证失败的技能:');
      for (const result of results) {
        if (!result.passed) {
          logger.warn(`  - ${result.skillName}:`);
          result.errors.forEach(error => {
            logger.warn(`    ❌ ${error}`);
          });
        }
      }
    }

    if (totalWarnings > 0) {
      logger.warn('\n⚠️  警告:');
      for (const result of results) {
        if (result.warnings.length > 0) {
          logger.warn(`  - ${result.skillName}:`);
          result.warnings.forEach(warning => {
            logger.warn(`    ⚠️  ${warning}`);
          });
        }
      }
    }

    if (passed > 0) {
      logger.info('\n✅ 验证通过的技能:');
      for (const result of results) {
        if (result.passed) {
          logger.info(`  - ${result.skillName}`);
        }
      }
    }

    // 详细报告
    logger.info('\n📋 详细报告:');
    for (const result of results) {
      logger.info(`\n${result.skillName}:`);
      logger.info(`  元数据: ${result.metadataValid ? '✅' : '❌'}`);
      logger.info(`  内容: ${result.contentValid ? '✅' : '❌'}`);
      logger.info(`  资源: ${result.resourcesValid ? '✅' : '❌'}`);
      logger.info(`  代码: ${result.codeValid ? '✅' : '❌'}`);
    }

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    logger.error('验证过程出错:', error);
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

