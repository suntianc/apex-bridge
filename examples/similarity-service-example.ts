/**
 * SimilarityService 使用示例
 *
 * 演示如何使用 SimilarityService 进行标签相似度计算和管理
 */

import { SimilarityService } from '../src/services/SimilarityService';
import { TypeVocabularyService } from '../src/services/TypeVocabularyService';

async function example() {
  console.log('=== SimilarityService 使用示例 ===\n');

  try {
    // 获取服务实例
    const similarityService = SimilarityService.getInstance();
    const vocabularyService = TypeVocabularyService.getInstance();

    // 示例 1: 创建测试标签
    console.log('1. 创建测试标签...');
    const testTags = [
      {
        tag_name: 'rapid_iteration',
        keywords: ['快速', '迭代', '敏捷', '实验', '验证'],
        confidence: 0.95,
        first_identified: Date.now(),
        playbook_count: 23,
        discovered_from: 'historical_clustering' as const
      },
      {
        tag_name: 'agile_execution',
        keywords: ['敏捷', '执行', '迭代', '快速响应', '灵活'],
        confidence: 0.88,
        first_identified: Date.now(),
        playbook_count: 18,
        discovered_from: 'historical_clustering' as const
      },
      {
        tag_name: 'data_driven',
        keywords: ['数据驱动', '分析', '决策', '指标', '监控'],
        confidence: 0.92,
        first_identified: Date.now(),
        playbook_count: 31,
        discovered_from: 'historical_clustering' as const
      }
    ];

    for (const tagData of testTags) {
      try {
        await vocabularyService.createTag(tagData);
        console.log(`  ✅ 创建标签: ${tagData.tag_name}`);
      } catch (error: any) {
        if (error.message.includes('already exists')) {
          console.log(`  ⚠️  标签已存在: ${tagData.tag_name}`);
        } else {
          throw error;
        }
      }
    }

    // 示例 2: 计算两个标签的相似度
    console.log('\n2. 计算标签相似度...');
    const similarity1 = await similarityService.calculateSimilarity('rapid_iteration', 'agile_execution');
    console.log(`  rapid_iteration vs agile_execution: ${similarity1.toFixed(4)}`);

    const similarity2 = await similarityService.calculateSimilarity('rapid_iteration', 'data_driven');
    console.log(`  rapid_iteration vs data_driven: ${similarity2.toFixed(4)}`);

    // 示例 3: 增加共现次数
    console.log('\n3. 增加共现次数...');
    await similarityService.incrementCoOccurrence('rapid_iteration', 'agile_execution');
    console.log(`  ✅ 增加 rapid_iteration 和 agile_execution 的共现次数`);

    // 示例 4: 获取相似标签
    console.log('\n4. 获取相似标签...');
    const similarTags = await similarityService.getSimilarTags('rapid_iteration', 0.5);
    console.log(`  找到 ${similarTags.length} 个相似标签:`);
    for (const sim of similarTags) {
      console.log(`    - ${sim.tag2}: ${sim.similarity_score.toFixed(4)} (共现: ${sim.co_occurrence_count})`);
    }

    // 示例 5: 更新整个相似度矩阵
    console.log('\n5. 更新相似度矩阵...');
    await similarityService.updateSimilarityMatrix();
    console.log(`  ✅ 相似度矩阵更新完成`);

    // 示例 6: 获取相似度矩阵统计
    console.log('\n6. 相似度矩阵统计:');
    const stats = similarityService.getMatrixStats();
    console.log(`  总标签对数: ${stats.totalPairs}`);
    console.log(`  平均相似度: ${stats.avgSimilarity.toFixed(4)}`);
    console.log(`  最小相似度: ${stats.minSimilarity.toFixed(4)}`);
    console.log(`  最大相似度: ${stats.maxSimilarity.toFixed(4)}`);
    console.log(`  高于 0.7 的对数: ${stats.pairsAboveThreshold(0.7)}`);

    // 示例 7: 获取缓存统计
    console.log('\n7. 缓存统计:');
    const cacheStats = similarityService.getCacheStats();
    console.log(`  相似度缓存大小: ${cacheStats.similarityCacheSize}`);
    console.log(`  相似标签缓存大小: ${cacheStats.similarTagsCacheSize}`);
    console.log(`  缓存 TTL: ${cacheStats.cacheTTL / 1000} 秒`);

    // 示例 8: Jaccard 相似度计算
    console.log('\n8. 直接使用 Jaccard 相似度:');
    const jaccardSim = similarityService.calculateJaccardSimilarity(
      ['快速', '迭代', '敏捷'],
      ['敏捷', '执行', '迭代']
    );
    console.log(`  Jaccard 相似度: ${jaccardSim.toFixed(4)}`);

    console.log('\n=== 示例运行完成 ===');

  } catch (error) {
    console.error('❌ 运行示例时出错:', error);
    throw error;
  }
}

// 如果直接运行此文件
if (require.main === module) {
  example()
    .then(() => {
      console.log('\n✅ 示例执行成功');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 示例执行失败:', error);
      process.exit(1);
    });
}

export { example };
