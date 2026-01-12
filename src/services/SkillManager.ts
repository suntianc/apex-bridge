/**
 * SkillManager - Skills生命周期管理器
 * 负责Skills的安装、卸载、修改和查询，支持ZIP包自动解压和结构验证
 * 集成 ToolRegistry 进行统一工具管理
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import YAML from "js-yaml";
import matter from "gray-matter";
import AdmZip from "adm-zip";
import {
  SkillTool,
  SkillInstallOptions,
  SkillListOptions,
  SkillListResult,
  SkillMetadata,
  ToolError,
  ToolErrorCode,
  ToolType,
} from "../types/tool-system";
import { ToolRetrievalService } from "./ToolRetrievalService";
import { SkillsSandboxExecutor, getSkillsSandboxExecutor } from "./executors/SkillsSandboxExecutor";
import { toolRegistry, ToolType as RegistryToolType } from "../core/tool/registry";
import type { Tool } from "../core/tool/tool";
import { logger } from "../utils/logger";
import { PathService } from "./PathService";
import {
  ClaudeCodeSkillParser,
  getClaudeCodeSkillParser,
  LifecycleManager,
  getLifecycleManager,
  ParsedClaudeSkill,
  SkillLifecycleHooks,
  ParseError,
} from "./compat";

/**
 * 安装结果
 */
export interface InstallResult {
  success: boolean;
  message: string;
  skillName?: string;
  installedAt?: Date;
  duration?: number;
  vectorized?: boolean;
}

/**
 * 卸载结果
 */
export interface UninstallResult {
  success: boolean;
  message: string;
  skillName?: string;
  uninstalledAt?: Date;
  duration?: number;
}

/**
 * 更新结果
 */
export interface UpdateResult {
  success: boolean;
  message: string;
  skillName?: string;
  updatedAt?: Date;
  duration?: number;
  reindexed?: boolean;
}

/**
 * Skills管理器
 * 管理Skills的完整生命周期：安装、卸载、更新、查询
 */
export class SkillManager {
  private static instance: SkillManager | null = null;
  private readonly skillsBasePath: string;
  private readonly retrievalService: ToolRetrievalService;
  private readonly skillsExecutor: SkillsSandboxExecutor;
  private readonly skillParser: ClaudeCodeSkillParser;
  private readonly lifecycleManager: LifecycleManager;
  private initializationPromise: Promise<void> | null = null;

  /**
   * 创建SkillManager实例
   * @param skillsBasePath Skills存储基础路径
   * @param retrievalService 检索服务实例
   */
  protected constructor(skillsBasePath?: string, retrievalService?: ToolRetrievalService) {
    // 使用 PathService 获取正确的路径
    const pathService = PathService.getInstance();
    const dataDir = pathService.getDataDir();
    this.skillsBasePath = skillsBasePath || path.join(dataDir, "skills");

    // 确保 skills 目录存在
    this.ensureSkillsDirectory();

    // 使用 PathService 获取正确的向量数据库路径
    const vectorDbPath = path.join(dataDir, "skills.lance");

    this.retrievalService =
      retrievalService ||
      new ToolRetrievalService({
        vectorDbPath,
        model: "all-MiniLM-L6-v2",
        dimensions: 384,
        similarityThreshold: 0.4,
        cacheSize: 1000,
      });
    // 初始化 Skills 执行器
    this.skillsExecutor = getSkillsSandboxExecutor();

    // 初始化兼容层组件
    this.skillParser = getClaudeCodeSkillParser();
    this.lifecycleManager = getLifecycleManager();

    logger.debug("SkillManager initialized", {
      skillsBasePath,
    });

    // 启动异步初始化，但不阻塞构造函数
    this.initializationPromise = this.initializeSkillsIndex().catch((error) => {
      logger.error("Failed to initialize skills index during startup:", error);
      // 即使失败也标记为完成，避免永久阻塞
      throw error;
    });
  }

