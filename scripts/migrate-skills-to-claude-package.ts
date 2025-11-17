import { promises as fs } from 'fs';
import * as path from 'path';
import matter from 'gray-matter';

export interface PackagerOptions {
  skillDir: string;
  validateOnly?: boolean;
}

export interface PackagerReport {
  migrated: number;
  validated: number;
  failed: number;
}

export class ClaudeSkillsPackager {
  private readonly options: PackagerOptions;

  constructor(options: PackagerOptions) {
    this.options = options;
  }

  public async run(): Promise<PackagerReport> {
    const { skillDir, validateOnly } = this.options;
    const entries = await fs.readdir(skillDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => path.join(skillDir, e.name));

    let migrated = 0;
    let validated = 0;
    let failed = 0;

    for (const dir of dirs) {
      try {
        const skillPath = path.join(dir, 'SKILL.md');
        const metadataPath = path.join(dir, 'METADATA.yml');
        await fs.access(skillPath);

        if (!validateOnly) {
          // 1) 确保 scripts/execute.ts 存在
          const scriptsDir = path.join(dir, 'scripts');
          await fs.mkdir(scriptsDir, { recursive: true });
          const executeFile = path.join(scriptsDir, 'execute.ts');
          try {
            await fs.access(executeFile);
          } catch {
            await fs.writeFile(
              executeFile,
              `export async function execute(params: Record<string, unknown>) { return { ok: true }; }\n`,
              'utf-8'
            );
          }

          // 2) 备份 METADATA.yml（如存在）
          try {
            await fs.access(metadataPath);
            await fs.rename(metadataPath, path.join(dir, 'METADATA.yml.legacy'));
          } catch {
            // ignore if not exists
          }

          // 3) 补充 SKILL.md 的 Front Matter 结构
          const raw = await fs.readFile(skillPath, 'utf-8');
          const parsed = matter(raw);
          const data: any = parsed.data || {};
          data.resources = data.resources || { entry: './scripts/execute.ts' };
          data.triggers = data.triggers || {};
          data.input_schema = data.input_schema || {};
          data.security = data.security || {};
          const next = matter.stringify(parsed.content, data);
          await fs.writeFile(skillPath, next, 'utf-8');

          migrated++;
        } else {
          // 简单校验：检查必要字段是否存在
          const raw = await fs.readFile(skillPath, 'utf-8');
          const parsed = matter(raw);
          const data: any = parsed.data || {};
          if (data.resources?.entry && data.triggers !== undefined && data.input_schema !== undefined && data.security !== undefined) {
            validated++;
          } else {
            failed++;
          }
        }
      } catch {
        // 非技能目录或结构异常，跳过但记录失败
        failed++;
      }
    }

    return { migrated, validated, failed };
  }
}


