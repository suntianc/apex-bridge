/**
 * PlaybookTemplateManager Usage Examples
 * ======================================
 *
 * This file contains practical examples of how to use PlaybookTemplateManager
 * with different scenarios and configurations.
 *
 * Version: 1.0.0
 * Created: 2025-12-18
 */

import Database from 'better-sqlite3';
import { VariableEngine } from '../variable/VariableEngine';
import { PromptTemplateService, PlaybookTemplateManager } from './index';
import { StrategicPlaybook, MatchingContext } from './types';

// Simple logger interface
interface SimpleLogger {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
}

// Example logger (replace with your actual logger implementation)
const logger: SimpleLogger = {
  debug: (msg: string) => console.log(`[DEBUG] ${msg}`),
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.log(`[WARN] ${msg}`),
  error: (msg: string) => console.log(`[ERROR] ${msg}`)
};

// Example 1: Basic Setup and Usage
export async function basicUsageExample() {
  console.log('\n=== Example 1: Basic Setup and Usage ===\n');

  // 1. Initialize database
  const db = new Database('data/playbook_templates.db');
  db.pragma('journal_mode = WAL');

  // 2. Initialize services
  const variableEngine = new VariableEngine({
    enableCache: true,
    cacheTtlMs: 30000
  });

  const promptTemplateService = new PromptTemplateService(db, logger);
  const templateManager = new PlaybookTemplateManager(
    promptTemplateService,
    variableEngine,
    logger
  );

  // 3. Create default templates
  templateManager.createDefaultTemplates();

  // 4. Get a playbook (mock data)
  const playbook: StrategicPlaybook = {
    id: 'pb_001',
    name: '快速需求分析流程',
    description: '用于快速理解用户需求并制定解决方案的方法',
    type: 'problem_solving',
    version: '1.0.0',
    status: 'active',
    context: {
      domain: '产品管理',
      scenario: '需求收集与分析',
      complexity: 'medium',
      stakeholders: ['产品经理', '开发团队', '用户']
    },
    trigger: {
      type: 'user_query',
      condition: '用户询问需求分析方法'
    },
    actions: [
      {
        step: 1,
        description: '明确用户的核心业务目标',
        expectedOutcome: '获得清晰的目标陈述',
        resources: ['访谈指南', '目标模板']
      },
      {
        step: 2,
        description: '识别关键利益相关者',
        expectedOutcome: '列出所有相关方及其需求',
        resources: ['利益相关者矩阵']
      },
      {
        step: 3,
        description: '分析需求优先级',
        expectedOutcome: '形成优先级排序列表',
        resources: ['MoSCoW方法', 'KANO模型']
      }
    ],
    sourceLearningIds: ['learning_001', 'learning_002'],
    createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
    lastUpdated: Date.now(),
    lastOptimized: Date.now(),
    metrics: {
      usageCount: 15,
      successRate: 0.87,
      avgSatisfaction: 8.5,
      lastUsed: Date.now() - 2 * 24 * 60 * 60 * 1000,
      avgExecutionTime: 1800000
    },
    optimizationCount: 3,
    tags: ['需求分析', '产品管理', '敏捷开发'],
    author: '张产品',
    reviewers: ['李总监', '王架构'],
    type_tags: ['rapid_analysis', 'product_management'],
    type_confidence: {
      rapid_analysis: 0.92,
      product_management: 0.88
    },
    prompt_template_id: 'default_guidance_zh',
    guidance_level: 'medium'
  };

  // 5. Render template
  const renderResult = await templateManager.renderTemplate(
    'default_guidance_zh',
    playbook,
    {
      variables: {
        current_date: new Date().toLocaleDateString('zh-CN')
      },
      guidance_level: 'medium',
      language: 'zh',
      tone: 'professional',
      max_length: 1500
    }
  );

  console.log('Rendered Template:');
  console.log('-----------------');
  console.log(renderResult.content);
  console.log('\nMetadata:');
  console.log(`- Variables used: ${renderResult.variables_used.join(', ')}`);
  console.log(`- Token count: ${renderResult.token_count}`);

  // 6. Close resources
  promptTemplateService.close();
  db.close();
}

