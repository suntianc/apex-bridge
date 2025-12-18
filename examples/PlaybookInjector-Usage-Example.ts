/**
 * PlaybookInjector 使用示例
 * =========================
 *
 * 展示如何使用 PlaybookInjector 进行提示词注入
 *
 * 运行方式：
 * npx ts-node examples/PlaybookInjector-Usage-Example.ts
 */

import { PlaybookInjector } from '../src/core/playbook/PlaybookInjector';
import { PlaybookTemplateManager } from '../src/core/playbook/PlaybookTemplateManager';
import { SystemPromptService } from '../src/services/SystemPromptService';
import { PromptTemplateService } from '../src/core/playbook/PromptTemplateService';
import { VariableEngine } from '../src/core/variable/VariableEngine';
import { logger } from '../src/utils/logger';
import { StrategicPlaybook, MatchingContext, InjectionOptions } from '../src/core/playbook/types';

// 示例 Playbook
const samplePlaybook: StrategicPlaybook = {
  id: 'pb-001',
  name: '技术方案设计流程',
  description: '指导技术方案的完整设计流程，包括需求分析、架构设计、技术选型等关键步骤',
  version: '1.0.0',
  status: 'active',
  context: {
    domain: '技术咨询',
    scenario: '设计技术方案',
    complexity: 'high',
    stakeholders: ['技术专家', '项目经理', '客户']
  },
  trigger: {
    type: 'manual',
    condition: '用户请求技术方案设计'
  },
  actions: [
    {
      step: 1,
      description: '需求分析 - 深入理解客户需求',
      expectedOutcome: '明确需求范围、功能要求、非功能需求'
    },
    {
      step: 2,
      description: '技术调研 - 调研相关技术和工具',
      expectedOutcome: '确定可行的技术方案列表'
    },
    {
      step: 3,
      description: '架构设计 - 设计系统架构',
      expectedOutcome: '输出系统架构图和设计文档'
    }
  ],
  sourceLearningIds: [],
  createdAt: Date.now() - 86400000, // 1天前
  lastUpdated: Date.now() - 3600000, // 1小时前
  lastOptimized: Date.now() - 7200000, // 2小时前
  metrics: {
    usageCount: 25,
    successRate: 0.92,
    avgSatisfaction: 0.88,
    lastUsed: Date.now() - 1800000, // 30分钟前
    avgExecutionTime: 120000 // 2分钟
  },
  optimizationCount: 3,
  tags: ['技术设计', '架构', '流程'],
  type_tags: ['technical_design', 'architecture', 'process'],
  type_confidence: {
    'technical_design': 0.95,
    'architecture': 0.90,
    'process': 0.85
  },
  author: '张工程师',
  reviewers: ['李架构师', '王技术总监'],
  guidance_level: 'medium'
};

// 示例匹配上下文
const matchingContext: MatchingContext = {
  userQuery: '我需要设计一个电商平台的技术方案，包括用户管理、商品管理、订单处理等功能',
  domain: '技术咨询',
  scenario: '电商平台设计',
  complexity: 'high',
  metadata: {
    client: '某大型零售企业',
    timeline: '3个月',
    budget: '充足'
  }
};

/**
 * 示例1: 基本注入流程
 */
async function basicInjectionExample() {
  console.log('\n========== 示例1: 基本注入流程 ==========');

  try {
    // 1. 初始化依赖服务
    const variableEngine = new VariableEngine();
    const promptTemplateService = new PromptTemplateService();
    const templateManager = new PlaybookTemplateManager(
      promptTemplateService,
      variableEngine,
      logger
    );
    const systemPromptService = new SystemPromptService();

    // 2. 创建注入器
    const injector = new PlaybookInjector(
      templateManager,
      systemPromptService,
      logger
    );

    // 3. 配置注入选项
    const options: InjectionOptions = {
      guidance_level: 'medium',
      fallback_enabled: true,
      max_retry: 2
    };

    // 4. 执行注入
    const result = await injector.injectGuidance(
      samplePlaybook,
      matchingContext,
      options
    );

    // 5. 输出结果
    console.log('注入结果:');
    console.log(`  成功: ${result.success}`);
    console.log(`  指导已应用: ${result.guidance_applied}`);
    console.log(`  触发回退: ${result.fallback_triggered}`);
    console.log(`  原因: ${result.reason || 'N/A'}`);
    console.log(`\n注入内容预览:\n${result.injected_content.substring(0, 200)}...`);

    // 6. 查看统计信息
    const stats = injector.getStats();
    console.log('\n统计信息:');
    console.log(`  总注入次数: ${stats.totalInjections}`);
    console.log(`  成功次数: ${stats.successfulInjections}`);
    console.log(`  失败次数: ${stats.failedInjections}`);
    console.log(`  平均Token数: ${stats.averageTokenCount}`);

  } catch (error) {
    console.error('注入失败:', error);
  }
}

