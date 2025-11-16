import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';
import {
  MetadataLoader,
  SkillsIndex,
  SkillsCache,
  InstructionLoader,
  ResourceLoader,
  SkillsLoader
} from '../core/skills';
import logger from '../utils/logger';
import type { SkillMetadata, SkillContent, SkillResources } from '../types';

/**
 * 验证结果
 */
export interface ValidationResult {
  skillName: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
  metadataValid: boolean;
  contentValid: boolean;
  resourcesValid: boolean;
  codeValid: boolean;
  details: {
    metadata?: any;
    content?: any;
    resources?: any;
    codeIssues?: string[];
  };
}

/**
 * 验证选项
 */
export interface ValidationOptions {
  skillsRoot: string;
  validateMetadata?: boolean;
  validateContent?: boolean;
  validateResources?: boolean;
  validateCode?: boolean;
  strict?: boolean;
}

/**
 * Skills验证工具
 */
export class SkillValidationTool {
  private readonly options: Required<ValidationOptions>;
  private metadataLoader: MetadataLoader;
  private skillsIndex: SkillsIndex;
  private skillsCache: SkillsCache;
  private instructionLoader: InstructionLoader;
  private resourceLoader: ResourceLoader;
  private skillsLoader: SkillsLoader;

  constructor(options: ValidationOptions) {
    this.options = {
      validateMetadata: true,
      validateContent: true,
      validateResources: true,
      validateCode: true,
      strict: false,
      ...options
    };

    this.metadataLoader = new MetadataLoader();
    this.skillsCache = new SkillsCache();
    this.skillsIndex = new SkillsIndex({
      skillsRoot: this.options.skillsRoot,
      metadataProvider: this.metadataLoader
    });
    this.instructionLoader = new InstructionLoader(this.skillsIndex, this.skillsCache);
    this.resourceLoader = new ResourceLoader(this.skillsIndex, this.skillsCache);
    this.skillsLoader = new SkillsLoader(
      this.skillsIndex,
      this.instructionLoader,
      this.resourceLoader,
      this.skillsCache
    );
  }

  /**
   * 验证单个技能
   */
  async validateSkill(skillName: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      skillName,
      passed: true,
      errors: [],
      warnings: [],
      metadataValid: false,
      contentValid: false,
      resourcesValid: false,
      codeValid: false,
      details: {}
    };

    try {
      // 构建索引
      await this.skillsIndex.buildIndex();

      // 验证元数据
      if (this.options.validateMetadata) {
        const metadataResult = await this.validateMetadata(skillName);
        result.metadataValid = metadataResult.valid;
        result.details.metadata = metadataResult.details;
        if (!metadataResult.valid) {
          result.errors.push(...metadataResult.errors);
          result.passed = false;
        }
        if (metadataResult.warnings) {
          result.warnings.push(...metadataResult.warnings);
        }
      }

      // 验证内容
      if (this.options.validateContent) {
        const contentResult = await this.validateContent(skillName);
        result.contentValid = contentResult.valid;
        result.details.content = contentResult.details;
        if (!contentResult.valid) {
          result.errors.push(...contentResult.errors);
          result.passed = false;
        }
        if (contentResult.warnings) {
          result.warnings.push(...contentResult.warnings);
        }
      }

      // 验证资源
      if (this.options.validateResources) {
        const resourcesResult = await this.validateResources(skillName);
        result.resourcesValid = resourcesResult.valid;
        result.details.resources = resourcesResult.details;
        if (!resourcesResult.valid && this.options.strict) {
          result.errors.push(...resourcesResult.errors);
          result.passed = false;
        }
        if (resourcesResult.warnings) {
          result.warnings.push(...resourcesResult.warnings);
        }
      }

      // 验证代码
      if (this.options.validateCode) {
        const codeResult = await this.validateCode(skillName);
        result.codeValid = codeResult.valid;
        result.details.codeIssues = codeResult.issues;
        if (!codeResult.valid && this.options.strict) {
          result.errors.push(...codeResult.errors);
          result.passed = false;
        }
        if (codeResult.warnings) {
          result.warnings.push(...codeResult.warnings);
        }
      }
    } catch (error) {
      result.passed = false;
      result.errors.push(`验证过程出错: ${(error as Error).message}`);
      logger.error(`验证技能失败: ${skillName}`, error);
    }

