/**
 * File system utilities
 * Shared helpers for file/directory operations across the codebase
 */

import * as fs from "fs/promises";
import * as path from "path";
import { Stats } from "fs";

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

/**
 * Read and parse JSON file
 */
export async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

/**
 * Read JSON file if exists, return fallback otherwise
 */
export async function readJsonFileIfExists<T>(filePath: string, fallback: T): Promise<T> {
  if (await fileExists(filePath)) {
    const content = await fs.readFile(filePath, "utf8");
    try {
      return JSON.parse(content) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/**
 * Write data to JSON file with pretty formatting
 */
export async function writeJsonFile<T>(
  filePath: string,
  data: T,
  indent: number = 2
): Promise<void> {
  await ensureDirectory(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, indent), "utf8");
}

/**
 * List all directories in a given path
 */
export async function listDirectories(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

/**
 * List all files in a given path
 */
export async function listFiles(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}

/**
 * List all items (files and directories) in a given path
 */
export async function listDirContents(
  dirPath: string
): Promise<Array<{ name: string; isDirectory: boolean }>> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory(),
  }));
}

/**
 * Copy a file from source to destination
 */
export async function copyFile(sourcePath: string, destinationPath: string): Promise<void> {
  await ensureDirectory(path.dirname(destinationPath));
  await fs.copyFile(sourcePath, destinationPath);
}

/**
 * Remove directory recursively (including all contents)
 */
export async function removeDirectory(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
}

/**
 * Get file stats, return null if file doesn't exist
 */
export async function getFileStats(filePath: string): Promise<Stats | null> {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

/**
 * Check if path is a file (not directory)
 */
export async function isFile(filePath: string): Promise<boolean> {
  const stats = await getFileStats(filePath);
  return stats?.isFile() ?? false;
}

/**
 * Check if path is a directory (not file)
 */
export async function isDirectory(dirPath: string): Promise<boolean> {
  const stats = await getFileStats(dirPath);
  return stats?.isDirectory() ?? false;
}
