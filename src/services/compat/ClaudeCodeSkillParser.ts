/**
 * ClaudeCodeSkillParser - Claude Code Skill 格式转换器
 * 解析 Claude Code SKILL.md 文件并转换为内部 SkillMetadata 格式
 */

import * as fs from "fs/promises";
import * as path from "path";
import matter from "gray-matter";
import { SkillMetadata } from "../../types/tool-system";
import { ClaudeCodeSkillFrontmatter, ParsedClaudeSkill, ParseError, ParseErrorCode } from "./types";
import { logger } from "../../utils/logger";

/**
 * 解析结果类型
 */
export interface ParseResult {
  success: boolean;
  metadata?: SkillMetadata;
  compatibility?: ParsedClaudeSkill["compatibility"];
  content?: string;
  errors: ParseError[];
  warnings: string[];
}

/**
 * 保留关键字列表
 */
const RESERVED_WORDS = ["claude", "anthropic", "system", "admin", "apexbridge", "builtin"];

/**
 * Claude Code Skill 格式转换器
 */
export class ClaudeCodeSkillParser {
  /**
   * 解析 SKILL.md 文件
   * @param skillPath Skill 目录路径
   * @returns 解析后的 Claude Skill 对象
   */
  async parse(skillPath: string): Promise<ParsedClaudeSkill> {
    const skillMdPath = path.join(skillPath, "SKILL.md");

    try {
      await fs.access(skillMdPath);
    } catch (error) {
      logger.debug(`[ClaudeCodeSkillParser] SKILL.md not found at ${skillMdPath}`, error);
      throw new ParseError(`SKILL.md not found at ${skillMdPath}`, ParseErrorCode.FILE_NOT_FOUND);
    }

    const content = await fs.readFile(skillMdPath, "utf8");
    return this.parseContent(content);
  }

  /**
   * 直接解析 SKILL.md 内容
   * @param rawContent SKILL.md 原始内容
   * @returns 解析后的 Claude Skill 对象
   */
  parseContent(rawContent: string): ParsedClaudeSkill {
    const parsed = matter(rawContent);
    const frontmatter = parsed.data as ClaudeCodeSkillFrontmatter;

    // 验证并映射字段
    const validationResult = this.validateFrontmatter(frontmatter);
    if (!validationResult.valid) {
      const errorMessages = validationResult.errors.map((e) => e.message).join(", ");
      throw new ParseError(
        `Validation failed: ${errorMessages}`,
        ParseErrorCode.UNKNOWN_ERROR,
        "frontmatter"
      );
    }

    const metadata = this.mapToSkillMetadata(frontmatter);
    const compatibility = this.extractCompatibility(frontmatter);

    logger.debug("Parsed Claude Code Skill", {
      name: metadata.name,
      version: metadata.version,
    });

    return {
      metadata,
      compatibility,
      content: parsed.content,
    };
  }

