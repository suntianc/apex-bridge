#!/usr/bin/env node

/**
 * 自我思考循环测试脚本
 * 测试 ReAct 模式的自我思考功能
 */

const path = require('path');

async function testSelfThinking() {
  console.log('🧪 测试自我思考循环功能...\n');

  try {
    // 动态导入（ESM模块）
    const { ConfigService } = await import('../dist/services/ConfigService.js');
    const { ProtocolEngine } = await import('../dist/core/ProtocolEngine.js');
    const { ChatService } = await import('../dist/services/ChatService.js');
    const { EventBus } = await import('../dist/core/EventBus.js');
    const { LLMManager } = await import('../dist/core/LLMManager.js');

    // 加载配置
    const configService = ConfigService.getInstance();
    const config = configService.readConfig();

    // 创建ProtocolEngine
    const protocolEngine = new ProtocolEngine(config);
    await protocolEngine.initialize();
    console.log('✅ ProtocolEngine initialized\n');

    // 设置Skills生成器（模拟server.ts中的setupSkillsDescriptionGenerator）
    const ps = (await import('../dist/services/PathService.js')).PathService.getInstance();
    const skillsRoot = path.join(ps.getRootDir(), 'skills');
    const { SkillsIndex } = await import('../dist/core/skills/SkillsIndex.js');
    const { SkillsCache } = await import('../dist/core/skills/SkillsCache.js');
    const { InstructionLoader } = await import('../dist/core/skills/InstructionLoader.js');
    const { ResourceLoader } = await import('../dist/core/skills/ResourceLoader.js');
    const { SkillsLoader } = await import('../dist/core/skills/SkillsLoader.js');
    const { SkillsExecutionManager } = await import('../dist/core/skills/SkillsExecutionManager.js');
    const { SkillsToToolMapper } = await import('../dist/core/skills/SkillsToToolMapper.js');
    const { SkillsDirectExecutor } = await import('../dist/core/skills/executors/SkillsDirectExecutor.js');
    const { SkillsInternalExecutor } = await import('../dist/core/skills/executors/SkillsInternalExecutor.js');
    const { SkillsToolDescriptionGenerator } = await import('../dist/core/skills/SkillsToolDescriptionGenerator.js');

    const skillsIndex = new SkillsIndex({ skillsRoot });
    await skillsIndex.buildIndex();
    const skillsCache = new SkillsCache();
    const instructionLoader = new InstructionLoader(skillsIndex, skillsCache);
    const resourceLoader = new ResourceLoader(skillsIndex, skillsCache, {});
    const skillsLoader = new SkillsLoader(skillsIndex, instructionLoader, resourceLoader, skillsCache);
    const skillsDescGenerator = new SkillsToolDescriptionGenerator(skillsIndex, skillsLoader);

    protocolEngine.setSkillsDescriptionGenerator(skillsDescGenerator);
    console.log('✅ SkillsToolDescriptionGenerator injected\n');

    // 创建 LLMManager
    const llmManager = new LLMManager();
    console.log('✅ LLMManager initialized\n');

    // 创建 ChatService
    const eventBus = EventBus.getInstance();
    const chatService = new ChatService(protocolEngine, llmManager, eventBus);

    // 设置 Skills 执行器
    const skillsExecManager = new SkillsExecutionManager(skillsLoader, {});
    const directExecutor = new SkillsDirectExecutor({ loader: skillsLoader });
    const internalExecutor = new SkillsInternalExecutor({ loader: skillsLoader });
    skillsExecManager.registerExecutor('direct', directExecutor);
    skillsExecManager.registerExecutor('internal', internalExecutor);
    const skillsMapper = new SkillsToToolMapper(skillsIndex);
    chatService.setSkillsExecution(skillsExecManager, skillsMapper);
    console.log('✅ ChatService with Self-Thinking ready\n');

    // 测试用例
    const testCases = [
      {
        name: '简单工具调用',
        messages: [
          { role: 'system', content: '你是一个助手。可用工具:\n{{ABPAllTools}}\n\n请使用工具来回答用户问题。' },
          { role: 'user', content: '掷一个骰子' }
        ],
        options: {
          selfThinking: {
            enabled: true,
            maxIterations: 3,
            includeThoughtsInResponse: true
          },
          stream: false
        }
      },
      {
        name: '多步骤任务',
        messages: [
          { role: 'system', content: '你是一个助手。可用工具:\n{{ABPAllTools}}\n\n请分析任务并逐步完成。' },
          { role: 'user', content: '先检查系统状态，然后玩石头剪刀布，我出石头' }
        ],
        options: {
          selfThinking: {
            enabled: true,
            maxIterations: 5,
            includeThoughtsInResponse: true,
            enableTaskEvaluation: true
          },
          stream: false
        }
      }
    ];

    // 运行测试
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];

      console.log(`\n${'='.repeat(80)}`);
      console.log(`📊 测试 ${i + 1}: ${testCase.name}`);
      console.log(`${'='.repeat(80)}\n`);

      console.log('📨 请求:');
      console.log(JSON.stringify(testCase.messages[testCase.messages.length - 1], null, 2));
      console.log('\n🔧 配置:');
      console.log(`- 自我思考: ${testCase.options.selfThinking.enabled}`);
      console.log(`- 最大循环: ${testCase.options.selfThinking.maxIterations}`);
      console.log(`- 包含思考过程: ${testCase.options.selfThinking.includeThoughtsInResponse}`);

      try {
        console.log('\n🔄 执行中...\n');
        const result = await chatService.processMessage(testCase.messages, testCase.options);

        console.log('✅ 响应:');
        console.log('-'.repeat(60));
        console.log(result.content);
        console.log('-'.repeat(60));

        console.log('\n📊 元数据:');
        console.log(`- 循环次数: ${result.iterations}`);
        console.log(`- 工具调用: ${result.toolCalls?.length || 0}`);
        console.log(`- 工具结果: ${result.toolResults?.length || 0}`);

        if (result.thinkingProcess) {
          console.log('\n🧠 思考过程:');
          console.log('-'.repeat(60));
          console.log(result.thinkingProcess);
          console.log('-'.repeat(60));
        }

        if (result.toolCalls && result.toolCalls.length > 0) {
          console.log('\n🔧 工具调用:');
          result.toolCalls.forEach((tool, index) => {
            console.log(`  ${index + 1}. ${tool.name}`);
          });
        }

      } catch (error: any) {
        console.error('❌ 测试失败:', error.message);
        console.error(error.stack);
      }
    }

    console.log('\n✨ 自我思考循环测试完成！\n');
    console.log('\n💡 提示:');
    console.log('- 如果看到循环次数 > 1，说明自我思考功能正常工作');
    console.log('- 如果包含思考过程，可以看到完整的推理轨迹');
    console.log('- 如果没有循环或工具调用，可能需要调整提示词或工具描述');

    process.exit(0);

  } catch (error: any) {
    console.error('❌ 测试失败:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// 检查 dist 目录
const fs = require('fs');
if (!fs.existsSync('./dist')) {
  console.error('❌ dist 目录不存在，请先运行 npm run build');
  process.exit(1);
}

console.log('🔧 当前目录:', __dirname);
console.log('📁 dist 目录:', path.join(__dirname, '../dist'));
console.log('');

testSelfThinking();
