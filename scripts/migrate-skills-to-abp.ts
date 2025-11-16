/**
 * VCP to ABP Skills Migration Tool
 * 
 * 将VCP格式的Skills迁移到ABP格式
 * 
 * Usage:
 *   npm run migrate:skills:to-abp [--dry-run] [--skill-dir=<path>] [--output-dir=<path>]
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
// VCPToABPConverter已移除，迁移工具不再提供VCP到ABP的转换功能
import { ABPSkillsAdapter } from '../src/core/skills/ABPSkillsAdapter';
import { MetadataLoader } from '../src/core/skills/MetadataLoader';
import { SkillMetadata } from '../src/types/skills';
import logger from '../src/utils/logger';

interface MigrationOptions {
  dryRun: boolean;
  skillDir: string;
  outputDir?: string;
  backup: boolean;
  validate: boolean;
}

interface MigrationResult {
  skillName: string;
  success: boolean;
  error?: string;
  changes?: {
    metadata: boolean;
    content: boolean;
  };
}

interface MigrationReport {
  total: number;
  successful: number;
  failed: number;
  skipped: number;
  results: MigrationResult[];
  summary?: {
    totalSkills: number;
    convertedSkills: number;
    skippedSkills: number;
    failedSkills: number;
    totalChanges: {
      metadata: number;
      content: number;
    };
  };
}

class SkillsMigrationTool {
  private abpAdapter: ABPSkillsAdapter;
  private metadataLoader: MetadataLoader;
  private options: MigrationOptions;

  constructor(options: MigrationOptions) {
    // VCPToABPConverter已移除，仅使用ABPSkillsAdapter进行格式转换
    this.abpAdapter = new ABPSkillsAdapter();
    this.metadataLoader = new MetadataLoader();
    this.options = options;
  }

  /**
   * 执行迁移
   */
  async migrate(): Promise<MigrationReport> {
    const report: MigrationReport = {
      total: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      results: []
    };

    logger.info(`🔍 Scanning skills directory: ${this.options.skillDir}`);
    const skillDirs = await this.scanSkillDirectories(this.options.skillDir);

    report.total = skillDirs.length;
    logger.info(`📦 Found ${skillDirs.length} skills`);

    for (const skillDir of skillDirs) {
      const skillName = path.basename(skillDir);
      logger.info(`🔄 Migrating skill: ${skillName}`);

      try {
        const result = await this.migrateSkill(skillDir, skillName);
        report.results.push(result);

        if (result.success) {
          // 检查是否跳过了（已经是ABP格式）
          if (result.changes && !result.changes.metadata && !result.changes.content) {
            report.skipped++;
            logger.debug(`⏭️  Skipped: ${skillName} (already in ABP format)`);
          } else {
            report.successful++;
            logger.info(`✅ Successfully migrated: ${skillName}`);
          }
        } else {
          report.failed++;
          logger.error(`❌ Failed to migrate: ${skillName} - ${result.error}`);
        }
      } catch (error: any) {
        report.failed++;
        logger.error(`❌ Error migrating ${skillName}: ${error.message}`);
        report.results.push({
          skillName,
          success: false,
          error: error.message
        });
      }
    }

    // 生成摘要
    report.summary = this.generateSummary(report);

    return report;
  }

  /**
   * 生成迁移摘要
   */
  private generateSummary(report: MigrationReport): MigrationReport['summary'] {
    const convertedSkills = report.results.filter(
      r => r.success && r.changes && (r.changes.metadata || r.changes.content)
    ).length;
    const skippedSkills = report.results.filter(
      r => r.success && r.changes && !r.changes.metadata && !r.changes.content
    ).length;
    
    const totalChanges = {
      metadata: report.results.filter(r => r.changes?.metadata).length,
      content: report.results.filter(r => r.changes?.content).length
    };

    return {
      totalSkills: report.total,
      convertedSkills,
      skippedSkills,
      failedSkills: report.failed,
      totalChanges
    };
  }

  /**
   * 扫描技能目录
   */
  private async scanSkillDirectories(skillsRoot: string): Promise<string[]> {
    const skillDirs: string[] = [];
    
    try {
      const entries = await fs.readdir(skillsRoot, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillDir = path.join(skillsRoot, entry.name);
          const skillFile = path.join(skillDir, 'SKILL.md');
          
          // 检查是否存在SKILL.md文件
          try {
            await fs.access(skillFile);
            skillDirs.push(skillDir);
          } catch {
            // 跳过没有SKILL.md的目录
          }
        }
      }
    } catch (error: any) {
      logger.error(`Failed to scan skills directory: ${error.message}`);
      throw error;
    }

    return skillDirs;
  }

  /**
   * 迁移单个Skill
   */
  private async migrateSkill(skillDir: string, skillName: string): Promise<MigrationResult> {
    const skillFile = path.join(skillDir, 'SKILL.md');
    const skillContent = await fs.readFile(skillFile, 'utf-8');
    
    // 解析SKILL.md
    const parsed = matter(skillContent);
    const frontMatter = parsed.data as Record<string, unknown>;
    const content = parsed.content;

    // 加载元数据（从SKILL.md或METADATA.yml）
    let metadata: SkillMetadata;
    try {
      metadata = await this.metadataLoader.loadMetadata(skillDir);
    } catch (error: any) {
      logger.warn(`⚠️  Failed to load metadata for ${skillName}: ${error.message}`);
      // 如果加载失败，尝试从front matter创建基本元数据
      metadata = {
        name: skillName,
        displayName: (frontMatter.displayName as string) || skillName,
        description: (frontMatter.description as string) || '',
        version: (frontMatter.version as string) || '1.0.0',
        type: (frontMatter.type as any) || 'direct',
        domain: (frontMatter.domain as string) || 'general',
        keywords: (frontMatter.keywords as string[]) || [],
        permissions: (frontMatter.permissions as any) || {},
        cacheable: (frontMatter.cacheable as boolean) ?? true,
        ttl: (frontMatter.ttl as number) || 3600,
        path: skillDir,
        loadedAt: Date.now()
      };
    }
    
    // 检查是否已经是ABP格式
    if (metadata.protocol === 'abp') {
      logger.debug(`⏭️  Skill ${skillName} is already in ABP format, skipping`);
      return {
        skillName,
        success: true,
        changes: {
          metadata: false,
          content: false
        }
      };
    }

    // 转换为ABP格式
    const abpMetadata = this.abpAdapter.convertToABP(metadata);
    
    // 转换SKILL.md内容（将VCP协议文本转换为ABP协议文本）
    const abpContent = this.convertSkillContent(content, abpMetadata);

    // 生成新的front matter
    const newFrontMatter = this.generateABPFrontMatter(abpMetadata);
    const newContent = matter.stringify(abpContent, newFrontMatter as any);

    // 保存转换后的文件
    if (!this.options.dryRun) {
      // 备份原文件（如果启用）
      if (this.options.backup) {
        const backupFile = `${skillFile}.backup.${Date.now()}`;
        await fs.writeFile(backupFile, skillContent, 'utf-8');
        logger.debug(`📦 Backup created: ${backupFile}`);
      }

      // 写入新文件
      const outputFile = this.options.outputDir
        ? path.join(this.options.outputDir, skillName, 'SKILL.md')
        : skillFile;
      
      // 确保输出目录存在
      if (this.options.outputDir) {
        const outputDir = path.dirname(outputFile);
        await fs.mkdir(outputDir, { recursive: true });
      }

      await fs.writeFile(outputFile, newContent, 'utf-8');
      logger.debug(`✅ Written: ${outputFile}`);
    } else {
      logger.info(`[DRY RUN] Would write to: ${skillFile}`);
    }

    return {
      skillName,
      success: true,
      changes: {
        metadata: true,
        content: true
      }
    };
  }

  /**
   * 转换SKILL.md内容
   */
  private convertSkillContent(
    content: string,
    abpMetadata: SkillMetadata
  ): string {
    // 转换VCP协议文本为ABP协议文本
    // VCPToABPConverter已移除，迁移工具不再进行文本转换
    // 仅进行元数据层面的格式转换
    const convertedContent = content;

    // 如果有ABP工具定义，可以添加工具定义说明（可选）
    // 注意：工具定义已经在front matter中，这里可以选择是否在内容中添加说明
    // 暂时不添加，避免重复

    return convertedContent;
  }

  /**
   * 生成ABP front matter
   */
  private generateABPFrontMatter(abpMetadata: SkillMetadata): Record<string, unknown> {
    const frontMatter: Record<string, unknown> = {
      name: abpMetadata.name,
      displayName: abpMetadata.displayName,
      description: abpMetadata.description,
      version: abpMetadata.version,
      type: abpMetadata.type,
      protocol: 'abp' // 设置为ABP协议
    };

    // 添加ABP配置
    if (abpMetadata.abp) {
      frontMatter.abp = {
        kind: abpMetadata.abp.kind,
        tools: abpMetadata.abp.tools
      };
    }

    // 添加其他字段
    if (abpMetadata.category) {
      frontMatter.category = abpMetadata.category;
    }
    if (abpMetadata.keywords && abpMetadata.keywords.length > 0) {
      frontMatter.keywords = abpMetadata.keywords;
    }
    if (abpMetadata.domain) {
      frontMatter.domain = abpMetadata.domain;
    }
    if (abpMetadata.permissions) {
      frontMatter.permissions = abpMetadata.permissions;
    }
    if (abpMetadata.cacheable !== undefined) {
      frontMatter.cacheable = abpMetadata.cacheable;
    }
    if (abpMetadata.ttl) {
      frontMatter.ttl = abpMetadata.ttl;
    }

    return frontMatter;
  }

  /**
   * 生成ABP工具定义章节
   */
  private generateABPToolsSection(abpMetadata: SkillMetadata): string {
    if (!abpMetadata.abp?.tools || abpMetadata.abp.tools.length === 0) {
      return '';
    }

    const tools = abpMetadata.abp.tools;
    const sections = tools.map((tool) => {
      const params = tool.parameters
        ? Object.entries(tool.parameters)
            .map(([key, param]) => {
              const required = param.required !== false ? '（必需）' : '（可选）';
              const type = param.type || 'any';
              const description = param.description || '';
              return `- \`${key}\` (${type})${required}: ${description}`;
            })
            .join('\n')
        : '无参数';

      const returns = tool.returns
        ? `- **类型**: ${tool.returns.type || 'any'}\n- **描述**: ${tool.returns.description || ''}`
        : '无返回值';

      return `### ${tool.name}

**描述**: ${tool.description || ''}

**参数**:
${params}

**返回值**:
${returns}`;
    });

    return sections.join('\n\n');
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  // 解析命令行参数
  const options: MigrationOptions = {
    dryRun: args.includes('--dry-run'),
    skillDir: process.env.SKILLS_DIR || './skills',
    outputDir: args.find(arg => arg.startsWith('--output-dir='))?.split('=')[1],
    backup: !args.includes('--no-backup'),
    validate: !args.includes('--no-validate')
  };

  // 从--skill-dir参数中获取技能目录
  const skillDirArg = args.find(arg => arg.startsWith('--skill-dir='));
  if (skillDirArg) {
    options.skillDir = skillDirArg.split('=')[1];
  }

  logger.info('🚀 Starting VCP to ABP Skills Migration');
  logger.info(`📁 Skills directory: ${options.skillDir}`);
  logger.info(`📝 Dry run: ${options.dryRun}`);
  logger.info(`💾 Backup: ${options.backup}`);
  logger.info(`✅ Validate: ${options.validate}`);

  try {
    const tool = new SkillsMigrationTool(options);
    const report = await tool.migrate();

    // 打印报告
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 Migration Report');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Total: ${report.total}`);
    console.log(`✅ Successful: ${report.successful}`);
    console.log(`❌ Failed: ${report.failed}`);
    console.log(`⏭️  Skipped: ${report.skipped}`);
    
    if (report.summary) {
      console.log('\n📋 Summary:');
      console.log(`  Total Skills: ${report.summary.totalSkills}`);
      console.log(`  Converted: ${report.summary.convertedSkills}`);
      console.log(`  Skipped: ${report.summary.skippedSkills}`);
      console.log(`  Failed: ${report.summary.failedSkills}`);
      console.log(`  Changes:`);
      console.log(`    Metadata: ${report.summary.totalChanges.metadata}`);
      console.log(`    Content: ${report.summary.totalChanges.content}`);
    }
    
    console.log('═══════════════════════════════════════════════════════════\n');

    // 打印失败详情
    if (report.failed > 0) {
      console.log('❌ Failed Skills:');
      report.results
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`  - ${r.skillName}: ${r.error}`);
        });
      console.log('');
    }

    // 打印成功详情
    if (report.successful > 0) {
      console.log('✅ Successfully Migrated Skills:');
      report.results
        .filter(r => r.success)
        .forEach(r => {
          const changes = r.changes
            ? ` (metadata: ${r.changes.metadata ? '✓' : '✗'}, content: ${r.changes.content ? '✓' : '✗'})`
            : '';
          console.log(`  - ${r.skillName}${changes}`);
        });
      console.log('');
    }

    process.exit(report.failed > 0 ? 1 : 0);
  } catch (error: any) {
    logger.error(`❌ Migration failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main().catch((error) => {
    logger.error(`❌ Unhandled error: ${error.message}`);
    console.error(error);
    process.exit(1);
  });
}

export { SkillsMigrationTool, MigrationOptions, MigrationResult, MigrationReport };

