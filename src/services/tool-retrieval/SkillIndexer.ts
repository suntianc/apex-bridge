/**
 * SkillIndexer - Skill Indexing
 *
 * Handles skill indexing operations: add, remove, update, and scan.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { createHash } from "crypto";
import matter from "gray-matter";
import { logger } from "../../utils/logger";
import { SkillData, ToolsTable, VectorizedFileData } from "./types";
import type { IVectorStorage, VectorRecord } from "../../core/storage/interfaces";
import { IEmbeddingGenerator } from "./EmbeddingGenerator";

/**
 * SkillIndexer interface
 */
export interface ISkillIndexer {
  addSkill(skill: SkillData): Promise<void>;
  removeSkill(skillId: string): Promise<void>;
  updateSkill(skill: SkillData): Promise<void>;
  addSkillsBatch(skills: SkillData[]): Promise<void>;
  scanAndIndex(dirPath: string): Promise<number>;
  checkReindexRequired(skillPath: string, vectorizedFile: string): Promise<boolean>;
  readSkillMetadata(filePath: string): Promise<SkillData | null>;
  forceReindexAll(skillsDir?: string): Promise<void>;
}

/**
 * SkillIndexer implementation
 */
export class SkillIndexer implements ISkillIndexer {
  private readonly storage: IVectorStorage;
  private readonly embeddingGenerator: IEmbeddingGenerator;
  private readonly defaultSkillsDir: string;

  constructor(
    storage: IVectorStorage,
    embeddingGenerator: IEmbeddingGenerator,
    defaultSkillsDir: string = "./.data/skills"
  ) {
    this.storage = storage;
    this.embeddingGenerator = embeddingGenerator;
    this.defaultSkillsDir = defaultSkillsDir;
  }

  /**
   * Add a skill to the index
   */
  async addSkill(skill: SkillData): Promise<void> {
    try {
      logger.info(`[SkillIndexer] Adding skill: ${skill.name}`);

      // Generate skill ID
      const skillId = this.generateSkillId(skill.name);

      // Generate vector embedding
      const vector = await this.embeddingGenerator.generateForSkill(skill);

      // Prepare record data
      const record = this.prepareSkillRecord(skill, skillId, vector.values);

      // Remove existing skill (update mode)
      await this.removeSkill(skillId);

      await this.storage.upsert(record.id, record.vector, this.buildVectorMetadata(record));
      logger.info(
        `[SkillIndexer] Skill indexed: ${skill.name} (${vector.values.length} dimensions)`
      );
    } catch (error) {
      logger.error(`[SkillIndexer] Failed to add skill ${skill.name}:`, error);
      throw error;
    }
  }

  /**
   * Remove a skill from the index
   */
  async removeSkill(skillId: string): Promise<void> {
    try {
      logger.debug(`[SkillIndexer] Removing skill: ${skillId}`);
      await this.storage.delete(skillId);
    } catch (error) {
      logger.warn(`[SkillIndexer] Failed to remove skill ${skillId}:`, error);
    }
  }

  /**
   * Update a skill in the index
   */
  async updateSkill(skill: SkillData): Promise<void> {
    await this.addSkill(skill);
  }

  /**
   * Batch add skills
   */
  async addSkillsBatch(skills: SkillData[]): Promise<void> {
    const records: ToolsTable[] = [];

    for (const skill of skills) {
      try {
        const skillId = this.generateSkillId(skill.name);
        const vector = await this.embeddingGenerator.generateForSkill(skill);
        const record = this.prepareSkillRecord(skill, skillId, vector.values);
        records.push(record);
      } catch (error) {
        logger.warn(`[SkillIndexer] Failed to index skill ${skill.name}:`, error);
      }
    }

    if (records.length > 0) {
      const vectorRecords = records.map((record) => this.toVectorRecord(record));
      await this.storage.upsertBatch(vectorRecords);
      logger.info(`[SkillIndexer] Batch indexed ${records.length} skills`);
    }
  }