// Example 2: Intelligent Template Selection
export async function intelligentSelectionExample() {
  console.log('\n=== Example 2: Intelligent Template Selection ===\n');

  const db = new Database('data/playbook_templates.db');
  db.pragma('journal_mode = WAL');

  const variableEngine = new VariableEngine();
  const promptTemplateService = new PromptTemplateService(db, logger);
  const templateManager = new PlaybookTemplateManager(
    promptTemplateService,
    variableEngine,
    logger
  );

  // Create custom templates
  const customTemplate: StrategicPlaybook = {
    id: 'pb_002',
    name: '代码审查最佳实践',
    description: '确保代码质量和团队协作的审查流程',
    type: 'problem_solving',
    version: '1.0.0',
    status: 'active',
    context: {
      domain: '软件开发',
      scenario: '代码质量控制',
      complexity: 'high',
      stakeholders: ['开发工程师', '技术主管', '架构师']
    },
    trigger: {
      type: 'pr_created',
      condition: 'Pull Request创建时自动触发'
    },
    actions: [
      {
        step: 1,
        description: '检查代码规范和风格',
        expectedOutcome: '符合团队编码标准',
        resources: ['编码规范文档']
      },
      {
        step: 2,
        description: '验证测试覆盖率',
        expectedOutcome: '关键路径有测试保护',
        resources: ['测试框架']
      }
    ],
    guidance_steps: [
      {
        id: 'step_1',
        description: '检查代码规范和风格',
        expected_outcome: '符合团队编码标准',
        key_points: ['命名规范', '注释完整性', '格式化'],
        cautions: ['不要过度格式化', '关注业务逻辑']
      },
      {
        id: 'step_2',
        description: '验证测试覆盖率',
        expected_outcome: '关键路径有测试保护',
        key_points: ['单元测试', '集成测试', '边界条件'],
        cautions: ['测试不是为了100%覆盖率', '关注测试质量']
      }
    ],
    sourceLearningIds: [],
    createdAt: Date.now(),
    lastUpdated: Date.now(),
    lastOptimized: Date.now(),
    metrics: {
      usageCount: 42,
      successRate: 0.91,
      avgSatisfaction: 8.8,
      lastUsed: Date.now(),
      avgExecutionTime: 900000
    },
    optimizationCount: 5,
    tags: ['代码审查', '质量控制'],
    author: '王架构',
    reviewers: ['张技术'],
    type_tags: ['code_review', 'quality_control'],
    type_confidence: {
      code_review: 0.95,
      quality_control: 0.89
    },
    guidance_level: 'intensive'
  };

  const matchingContext: MatchingContext = {
    userQuery: '如何进行有效的代码审查？',
    domain: '软件开发',
    scenario: '代码质量控制',
    complexity: 'high'
  };

  // Select best template
  const bestTemplate = await templateManager.selectBestTemplate(
    customTemplate,
    matchingContext,
    {
      guidance_level: 'intensive',
      language: 'zh',
      tone: 'professional',
      min_effectiveness: 0.7
    }
  );

  if (bestTemplate) {
    console.log('Selected Template:');
    console.log(`- ID: ${bestTemplate.template_id}`);
    console.log(`- Name: ${bestTemplate.name}`);
    console.log(`- Type: ${bestTemplate.template_type}`);
    console.log(`- Effectiveness: ${(bestTemplate.effectiveness_score! * 100).toFixed(1)}%`);
    console.log(`- Usage Count: ${bestTemplate.usage_count}`);
  } else {
    console.log('No suitable template found');
  }

  promptTemplateService.close();
  db.close();
}

// Example 3: Template Effectiveness Evaluation
export async function effectivenessEvaluationExample() {
  console.log('\n=== Example 3: Template Effectiveness Evaluation ===\n');

  const db = new Database('data/playbook_templates.db');
  db.pragma('journal_mode = WAL');

  const variableEngine = new VariableEngine();
  const promptTemplateService = new PromptTemplateService(db, logger);
  const templateManager = new PlaybookTemplateManager(
    promptTemplateService,
    variableEngine,
    logger
  );

  const templateId = 'default_guidance_zh';

  // Simulate multiple usage evaluations
  const evaluations = [
    { success: true, satisfaction: 9, response_time: 2500 },
    { success: true, satisfaction: 8, response_time: 2200 },
    { success: false, satisfaction: 6, response_time: 3500 },
    { success: true, satisfaction: 9, response_time: 2100 },
    { success: true, satisfaction: 8, response_time: 2400 }
  ];

  console.log('Simulating template usage evaluations...\n');

  for (const evaluation of evaluations) {
    await templateManager.evaluateTemplate(templateId, evaluation);
    console.log(`✓ Evaluated: success=${evaluation.success}, satisfaction=${evaluation.satisfaction}`);
  }

  // Get updated effectiveness metrics
  const effectiveness = templateManager.getTemplateEffectiveness(templateId);

  if (effectiveness) {
    console.log('\nEffectiveness Metrics:');
    console.log('---------------------');
    console.log(`- Total Usage Count: ${effectiveness.usage_count}`);
    console.log(`- Average Satisfaction: ${effectiveness.avg_satisfaction.toFixed(2)}/10`);
    console.log(`- Success Rate: ${(effectiveness.success_rate * 100).toFixed(1)}%`);
    console.log(`- Average Response Time: ${effectiveness.avg_response_time.toFixed(0)}ms`);
    console.log(`- Last Evaluated: ${new Date(effectiveness.last_evaluated).toLocaleString()}`);
  }

  promptTemplateService.close();
  db.close();
}

