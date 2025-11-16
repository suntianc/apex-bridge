import {
  ArbitrationOptions,
  MergeOptions,
  MergeRuleConfig,
  MergeRuleRegistry,
  MemoryConflictCandidate
} from '../../../types/memory';
import { EventEmitter } from 'events';
import { logger } from '../../../utils/logger';

export class MergeRuleManager extends EventEmitter {
  private registry: MergeRuleRegistry = {
    rules: new Map(),
    version: 1,
    lastUpdated: Date.now()
  };

  private readonly defaultRule: MergeRuleConfig = {
    name: 'default',
    description: 'Default merge rule with balanced strategies',
    enabled: true,
    priority: 0,
    arbitration: {
      priorityImportance: true,
      priorityRecency: true,
      prioritySource: true,
      allowMerge: true,
      mergeThreshold: 0.2,
      defaultStrategy: 'keep-candidate'
    },
    merge: {
      contentStrategy: 'smart',
      metadataStrategy: {
        importance: 'boost',
        timestamp: 'max',
        source: 'prefer-higher',
        keywords: 'union'
      },
      importanceBoost: 0.1,
      deduplicate: true,
      deduplicationThreshold: 0.8,
      preserveHistory: true
    }
  };

  constructor() {
    super();
    // 注册默认规则
    this.registry.rules.set('default', this.defaultRule);
    this.registry.defaultRule = 'default';
  }

  /**
   * 注册规则
   */
  registerRule(config: MergeRuleConfig): void {
    if (!config.name) {
      throw new Error('Rule name is required');
    }

    // 解析继承关系
    const resolved = this.resolveRule(config);
    this.registry.rules.set(config.name, resolved);
    this.registry.version = (this.registry.version || 1) + 1;
    this.registry.lastUpdated = Date.now();

    this.emit('rule:registered', { name: config.name, rule: resolved });
    logger.debug(`[MergeRuleManager] Registered rule: ${config.name}`);
  }

  /**
   * 更新规则
   */
  updateRule(name: string, updates: Partial<MergeRuleConfig>): void {
    const existing = this.registry.rules.get(name);
    if (!existing) {
      throw new Error(`Rule not found: ${name}`);
    }

    const updated: MergeRuleConfig = {
      ...existing,
      ...updates,
      name, // 确保名称不变
      arbitration: this.deepMerge(existing.arbitration || {}, updates.arbitration || {}),
      merge: this.deepMerge(existing.merge || {}, updates.merge || {}),
      conditions: this.deepMerge(existing.conditions || {}, updates.conditions || {})
    };

    // 重新解析继承关系
    const resolved = this.resolveRule(updated);
    this.registry.rules.set(name, resolved);
    this.registry.version = (this.registry.version || 1) + 1;
    this.registry.lastUpdated = Date.now();

    this.emit('rule:updated', { name, rule: resolved });
    logger.debug(`[MergeRuleManager] Updated rule: ${name}`);
  }

  /**
   * 删除规则
   */
  deleteRule(name: string): void {
    if (name === 'default') {
      throw new Error('Cannot delete default rule');
    }

    const deleted = this.registry.rules.delete(name);
    if (deleted) {
      this.registry.version = (this.registry.version || 1) + 1;
      this.registry.lastUpdated = Date.now();
      this.emit('rule:deleted', { name });
      logger.debug(`[MergeRuleManager] Deleted rule: ${name}`);
    }
  }

  /**
   * 获取规则
   */
  getRule(name: string): MergeRuleConfig | undefined {
    return this.registry.rules.get(name);
  }

  /**
   * 获取所有规则
   */
  getAllRules(): MergeRuleConfig[] {
    return Array.from(this.registry.rules.values());
  }

  /**
   * 查找匹配的规则
   */
  findMatchingRule(
    candidate: MemoryConflictCandidate,
    existing: MemoryConflictCandidate[]
  ): MergeRuleConfig | null {
    const rules = this.getAllRules()
      .filter((rule) => rule.enabled !== false)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    for (const rule of rules) {
      if (this.matchesConditions(rule, candidate, existing)) {
        return rule;
      }
    }

    // 返回默认规则
    return this.registry.rules.get(this.registry.defaultRule || 'default') || this.defaultRule;
  }

