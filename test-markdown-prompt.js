#!/usr/bin/env node
/**
 * 测试Markdown格式系统提示词加载
 */

const { SystemPromptService } = require('./dist/src/services/SystemPromptService');

async function testMarkdownPrompt() {
  console.log('');
  console.log('='.repeat(70));
  console.log('  测试Markdown格式系统提示词加载');
  console.log('='.repeat(70));
  console.log('');

  try {
    // 1. 创建 SystemPromptService
    console.log('1️⃣  创建 SystemPromptService...');
    const service = new SystemPromptService('./config');
    console.log('✅ SystemPromptService 创建完成');
    console.log('');

    // 2. 获取系统提示词模板
    console.log('2️⃣  获取系统提示词模板...');
    const template = service.getSystemPromptTemplate();
    
    if (!template) {
      console.error('❌ 未能加载系统提示词模板');
      process.exit(1);
    }
    
    console.log('✅ 模板加载成功');
    console.log('');
    console.log('模板内容:');
    console.log('-'.repeat(70));
    console.log(template);
    console.log('-'.repeat(70));
    console.log('');

    // 3. 验证模板包含占位符
    console.log('3️⃣  验证模板包含占位符...');
    const hasUserPrompt = template.includes('{{user_prompt}}');
    const hasCurrentTime = template.includes('{{current_time}}');
    const hasModel = template.includes('{{model}}');
    
    console.log('包含 {{user_prompt}}:', hasUserPrompt);
    console.log('包含 {{current_time}}:', hasCurrentTime);
    console.log('包含 {{model}}:', hasModel);
    
    if (hasUserPrompt && hasCurrentTime && hasModel) {
      console.log('✅ 所有占位符都存在');
    } else {
      console.error('❌ 缺少必要的占位符');
      process.exit(1);
    }
    console.log('');

    console.log('='.repeat(70));
    console.log('  所有测试通过！');
    console.log('='.repeat(70));
    console.log('');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

testMarkdownPrompt();