/**
 * 测试动态维度获取功能
 */

const { getToolRetrievalService } = require('./dist/src/services/ToolRetrievalService');
const { LLMConfigService } = require('./dist/src/services/LLMConfigService');

async function testDynamicDimensions() {
  console.log('🧪 Testing dynamic dimensions...\n');

  try {
    // 1. 获取 LLMConfigService 实例
    const llmConfigService = LLMConfigService.getInstance();

    // 2. 获取默认的 embedding 模型
    const embeddingModel = llmConfigService.getDefaultModel('embedding');
    console.log('📋 Default embedding model:', embeddingModel?.modelName || 'None');
    console.log('📊 Model dimensions from DB:', embeddingModel?.config?.dimensions || 'Not found');

    // 3. 获取 ToolRetrievalService 实例
    const retrievalService = getToolRetrievalService();

    // 4. 初始化服务（会自动获取实际维度）
    console.log('🔄 Initializing ToolRetrievalService...');
    await retrievalService.initialize();

    console.log('✅ ToolRetrievalService initialized successfully');

    // 5. 验证维度是否正确
    const stats = retrievalService.getStatistics();
    console.log('📈 Service stats:', stats);

    // 6. 测试向量搜索
    console.log('\n🔍 Testing vector search...');
    const results = await retrievalService.findRelevantSkills('网络搜索', 3, 0.5);
    console.log(`✅ Found ${results.length} relevant skills`);

    results.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.tool.name} (score: ${(result.score * 100).toFixed(2)}%)`);
    });

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// 运行测试
testDynamicDimensions().then(() => {
  console.log('\n✅ All tests passed!');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});