  /**
   * 安装Skills
   * @param zipBuffer ZIP压缩包Buffer
   * @param options 安装选项
   * @returns 安装结果
   */
  async installSkill(zipBuffer: Buffer, options: SkillInstallOptions = {}): Promise<InstallResult> {
    const startTime = Date.now();

    try {
      // 解压ZIP包到临时目录
      const tempDir = await this.extractZipToTemp(zipBuffer);
      logger.debug(`Extracted ZIP to temp directory: ${tempDir}`);

      // 验证Skills结构
      const metadata = await this.validateSkillStructure(tempDir, options.validationLevel);
      logger.debug("Skills structure validation passed", { metadata });

      // 检查名称冲突
      const targetDir = path.join(this.skillsBasePath, metadata.name);
      const exists = await this.directoryExists(targetDir);

      if (exists) {
        if (!options.overwrite) {
          throw new ToolError(
            `Skill '${metadata.name}' already exists. Use overwrite: true to replace.`,
            ToolErrorCode.SKILL_ALREADY_EXISTS
          );
        }

        // 先卸载已存在的版本
        await this.uninstallSkillInternal(metadata.name);
        logger.info(`Overwriting existing skill: ${metadata.name}`);
      }

      // 执行预安装钩子
      const installContext = this.lifecycleManager.createContext(
        metadata.name,
        targetDir,
        metadata,
        undefined,
        options.validationLevel
      );
      await this.lifecycleManager.preInstall(installContext);

      // 移动Skills到目标目录
      await fs.mkdir(path.dirname(targetDir), { recursive: true });
      await fs.rename(tempDir, targetDir);
      logger.debug(`Moved Skills to target: ${targetDir}`);

      // 创建.vectorized标识文件（用于索引状态跟踪）
      const vectorizedFile = path.join(targetDir, ".vectorized");
      await fs.writeFile(vectorizedFile, "");

      // 添加到向量检索索引（如果包含metadata）
      let vectorized = false;
      if (!options.skipVectorization) {
        try {
          await this.retrievalService.indexSkill({
            name: metadata.name,
            description: metadata.description,
            tags: metadata.tags || [],
            path: targetDir,
            version: metadata.version,
            metadata: metadata,
          });
          await fs.writeFile(
            vectorizedFile,
            `indexed: ${new Date().toISOString()}\nversion: ${metadata.version}`
          );
          vectorized = true;
          logger.info("Skill vectorized successfully", { skillName: metadata.name });
        } catch (error) {
          logger.warn("Skill vectorization failed", {
            skillName: metadata.name,
            error: error instanceof Error ? error.message : error,
          });
        }
      }

      const duration = Date.now() - startTime;

      // 执行后安装钩子
      await this.lifecycleManager.postInstall(installContext);

      return {
        success: true,
        message: `Skill '${metadata.name}' installed successfully`,
        skillName: metadata.name,
        installedAt: new Date(),
        duration,
        vectorized,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error("Skill installation failed:", error);

      if (error instanceof ToolError) {
        throw error;
      }

      throw new ToolError(
        `Skill installation failed: ${this.formatError(error)}`,
        ToolErrorCode.SKILL_INVALID_STRUCTURE,
        { duration }
      );
    }
  }

  /**
   * 卸载Skills
   * @param skillName Skills名称
   * @returns 卸载结果
   */
  async uninstallSkill(skillName: string): Promise<UninstallResult> {
    return this.uninstallSkillInternal(skillName, true);
  }

  /**
   * 内部卸载Skills（可跳过部分检查）
   */
  private async uninstallSkillInternal(
    skillName: string,
    validateExists: boolean = true
  ): Promise<UninstallResult> {
    const startTime = Date.now();

    try {
      const skillPath = path.join(this.skillsBasePath, skillName);

      // 检查是否存在
      if (validateExists) {
        const exists = await this.directoryExists(skillPath);
        if (!exists) {
          throw new ToolError(`Skill '${skillName}' not found`, ToolErrorCode.SKILL_NOT_FOUND);
        }
      }

      // 获取元数据用于生命周期钩子
      let metadata: SkillMetadata | undefined;
      try {
        metadata = await this.parseSkillMetadata(skillPath);
      } catch {
        // 如果无法获取元数据，仍然继续卸载
      }

      // 执行预卸载钩子
      const uninstallContext = this.lifecycleManager.createContext(skillName, skillPath, metadata);
      await this.lifecycleManager.preUninstall(uninstallContext);

      // 从向量检索中移除
      try {
        await this.retrievalService.removeSkill(skillName);
        logger.debug("Removed Skill from vector index", { skillName });
      } catch (error) {
        logger.warn("Failed to remove Skill from vector index", {
          skillName,
          error: error instanceof Error ? error.message : error,
        });
      }

      // 删除Skills目录
      await fs.rm(skillPath, { recursive: true, force: true });

      // 执行后卸载钩子
      await this.lifecycleManager.postUninstall(uninstallContext);

      const duration = Date.now() - startTime;

      return {
        success: true,
        message: `Skill '${skillName}' uninstalled successfully`,
        skillName,
        uninstalledAt: new Date(),
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error("Skill uninstallation failed:", error);

      if (error instanceof ToolError) {
        throw error;
      }

      throw new ToolError(
        `Skill uninstallation failed: ${this.formatError(error)}`,
        ToolErrorCode.TOOL_EXECUTION_FAILED,
        { duration }
      );
    }
  }

  /**
   * 更新Skills描述
   * @param skillName Skills名称
   * @param newDescription 新描述
   * @returns 更新结果
   */
  async updateSkill(skillName: string, newDescription: string): Promise<UpdateResult> {
    const startTime = Date.now();

    try {
      // 验证描述长度
      if (newDescription.length > 1024) {
        throw new ToolError(
          `Description too long (${newDescription.length} chars). Maximum 1024 characters allowed.`,
          ToolErrorCode.SKILL_INVALID_STRUCTURE
        );
      }

      const skillPath = path.join(this.skillsBasePath, skillName);

      // 检查Skills是否存在
      if (!(await this.directoryExists(skillPath))) {
        throw new ToolError(`Skill '${skillName}' not found`, ToolErrorCode.SKILL_NOT_FOUND);
      }

      // 获取当前元数据
      const currentMetadata = await this.parseSkillMetadata(skillPath);

      // 执行预更新钩子
      const updateContext = this.lifecycleManager.createContext(
        skillName,
        skillPath,
        currentMetadata
      );
      await this.lifecycleManager.preUpdate(updateContext);

      const skillMdPath = path.join(skillPath, "SKILL.md");

      // 读取并解析SKILL.md
      if (!(await this.fileExists(skillMdPath))) {
        throw new ToolError(
          `SKILL.md not found in Skill '${skillName}'`,
          ToolErrorCode.SKILL_INVALID_STRUCTURE
        );
      }

      const content = await fs.readFile(skillMdPath, "utf8");
      const parsed = matter(content);

      // 更新描述
      parsed.data.description = newDescription;
      parsed.data.updatedAt = new Date().toISOString();

      // 重新生成文件
      const yamlStr = YAML.dump(parsed.data, { indent: 2 });
      const newContent = `---\n${yamlStr}---\n${parsed.content}`;
      await fs.writeFile(skillMdPath, newContent);

      // 因为描述变更，需要重新向量化
      let reindexed = false;
      try {
        // 重新读取元数据
        const updatedMetadata = await this.parseSkillMetadata(skillPath);

        // 先移除旧的向量，再添加新的
        await this.retrievalService.removeSkill(updatedMetadata.name);
        await this.retrievalService.indexSkill({
          name: updatedMetadata.name,
          description: updatedMetadata.description,
          tags: updatedMetadata.tags || [],
          path: skillPath,
          version: updatedMetadata.version,
          metadata: updatedMetadata,
        });

        // 更新.vectorized标识
        const vectorizedFile = path.join(skillPath, ".vectorized");
        await fs.writeFile(
          vectorizedFile,
          `reindexed: ${new Date().toISOString()}\nversion: ${updatedMetadata.version}`
        );

        reindexed = true;
        logger.info("Skill reindexed after update", { skillName });
      } catch (error) {
        logger.warn("Failed to reindex Skill after update", {
          skillName,
          error: error instanceof Error ? error.message : error,
        });
      }

      const duration = Date.now() - startTime;

      // 执行后更新钩子
      await this.lifecycleManager.postUpdate(updateContext);

      return {
        success: true,
        message: `Skill '${skillName}' updated successfully`,
        skillName,
        updatedAt: new Date(),
        duration,
        reindexed,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error("Skill update failed:", error);

      if (error instanceof ToolError) {
        throw error;
      }

      throw new ToolError(
        `Skill update failed: ${this.formatError(error)}`,
        ToolErrorCode.TOOL_EXECUTION_FAILED,
        { duration }
      );
    }
  }

  /**
   * 列出已安装的Skills
   * @param options 查询选项
   * @returns Skills列表结果
   */
  async listSkills(options: SkillListOptions = {}): Promise<SkillListResult> {
    try {
      // 确保目录存在
      await this.ensureSkillsDirectory();
      // 扫描Skills目录
      const entries = await fs.readdir(this.skillsBasePath, { withFileTypes: true });
      const skillDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

      // 加载所有Skills元数据
      const skills: SkillTool[] = [];
      for (const skillName of skillDirs) {
        try {
          const skillPath = path.join(this.skillsBasePath, skillName);
          const metadata = await this.parseSkillMetadata(skillPath);

          skills.push({
            name: metadata.name,
            type: ToolType.SKILL,
            description: metadata.description,
            parameters: metadata.parameters || {
              type: "object",
              properties: {},
              required: [],
            },
            version: metadata.version,
            tags: metadata.tags,
            author: metadata.author,
            enabled: true,
            path: skillPath,
            level: 1,
          });
        } catch (error) {
          logger.warn(`Failed to load Skill metadata: ${skillName}`, {
            error: error instanceof Error ? error.message : error,
          });
        }
      }

      // 应用过滤
      let filtered = skills;

      // 按名称过滤
      if (options.name) {
        const nameFilter = options.name.toLowerCase();
        filtered = filtered.filter(
          (skill) =>
            skill.name.toLowerCase().includes(nameFilter) ||
            skill.description.toLowerCase().includes(nameFilter)
        );
      }

      // 按标签过滤
      if (options.tags && options.tags.length > 0) {
        filtered = filtered.filter((skill) =>
          skill.tags.some((tag) => options.tags!.includes(tag))
        );
      }

      // 排序
      const sortBy = options.sortBy || "name";
      const sortOrder = options.sortOrder || "asc";
      filtered.sort((a, b) => {
        let aVal: any, bVal: any;

        switch (sortBy) {
          case "name":
            aVal = a.name;
            bVal = b.name;
            break;
          case "updatedAt":
          case "installedAt":
            // 使用名称作为后备排序
            aVal = a.name;
            bVal = b.name;
            break;
          default:
            aVal = a.name;
            bVal = b.name;
        }

        const compare = String(aVal).localeCompare(String(bVal));
        return sortOrder === "desc" ? -compare : compare;
      });

      // 分页
      const page = options.page || 1;
      const limit = options.limit || 50;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginated = filtered.slice(startIndex, endIndex);

      return {
        skills: paginated,
        total: filtered.length,
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit),
      };
    } catch (error) {
      logger.error("Failed to list skills:", error);
      throw new ToolError(
        `Failed to list skills: ${this.formatError(error)}`,
        ToolErrorCode.TOOL_EXECUTION_FAILED
      );
    }
  }

  /**
   * 检查Skills是否存在
   * @param skillName Skills名称
   * @returns 是否存在
   */
  async isSkillExist(skillName: string): Promise<boolean> {
    const skillPath = path.join(this.skillsBasePath, skillName);
    return this.directoryExists(skillPath);
  }

  /**
   * 解压ZIP到临时目录
   */
  private async extractZipToTemp(zipBuffer: Buffer): Promise<string> {
    // 创建临时目录
    const tempId = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const tempDir = path.join(os.tmpdir(), "skill-install", tempId);

    await fs.mkdir(tempDir, { recursive: true });

    // 使用adm-zip解压
    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(tempDir, true);

    logger.debug("Extracted ZIP to temp directory", { tempDir });

    return tempDir;
  }

  /**
   * 验证Skills结构
   */
  private async validateSkillStructure(
    skillPath: string,
    validationLevel: SkillInstallOptions["validationLevel"] = "basic"
  ): Promise<SkillMetadata> {
    // 检查必需文件
    const requiredFiles = ["SKILL.md"];

    for (const file of requiredFiles) {
      const filePath = path.join(skillPath, file);
      if (!(await this.fileExists(filePath))) {
        throw new ToolError(
          `Required file missing: ${file}`,
          ToolErrorCode.SKILL_INVALID_STRUCTURE
        );
      }
    }

    // 解析SKILL.md
    const metadata = await this.parseSkillMetadata(skillPath);

    // 严格验证（检查脚本文件是否存在）
    if (validationLevel === "strict") {
      const scriptsDir = path.join(skillPath, "scripts");
      if (!(await this.directoryExists(scriptsDir))) {
        throw new ToolError(
          "Scripts directory not found in strict validation mode",
          ToolErrorCode.SKILL_INVALID_STRUCTURE
        );
      }

      const executeScript = path.join(scriptsDir, "execute.js");
      if (!(await this.fileExists(executeScript))) {
        throw new ToolError(
          "execute.js not found in scripts directory",
          ToolErrorCode.SKILL_INVALID_STRUCTURE
        );
      }
    }

    return metadata;
  }

  /**
   * 解析Skills元数据
   * 使用 ClaudeCodeSkillParser 支持 Claude Code 格式
   */
  private async parseSkillMetadata(skillPath: string): Promise<SkillMetadata> {
    try {
      // 使用兼容层解析器
      const parsedSkill = await this.skillParser.parse(skillPath);

      // 注册生命周期钩子（如果有 hooks）
      if (parsedSkill.compatibility.hooks) {
        this.lifecycleManager.registerHooks(parsedSkill.metadata.name, {
          hooks: parsedSkill.compatibility.hooks,
        } as SkillLifecycleHooks);
      }

      logger.debug("Parsed skill metadata using compat layer", {
        name: parsedSkill.metadata.name,
        source: parsedSkill.compatibility.source,
      });

      return parsedSkill.metadata;
    } catch (error: unknown) {
      // 如果兼容层解析失败，回退到原有解析逻辑
      if (error instanceof ParseError) {
        logger.warn("Compat parser failed, falling back to legacy parser", {
          error: error.message,
        });
        return this.parseSkillMetadataLegacy(skillPath);
      }
      throw error;
    }
  }

  /**
   * 原有解析逻辑（向后兼容）
   */
  private async parseSkillMetadataLegacy(skillPath: string): Promise<SkillMetadata> {
    const skillMdPath = path.join(skillPath, "SKILL.md");

    if (!(await this.fileExists(skillMdPath))) {
      throw new ToolError(
        `SKILL.md not found in ${skillPath}`,
        ToolErrorCode.SKILL_INVALID_STRUCTURE
      );
    }

    const content = await fs.readFile(skillMdPath, "utf8");
    const parsed = matter(content);

    // 检查必需字段
    const requiredFields = ["name", "description", "version"];
    for (const field of requiredFields) {
      if (!parsed.data[field]) {
        throw new ToolError(
          `Required metadata field missing: ${field}`,
          ToolErrorCode.SKILL_INVALID_STRUCTURE
        );
      }
    }

    return {
      name: parsed.data.name,
      description: parsed.data.description,
      category: parsed.data.category || "uncategorized",
      tools: parsed.data.tools || [],
      version: parsed.data.version,
      tags: parsed.data.tags || [],
      author: parsed.data.author,
      dependencies: parsed.data.dependencies || [],
      parameters: parsed.data.parameters,
    };
  }

  /**
   * 检查目录是否存在
   */
  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  /**
   * 确保Skills目录存在，不存在则创建
   */
  private async ensureSkillsDirectory(): Promise<void> {
    try {
      const exists = await this.directoryExists(this.skillsBasePath);
      if (!exists) {
        await fs.mkdir(this.skillsBasePath, { recursive: true });
        logger.info(`Created skills directory: ${this.skillsBasePath}`);
      }
    } catch (error) {
      logger.warn(`Failed to create skills directory: ${this.skillsBasePath}`, error);
    }
  }

  /**
   * 格式化错误信息
   */
  private formatError(error: any): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    return "Unknown error occurred";
  }

  /**
   * 获取指定Skills
   * @param skillName Skills名称
   * @returns Skills信息
   */
  async getSkillByName(skillName: string): Promise<SkillTool | null> {
    const skillPath = path.join(this.skillsBasePath, skillName);

    if (!(await this.directoryExists(skillPath))) {
      return null;
    }

    try {
      const metadata = await this.parseSkillMetadata(skillPath);

      return {
        name: metadata.name,
        type: ToolType.SKILL,
        description: metadata.description,
        parameters: metadata.parameters || {
          type: "object",
          properties: {},
          required: [],
        },
        version: metadata.version,
        tags: metadata.tags,
        author: metadata.author,
        enabled: true,
        path: skillPath,
        level: 1,
      };
    } catch (error) {
      logger.warn(`Failed to load Skill metadata: ${skillName}`, {
        error: error instanceof Error ? error.message : error,
      });
      return null;
    }
  }

  /**
   * 获取Skills统计信息
   * @returns 统计信息
   */
  async getStatistics(): Promise<{
    total: number;
    byTag: Record<string, number>;
    recentlyInstalled: string[];
  }> {
    const skills = await this.listSkills({ limit: 1000 });

    const byTag: Record<string, number> = {};
    for (const skill of skills.skills) {
      for (const tag of skill.tags) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }
    }

    return {
      total: skills.total,
      byTag,
      recentlyInstalled: skills.skills.slice(0, 5).map((s) => s.name),
    };
  }

