/**
 * SkillValidator - Skill Validation Logic
 *
 * Handles skill definition validation, structure checks, and metadata verification.
 */

import * as fs from "fs/promises";
import * as path from "path";
import matter from "gray-matter";
import { logger } from "../../utils/logger";
import { SkillMetadata, SkillTool, ToolError, ToolErrorCode } from "../../types/tool-system";
import { fileExists, directoryExists } from "./skill-utils";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: SkillMetadata;
}

export interface SkillValidationConfig {
  requireName?: boolean;
  requireDescription?: boolean;
  requireVersion?: boolean;
  requireScripts?: boolean;
  maxDescriptionLength?: number;
  maxTagsCount?: number;
  maxNameLength?: number;
}

const DEFAULT_CONFIG: SkillValidationConfig = {
  requireName: true,
  requireDescription: true,
  requireVersion: true,
  requireScripts: false,
  maxDescriptionLength: 1024,
  maxTagsCount: 10,
  maxNameLength: 100,
};

/**
 * SkillValidator - Skill Validation Logic
 *
 * Responsible for validating skill definitions and structure.
 */
export class SkillValidator {
  private config: SkillValidationConfig;

  constructor(config: Partial<SkillValidationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate skill metadata
   */
  validateMetadata(metadata: Partial<SkillMetadata>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (this.config.requireName && !metadata.name) {
      errors.push("Skill name is required");
    }

    if (this.config.requireDescription && !metadata.description) {
      errors.push("Skill description is required");
    }

    if (this.config.requireVersion && !metadata.version) {
      errors.push("Skill version is required");
    }

    // Length validations
    if (metadata.name && metadata.name.length > this.config.maxNameLength) {
      errors.push(`Skill name exceeds maximum length of ${this.config.maxNameLength}`);
    }

    if (metadata.description && metadata.description.length > this.config.maxDescriptionLength) {
      errors.push(
        `Skill description exceeds maximum length of ${this.config.maxDescriptionLength}`
      );
    }

    if (metadata.tags && metadata.tags.length > this.config.maxTagsCount) {
      warnings.push(`Skill has more than ${this.config.maxTagsCount} tags`);
    }

    // Version format validation
    if (metadata.version && !this.isValidVersion(metadata.version)) {
      errors.push("Invalid version format. Expected semantic versioning (e.g., 1.0.0)");
    }

    // Tags validation
    if (metadata.tags) {
      for (let i = 0; i < metadata.tags.length; i++) {
        const tag = metadata.tags[i];
        if (typeof tag !== "string") {
          errors.push(`Tag at index ${i} is not a string`);
        } else if (tag.length === 0) {
          errors.push(`Tag at index ${i} is empty`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: errors.length === 0 ? (metadata as SkillMetadata) : undefined,
    };
  }

  /**
   * Validate skill directory structure
   */
  async validateSkillDirectory(skillPath: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check if directory exists
      const exists = await directoryExists(skillPath);
      if (!exists) {
        return {
          valid: false,
          errors: [`Skill directory does not exist: ${skillPath}`],
          warnings: [],
        };
      }

      // Check for SKILL.md
      const skillMdPath = path.join(skillPath, "SKILL.md");
      if (!(await fileExists(skillMdPath))) {
        errors.push("SKILL.md is required");
        return {
          valid: false,
          errors,
          warnings,
        };
      }

      // Read and parse SKILL.md
      const content = await fs.readFile(skillMdPath, "utf8");
      const parsed = matter(content);

      // Validate metadata
      const metadataValidation = this.validateMetadata(parsed.data);
      errors.push(...metadataValidation.errors);
      warnings.push(...metadataValidation.warnings);

      // Check scripts directory if required
      if (this.config.requireScripts) {
        const scriptsDir = path.join(skillPath, "scripts");
        if (!(await directoryExists(scriptsDir))) {
          errors.push("Scripts directory is required in strict validation mode");
        } else {
          const executeScript = path.join(scriptsDir, "execute.js");
          if (!(await fileExists(executeScript))) {
            errors.push("execute.js is required in scripts directory");
          }
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        metadata: metadataValidation.valid ? (parsed.data as SkillMetadata) : undefined,
      };
    } catch (error) {
      logger.error(`Failed to validate skill directory: ${skillPath}`, error);
      return {
        valid: false,
        errors: [`Validation failed: ${error instanceof Error ? error.message : String(error)}`],
        warnings: [],
      };
    }
  }

  /**
   * Validate skill tool definition
   */
  validateSkillTool(tool: Partial<SkillTool>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!tool.name) {
      errors.push("Tool name is required");
    }

    if (!tool.description) {
      errors.push("Tool description is required");
    }

    if (tool.parameters) {
      if (tool.parameters.type !== "object") {
        errors.push("Parameters must be of type object");
      }

      if (tool.parameters.properties) {
        for (const [key, prop] of Object.entries(tool.parameters.properties)) {
          const property = prop as { type?: string };
          if (!property.type) {
            warnings.push(`Property '${key}' has no type defined`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate skill installation options
   */
  validateInstallOptions(options: {
    overwrite?: boolean;
    skipVectorization?: boolean;
    validationLevel?: "basic" | "strict";
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (options.validationLevel && !["basic", "strict"].includes(options.validationLevel)) {
      errors.push(`Invalid validation level: ${options.validationLevel}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate semantic version format
   */
  private isValidVersion(version: string): boolean {
    // Basic semantic versioning regex
    const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
    return semverRegex.test(version);
  }

  /**
   * Update validation config
   */
  updateConfig(config: Partial<SkillValidationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current config
   */
  getConfig(): SkillValidationConfig {
    return { ...this.config };
  }
}

/**
 * Create SkillValidator instance
 */
export function createSkillValidator(config?: Partial<SkillValidationConfig>): SkillValidator {
  return new SkillValidator(config);
}
