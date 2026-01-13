/**
 * LifecycleManager - 技能生命周期管理器
 * 处理技能的安装、更新、卸载生命周期钩子
 */

import * as fs from "fs/promises";
import * as path from "path";
import { SkillLifecycleHooks, SkillLifecycleContext, ParsedClaudeSkill } from "./types";
import { SkillMetadata } from "../../types/tool-system";
import { logger } from "../../utils/logger";

/**
 * 依赖检查结果
 */
export interface DependencyCheckResult {
  satisfied: boolean;
  missing: string[];
  installed: string[];
}

/**
 * 安装结果
 */
export interface InstallResult {
  success: boolean;
  context: SkillLifecycleContext;
  error?: string;
}

/**
 * 更新结果
 */
export interface UpdateResult {
  success: boolean;
  context: SkillLifecycleContext;
  previousVersion?: string;
  error?: string;
}

/**
 * 卸载结果
 */
export interface UninstallResult {
  success: boolean;
  skillName: string;
  error?: string;
}

/**
 * 回滚状态
 */
interface RollbackState {
  timestamp: Date;
  previousContext?: SkillLifecycleContext;
  actions: string[];
}

/**
 * 生命周期管理器
 */
export class LifecycleManager {
  private readonly hooksRegistry: Map<string, SkillLifecycleHooks>;
  private readonly hookCache: Map<string, ParsedClaudeSkill["compatibility"]>;
  private readonly rollbackStates: Map<string, RollbackState>;
  private _installHook:
    | ((skillName: string, skillPath: string, metadata: SkillMetadata) => Promise<void>)
    | null = null;
  private _updateHook:
    | ((skillName: string, skillPath: string, metadata: SkillMetadata) => Promise<void>)
    | null = null;
  private _uninstallHook: ((skillName: string, skillPath: string) => Promise<void>) | null = null;

  constructor() {
    this.hooksRegistry = new Map();
    this.hookCache = new Map();
    this.rollbackStates = new Map();
  }

  /**
   * 注册生命周期钩子
   */
  registerHooks(skillName: string, hooks: SkillLifecycleHooks): void {
    this.hooksRegistry.set(skillName, hooks);
    logger.debug(`Registered lifecycle hooks for skill: ${skillName}`);
  }

  /**
   * 注销生命周期钩子
   */
  unregisterHooks(skillName: string): void {
    this.hooksRegistry.delete(skillName);
    this.hookCache.delete(skillName);
    logger.debug(`Unregistered lifecycle hooks for skill: ${skillName}`);
  }

  /**
   * 执行预安装钩子
   */
  async preInstall(ctx: SkillLifecycleContext): Promise<void> {
    const hooks = this.hooksRegistry.get(ctx.skillName);
    if (hooks?.preInstall) {
      logger.info(`Executing preInstall hook for skill: ${ctx.skillName}`);
      await hooks.preInstall(ctx);
    }
  }

  /**
   * 执行后安装钩子
   */
  async postInstall(ctx: SkillLifecycleContext): Promise<void> {
    const hooks = this.hooksRegistry.get(ctx.skillName);
    if (hooks?.postInstall) {
      logger.info(`Executing postInstall hook for skill: ${ctx.skillName}`);
      await hooks.postInstall(ctx);
    }

    // 如果有 compatibility 信息，缓存它
    if (ctx.compatibility) {
      this.hookCache.set(ctx.skillName, ctx.compatibility as ParsedClaudeSkill["compatibility"]);
    }
  }

  /**
   * 执行预更新钩子
   */
  async preUpdate(ctx: SkillLifecycleContext): Promise<void> {
    const hooks = this.hooksRegistry.get(ctx.skillName);
    if (hooks?.preUpdate) {
      logger.info(`Executing preUpdate hook for skill: ${ctx.skillName}`);
      await hooks.preUpdate(ctx);
    }
  }

  /**
   * 执行后更新钩子
   */
  async postUpdate(ctx: SkillLifecycleContext): Promise<void> {
    const hooks = this.hooksRegistry.get(ctx.skillName);
    if (hooks?.postUpdate) {
      logger.info(`Executing postUpdate hook for skill: ${ctx.skillName}`);
      await hooks.postUpdate(ctx);
    }

    // 更新缓存的 compatibility 信息
    if (ctx.compatibility) {
      this.hookCache.set(ctx.skillName, ctx.compatibility as ParsedClaudeSkill["compatibility"]);
    }
  }

  /**
   * 执行预卸载钩子
   */
  async preUninstall(ctx: SkillLifecycleContext): Promise<void> {
    const hooks = this.hooksRegistry.get(ctx.skillName);
    if (hooks?.preUninstall) {
      logger.info(`Executing preUninstall hook for skill: ${ctx.skillName}`);
      await hooks.preUninstall(ctx);
    }
  }

  /**
   * 执行后卸载钩子
   */
  async postUninstall(ctx: SkillLifecycleContext): Promise<void> {
    const hooks = this.hooksRegistry.get(ctx.skillName);
    if (hooks?.postUninstall) {
      logger.info(`Executing postUninstall hook for skill: ${ctx.skillName}`);
      await hooks.postUninstall(ctx);
    }

    // 清理缓存
    this.hookCache.delete(ctx.skillName);
    this.hooksRegistry.delete(ctx.skillName);
  }

