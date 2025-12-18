/**
 * TypeVocabularyService 使用示例
 * ================================
 *
 * 本示例展示如何使用 TypeVocabularyService 来管理 Playbook 系统的动态类型标签
 */

import { TypeVocabularyService } from '../src/services/TypeVocabularyService';
import { TypeVocabulary, InducedType } from '../src/core/playbook/types';

// ============================================================================
// 1. 基础 CRUD 操作
// ============================================================================

async function basicCRUDExample() {
  const service = TypeVocabularyService.getInstance();

  // 创建新的类型标签
  const newTag: Omit<TypeVocabulary, 'created_at' | 'updated_at'> = {
    tag_name: 'rapid_iteration',
    keywords: ['快速', '迭代', '实验', '验证', '敏捷'],
    confidence: 0.95,
    first_identified: Date.now(),
    playbook_count: 23,
    discovered_from: 'historical_clustering',
    metadata: {
      description: '快速迭代问题解决方法',
      usage_examples: ['MVP开发', 'A/B测试', '原型验证'],
      related_tags: ['agile_execution', 'data_driven_decision'],
      decay_score: 0.1
    }
  };

  const createdTag = await service.createTag(newTag);
  console.log('Created tag:', createdTag);

  // 获取单个标签
  const tag = await service.getTag('rapid_iteration');
  console.log('Retrieved tag:', tag);

  // 获取所有标签
  const allTags = await service.getAllTags();
  console.log(`Total tags: ${allTags.length}`);

  // 根据置信度筛选
  const highConfidenceTags = await service.getTagsByConfidence(0.9);
  console.log(`High confidence tags: ${highConfidenceTags.length}`);

  // 更新置信度
  await service.updateConfidence('rapid_iteration', 0.92);
  console.log('Updated confidence');

  // 更新 playbook 计数
  await service.updatePlaybookCount('rapid_iteration', 25);
  console.log('Updated playbook count');

  // 标记为衰退
  await service.markAsDecaying('rapid_iteration');
  console.log('Marked as decaying');

  // 删除标签
  await service.deleteTag('rapid_iteration');
  console.log('Deleted tag');
}

// ============================================================================
// 2. 高级功能
// ============================================================================

async function advancedFeaturesExample() {
  const service = TypeVocabularyService.getInstance();

  // 创建多个标签用于搜索
  await service.createTag({
    tag_name: 'data_driven',
    keywords: ['数据', '分析', '决策'],
    confidence: 0.88,
    first_identified: Date.now(),
    playbook_count: 15,
    discovered_from: 'manual_creation'
  });

  await service.createTag({
    tag_name: 'user_centric',
    keywords: ['用户', '体验', '反馈'],
    confidence: 0.76,
    first_identified: Date.now(),
    playbook_count: 12,
    discovered_from: 'llm_suggestion'
  });

  // 根据关键词搜索标签
  const searchResults = await service.searchTagsByKeywords(['数据', '分析']);
  console.log('Search results:', searchResults);

  // 获取衰退标签
  const decayingTags = await service.getDecayingTags(0.7);
  console.log(`Decaying tags: ${decayingTags.length}`);

  // 清理
  await service.deleteTag('data_driven');
  await service.deleteTag('user_centric');
}

// ============================================================================
// 3. 批量操作
// ============================================================================

async function batchOperationsExample() {
  const service = TypeVocabularyService.getInstance();

  // 从 LLM 分析中诱导出的类型
  const inducedTypes: InducedType[] = [
    {
      tag_name: 'collaborative_design',
      keywords: ['协作', '设计', '团队'],
      confidence: 0.85,
      sample_count: 8,
      playbook_examples: ['pb_001', 'pb_002', 'pb_003'],
      rationale: '基于团队协作的设计流程模式',
      discovered_from: 'llm_analysis',
      created_at: Date.now()
    },
    {
      tag_name: 'iterative_testing',
      keywords: ['迭代', '测试', '验证'],
      confidence: 0.79,
      sample_count: 6,
      playbook_examples: ['pb_004', 'pb_005'],
      rationale: '通过迭代测试优化解决方案',
      discovered_from: 'historical_clustering',
      created_at: Date.now()
    }
  ];

  // 批量创建标签
  const createdTags = await service.batchCreateTags(inducedTypes);
  console.log(`Batch created ${createdTags.length} tags`);

  // 清理
  for (const tag of createdTags) {
    await service.deleteTag(tag.tag_name);
  }
}

