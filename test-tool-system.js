/**
 * 测试工具系统基础功能
 */

const { getBuiltInToolsRegistry } = require('./src/services/BuiltInToolsRegistry');
const { getBuiltInExecutor } = require('./src/services/executors/BuiltInExecutor');

async function testToolSystem() {
  console.log('🚀 测试工具系统基础功能...\n');

  try {
    // 测试1: 获取注册表
    console.log('1. 测试内置工具注册表...');
    const registry = getBuiltInToolsRegistry();
    const tools = registry.listTools();
    console.log(`✅ 注册的工具数量: ${tools.length}`);
    tools.forEach(tool => {
      console.log(`   - ${tool.name}: ${tool.description}`);
    });

    // 测试2: 获取执行器
    console.log('\n2. 测试内置工具执行器...');
    const executor = getBuiltInExecutor();
    const executorTools = executor.listTools();
    console.log(`✅ 执行器中的工具数量: ${executorTools.length}`);

    // 测试3: 创建测试文件
    console.log('\n3. 创建测试文件...');
    const fs = require('fs');
    const testContent = 'Hello from ApexBridge Tool System! 🎉';
    fs.writeFileSync('./test-file.txt', testContent);
    console.log('✅ 测试文件已创建');

    // 测试4: 使用FileReadTool
    console.log('\n4. 测试FileReadTool...');
    const readResult = await executor.execute({
      name: 'file-read',
      args: {
        path: './test-file.txt'
      }
    });

    console.log(`✅ 读取结果: ${readResult.success ? '成功' : '失败'}`);
    if (readResult.success) {
      console.log(`   内容: "${readResult.output?.trim()}"`);
      console.log(`   耗时: ${readResult.duration}ms`);
    } else {
      console.log(`   错误: ${readResult.error}`);
    }

    // 测试5: 使用FileWriteTool
    console.log('\n5. 测试FileWriteTool...');
    const writeResult = await executor.execute({
      name: 'file-write',
      args: {
        path: './test-output.txt',
        content: 'This is a test file written by FileWriteTool! 📝',
        backup: true
      }
    });

    console.log(`✅ 写入结果: ${writeResult.success ? '成功' : '失败'}`);
    if (writeResult.success) {
      console.log(`   输出: "${writeResult.output}"`);
      console.log(`   耗时: ${writeResult.duration}ms`);
    } else {
      console.log(`   错误: ${writeResult.error}`);
    }

    // 验证写入的文件
    console.log('\n6. 验证写入的文件...');
    if (fs.existsSync('./test-output.txt')) {
      const writtenContent = fs.readFileSync('./test-output.txt', 'utf8');
      console.log(`✅ 文件内容: "${writtenContent.trim()}"`);

      // 检查备份文件
      if (fs.existsSync('./test-output.txt.backup')) {
        console.log('✅ 备份文件已创建');
      }
    }

    // 测试6: 测试不存在的工具
    console.log('\n7. 测试不存在的工具...');
    const invalidResult = await executor.execute({
      name: 'non-existent-tool',
      args: {}
    });

    console.log(`✅ 错误处理: ${invalidResult.success ? '意外成功' : '正确处理错误'}`);
    if (!invalidResult.success) {
      console.log(`   错误代码: ${invalidResult.errorCode}`);
      console.log(`   错误信息: ${invalidResult.error}`);
    }

    // 清理测试文件
    console.log('\n8. 清理测试文件...');
    const filesToClean = ['test-file.txt', 'test-output.txt', 'test-output.txt.backup'];
    filesToClean.forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`   已删除: ${file}`);
      }
    });
    console.log('✅ 清理完成');

    // 测试统计信息
    console.log('\n9. 测试统计信息...');
    const stats = registry.getStatistics();
    console.log(`✅ 工具统计:`);
    console.log(`   总数: ${stats.total}`);
    console.log(`   启用: ${stats.enabled}`);
    console.log(`   禁用: ${stats.disabled}`);
    console.log(`   按分类:`, stats.byCategory);

    console.log('\n🎉 所有测试完成！工具系统基础功能正常！');

  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  testToolSystem().catch(console.error);
}

module.exports = { testToolSystem };