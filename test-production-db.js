/**
 * 使用实际的production向量数据库测试搜索
 */
const { ToolRetrievalService } = require('./dist/src/services/ToolRetrievalService');

async function testProductionDb() {
  console.log('=== 使用实际Production向量库测试 ===\n');

  const config = {
    vectorDbPath: '/home/suntc/project/ApexBridge/apex-bridge/.data',
    model: 'nomic-embed-text',
    cacheSize: 1000,
    dimensions: 768,
    similarityThreshold: 0.40,
    maxResults: 10
  };

  const retrievalService = new ToolRetrievalService(config);
  await retrievalService.initialize();

  console.log('✓ ToolRetrievalService初始化成功\n');

  // 测试查询
  const queries = [
    'git version control tutorial',
    'git',
    'api authentication',
    'version control',
    'tutorial'
  ];

  for (const query of queries) {
    console.log(`${'='.repeat(60)}`);
    console.log(`查询: "${query}"`);
    console.log('='.repeat(60));

    try {
      const results = await retrievalService.findRelevantSkills(query, 5, 0.40);

      console.log(`\n搜索结果 (阈值: 0.10):\n`);

      if (results.length === 0) {
        console.log('❌ 未找到匹配的工具');

        // 尝试更低阈值看原始分数
        console.log('尝试更低阈值 (0.01) 看原始分数...');
        try {
          const rawResults = await retrievalService.findRelevantSkills(query, 10, 0.01);
          if (rawResults.length > 0) {
            console.log(`找到 ${rawResults.length} 个结果 (无阈值过滤):`);
            rawResults.forEach((result, index) => {
              console.log(`  ${index + 1}. ${result.tool.name} - ${(result.score * 100).toFixed(2)}%`);
            });
          }
        } catch (e) {
          console.error('  错误:', e.message);
        }
        console.log('');
      } else {
        results.forEach((result, index) => {
          console.log(`${index + 1}. ${result.tool.name}`);
          console.log(`   相似度: ${(result.score * 100).toFixed(2)}%`);
          console.log(`   描述: ${result.tool.description}`);
          console.log(`   标签: ${Array.isArray(result.tool.tags) ? result.tool.tags.join(', ') : result.tool.tags}`);
          console.log('');
        });
      }
    } catch (error) {
      console.error(`❌ 搜索失败:`, error.message);
    }
  }

  await retrievalService.cleanup();
  console.log('\n✓ 测试完成');
}

testProductionDb().catch(console.error);