// ============================================================================
// 4. 实际应用场景
// ============================================================================

async function realWorldScenario() {
  const service = TypeVocabularyService.getInstance();

  console.log('=== 场景：Playbook 类型归纳系统 ===\n');

  // 模拟从历史 Playbook 中归纳类型
  console.log('1. 从历史数据中归纳类型...');
  const inducedTypes: InducedType[] = [
    {
      tag_name: 'customer_feedback_loop',
      keywords: ['客户', '反馈', '循环', '改进'],
      confidence: 0.91,
      sample_count: 34,
      playbook_examples: ['pb_customer_001', 'pb_customer_002'],
      rationale: '基于客户反馈的持续改进模式',
      discovered_from: 'historical_clustering',
      created_at: Date.now()
    },
    {
      tag_name: 'rapid_prototyping',
      keywords: ['原型', '快速', '验证'],
      confidence: 0.87,
      sample_count: 28,
      playbook_examples: ['pb_proto_001', 'pb_proto_002'],
      rationale: '快速构建和验证原型的流程',
      discovered_from: 'historical_clustering',
      created_at: Date.now()
    }
  ];

  const created = await service.batchCreateTags(inducedTypes);
  console.log(`   成功创建 ${created.length} 个新类型\n`);

  // 查询高质量类型
  console.log('2. 查询高质量类型（置信度 >= 0.85）...');
  const highQualityTypes = await service.getTagsByConfidence(0.85);
  highQualityTypes.forEach(tag => {
    console.log(`   - ${tag.tag_name}: ${tag.confidence} (${tag.playbook_count} 个 playbook)`);
  });
  console.log();

  // 根据关键词搜索
  console.log('3. 搜索包含"客户"的类型...');
  const customerTypes = await service.searchTagsByKeywords(['客户']);
  customerTypes.forEach(tag => {
    console.log(`   - ${tag.tag_name}: ${tag.keywords.join(', ')}`);
  });
  console.log();

  // 模拟类型衰退
  console.log('4. 模拟类型衰退（低使用率标签）...');
  const lowUsageTags = (await service.getAllTags()).filter(tag => tag.playbook_count < 5);
  for (const tag of lowUsageTags) {
    await service.markAsDecaying(tag.tag_name);
    console.log(`   - 标记 ${tag.tag_name} 为衰退状态`);
  }
  console.log();

  // 显示衰退标签
  console.log('5. 查看衰退标签...');
  const decaying = await service.getDecayingTags(0.7);
  decaying.forEach(tag => {
    console.log(`   - ${tag.tag_name}: 衰退评分 ${tag.metadata?.decay_score}`);
  });
  console.log();

  // 清理演示数据
  console.log('6. 清理演示数据...');
  for (const tag of created) {
    await service.deleteTag(tag.tag_name);
  }
  console.log('   清理完成\n');

  console.log('=== 演示完成 ===');
}

// ============================================================================
// 运行示例
// ============================================================================

async function runExamples() {
  try {
    console.log('🚀 TypeVocabularyService 使用示例\n');
    console.log('=' .repeat(60));
    console.log();

    // 运行实际应用场景
    await realWorldScenario();

    console.log();
    console.log('=' .repeat(60));
    console.log('✅ 所有示例执行完成');

    // 关闭数据库连接
    TypeVocabularyService.getInstance().close();
  } catch (error) {
    console.error('❌ 示例执行失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  runExamples();
}

export {
  basicCRUDExample,
  advancedFeaturesExample,
  batchOperationsExample,
  realWorldScenario
};
