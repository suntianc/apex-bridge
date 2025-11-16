import path from 'path';
import Module from 'module';
import {
  DependencyAnalysisOptions,
  DependencyManagerOptions,
  DependencyResolutionSummary,
  ResolvedDependency,
  SkillDependency,
  SkillDependencyCategory
} from '../../types';
import { DependencyResolutionError } from './CodeGenerationErrors';

const BUILTIN_MODULES = new Set(
  Module.builtinModules.map((mod) => (mod.startsWith('node:') ? mod.slice(5) : mod))
);

const DEFAULT_ALLOWED_BUILTINS = new Set([
  'path',
  'url',
  'util',
  'events',
  'querystring',
  'string_decoder'
]);

const REMOTE_PROTOCOL_REGEX = /^(https?:)?\/\//i;

const IMPORT_REGEX = /import\s+(?:([\w*\s{},]+)\s+from\s+)?['"]([^'"]+)['"]/g;
const REQUIRE_REGEX = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const DYNAMIC_IMPORT_REGEX = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const normalizeModuleName = (moduleName: string): string =>
  moduleName.startsWith('node:') ? moduleName.slice(5) : moduleName;

export class DependencyManager {
  private readonly allowRelative: boolean;
  private readonly allowedBuiltins: Set<string>;
  private readonly allowedExternal: Set<string> | null;
  private readonly customResolvers: Map<string, () => unknown>;
  private readonly cache = new Map<string, ResolvedDependency>();

  constructor(options: DependencyManagerOptions = {}) {
    this.allowRelative = options.allowRelative ?? false;
    this.allowedBuiltins = new Set(
      (options.allowedBuiltins ?? Array.from(DEFAULT_ALLOWED_BUILTINS)).map((mod) =>
        normalizeModuleName(mod)
      )
    );
    this.allowedExternal = options.allowedExternal
      ? new Set(options.allowedExternal)
      : null;
    this.customResolvers = new Map(Object.entries(options.customResolvers ?? {}));
  }

  analyzeCodeBlocks(
    codeBlocks: string[],
    options: DependencyAnalysisOptions = {}
  ): SkillDependency[] {
    const dependencies = this.extractDependencies(codeBlocks);
    this.validateDependencies(dependencies, options);
    return dependencies;
  }

  resolveDependencies(
    dependencies: SkillDependency[],
    baseDir?: string
  ): DependencyResolutionSummary {
    const resolvedModules: ResolvedDependency[] = [];
    const warnings: string[] = [];

    for (const dep of dependencies) {
      const cacheKey = `${dep.importType}:${dep.module}`;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        resolvedModules.push(cached);
        continue;
      }

      const resolver = this.customResolvers.get(dep.module);
      if (resolver) {
        const exports = resolver();
        const resolved: ResolvedDependency = {
          module: dep.module,
          category: dep.category ?? 'external',
          exports
        };
        this.cache.set(cacheKey, resolved);
        resolvedModules.push(resolved);
        warnings.push(`模块 ${dep.module} 使用自定义解析器加载`);
        continue;
      }

      if (dep.category === 'remote') {
        throw new DependencyResolutionError(
          `无法解析远程依赖: ${dep.module}`,
          dep.module,
          '远程依赖需要在安全代理中处理'
        );
      }

      if (dep.category === 'relative') {
        if (!this.allowRelative) {
          throw new DependencyResolutionError(
            `禁止使用相对路径依赖: ${dep.module}`,
            dep.module,
            '相对依赖被禁用'
          );
        }
        if (!baseDir) {
          throw new DependencyResolutionError(
            `解析相对依赖失败: ${dep.module}`,
            dep.module,
            '需要提供基准目录',
            { module: dep.module }
          );
        }
      }

      const resolved = this.loadModule(dep, baseDir);
      this.cache.set(cacheKey, resolved);
      resolvedModules.push(resolved);
    }