  /**
   * 获取ToolRetrievalService实例
   */
  getRetrievalService(): ToolRetrievalService {
    return this.retrievalService;
  }

  /**
   * 等待初始化完成
   * 外部调用者可以使用此方法等待Skills索引初始化完成
   * @returns Promise，在初始化完成时resolve
   */
  async waitForInitialization(): Promise<void> {
    if (this.initializationPromise) {
      try {
        await this.initializationPromise;
      } catch (error) {
        // 初始化失败，但不阻止系统继续运行
        logger.warn("Skills initialization failed, but system will continue", {
          error: error instanceof Error ? error.message : error,
        });
      }
    }
  }

  /**
   * 初始化Skills索引
   * 在SkillManager创建时自动调用，扫描并索引所有已存在的Skills
   */
  private async initializeSkillsIndex(): Promise<void> {
    logger.debug("Initializing skills index during startup");

    try {
      // 等待检索服务初始化完成
      await this.retrievalService.initialize();

      // 扫描并索引所有Skills
      await this.retrievalService.scanAndIndexAllSkills(this.skillsBasePath);

      // 注册所有 Skills 到 ToolRegistry
      const { skills } = await this.listSkills({ limit: 1000 });
      for (const skill of skills) {
        await this.registerSkillTool(skill);
      }
      logger.info(`[SkillManager] Registered ${skills.length} skills to ToolRegistry`);

      logger.debug("Skills index initialization completed");
    } catch (error) {
      logger.error("❌ Failed to initialize skills index:", error);
      // 抛出错误，让waitForInitialization捕获
      throw error;
    }
  }