  /**
   * 检查依赖是否满足
   */
  async checkDependencies(
    dependencies: string[],
    installedSkills: string[]
  ): Promise<DependencyCheckResult> {
    const installed = new Set(installedSkills.map((s) => s.toLowerCase()));
    const missing: string[] = [];
    const satisfiedDeps: string[] = [];

    for (const dep of dependencies) {
      const depLower = dep.toLowerCase();
      if (installed.has(depLower)) {
        satisfiedDeps.push(dep);
      } else {
        missing.push(dep);
      }
    }

    return {
      satisfied: missing.length === 0,
      missing,
      installed: satisfiedDeps,
    };
  }

  /**
   * 安装依赖
   */
  async installDependencies(
    dependencies: string[],
    basePath: string
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    for (const dep of dependencies) {
      const depPath = path.join(basePath, "dependencies", dep);

      try {
        // 检查依赖是否存在
        await fs.access(depPath);

        // 检查是否有 install 脚本
        const installScript = path.join(depPath, "install.sh");
        const installJs = path.join(depPath, "install.js");

        if (await this.fileExists(installScript)) {
          await this.executeInstallScript(installScript, dep);
        } else if (await this.fileExists(installJs)) {
          await this.executeInstallScript(installJs, dep);
        }

        logger.info(`Installed dependency: ${dep}`);
      } catch (error) {
        const errorMsg = `Failed to install dependency: ${dep}`;
        logger.error(errorMsg, error);
        errors.push(errorMsg);
      }
    }

    return {
      success: errors.length === 0,
      errors,
    };
  }

