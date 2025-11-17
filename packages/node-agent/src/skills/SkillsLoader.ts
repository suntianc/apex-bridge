import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { Logger } from 'winston';

export interface SkillMetadata {
  name: string;
  displayName?: string;
  description?: string;
  version?: string;
  type?: string;
  domain?: string;
  input_schema?: any;
  output_schema?: any;
  security?: {
    timeout_ms?: number;
    memory_mb?: number;
    network?: string;
    filesystem?: string;
  };
  resources?: {
    entry?: string;
  };
  cacheable?: boolean;
  ttl?: number;
  [key: string]: any;
}

export interface LoadedSkill {
  name: string;
  metadata: SkillMetadata;
  executePath: string;
  skillPath: string;
}

export interface SkillsLoaderOptions {
  directory?: string;
  logger: Logger;
}

export class SkillsLoader {
  private readonly directory: string;
  private readonly logger: Logger;
  private readonly loadedSkills = new Map<string, LoadedSkill>();

  constructor(options: SkillsLoaderOptions) {
    this.directory = options.directory || './skills';
    this.logger = options.logger.child({ component: 'SkillsLoader' });
  }

  /**
   * 加载所有 Skills
   */
  async loadAll(): Promise<LoadedSkill[]> {
    const resolvedDir = path.resolve(process.cwd(), this.directory);
    
    if (!fs.existsSync(resolvedDir)) {
      this.logger.warn(`Skills directory does not exist: ${resolvedDir}`);
      return [];
    }

    const skills: LoadedSkill[] = [];
    const entries = await fs.promises.readdir(resolvedDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const skillPath = path.join(resolvedDir, entry.name);
      const skill = await this.loadSkill(entry.name, skillPath);
      
      if (skill) {
        skills.push(skill);
        this.loadedSkills.set(skill.name, skill);
      }
    }

    this.logger.info(`Loaded ${skills.length} skill(s) from ${resolvedDir}`);
    return skills;
  }

  /**
   * 加载单个 Skill
   */
  async loadSkill(skillName: string, skillPath?: string): Promise<LoadedSkill | null> {
    const resolvedPath = skillPath || path.resolve(process.cwd(), this.directory, skillName);
    
    if (!fs.existsSync(resolvedPath)) {
      this.logger.warn(`Skill directory does not exist: ${resolvedPath}`);
      return null;
    }

    const skillMdPath = path.join(resolvedPath, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) {
      this.logger.warn(`SKILL.md not found: ${skillMdPath}`);
      return null;
    }

    try {
      const rawContent = await fs.promises.readFile(skillMdPath, 'utf-8');
      const parsed = matter(rawContent);
      
      const metadata = parsed.data as SkillMetadata;
      if (!metadata.name) {
        metadata.name = skillName;
      }

      // 确定执行脚本路径
      const entryPath = metadata.resources?.entry || './scripts/execute.ts';
      const executePath = path.isAbsolute(entryPath)
        ? entryPath
        : path.join(resolvedPath, entryPath);

      // 检查执行脚本是否存在
      if (!fs.existsSync(executePath)) {
        this.logger.warn(`Execute script not found: ${executePath}`);
        return null;
      }

      const skill: LoadedSkill = {
        name: metadata.name,
        metadata,
        executePath,
        skillPath: resolvedPath
      };

      this.logger.debug(`Loaded skill: ${skill.name}`, {
        skillPath: resolvedPath,
        executePath
      });

      return skill;
    } catch (error) {
      this.logger.error(`Failed to load skill ${skillName}:`, {
        error: (error as Error).message,
        skillPath: resolvedPath
      });
      return null;
    }
  }

  /**
   * 获取已加载的 Skill
   */
  getSkill(skillName: string): LoadedSkill | undefined {
    return this.loadedSkills.get(skillName);
  }

  /**
   * 获取所有已加载的 Skills
   */
  getAllSkills(): LoadedSkill[] {
    return Array.from(this.loadedSkills.values());
  }
}

