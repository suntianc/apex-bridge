/**
 * Skill utilities - shared helpers for skill operations
 */

// File system utilities
export {
  fileExists,
  directoryExists,
  readFileIfExists,
  ensureDirectory,
  removeFileIfExists,
} from "../../utils/file-system";

// Metadata parsing
export {
  parseSkillMetadata,
  readSkillMetadata,
  skillHasMetadata,
  type SkillMetadata,
} from "./skill-metadata";

// Indexing helpers
export {
  toSkillIndexEntry,
  indexSkill,
  removeSkillByName,
  type SkillIndexEntry,
} from "./skill-indexing";
