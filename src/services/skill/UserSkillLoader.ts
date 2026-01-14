/**
 * UserSkillLoader - User Skill Loading
 *
 * Handles loading user-defined skills from the skills directory.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import * as AdmZip from "adm-zip";
import matter from "gray-matter";
import { logger } from "../../utils/logger";
import { SkillMetadata, SkillTool, ToolType, SkillInstallOptions } from "../../types/tool-system";
import { ToolRetrievalService } from "../tool-retrieval/ToolRetrievalService";
import {
  fileExists,
  directoryExists,
  removeFileIfExists,
  ensureDirectory,
  readSkillMetadata,
} from "./skill-utils";

export interface UserSkillLoadResult {
  success: boolean;
  skillName?: string;
  metadata?: SkillMetadata;
  error?: string;
}

/**
 * UserSkillLoader - User Skill Loading
 *
 * Responsible for loading and managing user-defined skills.
 */
export class UserSkillLoader {
  private retrievalService: ToolRetrievalService;
  private skillsBasePath: string;

  constructor(retrievalService: ToolRetrievalService, skillsBasePath: string) {
    this.retrievalService = retrievalService;
    this.skillsBasePath = skillsBasePath;
    logger.info("UserSkillLoader initialized", {
      skillsBasePath,
    });
  }

