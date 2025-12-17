/**
 * Stage 3.5: Playbook 强制执行测试
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { PlaybookExecutor } from '../../src/services/PlaybookExecutor';
import { PlaybookManager } from '../../src/services/PlaybookManager';
import { ExecutionContext, PlaybookPlan } from '../../src/types/playbook-execution';
import { StrategicPlaybook } from '../../src/types/playbook';

// Mock LLMManager
const mockLLMManager = {
  chat: jest.fn()
} as any;

// Mock ToolDispatcher
const mockToolDispatcher = {
  dispatch: jest.fn()
} as any;

describe('Stage 3.5: Playbook Forced Execution', () => {
  let executor: PlaybookExecutor;

  beforeAll(() => {
    executor = new PlaybookExecutor(mockToolDispatcher, mockLLMManager);
  });

  describe('PlaybookExecutor', () => {
    it('场景1: 将 Playbook 转换为 Plan 对象', () => {
      const playbook: StrategicPlaybook = {
        id: 'pb-test-001',
        name: '用户反馈分析',
        description: '分析用户反馈并分类',
        type: 'problem_solving',
        version: '1.0.0',
        status: 'active',
        context: {
          domain: 'customer_service',
          scenario: 'feedback_analysis',
          complexity: 'medium',
          stakeholders: ['support', 'product']
        },
        trigger: {
          type: 'event',
          condition: '用户提交反馈'
        },
        actions: [
          {
            step: 1,
            description: '调用 feedback-analyzer',
            expectedOutcome: '分析反馈内容',
            resources: ['feedback-analyzer']
          },
          {
            step: 2,
            description: '分类问题',
            expectedOutcome: '问题分类结果',
            resources: ['llm-classifier']
          }
        ],
        metrics: {
          successRate: 0.85,
          usageCount: 10,
          averageOutcome: 8,
          lastUsed: Date.now(),
          timeToResolution: 5000,
          userSatisfaction: 8.5
        },
        sourceLearningIds: [],
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        lastOptimized: Date.now(),
        optimizationCount: 0,
        tags: ['feedback', 'analysis'],
        author: 'test',
        reviewers: []
      };

      const plan = executor.convertPlaybookToPlan(playbook);

      expect(plan.playbook_id).toBe(playbook.id);
      expect(plan.playbook_name).toBe(playbook.name);
      expect(plan.confidence).toBe(0.85);
      expect(plan.steps.length).toBe(2);
      expect(plan.steps[0].step_number).toBe(1);
      expect(plan.steps[0].description).toBe('调用 feedback-analyzer');
      expect(plan.steps[0].action_type).toBe('llm_prompt');
      expect(plan.fallback_strategy).toBe('revert-to-react');
    });

    it('场景2: 占位符解析正确', async () => {
      const context: ExecutionContext = {
        messages: [{ role: 'user', content: '测试输入' }],
        options: {},
        intermediate_results: new Map([[1, 'Step 1 output']])
      };

      const template = '基于 {step_1_result} 生成报告';
      const resolved = (executor as any).resolvePromptTemplate(template, context);

      expect(resolved).toContain('Step 1 output');
    });

    it('场景3: 验证步骤输出', () => {
      const step = {
        step_number: 1,
        description: 'test step',
        action_type: 'llm_prompt' as const,
        anti_patterns: []
      };

      // Valid output
      expect((executor as any).validateStepOutput('valid output', step)).toBe(true);
      expect((executor as any).validateStepOutput({ data: 'value' }, step)).toBe(true);

      // Invalid output
      expect((executor as any).validateStepOutput('', step)).toBe(false);
      expect((executor as any).validateStepOutput('   ', step)).toBe(false);
      expect((executor as any).validateStepOutput(null, step)).toBe(false);
      expect((executor as any).validateStepOutput(undefined, step)).toBe(false);
    });
  });
});
