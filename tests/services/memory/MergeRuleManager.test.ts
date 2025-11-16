import { MergeRuleManager } from '../../../src/services/memory/conflict/MergeRuleManager';
import {
  MergeRuleConfig,
  MemoryConflictCandidate
} from '../../../src/types/memory';

describe('MergeRuleManager', () => {
  let manager: MergeRuleManager;

  beforeEach(() => {
    manager = new MergeRuleManager();
  });

  describe('registerRule', () => {
    it('should register a new rule', () => {
      const rule: MergeRuleConfig = {
        name: 'test-rule',
        description: 'Test rule',
        enabled: true,
        arbitration: {
          priorityImportance: false,
          priorityRecency: true
        }
      };

      manager.registerRule(rule);

      const registered = manager.getRule('test-rule');
      expect(registered).toBeDefined();
      expect(registered?.name).toBe('test-rule');
      expect(registered?.arbitration?.priorityImportance).toBe(false);
      expect(registered?.arbitration?.priorityRecency).toBe(true);
    });

    it('should throw error if rule name is missing', () => {
      const rule = {
        description: 'Invalid rule'
      } as MergeRuleConfig;

      expect(() => manager.registerRule(rule)).toThrow('Rule name is required');
    });

    it('should resolve rule inheritance', () => {
      const baseRule: MergeRuleConfig = {
        name: 'base-rule',
        arbitration: {
          priorityImportance: true,
          priorityRecency: true
        },
        merge: {
          contentStrategy: 'concatenate'
        }
      };

      const derivedRule: MergeRuleConfig = {
        name: 'derived-rule',
        extends: 'base-rule',
        arbitration: {
          priorityRecency: false // 覆盖基础规则
        },
        merge: {
          contentStrategy: 'smart' // 覆盖基础规则
        }
      };

      manager.registerRule(baseRule);
      manager.registerRule(derivedRule);

      const resolved = manager.getRule('derived-rule');
      expect(resolved).toBeDefined();
      expect(resolved?.arbitration?.priorityImportance).toBe(true); // 继承自基础规则
      expect(resolved?.arbitration?.priorityRecency).toBe(false); // 覆盖基础规则
      expect(resolved?.merge?.contentStrategy).toBe('smart'); // 覆盖基础规则
    });

    it('should handle multi-level inheritance', () => {
      const level1: MergeRuleConfig = {
        name: 'level1',
        arbitration: {
          priorityImportance: true
        }
      };

      const level2: MergeRuleConfig = {
        name: 'level2',
        extends: 'level1',
        arbitration: {
          priorityRecency: true
        }
      };

      const level3: MergeRuleConfig = {
        name: 'level3',
        extends: 'level2',
        arbitration: {
          prioritySource: true
        }
      };

      manager.registerRule(level1);
      manager.registerRule(level2);
      manager.registerRule(level3);

      const resolved = manager.getRule('level3');
      expect(resolved?.arbitration?.priorityImportance).toBe(true);
      expect(resolved?.arbitration?.priorityRecency).toBe(true);
      expect(resolved?.arbitration?.prioritySource).toBe(true);
    });
  });

  describe('updateRule', () => {
    it('should update an existing rule', () => {
      const rule: MergeRuleConfig = {
        name: 'update-test',
        arbitration: {
          priorityImportance: true
        }
      };

      manager.registerRule(rule);
      manager.updateRule('update-test', {
        arbitration: {
          priorityImportance: false,
          priorityRecency: true
        }
      });

      const updated = manager.getRule('update-test');
      expect(updated?.arbitration?.priorityImportance).toBe(false);
      expect(updated?.arbitration?.priorityRecency).toBe(true);
    });

    it('should throw error if rule not found', () => {
      expect(() => {
        manager.updateRule('non-existent', {});
      }).toThrow('Rule not found: non-existent');
    });

    it('should deep merge nested objects', () => {
      const rule: MergeRuleConfig = {
        name: 'deep-merge-test',
        merge: {
          metadataStrategy: {
            importance: 'max',
            timestamp: 'max'
          }
        }
      };

      manager.registerRule(rule);
      manager.updateRule('deep-merge-test', {
        merge: {
          metadataStrategy: {
            importance: 'boost' // 只更新 importance，保留 timestamp
          }
        }
      });

      const updated = manager.getRule('deep-merge-test');
      expect(updated?.merge?.metadataStrategy?.importance).toBe('boost');
      expect(updated?.merge?.metadataStrategy?.timestamp).toBe('max');
    });
  });

  describe('deleteRule', () => {
    it('should delete a rule', () => {
      const rule: MergeRuleConfig = {
        name: 'delete-test'
      };

      manager.registerRule(rule);
      expect(manager.getRule('delete-test')).toBeDefined();

      manager.deleteRule('delete-test');
      expect(manager.getRule('delete-test')).toBeUndefined();
    });

    it('should not allow deleting default rule', () => {
      expect(() => {
        manager.deleteRule('default');
      }).toThrow('Cannot delete default rule');
    });
  });

  describe('findMatchingRule', () => {
    it('should return default rule when no conditions match', () => {
      const candidate: MemoryConflictCandidate = {
        userId: 'user-1',
        content: 'Test',
        source: 'conversation'
      };

      const rule = manager.findMatchingRule(candidate, []);
      expect(rule).toBeDefined();
      expect(rule?.name).toBe('default');
    });

    it('should match rule by userId condition', () => {
      const rule: MergeRuleConfig = {
        name: 'user-specific',
        enabled: true,
        priority: 10,
        conditions: {
          userId: 'user-1'
        },
        arbitration: {
          priorityImportance: false
        }
      };

      manager.registerRule(rule);

      const candidate: MemoryConflictCandidate = {
        userId: 'user-1',
        content: 'Test'
      };

      const matched = manager.findMatchingRule(candidate, []);
      expect(matched?.name).toBe('user-specific');
    });

    it('should match rule by personaId condition', () => {
      const rule: MergeRuleConfig = {
        name: 'persona-specific',
        enabled: true,
        priority: 10,
        conditions: {
          personaId: 'warm-companion'
        }
      };

      manager.registerRule(rule);

      const candidate: MemoryConflictCandidate = {
        userId: 'user-1',
        personaId: 'warm-companion',
        content: 'Test'
      };

      const matched = manager.findMatchingRule(candidate, []);
      expect(matched?.name).toBe('persona-specific');
    });

    it('should match rule by source condition', () => {
      const rule: MergeRuleConfig = {
        name: 'source-specific',
        enabled: true,
        priority: 10,
        conditions: {
          source: 'user'
        }
      };

      manager.registerRule(rule);

      const candidate: MemoryConflictCandidate = {
        userId: 'user-1',
        source: 'user',
        content: 'Test'
      };

      const matched = manager.findMatchingRule(candidate, []);
      expect(matched?.name).toBe('source-specific');
    });

    it('should match rule by importanceRange condition', () => {
      const rule: MergeRuleConfig = {
        name: 'high-importance',
        enabled: true,
        priority: 10,
        conditions: {
          importanceRange: {
            min: 0.8,
            max: 1.0
          }
        }
      };

      manager.registerRule(rule);

      const candidate: MemoryConflictCandidate = {
        userId: 'user-1',
        content: 'Test',
        importance: 0.9
      };

      const matched = manager.findMatchingRule(candidate, []);
      expect(matched?.name).toBe('high-importance');
    });

    it('should return rule with highest priority when multiple rules match', () => {
      const rule1: MergeRuleConfig = {
        name: 'low-priority',
        enabled: true,
        priority: 5,
        conditions: {
          userId: 'user-1'
        }
      };

      const rule2: MergeRuleConfig = {
        name: 'high-priority',
        enabled: true,
        priority: 10,
        conditions: {
          userId: 'user-1'
        }
      };

      manager.registerRule(rule1);
      manager.registerRule(rule2);

      const candidate: MemoryConflictCandidate = {
        userId: 'user-1',
        content: 'Test'
      };

      const matched = manager.findMatchingRule(candidate, []);
      expect(matched?.name).toBe('high-priority');
    });

    it('should skip disabled rules', () => {
      const rule: MergeRuleConfig = {
        name: 'disabled-rule',
        enabled: false,
        priority: 10,
        conditions: {
          userId: 'user-1'
        }
      };

      manager.registerRule(rule);

      const candidate: MemoryConflictCandidate = {
        userId: 'user-1',
        content: 'Test'
      };

      const matched = manager.findMatchingRule(candidate, []);
      expect(matched?.name).toBe('default');
    });
  });

  describe('getAllRules', () => {
    it('should return all registered rules', () => {
      manager.registerRule({ name: 'rule1' });
      manager.registerRule({ name: 'rule2' });

      const rules = manager.getAllRules();
      expect(rules.length).toBeGreaterThanOrEqual(3); // default + rule1 + rule2
      expect(rules.some((r) => r.name === 'default')).toBe(true);
      expect(rules.some((r) => r.name === 'rule1')).toBe(true);
      expect(rules.some((r) => r.name === 'rule2')).toBe(true);
    });
  });

  describe('loadRules', () => {
    it('should load multiple rules at once', () => {
      const rules: MergeRuleConfig[] = [
        { name: 'rule1' },
        { name: 'rule2' },
        { name: 'rule3' }
      ];

      manager.loadRules(rules);

      expect(manager.getRule('rule1')).toBeDefined();
      expect(manager.getRule('rule2')).toBeDefined();
      expect(manager.getRule('rule3')).toBeDefined();
    });
  });

  describe('exportRules', () => {
    it('should export all rules', () => {
      manager.registerRule({ name: 'export-test' });

      const exported = manager.exportRules();
      expect(exported.length).toBeGreaterThanOrEqual(2); // default + export-test
      expect(exported.some((r) => r.name === 'default')).toBe(true);
      expect(exported.some((r) => r.name === 'export-test')).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset to default rules', () => {
      manager.registerRule({ name: 'temp-rule' });
      expect(manager.getRule('temp-rule')).toBeDefined();

      manager.reset();

      expect(manager.getRule('temp-rule')).toBeUndefined();
      expect(manager.getRule('default')).toBeDefined();
    });
  });

  describe('events', () => {
    it('should emit rule:registered event', (done) => {
      manager.once('rule:registered', (data) => {
        expect(data.name).toBe('event-test');
        expect(data.rule).toBeDefined();
        done();
      });

      manager.registerRule({ name: 'event-test' });
    });

    it('should emit rule:updated event', (done) => {
      manager.registerRule({ name: 'update-event-test' });

      manager.once('rule:updated', (data) => {
        expect(data.name).toBe('update-event-test');
        expect(data.rule).toBeDefined();
        done();
      });

      manager.updateRule('update-event-test', { description: 'Updated' });
    });

    it('should emit rule:deleted event', (done) => {
      manager.registerRule({ name: 'delete-event-test' });

      manager.once('rule:deleted', (data) => {
        expect(data.name).toBe('delete-event-test');
        done();
      });

      manager.deleteRule('delete-event-test');
    });
  });
});

