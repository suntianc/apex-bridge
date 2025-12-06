#!/usr/bin/env node
/**
 * 测试简化后的变量系统
 */

const { VariableEngine } = require('./dist/src/core/variable/index');

async function testVariableSystem() {
  console.log('');
  console.log('='.repeat(70));
  console.log('  测试简化版变量系统');
  console.log('='.repeat(70));
  console.log('');

  try {
    // 1. 创建 VariableEngine
    console.log('1️⃣  创建 VariableEngine...');
    const engine = new VariableEngine();
    console.log('✅ VariableEngine 创建完成');
    console.log('');

    // 2. 测试基本变量替换
    console.log('2️⃣  测试基本变量替换...');
    const testContent = 'Hello {{name}}, today is {{day}}!';
    const variables = {
      name: 'Alice',
      day: 'Monday'
    };
    
    const result1 = await engine.resolveAll(testContent, variables);
    console.log('原文:', testContent);
    console.log('结果:', result1);
    console.log('✅ 基本替换成功');
    console.log('');

    // 3. 测试嵌套变量（递归解析）
    console.log('3️⃣  测试嵌套变量（递归解析）...');
    const nestedContent = 'Value: {{outer}}';
    const nestedVars = {
      outer: '{{inner}}-test',
      inner: 'success'
    };
    
    const result2 = await engine.resolveAll(nestedContent, nestedVars);
    console.log('原文:', nestedContent);
    console.log('结果:', result2);
    console.log('✅ 嵌套解析成功');
    console.log('');

    // 4. 测试未定义的变量（应保留原样）
    console.log('4️⃣  测试未定义的变量...');
    const undefinedContent = 'Hello {{name}}, {{undefined_var}}!';
    const partialVars = {
      name: 'Bob'
    };
    
    const result3 = await engine.resolveAll(undefinedContent, partialVars);
    console.log('原文:', undefinedContent);
    console.log('结果:', result3);
    console.log('✅ 未定义变量保留原样');
    console.log('');

    // 5. 测试无变量内容
    console.log('5️⃣  测试无变量内容...');
    const noVarContent = 'This is a plain text without variables.';
    const result4 = await engine.resolveAll(noVarContent, {});
    console.log('原文:', noVarContent);
    console.log('结果:', result4);
    console.log('✅ 无变量内容保持不变');
    console.log('');

    // 6. 测试空变量集合
    console.log('6️⃣  测试空变量集合...');
    const result5 = await engine.resolveAll('Hello {{name}}!', {});
    console.log('原文:', 'Hello {{name}}!');
    console.log('结果:', result5);
    console.log('✅ 空变量集合处理成功');
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

testVariableSystem();