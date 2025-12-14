/**
 * 使用 nomic-embed-text:latest 模型的阈值优化测试
 */

const { ToolRetrievalService } = require('./dist/src/services/ToolRetrievalService');

async function testNomicThreshold() {
  console.log('=== Nomic Embedding 模型阈值优化测试 ===\n');
  console.log('模型: nomic-embed-text:latest\n');

  const config = {
    vectorDbPath: './.data/test-nomic',
    model: 'all-MiniLM-L6-v2',
    cacheSize: 1000,
    dimensions: 384,
    similarityThreshold: 0.6,
    maxResults: 10
  };

  const retrievalService = new ToolRetrievalService(config);
  await retrievalService.initialize();

  console.log('✓ ToolRetrievalService初始化成功');
  console.log(`  向量维度: ${(await retrievalService.getActualDimensions) || 'TBD'}\n`);

  // 索引测试技能
  console.log('1. 索引测试技能...');
  const skills = [
    {
      name: 'git-commit-helper',
      description: 'Git提交信息生成助手，帮助开发者编写规范、清晰、语义化的提交信息',
      tags: ['git', 'commit', 'version-control'],
      path: './.data/skills/git-commit-helper'
    },
    {
      name: 'api-authentication',
      description: 'API认证和授权管理工具',
      tags: ['api', 'auth', 'oauth'],
      path: './.data/skills/api-authentication'
    },
    {
      name: 'database-optimizer',
      description: '数据库查询优化和性能调优工具',
      tags: ['database', 'sql', 'performance'],
      path: './.data/skills/database-optimizer'
    },
    {
      name: 'weather-query',
      description: '天气查询工具，获取实时天气信息',
      tags: ['weather', 'forecast', 'climate'],
      path: './.data/skills/weather-query'
    }
  ];

  for (const skill of skills) {
    await retrievalService.indexSkill(skill);
    console.log(`   ✓ 索引: ${skill.name}`);
  }
  console.log('');

  // 测试查询
  const queries = [
    { query: 'git', expected: 'git-commit-helper', type: '精确匹配' },
    { query: 'version control', expected: 'git-commit-helper', type: '语义搜索' },
    { query: 'commit', expected: 'git-commit-helper', type: '精确匹配' },
    { query: 'api', expected: 'api-authentication', type: '精确匹配' },
    { query: 'authentication', expected: 'api-authentication', type: '语义搜索' },
    { query: 'database', expected: 'database-optimizer', type: '精确匹配' },
    { query: 'sql', expected: 'database-optimizer', type: '语义搜索' },
    { query: 'weather', expected: 'weather-query', type: '精确匹配' },
    { query: 'forecast', expected: 'weather-query', type: '语义搜索' }
  ];

  // 测试不同的阈值
  const thresholds = [
    { value: 0.01, label: '1%' },
    { value: 0.05, label: '5%' },
    { value: 0.10, label: '10%' },
    { value: 0.15, label: '15%' },
    { value: 0.20, label: '20%' },
    { value: 0.30, label: '30%' },
    { value: 0.40, label: '40%' },
    { value: 0.50, label: '50%' },
    { value: 0.60, label: '60%' }
  ];

  const results = {};

  // 为每个阈值运行测试
  for (const threshold of thresholds) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`测试阈值: ${threshold.label}`);
    console.log('='.repeat(60));

    results[threshold.value] = {
      totalQueries: 0,
      matchedQueries: 0,
      totalResults: 0,
      exactMatches: 0,
      semanticMatches: 0,
      avgScore: 0,
      details: []
    };

    let totalScore = 0;

    for (const queryInfo of queries) {
      const results_list = await retrievalService.findRelevantSkills(
        queryInfo.query,
        5,
        threshold.value
      );

      const matched = results_list.some(r => r.tool.name === queryInfo.expected);
      const topScore = results_list.length > 0 ? results_list[0].score : 0;
      totalScore += topScore;

      results[threshold.value].totalQueries++;
      if (matched) {
        results[threshold.value].matchedQueries++;
        if (queryInfo.type === '精确匹配') {
          results[threshold.value].exactMatches++;
        } else {
          results[threshold.value].semanticMatches++;
        }
      }
      results[threshold.value].totalResults += results_list.length;

      results[threshold.value].details.push({
        query: queryInfo.query,
        expected: queryInfo.expected,
        type: queryInfo.type,
        matched,
        topScore: topScore,
        resultCount: results_list.length
      });

      const status = matched ? '✅' : '❌';
      console.log(
        `${status} ${queryInfo.query.padEnd(20)} | 期望: ${queryInfo.expected.padEnd(25)} | ` +
        `相似度: ${(topScore * 100).toFixed(2).padStart(7)}% | 结果数: ${results_list.length}`
      );
    }

    const matchRate = (results[threshold.value].matchedQueries / results[threshold.value].totalQueries * 100).toFixed(1);
    const avgResults = (results[threshold.value].totalResults / results[threshold.value].totalQueries).toFixed(1);
    results[threshold.value].avgScore = (totalScore / results[threshold.value].totalQueries * 100).toFixed(2);

    console.log(`\n匹配率: ${matchRate}% | 平均结果数: ${avgResults} | 平均相似度: ${results[threshold.value].avgScore}%`);
  }

  // 汇总分析
  console.log('\n\n' + '='.repeat(80));
  console.log('Nomic Embedding 模型阈值优化分析报告');
  console.log('='.repeat(80));

  console.log('\n阈值\t匹配率\t精确匹配\t语义搜索\t平均结果数\t平均相似度\t推荐度');
  console.log('-'.repeat(80));

  let bestThreshold = null;
  let bestScore = 0;

  for (const threshold of thresholds) {
    const data = results[threshold.value];
    const matchRate = (data.matchedQueries / data.totalQueries * 100).toFixed(1);
    const exactRate = `${data.exactMatches}/4`;
    const semanticRate = `${data.semanticMatches}/5`;
    const avgResults = (data.totalResults / data.totalQueries).toFixed(1);
    const avgSimilarity = data.avgScore;

    // 计算推荐度
    let recommendation = '';
    if (matchRate >= 100 && avgResults >= 2 && avgSimilarity >= 40) {
      recommendation = '⭐⭐⭐⭐⭐ 强烈推荐';
      if (parseFloat(avgSimilarity) > bestScore) {
        bestScore = parseFloat(avgSimilarity);
        bestThreshold = threshold.value;
      }
    } else if (matchRate >= 90) {
      recommendation = '⭐⭐⭐⭐ 推荐';
    } else if (matchRate >= 70) {
      recommendation = '⭐⭐⭐ 可用';
    } else if (matchRate >= 50) {
      recommendation = '⭐⭐ 一般';
    } else {
      recommendation = '⭐ 不推荐';
    }

    console.log(
      `${threshold.label.padEnd(8)}\t${matchRate}%\t\t${exactRate}\t\t${semanticRate}\t\t${avgResults}\t\t${avgSimilarity}%\t\t${recommendation}`
    );
  }

  if (bestThreshold) {
    console.log(`\n🏆 最佳阈值: ${bestThreshold * 100}% (平均相似度: ${bestScore}%)`);
  }

  // 详细分析语义搜索表现
  console.log('\n\n' + '='.repeat(80));
  console.log('语义搜索表现详细分析');
  console.log('='.repeat(80));

  for (const threshold of thresholds) {
    const data = results[threshold.value];
    const matchRate = (data.matchedQueries / data.totalQueries * 100).toFixed(1);

    if (matchRate === '100.0') {
      console.log(`\n✅ 阈值 ${threshold.label} - 完美匹配 (100%)`);
      console.log(`   精确匹配: ${data.exactMatches}/4 (100%)`);
      console.log(`   语义搜索: ${data.semanticMatches}/5 (100%)`);
      console.log(`   平均相似度: ${data.avgScore}%`);
      console.log(`   平均结果数: ${(data.totalResults / data.totalQueries).toFixed(1)}`);
    }
  }

  await retrievalService.cleanup();
  console.log('\n✓ 测试完成');
}

testNomicThreshold().catch(console.error);
