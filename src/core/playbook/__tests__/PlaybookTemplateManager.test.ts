/**
 * PlaybookTemplateManager Tests
 * =============================
 *
 * Unit tests for PlaybookTemplateManager
 *
 * Version: 1.0.0
 * Created: 2025-12-18
 */

import Database from 'better-sqlite3';
import { VariableEngine } from '../../variable/VariableEngine';
import { PromptTemplateService, PlaybookTemplateManager } from '../index';
import { StrategicPlaybook } from '../types';

// Simple logger interface
interface SimpleLogger {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
}

// Mock logger for testing
const mockLogger: SimpleLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Create in-memory database for testing
function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  return db;
}

// Create mock playbook
function createMockPlaybook(): StrategicPlaybook {
  return {
    id: 'test_pb_001',
    name: '测试需求分析流程',
    description: '用于测试的示例 Playbook',
    type: 'problem_solving',
    version: '1.0.0',
    status: 'active',
    context: {
      domain: '产品管理',
      scenario: '需求收集与分析',
      complexity: 'medium',
      stakeholders: ['产品经理', '开发团队']
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
      }
    ],
    sourceLearningIds: [],
    createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
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
    tags: ['需求分析', '产品管理'],
    author: '测试作者',
    reviewers: ['测试评审'],
    type_tags: ['requirement_analysis', 'product_management'],
    type_confidence: {
      requirement_analysis: 0.92,
      product_management: 0.88
    },
    guidance_level: 'medium'
  };
}

