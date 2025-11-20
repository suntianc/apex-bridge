#!/usr/bin/env node

/**
 * 三段式披露测试脚本
 * 演示不同披露阶段的效果
 */

const path = require('path');

async function testDisclosurePhases() {
  console.log('🧪 Testing Disclosure Phases...\n');

  try {
    // 动态导入
    const { ProtocolEngine } = await import('../dist/core/ProtocolEngine.js');
    const { ConfigService } = await import('../dist/services/ConfigService.js');
    const { SkillsToolDescriptionGenerator } = await import('../dist/core/skills/SkillsToolDescriptionGenerator.js');
    const { SkillsIndex } = await import('../dist/core/skills/SkillsIndex.js');
    const { SkillsCache } = await import('../dist/core/skills/SkillsCache.js');
    const { InstructionLoader } = await import('../dist/core/skills/InstructionLoader.js');
    const { ResourceLoader } = await import('../dist/core/skills/ResourceLoader.js');
    const { SkillsLoader } = await import('../dist/core/skills/SkillsLoader.js');
    const { PathService } = await import('../dist/services/PathService.js');

    // 加载配置
    const configService = ConfigService.getInstance();
    const config = configService.readConfig();

    // 创建ProtocolEngine
    const protocolEngine = new ProtocolEngine(config);
    await protocolEngine.initialize();

    // 设置Skills生成器
    const ps = PathService.getInstance();
    const skillsRoot = path.join(ps.getRootDir(), 'skills');
    const skillsIndex = new SkillsIndex({ skillsRoot });
    await skillsIndex.buildIndex();
    const skillsCache = new SkillsCache();
    const instructionLoader = new InstructionLoader(skillsIndex, skillsCache);
    const resourceLoader = new ResourceLoader(skillsIndex, skillsCache, {});
    const skillsLoader = new SkillsLoader(skillsIndex, instructionLoader, resourceLoader, skillsCache);
    const skillsDescGenerator = new SkillsToolDescriptionGenerator(skillsIndex, skillsLoader);
    protocolEngine.setSkillsDescriptionGenerator(skillsDescGenerator);

    console.log('✅ 初始化完成\n');
    console.log('📊 当前技能数量:', skillsIndex.getAllMetadata().length);
    console.log('');

    // 测试三个阶段
    const phases = ['metadata', 'brief', 'full'];

    for (const phase of phases) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📢 阶段: ${phase.toUpperCase()}`);
      console.log(`${'='.repeat(80)}\n`);

      const description = await skillsDescGenerator.getAllToolsDescription(phase);
      const lineCount = description.split('\n').length;
      const charCount = description.length;
      const avgToken = Math.ceil(charCount / 3);

      console.log(`📊 统计信息:`);
      console.log(`   - 行数: ${lineCount}`);
      console.log(`   - 字符数: ${charCount}`);
      console.log(`   - 估算 Token: ~${avgToken}\n`);

      console.log(`📝 内容示例:`);
      console.log('-'.repeat(80));
      console.log(description.substring(0, 800));
      console.log('-'.repeat(80));
      console.log(`... (省略 ${charCount - 800} 字符)\n`);
    }

    // 生成使用建议
    const totalTools = skillsIndex.getAllMetadata().length;
    const avgTokenPerTool = {
      metadata: 50,
      brief: 150,
      full: 300
    };

    console.log('\n' + '='.repeat(80));
    console.log('💡 推荐配置');
    console.log('='.repeat(80));
    console.log(`工具数量: ${totalTools}\n`);

    Object.entries(avgTokenPerTool).forEach(([phase, token]) => {
      const totalTokens = token * totalTools;
      console.log(`${phase.padEnd(10)}: ${totalTokens} tokens (${totalTokens / 1000}K)`);
    });

    console.log('\n📋 使用建议:');
    if (totalTools <= 3) {
      console.log('   ✅ 工具数量少 (1-3)，可以使用 full 或 brief');
    } else if (totalTools <= 8) {
      console.log('   ✅ 工具数量中等 (4-8)，推荐使用 brief');
    } else {
      console.log('   ✅ 工具数量较多 (9+)，推荐使用 metadata');
    }
    console.log('');

    console.log('🚀 测试命令示例:');
    console.log('');
    console.log('# 使用 metadata (默认)');
    console.log(`curl -X POST http://localhost:8088/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"system","content":"可用工具:\\n{{ABPAllTools}}\\n\\n你是一个助手。"},{"role":"user","content":"掷一个骰子"}],"stream":false}'`);
    console.log('');
    console.log('# 使用 brief');
    console.log(`curl -X POST http://localhost:8088/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"system","content":"可用工具:\\n{{ABPAllTools}}\\n\\n你是一个助手。"},{"role":"user","content":"掷一个骰子"}],"toolsDisclosure":"brief","stream":false}'`);

    process.exit(0);

  } catch (error) {
    console.error('❌ 测试失败:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// 检查 dist 目录
const fs = require('fs');
const distDir = path.join(__dirname, '../dist');
if (!fs.existsSync(distDir)) {
  console.error('❌ dist 目录不存在，请先运行 npm run build');
  process.exit(1);
}

console.log('🔧 当前目录:', __dirname);
console.log('📁 dist 目录:', distDir);
console.log('');

testDisclosurePhases();
