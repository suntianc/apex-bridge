/**
 * Playbook Template Manager
 * =========================
 *
 * Manages prompt templates for playbook guidance with intelligent selection,
 * variable replacement, and effectiveness evaluation.
 *
 * Features:
 * - Dynamic variable replacement using {goal}, {steps}, {cautions}, {expected_outcome}
 * - Multi-language support (Chinese/English)
 * - Multiple tones (professional/friendly/concise)
 * - Template effectiveness scoring and automatic optimization
 * - SQLite-based storage with better-sqlite3
 *
 * Version: 1.0.0
 * Created: 2025-12-18
 */

import { logger as Logger } from '../../utils/logger';
import { VariableEngine } from '../variable/VariableEngine';
import { PromptTemplateService } from './PromptTemplateService';

// Simple logger interface
interface SimpleLogger {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
}
import {
  StrategicPlaybook,
  PromptTemplate,
  TemplateRenderOptions,
  TemplateRenderResult,
  TemplateEffectiveness,
  MatchingContext,
  PlaybookAction,
  GuidanceStep
} from './types';

export interface TemplateSelectionOptions {
  min_effectiveness?: number;
  prefer_recent?: boolean;
  guidance_level?: 'light' | 'medium' | 'intensive';
  language?: 'zh' | 'en';
  tone?: 'professional' | 'friendly' | 'concise';
}

export interface TemplateEvaluationOutcome {
  success: boolean;
  satisfaction?: number; // [0-10]
  response_time?: number;
  feedback?: string;
  user_id?: string;
  session_id?: string;
}

export class PlaybookTemplateManager {
  private promptTemplateService: PromptTemplateService;
  private variableEngine: VariableEngine;
  private logger: SimpleLogger;

  constructor(
    promptTemplateService: PromptTemplateService,
    variableEngine: VariableEngine,
    logger: SimpleLogger
  ) {
    this.promptTemplateService = promptTemplateService;
    this.variableEngine = variableEngine;
    this.logger = logger;
  }

  /**
   * ============================================
   * CORE METHODS - 核心方法
   * ============================================
   */

