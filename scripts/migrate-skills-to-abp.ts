import { promises as fs } from 'fs';
import * as path from 'path';

export interface SkillsMigrationOptions {
  dryRun?: boolean;
  skillDir: string;
  outputDir?: string;
  backup?: boolean;
  validate?: boolean;
}

export interface MigrationReport {
  total: number;
  successful: number;
  skipped: number;
  failed: number;
}

export class SkillsMigrationTool {
  private readonly options: SkillsMigrationOptions;

  constructor(options: SkillsMigrationOptions) {
    this.options = options;
  }

  public async migrate(): Promise<MigrationReport> {
    const { skillDir } = this.options;
    const entries = await fs.readdir(skillDir, { withFileTypes: true });
    const skillDirs = entries.filter(e => e.isDirectory()).map(e => path.join(skillDir, e.name));

    let total = 0;
    let successful = 0;
    let skipped = 0;
    let failed = 0;

    for (const dir of skillDirs) {
      const skillMd = path.join(dir, 'SKILL.md');
      total++;
      try {
        await fs.access(skillMd);
        // 在ABP-only 架构下，视为已是ABP格式，直接跳过
        skipped++;
      } catch {
        // 没有 SKILL.md 视为非技能目录，计为失败但不抛出
        failed++;
      }
    }

    return { total, successful, skipped, failed };
  }
}