/**
 * 示例2: 不同注入强度的对比
 */
async function guidanceLevelComparisonExample() {
  console.log('\n========== 示例2: 不同注入强度对比 ==========');

  const levels: Array<'light' | 'medium' | 'intensive'> = ['light', 'medium', 'intensive'];

  const variableEngine = new VariableEngine();
  const promptTemplateService = new PromptTemplateService();
  const templateManager = new PlaybookTemplateManager(
    promptTemplateService,
    variableEngine,
    logger
  );

  for (const level of levels) {
    console.log(`\n--- 注入强度: ${level} ---`);

    const systemPromptService = new SystemPromptService();
    const injector = new PlaybookInjector(
      templateManager,
      systemPromptService,
      logger
    );

    const result = await injector.injectGuidance(
      samplePlaybook,
      matchingContext,
      {
        guidance_level: level,
        fallback_enabled: true
      }
    );

    console.log(`注入点: ${injector.determineInjectionPoint(level)}`);
    console.log(`注入内容长度: ${result.injected_content.length} 字符`);
    console.log(`内容预览:\n${result.injected_content.substring(0, 150)}...`);
  }
}

/**
 * 示例3: 多 Playbook 同时注入
 */
async function multiplePlaybooksExample() {
  console.log('\n========== 示例3: 多 Playbook 同时注入 ==========');

  // 创建多个 Playbook
  const playbooks: StrategicPlaybook[] = [
    samplePlaybook,
    {
      ...samplePlaybook,
      id: 'pb-002',
      name: '代码审查流程',
      description: '规范的代码审查流程，确保代码质量',
      type_tags: ['code_review', 'quality'],
      guidance_level: 'light'
    },
    {
      ...samplePlaybook,
      id: 'pb-003',
      name: '项目管理流程',
      description: '敏捷项目管理的完整流程',
      type_tags: ['project_management', 'agile'],
      guidance_level: 'intensive'
    }
  ];

  const variableEngine = new VariableEngine();
  const promptTemplateService = new PromptTemplateService();
  const templateManager = new PlaybookTemplateManager(
    promptTemplateService,
    variableEngine,
    logger
  );
  const systemPromptService = new SystemPromptService();

  const injector = new PlaybookInjector(
    templateManager,
    systemPromptService,
    logger
  );

  const results = await injector.injectMultiplePlaybooks(
    playbooks,
    matchingContext,
    {
      guidance_level: 'medium',
      max_playbooks: 3,
      fallback_enabled: true
    }
  );

  console.log(`\n注入结果: ${results.length} 个 Playbook`);
  results.forEach((result, index) => {
    console.log(`\n[${index + 1}] 成功: ${result.success}, 内容长度: ${result.injected_content.length}`);
  });

  // 查看冲突处理后的结果
  const stats = injector.getStats();
  console.log('\n冲突处理统计:');
  console.log(`  总注入次数: ${stats.totalInjections}`);
  console.log(`  实际执行次数: ${results.length}`);
}

/**
 * 示例4: 自定义注入点
 */
async function customInjectionPointExample() {
  console.log('\n========== 示例4: 自定义注入点 ==========');

  const injectionPoints: Array<'system_prompt' | 'user_message' | 'thinking_chain'> =
    ['system_prompt', 'user_message', 'thinking_chain'];

  const variableEngine = new VariableEngine();
  const promptTemplateService = new PromptTemplateService();
  const templateManager = new PlaybookTemplateManager(
    promptTemplateService,
    variableEngine,
    logger
  );

  for (const point of injectionPoints) {
    console.log(`\n--- 注入点: ${point} ---`);

    const systemPromptService = new SystemPromptService();
    const injector = new PlaybookInjector(
      templateManager,
      systemPromptService,
      logger
    );

    const result = await injector.injectGuidance(
      samplePlaybook,
      matchingContext,
      {
        guidance_level: 'medium',
        injection_point: point,
        fallback_enabled: true
      }
    );

    console.log(`注入成功: ${result.success}`);
    console.log(`内容类型: ${result.injected_content.includes('## Playbook 指导') ? '系统提示词' :
      result.injected_content.includes('【任务指导') ? '用户消息' : '思考链'}`);
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('PlaybookInjector 使用示例');
  console.log('='.repeat(50));

  try {
    await basicInjectionExample();
    await guidanceLevelComparisonExample();
    await multiplePlaybooksExample();
    await customInjectionPointExample();

    console.log('\n' + '='.repeat(50));
    console.log('所有示例执行完成!');

  } catch (error) {
    console.error('\n示例执行失败:', error);
    process.exit(1);
  }
}

// 运行示例
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export {
  basicInjectionExample,
  guidanceLevelComparisonExample,
  multiplePlaybooksExample,
  customInjectionPointExample,
  samplePlaybook,
  matchingContext
};
