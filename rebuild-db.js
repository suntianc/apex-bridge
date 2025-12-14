/**
 * 重新构建Production向量数据库
 */
const { ToolRetrievalService } = require('./dist/src/services/ToolRetrievalService');
const fs = require('fs');
const path = require('path');

async function rebuildDb() {
  console.log('=== 重新构建Production向量数据库 ===\n');

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

  // 检查技能目录
  const skillsDir = '/home/suntc/project/ApexBridge/apex-bridge/data/skills';
  if (!fs.existsSync(skillsDir)) {
    console.log('❌ Skills目录不存在:', skillsDir);
    return;
  }

  console.log('扫描技能目录:', skillsDir);

  // 读取所有技能文件
  const skillFiles = fs.readdirSync(skillsDir)
    .filter(file => file.endsWith('.md'))
    .slice(0, 20); // 限制数量

  console.log(`找到 ${skillFiles.length} 个技能文件\n`);

  // 重新索引所有技能
  for (const file of skillFiles) {
    const filePath = path.join(skillsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // 解析SKILL文件
    const skillName = file.replace('.md', '');
    const skill = {
      name: skillName,
      description: content.substring(0, 200).replace(/\n/g, ' '), // 取前200字符
      tags: [],
      path: filePath
    };

    // 从内容中提取标签
    const tagMatch = content.match(/tags?:\s*([^\n]+)/i);
    if (tagMatch) {
      skill.tags = tagMatch[1].split(',').map(t => t.trim());
    }

    try {
      await retrievalService.indexSkill(skill);
      console.log(`✓ 索引: ${skill.name}`);
    } catch (error) {
      console.error(`❌ 索引失败: ${skill.name} -`, error.message);
    }
  }

  console.log('\n=== 测试搜索 ===');

  // 测试查询
  const testQueries = [
    'git',
    'api',
    'tool',
    'tutorial'
  ];

  for (const query of testQueries) {
    console.log(`\n查询: "${query}"`);
    try {
      const results = await retrievalService.findRelevantSkills(query, 5, 0.40);
      if (results.length > 0) {
        console.log(`✓ 找到 ${results.length} 个结果`);
        results.forEach((result, i) => {
          console.log(`  ${i+1}. ${result.tool.name} - ${(result.score * 100).toFixed(2)}%`);
        });
      } else {
        console.log('❌ 未找到结果');
      }
    } catch (error) {
      console.error('❌ 搜索失败:', error.message);
    }
  }

  await retrievalService.cleanup();
  console.log('\n✓ 重建完成');
}

rebuildDb().catch(console.error);
