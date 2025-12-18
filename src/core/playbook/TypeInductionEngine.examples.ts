/**
 * TypeInductionEngine 使用示例
 * ============================
 *
 * 展示如何使用 TypeInductionEngine 进行类型归纳
 *
 * Version: 1.0.0
 * Created: 2025-12-18
 */

import { TypeInductionEngine } from './TypeInductionEngine';
import { TypeInductionConfig, StrategicPlaybook } from './types';

/**
 * 示例1：基本用法 - 从历史数据归纳类型
 */
export async function exampleBasicInduction(): Promise<void> {
  console.log('=== 示例1：基本类型归纳 ===');

  // 1. 创建配置
  const config: TypeInductionConfig = {
    min_samples: 3,              // 最少3个样本
    min_similarity: 0.7,         // 相似度阈值 0.7
    confidence_threshold: 0.8,   // 置信度阈值 0.8
    decay_threshold: 0.5,        // 衰退阈值 0.5
    max_new_types: 10,           // 每次最多10个新类型
    induction_interval: 24 * 60 * 60 * 1000 // 24小时
  };

  // 2. 模拟依赖服务（实际使用时需要真实实现）
  const mockLLMManager = {
    async chat(messages: any[]) {
      // 模拟 LLM 响应
      return {
        choices: [{
          message: {
            content: JSON.stringify({
              name: "快速迭代",
              keywords: ["快速", "迭代", "敏捷"],
              confidence: 0.95,
              rationale: "基于多个Playbook的共同特征：快速响应、迭代优化、敏捷调整"
            })
          }
        }]
      };
    }
  };

  const mockTypeVocabularyService = {
    async getAllTags() { return []; },
    async getTag(tagName: string) { return null; },
    async createTag(tag: any) { console.log('创建标签:', tag.tag_name); },
    async updateConfidence(tagName: string, confidence: number) {
      console.log(`更新置信度: ${tagName} -> ${confidence}`);
    },
    async markAsDecaying(tagName: string) {
      console.log(`标记衰退: ${tagName}`);
    },
    async mergeTags(sourceTag: string, targetTag: string) {
      console.log(`合并标签: ${sourceTag} -> ${targetTag}`);
    }
  };

  const mockSimilarityService = {
    async calculateSimilarity(tag1: string, tag2: string) {
      // 模拟计算标签相似度
      return Math.random() * 0.5;
    },
    async getSimilarTags(tagName: string, threshold: number) {
      return [];
    }
  };

  const mockLogger = {
    info(message: string, meta?: any) { console.log(`[INFO] ${message}`, meta || ''); },
    debug(message: string, meta?: any) { console.log(`[DEBUG] ${message}`, meta || ''); },
    warn(message: string, meta?: any) { console.log(`[WARN] ${message}`, meta || ''); },
    error(message: string, error?: any) { console.error(`[ERROR] ${message}`, error || ''); }
  };

  // 3. 创建引擎实例
  const engine = new TypeInductionEngine(
    config,
    mockLLMManager as any,
    mockTypeVocabularyService as any,
    mockSimilarityService as any,
    mockLogger
  );

  // 4. 执行类型归纳
  try {
    const results = await engine.induceTypes('historical', {
      min_samples: 5,
      min_similarity: 0.75
    });

    console.log('\n✅ 归纳结果:');
    console.log(`  - 新增类型: ${results.induced_types.length} 个`);
    console.log(`  - 合并类型: ${results.merged_types.length} 个`);
    console.log(`  - 衰退类型: ${results.deprecated_types.length} 个`);
    console.log(`  - 置信度更新: ${Object.keys(results.confidence_updates).length} 个`);

  } catch (error) {
    console.error('❌ 类型归纳失败:', error);
  }
}

/**
 * 示例2：批量处理 - 分析所有 Playbook
 */