    return { resolvedModules, warnings };
  }

  clearCache(): void {
    this.cache.clear();
  }

  private extractDependencies(codeBlocks: string[]): SkillDependency[] {
    const dependencies = new Map<string, SkillDependency>();

    const addDependency = (
      moduleName: string,
      importType: 'import' | 'require',
      specifier?: string
    ) => {
      const key = `${importType}:${moduleName}`;
      if (dependencies.has(key)) {
        return;
      }
      const category = this.determineCategory(moduleName);
      dependencies.set(key, {
        module: moduleName,
        importType,
        specifier,
        category
      });
    };

    for (const code of codeBlocks) {
      let match: RegExpExecArray | null;
      while ((match = IMPORT_REGEX.exec(code)) !== null) {
        const specifier = match[1]?.trim();
        const moduleName = match[2];
        addDependency(moduleName, 'import', specifier);
      }
      while ((match = REQUIRE_REGEX.exec(code)) !== null) {
        const moduleName = match[1];
        addDependency(moduleName, 'require');
      }
      while ((match = DYNAMIC_IMPORT_REGEX.exec(code)) !== null) {
        const moduleName = match[1];
        addDependency(moduleName, 'import');
      }
    }

    return Array.from(dependencies.values());
  }

  private validateDependencies(
    dependencies: SkillDependency[],
    options: DependencyAnalysisOptions
  ): void {
    for (const dep of dependencies) {
      const moduleName = dep.module;
      const normalized = normalizeModuleName(moduleName);
      const category = dep.category ?? this.determineCategory(moduleName);

      if (category === 'remote') {
        throw new DependencyResolutionError(
          `检测到远程依赖: ${moduleName}`,
          moduleName,
          '禁止直接引入远程模块',
          { skillName: options.skillName }
        );
      }

      if (category === 'relative' && !this.allowRelative) {
        throw new DependencyResolutionError(
          `检测到相对依赖: ${moduleName}`,
          moduleName,
          '相对依赖被禁止',
          { skillName: options.skillName }
        );
      }

      if (category === 'builtin') {
        if (!this.allowedBuiltins.has(normalized)) {
          throw new DependencyResolutionError(
            `内置模块未在白名单中: ${moduleName}`,
            moduleName,
            '内置模块需要显式授权',
            { allowedBuiltins: Array.from(this.allowedBuiltins) }
          );
        }
      }

      if (category === 'external' && this.allowedExternal && !this.allowedExternal.has(moduleName)) {
        throw new DependencyResolutionError(
          `外部模块未在白名单中: ${moduleName}`,
          moduleName,
          '外部模块需要显式授权',
          { allowedExternal: Array.from(this.allowedExternal) }
        );
      }
    }
  }

  private determineCategory(moduleName: string): SkillDependencyCategory {
    if (REMOTE_PROTOCOL_REGEX.test(moduleName)) {
      return 'remote';
    }

    if (moduleName.startsWith('.') || moduleName.startsWith('..')) {
      return 'relative';
    }

    const normalized = normalizeModuleName(moduleName);
    if (BUILTIN_MODULES.has(normalized)) {
      return 'builtin';
    }

    return 'external';
  }

  private loadModule(dep: SkillDependency, baseDir?: string): ResolvedDependency {
    const moduleName = dep.module;
    const category = dep.category ?? this.determineCategory(moduleName);
    const normalized = normalizeModuleName(moduleName);

    try {
      let exports: unknown;
      if (category === 'relative') {
        const resolvedPath = path.resolve(baseDir ?? process.cwd(), moduleName);
        exports = require(resolvedPath);
        return {
          module: moduleName,
          category,
          exports,
          path: resolvedPath
        };
      }

      if (category === 'builtin') {
        exports = require(moduleName.startsWith('node:') ? moduleName : normalized);
      } else {
        exports = require(moduleName);
      }

      return {
        module: moduleName,
        category,
        exports
      };
    } catch (error: any) {
      throw new DependencyResolutionError(
        `加载模块失败: ${moduleName}`,
        moduleName,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
