/**
 * Prompt Template Service
 * =======================
 *
 * Simplified service for managing prompt templates with SQLite storage.
 * Provides CRUD operations and template effectiveness tracking.
 *
 * Version: 1.0.0
 * Created: 2025-12-18
 */

import Database from 'better-sqlite3';
import { logger as WinstonLogger } from '../../utils/logger';
import {
  PromptTemplate,
  PromptTemplateMetadata,
  TemplateEffectiveness
} from './types';

// Simple logger interface
interface SimpleLogger {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
}

export class PromptTemplateService {
  private db: Database.Database;
  private logger: SimpleLogger;
  private effectivenessCache: Map<string, TemplateEffectiveness> = new Map();

  constructor(db: Database.Database, logger: SimpleLogger) {
    this.db = db;
    this.logger = logger;
    this.initializeTables();
    this.loadEffectivenessCache();
  }

  /**
   * Initialize database tables
   */
  private initializeTables(): void {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS prompt_templates (
        template_id TEXT PRIMARY KEY,
        template_type TEXT NOT NULL,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        variables TEXT NOT NULL,
        applicable_tags TEXT NOT NULL,
        guidance_level TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        usage_count INTEGER DEFAULT 0,
        effectiveness_score REAL DEFAULT 0.5,
        metadata TEXT
      )
    `;

    this.db.exec(createTableSQL);

    // Create index on applicable_tags for faster queries
    const createIndexSQL = `
      CREATE INDEX IF NOT EXISTS idx_templates_tags
      ON prompt_templates (applicable_tags)
    `;

    this.db.exec(createIndexSQL);

    this.logger.debug('[PromptTemplateService] Tables initialized');
  }

  /**
   * Load effectiveness cache from database
   */
  private loadEffectivenessCache(): void {
    const templates = this.getAllTemplates();
    for (const template of templates) {
      this.effectivenessCache.set(template.template_id, {
        template_id: template.template_id,
        usage_count: template.usage_count,
        avg_satisfaction: template.effectiveness_score * 10, // Convert back from 0-1 to 0-10
        success_rate: template.effectiveness_score,
        avg_response_time: 0, // Will be updated from actual usage
        last_evaluated: Date.now()
      });
    }
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId: string): PromptTemplate | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM prompt_templates WHERE template_id = ?');
      const row = stmt.get(templateId) as any;

      if (!row) {
        return null;
      }

      return this.parseTemplateRow(row);
    } catch (error) {
      this.logger.error('[PromptTemplateService] Error getting template', error);
      throw error;
    }
  }

  /**
   * Get all templates
   */
  getAllTemplates(): PromptTemplate[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM prompt_templates ORDER BY updated_at DESC');
      const rows = stmt.all() as any[];

      return rows.map(row => this.parseTemplateRow(row));
    } catch (error) {
      this.logger.error('[PromptTemplateService] Error getting all templates', error);
      throw error;
    }
  }

  /**
   * Get templates by tags
   */
  getTemplatesByTags(tags: string[]): PromptTemplate[] {
    try {
      const templates = this.getAllTemplates();
      return templates.filter(template => {
        const templateTags = template.applicable_tags || [];
        return tags.some(tag => templateTags.includes(tag));
      });
    } catch (error) {
      this.logger.error('[PromptTemplateService] Error getting templates by tags', error);
      throw error;
    }
  }

  /**
   * Create new template
   */
  createTemplate(template: PromptTemplate): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO prompt_templates (
          template_id, template_type, name, content, variables,
          applicable_tags, guidance_level, created_at, updated_at,
          usage_count, effectiveness_score, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        template.template_id,
        template.template_type,
        template.name,
        template.content,
        JSON.stringify(template.variables),
        JSON.stringify(template.applicable_tags || []),
        template.guidance_level || null,
        template.created_at,
        template.updated_at,
        template.usage_count || 0,
        template.effectiveness_score || 0.5,
        JSON.stringify(template.metadata || {})
      );

      this.logger.info('[PromptTemplateService] Template created', {
        template_id: template.template_id
      });
    } catch (error) {
      this.logger.error('[PromptTemplateService] Error creating template', error);
      throw error;
    }
  }

  /**
   * Update existing template
   */
  updateTemplate(template: PromptTemplate): void {
    try {
      const stmt = this.db.prepare(`
        UPDATE prompt_templates SET
          template_type = ?,
          name = ?,
          content = ?,
          variables = ?,
          applicable_tags = ?,
          guidance_level = ?,
          updated_at = ?,
          metadata = ?
        WHERE template_id = ?
      `);

      stmt.run(
        template.template_type,
        template.name,
        template.content,
        JSON.stringify(template.variables),
        JSON.stringify(template.applicable_tags || []),
        template.guidance_level || null,
        Date.now(),
        JSON.stringify(template.metadata || {}),
        template.template_id
      );

      this.logger.info('[PromptTemplateService] Template updated', {
        template_id: template.template_id
      });
    } catch (error) {
      this.logger.error('[PromptTemplateService] Error updating template', error);
      throw error;
    }
  }

  /**
   * Delete template
   */
  deleteTemplate(templateId: string): void {
    try {
      const stmt = this.db.prepare('DELETE FROM prompt_templates WHERE template_id = ?');
      stmt.run(templateId);

      this.effectivenessCache.delete(templateId);

      this.logger.info('[PromptTemplateService] Template deleted', {
        template_id: templateId
      });
    } catch (error) {
      this.logger.error('[PromptTemplateService] Error deleting template', error);
      throw error;
    }
  }

  /**
   * Increment usage count
   */
  incrementUsage(templateId: string): void {
    try {
      const stmt = this.db.prepare(`
        UPDATE prompt_templates
        SET usage_count = usage_count + 1
        WHERE template_id = ?
      `);

      stmt.run(templateId);

      // Update cache
      const effectiveness = this.effectivenessCache.get(templateId);
      if (effectiveness) {
        effectiveness.usage_count += 1;
        effectiveness.last_evaluated = Date.now();
        this.effectivenessCache.set(templateId, effectiveness);
      }
    } catch (error) {
      this.logger.error('[PromptTemplateService] Error incrementing usage', error);
      throw error;
    }
  }

  /**
   * Update effectiveness score
   */
  updateEffectiveness(templateId: string, updates: {
    usage_count?: number;
    effectiveness_score?: number;
  }): void {
    try {
      const stmt = this.db.prepare(`
        UPDATE prompt_templates
        SET usage_count = ?, effectiveness_score = ?
        WHERE template_id = ?
      `);

      stmt.run(
        updates.usage_count || 0,
        updates.effectiveness_score || 0.5,
        templateId
      );

      // Update cache
      const effectiveness = this.effectivenessCache.get(templateId);
      if (effectiveness) {
        if (updates.usage_count !== undefined) {
          effectiveness.usage_count = updates.usage_count;
        }
        if (updates.effectiveness_score !== undefined) {
          effectiveness.avg_satisfaction = updates.effectiveness_score * 10;
          effectiveness.success_rate = updates.effectiveness_score;
        }
        effectiveness.last_evaluated = Date.now();
        this.effectivenessCache.set(templateId, effectiveness);
      }

      this.logger.debug('[PromptTemplateService] Effectiveness updated', {
        template_id: templateId,
        updates
      });
    } catch (error) {
      this.logger.error('[PromptTemplateService] Error updating effectiveness', error);
      throw error;
    }
  }

  /**
   * Get effectiveness metrics
   */
  getEffectiveness(templateId: string): TemplateEffectiveness | null {
    return this.effectivenessCache.get(templateId) || null;
  }

  /**
   * Get all effectiveness metrics
   */
  getAllEffectiveness(): TemplateEffectiveness[] {
    return Array.from(this.effectivenessCache.values());
  }

  /**
   * Search templates by criteria
   */
  searchTemplates(criteria: {
    template_type?: string;
    guidance_level?: string;
    min_effectiveness?: number;
    language?: string;
    tone?: string;
  }): PromptTemplate[] {
    let templates = this.getAllTemplates();

    if (criteria.template_type) {
      templates = templates.filter(t => t.template_type === criteria.template_type);
    }

    if (criteria.guidance_level) {
      templates = templates.filter(t => t.guidance_level === criteria.guidance_level);
    }

    if (criteria.min_effectiveness !== undefined) {
      templates = templates.filter(t => (t.effectiveness_score || 0) >= criteria.min_effectiveness!);
    }

    if (criteria.language || criteria.tone) {
      templates = templates.filter(t => {
        const metadata = t.metadata || {};
        if (criteria.language && metadata.language !== criteria.language) {
          return false;
        }
        if (criteria.tone && metadata.tone !== criteria.tone) {
          return false;
        }
        return true;
      });
    }

    return templates;
  }

  /**
   * Get top templates by effectiveness
   */
  getTopTemplates(limit: number = 10): PromptTemplate[] {
    const templates = this.getAllTemplates();
    return templates
      .sort((a, b) => (b.effectiveness_score || 0) - (a.effectiveness_score || 0))
      .slice(0, limit);
  }

  /**
   * Create default templates if none exist
   */
  createDefaultTemplates(): void {
    const templates = this.getAllTemplates();
    if (templates.length > 0) {
      return; // Already have templates
    }

    const defaultTemplates: PromptTemplate[] = [
      {
        template_id: 'default_guidance_zh',
        template_type: 'guidance',
        name: '默认指导模板（中文）',
        content: `
# {goal}

## 目标
{goal}

## 执行步骤
{steps}

## 注意事项
{cautions}

## 预期结果
{expected_outcome}
        `.trim(),
        variables: ['goal', 'steps', 'cautions', 'expected_outcome'],
        applicable_tags: [],
        guidance_level: 'medium',
        created_at: Date.now(),
        updated_at: Date.now(),
        usage_count: 0,
        effectiveness_score: 0.5,
        metadata: {
          language: 'zh',
          tone: 'professional',
          max_length: 2000
        }
      },
      {
        template_id: 'default_guidance_en',
        template_type: 'guidance',
        name: 'Default Guidance Template (English)',
        content: `
# {goal}

## Goal
{goal}

## Steps
{steps}

## Cautions
{cautions}

## Expected Outcome
{expected_outcome}
        `.trim(),
        variables: ['goal', 'steps', 'cautions', 'expected_outcome'],
        applicable_tags: [],
        guidance_level: 'medium',
        created_at: Date.now(),
        updated_at: Date.now(),
        usage_count: 0,
        effectiveness_score: 0.5,
        metadata: {
          language: 'en',
          tone: 'professional',
          max_length: 2000
        }
      },
      {
        template_id: 'concise_guidance',
        template_type: 'guidance',
        name: '简洁指导模板',
        content: `
任务：{goal}
步骤：{steps}
注意事项：{cautions}
预期：{expected_outcome}
        `.trim(),
        variables: ['goal', 'steps', 'cautions', 'expected_outcome'],
        applicable_tags: ['concise', 'quick'],
        guidance_level: 'light',
        created_at: Date.now(),
        updated_at: Date.now(),
        usage_count: 0,
        effectiveness_score: 0.5,
        metadata: {
          language: 'zh',
          tone: 'concise',
          max_length: 500
        }
      }
    ];

    for (const template of defaultTemplates) {
      this.createTemplate(template);
    }

    this.logger.info('[PromptTemplateService] Default templates created');
  }

  /**
   * Parse database row to template object
   */
  private parseTemplateRow(row: any): PromptTemplate {
    return {
      template_id: row.template_id,
      template_type: row.template_type,
      name: row.name,
      content: row.content,
      variables: JSON.parse(row.variables),
      applicable_tags: JSON.parse(row.applicable_tags || '[]'),
      guidance_level: row.guidance_level as 'light' | 'medium' | 'intensive' | undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
      usage_count: row.usage_count,
      effectiveness_score: row.effectiveness_score,
      metadata: JSON.parse(row.metadata || '{}')
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    this.effectivenessCache.clear();
  }
}
