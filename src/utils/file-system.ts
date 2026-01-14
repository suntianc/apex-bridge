/**
 * File system utilities
 * Shared helpers for file/directory operations across the codebase
 */

import * as fs from "fs/promises";
import * as path from "path";

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a directory exists
 */
export async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Read file content if exists, return null otherwise
 */
export async function readFileIfExists(filePath: string): Promise<string | null> {
  if (await fileExists(filePath)) {
    return fs.readFile(filePath, "utf8");
  }
  return null;
}

/**
 * Ensure directory exists, creating parents if needed
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Remove file if it exists (no error if not found)
 */
export async function removeFileIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code !== "ENOENT"
    ) {
      throw error;
    }
  }
}
