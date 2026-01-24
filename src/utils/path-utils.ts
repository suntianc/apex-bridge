/**
 * Path utilities
 * Shared helpers for path construction and validation across the codebase
 */

import * as path from "path";

/**
 * Resolve path to absolute, normalizing .. and .
 */
export function resolvePath(pathStr: string): string {
  return path.resolve(pathStr);
}

/**
 * Get the directory name of a path
 */
export function getDirName(filePath: string): string {
  return path.dirname(filePath);
}

/**
 * Get the base name of a path (file or directory name)
 */
export function getBaseName(filePath: string): string {
  return path.basename(filePath);
}

/**
 * Get the file extension of a path
 */
export function getExtension(filePath: string): string {
  const ext = path.extname(filePath);
  return ext ? ext.slice(1) : "";
}

/**
 * Get the file name without extension
 */
export function getFileNameWithoutExt(filePath: string): string {
  const base = getBaseName(filePath);
  const ext = path.extname(base);
  return ext ? base.slice(0, -ext.length) : base;
}

/**
 * Check if path has specific extension
 */
export function hasExtension(filePath: string, ext: string): boolean {
  return getExtension(filePath).toLowerCase() === ext.toLowerCase();
}

/**
 * Join path segments
 */
export function joinPath(...segments: string[]): string {
  return path.join(...segments);
}

/**
 * Normalize path (resolve .. and .)
 */
export function normalizePath(pathStr: string): string {
  return path.normalize(pathStr);
}

/**
 * Get relative path from base to target
 */
export function getRelativePath(from: string, to: string): string {
  return path.relative(from, to);
}

/**
 * Check if path is absolute
 */
export function isAbsolutePath(pathStr: string): boolean {
  return path.isAbsolute(pathStr);
}

/**
 * Convert to absolute path if relative
 */
export function toAbsolutePath(pathStr: string, baseDir?: string): string {
  if (isAbsolutePath(pathStr)) {
    return pathStr;
  }
  return baseDir ? path.resolve(baseDir, pathStr) : resolvePath(pathStr);
}

// ============================================================================
// Skill-specific path builders
// ============================================================================

/**
 * Path builders for skill-related operations
 */
export const SkillPaths = {
  /** SKILL.md file path */
  skillFile: (skillPath: string) => path.join(skillPath, "SKILL.md"),

  /** scripts directory path */
  scriptsDir: (skillPath: string) => path.join(skillPath, "scripts"),

  /** execute.js script path */
  executeScript: (skillPath: string) => path.join(skillPath, "scripts", "execute.js"),

  /** .vectorized marker file path */
  vectorizedFile: (skillPath: string) => path.join(skillPath, ".vectorized"),

  /** metadata.json path */
  metadataFile: (skillPath: string) => path.join(skillPath, "metadata.json"),

  /** skill-specific data directory */
  dataDir: (skillPath: string, dataDir: string) =>
    path.join(dataDir, "skills", getBaseName(skillPath)),

  /** Build skill directory path from base */
  fromBase: (skillsBasePath: string, skillName: string) => path.join(skillsBasePath, skillName),
};

// ============================================================================
// Vector database path builders
// ============================================================================

/**
 * Path builders for vector database operations
 */
export const VectorDbPaths = {
  /** Main vector database directory */
  baseDir: (dataDir: string) => path.join(dataDir, "vector"),

  /** Skills vector index */
  skillsIndex: (dataDir: string) => path.join(dataDir, "vector", "skills.index"),

  /** MCP tools vector index */
  mcpToolsIndex: (dataDir: string) => path.join(dataDir, "vector", "mcp-tools.index"),

  /** Embedding cache directory */
  cacheDir: (dataDir: string) => path.join(dataDir, "vector", "cache"),
};

// ============================================================================
// Configuration path builders
// ============================================================================

/**
 * Path builders for configuration files
 */
export const ConfigPaths = {
  /** Main config file */
  mainConfig: (configDir: string) => path.join(configDir, "admin-config.json"),

  /** Environment-specific config */
  envConfig: (configDir: string, env: string) => path.join(configDir, `config.${env}.json`),

  /** User data directory */
  userData: (baseDir: string) => path.join(baseDir, ".data"),
};

// ============================================================================
// Path validation utilities
// ============================================================================

/**
 * Prevent path traversal attacks
 */
export function preventPathTraversal(filePath: string): void {
  if (filePath.includes("..")) {
    throw new Error("Path traversal detected: invalid path sequence");
  }
}

/**
 * Validate that path is within specified directory
 */
export function validateWithinDirectory(filePath: string, baseDir: string): string {
  const absolute = toAbsolutePath(filePath, baseDir);
  const absoluteBase = toAbsolutePath(baseDir);

  if (!absolute.startsWith(absoluteBase)) {
    throw new Error(`Path must be within directory: ${filePath} is not in ${baseDir}`);
  }

  return absolute;
}

/**
 * Validate that path is within working directory
 */
export function validateWithinWorkDir(filePath: string): string {
  return validateWithinDirectory(filePath, process.cwd());
}

/**
 * Sanitize file name (remove invalid characters)
 */
export function sanitizeFileName(fileName: string): string {
  return (
    fileName
      // eslint-disable-next-line no-control-regex -- Intentional removal of control characters for file sanitization
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[<>:"/\\|?*]/g, "_") // Replace invalid chars
      .trim()
  );
}

/**
 * Generate safe file name from string
 */
export function toSafeFileName(str: string): string {
  return sanitizeFileName(
    str
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-_]/g, "")
  );
}

/**
 * Check if path is hidden (starts with .)
 */
export function isHiddenPath(filePath: string): boolean {
  const base = getBaseName(filePath);
  return base.startsWith(".");
}

/**
 * Get common parent directory of multiple paths
 */
export function getCommonParent(paths: string[]): string {
  if (paths.length === 0) {
    return "";
  }

  const normalized = paths.map((p) => normalizePath(p));
  const first = normalized[0].split(path.sep);

  for (let i = 0; i < first.length; i++) {
    const prefix = first.slice(0, i + 1).join(path.sep);

    if (!normalized.every((p) => p.startsWith(prefix))) {
      return first.slice(0, i).join(path.sep) || path.sep;
    }
  }

  return normalized[0];
}