// Example 4: Multi-Language and Tone Support
export async function multiLanguageToneExample() {
  console.log('\n=== Example 4: Multi-Language and Tone Support ===\n');

  const db = new Database('data/playbook_templates.db');
  db.pragma('journal_mode = WAL');

  const variableEngine = new VariableEngine();
  const promptTemplateService = new PromptTemplateService(db, logger);
  const templateManager = new PlaybookTemplateManager(
    promptTemplateService,
    variableEngine,
    logger
  );

  const playbook: StrategicPlaybook = {
    id: 'pb_003',
    name: '用户访谈指南',
    description: '指导如何进行有效的用户访谈以收集反馈',
    type: 'problem_solving',
    version: '1.0.0',
    status: 'active',
    context: {
      domain: '用户体验研究',
      scenario: '用户访谈',
      complexity: 'medium',
      stakeholders: ['UX研究员', '产品经理']
    },
    trigger: {
      type: 'user_feedback',
      condition: '需要收集用户反馈时'
    },
    actions: [
      {
        step: 1,
        description: '准备访谈大纲和关键问题',
        expectedOutcome: '清晰的访谈流程',
        resources: ['访谈指南', '问题列表']
      }
    ],
    guidance_steps: [
      {
        id: 'step_1',
        description: '准备访谈大纲和关键问题',
        expected_outcome: '清晰的访谈流程',
        key_points: ['开场白', '核心问题', '结束语'],
        cautions: ['避免引导性问题', '保持中立']
      }
    ],
    sourceLearningIds: [],
    createdAt: Date.now(),
    lastUpdated: Date.now(),
    lastOptimized: Date.now(),
    metrics: {
      usageCount: 0,
      successRate: 0,
      avgSatisfaction: 0,
      lastUsed: 0,
      avgExecutionTime: 0
    },
    optimizationCount: 0,
    tags: ['用户研究', '访谈'],
    author: '刘研究员',
    reviewers: ['陈总监'],
    type_tags: ['user_research'],
    type_confidence: {
      user_research: 0.9
    },
    guidance_level: 'medium'
  };

  const scenarios: Array<{ language: 'zh' | 'en', tone: 'professional' | 'friendly' | 'concise' }> = [
    { language: 'zh', tone: 'professional' },
    { language: 'zh', tone: 'friendly' },
    { language: 'zh', tone: 'concise' },
    { language: 'en', tone: 'professional' }
  ];

  for (const scenario of scenarios) {
    const result = await templateManager.renderTemplate(
      'default_guidance_zh',
      playbook,
      {
        variables: {},
        guidance_level: 'medium',
        language: scenario.language,
        tone: scenario.tone,
        max_length: 800
      }
    );

    console.log(`\n--- ${scenario.language.toUpperCase()} + ${scenario.tone.toUpperCase()} ---`);
    console.log(result.content);
  }

  promptTemplateService.close();
  db.close();
}

// Example 5: Template Management Operations
export async function templateManagementExample() {
  console.log('\n=== Example 5: Template Management Operations ===\n');

  const db = new Database('data/playbook_templates.db');
  db.pragma('journal_mode = WAL');

  const variableEngine = new VariableEngine();
  const promptTemplateService = new PromptTemplateService(db, logger);
  const templateManager = new PlaybookTemplateManager(
    promptTemplateService,
    variableEngine,
    logger
  );

  // 1. Get all templates
  console.log('1. All Templates:');
  const allTemplates = templateManager.getAllTemplates();
  allTemplates.forEach(t => {
    console.log(`   - ${t.name} (${t.template_id})`);
  });

  // 2. Search templates by criteria
  console.log('\n2. Search by Type (guidance):');
  const guidanceTemplates = templateManager.searchTemplates({
    template_type: 'guidance'
  });
  guidanceTemplates.forEach(t => {
    console.log(`   - ${t.name}`);
  });

  // 3. Get templates by tags
  console.log('\n3. Get by Tags ([concise, quick]):');
  const taggedTemplates = templateManager.getTemplatesByTags(['concise', 'quick']);
  taggedTemplates.forEach(t => {
    console.log(`   - ${t.name}`);
  });

  // 4. Get top templates
  console.log('\n4. Top 3 Templates by Effectiveness:');
  const topTemplates = templateManager.getTopTemplates(3);
  topTemplates.forEach((t, i) => {
    console.log(`   ${i + 1}. ${t.name} (${(t.effectiveness_score! * 100).toFixed(1)}%)`);
  });

  // 5. Get template by ID
  console.log('\n5. Get Template by ID:');
  const template = templateManager.getTemplate('default_guidance_zh');
  if (template) {
    console.log(`   - Name: ${template.name}`);
    console.log(`   - Content preview: ${template.content.substring(0, 100)}...`);
  }

  promptTemplateService.close();
  db.close();
}

// Main execution function
export async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  PlaybookTemplateManager Usage Examples                ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  try {
    await basicUsageExample();
    await intelligentSelectionExample();
    await effectivenessEvaluationExample();
    await multiLanguageToneExample();
    await templateManagementExample();

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  All Examples Completed Successfully! ✓               ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n❌ Error running examples:', error);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}
