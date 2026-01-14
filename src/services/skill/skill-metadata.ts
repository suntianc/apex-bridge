/**
 * Skill metadata parsing utilities
 * Shared helpers for parsing SKILL.md frontmatter
 */

import * as fs from "fs/promises";
import * as path from "path";
import matter from "gray-matter";
import { fileExists } from "../../utils/file-system";
import type {
  SkillMetadata as BaseSkillMetadata,
  ToolParameterSchema,
} from "../../types/tool-system";

/**
 * Extended skill metadata interface (with optional fields for parsing)
 */
export interface SkillMetadata extends Omit<BaseSkillMetadata, "tools"> {
  tools?: Array<{
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
  }>;
  level?: number;
}

/**
 * Parse skill metadata from SKILL.md content
 */
export async function parseSkillMetadata(content: string): Promise<BaseSkillMetadata> {
  const parsed = matter(content);
  const data = parsed.data;

  if (!data.name || !data.description) {
    throw new Error("SKILL.md must contain name and description in frontmatter");
  }

  return {
    name: (data.name as string) || "Unnamed Skill",
    description: (data.description as string) || "",
    category: (data.category as string) || "uncategorized",
    tags: (data.tags as string[]) || [],
    version: (data.version as string) || "1.0.0",
    author: (data.author as string) || "System",
    dependencies: (data.dependencies as string[]) || [],
    parameters: (data.parameters as ToolParameterSchema) || {
      type: "object",
      properties: {},
      required: [],
    },
    tools: (data.tools as string[]) || [],
  };
}

/**
 * Read and parse skill metadata from a skill directory
 */
export async function readSkillMetadata(skillPath: string): Promise<BaseSkillMetadata> {
  const skillMdPath = path.join(skillPath, "SKILL.md");

  if (!(await fileExists(skillMdPath))) {
    throw new Error(`SKILL.md not found in ${skillPath}`);
  }

  const content = await fs.readFile(skillMdPath, "utf8");
  return parseSkillMetadata(content);
}

/**
 * Check if a skill directory has a valid SKILL.md
 */
export async function skillHasMetadata(skillPath: string): Promise<boolean> {
  const skillMdPath = path.join(skillPath, "SKILL.md");
  return fileExists(skillMdPath);
}