  /**
   * 将 SkillTool 转换为 Tool.Info 格式
   * @param skill SkillTool 定义
   * @returns Tool.Info 格式
   */
  private convertToToolInfo(skill: SkillTool): Tool.Info {
    const executor = this.skillsExecutor;
    return {
      id: skill.name,
      init: async () => ({
        description: skill.description,
        parameters: skill.parameters,
        execute: async (args, ctx) => {
          // 调用实际的 Skill 执行器
          const result = await executor.execute({
            name: skill.name,
            args,
          });
          return {
            title: skill.name,
            metadata: {
              success: result.success,
              duration: result.duration,
              exitCode: result.exitCode,
            },
            output: result.success ? result.output : result.error,
          };
        },
      }),
    };
  }

  /**
   * 注册 Skill 工具到 ToolRegistry
   * @param skill SkillTool 定义
   */
  async registerSkillTool(skill: SkillTool): Promise<void> {
    const toolInfo = this.convertToToolInfo(skill);
    await toolRegistry.register(toolInfo, RegistryToolType.SKILL);
    logger.debug(`Registered skill to ToolRegistry: ${skill.name}`);
  }

  /**
   * Skill Direct 模式 - 直接返回 SKILL.md 内容，无需沙箱执行
   * 用于 FR-37~FR-40 场景
   * @param skillName Skill 名称
   * @param args 工具参数
   * @returns SKILL.md 内容
   */
  async executeDirect(skillName: string, args: Record<string, unknown>): Promise<string> {
    const skillPath = path.join(this.skillsBasePath, skillName);
    const skillMdPath = path.join(skillPath, "SKILL.md");

    // 检查 Skill 是否存在
    if (!(await this.directoryExists(skillPath))) {
      throw new ToolError(`Skill '${skillName}' not found`, ToolErrorCode.SKILL_NOT_FOUND);
    }

    // 读取 SKILL.md
    if (!(await this.fileExists(skillMdPath))) {
      throw new ToolError(
        `SKILL.md not found in Skill '${skillName}'`,
        ToolErrorCode.SKILL_INVALID_STRUCTURE
      );
    }

    const content = await fs.readFile(skillMdPath, "utf8");
    const parsed = matter(content);

    // 返回 SKILL.md 的内容部分（不含 frontmatter）
    logger.debug(`[SkillManager] Direct execution for skill: ${skillName}`);
    return parsed.content;
  }

  /**
   * 获取单例实例
   */
  static getInstance(
    skillsBasePath?: string,
    retrievalService?: ToolRetrievalService
  ): SkillManager {
    if (!SkillManager.instance) {
      SkillManager.instance = new SkillManager(skillsBasePath, retrievalService);
    }
    return SkillManager.instance;
  }

  /**
   * 重置实例（用于测试）
   */
  static resetInstance(): void {
    SkillManager.instance = null;
  }
}

/**
 * 获取默认的SkillManager
 */
export function getSkillManager(
  skillsBasePath?: string,
  retrievalService?: ToolRetrievalService
): SkillManager {
  return SkillManager.getInstance(skillsBasePath, retrievalService);
}
