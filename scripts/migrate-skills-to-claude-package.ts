/**
 * Claude-Compatible Skills Packaging Migration Tool
 *
 * 将现有Skills目录迁移为Claude Code兼容的包结构（SKILL.md + scripts/ + references/ + assets/）
 *
 * Usage:
 *   npm run migrate:skills:to-claude [--dry-run] [--validate]
 *     [--skill-dir=<path>] [--no-backup]
 *
 * Examples:
 *   npm run migrate:skills:to-claude -- --skill-dir=./skills
 *   npm run migrate:skills:to-claude -- --dry-run
 *   npm run migrate:skills:to-claude -- --validate
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import { MetadataLoader } from '../src/core/skills/MetadataLoader';
import { SkillMetadata } from '../src/types/skills';
import logger from '../src/utils/logger';

interface PackageOptions {
  skillDir: string;
  dryRun?: boolean;
  validateOnly?: boolean;
  backup?: boolean;
}

interface PackageResult {
  skillName: string;
  status: 'migrated' | 'validated' | 'skipped' | 'failed';
  issues?: string[];
  details?: Record<string, unknown>;
}

interface PackageReport {
  total: number;
  migrated: number;
  validated: number;
  skipped: number;
  failed: number;
  results: PackageResult[];
}

export class ClaudeSkillsPackager {
  private readonly metadataLoader = new MetadataLoader();

  constructor(private readonly options: PackageOptions) {}

  async run(): Promise<PackageReport> {
    const report: PackageReport = {
      total: 0,
      migrated: 0,
      validated: 0,
      skipped: 0,
      failed: 0,
      results: []
    };

    const skillDirs = await this.scanSkillDirectories(this.options.skillDir);
    report.total = skillDirs.length;

    for (const dir of skillDirs) {
      const skillName = path.basename(dir);
      try {
        if (this.options.validateOnly) {
          const result = await this.validateSkill(dir, skillName);
          report.results.push(result);
          if (result.status === 'validated') {
            report.validated++;
          } else if (result.status === 'skipped') {
            report.skipped++;
          } else if (result.status === 'failed') {
            report.failed++;
          }
        } else {
          const migrateResult = await this.migrateSkill(dir, skillName);
          report.results.push(migrateResult);
          if (migrateResult.status === 'migrated') {
            report.migrated++;
          } else if (migrateResult.status === 'skipped') {
            report.skipped++;
          } else if (migrateResult.status === 'failed') {
            report.failed++;
          }
        }
      } catch (error: any) {
        report.failed++;
        const failure: PackageResult = {
          skillName,
          status: 'failed',
          issues: [error?.message ?? '未知错误']
        };
        report.results.push(failure);
        logger.error(`❌ Failed to process ${skillName}: ${failure.issues[0]}`);
      }
    }

    return report;
  }

  private async migrateSkill(skillDir: string, skillName: string): Promise<PackageResult> {
    const skillFile = path.join(skillDir, 'SKILL.md');
    const scriptsDir = path.join(skillDir, 'scripts');
    const referencesDir = path.join(skillDir, 'references');
    const assetsDir = path.join(skillDir, 'assets');

    const rawSkill = await fs.readFile(skillFile, 'utf-8');
    const parsed = matter(rawSkill);
    const metadata = await this.metadataLoader.loadMetadata(skillDir);

    const isCanonical = await this.isCanonicalLayout(skillDir, metadata);
    if (isCanonical) {
      return {
        skillName,
        status: 'skipped',
        issues: ['already canonical']
      };
    }

    const { code, updatedContent } = this.extractPrimaryCodeBlock(parsed.content);

    const newFrontMatter = this.buildCanonicalFrontMatter(parsed.data, metadata);
    const normalizedContent = this.normalizeSkillContent(
      updatedContent,
      metadata,
      newFrontMatter.resources?.entry ?? './scripts/execute.ts'
    );
    const buildContent = () => matter.stringify(normalizedContent.trim(), newFrontMatter as any);
    let finalContent = buildContent();

    if (!this.options.dryRun) {
      await fs.mkdir(scriptsDir, { recursive: true });
      await fs.mkdir(referencesDir, { recursive: true });
      await fs.mkdir(assetsDir, { recursive: true });

      if (code) {
        await fs.writeFile(
          path.join(skillDir, (newFrontMatter.resources?.entry ?? './scripts/execute.ts').replace(/^\.\//, '')),
          code,
          'utf-8'
        );
      } else {
        const stub = `export async function execute(params: Record<string, unknown>): Promise<unknown> {
  throw new Error('Skill logic not implemented. Please move existing代码到 scripts/execute.ts');
}
`;
        const entryPath = path.join(scriptsDir, 'execute.ts');
        await fs.writeFile(entryPath, stub, 'utf-8');
        newFrontMatter.resources = {
          ...newFrontMatter.resources,
          entry: './scripts/execute.ts'
        };
        finalContent = buildContent();
      }

      if (this.options.backup !== false) {
        const backupPath = `${skillFile}.backup.${Date.now()}`;
        await fs.writeFile(backupPath, rawSkill, 'utf-8');
      }

      await fs.writeFile(skillFile, finalContent, 'utf-8');

      const metadataFile = path.join(skillDir, 'METADATA.yml');
      if (await this.fileExists(metadataFile)) {
        const legacyFile = `${metadataFile}.legacy`;
        await fs.rename(metadataFile, legacyFile);
      }
    } else if (!code) {
      newFrontMatter.resources = {
        ...newFrontMatter.resources,
        entry: './scripts/execute.ts'
      };
      finalContent = buildContent();
    }

    return {
      skillName,
      status: 'migrated',
      details: {
        scriptsDir,
        resourcesEntry: newFrontMatter.resources?.entry
      }
    };
  }

  private async validateSkill(skillDir: string, skillName: string): Promise<PackageResult> {
    const issues: string[] = [];
    const skillFile = path.join(skillDir, 'SKILL.md');
    const scriptsDir = path.join(skillDir, 'scripts');
    const referencesDir = path.join(skillDir, 'references');
    const assetsDir = path.join(skillDir, 'assets');

    const raw = await fs.readFile(skillFile, 'utf-8');
    const parsed = matter(raw);
    const frontMatter = parsed.data as Record<string, unknown>;

    const requiredFields = [
      'name',
      'description',
      'version',
      'type',
      'domain',
      'triggers',
      'input_schema',
      'output_schema',
      'security',
      'resources'
    ];
    for (const field of requiredFields) {
      if (!(field in frontMatter)) {
        issues.push(`缺少 front matter 字段: ${field}`);
      }
    }

    if (!(await this.directoryExists(scriptsDir))) {
      issues.push('缺少 scripts/ 目录');
    }

    const resources = frontMatter.resources as Record<string, unknown> | undefined;
    const entry = resources?.entry as string | undefined;
    if (!entry) {
      issues.push('resources.entry 未设置');
    } else {
      const entryPath = path.join(skillDir, entry.replace(/^\.\//, ''));
      if (!(await this.fileExists(entryPath))) {
        issues.push(`入口脚本不存在: ${entry}`);
      }
    }

    if (!(await this.directoryExists(referencesDir))) {
      issues.push('缺少 references/ 目录');
    }

    if (!(await this.directoryExists(assetsDir))) {
      issues.push('缺少 assets/ 目录');
    }

    if (issues.length > 0) {
      return {
        skillName,
        status: 'failed',
        issues
      };
    }

    return {
      skillName,
      status: 'validated'
    };
  }

  private async scanSkillDirectories(root: string): Promise<string[]> {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const skillDirs: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const skillDir = path.join(root, entry.name);
      const skillFile = path.join(skillDir, 'SKILL.md');
      if (await this.fileExists(skillFile)) {
        skillDirs.push(skillDir);
      }
    }

    return skillDirs;
  }

  private extractPrimaryCodeBlock(content: string): {
    code?: string;
    updatedContent: string;
  } {
    const codeBlockRegex = /```(?:typescript|ts)\n([\s\S]*?)```/;
    const match = codeBlockRegex.exec(content);
    if (!match) {
      return { updatedContent: content };
    }
    const code = match[1].trim();
    const updatedContent = content.replace(match[0], '\n').trim();
    return { code, updatedContent };
  }

  private buildCanonicalFrontMatter(
    existing: Record<string, unknown>,
    metadata: SkillMetadata
  ): Record<string, any> {
    const keywords = metadata.keywords?.length ? metadata.keywords : [metadata.name];
    const defaultTriggers = {
      intents: [],
      phrases: Array.from(new Set([metadata.displayName, ...keywords.filter(Boolean)])),
      event_types: []
    };
    const resourcesEntry = './scripts/execute.ts';

    const frontMatter = {
      name: metadata.name,
      displayName: metadata.displayName,
      description: metadata.description,
      version: metadata.version,
      type: metadata.type,
      domain: metadata.domain,
      category: metadata.category,
      keywords,
      tags: metadata.tags ?? keywords,
      capabilities: metadata.capabilities ?? keywords,
      triggers: existing.triggers ?? metadata.triggers ?? defaultTriggers,
      input_schema: existing.input_schema ?? metadata.inputSchema ?? {
        type: 'object',
        properties: {},
        additionalProperties: true
      },
      output_schema: existing.output_schema ?? metadata.outputSchema ?? {
        type: 'object',
        properties: {},
        additionalProperties: true
      },
      security: this.buildSecurityPolicy(existing.security, metadata),
      resources: existing.resources ?? metadata.resources ?? {
        entry: resourcesEntry
      },
      cacheable: metadata.cacheable,
      ttl: metadata.ttl,
      protocol: metadata.protocol,
      permissions: metadata.permissions
    };

    return this.sanitizeFrontMatter(frontMatter);
  }

  private buildSecurityPolicy(
    existing: unknown,
    metadata: SkillMetadata
  ): Record<string, unknown> {
    const securityFromMeta = metadata.security ?? {};
    const resolved: Record<string, unknown> = existing && typeof existing === 'object' ? { ...(existing as Record<string, unknown>) } : {};

    resolved.timeout_ms = resolved.timeout_ms ?? securityFromMeta.timeoutMs ?? 3000;
    resolved.memory_mb = resolved.memory_mb ?? securityFromMeta.memoryMb ?? 128;
    resolved.network = resolved.network ?? securityFromMeta.network ?? (metadata.permissions.network ? 'allowlist' : 'none');
    resolved.network_allowlist =
      resolved.network_allowlist ??
      securityFromMeta.networkAllowlist ??
      metadata.permissions.externalApis ??
      [];
    resolved.filesystem =
      resolved.filesystem ??
      securityFromMeta.filesystem ??
      metadata.permissions.filesystem ??
      'none';
    resolved.environment =
      resolved.environment ??
      securityFromMeta.environment ??
      metadata.permissions.environment ??
      {};

    return resolved;
  }

  private normalizeSkillContent(
    content: string,
    metadata: SkillMetadata,
    entryPath: string
  ): string {
    let normalized = content.trim();

    if (!normalized.startsWith('#')) {
      normalized = `# ${metadata.displayName}\n\n${normalized}`;
    }

    if (!normalized.includes('## 描述')) {
      normalized = `${normalized}\n\n## 描述\n${metadata.description || '请补充技能描述。'}`;
    }

    if (!normalized.includes('## 输入')) {
      normalized = `${normalized}\n\n## 输入\n- 详见 \`input_schema\`。`;
    }

    if (!normalized.includes('## 输出')) {
      normalized = `${normalized}\n\n## 输出\n- 详见 \`output_schema\`。`;
    }

    if (!normalized.includes('## 执行步骤')) {
      normalized = `${normalized}\n\n## 执行步骤\n1. 根据上下文判断是否需要调用此技能。\n2. 准备输入并调用 \`${entryPath}\` 中的 \`execute\` 方法。\n3. 根据返回结果构造最终回复。`;
    }

    if (!normalized.includes('## 执行脚本')) {
      normalized = `${normalized}\n\n## 执行脚本\n- 主入口: \`${entryPath}\`\n- 所有脚本位于 \`scripts/\` 目录。`;
    }

    return normalized;
  }

  private sanitizeFrontMatter(frontMatter: Record<string, any>): Record<string, any> {
    const cleanValue = (value: any): any => {
      if (Array.isArray(value)) {
        return value
          .map((item) => cleanValue(item))
          .filter((item) => item !== undefined && item !== null && item !== '');
      }
      if (value && typeof value === 'object') {
        const entries = Object.entries(value)
          .map(([key, val]) => [key, cleanValue(val)] as const)
          .filter(([, val]) => val !== undefined && val !== null && val !== '');
        return Object.fromEntries(entries);
      }
      return value === undefined ? undefined : value;
    };

    return Object.fromEntries(
      Object.entries(frontMatter)
        .map(([key, value]) => [key, cleanValue(value)] as const)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
    );
  }

  private async isCanonicalLayout(skillDir: string, metadata: SkillMetadata): Promise<boolean> {
    const scriptsDir = path.join(skillDir, 'scripts');
    const referencesDir = path.join(skillDir, 'references');
    const assetsDir = path.join(skillDir, 'assets');

    const hasScripts = await this.directoryExists(scriptsDir);
    const hasReferences = await this.directoryExists(referencesDir);
    const hasAssets = await this.directoryExists(assetsDir);

    const resourcesEntry = metadata.resources?.entry;
    if (!resourcesEntry) {
      return false;
    }
    const entryPath = path.join(skillDir, resourcesEntry.replace(/^\.\//, ''));
    const entryExists = await this.fileExists(entryPath);

    return hasScripts && hasReferences && hasAssets && entryExists;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
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

async function main() {
  const args = process.argv.slice(2);
  const options: PackageOptions = {
    skillDir: process.env.SKILLS_DIR || './skills',
    dryRun: args.includes('--dry-run'),
    validateOnly: args.includes('--validate'),
    backup: !args.includes('--no-backup')
  };

  const skillDirArg = args.find((arg) => arg.startsWith('--skill-dir='));
  if (skillDirArg) {
    options.skillDir = skillDirArg.split('=')[1];
  }

  logger.info(`🧭 Skills directory: ${options.skillDir}`);
  logger.info(`🧪 Validate only: ${options.validateOnly ? 'yes' : 'no'}`);
  logger.info(`📝 Dry run: ${options.dryRun ? 'yes' : 'no'}`);

  const packager = new ClaudeSkillsPackager(options);
  const report = await packager.run();

  logger.info(
    `📊 Result: migrated=${report.migrated}, validated=${report.validated}, skipped=${report.skipped}, failed=${report.failed}`
  );

  if (report.failed > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
   
  main();
}