  /**
   * Scan directory and index all skills
   */
  async scanAndIndex(dirPath: string): Promise<number> {
    try {
      logger.info(`[SkillIndexer] Scanning skills directory: ${dirPath}`);

      // Check if directory exists
      try {
        await fs.access(dirPath);
      } catch (error) {
        logger.warn(`[SkillIndexer] Skills directory does not exist: ${dirPath}`, error);
        return 0;
      }

      // Get all skill directories
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const skillDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

      logger.info(`[SkillIndexer] Found ${skillDirs.length} skill directories`);

      // Index each skill
      let indexedCount = 0;
      let skippedCount = 0;

      for (const skillName of skillDirs) {
        try {
          const skillPath = path.join(dirPath, skillName);
          const vectorizedFile = path.join(skillPath, ".vectorized");

          // Check if reindexing is needed
          let needReindex = true;
          if (await this.fileExists(vectorizedFile)) {
            needReindex = await this.checkReindexRequired(skillPath, vectorizedFile);
          }

          if (needReindex) {
            // Read skill metadata
            const skillData = await this.readSkillMetadata(skillPath);

            if (skillData) {
              // Index skill
              await this.addSkill({
                ...skillData,
                filePath: skillPath,
                id: this.generateSkillId(skillData.name),
              });

              // Update .vectorized file
              await this.updateVectorizedFile(vectorizedFile, skillPath);
            }

            indexedCount++;
            logger.debug(`[SkillIndexer] Indexed skill: ${skillName}`);
          } else {
            skippedCount++;
            logger.debug(`[SkillIndexer] Skipped unchanged skill: ${skillName}`);
          }
        } catch (error) {
          logger.warn(`[SkillIndexer] Failed to index skill ${skillName}:`, error);
        }
      }

      logger.info(
        `[SkillIndexer] Scan completed: ${indexedCount} indexed, ${skippedCount} skipped`
      );
      return indexedCount;
    } catch (error) {
      logger.error("[SkillIndexer] Failed to scan and index skills:", error);
      throw error;
    }
  }

  /**
   * Check if reindexing is required
   */
  async checkReindexRequired(skillPath: string, vectorizedFile: string): Promise<boolean> {
    try {
      // Read .vectorized file
      const vectorizedContent = await fs.readFile(vectorizedFile, "utf8");
      const vectorizedData: VectorizedFileData = JSON.parse(vectorizedContent);

      // Calculate current SKILL.md hash
      const skillMdPath = path.join(skillPath, "SKILL.md");
      const skillContent = await fs.readFile(skillMdPath, "utf8");
      const currentHash = createHash("md5").update(skillContent).digest("hex");
      const currentSize = Buffer.byteLength(skillContent);

      // Compare hash and size
      return currentHash !== vectorizedData.skillHash || currentSize !== vectorizedData.skillSize;
    } catch (error) {
      logger.debug(
        `[SkillIndexer] Failed to read vectorized file, need to reindex: ${vectorizedFile}`,
        error
      );
      // File doesn't exist or parse failed, need to index
      return true;
    }
  }

