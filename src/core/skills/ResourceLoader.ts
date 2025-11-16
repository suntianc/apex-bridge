import { promises as fs, createReadStream, Dirent } from 'fs';
import * as path from 'path';
import logger from '../../utils/logger';
import {
  ResourceLoaderOptions,
  SkillAssetResource,
  SkillReferenceResource,
  SkillResources,
  SkillScriptResource
} from '../../types';
import { SkillsIndex } from './SkillsIndex';
import { SkillsCache } from './SkillsCache';

const DEFAULT_SCRIPT_EXTENSIONS = ['.ts', '.js', '.mjs'];
const DEFAULT_ASSET_EXTENSIONS = ['.json', '.yaml', '.yml', '.png', '.jpg', '.jpeg', '.svg'];
const DEFAULT_REFERENCE_EXTENSIONS = ['.md', '.txt', '.pdf', '.docx', '.csv', '.json', '.yaml', '.yml'];

export class ResourceLoader {
  private readonly skillsIndex: SkillsIndex;
  private readonly cache: SkillsCache;
  private readonly includeScripts: boolean;
  private readonly includeAssets: boolean;

  constructor(
    skillsIndex: SkillsIndex,
    cache: SkillsCache,
    options: ResourceLoaderOptions = {}
  ) {
    this.skillsIndex = skillsIndex;
    this.cache = cache;
    this.includeScripts = options.includeScripts ?? true;
    this.includeAssets = options.includeAssets ?? true;
  }

  async loadResources(skillName: string): Promise<SkillResources | undefined> {
    const cached = this.cache.getResources(skillName);
    if (cached) {
      return cached;
    }

    const skillPath = this.skillsIndex.getSkillPath(skillName);
    if (!skillPath) {
      logger.warn(`[ResourceLoader] 未找到技能路径: ${skillName}`);
      return undefined;
    }

    const scripts: SkillScriptResource[] = [];
    const assets: SkillAssetResource[] = [];
    const references: SkillReferenceResource[] = [];
    const dependencies: string[] = [];

    const scriptsDir = path.join(skillPath, 'scripts');
    const referencesDir = path.join(skillPath, 'references');
    const assetsDir = path.join(skillPath, 'assets');

    const hasScriptsDir = await this.directoryExists(scriptsDir);
    const hasReferencesDir = await this.directoryExists(referencesDir);
    const hasAssetsDir = await this.directoryExists(assetsDir);
    const usesCanonicalLayout = hasScriptsDir || hasReferencesDir || hasAssetsDir;

    if (usesCanonicalLayout) {
      if (hasScriptsDir && this.includeScripts) {
        await this.collectScripts(skillPath, scriptsDir, scripts);
      }
      if (hasReferencesDir) {
        await this.collectReferences(skillPath, referencesDir, references);
      }
      if (hasAssetsDir && this.includeAssets) {
        await this.collectAssets(skillPath, assetsDir, assets);
      }
      await this.collectDependencies(skillPath, dependencies);
    } else {
      await this.traverseResources(
        skillPath,
        skillPath,
        scripts,
        assets,
        dependencies,
        references
      );
    }

    const resources: SkillResources = {
      scripts,
      assets,
      references: references.length > 0 ? references : undefined,
      dependencies,
      loadedAt: Date.now()
    };

    this.cache.setResources(skillName, resources);
    return resources;
  }

