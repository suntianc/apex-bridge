import { promises as fs } from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import matter from 'gray-matter';
import logger from '../../utils/logger';
import {
  MetadataLoaderOptions,
  SkillMetadata,
  SkillMetadataValidationIssue,
  SkillTriggerMetadata,
  SkillResourceManifest,
  SkillSecurityPolicy,
  SkillTriggerPattern
} from '../../types';

export class MetadataLoaderError extends Error {
  public readonly issues: SkillMetadataValidationIssue[];

  constructor(message: string, issues: SkillMetadataValidationIssue[] = []) {
    super(message);
    this.name = 'MetadataLoaderError';
    this.issues = issues;
  }
}

const DEFAULT_MAX_METADATA_TOKENS = 50;
const DEFAULT_SCRIPT_ENTRY_CANDIDATES = [
  './scripts/execute.ts',
  './scripts/main.ts',
  './scripts/index.ts'
];

interface SkillPackageLayoutInfo {
  skillPath: string;
  skillFile: string;
  metadataFile: string;
  scriptsDir: string;
  referencesDir: string;
  assetsDir: string;
  hasSkillFile: boolean;
  hasMetadataFile: boolean;
  hasScriptsDir: boolean;
  hasReferencesDir: boolean;
  hasAssetsDir: boolean;
  defaultEntry?: string;
  usesCanonicalLayout: boolean;
}

const REQUIRED_FIELDS: Array<keyof SkillMetadata> = [
  'name',
  'displayName',
  'description',
  'version',
  'type',
  'domain',
  'keywords',
  'permissions',
  'cacheable',
  'ttl',
  'path',
  'loadedAt'
];

export class MetadataLoader {
  private readonly maxMetadataTokens: number;
  private readonly strict: boolean;

  constructor(options: MetadataLoaderOptions = {}) {
    this.maxMetadataTokens = options.maxMetadataTokens ?? DEFAULT_MAX_METADATA_TOKENS;
    this.strict = options.strict ?? false;
  }

  async loadMetadata(skillPath: string): Promise<SkillMetadata> {
    const resolvedPath = path.resolve(skillPath);
    await this.ensureSkillDirectory(resolvedPath);

    const layout = await this.analyzePackageLayout(resolvedPath);
    let metadata: SkillMetadata | undefined;
    let rawSource: Record<string, unknown> | undefined;

    const frontMatter = await this.extractFrontMatter(layout.skillFile);
    if (frontMatter && Object.keys(frontMatter).length > 0) {
      rawSource = frontMatter;
      metadata = this.applyDefaults(frontMatter, resolvedPath, layout);
    }

    if (!metadata && layout.hasMetadataFile) {
      rawSource = await this.loadMetadataYaml(layout.metadataFile);
      metadata = this.applyDefaults(rawSource, resolvedPath, layout);
    }

    if (!metadata) {
      throw new MetadataLoaderError(`技能缺少有效的元数据定义: ${resolvedPath}`);
    }

    await this.validateMetadata(metadata, resolvedPath, layout, rawSource);
    this.enforceTokenLimit(metadata, resolvedPath);

    logger.debug(`[MetadataLoader] 已加载技能元数据: ${metadata.name} (${resolvedPath})`);

    return metadata;
  }

