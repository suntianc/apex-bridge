/**
 * ReadSkillTool - 读取 Skill 文档内置工具
 * 用于读取知识型 Skill 的完整文档内容
 */

import { ToolResult, BuiltInTool, ToolType } from "../../../types/tool-system";
import { getSkillManager } from "../../../services/skill/SkillManager";
import { logger } from "../../../utils/logger";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * ReadSkillTool 参数接口
 */
export interface ReadSkillArgs {
  /** Skill 名称 */
  skillName: string;
  /** 是否包含元数据（默认 false） */
  includeMetadata?: boolean;
}

/**
 * 读取 Skill 工具
 * 用于获取知识型 Skill 的完整文档内容
 */
export class ReadSkillTool {
  /**
   * 执行读取 Skill 文档
   * @param args 读取参数
   * @returns 读取结果
   */
  static async execute(args: ReadSkillArgs): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // 参数验证
      this.validateArgs(args);

      logger.info(`Reading Skill documentation: ${args.skillName}`);

      // 获取 SkillManager
      const skillManager = getSkillManager();

      // 查询 Skill
      const skill = await skillManager.getSkillByName(args.skillName);

      if (!skill) {
        throw new Error(`Skill not found: ${args.skillName}`);
      }

      // 读取 SKILL.md 文件
      const skillMdPath = path.join(skill.path, "SKILL.md");
      const content = await fs.readFile(skillMdPath, "utf8");

      const duration = Date.now() - startTime;

      // 格式化输出
      const output = this.formatSkillContent(args.skillName, content, skill, args.includeMetadata);

      logger.info(`Skill documentation read successfully in ${duration}ms`);

      return {
        success: true,
        output,
        duration,
        exitCode: 0,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error(`Failed to read Skill documentation:`, error);

      return {
        success: false,
        error: this.formatError(error),
        duration,
        errorCode: "READ_SKILL_ERROR",
        exitCode: 1,
      };
    }
  }

  /**
   * 验证参数
   */
  private static validateArgs(args: ReadSkillArgs): void {
    if (!args.skillName || typeof args.skillName !== "string") {
      throw new Error("skillName is required and must be a non-empty string");
    }

    if (args.skillName.trim().length === 0) {
      throw new Error("skillName cannot be empty or whitespace only");
    }
  }

  /**
   * 格式化 Skill 内容
   */
  private static formatSkillContent(
    skillName: string,
    content: string,
    skill: any,
    includeMetadata?: boolean
  ): string {
    let output = `# Skill Documentation: ${skillName}\n\n`;

    // 添加基本信息
    output += `**Version:** ${skill.version || "N/A"}\n`;
    output += `**Description:** ${skill.description}\n`;

    if (skill.tags && skill.tags.length > 0) {
      output += `**Tags:** ${skill.tags.join(", ")}\n`;
    }

    if (skill.author) {
      output += `**Author:** ${skill.author}\n`;
    }

    output += `\n---\n\n`;

    // 添加完整文档内容
    output += content;

    // 可选：添加元数据
    if (includeMetadata && skill.parameters) {
      output += `\n\n---\n\n## Parameters Schema\n\n`;
      output += "```json\n";
      output += JSON.stringify(skill.parameters, null, 2);
      output += "\n```\n";
    }

    return output;
  }

  /**
   * 格式化错误信息
   */
  private static formatError(error: any): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    return "Unknown error occurred while reading Skill documentation";
  }

  /**
   * 获取工具元数据
   */
  static getMetadata() {
    return {
      name: "read-skill",
      description:
        "Read the complete documentation of a Skill. Use this to get detailed information about knowledge-based Skills or to understand how to use executable Skills.",
      category: "skill",
      level: 1,
      parameters: {
        type: "object",
        properties: {
          skillName: {
            type: "string",
            description: 'The name of the Skill to read (e.g., "calculator")',
          },
          includeMetadata: {
            type: "boolean",
            description: "Whether to include parameter schema metadata in the output",
            default: false,
          },
        },
        required: ["skillName"],
      },
    };
  }
}

/**
 * 创建 ReadSkillTool 实例（用于注册表）
 */
export function createReadSkillTool() {
  return {
    ...ReadSkillTool.getMetadata(),
    type: ToolType.BUILTIN,
    enabled: true,
    execute: async (args: Record<string, any>) => {
      return ReadSkillTool.execute(args as ReadSkillArgs);
    },
  } as BuiltInTool;
}
