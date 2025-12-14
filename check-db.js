/**
 * 检查数据库中的实际技能数据
 */
const { ToolRetrievalService } = require('./dist/src/services/ToolRetrievalService');

async function checkDb() {
  console.log('=== 检查Production数据库中的技能 ===\n');

  const config = {
    vectorDbPath: '/home/suntc/project/ApexBridge/apex-bridge/.data',
    model: 'nomic-embed-text',
    cacheSize: 1000,
    dimensions: 768,
    similarityThreshold: 0.01,
    maxResults: 100
  };

  const retrievalService = new ToolRetrievalService(config);
  await retrievalService.initialize();

  console.log('✓ ToolRetrievalService初始化成功\n');

  // 使用通用查询来获取所有记录
  const allSkills = await retrievalService.findRelevantSkills('tool', 100, 0.001);

  console.log(`数据库中的技能 (总计: ${allSkills.length}):`);
  console.log('='.repeat(60));

  allSkills.forEach((result, index) => {
    console.log(`${index + 1}. ${result.tool.name}`);
    console.log(`   描述: ${result.tool.description}`);
    console.log(`   标签: ${Array.isArray(result.tool.tags) ? result.tool.tags.join(', ') : result.tool.tags}`);
    console.log(`   路径: ${result.tool.path || 'N/A'}`);
    console.log('');
  });

  await retrievalService.cleanup();
  console.log('✓ 检查完成');
}

checkDb().catch(console.error);
