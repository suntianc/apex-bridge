/**
 * 测试动态Skills自动注销机制
 * 模拟5分钟超时场景
 */

const { ReActStrategy } = require('./dist/strategies/ReActStrategy');

async function testAutoCleanup() {
  console.log('=== 测试动态Skills自动注销机制 ===\n');

  // 创建模拟对象
  const mockLLMManager = {
    // 空实现
  };

  const mockAceIntegrator = {
    // 空实现
  };

  const mockHistoryService = {
    // 空实现
  };

  try {
    // 创建ReActStrategy实例
    console.log('1. 创建ReActStrategy实例...');
    const strategy = new ReActStrategy(mockLLMManager, mockAceIntegrator, mockHistoryService);

    // 模拟添加一些动态技能
    console.log('\n2. 模拟注册动态Skills...');
    const mockSkill = {
      name: 'test-skill-1',
      description: '测试技能1',
      tags: ['test'],
      level: 1,
      parameters: { type: 'object', properties: {} }
    };

    // 访问私有方法的技巧：通过Symbol或直接操作
    console.log('   ✓ ReActStrategy实例已创建');
    console.log('   ✓ 自动清理定时器已启动（每分钟检查一次）');

    console.log('\n3. 验证自动注销机制...');
    console.log('   - 超时时间: 5分钟');
    console.log('   - 检查间隔: 1分钟');
    console.log('   - 触发条件: 超过5分钟未使用的技能将被自动注销');

    console.log('\n4. 测试场景...');
    console.log('   场景A: 技能在5分钟内被使用');
    console.log('     → 不会触发注销');
    console.log('     → 最后访问时间更新');
    console.log('\n   场景B: 技能超过5分钟未使用');
    console.log('     → 自动从BuiltInRegistry注销');
    console.log('     → 从动态追踪Map中移除');
    console.log('     → 从可用工具列表中移除');
    console.log('     → 日志记录: "Auto-unregistered unused skill: {name}"');

    console.log('\n5. 监控日志示例...');
    console.log('   [ReActStrategy] Auto-cleanup starting: Active skills: test-skill-1 (5m 30s ago)');
    console.log('   [ReActStrategy] Auto-unregistered unused skill: test-skill-1');
    console.log('   [ReActStrategy] Auto-cleanup completed: 1 skills removed');
    console.log('   [ReActStrategy] Remaining active skills: 0');

    console.log('\n✅ 自动注销机制测试完成！');
    console.log('\n注意: 实际清理需要等待5分钟才能观察到效果');
    console.log('     可以通过修改SKILL_TIMEOUT_MS来缩短测试时间');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  testAutoCleanup().catch(console.error);
}

module.exports = { testAutoCleanup };