  /**
   * Read skill metadata from SKILL.md
   */
  async readSkillMetadata(filePath: string): Promise<SkillData | null> {
    try {
      const skillMdPath = path.join(filePath, "SKILL.md");

      // Read file
      const content = await fs.readFile(skillMdPath, "utf8");

      // Parse YAML Frontmatter
      const parsed = matter(content);

      if (!parsed.data.name || !parsed.data.description) {
        throw new Error("SKILL.md must contain name and description");
      }

      return {
        id: "",
        name: parsed.data.name,
        description: parsed.data.description,
        tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
        version: parsed.data.version || "1.0.0",
        metadata: {
          tools: parsed.data.tools || [],
        },
      };
    } catch (error) {
      logger.error(`[SkillIndexer] Failed to read skill metadata from ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Generate skill ID
   */
  private generateSkillId(name: string): string {
    return createHash("md5").update(name).digest("hex");
  }

  /**
   * Prepare skill record for database
   */
  private prepareSkillRecord(skill: SkillData, skillId: string, vector: number[]): ToolsTable {
    // Convert tools to parameters format
    const tools = (skill.metadata?.tools as unknown[]) || [];
    const parameters =
      tools.length > 0
        ? {
            type: "object",
            properties: tools.reduce((acc: Record<string, unknown>, tool: unknown) => {
              const t = tool as {
                name?: string;
                description?: string;
                input_schema?: { properties?: Record<string, unknown>; required?: string[] };
              };
              if (t.name) {
                acc[t.name] = {
                  type: "object",
                  description: t.description || "",
                  properties: t.input_schema?.properties || {},
                  required: t.input_schema?.required || [],
                };
              }
              return acc;
            }, {}),
            required: tools
              .filter(
                (t: unknown) =>
                  (t as { input_schema?: { required?: string[] } }).input_schema?.required?.length >
                  0
              )
              .map((t: unknown) => (t as { name?: string }).name)
              .filter((n: unknown): n is string => typeof n === "string"),
          }
        : { type: "object", properties: {}, required: [] };

    return {
      id: skillId,
      name: skill.name,
      description: skill.description,
      tags: skill.tags || [],
      path: skill.filePath,
      version: skill.version || "1.0.0",
      source: skill.name,
      toolType: "skill",
      metadata: JSON.stringify({
        ...skill.metadata,
        tools: skill.metadata?.tools || [],
        parameters,
      }),
      vector,
      indexedAt: new Date(),
    };
  }

  private buildVectorMetadata(record: ToolsTable): Record<string, unknown> {
    return {
      name: record.name,
      description: record.description,
      tags: record.tags,
      path: record.path,
      version: record.version,
      source: record.source,
      toolType: record.toolType,
      metadata: record.metadata,
      indexedAt: record.indexedAt.getTime(),
    };
  }

  private toVectorRecord(record: ToolsTable): VectorRecord {
    return {
      id: record.id,
      vector: record.vector,
      metadata: this.buildVectorMetadata(record),
    };
  }

  /**
   * Update .vectorized file
   */
  private async updateVectorizedFile(vectorizedFile: string, skillPath: string): Promise<void> {
    try {
      const skillMdPath = path.join(skillPath, "SKILL.md");
      const skillContent = await fs.readFile(skillMdPath, "utf8");
      const skillHash = createHash("md5").update(skillContent).digest("hex");
      const skillSize = Buffer.byteLength(skillContent);

      const vectorizedData: VectorizedFileData = {
        indexedAt: Date.now(),
        skillSize,
        skillHash,
      };

      await fs.writeFile(vectorizedFile, JSON.stringify(vectorizedData, null, 2));
      logger.debug(`[SkillIndexer] Updated .vectorized file: ${vectorizedFile}`);
    } catch (error) {
      logger.warn(`[SkillIndexer] Failed to update .vectorized file:`, error);
    }
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      logger.debug(`[SkillIndexer] File does not exist: ${filePath}`);
      return false;
    }
  }

  /**
   * Force reindex all skills (delete all .vectorized files)
   */
  async forceReindexAll(skillsDir: string = this.defaultSkillsDir): Promise<void> {
    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });
      const skillDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

      logger.info(`[SkillIndexer] Force reindexing ${skillDirs.length} skills...`);

      // Delete each skill's .vectorized file
      for (const skillName of skillDirs) {
        const skillPath = path.join(skillsDir, skillName);
        const vectorizedFile = path.join(skillPath, ".vectorized");

        try {
          await fs.unlink(vectorizedFile);
          logger.debug(`[SkillIndexer] Deleted .vectorized file for skill: ${skillName}`);
        } catch (error: any) {
          if (error.code !== "ENOENT") {
            logger.warn(
              `[SkillIndexer] Failed to delete .vectorized file for ${skillName}:`,
              error
            );
          }
        }
      }

      logger.info("[SkillIndexer] Force reindex preparation completed");
    } catch (error) {
      logger.warn("[SkillIndexer] Failed to force reindex skills:", error);
    }
  }
}
