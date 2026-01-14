/**
 * DynamicSkillManager - Dynamic Skill Management
 *
 * Handles dynamically adding, removing, and updating skills at runtime.
 */

import { logger } from "../../utils/logger";
import { ToolRetrievalService } from "../tool-retrieval/ToolRetrievalService";
import {
  SkillMetadata,
  SkillTool,
  ToolType,
  ToolError,
  ToolErrorCode,
} from "../../types/tool-system";
import { SkillValidator } from "./SkillValidator";
import { UserSkillLoader } from "./UserSkillLoader";
import { BuiltInSkillLoader } from "./BuiltInSkillLoader";

export interface DynamicSkillUpdate {
  skillName: string;
  type: "add" | "remove" | "update" | "enable" | "disable";
  timestamp: Date;
  metadata?: SkillMetadata;
  error?: string;
}

export interface DynamicSkillStats {
  totalSkills: number;
  enabledSkills: number;
  disabledSkills: number;
  recentlyAdded: string[];
  recentlyRemoved: string[];
}

/**
 * DynamicSkillManager - Dynamic Skill Management
 *
 * Responsible for managing skills dynamically at runtime.
 */
export class DynamicSkillManager {
  private retrievalService: ToolRetrievalService;
  private validator: SkillValidator;
  private userLoader: UserSkillLoader;
  private builtInLoader: BuiltInSkillLoader;

  // Track dynamic changes
  private updateHistory: DynamicSkillUpdate[] = [];
  private disabledSkills: Set<string> = new Set();

  constructor(
    retrievalService: ToolRetrievalService,
    userLoader: UserSkillLoader,
    builtInLoader: BuiltInSkillLoader
  ) {
    this.retrievalService = retrievalService;
    this.validator = new SkillValidator();
    this.userLoader = userLoader;
    this.builtInLoader = builtInLoader;

    logger.info("DynamicSkillManager initialized");
  }

  /**
   * Add a new skill dynamically
   */
  async addSkill(skillData: {
    name: string;
    description: string;
    tags?: string[];
    version?: string;
    metadata?: Record<string, any>;
  }): Promise<{ success: boolean; skillName?: string; error?: string }> {
    try {
      logger.info(`Adding dynamic skill: ${skillData.name}`);

      // Validate skill data
      const validation = this.validator.validateMetadata(skillData);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join(", "),
        };
      }

      // Create metadata
      const metadata: SkillMetadata = {
        name: skillData.name,
        description: skillData.description,
        category: "dynamic",
        tools: [],
        version: skillData.version || "1.0.0",
        tags: skillData.tags || [],
        author: "Dynamic",
        dependencies: [],
        parameters: undefined,
        ...skillData.metadata,
      };

      await this.retrievalService.indexTools([
        {
          name: metadata.name,
          description: metadata.description,
          type: "skill" as any,
          tags: metadata.tags || [],
          path: "",
          version: metadata.version,
          metadata: metadata,
        },
      ]);

      // Track the update
      this.recordUpdate({
        skillName: metadata.name,
        type: "add",
        timestamp: new Date(),
        metadata,
      });