  private async collectScripts(
    rootPath: string,
    currentPath: string,
    scripts: SkillScriptResource[]
  ): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      logger.warn(
        `[ResourceLoader] 读取脚本目录失败 (${currentPath}): ${(error as Error).message}`
      );
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await this.collectScripts(rootPath, entryPath, scripts);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!DEFAULT_SCRIPT_EXTENSIONS.includes(ext)) {
        continue;
      }
      try {
        const content = await fs.readFile(entryPath, 'utf-8');
        const stats = await fs.stat(entryPath);
        scripts.push({
          name: entry.name,
          path: path.relative(rootPath, entryPath),
          content,
          size: stats.size,
          language: ext.replace('.', '')
        });
      } catch (error) {
        logger.warn(
          `[ResourceLoader] 读取脚本失败 (${entryPath}): ${(error as Error).message}`
        );
      }
    }
  }

  private async collectReferences(
    rootPath: string,
    currentPath: string,
    references: SkillReferenceResource[]
  ): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      logger.warn(
        `[ResourceLoader] 读取 references 目录失败 (${currentPath}): ${(error as Error).message}`
      );
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await this.collectReferences(rootPath, entryPath, references);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!DEFAULT_REFERENCE_EXTENSIONS.includes(ext)) {
        continue;
      }
      try {
        const stats = await fs.stat(entryPath);
        references.push({
          name: entry.name,
          path: path.relative(rootPath, entryPath),
          size: stats.size,
          mimeType: this.inferMimeType(ext)
        });
      } catch (error) {
        logger.warn(
          `[ResourceLoader] 读取参考文件失败 (${entryPath}): ${(error as Error).message}`
        );
      }
    }
  }

  private async collectAssets(
    rootPath: string,
    currentPath: string,
    assets: SkillAssetResource[]
  ): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      logger.warn(
        `[ResourceLoader] 读取 assets 目录失败 (${currentPath}): ${(error as Error).message}`
      );
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await this.collectAssets(rootPath, entryPath, assets);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!DEFAULT_ASSET_EXTENSIONS.includes(ext)) {
        continue;
      }
      try {
        const stats = await fs.stat(entryPath);
        assets.push({
          name: entry.name,
          path: path.relative(rootPath, entryPath),
          size: stats.size,
          mimeType: this.inferMimeType(ext)
        });
      } catch (error) {
        logger.warn(
          `[ResourceLoader] 读取资产失败 (${entryPath}): ${(error as Error).message}`
        );
      }
    }
  }

  private async collectDependencies(skillPath: string, dependencies: string[]): Promise<void> {
    const nodeModulesPath = path.join(skillPath, 'node_modules');
    if (await this.directoryExists(nodeModulesPath)) {
      dependencies.push('node_modules');
    }
  }

  async createReferenceReadStream(
    skillName: string,
    referencePath: string
  ): Promise<NodeJS.ReadableStream> {
    const skillPath = this.skillsIndex.getSkillPath(skillName);
    if (!skillPath) {
      throw new Error(`未找到技能: ${skillName}`);
    }
    const sanitized = referencePath.replace(/^\.\//, '');
    const absolutePath = path.join(skillPath, sanitized);
    await fs.access(absolutePath);
    return createReadStream(absolutePath);
  }

  private async traverseResources(
    rootPath: string,
    currentPath: string,
    scripts: SkillScriptResource[],
    assets: SkillAssetResource[],
    dependencies: string[],
    references: SkillReferenceResource[]
  ): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      logger.warn(
        `[ResourceLoader] 读取资源目录失败 (${currentPath}): ${(error as Error).message}`
      );
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }

      const entryPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, entryPath);

      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') {
          dependencies.push(relativePath);
          continue;
        }
        await this.traverseResources(rootPath, entryPath, scripts, assets, dependencies, references);
      } else if (entry.isFile()) {
        if (entry.name === 'METADATA.yml' || entry.name === 'SKILL.md') {
          continue;
        }

        const ext = path.extname(entry.name).toLowerCase();
        if (this.includeScripts && DEFAULT_SCRIPT_EXTENSIONS.includes(ext)) {
          try {
            const content = await fs.readFile(entryPath, 'utf-8');
            const stats = await fs.stat(entryPath);
            scripts.push({
              name: entry.name,
              path: relativePath,
              content,
              size: stats.size,
              language: ext.replace('.', '')
            });
          } catch (error) {
            logger.warn(
              `[ResourceLoader] 读取脚本失败 (${entryPath}): ${(error as Error).message}`
            );
          }
        } else if (this.includeAssets && DEFAULT_ASSET_EXTENSIONS.includes(ext)) {
          try {
            const stats = await fs.stat(entryPath);
            assets.push({
              name: entry.name,
              path: relativePath,
              size: stats.size,
              mimeType: this.inferMimeType(ext)
            });
          } catch (error) {
            logger.warn(
              `[ResourceLoader] 读取资源失败 (${entryPath}): ${(error as Error).message}`
            );
          }
        } else if (DEFAULT_REFERENCE_EXTENSIONS.includes(ext)) {
          try {
            const stats = await fs.stat(entryPath);
            references.push({
              name: entry.name,
              path: relativePath,
              size: stats.size,
              mimeType: this.inferMimeType(ext)
            });
          } catch (error) {
            logger.warn(
              `[ResourceLoader] 读取参考文件失败 (${entryPath}): ${(error as Error).message}`
            );
          }
        }
      }
    }
  }

  private inferMimeType(ext: string): string | undefined {
    switch (ext) {
      case '.json':
        return 'application/json';
      case '.yaml':
      case '.yml':
        return 'application/x-yaml';
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.svg':
        return 'image/svg+xml';
      case '.pdf':
        return 'application/pdf';
      case '.docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case '.txt':
        return 'text/plain';
      case '.md':
        return 'text/markdown';
      default:
        return undefined;
    }
  }

  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}