export async function exampleBatchProcessing(): Promise<void> {
  console.log('\n=== 示例2：批量处理模式 ===');

  const config: TypeInductionConfig = {
    min_samples: 5,              // 提高样本要求
    min_similarity: 0.8,         // 提高相似度要求
    confidence_threshold: 0.9,   // 提高置信度要求
    decay_threshold: 0.6,
    max_new_types: 20,           // 允许更多新类型
    induction_interval: 7 * 24 * 60 * 60 * 1000 // 7天
  };

  // 创建引擎实例（复用示例1的服务）
  const engine = new TypeInductionEngine(
    config,
    createMockLLMManager(),
    createMockTypeVocabularyService(),
    createMockSimilarityService(),
    createMockLogger()
  );

  // 批量分析所有活跃 Playbook
  const results = await engine.induceTypes('batch', {
    max_new_types: 30
  });

  console.log('\n📊 批量分析结果:');
  console.log(`  总计新类型: ${results.induced_types.length}`);
  console.log(`  合并标签: ${results.merged_types.join(', ') || '无'}`);
  console.log(`  衰退标签: ${results.deprecated_types.join(', ') || '无'}`);

  // 显示新增类型的详细信息
  if (results.induced_types.length > 0) {
    console.log('\n📝 新增类型详情:');
    results.induced_types.forEach((type, index) => {
      console.log(`  ${index + 1}. ${type.tag_name}`);
      console.log(`     置信度: ${(type.confidence * 100).toFixed(1)}%`);
      console.log(`     样本数: ${type.sample_count}`);
      console.log(`     关键词: ${type.keywords.join(', ')}`);
      console.log(`     理由: ${type.rationale}`);
    });
  }
}

/**
 * 示例3：手动标记分析
 */
export async function exampleManualAnalysis(): Promise<void> {
  console.log('\n=== 示例3：手动标记分析 ===');

  const engine = new TypeInductionEngine(
    createDefaultConfig(),
    createMockLLMManager(),
    createMockTypeVocabularyService(),
    createMockSimilarityService(),
    createMockLogger()
  );

  // 分析用户手动标记的 Playbook
  const results = await engine.induceTypes('manual');

  console.log('🎯 手动分析结果:');
  console.log(`  处理类型: ${results.induced_types.length} 个`);

  // 针对手动分析的特殊处理
  if (results.induced_types.length > 0) {
    console.log('\n💡 建议: 手动分析结果建议人工审核');
  }
}

/**
 * 示例4：自定义配置分析
 */
export async function exampleCustomConfig(): Promise<void> {
  console.log('\n=== 示例4：自定义配置分析 ===');

  // 严格模式配置
  const strictConfig: Partial<TypeInductionConfig> = {
    min_samples: 10,             // 更高样本要求
    min_similarity: 0.85,        // 更高相似度要求
    confidence_threshold: 0.95,  // 极高置信度要求
    max_new_types: 5             // 限制新类型数量
  };

  const engine = new TypeInductionEngine(
    createDefaultConfig(),
    createMockLLMManager(),
    createMockTypeVocabularyService(),
    createMockSimilarityService(),
    createMockLogger()
  );

  const results = await engine.induceTypes('historical', strictConfig);

  console.log('🔬 严格模式分析结果:');
  console.log(`  新类型数量: ${results.induced_types.length} (严格筛选)`);
  console.log(`  平均置信度: ${
    results.induced_types.length > 0
      ? (results.induced_types.reduce((sum, t) => sum + t.confidence, 0) / results.induced_types.length * 100).toFixed(1)
      : 0
  }%`);

  // 宽松模式配置
  const relaxedConfig: Partial<TypeInductionConfig> = {
    min_samples: 2,              // 降低样本要求
    min_similarity: 0.6,         // 降低相似度要求
    confidence_threshold: 0.7,   // 降低置信度要求
    max_new_types: 50            // 允许更多新类型
  };

  console.log('\n🔄 宽松模式分析结果:');
  const relaxedResults = await engine.induceTypes('historical', relaxedConfig);
  console.log(`  新类型数量: ${relaxedResults.induced_types.length} (宽松筛选)`);
}

/**
 * 示例5：性能测试
 */