  /**
   * Render a prompt template with playbook variables
   *
   * @param templateId - Template ID to render
   * @param playbook - Playbook containing the data
   * @param options - Rendering options
   * @returns Rendered content with metadata
   */
  async renderTemplate(
    templateId: string,
    playbook: StrategicPlaybook,
    options: TemplateRenderOptions
  ): Promise<TemplateRenderResult> {
    this.logger.info('[PlaybookTemplateManager] Rendering template', {
      templateId,
      playbookId: playbook.id
    });

    try {
      // 1. Get template
      const template = this.promptTemplateService.getTemplate(templateId);
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      // 2. Extract variables from playbook
      const variables = await this.extractVariables(playbook, options.variables || {});

      // 3. Apply variable replacement using VariableEngine
      // Note: Template uses {var} format, VariableEngine uses {{var}} format
      const convertedContent = template.content.replace(/\{([^}]+)\}/g, '{{$1}}');
      const resolvedContent = await this.variableEngine.resolveAll(convertedContent, variables);

      // 4. Adjust formatting based on options
      let finalContent = this.adjustFormatting(resolvedContent, options);

      // 5. Truncate if needed
      if (options.max_length) {
        finalContent = this.truncateContent(finalContent, options.max_length);
      }

      // 6. Update usage statistics
      this.promptTemplateService.incrementUsage(templateId);

      this.logger.info('[PlaybookTemplateManager] Template rendered successfully', {
        templateId,
        playbookId: playbook.id,
        tokenCount: this.estimateTokenCount(finalContent)
      });

      return {
        content: finalContent,
        variables_used: Object.keys(variables),
        token_count: this.estimateTokenCount(finalContent)
      };

    } catch (error) {
      this.logger.error('[PlaybookTemplateManager] Template rendering failed', {
        templateId,
        playbookId: playbook.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Intelligently select the best template for a playbook
   *
   * @param playbook - Playbook to find template for
   * @param context - Matching context
   * @param options - Selection options
   * @returns Best matching template or null
   */
  async selectBestTemplate(
    playbook: StrategicPlaybook,
    context: MatchingContext,
    options: TemplateSelectionOptions = {}
  ): Promise<PromptTemplate | null> {
    this.logger.debug('[PlaybookTemplateManager] Selecting best template', {
      playbookId: playbook.id,
      options
    });

    try {
      // 1. Get applicable templates by tags
      const applicableTemplates = this.promptTemplateService.getTemplatesByTags(
        playbook.type_tags || []
      );

      if (applicableTemplates.length === 0) {
        this.logger.debug('[PlaybookTemplateManager] No templates by tags, using all templates');
        // Fallback to all templates
        const allTemplates = this.promptTemplateService.getAllTemplates();
        if (allTemplates.length === 0) {
          return null;
        }
        applicableTemplates.push(...allTemplates);
      }

      // 2. Filter by selection criteria
      const filteredTemplates = applicableTemplates.filter(template => {
        // Filter by guidance level
        if (options.guidance_level && template.guidance_level !== options.guidance_level) {
          return false;
        }

        // Filter by language
        if (options.language) {
          const templateLang = template.metadata?.language;
          if (templateLang && templateLang !== options.language) {
            return false;
          }
        }

        // Filter by tone
        if (options.tone) {
          const templateTone = template.metadata?.tone;
          if (templateTone && templateTone !== options.tone) {
            return false;
          }
        }

        // Filter by minimum effectiveness
        if (options.min_effectiveness !== undefined) {
          const effectiveness = template.effectiveness_score || 0.5;
          if (effectiveness < options.min_effectiveness) {
            return false;
          }
        }

        return true;
      });

      if (filteredTemplates.length === 0) {
        this.logger.warn('[PlaybookTemplateManager] No templates match criteria, using fallback');
        // Use the first applicable template as fallback
        return applicableTemplates[0] || null;
      }

      // 3. Score and rank templates
      const scored = await Promise.all(
        filteredTemplates.map(async (template) => {
          const score = await this.calculateTemplateScore(template, playbook, context, options);
          return { template, score };
        })
      );

      // 4. Sort by score (descending)
      scored.sort((a, b) => b.score - a.score);

      const bestTemplate = scored[0].template;

      this.logger.info('[PlaybookTemplateManager] Best template selected', {
        templateId: bestTemplate.template_id,
        score: scored[0].score
      });

      return bestTemplate;

    } catch (error) {
      this.logger.error('[PlaybookTemplateManager] Template selection failed', {
        playbookId: playbook.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Evaluate template effectiveness based on usage outcome
   *
   * @param templateId - Template ID to evaluate
   * @param outcome - Usage outcome with success metrics
   */
  async evaluateTemplate(
    templateId: string,
    outcome: TemplateEvaluationOutcome
  ): Promise<void> {
    this.logger.info('[PlaybookTemplateManager] Evaluating template', {
      templateId,
      success: outcome.success,
      satisfaction: outcome.satisfaction
    });

    try {
      // 1. Get current effectiveness metrics
      const effectiveness = this.promptTemplateService.getEffectiveness(templateId);

      if (!effectiveness) {
        this.logger.warn('[PlaybookTemplateManager] No effectiveness data found', {
          templateId
        });
        return;
      }

      // 2. Update metrics
      const newUsageCount = effectiveness.usage_count + 1;

      // Calculate new average satisfaction
      let newAvgSatisfaction = effectiveness.avg_satisfaction;
      if (outcome.satisfaction !== undefined) {
        newAvgSatisfaction =
          (effectiveness.avg_satisfaction * effectiveness.usage_count + outcome.satisfaction) /
          newUsageCount;
      }

      // Calculate new average response time
      let newAvgResponseTime = effectiveness.avg_response_time;
      if (outcome.response_time !== undefined) {
        if (effectiveness.avg_response_time === 0) {
          newAvgResponseTime = outcome.response_time;
        } else {
          newAvgResponseTime =
            (effectiveness.avg_response_time * effectiveness.usage_count + outcome.response_time) /
            newUsageCount;
        }
      }

      // Calculate new success rate
      const currentSuccessCount = effectiveness.success_rate * effectiveness.usage_count;
      const newSuccessCount = currentSuccessCount + (outcome.success ? 1 : 0);
      const newSuccessRate = newSuccessCount / newUsageCount;

      // 3. Update in database
      this.promptTemplateService.updateEffectiveness(templateId, {
        usage_count: newUsageCount,
        effectiveness_score: newAvgSatisfaction / 10 // Convert back to 0-1 scale
      });

      this.logger.debug('[PlaybookTemplateManager] Template effectiveness updated', {
        templateId,
        newUsageCount,
        newAvgSatisfaction,
        newSuccessRate
      });

    } catch (error) {
      this.logger.error('[PlaybookTemplateManager] Template evaluation failed', {
        templateId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * ============================================
   * HELPER METHODS - 辅助方法
   * ============================================
   */

  /**
   * Get a template by ID
   */
  getTemplate(templateId: string): PromptTemplate | null {
    return this.promptTemplateService.getTemplate(templateId);
  }

  /**
   * Get templates by tags
   */
  getTemplatesByTags(tags: string[]): PromptTemplate[] {
    return this.promptTemplateService.getTemplatesByTags(tags);
  }

  /**
   * Get all templates
   */
  getAllTemplates(): PromptTemplate[] {
    return this.promptTemplateService.getAllTemplates();
  }

  /**
   * Update a template
   */
  updateTemplate(template: PromptTemplate): void {
    this.promptTemplateService.updateTemplate(template);
  }

  /**
   * Create a new template
   */
  createTemplate(template: PromptTemplate): void {
    this.promptTemplateService.createTemplate(template);
  }

  /**
   * Delete a template
   */
  deleteTemplate(templateId: string): void {
    this.promptTemplateService.deleteTemplate(templateId);
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
    return this.promptTemplateService.searchTemplates(criteria);
  }

  /**
   * Get top templates by effectiveness
   */
  getTopTemplates(limit: number = 10): PromptTemplate[] {
    return this.promptTemplateService.getTopTemplates(limit);
  }

  /**
   * Get effectiveness metrics for a template
   */
  getTemplateEffectiveness(templateId: string): TemplateEffectiveness | null {
    return this.promptTemplateService.getEffectiveness(templateId);
  }

  /**
   * Create default templates if none exist
   */
  createDefaultTemplates(): void {
    this.promptTemplateService.createDefaultTemplates();
  }

  /**
   * ============================================
   * PRIVATE METHODS - 私有方法
   * ============================================
   */

  /**
   * Extract variables from playbook and additional options
   */
  private async extractVariables(
    playbook: StrategicPlaybook,
    additionalVars: Record<string, any>
  ): Promise<Record<string, string>> {
    const variables: Record<string, string> = {
      // Core playbook variables
      goal: playbook.description || '',
      steps: this.formatSteps(playbook.guidance_steps || playbook.actions || []),
      cautions: this.extractCautions(playbook),
      expected_outcome: this.extractExpectedOutcome(playbook),

      // Context variables
      domain: playbook.context?.domain || '',
      scenario: playbook.context?.scenario || '',
      complexity: playbook.context?.complexity || '',

      // Playbook metadata
      playbook_name: playbook.name || '',
      playbook_description: playbook.description || '',
      author: playbook.author || '',

      // Additional variables
      ...additionalVars
    };

    // Convert all values to strings for VariableEngine
    const stringVariables: Record<string, string> = {};
    for (const [key, value] of Object.entries(variables)) {
      stringVariables[key] = value !== undefined && value !== null ? String(value) : '';
    }

    return stringVariables;
  }

  /**
   * Format playbook steps
   */
  private formatSteps(steps: GuidanceStep[] | PlaybookAction[]): string {
    if (steps.length === 0) {
      return 'No specific steps defined';
    }

    return steps
      .map((step, index) => {
        const description = 'description' in step ? step.description : '';
        const expected = 'expected_outcome' in step ? step.expected_outcome : '';
        const keyPoints = 'key_points' in step ? step.key_points : [];
        const cautions = 'cautions' in step ? step.cautions : [];

        let formatted = `${index + 1}. ${description}`;

        if (expected) {
          formatted += `\n   Expected: ${expected}`;
        }

        if (keyPoints && keyPoints.length > 0) {
          formatted += `\n   Key Points: ${keyPoints.join(', ')}`;
        }

        if (cautions && cautions.length > 0) {
          formatted += `\n   Cautions: ${cautions.join(', ')}`;
        }

        return formatted;
      })
      .join('\n');
  }

  /**
   * Extract cautions from playbook
   */
  private extractCautions(playbook: StrategicPlaybook): string {
    const allCautions: string[] = [];

    // Extract from guidance_steps
    if (playbook.guidance_steps) {
      for (const step of playbook.guidance_steps) {
        if (step.cautions && step.cautions.length > 0) {
          allCautions.push(...step.cautions);
        }
      }
    }

    // Extract from actions (deprecated but still supported)
    if (playbook.actions) {
      for (const action of playbook.actions) {
        // Look for cautions in expectedOutcome or description
        if (action.expectedOutcome?.toLowerCase().includes('caution') ||
            action.expectedOutcome?.toLowerCase().includes('warning')) {
          allCautions.push(action.expectedOutcome);
        }
      }
    }

    return allCautions.length > 0
      ? allCautions.join('; ')
      : 'Follow standard best practices and verify results at each step.';
  }

  /**
   * Extract expected outcome from playbook
   */
  private extractExpectedOutcome(playbook: StrategicPlaybook): string {
    const outcomes: string[] = [];

    // From guidance_steps
    if (playbook.guidance_steps) {
      for (const step of playbook.guidance_steps) {
        if (step.expected_outcome) {
          outcomes.push(step.expected_outcome);
        }
      }
    }

    // From actions (deprecated but still supported)
    if (playbook.actions) {
      for (const action of playbook.actions) {
        if (action.expectedOutcome) {
          outcomes.push(action.expectedOutcome);
        }
      }
    }

    return outcomes.length > 0
      ? outcomes.join('; ')
      : 'Successfully complete the task according to the playbook guidance.';
  }

  /**
   * Adjust formatting based on language and tone
   */
  private adjustFormatting(content: string, options: TemplateRenderOptions): string {
    let result = content;

    // Remove extra whitespace
    result = result.replace(/\s+/g, ' ').trim();

    // Language-specific adjustments
    if (options.language === 'zh') {
      result = this.adjustChineseFormatting(result);
    }

    // Tone adjustments
    switch (options.tone) {
      case 'professional':
        result = this.toProfessionalTone(result);
        break;
      case 'friendly':
        result = this.toFriendlyTone(result);
        break;
      case 'concise':
        result = this.toConciseTone(result);
        break;
    }

    return result;
  }

  /**
   * Chinese-specific formatting adjustments
   */
  private adjustChineseFormatting(content: string): string {
    // Ensure proper spacing around punctuation for Chinese text
    return content
      .replace(/([，。！？；：、])([^\s])/g, '$1 $2')
      .replace(/([^\s])([，。！？；：、])/g, '$1 $2');
  }

  /**
   * Convert to professional tone
   */
  private toProfessionalTone(content: string): string {
    // Use formal language, remove colloquialisms
    return content
      .replace(/!/g, '.')
      .replace(/呗|啦|呀/g, '。')
      .replace(/非常好|很棒/g, '良好')
      .replace(/简单/g, '直接');
  }

  /**
   * Convert to friendly tone
   */
  private toFriendlyTone(content: string): string {
    // Add friendly language elements
    return content
      .replace(/请注意/g, '请记住')
      .replace(/必须/g, '建议')
      .replace(/应该/g, '可以');
  }

  /**
   * Convert to concise tone
   */
  private toConciseTone(content: string): string {
    // Remove unnecessary words and simplify
    return content
      .replace(/\b(请注意|需要注意的是|特别要注意)\b/g, '')
      .replace(/\b(详细的|具体的|明确的)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Truncate content to max length while preserving completeness
   */
  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    // Smart truncation - try to end at a sentence boundary
    const truncated = content.substring(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('。'),
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );

    if (lastSentenceEnd > maxLength * 0.7) {
      return truncated.substring(0, lastSentenceEnd + 1);
    }

    // If no good sentence boundary, truncate at word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace) + '...';
    }

    return truncated + '...';
  }

  /**
   * Calculate template score based on multiple factors
   */
  private async calculateTemplateScore(
    template: PromptTemplate,
    playbook: StrategicPlaybook,
    context: MatchingContext,
    options: TemplateSelectionOptions
  ): Promise<number> {
    let score = 0;

    // 1. Effectiveness score (40%)
    const effectiveness = template.effectiveness_score || 0.5;
    score += effectiveness * 0.4;

    // 2. Tag matching (30%)
    const tagMatch = this.calculateTagMatch(template, playbook);
    score += tagMatch * 0.3;

    // 3. Usage frequency (15%)
    const usageScore = Math.min((template.usage_count || 0) / 100, 1);
    score += usageScore * 0.15;

    // 4. Recency (10%)
    const recencyScore = this.calculateRecencyScore(template.updated_at);
    score += recencyScore * 0.1;

    // 5. Context matching (5%)
    const contextScore = this.calculateContextMatch(template, context, playbook);
    score += contextScore * 0.05;

    return score;
  }

  /**
   * Calculate tag match score
   */
  private calculateTagMatch(template: PromptTemplate, playbook: StrategicPlaybook): number {
    const templateTags = template.applicable_tags || [];
    const playbookTags = playbook.type_tags || [];

    if (templateTags.length === 0) {
      return 0.5; // Neutral score for templates without tags
    }

    const matches = templateTags.filter(tag => playbookTags.includes(tag));
    return matches.length / templateTags.length;
  }

  /**
   * Calculate recency score based on update time
   */
  private calculateRecencyScore(updatedAt: number): number {
    const daysSinceUpdate = (Date.now() - updatedAt) / (24 * 60 * 60 * 1000);
    // Score decreases over time, max 1 for same day, 0 after 365 days
    return Math.max(0, 1 - (daysSinceUpdate / 365));
  }

  /**
   * Calculate context match score
   */
  private calculateContextMatch(
    template: PromptTemplate,
    context: MatchingContext,
    playbook: StrategicPlaybook
  ): number {
    let score = 0;

    // Match domain
    if (context.domain && playbook.context?.domain === context.domain) {
      score += 0.4;
    }

    // Match scenario
    if (context.scenario && playbook.context?.scenario === context.scenario) {
      score += 0.3;
    }

    // Match complexity
    if (context.complexity && playbook.context?.complexity === context.complexity) {
      score += 0.3;
    }

    return score;
  }

  /**
   * Estimate token count for content
   */
  private estimateTokenCount(content: string): number {
    // Simple estimation: Chinese ~ 1 char/token, English ~ 4 chars/token
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishChars = content.length - chineseChars;
    return Math.ceil(chineseChars + englishChars / 4);
  }
}