  /**
   * Load all user skills
   */
  async loadAllUserSkills(): Promise<UserSkillLoadResult[]> {
    logger.info("Loading user skills from:", this.skillsBasePath);

    try {
      await this.ensureSkillsDirectory();

      const entries = await fs.readdir(this.skillsBasePath, { withFileTypes: true });
      const skillDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

      const results: UserSkillLoadResult[] = [];

      for (const skillName of skillDirs) {
        try {
          const skillPath = path.join(this.skillsBasePath, skillName);
          const result = await this.loadUserSkill(skillPath);
          results.push(result);
        } catch (error) {
          results.push({
            success: false,
            skillName,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info(`Loaded ${results.filter((r) => r.success).length} user skills`);
      return results;
    } catch (error) {
      logger.warn("Failed to load user skills directory:", error);
      return [];
    }
  }

  /**
   * Load a single user skill
   */
  async loadUserSkill(skillPath: string): Promise<UserSkillLoadResult> {
    try {
      const skillName = path.basename(skillPath);
      const metadata = await this.readSkillMetadata(skillPath);

      await this.retrievalService.indexTools([
        {
          name: metadata.name,
          description: metadata.description,
          type: "skill" as any,
          tags: metadata.tags || [],
          path: skillPath,
          version: metadata.version,
          metadata: metadata,
        },
      ]);

      logger.debug(`Loaded user skill: ${metadata.name}`);
      return {
        success: true,
        skillName: metadata.name,
        metadata,
      };
    } catch (error) {
      logger.warn(`Failed to load user skill: ${skillPath}`, error);
      return {
        success: false,
        skillName: path.basename(skillPath),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Install a skill from ZIP buffer
   */
  async installSkillFromZip(
    zipBuffer: Buffer,
    options: SkillInstallOptions = {}
  ): Promise<UserSkillLoadResult> {
    try {
      // Extract to temp directory
      const tempDir = await this.extractZipToTemp(zipBuffer);
      logger.debug(`Extracted ZIP to temp directory: ${tempDir}`);

      // Validate skill structure
      const metadata = await this.validateSkillStructure(tempDir, options.validationLevel);

      // Check for name conflicts
      const targetDir = path.join(this.skillsBasePath, metadata.name);
      const exists = await directoryExists(targetDir);

      if (exists && !options.overwrite) {
        return {
          success: false,
          skillName: metadata.name,
          error: `Skill '${metadata.name}' already exists. Use overwrite: true to replace.`,
        };
      }

      // If exists and overwrite, remove first
      if (exists) {
        await removeFileIfExists(targetDir);
      }

      // Move to target directory
      await fs.mkdir(path.dirname(targetDir), { recursive: true });
      await fs.rename(tempDir, targetDir);

      // Create .vectorized file
      const vectorizedFile = path.join(targetDir, ".vectorized");
      await fs.writeFile(vectorizedFile, "");

      await this.retrievalService.indexTools([
        {
          name: metadata.name,
          description: metadata.description,
          type: "skill" as any,
          tags: metadata.tags || [],
          path: targetDir,
          version: metadata.version,
          metadata: metadata,
        },
      ]);

      logger.info(`Successfully installed user skill: ${metadata.name}`);
      return {
        success: true,
        skillName: metadata.name,
        metadata,
      };
    } catch (error) {
      logger.error("Failed to install skill from ZIP:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Uninstall a user skill
   */
  async uninstallSkill(skillName: string): Promise<UserSkillLoadResult> {
    try {
      const skillPath = path.join(this.skillsBasePath, skillName);

      if (!(await directoryExists(skillPath))) {
        return {
          success: false,
          skillName,
          error: `Skill '${skillName}' not found`,
        };
      }

      // Remove from index
      await this.retrievalService.removeSkill(skillName);

      // Remove directory
      await fs.rm(skillPath, { recursive: true, force: true });

      logger.info(`Successfully uninstalled user skill: ${skillName}`);
      return {
        success: true,
        skillName,
      };
    } catch (error) {
      logger.error(`Failed to uninstall skill: ${skillName}`, error);
      return {
        success: false,
        skillName,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Update skill description
   */
  async updateSkillDescription(
    skillName: string,
    newDescription: string
  ): Promise<UserSkillLoadResult> {
    try {
      const skillPath = path.join(this.skillsBasePath, skillName);

      if (!(await directoryExists(skillPath))) {
        return {
          success: false,
          skillName,
          error: `Skill '${skillName}' not found`,
        };
      }

      const skillMdPath = path.join(skillPath, "SKILL.md");

      if (!(await fileExists(skillMdPath))) {
        return {
          success: false,
          skillName,
          error: `SKILL.md not found in skill '${skillName}'`,
        };
      }

      // Read and parse SKILL.md
      const content = await fs.readFile(skillMdPath, "utf8");
      const parsed = matter(content);

      // Update description
      parsed.data.description = newDescription;
      parsed.data.updatedAt = new Date().toISOString();

      // Write back
      const yaml = await import("js-yaml");
      const yamlStr = yaml.dump(parsed.data, { indent: 2 });
      const newContent = `---\n${yamlStr}---\n${parsed.content}`;
      await fs.writeFile(skillMdPath, newContent);

      // Reindex
      const metadata = await this.readSkillMetadata(skillPath);
      await this.retrievalService.removeSkill(metadata.name);
      await this.retrievalService.indexTools([
        {
          name: metadata.name,
          description: metadata.description,
          type: "skill" as any,
          tags: metadata.tags || [],
          path: skillPath,
          version: metadata.version,
          metadata: metadata,
        },
      ]);

      logger.info(`Successfully updated skill description: ${skillName}`);
      return {
        success: true,
        skillName,
        metadata,
      };
    } catch (error) {
      logger.error(`Failed to update skill description: ${skillName}`, error);
      return {
        success: false,
        skillName,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Read skill metadata
   */
  private async readSkillMetadata(skillPath: string): Promise<SkillMetadata> {
    return readSkillMetadata(skillPath);
  }

  /**
   * Validate skill structure
   */
  private async validateSkillStructure(
    skillPath: string,
    validationLevel: SkillInstallOptions["validationLevel"] = "basic"
  ): Promise<SkillMetadata> {
    const requiredFiles = ["SKILL.md"];

    for (const file of requiredFiles) {
      const filePath = path.join(skillPath, file);
      if (!(await fileExists(filePath))) {
        throw new Error(`Required file missing: ${file}`);
      }
    }

    const metadata = await this.readSkillMetadata(skillPath);

    if (!metadata.name || !metadata.description) {
      throw new Error("SKILL.md must contain name and description");
    }

    if (validationLevel === "strict") {
      const scriptsDir = path.join(skillPath, "scripts");
      if (!(await directoryExists(scriptsDir))) {
        throw new Error("Scripts directory not found in strict validation mode");
      }

      const executeScript = path.join(scriptsDir, "execute.js");
      if (!(await fileExists(executeScript))) {
        throw new Error("execute.js not found in scripts directory");
      }
    }

    return metadata;
  }

  /**
   * Extract ZIP to temp directory
   */
  private async extractZipToTemp(zipBuffer: Buffer): Promise<string> {
    const tempId = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const tempDir = path.join(os.tmpdir(), "skill-install", tempId);

    await fs.mkdir(tempDir, { recursive: true });

    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(tempDir, true);

    return tempDir;
  }

  /**
   * Ensure skills directory exists
   */
  private async ensureSkillsDirectory(): Promise<void> {
    try {
      const exists = await directoryExists(this.skillsBasePath);
      if (!exists) {
        await fs.mkdir(this.skillsBasePath, { recursive: true });
      }
    } catch (error) {
      logger.warn(`Failed to create skills directory: ${this.skillsBasePath}`, error);
    }
  }

  /**
   * Get skills base path
   */
  getSkillsBasePath(): string {
    return this.skillsBasePath;
  }
}

/**
 * Create UserSkillLoader instance
 */
export function createUserSkillLoader(
  retrievalService: ToolRetrievalService,
  skillsBasePath?: string
): UserSkillLoader {
  // Use environment variable or default path
  const dataDir = process.env.APEX_BRIDGE_DATA_DIR || path.join(process.cwd(), ".data");
  const defaultPath = skillsBasePath || path.join(dataDir, "skills");

  return new UserSkillLoader(retrievalService, defaultPath);
}
