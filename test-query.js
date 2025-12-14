/**
 * 快速测试特定查询
 */
const { ToolRetrievalService } = require('./dist/src/services/ToolRetrievalService');

async function testQuery() {
  console.log('=== 测试查询: "git version control tutorial" ===\n');

  const config = {
    vectorDbPath: './.data/test-query',
    model: 'all-MiniLM-L6-v2',
    cacheSize: 1000,
    dimensions: 384,
    similarityThreshold: 0.40,
    maxResults: 10
  };

  const retrievalService = new ToolRetrievalService(config);
  await retrievalService.initialize();

  console.log('✓ ToolRetrievalService初始化成功\n');

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
      name: 'git-tutorial',
      description: 'Git版本控制系统教程和学习指南',
      tags: ['git', 'tutorial', 'version-control', 'learning'],
      path: './.data/skills/git-tutorial'
    },
    {
      name: 'version-control-guide',
      description: '版本控制最佳实践指南',
      tags: ['version-control', 'git', 'svn', 'best-practices'],
      path: './.data/skills/version-control-guide'
    },
    {
      name: 'api-authentication',
      description: 'API认证和授权管理工具',
      tags: ['api', 'auth', 'oauth'],
      path: './.data/skills/api-authentication'
    }
  ];

  for (const skill of skills) {
    await retrievalService.indexSkill(skill);
    console.log(`   ✓ 索引: ${skill.name}`);
  }
  console.log('');

  // 测试查询
  const query = 'git version control tutorial';
  console.log(`2. 执行搜索查询: "${query}"`);
  console.log('-'.repeat(60));

  const results = await retrievalService.findRelevantSkills(query, 5, 0.40);

  console.log(`\n搜索结果 (阈值: 0.40):\n`);

  if (results.length === 0) {
    console.log('❌ 未找到匹配的工具\n');
  } else {
    results.forEach((result, index) => {
      console.log(`${index + 1}. ${result.tool.name}`);
      console.log(`   相似度: ${(result.score * 100).toFixed(2)}%`);
      console.log(`   描述: ${result.tool.description}`);
      console.log(`   标签: ${Array.isArray(result.tool.tags) ? result.tool.tags.join(', ') : result.tool.tags}`);
      console.log('');
    });

    console.log('=== 最佳匹配 ===');
    const bestMatch = results[0];
    console.log(`工具: ${bestMatch.tool.name}`);
    console.log(`相似度: ${(bestMatch.score * 100).toFixed(2)}%`);
    console.log(`原因: ${bestMatch.reason || '语义匹配'}`);
  }

  await retrievalService.cleanup();
  console.log('\n✓ 测试完成');
}

testQuery().catch(console.error);