export async function examplePerformanceTest(): Promise<void> {
  console.log('\n=== 示例5：性能测试 ===');

  const engine = new TypeInductionEngine(
    createDefaultConfig(),
    createMockLLMManager(),
    createMockTypeVocabularyService(),
    createMockSimilarityService(),
    createMockLogger()
  );

  const startTime = Date.now();

  try {
    const results = await engine.induceTypes('batch');

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log('⏱️ 性能指标:');
    console.log(`  总耗时: ${duration}ms`);
    console.log(`  新类型: ${results.induced_types.length} 个`);
    console.log(`  平均每类型: ${duration / Math.max(results.induced_types.length, 1)}ms`);

    // 性能建议
    if (duration > 5000) {
      console.log('⚠️  性能建议: 考虑增加缓存或减少样本数量');
    } else {
      console.log('✅ 性能良好');
    }

  } catch (error) {
    console.error('❌ 性能测试失败:', error);
  }
}

/**
 * ========== 辅助函数 ==========
 */

function createDefaultConfig(): TypeInductionConfig {
  return {
    min_samples: 3,
    min_similarity: 0.7,
    confidence_threshold: 0.8,
    decay_threshold: 0.5,
    max_new_types: 10,
    induction_interval: 24 * 60 * 60 * 1000
  };
}

function createMockLLMManager() {
  return {
    async chat(messages: any[]) {
      // 模拟不同类型的响应
      const responses = [
        {
          name: "自动化流程",
          keywords: ["自动化", "流程", "优化"],
          confidence: 0.92,
          rationale: "基于Playbook的自动化特征识别"
        },
        {
          name: "数据驱动决策",
          keywords: ["数据", "分析", "决策"],
          confidence: 0.88,
          rationale: "基于数据处理和分析的共同模式"
        },
        {
          name: "协作优化",
          keywords: ["协作", "团队", "沟通"],
          confidence: 0.85,
          rationale: "基于团队协作和沟通的策略模式"
        }
      ];

      const randomResponse = responses[Math.floor(Math.random() * responses.length)];

      return {
        choices: [{
          message: {
            content: JSON.stringify(randomResponse)
          }
        }]
      };
    }
  };
}

function createMockTypeVocabularyService() {
  return {
    async getAllTags() {
      return [
        { tag_name: 'existing_tag1', confidence: 0.8, updated_at: Date.now() - 30 * 24 * 60 * 60 * 1000 },
        { tag_name: 'existing_tag2', confidence: 0.6, updated_at: Date.now() - 100 * 24 * 60 * 60 * 1000 }
      ];
    },
    async getTag(tagName: string) { return null; },
    async createTag(tag: any) { console.log(`  ✅ 创建类型: ${tag.tag_name}`); },
    async updateConfidence(tagName: string, confidence: number) {
      console.log(`  📈 更新置信度: ${tagName} -> ${confidence}`);
    },
    async markAsDecaying(tagName: string) {
      console.log(`  📉 标记衰退: ${tagName}`);
    },
    async mergeTags(sourceTag: string, targetTag: string) {
      console.log(`  🔄 合并标签: ${sourceTag} -> ${targetTag}`);
    }
  };
}

function createMockSimilarityService() {
  return {
    async calculateSimilarity(tag1: string, tag2: string) {
      // 模拟相似度计算
      return Math.random();
    },
    async getSimilarTags(tagName: string, threshold: number) {
      return [];
    }
  };
}

function createMockLogger() {
  return {
    info(message: string, meta?: any) { console.log(`ℹ️  ${message}`, meta || ''); },
    debug(message: string, meta?: any) { /* 静默调试信息 */ },
    warn(message: string, meta?: any) { console.warn(`⚠️  ${message}`, meta || ''); },
    error(message: string, error?: any) { console.error(`❌ ${message}`, error || ''); }
  };
}

/**
 * ========== 主函数 ==========
 */
async function main() {
  console.log('🚀 TypeInductionEngine 使用示例\n');

  try {
    await exampleBasicInduction();
    await exampleBatchProcessing();
    await exampleManualAnalysis();
    await exampleCustomConfig();
    await examplePerformanceTest();

    console.log('\n✅ 所有示例执行完成\n');

  } catch (error) {
    console.error('\n❌ 示例执行失败:', error);
  }
}

// 如果直接运行此文件，执行主函数
if (require.main === module) {
  main().catch(console.error);
}