  /**
   * 检查规则是否匹配条件
   */
  private matchesConditions(
    rule: MergeRuleConfig,
    candidate: MemoryConflictCandidate,
    existing: MemoryConflictCandidate[]
  ): boolean {
    if (!rule.conditions) {
      return true; // 无条件规则总是匹配
    }

    const { conditions } = rule;

    // 检查 userId
    if (conditions.userId) {
      const userIds = Array.isArray(conditions.userId) ? conditions.userId : [conditions.userId];
      if (!userIds.includes(candidate.userId)) {
        return false;
      }
    }

    // 检查 personaId
    if (conditions.personaId) {
      const personaIds = Array.isArray(conditions.personaId)
        ? conditions.personaId
        : [conditions.personaId];
      if (!candidate.personaId || !personaIds.includes(candidate.personaId)) {
        return false;
      }
    }

    // 检查 source
    if (conditions.source) {
      const sources = Array.isArray(conditions.source) ? conditions.source : [conditions.source];
      if (!candidate.source || !sources.includes(candidate.source)) {
        return false;
      }
    }

    // 检查 importanceRange
    if (conditions.importanceRange) {
      const importance = candidate.importance || 0;
      const { min, max } = conditions.importanceRange;
      if (min !== undefined && importance < min) {
        return false;
      }
      if (max !== undefined && importance > max) {
        return false;
      }
    }

    return true;
  }

  /**
   * 解析规则继承关系
   */
  private resolveRule(config: MergeRuleConfig): MergeRuleConfig {
    if (!config.extends) {
      return config;
    }

    const baseRule = this.registry.rules.get(config.extends);
    if (!baseRule) {
      logger.warn(`[MergeRuleManager] Base rule not found: ${config.extends}, using default`);
      return this.mergeWithDefault(config);
    }

    // 递归解析基础规则的继承关系
    const resolvedBase = this.resolveRule(baseRule);

    // 合并基础规则和当前规则
    return {
      ...resolvedBase,
      ...config,
      name: config.name, // 确保名称不被覆盖
      arbitration: this.deepMerge(resolvedBase.arbitration || {}, config.arbitration || {}),
      merge: this.deepMerge(resolvedBase.merge || {}, config.merge || {}),
      conditions: this.deepMerge(resolvedBase.conditions || {}, config.conditions || {})
    };
  }

  /**
   * 与默认规则合并
   */
  private mergeWithDefault(config: MergeRuleConfig): MergeRuleConfig {
    return {
      ...this.defaultRule,
      ...config,
      name: config.name,
      arbitration: this.deepMerge(this.defaultRule.arbitration || {}, config.arbitration || {}),
      merge: this.deepMerge(this.defaultRule.merge || {}, config.merge || {}),
      conditions: this.deepMerge(this.defaultRule.conditions || {}, config.conditions || {})
    };
  }

  /**
   * 深度合并对象
   */
  private deepMerge<T extends Record<string, any>>(base: T, updates: Partial<T>): T {
    const merged = { ...base };

    for (const key in updates) {
      if (updates[key] !== undefined) {
        if (
          typeof updates[key] === 'object' &&
          updates[key] !== null &&
          !Array.isArray(updates[key]) &&
          typeof base[key] === 'object' &&
          base[key] !== null &&
          !Array.isArray(base[key])
        ) {
          merged[key] = this.deepMerge(base[key], updates[key]);
        } else {
          merged[key] = updates[key] as any;
        }
      }
    }

    return merged;
  }

  /**
   * 获取规则注册表
   */
  getRegistry(): MergeRuleRegistry {
    return {
      ...this.registry,
      rules: new Map(this.registry.rules) // 返回副本
    };
  }

  /**
   * 从配置加载规则
   */
  loadRules(rules: MergeRuleConfig[]): void {
    for (const rule of rules) {
      this.registerRule(rule);
    }
    logger.info(`[MergeRuleManager] Loaded ${rules.length} rules`);
  }

  /**
   * 导出规则配置（用于持久化）
   */
  exportRules(): MergeRuleConfig[] {
    return Array.from(this.registry.rules.values()).map((rule) => ({
      ...rule,
      // 移除继承解析后的内部状态，只保留原始配置
      extends: rule.extends
    }));
  }

  /**
   * 重置为默认规则
   */
  reset(): void {
    this.registry.rules.clear();
    this.registry.rules.set('default', this.defaultRule);
    this.registry.defaultRule = 'default';
    this.registry.version = 1;
    this.registry.lastUpdated = Date.now();
    this.emit('rules:reset');
    logger.info('[MergeRuleManager] Reset to default rules');
  }
}

