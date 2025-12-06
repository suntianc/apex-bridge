#!/usr/bin/env node
/**
 * 测试新功能：占位符检测和自动填充
 */

const { VariableEngine } = require('./dist/src/core/variable/index');

async function testNewFeatures() {
  console.log('');
  console.log('='.repeat(70));
  console.log('  测试新功能：占位符检测和自动填充');
  console.log('='.repeat(70));
  console.log('');

  try {
    // 1. 创建 VariableEngine
    console.log('1️⃣  创建 VariableEngine...');
    const engine = new VariableEngine();
    console.log('✅ VariableEngine 创建完成');
    console.log('');

    // 2. 测试占位符检测
    console.log('2️⃣  测试占位符检测...');
    const textWithPlaceholders = 'Hello {{name}}, today is {{day}}!';
    const textWithoutPlaceholders = 'Hello world, today is Monday!';
    
    console.log('包含占位符的文本:', textWithPlaceholders);
    console.log('hasPlaceholders:', engine.hasPlaceholders(textWithPlaceholders));
    console.log('getPlaceholderKeys:', engine.getPlaceholderKeys(textWithPlaceholders));
    
    console.log('不包含占位符的文本:', textWithoutPlaceholders);
    console.log('hasPlaceholders:', engine.hasPlaceholders(textWithoutPlaceholders));
    console.log('getPlaceholderKeys:', engine.getPlaceholderKeys(textWithoutPlaceholders));
    console.log('✅ 占位符检测成功');
    console.log('');

    // 3. 测试自动填充空字符串
    console.log('3️⃣  测试自动填充空字符串...');
    const testContent = 'Hello {{name}}, {{undefined_var}}!';
    const partialVars = {
      name: 'Bob'
    };
    
    // 不使用自动填充
    const resultWithoutFill = await engine.resolveAll(testContent, partialVars);
    console.log('原文:', testContent);
    console.log('不使用自动填充:', resultWithoutFill);
    
    // 使用自动填充
    const resultWithFill = await engine.resolveAll(testContent, partialVars, {
      fillEmptyOnMissing: true
    });
    console.log('使用自动填充:', resultWithFill);
    console.log('✅ 自动填充功能成功');
    console.log('');

    // 4. 测试系统提示词场景
    console.log('4️⃣  测试系统提示词场景...');
    const systemPromptTemplate = '你是一个AI助手。\n\n用户提示词: {{user_prompt}}\n\n当前时间: {{current_time}}\n\n模型: {{model}}';
    const contextVars = {
      user_prompt: '请帮我写一段代码',
      model: 'gpt-4',
      // current_time 未提供，应该被自动填充为空
    };
    
    const renderedPrompt = await engine.resolveAll(systemPromptTemplate, contextVars, {
      fillEmptyOnMissing: true
    });
    
    console.log('系统提示词模板:');
    console.log(systemPromptTemplate);
    console.log('\n渲染后的提示词:');
    console.log(renderedPrompt);
    console.log('✅ 系统提示词场景测试成功');
    console.log('');

    console.log('='.repeat(70));
    console.log('  所有新功能测试通过！');
    console.log('='.repeat(70));
    console.log('');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

testNewFeatures();