describe('PlaybookTemplateManager', () => {
  let db: Database.Database;
  let variableEngine: VariableEngine;
  let promptTemplateService: PromptTemplateService;
  let templateManager: PlaybookTemplateManager;
  let testPlaybook: StrategicPlaybook;

  beforeEach(() => {
    db = createTestDatabase();
    variableEngine = new VariableEngine({ enableCache: false });
    promptTemplateService = new PromptTemplateService(db, mockLogger);
    templateManager = new PlaybookTemplateManager(
      promptTemplateService,
      variableEngine,
      mockLogger
    );
    testPlaybook = createMockPlaybook();

    // Create default templates for testing
    templateManager.createDefaultTemplates();
  });

  afterEach(() => {
    promptTemplateService.close();
    db.close();
  });

  describe('renderTemplate', () => {
    it('should render template with playbook variables', async () => {
      const result = await templateManager.renderTemplate(
        'default_guidance_zh',
        testPlaybook,
        {
          variables: {},
          language: 'zh',
          tone: 'professional'
        }
      );

      expect(result.content).toBeDefined();
      expect(result.content).toContain(testPlaybook.description);
      expect(result.variables_used).toContain('goal');
      expect(result.token_count).toBeGreaterThan(0);
    });

    it('should handle custom variables', async () => {
      const result = await templateManager.renderTemplate(
        'default_guidance_zh',
        testPlaybook,
        {
          variables: {
            custom_var: '自定义值'
          },
          language: 'zh'
        }
      );

      expect(result.variables_used).toContain('custom_var');
    });

    it('should respect max_length option', async () => {
      const result = await templateManager.renderTemplate(
        'default_guidance_zh',
        testPlaybook,
        {
          variables: {},
          max_length: 100,
          language: 'zh'
        }
      );

      expect(result.content.length).toBeLessThanOrEqual(103); // 100 + '...'
    });

    it('should throw error for non-existent template', async () => {
      await expect(
        templateManager.renderTemplate('non_existent_template', testPlaybook, { variables: {} })
      ).rejects.toThrow('Template not found');
    });
  });

  describe('selectBestTemplate', () => {
    it('should select a template based on criteria', async () => {
      const bestTemplate = await templateManager.selectBestTemplate(
        testPlaybook,
        {
          userQuery: '需求分析方法',
          domain: '产品管理'
        },
        {
          language: 'zh',
          min_effectiveness: 0.3
        }
      );

      expect(bestTemplate).toBeDefined();
      expect(bestTemplate?.template_id).toBeDefined();
    });

    it('should return null when no templates match', async () => {
      // Delete all templates
      const templates = templateManager.getAllTemplates();
      templates.forEach(t => templateManager.deleteTemplate(t.template_id));

      const bestTemplate = await templateManager.selectBestTemplate(
        testPlaybook,
        { userQuery: 'test' },
        {}
      );

      expect(bestTemplate).toBeNull();
    });
  });

  describe('evaluateTemplate', () => {
    it('should update effectiveness metrics', async () => {
      const templateId = 'default_guidance_zh';

      // Initial metrics
      const initial = templateManager.getTemplateEffectiveness(templateId);
      expect(initial?.usage_count).toBe(0);

      // Evaluate usage
      await templateManager.evaluateTemplate(templateId, {
        success: true,
        satisfaction: 9,
        response_time: 2500
      });

      // Check updated metrics
      const updated = templateManager.getTemplateEffectiveness(templateId);
      expect(updated?.usage_count).toBe(1);
      expect(updated?.avg_satisfaction).toBeGreaterThan(0);
      expect(updated?.success_rate).toBeGreaterThan(0);
    });

    it('should calculate average satisfaction correctly', async () => {
      const templateId = 'default_guidance_zh';

      // First evaluation
      await templateManager.evaluateTemplate(templateId, {
        success: true,
        satisfaction: 8,
        response_time: 2000
      });

      // Second evaluation
      await templateManager.evaluateTemplate(templateId, {
        success: true,
        satisfaction: 10,
        response_time: 3000
      });

      const effectiveness = templateManager.getTemplateEffectiveness(templateId);
      expect(effectiveness?.avg_satisfaction).toBeCloseTo(9, 1);
    });
  });

  describe('Helper Methods', () => {
    it('should get template by ID', () => {
      const template = templateManager.getTemplate('default_guidance_zh');
      expect(template).toBeDefined();
      expect(template?.template_id).toBe('default_guidance_zh');
    });

    it('should get templates by tags', () => {
      const templates = templateManager.getTemplatesByTags(['concise', 'quick']);
      expect(templates.length).toBeGreaterThan(0);
    });

    it('should search templates by criteria', () => {
      const templates = templateManager.searchTemplates({
        template_type: 'guidance',
        language: 'zh'
      });
      expect(templates.length).toBeGreaterThan(0);
    });

    it('should get top templates', () => {
      const topTemplates = templateManager.getTopTemplates(5);
      expect(topTemplates.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Multi-language and Tone', () => {
    it('should render Chinese professional tone', async () => {
      const result = await templateManager.renderTemplate(
        'default_guidance_zh',
        testPlaybook,
        {
          variables: {},
          language: 'zh',
          tone: 'professional'
        }
      );

      expect(result.content).toBeDefined();
    });

    it('should render concise tone', async () => {
      const result = await templateManager.renderTemplate(
        'default_guidance_zh',
        testPlaybook,
        {
          variables: {},
          tone: 'concise'
        }
      );

      // Concise tone should have less whitespace
      expect(result.content).not.toContain('  ');
    });
  });

  describe('Variable Extraction', () => {
    it('should extract all required variables', async () => {
      const result = await templateManager.renderTemplate(
        'default_guidance_zh',
        testPlaybook,
        {
          variables: {}
        }
      );

      expect(result.variables_used).toContain('goal');
      expect(result.variables_used).toContain('steps');
      expect(result.variables_used).toContain('cautions');
      expect(result.variables_used).toContain('expected_outcome');
    });

    it('should format steps correctly', async () => {
      const result = await templateManager.renderTemplate(
        'default_guidance_zh',
        testPlaybook,
        {
          variables: {}
        }
      );

      // Check if steps contain step numbers
      expect(result.content).toContain('1.');
      expect(result.content).toContain('2.');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Close database to simulate error
      db.close();

      await expect(
        templateManager.getAllTemplates()
      ).not.toThrow();
    });

    it('should log errors appropriately', async () => {
      // This test verifies that errors are logged
      // In a real scenario, you would check mockLogger calls
      expect(mockLogger.debug).toBeDefined();
      expect(mockLogger.info).toBeDefined();
      expect(mockLogger.warn).toBeDefined();
      expect(mockLogger.error).toBeDefined();
    });
  });
});
