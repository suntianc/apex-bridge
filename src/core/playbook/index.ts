/**
 * Playbook System - Core Module
 * =============================
 *
 * Entry point for the Playbook system core types and components.
 * 核心 Playbook 系统类型和组件的入口点。
 */

// Export all type definitions
export * from './types';

// Export core components
export { TypeInductionEngine } from './TypeInductionEngine';
export { PromptTemplateService } from './PromptTemplateService';
export { PlaybookTemplateManager } from './PlaybookTemplateManager';

// Export types for external use
export type {
  TemplateSelectionOptions,
  TemplateEvaluationOutcome
} from './PlaybookTemplateManager';