  /**
   * 执行安装脚本
   */
  private async executeInstallScript(scriptPath: string, depName: string): Promise<void> {
    logger.info(`Executing install script for dependency: ${depName}`);

    // 注意：实际执行逻辑应该由 ScriptExecutor 处理
    // 这里只做基本的脚本验证
    await fs.access(scriptPath);
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取技能的兼容性信息
   */
  getCompatibility(skillName: string): ParsedClaudeSkill["compatibility"] | undefined {
    return this.hookCache.get(skillName);
  }

  /**
   * 检查技能是否有特定能力
   */
  hasCapability(skillName: string, capability: keyof ParsedClaudeSkill["compatibility"]): boolean {
    const compatibility = this.hookCache.get(skillName);
    return compatibility ? capability in compatibility : false;
  }

  /**
   * 获取技能的 context 模式
   */
  getContextMode(skillName: string): "fork" | "inline" | undefined {
    const compatibility = this.hookCache.get(skillName);
    if (compatibility && "context" in compatibility) {
      return compatibility.context as "fork" | "inline" | undefined;
    }
    return undefined;
  }

  /**
   * 检查技能是否使用 fork 模式
   */
  isForkMode(skillName: string): boolean {
    return this.getContextMode(skillName) === "fork";
  }

  /**
   * 检查技能是否使用 inline 模式
   */
  isInlineMode(skillName: string): boolean {
    return this.getContextMode(skillName) === "inline";
  }

  /**
   * 获取所有已注册的技能名称
   */
  getRegisteredSkills(): string[] {
    return Array.from(this.hooksRegistry.keys());
  }

  /**
   * 清除所有钩子注册
   */
  clear(): void {
    this.hooksRegistry.clear();
    this.hookCache.clear();
    logger.debug("Cleared all lifecycle hook registrations");
  }

  /**
   * 从 compatibility 对象创建上下文
   */
  createContext(
    skillName: string,
    skillPath: string,
    metadata: SkillMetadata | undefined,
    compatibility?: ParsedClaudeSkill["compatibility"],
    validationLevel: "strict" | "basic" | "none" = "basic"
  ): SkillLifecycleContext {
    return {
      skillName,
      skillPath,
      metadata,
      compatibility,
      validationLevel,
      dependencies: metadata?.dependencies,
    };
  }

  /**
   * 设置自定义安装操作
   */
  setInstallHook(
    hook: (skillName: string, skillPath: string, metadata: SkillMetadata) => Promise<void>
  ): void {
    this._installHook = hook;
  }

  /**
   * 设置自定义更新操作
   */
  setUpdateHook(
    hook: (skillName: string, skillPath: string, metadata: SkillMetadata) => Promise<void>
  ): void {
    this._updateHook = hook;
  }

  /**
   * 设置自定义卸载操作
   */
  setUninstallHook(hook: (skillName: string, skillPath: string) => Promise<void>): void {
    this._uninstallHook = hook;
  }

  /**
   * 执行实际的安装操作
   */
  private async performInstall(context: SkillLifecycleContext): Promise<void> {
    if (this._installHook) {
      await this._installHook(context.skillName, context.skillPath, context.metadata!);
    } else {
      logger.info(`Performing install for skill: ${context.skillName}`);
    }
  }

  /**
   * 执行实际的更新操作
   */
  private async performUpdate(context: SkillLifecycleContext): Promise<void> {
    if (this._updateHook) {
      await this._updateHook(context.skillName, context.skillPath, context.metadata!);
    } else {
      logger.info(`Performing update for skill: ${context.skillName}`);
    }
  }

  /**
   * 执行实际的卸载操作
   */
  private async performUninstall(context: SkillLifecycleContext): Promise<void> {
    if (this._uninstallHook) {
      await this._uninstallHook(context.skillName, context.skillPath);
    } else {
      logger.info(`Performing uninstall for skill: ${context.skillName}`);
    }
  }

  /**
   * 保存回滚状态
   */
  private saveRollbackState(skillName: string, actions: string[]): void {
    const previousCompatibility = this.hookCache.get(skillName);
    const previousContext: SkillLifecycleContext = {
      skillName,
      skillPath: "",
      compatibility: previousCompatibility,
    };

    this.rollbackStates.set(skillName, {
      timestamp: new Date(),
      previousContext,
      actions,
    });
  }

  /**
   * 执行回滚
   */
  private async performRollback(skillName: string): Promise<void> {
    const rollbackState = this.rollbackStates.get(skillName);
    if (rollbackState) {
      logger.info(`Rolling back skill: ${skillName}`);
      this.rollbackStates.delete(skillName);
    }
  }

  /**
   * 执行单个 hook
   */
  private async executeHook(
    hookType: keyof SkillLifecycleHooks,
    context: SkillLifecycleContext
  ): Promise<void> {
    const hooks = this.hooksRegistry.get(context.skillName);
    const hook = hooks?.[hookType];

    if (hook) {
      logger.debug(`Executing ${hookType} hook for ${context.skillName}`);
      await hook(context);
    }
  }

  /**
   * 执行完整的安装生命周期
   */
  async executeInstallLifecycle(
    skillName: string,
    skillPath: string,
    metadata: SkillMetadata
  ): Promise<InstallResult> {
    const context = this.createContext(skillName, skillPath, metadata);

    try {
      logger.info(`Starting install lifecycle for skill: ${skillName}`);

      // 1. 执行 preInstall hook
      await this.executeHook("preInstall", context);

      // 2. 执行安装操作
      await this.performInstall(context);

      // 3. 执行 postInstall hook
      await this.executeHook("postInstall", context);

      logger.info(`Install lifecycle completed for skill: ${skillName}`);
      return { success: true, context };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Install lifecycle failed for skill ${skillName}: ${errorMessage}`);

      // 回滚: 执行 preUninstall hook
      try {
        await this.executeHook("preUninstall", context);
      } catch (rollbackError) {
        logger.error(`Rollback preUninstall failed: ${rollbackError}`);
      }

      return { success: false, context, error: errorMessage };
    }
  }

  /**
   * 执行完整的更新生命周期
   */
  async executeUpdateLifecycle(
    skillName: string,
    skillPath: string,
    metadata: SkillMetadata
  ): Promise<UpdateResult> {
    const context = this.createContext(skillName, skillPath, metadata);
    const previousVersion = metadata.version;

    try {
      logger.info(`Starting update lifecycle for skill: ${skillName}`);

      // 保存回滚状态
      this.saveRollbackState(skillName, ["update"]);

      // 1. 执行 preUpdate hook
      await this.executeHook("preUpdate", context);

      // 2. 执行更新操作
      await this.performUpdate(context);

      // 3. 执行 postUpdate hook
      await this.executeHook("postUpdate", context);

      logger.info(`Update lifecycle completed for skill: ${skillName}`);
      return { success: true, context, previousVersion };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Update lifecycle failed for skill ${skillName}: ${errorMessage}`);

      // 回滚: 恢复到更新前状态
      await this.performRollback(skillName);

      return { success: false, context, previousVersion, error: errorMessage };
    }
  }

  /**
   * 执行完整的卸载生命周期
   */
  async executeUninstallLifecycle(
    skillName: string,
    skillPath: string,
    metadata: SkillMetadata
  ): Promise<UninstallResult> {
    const context = this.createContext(skillName, skillPath, metadata);

    try {
      logger.info(`Starting uninstall lifecycle for skill: ${skillName}`);

      // 1. 执行 preUninstall hook
      await this.executeHook("preUninstall", context);

      // 2. 执行卸载操作
      await this.performUninstall(context);

      // 3. 执行 postUninstall hook 并清理
      await this.postUninstall(context);

      logger.info(`Uninstall lifecycle completed for skill: ${skillName}`);
      return { success: true, skillName };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Uninstall lifecycle failed for skill ${skillName}: ${errorMessage}`);

      // 记录错误但不回滚（卸载失败）
      return { success: false, skillName, error: errorMessage };
    }
  }
}

/**
 * 默认生命周期管理器实例
 */
let defaultManager: LifecycleManager | null = null;

export function getLifecycleManager(): LifecycleManager {
  if (!defaultManager) {
    defaultManager = new LifecycleManager();
  }
  return defaultManager;
}