  /**
   * 增强的 frontmatter 验证
   */
  private validateFrontmatter(frontmatter: any): {
    valid: boolean;
    errors: ParseError[];
    warnings: string[];
  } {
    const errors: ParseError[] = [];
    const warnings: string[] = [];

    // 1. 必填字段验证
    if (!frontmatter) {
      errors.push(
        new ParseError("Frontmatter is missing or empty", ParseErrorCode.FRONTMATTER_MISSING)
      );
      return { valid: false, errors, warnings };
    }

    // 2. name 验证（严格）
    if (!frontmatter.name) {
      errors.push(
        new ParseError('Field "name" is required', ParseErrorCode.MISSING_NAME, "name", [
          "Add a unique name for the skill",
        ])
      );
    } else if (typeof frontmatter.name !== "string") {
      errors.push(
        new ParseError('Field "name" must be a string', ParseErrorCode.INVALID_NAME_FORMAT, "name")
      );
    } else if (frontmatter.name.length > 64) {
      errors.push(
        new ParseError('Field "name" exceeds 64 characters', ParseErrorCode.NAME_TOO_LONG, "name", [
          `Current length: ${frontmatter.name.length}`,
          "Shorten the name to 64 characters or less",
        ])
      );
    } else if (!/^[a-z0-9-]+$/.test(frontmatter.name)) {
      errors.push(
        new ParseError(
          'Field "name" must contain only lowercase letters, numbers, and hyphens',
          ParseErrorCode.INVALID_NAME_FORMAT,
          "name",
          ["Use only lowercase letters (a-z), numbers (0-9), and hyphens (-)"]
        )
      );
    } else {
      // 检查保留字（仅当 name 有效时）
      if (RESERVED_WORDS.some((word) => frontmatter.name.toLowerCase().includes(word))) {
        errors.push(
          new ParseError(
            `name cannot contain reserved words: ${RESERVED_WORDS.join(", ")}`,
            ParseErrorCode.RESERVED_NAME,
            "name"
          )
        );
      }
    }

    // 3. description 验证
    if (!frontmatter.description) {
      errors.push(
        new ParseError(
          'Field "description" is required',
          ParseErrorCode.MISSING_DESCRIPTION,
          "description"
        )
      );
    } else if (frontmatter.description.length > 1024) {
      errors.push(
        new ParseError(
          'Field "description" must be 1024 characters or less',
          ParseErrorCode.MISSING_DESCRIPTION,
          "description"
        )
      );
    }

    // 4. version 验证（可选但格式检查）
    if (frontmatter.version !== undefined) {
      if (typeof frontmatter.version !== "string") {
        warnings.push('Field "version" should be a string');
      } else if (!/^\d+\.\d+\.\d+$/.test(frontmatter.version)) {
        warnings.push('Field "version" should follow semantic versioning (x.y.z)');
      }
    }

    // 5. context 验证（可选）
    if (frontmatter.context !== undefined) {
      if (!["fork", "inline"].includes(frontmatter.context)) {
        errors.push(
          new ParseError(
            'Field "context" must be "fork" or "inline"',
            ParseErrorCode.INVALID_CONTEXT,
            "context"
          )
        );
      }
    }

    // 6. allowedTools validation (optional)
    if (frontmatter.allowedTools !== undefined) {
      // Allow string or array
      if (typeof frontmatter.allowedTools === "string") {
        // Single tool will be converted to array
        warnings.push('Field "allowedTools" as string will be converted to array');
      } else if (!Array.isArray(frontmatter.allowedTools)) {
        errors.push(
          new ParseError(
            'Field "allowedTools" must be a string or array',
            ParseErrorCode.INVALID_ALLOWED_TOOLS,
            "allowedTools"
          )
        );
      } else {
        for (let i = 0; i < frontmatter.allowedTools.length; i++) {
          const tool = frontmatter.allowedTools[i];
          if (typeof tool !== "string") {
            errors.push(
              new ParseError(
                `allowedTools[${i}] must be a string`,
                ParseErrorCode.INVALID_ALLOWED_TOOLS,
                `allowedTools[${i}]`
              )
            );
          }
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * 解析 content 并返回包含错误和警告的结果
   */
  parseContentWithResult(rawContent: string): ParseResult {
    // 增强的 YAML 解析（容错）
    let frontmatter: any;
    let yamlErrors: ParseError[] = [];

    try {
      const parsed = matter(rawContent);
      frontmatter = parsed.data;
    } catch (error: any) {
      // YAML 解析失败
      yamlErrors.push(
        new ParseError(
          `Failed to parse YAML frontmatter: ${error.message}`,
          ParseErrorCode.INVALID_YAML,
          undefined,
          [
            "Check for syntax errors in YAML",
            "Ensure proper indentation (2 spaces)",
            "Verify quoted strings are properly closed",
          ]
        )
      );
      frontmatter = null;
    }

    // 验证并映射字段
    const validationResult = this.validateFrontmatter(frontmatter);
    const allErrors = [...yamlErrors, ...validationResult.errors];

    if (!validationResult.valid || yamlErrors.length > 0) {
      return {
        success: false,
        errors: allErrors,
        warnings: validationResult.warnings,
      };
    }

    const metadata = this.mapToSkillMetadata(frontmatter);
    const compatibility = this.extractCompatibility(frontmatter);
    const parsed = matter(rawContent);

    logger.debug("Parsed Claude Code Skill", {
      name: metadata.name,
      version: metadata.version,
    });

    return {
      success: true,
      metadata,
      compatibility,
      content: parsed.content,
      errors: allErrors,
      warnings: validationResult.warnings,
    };
  }

  /**
   * 映射到内部 SkillMetadata 格式
   */
  private mapToSkillMetadata(frontmatter: ClaudeCodeSkillFrontmatter): SkillMetadata {
    return {
      name: frontmatter.name,
      description: frontmatter.description,
      version: frontmatter.version || "0.1.0",
      tags: frontmatter.tags || [],
      author: frontmatter.author,
      // 映射 requires 到 dependencies
      dependencies: frontmatter.requires || [],
    };
  }

  /**
   * Extract compatibility fields
   */
  private extractCompatibility(
    frontmatter: ClaudeCodeSkillFrontmatter
  ): ParsedClaudeSkill["compatibility"] {
    // Convert string allowedTools to array
    let allowedTools: string[] = [];
    if (frontmatter.allowedTools !== undefined) {
      allowedTools =
        typeof frontmatter.allowedTools === "string"
          ? [frontmatter.allowedTools]
          : frontmatter.allowedTools;
    }

    return {
      allowedTools,
      model: frontmatter.model,
      context: frontmatter.context,
      agent: frontmatter.agent,
      hooks: frontmatter.hooks,
      userInvocable: frontmatter.userInvocable ?? false,
      source: "claude-code" as const,
    };
  }

  /**
   * 批量解析目录中的所有 Skills
   * @param skillsDir Skills 根目录路径
   * @returns 解析结果映射
   */
  async parseDirectory(skillsDir: string): Promise<Map<string, ParsedClaudeSkill>> {
    const result = new Map<string, ParsedClaudeSkill>();

    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(skillsDir, entry.name);

          try {
            const parsed = await this.parse(skillPath);
            result.set(entry.name, parsed);
          } catch (error) {
            logger.warn(`Failed to parse skill at ${skillPath}:`, error);
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to read skills directory: ${skillsDir}`, error);
    }

    return result;
  }
}

/**
 * 默认解析器实例
 */
let defaultParser: ClaudeCodeSkillParser | null = null;

export function getClaudeCodeSkillParser(): ClaudeCodeSkillParser {
  if (!defaultParser) {
    defaultParser = new ClaudeCodeSkillParser();
  }
  return defaultParser;
}
