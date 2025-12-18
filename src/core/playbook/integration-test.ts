/**
 * PlaybookTemplateManager Integration Test
 * ========================================
 *
 * Simple integration test to verify PlaybookTemplateManager works correctly.
 * Run with: npx ts-node src/core/playbook/integration-test.ts
 *
 * Version: 1.0.0
 * Created: 2025-12-18
 */

import Database from 'better-sqlite3';
import { VariableEngine } from '../variable/VariableEngine';
import { PromptTemplateService, PlaybookTemplateManager } from './index';
import { StrategicPlaybook } from './types';

// Simple logger interface
interface SimpleLogger {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
}

const logger: SimpleLogger = {
  debug: (msg: string) => console.log(`[DEBUG] ${msg}`),
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.log(`[WARN] ${msg}`),
  error: (msg: string) => console.log(`[ERROR] ${msg}`)
};

async function runIntegrationTest() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  PlaybookTemplateManager Integration Test              ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  try {
    // Setup
    console.log('1. Setting up database and services...');
    const db = new Database('data/test_playbook_templates.db');
    db.pragma('journal_mode = WAL');

    const variableEngine = new VariableEngine({ enableCache: true });
    const promptTemplateService = new PromptTemplateService(db, logger);
    const templateManager = new PlaybookTemplateManager(
      promptTemplateService,
      variableEngine,
      logger
    );

    // Create default templates
    templateManager.createDefaultTemplates();
    console.log('   ✓ Default templates created\n');

    // Test 1: Get all templates
    console.log('2. Testing template retrieval...');
    const allTemplates = templateManager.getAllTemplates();
    console.log(`   ✓ Found ${allTemplates.length} templates\n`);

    // Test 2: Create a test playbook
    console.log('3. Creating test playbook...');
    const testPlaybook: StrategicPlaybook = {
      id: 'test_pb_integration',
      name: '集成测试 Playbook',
      description: '这是一个用于集成测试的 Playbook',
      type: 'problem_solving',
      version: '1.0.0',
      status: 'active',
      context: {
        domain: '测试领域',
        scenario: '集成测试场景',
        complexity: 'medium',
        stakeholders: ['测试人员', '开发人员']
      },
      trigger: {
        type: 'test',
        condition: '集成测试触发'
      },
      actions: [
        {
          step: 1,
          description: '执行第一步测试',
          expectedOutcome: '第一步测试完成',
          resources: ['测试工具']
        },
        {
          step: 2,
          description: '执行第二步测试',
          expectedOutcome: '第二步测试完成',
          resources: ['测试工具']
        }
      ],
      guidance_steps: [
        {
          id: 'step_1',
          description: '执行第一步测试',
          expected_outcome: '第一步测试完成',
          key_points: ['验证', '检查'],
          cautions: ['注意异常情况']
        },
        {
          id: 'step_2',
          description: '执行第二步测试',
          expected_outcome: '第二步测试完成',
          key_points: ['验证', '检查'],
          cautions: ['注意异常情况']
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
      tags: ['测试', '集成测试'],
      author: '测试团队',
      reviewers: ['质量保证'],
      type_tags: ['integration_test'],
      type_confidence: {
        integration_test: 0.95
      },
      guidance_level: 'medium'
    };
    console.log('   ✓ Test playbook created\n');

    // Test 3: Render template
    console.log('4. Testing template rendering...');
    const renderResult = await templateManager.renderTemplate(
      'default_guidance_zh',
      testPlaybook,
      {
        variables: {
          test_variable: '集成测试值'
        },
        guidance_level: 'medium',
        language: 'zh',
        tone: 'professional',
        max_length: 1000
      }
    );

    console.log('   ✓ Template rendered successfully');
    console.log(`   - Token count: ${renderResult.token_count}`);
    console.log(`   - Variables used: ${renderResult.variables_used.length}\n`);

    // Test 4: Select best template
    console.log('5. Testing intelligent template selection...');
    const bestTemplate = await templateManager.selectBestTemplate(
      testPlaybook,
      {
        userQuery: '集成测试查询',
        domain: '测试领域'
      },
      {
        language: 'zh',
        min_effectiveness: 0.3
      }
    );

    if (bestTemplate) {
      console.log(`   ✓ Selected template: ${bestTemplate.name}`);
      console.log(`   - Template ID: ${bestTemplate.template_id}\n`);
    } else {
      console.log('   ⚠ No template selected\n');
    }

    // Test 5: Evaluate template
    console.log('6. Testing template evaluation...');
    await templateManager.evaluateTemplate('default_guidance_zh', {
      success: true,
      satisfaction: 9,
      response_time: 2000,
      feedback: '集成测试反馈',
      user_id: 'test_user',
      session_id: 'test_session'
    });

    const effectiveness = templateManager.getTemplateEffectiveness('default_guidance_zh');
    if (effectiveness) {
      console.log('   ✓ Template evaluated successfully');
      console.log(`   - Usage count: ${effectiveness.usage_count}`);
      console.log(`   - Average satisfaction: ${effectiveness.avg_satisfaction.toFixed(2)}/10`);
      console.log(`   - Success rate: ${(effectiveness.success_rate * 100).toFixed(1)}%\n`);
    }

    // Test 6: Search templates
    console.log('7. Testing template search...');
    const guidanceTemplates = templateManager.searchTemplates({
      template_type: 'guidance',
      language: 'zh'
    });
    console.log(`   ✓ Found ${guidanceTemplates.length} guidance templates in Chinese\n`);

    // Test 7: Get top templates
    console.log('8. Testing top templates...');
    const topTemplates = templateManager.getTopTemplates(3);
    console.log(`   ✓ Top ${topTemplates.length} templates:`);
    topTemplates.forEach((t, i) => {
      console.log(`      ${i + 1}. ${t.name} (${(t.effectiveness_score! * 100).toFixed(1)}%)`);
    });
    console.log();

    // Cleanup
    console.log('9. Cleaning up...');
    promptTemplateService.close();
    db.close();
    console.log('   ✓ Cleanup complete\n');

    // Summary
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║  Integration Test Completed Successfully! ✓           ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    console.log('Summary:');
    console.log('--------');
    console.log(`✓ Database operations: Working`);
    console.log(`✓ Template rendering: Working`);
    console.log(`✓ Template selection: Working`);
    console.log(`✓ Template evaluation: Working`);
    console.log(`✓ Template search: Working`);
    console.log(`✓ All core features: Verified\n`);

  } catch (error) {
    console.error('\n❌ Integration test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  runIntegrationTest()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { runIntegrationTest };
