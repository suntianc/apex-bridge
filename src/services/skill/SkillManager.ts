/**
 * SkillManager - Skill Management Coordinator
 *
 * Main coordinator for skill management, orchestrating all skill-related operations.
 */

import * as fs from "fs/promises";
import * as path from "path";
import matter from "gray-matter";
import { logger } from "../../utils/logger";
import { getToolRetrievalService } from "../tool-retrieval/ToolRetrievalService";
import {
  SkillTool,
  SkillInstallOptions,
  SkillListOptions,
  SkillListResult,
} from "../../types/tool-system";
import { BuiltInSkillLoader, createBuiltInSkillLoader } from "./BuiltInSkillLoader";
import { UserSkillLoader, createUserSkillLoader } from "./UserSkillLoader";
import { DynamicSkillManager, createDynamicSkillManager } from "./DynamicSkillManager";
import { fileExists, directoryExists } from "./skill-utils";

export interface InstallResult {
  success: boolean;
  message: string;
  skillName?: string;
  installedAt?: Date;
  duration?: number;
  vectorized?: boolean;
}

export interface UninstallResult {
  success: boolean;
  message: string;
  skillName?: string;
  uninstalledAt?: Date;
  duration?: number;
}

export interface UpdateResult {
  success: boolean;
  message: string;
  skillName?: string;
  updatedAt?: Date;
  duration?: number;
  reindexed?: boolean;
}

/**
 * SkillManager - Main Skill Management Coordinator
 *
 * Orchestrates all skill-related operations including loading,
 * installation, uninstallation, updates, and dynamic management.
 */
export class SkillManager {
  private static instance: SkillManager | null = null;

  private retrievalService: ReturnType<typeof getToolRetrievalService>;
  private builtInLoader: BuiltInSkillLoader;
  private userLoader: UserSkillLoader;
  private dynamicManager: DynamicSkillManager;
  private skillsBasePath: string;
  private initializationPromise: Promise<void> | null = null;

  protected constructor(skillsBasePath?: string) {
    // Initialize services
    const pathService = require("../PathService").PathService.getInstance();
    const dataDir = pathService.getDataDir();
    this.skillsBasePath = skillsBasePath || path.join(dataDir, "skills");

    const vectorDbPath = path.join(dataDir, "vector-store");
    this.retrievalService = getToolRetrievalService({
      vectorDbPath,
      model: "nomic-embed-text:latest",
      dimensions: 768,
      similarityThreshold: 0.4,
      cacheSize: 1000,
      maxResults: 10,
    });

    // Initialize loaders and managers
    this.builtInLoader = createBuiltInSkillLoader(this.retrievalService);
    this.userLoader = createUserSkillLoader(this.retrievalService, this.skillsBasePath);
    this.dynamicManager = createDynamicSkillManager(
      this.retrievalService,
      this.userLoader,
      this.builtInLoader
    );

    logger.debug("SkillManager initialized", {
      skillsBasePath: this.skillsBasePath,
    });

    this.initializationPromise = Promise.resolve();
  }

  /**
   * Get singleton instance
   */
  static getInstance(skillsBasePath?: string): SkillManager {
    if (!SkillManager.instance) {
      SkillManager.instance = new SkillManager(skillsBasePath);
    }
    return SkillManager.instance;
  }

  /**
   * Reset instance (for testing)
   */
  static resetInstance(): void {
    SkillManager.instance = null;
  }