    return result;
  }

  /**
   * 验证所有技能
   */
  async validateAll(): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    try {
      await this.skillsIndex.buildIndex();
      const allMetadata = this.skillsIndex.getAllMetadata();
      const skillNames = allMetadata.map(m => m.name);

      logger.info(`开始验证 ${skillNames.length} 个技能`);

      for (const skillName of skillNames) {
        const result = await this.validateSkill(skillName);
        results.push(result);
      }
    } catch (error) {
      logger.error('批量验证失败:', error);
    }

    return results;
  }

  /**
   * 验证元数据
   */
  private async validateMetadata(skillName: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    details: any;
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const details: any = {};

    try {
      const metadata = this.skillsIndex.getMetadata(skillName);

      if (!metadata) {
        errors.push('元数据不存在');
        return { valid: false, errors, warnings, details };
      }

      details.metadata = metadata;

      // 验证必需字段
      if (!metadata.name) {
        errors.push('缺少必需字段: name');
      }
      if (!metadata.displayName) {
        errors.push('缺少必需字段: displayName');
      }
      if (!metadata.description) {
        warnings.push('缺少字段: description（建议添加）');
      }
      if (!metadata.version) {
        errors.push('缺少必需字段: version');
      }
      if (!metadata.type) {
        errors.push('缺少必需字段: type');
      } else {
        const validTypes = ['direct', 'static', 'service', 'distributed', 'preprocessor', 'internal'];
        if (!validTypes.includes(metadata.type)) {
          errors.push(`无效的类型: ${metadata.type}，必须是 ${validTypes.join(', ')} 之一`);
        }
      }

      // 验证权限配置
      if (metadata.permissions) {
        if (metadata.type === 'service' && !metadata.permissions.network) {
          warnings.push('Service类型技能通常需要network权限');
        }
      }

      // 验证参数（如果有，从config中获取）
      if (metadata.config && typeof metadata.config === 'object') {
        const config = metadata.config as Record<string, unknown>;
        if (config.parameters && typeof config.parameters === 'object') {
          const parameters = config.parameters as Record<string, unknown>;
          for (const [paramName, paramDef] of Object.entries(parameters)) {
            if (typeof paramDef !== 'object' || paramDef === null) {
              warnings.push(`参数 ${paramName} 的定义格式可能不正确`);
            }
          }
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined,
        details
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`元数据验证失败: ${(error as Error).message}`],
        warnings: undefined,
        details
      };
    }
  }

  /**
   * 验证内容
   */
  private async validateContent(skillName: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    details: any;
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const details: any = {};

    try {
      const skill = await this.skillsLoader.loadSkill(skillName, {
        includeContent: true,
        includeResources: false
      });

      if (!skill?.content) {
        errors.push('内容不存在');
        return { valid: false, errors, warnings, details };
      }

      details.content = {
        hasSections: skill.content.sections.length > 0,
        hasCodeBlocks: skill.content.codeBlocks.length > 0,
        sectionCount: skill.content.sections.length,
        codeBlockCount: skill.content.codeBlocks.length
      };

      // 验证是否有代码块
      if (skill.content.codeBlocks.length === 0) {
        const metadata = this.skillsIndex.getMetadata(skillName);
        if (metadata?.type === 'direct' || metadata?.type === 'preprocessor') {
          warnings.push('Direct/Preprocessor类型技能通常需要代码块');
        }
      }

      // 验证代码块格式
      for (const codeBlock of skill.content.codeBlocks) {
        if (!codeBlock.language) {
          warnings.push('代码块缺少语言标识');
        }
        if (codeBlock.language !== 'typescript' && codeBlock.language !== 'javascript') {
          warnings.push(`代码块语言为 ${codeBlock.language}，建议使用 typescript`);
        }
        if (!codeBlock.code || codeBlock.code.trim().length === 0) {
          errors.push('代码块为空');
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined,
        details
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`内容验证失败: ${(error as Error).message}`],
        warnings: undefined,
        details
      };
    }
  }

  /**
   * 验证资源
   */
  private async validateResources(skillName: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    details: any;
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const details: any = {};

    try {
      const skill = await this.skillsLoader.loadSkill(skillName, {
        includeContent: false,
        includeResources: true
      });

      if (!skill?.resources) {
        // 资源是可选的
        return { valid: true, errors, warnings, details: { hasResources: false } };
      }

      details.resources = {
        hasScripts: Boolean(skill.resources.scripts && Object.keys(skill.resources.scripts).length > 0),
        hasAssets: Boolean(skill.resources.assets && Object.keys(skill.resources.assets).length > 0),
        scriptCount: skill.resources.scripts ? Object.keys(skill.resources.scripts).length : 0,
        assetCount: skill.resources.assets ? Object.keys(skill.resources.assets).length : 0
      };

      return {
        valid: true,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined,
        details
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`资源验证失败: ${(error as Error).message}`],
        warnings: undefined,
        details
      };
    }
  }

  /**
   * 验证代码
   */
  private async validateCode(skillName: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    issues: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const issues: string[] = [];

    try {
      const skill = await this.skillsLoader.loadSkill(skillName, {
        includeContent: true,
        includeResources: false
      });

      if (!skill?.content) {
        return { valid: false, errors: ['无法加载内容'], warnings, issues };
      }

      // 检查代码块
      for (const codeBlock of skill.content.codeBlocks) {
        if (codeBlock.language === 'typescript' || codeBlock.language === 'javascript') {
          // 检查是否有execute函数
          if (!codeBlock.code.includes('execute') && !codeBlock.code.includes('export')) {
            warnings.push('代码块中未找到execute函数或export语句');
            issues.push('缺少execute函数');
          }

          // 检查是否有语法错误（简单检查）
          if (codeBlock.code.includes('function execute') && !codeBlock.code.includes('async')) {
            warnings.push('execute函数建议使用async');
            issues.push('execute函数未使用async');
          }

          // 检查是否有未闭合的括号
          const openBraces = (codeBlock.code.match(/\{/g) || []).length;
          const closeBraces = (codeBlock.code.match(/\}/g) || []).length;
          if (openBraces !== closeBraces) {
            errors.push('代码块中括号未闭合');
            issues.push('括号未闭合');
          }
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined,
        issues
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`代码验证失败: ${(error as Error).message}`],
        warnings: undefined,
        issues
      };
    }
  }
}