  private async loadMetadataYaml(filePath: string): Promise<Record<string, unknown>> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return parseYaml(raw) as Record<string, unknown>;
    } catch (error: any) {
      const issues: SkillMetadataValidationIssue[] = [
        {
          field: 'yaml',
          message: error?.message ?? '无法解析 METADATA.yml'
        }
      ];
      throw new MetadataLoaderError(
        `解析技能元数据失败: ${filePath}`,
        issues
      );
    }
  }

  private async extractFrontMatter(skillFile: string): Promise<Record<string, unknown> | undefined> {
    try {
      const raw = await fs.readFile(skillFile, 'utf-8');
      const { data } = matter(raw);
      if (typeof data === 'object' && data !== null && Object.keys(data).length > 0) {
        return data as Record<string, unknown>;
      }
      return undefined;
    } catch (error: any) {
      const issues: SkillMetadataValidationIssue[] = [
        {
          field: 'frontmatter',
          message: error?.message ?? '无法解析 SKILL.md front matter'
        }
      ];
      throw new MetadataLoaderError(
        `从 SKILL.md 提取元数据失败: ${skillFile}`,
        issues
      );
    }
  }

  private applyDefaults(
    raw: Record<string, unknown>,
    skillPath: string,
    layout: SkillPackageLayoutInfo
  ): SkillMetadata {
    const tags = this.ensureStringArray(raw.tags);
    const normalizedKeywords = this.ensureStringArray(raw.keywords);
    const keywords =
      normalizedKeywords.length > 0
        ? normalizedKeywords
        : tags.length > 0
        ? tags
        : [path.basename(skillPath)];

    const capabilities = this.ensureStringArray(raw.capabilities);
    const triggerPatterns = this.normalizeLegacyTriggerPatterns(raw.triggerPatterns);
    const triggerMetadata = this.extractTriggerMetadata(raw.triggers);
    const securityPolicy = this.extractSecurityPolicy(raw.security);
    const permissions =
      (typeof raw.permissions === 'object' && raw.permissions !== null
        ? (raw.permissions as Record<string, unknown>)
        : {}) ?? {};
    const mergedPermissions = this.normalizePermissions(permissions, securityPolicy);
    const resources = this.extractResourceManifest(raw.resources, layout);

    const inputSchema = this.ensureObject(raw.input_schema ?? raw.inputSchema);
    const outputSchema = this.ensureObject(raw.output_schema ?? raw.outputSchema);

    // 检测协议类型（ABP-only）
    const detectedProtocol = this.detectProtocol(raw);
    // 提取ABP配置
    const abpConfig = this.extractABPConfig(raw, detectedProtocol);

    const resolved: SkillMetadata = {
      name: this.ensureString(raw.name) ?? path.basename(skillPath),
      displayName:
        this.ensureString(raw.displayName) ??
        this.ensureString(raw.name) ??
        path.basename(skillPath),
      description: this.ensureString(raw.description) ?? '',
      version: this.ensureString(raw.version) ?? '1.0.0',
      type: (this.ensureString(raw.type) as SkillMetadata['type']) ?? 'direct',
      category: this.ensureString(raw.category),
      domain: this.ensureString(raw.domain) ?? 'general',
      keywords,
      tags: tags.length > 0 ? tags : undefined,
      capabilities: capabilities.length > 0 ? capabilities : undefined,
      triggerPatterns,
      triggers: triggerMetadata,
      permissions: mergedPermissions,
      security: securityPolicy,
      resources,
      inputSchema,
      outputSchema,
      estimatedTokens: this.ensureNumber(raw.estimatedTokens),
      cacheable: typeof raw.cacheable === 'boolean' ? raw.cacheable : true,
      ttl: this.ensureNumber(raw.ttl) ?? 3600,
      priority: this.ensurePriority(raw.loadingPriority ?? raw.priority),
      config:
        typeof raw.config === 'object' && raw.config !== null
          ? (raw.config as Record<string, unknown>)
          : undefined,
      createdAt: this.ensureNumber(raw.createdAt),
      updatedAt: this.ensureNumber(raw.updatedAt),
      path: skillPath,
      loadedAt: Date.now(),
      // ABP协议支持（可选，保持向后兼容）
      protocol: detectedProtocol === 'abp' ? 'abp' : undefined,
      abp: abpConfig
    };

    return resolved;
  }

  /**
   * 检测协议类型（ABP-only）
   */
  private detectProtocol(raw: Record<string, unknown>): 'vcp' | 'abp' {
    // 如果明确指定了protocol字段，使用该值
    const protocol = this.ensureString(raw.protocol);
    if (protocol === 'abp') {
      return 'abp';
    }
    if (protocol === 'vcp') {
      return 'vcp';
    }

    // 如果存在abp字段，推断为ABP协议
    if (raw.abp && typeof raw.abp === 'object') {
      return 'abp';
    }

    // 默认使用VCP协议（向后兼容）
    return 'vcp';
  }

  /**
   * 提取ABP配置
   */
  private extractABPConfig(
    raw: Record<string, unknown>,
    protocol: 'vcp' | 'abp'
  ): SkillMetadata['abp'] | undefined {
    // 如果不是ABP协议，不提取ABP配置
    if (protocol !== 'abp') {
      return undefined;
    }

    const abpRaw = raw.abp;
    if (!abpRaw || typeof abpRaw !== 'object') {
      return undefined;
    }

    const abp = abpRaw as Record<string, unknown>;

    // 提取kind
    const kind = this.ensureString(abp.kind);
    const validKinds = ['action', 'query', 'transform', 'validate', 'stream', 'schedule'] as const;
    const abpKind = kind && validKinds.includes(kind as any) ? (kind as any) : undefined;

    // 提取tools
    const toolsRaw = abp.tools;
    let tools: SkillMetadata['abp'] extends { tools: infer T } ? T : never | undefined;
    if (Array.isArray(toolsRaw) && toolsRaw.length > 0) {
      tools = toolsRaw
        .map((toolRaw) => {
          if (typeof toolRaw !== 'object' || toolRaw === null) {
            return undefined;
          }

          const tool = toolRaw as Record<string, unknown>;
          const toolName = this.ensureString(tool.name);
          if (!toolName) {
            return undefined;
          }

          return {
            name: toolName,
            description: this.ensureString(tool.description),
            parameters: this.extractABPToolParameters(tool.parameters),
            returns: this.extractABPToolReturns(tool.returns)
          };
        })
        .filter((tool): tool is NonNullable<typeof tools>[number] => tool !== undefined) as any;
    }

    // 只有kind或tools存在时才返回配置
    if (abpKind || tools) {
      return {
        kind: abpKind,
        tools: tools
      };
    }

    return undefined;
  }

  /**
   * 提取ABP工具参数定义
   */
  private extractABPToolParameters(
    parametersRaw: unknown
  ): Record<string, {
    type?: string;
    description?: string;
    required?: boolean;
    default?: any;
    validation?: {
      min?: number;
      max?: number;
      pattern?: string;
      enum?: any[];
    };
  }> | undefined {
    if (!parametersRaw || typeof parametersRaw !== 'object') {
      return undefined;
    }

    const parameters = parametersRaw as Record<string, unknown>;
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value !== 'object' || value === null) {
        continue;
      }

      const param = value as Record<string, unknown>;
      result[key] = {
        type: this.ensureString(param.type),
        description: this.ensureString(param.description),
        required: typeof param.required === 'boolean' ? param.required : undefined,
        default: param.default,
        validation: this.extractABPParameterValidation(param.validation)
      };
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * 提取ABP参数验证规则
   */
  private extractABPParameterValidation(
    validationRaw: unknown
  ): {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: any[];
  } | undefined {
    if (!validationRaw || typeof validationRaw !== 'object') {
      return undefined;
    }

    const validation = validationRaw as Record<string, unknown>;
    const result: {
      min?: number;
      max?: number;
      pattern?: string;
      enum?: any[];
    } = {};

    const min = this.ensureNumber(validation.min);
    if (min !== undefined) {
      result.min = min;
    }

    const max = this.ensureNumber(validation.max);
    if (max !== undefined) {
      result.max = max;
    }

    const pattern = this.ensureString(validation.pattern);
    if (pattern) {
      result.pattern = pattern;
    }

    if (Array.isArray(validation.enum)) {
      result.enum = validation.enum;
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * 提取ABP工具返回值定义
   */
  private extractABPToolReturns(
    returnsRaw: unknown
  ): {
    type?: string;
    description?: string;
  } | undefined {
    if (!returnsRaw || typeof returnsRaw !== 'object') {
      return undefined;
    }

    const returns = returnsRaw as Record<string, unknown>;
    const result: {
      type?: string;
      description?: string;
    } = {};

    const type = this.ensureString(returns.type);
    if (type) {
      result.type = type;
    }

    const description = this.ensureString(returns.description);
    if (description) {
      result.description = description;
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  private ensureStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
    }
    if (typeof value === 'string' && value.trim() !== '') {
      return [value.trim()];
    }
    return [];
  }

  private ensureObject(value: unknown): Record<string, unknown> | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return undefined;
  }

  private normalizeLegacyTriggerPatterns(
    triggerPatternsRaw: unknown
  ): Array<string | SkillTriggerPattern> | undefined {
    if (!Array.isArray(triggerPatternsRaw)) {
      return undefined;
    }

    const normalized = triggerPatternsRaw
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (typeof item === 'object' && item !== null) {
          const pattern = this.ensureString((item as Record<string, unknown>).pattern);
          if (!pattern) {
            return undefined;
          }
          const trigger: SkillTriggerPattern = { pattern };
          const confidence = this.ensureNumber((item as Record<string, unknown>).confidence);
          if (typeof confidence === 'number') {
            trigger.confidence = confidence;
          }
          const locale = this.ensureString((item as Record<string, unknown>).locale);
          if (locale) {
            trigger.locale = locale;
          }
          return trigger;
        }
        return undefined;
      })
      .filter((item): item is string | SkillTriggerPattern => item !== undefined);

    return normalized.length > 0 ? normalized : undefined;
  }

  private extractTriggerMetadata(rawTriggers: unknown): SkillTriggerMetadata | undefined {
    const triggerObj = this.ensureObject(rawTriggers);
    if (!triggerObj) {
      return undefined;
    }

    const intents = this.ensureStringArray(triggerObj.intents);
    const phrases = this.ensureStringArray(triggerObj.phrases);
    const eventTypes = this.ensureStringArray(triggerObj.event_types ?? triggerObj.eventTypes);
    const priority = this.ensureNumber(triggerObj.priority);

    if (
      intents.length === 0 &&
      phrases.length === 0 &&
      eventTypes.length === 0 &&
      priority === undefined
    ) {
      return undefined;
    }

    return {
      intents: intents.length > 0 ? intents : undefined,
      phrases: phrases.length > 0 ? phrases : undefined,
      eventTypes: eventTypes.length > 0 ? eventTypes : undefined,
      priority
    };
  }

  private extractSecurityPolicy(rawSecurity: unknown): SkillSecurityPolicy | undefined {
    const securityObj = this.ensureObject(rawSecurity);
    if (!securityObj) {
      return undefined;
    }

    const security: SkillSecurityPolicy = {};

    const timeout = this.ensureNumber(securityObj.timeout_ms ?? securityObj.timeoutMs);
    if (timeout !== undefined) {
      security.timeoutMs = timeout;
    }

    const memory = this.ensureNumber(securityObj.memory_mb ?? securityObj.memoryMb);
    if (memory !== undefined) {
      security.memoryMb = memory;
    }

    const networkMode = this.ensureString(securityObj.network);
    if (networkMode === 'none' || networkMode === 'allowlist') {
      security.network = networkMode;
    }
    const allowlist = this.ensureStringArray(securityObj.network_allowlist ?? securityObj.networkAllowlist);
    if (allowlist.length > 0) {
      security.networkAllowlist = allowlist;
    }

    const filesystemMode = this.ensureString(securityObj.filesystem);
    if (
      filesystemMode === 'none' ||
      filesystemMode === 'read-only' ||
      filesystemMode === 'read-write'
    ) {
      security.filesystem = filesystemMode;
    }

    const environment =
      typeof securityObj.environment === 'object' && securityObj.environment !== null
        ? Object.entries(securityObj.environment as Record<string, unknown>).reduce<
            Record<string, string>
          >((acc, [key, value]) => {
            if (typeof value === 'string') {
              acc[key] = value;
            }
            return acc;
          }, {})
        : undefined;

    if (environment && Object.keys(environment).length > 0) {
      security.environment = environment;
    }

    return Object.keys(security).length > 0 ? security : undefined;
  }

  private extractResourceManifest(
    rawResources: unknown,
    layout: SkillPackageLayoutInfo
  ): SkillResourceManifest | undefined {
    const resourcesObj = this.ensureObject(rawResources) ?? {};
    const manifest: SkillResourceManifest = {};

    const entryCandidate = this.ensureString(resourcesObj.entry);
    const normalizedEntry = this.resolveResourcePath(layout.skillPath, entryCandidate);
    if (normalizedEntry) {
      manifest.entry = normalizedEntry;
    } else if (!entryCandidate && layout.defaultEntry) {
      manifest.entry = layout.defaultEntry;
    }

    const helperCandidates = this.ensureStringArray(resourcesObj.helpers);
    const normalizedHelpers = helperCandidates
      .map((helper) => this.resolveResourcePath(layout.skillPath, helper))
      .filter((helper): helper is string => Boolean(helper));
    if (normalizedHelpers.length > 0) {
      manifest.helpers = normalizedHelpers;
    }

    const referenceCandidates = this.ensureStringArray(resourcesObj.references);
    const normalizedReferences = referenceCandidates
      .map((reference) => this.resolveResourcePath(layout.skillPath, reference))
      .filter((reference): reference is string => Boolean(reference));
    if (normalizedReferences.length > 0) {
      manifest.references = normalizedReferences;
    }

    const assetCandidates = this.ensureStringArray(resourcesObj.assets);
    const normalizedAssets = assetCandidates
      .map((asset) => this.resolveResourcePath(layout.skillPath, asset))
      .filter((asset): asset is string => Boolean(asset));
    if (normalizedAssets.length > 0) {
      manifest.assets = normalizedAssets;
    }

    if (!manifest.entry && layout.defaultEntry) {
      manifest.entry = layout.defaultEntry;
    }

    return Object.keys(manifest).length > 0 ? manifest : undefined;
  }

  private resolveResourcePath(skillPath: string, candidate?: string): string | undefined {
    if (!candidate || typeof candidate !== 'string') {
      return undefined;
    }
    const sanitized = candidate.replace(/\\/g, '/').replace(/^\.\//, '');
    const normalized = path.posix.normalize(sanitized);
    if (normalized.startsWith('..')) {
      return undefined;
    }
    return `./${normalized}`.replace(/\/\/+/g, '/');
  }

  private resolveAbsoluteResourcePath(skillPath: string, relativePath: string): string {
    const trimmed = relativePath.replace(/^\.\//, '');
    return path.join(skillPath, trimmed);
  }

  private async validateMetadata(
    metadata: SkillMetadata,
    skillPath: string,
    layout: SkillPackageLayoutInfo,
    rawSource?: Record<string, unknown>
  ): Promise<void> {
    const issues: SkillMetadataValidationIssue[] = [];

    for (const field of REQUIRED_FIELDS) {
      if (
        metadata[field] === undefined ||
        metadata[field] === null ||
        (typeof metadata[field] === 'string' && metadata[field].trim() === '')
      ) {
        issues.push({
          field,
          message: `字段 "${field}" 为必填项`
        });
      }
    }

    if (metadata.keywords.length === 0) {
      issues.push({
        field: 'keywords',
        message: '技能必须至少包含一个关键词'
      });
    } else if (rawSource && !this.hasNonEmptyArray(rawSource.keywords)) {
      issues.push({
        field: 'keywords',
        message: '技能必须至少包含一个关键词'
      });
    }

    if (rawSource && !this.hasExplicitString(rawSource.name)) {
      issues.push({
        field: 'name',
        message: '字段 "name" 为必填项'
      });
    }

    if (metadata.ttl <= 0) {
      issues.push({
        field: 'ttl',
        message: 'ttl 必须为正整数'
      });
    }

    const layoutValidation = await this.validateCanonicalLayout(metadata, layout);

    if (layoutValidation.warnings.length > 0) {
      for (const warning of layoutValidation.warnings) {
        logger.warn(`[MetadataLoader] ${warning.message} (${metadata.name})`);
      }
      if (this.strict) {
        issues.push(...layoutValidation.warnings);
      }
    }

    if (layoutValidation.errors.length > 0) {
      issues.push(...layoutValidation.errors);
    }

    if (issues.length > 0) {
      throw new MetadataLoaderError(
        `技能元数据验证失败: ${skillPath}`,
        issues
      );
    }
  }

  private enforceTokenLimit(metadata: SkillMetadata, skillPath: string): void {
    const tokenEstimate = this.estimateMetadataTokens(metadata);
    if (tokenEstimate > this.maxMetadataTokens) {
      const issue: SkillMetadataValidationIssue = {
        field: 'metadata',
        message: `元数据内容超过最大限制 ${this.maxMetadataTokens} tokens (≈ ${tokenEstimate})`
      };

      if (this.strict) {
        throw new MetadataLoaderError(
          `技能元数据超出大小限制: ${skillPath}`,
          [issue]
        );
      }

      logger.warn(
        `⚠️ [MetadataLoader] 技能 ${metadata.name} 的元数据估算 ${tokenEstimate} tokens，超过限制 ${this.maxMetadataTokens} tokens`
      );
    }
  }

  private estimateMetadataTokens(metadata: SkillMetadata): number {
    const content = [
      metadata.name,
      metadata.displayName,
      metadata.description,
      metadata.version,
      metadata.type,
      metadata.category ?? '',
      metadata.domain,
      ...(metadata.keywords ?? []),
      ...(metadata.tags ?? []),
      ...(metadata.capabilities ?? []),
      ...(metadata.triggerPatterns ?? []).map(item =>
        typeof item === 'string' ? item : item.pattern
      )
    ]
      .join(' ')
      .trim();

    if (!content) {
      return 0;
    }

    return content.split(/\s+/).length;
  }

  private ensurePriority(
    value: unknown
  ): SkillMetadata['priority'] | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    if (value === 'low' || value === 'normal' || value === 'high') {
      return value;
    }

    return undefined;
  }

  private normalizePermissions(
    raw: Record<string, unknown>,
    security?: SkillSecurityPolicy
  ): SkillMetadata['permissions'] {
    const permissions: SkillMetadata['permissions'] = {};

    if (typeof raw.network === 'boolean') {
      permissions.network = raw.network;
    } else if (security?.network) {
      permissions.network = security.network !== 'none';
    }

    if (
      raw.filesystem === 'none' ||
      raw.filesystem === 'read' ||
      raw.filesystem === 'read-write'
    ) {
      permissions.filesystem = raw.filesystem;
    } else if (security?.filesystem) {
      if (security.filesystem === 'read-only') {
        permissions.filesystem = 'read';
      } else if (security.filesystem === 'read-write') {
        permissions.filesystem = 'read-write';
      } else {
        permissions.filesystem = 'none';
      }
    }

    if (Array.isArray(raw.externalApis)) {
      permissions.externalApis = raw.externalApis.filter(
        (item): item is string => typeof item === 'string'
      );
    } else if (security?.networkAllowlist && security.networkAllowlist.length > 0) {
      permissions.externalApis = [...security.networkAllowlist];
    }

    if (
      typeof raw.environment === 'object' &&
      raw.environment !== null
    ) {
      permissions.environment = Object.entries(raw.environment).reduce<
        Record<string, string>
      >((acc, [key, value]) => {
        if (typeof value === 'string') {
          acc[key] = value;
        }
        return acc;
      }, {});
    } else if (security?.environment) {
      permissions.environment = { ...security.environment };
    }

    return permissions;
  }

  private ensureString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private ensureNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }

  private hasExplicitString(value: unknown): boolean {
    return typeof value === 'string' && value.trim() !== '';
  }

  private hasNonEmptyArray(value: unknown): boolean {
    return Array.isArray(value) && value.length > 0;
  }

  private async validateCanonicalLayout(
    metadata: SkillMetadata,
    layout: SkillPackageLayoutInfo
  ): Promise<{
    errors: SkillMetadataValidationIssue[];
    warnings: SkillMetadataValidationIssue[];
  }> {
    const errors: SkillMetadataValidationIssue[] = [];
    const warnings: SkillMetadataValidationIssue[] = [];

    if (!layout.hasScriptsDir) {
      warnings.push({
        field: 'scripts',
        message: '技能缺少 scripts/ 目录，建议迁移至 Claude 兼容结构'
      });
    }

    if (metadata.resources?.entry) {
      const entryPath = this.resolveAbsoluteResourcePath(layout.skillPath, metadata.resources.entry);
      if (!(await this.fileExists(entryPath))) {
        errors.push({
          field: 'resources.entry',
          message: `入口脚本不存在: ${metadata.resources.entry}`
        });
      }
    }

    if (metadata.resources?.helpers) {
      for (const helper of metadata.resources.helpers) {
        const helperPath = this.resolveAbsoluteResourcePath(layout.skillPath, helper);
        if (!(await this.fileExists(helperPath))) {
          warnings.push({
            field: 'resources.helpers',
            message: `辅助脚本不存在: ${helper}`
          });
        }
      }
    }

    if (metadata.resources?.references) {
      if (!layout.hasReferencesDir) {
        warnings.push({
          field: 'references',
          message: '声明了 references 但目录不存在'
        });
      } else {
        for (const reference of metadata.resources.references) {
          const referencePath = this.resolveAbsoluteResourcePath(layout.skillPath, reference);
          if (!(await this.fileExists(referencePath))) {
            warnings.push({
              field: 'resources.references',
              message: `参考文件不存在: ${reference}`
            });
          }
        }
      }
    }

    if (metadata.resources?.assets) {
      if (!layout.hasAssetsDir) {
        warnings.push({
          field: 'assets',
          message: '声明了 assets 但目录不存在'
        });
      } else {
        for (const asset of metadata.resources.assets) {
          const assetPath = this.resolveAbsoluteResourcePath(layout.skillPath, asset);
          if (!(await this.fileExists(assetPath))) {
            warnings.push({
              field: 'resources.assets',
              message: `资产文件不存在: ${asset}`
            });
          }
        }
      }
    }

    if (
      metadata.security?.network === 'allowlist' &&
      (!metadata.security.networkAllowlist || metadata.security.networkAllowlist.length === 0)
    ) {
      warnings.push({
        field: 'security.networkAllowlist',
        message: 'network=allowlist 但未提供 networkAllowlist'
      });
    }

    return { errors, warnings };
  }

  private async analyzePackageLayout(skillPath: string): Promise<SkillPackageLayoutInfo> {
    const skillFile = path.join(skillPath, 'SKILL.md');
    const metadataFile = path.join(skillPath, 'METADATA.yml');
    const scriptsDir = path.join(skillPath, 'scripts');
    const referencesDir = path.join(skillPath, 'references');
    const assetsDir = path.join(skillPath, 'assets');

    const hasSkillFile = await this.fileExists(skillFile);
    if (!hasSkillFile) {
      throw new MetadataLoaderError(`技能缺少 SKILL.md: ${skillPath}`);
    }

    const hasMetadataFile = await this.fileExists(metadataFile);
    const hasScriptsDir = await this.directoryExists(scriptsDir);
    const hasReferencesDir = await this.directoryExists(referencesDir);
    const hasAssetsDir = await this.directoryExists(assetsDir);

    let defaultEntry: string | undefined;
    if (hasScriptsDir) {
      for (const candidate of DEFAULT_SCRIPT_ENTRY_CANDIDATES) {
        const absoluteCandidate = path.join(
          skillPath,
          candidate.replace(/^\.\//, '').replace(/\\/g, path.sep)
        );
        if (await this.fileExists(absoluteCandidate)) {
          defaultEntry = candidate;
          break;
        }
      }
    }

    return {
      skillPath,
      skillFile,
      metadataFile,
      scriptsDir,
      referencesDir,
      assetsDir,
      hasSkillFile,
      hasMetadataFile,
      hasScriptsDir,
      hasReferencesDir,
      hasAssetsDir,
      defaultEntry,
      usesCanonicalLayout: hasScriptsDir
    };
  }

  private async ensureSkillDirectory(skillPath: string): Promise<void> {
    try {
      const stats = await fs.stat(skillPath);
      if (!stats.isDirectory()) {
        throw new MetadataLoaderError(`技能路径不是目录: ${skillPath}`);
      }
    } catch (error: any) {
      throw new MetadataLoaderError(
        `无法访问技能目录: ${skillPath}`,
        [
          {
            field: 'path',
            message: error?.message ?? '目录不存在'
          }
        ]
      );
    }
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

