/**
 * BuiltInSkillLoader - Built-in Skill Loading
 *
 * Handles loading and registration of built-in skills during startup.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "../../utils/logger";
import { ToolRetrievalService } from "../ToolRetrievalService";
import { SkillMetadata, SkillTool, ToolType } from "../../types/tool-system";

export interface BuiltInSkillInfo {
  name: string;
  description: string;
  category?: string;
  version: string;
  tags: string[];
  author?: string;
  path: string;
}

/**
 * BuiltInSkillLoader - Built-in Skill Loading
 *
 * Responsible for loading built-in skills during system startup.
 */
export class BuiltInSkillLoader {
  private retrievalService: ToolRetrievalService;
  private builtInSkillsDir: string;

  constructor(retrievalService: ToolRetrievalService, builtInSkillsDir: string = "./skills") {
    this.retrievalService = retrievalService;
    this.builtInSkillsDir = builtInSkillsDir;
    logger.info("BuiltInSkillLoader initialized", {
      builtInSkillsDir,
    });
  }

  /**
   * Load all built-in skills
   */
  async loadAllBuiltInSkills(): Promise<BuiltInSkillInfo[]> {
    logger.info("Loading built-in skills from:", this.builtInSkillsDir);

    try {
      const entries = await fs.readdir(this.builtInSkillsDir, { withFileTypes: true });
      const skillDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

      const loadedSkills: BuiltInSkillInfo[] = [];

      for (const skillName of skillDirs) {
        try {
          const skillPath = path.join(this.builtInSkillsDir, skillName);
          const metadata = await this.loadBuiltInSkill(skillPath);

          if (metadata) {
            loadedSkills.push({
              ...metadata,
              path: skillPath,
            });
          }
        } catch (error) {
          logger.warn(`Failed to load built-in skill: ${skillName}`, error);
        }
      }

      logger.info(`Loaded ${loadedSkills.length} built-in skills`);
      return loadedSkills;
    } catch (error) {
      logger.warn("Failed to load built-in skills directory:", error);
      return [];
    }
  }

  /**
   * Load a single built-in skill
   */
  async loadBuiltInSkill(skillPath: string): Promise<SkillMetadata | null> {
    try {
      const skillMdPath = path.join(skillPath, "SKILL.md");

      if (!(await this.fileExists(skillMdPath))) {
        logger.warn(`SKILL.md not found for built-in skill: ${skillPath}`);
        return null;
      }

      const content = await fs.readFile(skillMdPath, "utf8");
      const metadata = await this.parseSkillMetadata(content);

      // Index the built-in skill
      await this.retrievalService.indexSkill({
        name: metadata.name,
        description: metadata.description,
        tags: metadata.tags || [],
        path: skillPath,
        version: metadata.version,
        metadata: metadata,
      });

      logger.debug(`Loaded built-in skill: ${metadata.name}`);
      return metadata;
    } catch (error) {
      logger.warn(`Failed to load built-in skill: ${skillPath}`, error);
      return null;
    }
  }

  /**
   * Parse skill metadata from content
   */
  private async parseSkillMetadata(content: string): Promise<SkillMetadata> {
    const matter = await import("gray-matter");
    const parsed = matter.default(content);

    return {
      name: parsed.data.name || "Unnamed Skill",
      description: parsed.data.description || "",
      category: parsed.data.category || "uncategorized",
      tools: parsed.data.tools || [],
      version: parsed.data.version || "1.0.0",
      tags: parsed.data.tags || [],
      author: parsed.data.author || "System",
      dependencies: parsed.data.dependencies || [],
      parameters: parsed.data.parameters,
    };
  }

  /**
   * Convert to SkillTool format
   */
  convertToSkillTool(metadata: SkillMetadata, skillPath: string): SkillTool {
    return {
      name: metadata.name,
      type: ToolType.SKILL,
      description: metadata.description,
      parameters: metadata.parameters || {
        type: "object",
        properties: {},
        required: [],
      },
      version: metadata.version,
      tags: metadata.tags,
      author: metadata.author,
      enabled: true,
      path: skillPath,
      level: 1,
    };
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get built-in skills directory
   */
  getBuiltInSkillsDir(): string {
    return this.builtInSkillsDir;
  }
}

/**
 * Create BuiltInSkillLoader instance
 */
export function createBuiltInSkillLoader(
  retrievalService: ToolRetrievalService,
  builtInSkillsDir?: string
): BuiltInSkillLoader {
  return new BuiltInSkillLoader(retrievalService, builtInSkillsDir);
}