  /**
   * Install a skill from ZIP buffer
   */
  async installSkill(zipBuffer: Buffer, options: SkillInstallOptions = {}): Promise<InstallResult> {
    const startTime = Date.now();

    try {
      const result = await this.userLoader.installSkillFromZip(zipBuffer, options);

      if (result.success && result.metadata) {
        return {
          success: true,
          message: `Skill '${result.skillName}' installed successfully`,
          skillName: result.skillName,
          installedAt: new Date(),
          duration: Date.now() - startTime,
          vectorized: true,
        };
      } else {
        return {
          success: false,
          message: result.error || "Installation failed",
          duration: Date.now() - startTime,
        };
      }
    } catch (error) {
      logger.error("Skill installation failed:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Installation failed",
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Uninstall a skill
   */
  async uninstallSkill(skillName: string): Promise<UninstallResult> {
    const startTime = Date.now();

    try {
      const result = await this.userLoader.uninstallSkill(skillName);

      if (result.success) {
        return {
          success: true,
          message: `Skill '${skillName}' uninstalled successfully`,
          skillName,
          uninstalledAt: new Date(),
          duration: Date.now() - startTime,
        };
      } else {
        return {
          success: false,
          message: result.error || "Uninstallation failed",
          skillName,
          duration: Date.now() - startTime,
        };
      }
    } catch (error) {
      logger.error("Skill uninstallation failed:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Uninstallation failed",
        skillName,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Update a skill
   */
  async updateSkill(skillName: string, newDescription: string): Promise<UpdateResult> {
    const startTime = Date.now();

    try {
      const result = await this.userLoader.updateSkillDescription(skillName, newDescription);

      if (result.success) {
        return {
          success: true,
          message: `Skill '${skillName}' updated successfully`,
          skillName,
          updatedAt: new Date(),
          duration: Date.now() - startTime,
          reindexed: true,
        };
      } else {
        return {
          success: false,
          message: result.error || "Update failed",
          skillName,
          duration: Date.now() - startTime,
        };
      }
    } catch (error) {
      logger.error("Skill update failed:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Update failed",
        skillName,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * List all skills
   */
  async listSkills(options: SkillListOptions = {}): Promise<SkillListResult> {
    try {
      const skills = await this.dynamicManager.listSkills(options.limit || 50);

      // Apply filtering
      let filtered = skills;

      if (options.name) {
        const nameFilter = options.name.toLowerCase();
        filtered = filtered.filter(
          (skill) =>
            skill.name.toLowerCase().includes(nameFilter) ||
            skill.description.toLowerCase().includes(nameFilter)
        );
      }

      if (options.tags && options.tags.length > 0) {
        filtered = filtered.filter((skill) =>
          skill.tags.some((tag) => options.tags!.includes(tag))
        );
      }

      // Sort
      const sortBy = options.sortBy || "name";
      const sortOrder = options.sortOrder || "asc";
      filtered.sort((a, b) => {
        let aVal: any, bVal: any;
        switch (sortBy) {
          case "name":
            aVal = a.name;
            bVal = b.name;
            break;
          default:
            aVal = a.name;
            bVal = b.name;
        }
        const compare = String(aVal).localeCompare(String(bVal));
        return sortOrder === "desc" ? -compare : compare;
      });

      // Paginate
      const page = options.page || 1;
      const limit = options.limit || 50;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginated = filtered.slice(startIndex, endIndex);

      return {
        skills: paginated,
        total: filtered.length,
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit),
      };
    } catch (error) {
      logger.error("Failed to list skills:", error);
      throw error;
    }
  }

  /**
   * Get a specific skill by name
   */
  async getSkillByName(skillName: string): Promise<SkillTool | null> {
    try {
      const skills = await this.dynamicManager.listSkills(1000);
      return skills.find((s) => s.name === skillName) || null;
    } catch (error) {
      logger.error(`Failed to get skill: ${skillName}`, error);
      return null;
    }
  }

  /**
   * Check if a skill exists
   */
  async isSkillExist(skillName: string): Promise<boolean> {
    const skill = await this.getSkillByName(skillName);
    return skill !== null;
  }

  /**
   * Add a dynamic skill
   */
  async addDynamicSkill(skillData: {
    name: string;
    description: string;
    tags?: string[];
    version?: string;
    metadata?: Record<string, any>;
  }): Promise<{ success: boolean; skillName?: string; error?: string }> {
    return this.dynamicManager.addSkill(skillData);
  }

  /**
   * Remove a dynamic skill
   */
  async removeDynamicSkill(skillName: string): Promise<{ success: boolean; error?: string }> {
    return this.dynamicManager.removeSkill(skillName);
  }

  /**
   * Enable a skill
   */
  async enableSkill(skillName: string): Promise<{ success: boolean; error?: string }> {
    return this.dynamicManager.enableSkill(skillName);
  }

  /**
   * Disable a skill
   */
  async disableSkill(skillName: string): Promise<{ success: boolean; error?: string }> {
    return this.dynamicManager.disableSkill(skillName);
  }

  /**
   * Get skill statistics
   */
  async getStatistics(): Promise<{
    total: number;
    enabled: number;
    disabled: number;
    byTag: Record<string, number>;
  }> {
    const stats = await this.dynamicManager.getStats();
    const skills = await this.dynamicManager.getAllDynamicSkills();

    const byTag: Record<string, number> = {};
    for (const skill of skills) {
      for (const tag of skill.tags) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }
    }

    return {
      total: stats.totalSkills,
      enabled: stats.enabledSkills,
      disabled: stats.disabledSkills,
      byTag,
    };
  }

  /**
   * Get retrieval service
   */
  getRetrievalService(): ReturnType<typeof getToolRetrievalService> {
    return this.retrievalService;
  }

  /**
   * Wait for initialization
   */
  async waitForInitialization(): Promise<void> {
    if (this.initializationPromise) {
      try {
        await this.initializationPromise;
      } catch (error) {
        logger.warn("Skills initialization failed, but system will continue", error);
      }
    }
  }

  /**
   * Initialize skills index
   */
  private async initializeSkillsIndex(): Promise<void> {
    logger.debug("Initializing skills index during startup");

    try {
      await this.retrievalService.initialize();
      await this.retrievalService.scanAndIndexAllSkills(this.skillsBasePath);

      logger.debug("Skills index initialization completed");
    } catch (error) {
      logger.error("Failed to initialize skills index:", error);
      throw error;
    }
  }

  /**
   * Skill Direct Mode - Return SKILL.md content without sandbox execution
   * Used for FR-37~FR-40 scenarios
   */
  async executeDirect(skillName: string, _args: Record<string, unknown>): Promise<string> {
    const skillPath = path.join(this.skillsBasePath, skillName);
    const skillMdPath = path.join(skillPath, "SKILL.md");

    // Check if skill exists
    if (!(await directoryExists(skillPath))) {
      throw new Error(`Skill '${skillName}' not found`);
    }

    // Read SKILL.md
    if (!(await fileExists(skillMdPath))) {
      throw new Error(`SKILL.md not found in Skill '${skillName}'`);
    }

    const content = await fs.readFile(skillMdPath, "utf8");
    const parsed = matter(content);

    // Return content part without frontmatter
    logger.debug(`[SkillManager] Direct execution for skill: ${skillName}`);
    return parsed.content;
  }
}

/**
 * Get default SkillManager
 */
export function getSkillManager(skillsBasePath?: string): SkillManager {
  return SkillManager.getInstance(skillsBasePath);
}
