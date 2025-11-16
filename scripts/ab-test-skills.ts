#!/usr/bin/env ts-node

import { ABTestingTool } from '../src/tools/ABTestingTool';
import * as path from 'path';
import logger from '../src/utils/logger';

/**
 * A/B测试CLI工具
 * 
 * 用法:
 *   npm run ab-test:skills [--iterations=10] [--skills=skill1,skill2]
 */

async function main() {
  const args = process.argv.slice(2);
  
  const iterations = parseInt(getArgValue(args, '--iterations') || '10', 10);
  const testSkills = getArgValue(args, '--skills')?.split(',').filter(Boolean) || [];

  const options = {
    pluginsRoot: path.join(__dirname, '../plugins'),
    skillsRoot: path.join(__dirname, '../skills'),
    iterations,
    warmupIterations: 2,
    testSkills
  };

  logger.info('🔬 开始A/B性能测试');
  logger.info(`插件目录: ${options.pluginsRoot}`);
  logger.info(`Skills目录: ${options.skillsRoot}`);
  logger.info(`测试迭代次数: ${iterations}`);
  logger.info(`测试技能: ${testSkills.length > 0 ? testSkills.join(', ') : '全部'}`);

  const tester = new ABTestingTool(options);

  try {
    const results = await tester.runBatchABTest();

    // 统计结果
    logger.info('\n📊 A/B测试结果:');
    logger.info(`测试技能数: ${results.length}`);

    let totalExecImprovement = 0;
    let totalLoadImprovement = 0;
    let totalMemoryImprovement = 0;
    let improvementCount = 0;

    for (const result of results) {
      logger.info(`\n${result.skillName}:`);
      logger.info(`  传统插件:`);
      logger.info(`    执行时间: ${result.pluginMetrics.executionTime.toFixed(2)}ms`);
      logger.info(`    加载时间: ${result.pluginMetrics.loadTime.toFixed(2)}ms`);
      logger.info(`    内存使用: ${result.pluginMetrics.memoryUsage.toFixed(2)}MB`);
      logger.info(`  Skills格式:`);
      logger.info(`    执行时间: ${result.skillMetrics.executionTime.toFixed(2)}ms`);
      logger.info(`    加载时间: ${result.skillMetrics.loadTime.toFixed(2)}ms`);
      logger.info(`    内存使用: ${result.skillMetrics.memoryUsage.toFixed(2)}MB`);
      if (result.skillMetrics.cacheHitRate !== undefined) {
        logger.info(`    缓存命中率: ${(result.skillMetrics.cacheHitRate * 100).toFixed(2)}%`);
      }
      logger.info(`  改善:`);
      logger.info(`    执行时间: ${result.improvement.executionTime > 0 ? '+' : ''}${result.improvement.executionTime.toFixed(1)}%`);
      logger.info(`    加载时间: ${result.improvement.loadTime > 0 ? '+' : ''}${result.improvement.loadTime.toFixed(1)}%`);
      logger.info(`    内存使用: ${result.improvement.memoryUsage > 0 ? '+' : ''}${result.improvement.memoryUsage.toFixed(1)}%`);
      logger.info(`  摘要: ${result.summary}`);

      if (result.improvement.executionTime > 0 || result.improvement.loadTime > 0 || result.improvement.memoryUsage > 0) {
        totalExecImprovement += result.improvement.executionTime;
        totalLoadImprovement += result.improvement.loadTime;
        totalMemoryImprovement += result.improvement.memoryUsage;
        improvementCount++;
      }
    }

    // 总体统计
    if (improvementCount > 0) {
      logger.info('\n📈 总体改善:');
      logger.info(`  平均执行时间改善: ${(totalExecImprovement / improvementCount).toFixed(1)}%`);
      logger.info(`  平均加载时间改善: ${(totalLoadImprovement / improvementCount).toFixed(1)}%`);
      logger.info(`  平均内存使用改善: ${(totalMemoryImprovement / improvementCount).toFixed(1)}%`);
    }

    // 生成报告
    logger.info('\n✅ A/B测试完成');
  } catch (error) {
    logger.error('A/B测试过程出错:', error);
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

