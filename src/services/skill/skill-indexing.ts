/**
 * Skill indexing utilities
 * Shared helpers for indexing skills to the retrieval service
 */

import { ToolRetrievalService } from "../tool-retrieval/ToolRetrievalService";
import { ToolType } from "../tool-retrieval/types";
import { SkillMetadata } from "./skill-metadata";

/**
 * Convert SkillMetadata to SkillTool format for indexing
 */
export interface SkillIndexEntry {
  name: string;
  description: string;
  type: ToolType;
  tags: string[];
  path: string;
  version: string;
  metadata: SkillMetadata;
}

/**
 * Convert skill metadata to indexable format
 */
export function toSkillIndexEntry(metadata: SkillMetadata, skillPath: string): SkillIndexEntry {
  return {
    name: metadata.name,
    description: metadata.description,
    type: ToolType.SKILL,
    tags: metadata.tags || [],
    path: skillPath,
    version: metadata.version || "1.0.0",
    metadata,
  };
}

/**
 * Index a single skill to the retrieval service
 */
export async function indexSkill(
  retrievalService: ToolRetrievalService,
  metadata: SkillMetadata,
  skillPath: string
): Promise<void> {
  const entry = toSkillIndexEntry(metadata, skillPath);
  await retrievalService.indexTools([entry]);
}

/**
 * Remove a skill from the retrieval service by name
 */
export async function removeSkillByName(
  retrievalService: ToolRetrievalService,
  skillName: string
): Promise<void> {
  await retrievalService.removeTool(`skill:${skillName}`);
}