      logger.info(`Successfully added dynamic skill: ${metadata.name}`);
      return {
        success: true,
        skillName: metadata.name,
      };
    } catch (error) {
      logger.error(`Failed to add dynamic skill: ${skillData.name}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Remove a skill dynamically
   */
  async removeSkill(skillName: string): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info(`Removing dynamic skill: ${skillName}`);

      // Check if skill is disabled
      if (this.disabledSkills.has(skillName)) {
        this.disabledSkills.delete(skillName);
      }

      // Remove from index
      await this.retrievalService.removeSkill(skillName);

      // Track the update
      this.recordUpdate({
        skillName,
        type: "remove",
        timestamp: new Date(),
      });

      logger.info(`Successfully removed dynamic skill: ${skillName}`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to remove dynamic skill: ${skillName}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Update a skill dynamically
   */
  async updateSkill(
    skillName: string,
    updates: Partial<SkillMetadata>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info(`Updating dynamic skill: ${skillName}`);

      // Validate updates
      const validation = this.validator.validateMetadata({
        name: updates.name,
        description: updates.description,
        version: updates.version,
        tags: updates.tags,
      });

      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join(", "),
        };
      }

      // Remove old version
      await this.retrievalService.removeSkill(skillName);

      await this.retrievalService.indexTools([
        {
          name: updates.name || skillName,
          description: updates.description || "",
          type: "skill" as any,
          tags: updates.tags || [],
          path: "",
          version: updates.version || "1.0.0",
          metadata: updates,
        },
      ]);

      // Track the update
      this.recordUpdate({
        skillName: updates.name || skillName,
        type: "update",
        timestamp: new Date(),
      });

      logger.info(`Successfully updated dynamic skill: ${skillName}`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to update dynamic skill: ${skillName}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Enable a skill
   */
  async enableSkill(skillName: string): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info(`Enabling skill: ${skillName}`);

      if (this.disabledSkills.has(skillName)) {
        this.disabledSkills.delete(skillName);

        this.recordUpdate({
          skillName,
          type: "enable",
          timestamp: new Date(),
        });

        logger.info(`Successfully enabled skill: ${skillName}`);
        return { success: true };
      }

      return {
        success: false,
        error: `Skill ${skillName} is not disabled`,
      };
    } catch (error) {
      logger.error(`Failed to enable skill: ${skillName}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Disable a skill
   */
  async disableSkill(skillName: string): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info(`Disabling skill: ${skillName}`);

      if (!this.disabledSkills.has(skillName)) {
        this.disabledSkills.add(skillName);

        this.recordUpdate({
          skillName,
          type: "disable",
          timestamp: new Date(),
        });

        logger.info(`Successfully disabled skill: ${skillName}`);
        return { success: true };
      }

      return {
        success: false,
        error: `Skill ${skillName} is already disabled`,
      };
    } catch (error) {
      logger.error(`Failed to disable skill: ${skillName}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get all dynamic skills
   */
  async getAllDynamicSkills(): Promise<SkillTool[]> {
    // This would query the retrieval service for all indexed skills
    // that are marked as dynamic
    const allSkills = await this.listSkills(1000);
    return allSkills.filter((skill) => !skill.path || skill.path === "");
  }

  /**
   * List skills with filtering
   */
  async listSkills(limit: number = 50): Promise<SkillTool[]> {
    try {
      // This is a simplified implementation
      // In practice, this would query the retrieval service
      const stats = await this.retrievalService.getStatistics();
      logger.debug("Listing skills, current stats:", stats);

      return [];
    } catch (error) {
      logger.error("Failed to list skills:", error);
      return [];
    }
  }

  /**
   * Get dynamic skill statistics
   */
  async getStats(): Promise<DynamicSkillStats> {
    const allSkills = await this.getAllDynamicSkills();

    return {
      totalSkills: allSkills.length,
      enabledSkills: allSkills.filter((s) => !this.disabledSkills.has(s.name)).length,
      disabledSkills: this.disabledSkills.size,
      recentlyAdded: this.updateHistory
        .filter((u) => u.type === "add")
        .slice(-5)
        .map((u) => u.skillName),
      recentlyRemoved: this.updateHistory
        .filter((u) => u.type === "remove")
        .slice(-5)
        .map((u) => u.skillName),
    };
  }

  /**
   * Get update history
   */
  getUpdateHistory(limit: number = 50): DynamicSkillUpdate[] {
    return this.updateHistory.slice(-limit);
  }

  /**
   * Get disabled skills
   */
  getDisabledSkills(): string[] {
    return Array.from(this.disabledSkills);
  }

  /**
   * Check if skill is enabled
   */
  isSkillEnabled(skillName: string): boolean {
    return !this.disabledSkills.has(skillName);
  }

  /**
   * Record an update
   */
  private recordUpdate(update: DynamicSkillUpdate): void {
    this.updateHistory.push(update);

    // Keep history limited
    if (this.updateHistory.length > 1000) {
      this.updateHistory = this.updateHistory.slice(-500);
    }
  }

  /**
   * Clear update history
   */
  clearHistory(): void {
    this.updateHistory = [];
  }
}

/**
 * Create DynamicSkillManager instance
 */
export function createDynamicSkillManager(
  retrievalService: ToolRetrievalService,
  userLoader: UserSkillLoader,
  builtInLoader: BuiltInSkillLoader
): DynamicSkillManager {
  return new DynamicSkillManager(retrievalService, userLoader, builtInLoader);
}
