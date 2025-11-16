import { promises as fs } from 'fs';
import * as path from 'path';
import logger from '../../utils/logger';
import { MetadataLoader } from './MetadataLoader';
import {
  SkillSearchOptions,
  SkillSearchResult,
  SkillsIndexOptions,
  SkillsIndexStats,
  SkillMetadata,
  SkillMetadataProvider,
  SkillResourceManifest,
  SkillSecurityPolicy
} from '../../types';

const DEFAULT_SEARCH_LIMIT = 3;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.15;

export class SkillsIndex {
  private readonly skillsRoot: string;
  private readonly metadataProvider: SkillMetadataProvider;
  private readonly defaultSearchLimit: number;
  private readonly defaultConfidenceThreshold: number;
  private readonly caseSensitive: boolean;

  private readonly metadataByName = new Map<string, SkillMetadata>();
  private readonly metadataPathByName = new Map<string, string>();
  private readonly tokensByName = new Map<string, string[]>();

  private stats: SkillsIndexStats = {
    totalSkills: 0,
    cacheHits: 0,
    cacheMisses: 0,
    lastIndexedAt: undefined
  };

  constructor(options: SkillsIndexOptions) {
    this.skillsRoot = path.resolve(options.skillsRoot);
    this.metadataProvider =
      options.metadataProvider ?? new MetadataLoader();
    this.defaultSearchLimit =
      options.defaultSearchLimit ?? DEFAULT_SEARCH_LIMIT;
    this.defaultConfidenceThreshold =
      options.defaultConfidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
    this.caseSensitive = options.caseSensitive ?? false;
  }

  async buildIndex(): Promise<void> {
    const skillDirectories = await this.scanSkillsDirectory(this.skillsRoot);

    this.metadataByName.clear();
    this.metadataPathByName.clear();
    this.tokensByName.clear();

    for (const skillDir of skillDirectories) {
      try {
        const metadata = await this.metadataProvider.loadMetadata(skillDir);
        this.addToIndex(metadata.name, metadata, skillDir);
      } catch (error) {
        logger.error(
          `❌ [SkillsIndex] 构建索引失败 (${skillDir}): ${(error as Error).message}`
        );
      }
    }

    this.stats.totalSkills = this.metadataByName.size;
    this.stats.lastIndexedAt = Date.now();

    logger.info(
      `✅ [SkillsIndex] 已构建索引: ${this.stats.totalSkills} 个技能 (${this.skillsRoot})`
    );
  }

  getMetadata(skillName: string): SkillMetadata | undefined {
    const normalizedName = this.normalizeName(skillName);
    const metadata = this.metadataByName.get(normalizedName);
    if (metadata) {
      this.stats.cacheHits += 1;
      return this.cloneMetadata(metadata);
    }
    this.stats.cacheMisses += 1;
    return undefined;
  }

  getAllMetadata(): SkillMetadata[] {
    return Array.from(this.metadataByName.values()).map((meta) =>
      this.cloneMetadata(meta)
    );
  }

  hasSkill(skillName: string): boolean {
    const normalizedName = this.normalizeName(skillName);
    return this.metadataByName.has(normalizedName);
  }

  getSkillPath(skillName: string): string | undefined {
    const normalizedName = this.normalizeName(skillName);
    return this.metadataPathByName.get(normalizedName);
  }

  async reloadSkill(skillName: string): Promise<SkillMetadata | undefined> {
    const normalizedName = this.normalizeName(skillName);
    const skillPath =
      this.metadataPathByName.get(normalizedName) ??
      (await this.findSkillDirectoryByName(normalizedName));

    if (!skillPath) {
      return undefined;
    }

    const metadata = await this.metadataProvider.loadMetadata(skillPath);
    this.addToIndex(normalizedName, metadata, skillPath);
    return this.cloneMetadata(metadata);
  }

  async findRelevantSkills(
    intent: string,
    options: SkillSearchOptions = {}
  ): Promise<SkillSearchResult[]> {
    if (!intent.trim()) {
      return [];
    }

    const limit = options.limit ?? this.defaultSearchLimit;
    const minConfidence =
      options.minConfidence ?? this.defaultConfidenceThreshold;
    const tokens = this.tokenize(intent);
    const normalizedIntent = this.caseSensitive ? intent : intent.toLowerCase();

    const scoredResults: SkillSearchResult[] = [];

    for (const [name, metadata] of this.metadataByName.entries()) {
      const matchedKeywords = metadata.keywords.filter((keyword) => {
        const normalizedKeyword = this.caseSensitive ? keyword : keyword.toLowerCase();
        return (
          tokens.includes(normalizedKeyword) ||
          normalizedIntent.includes(normalizedKeyword)
        );
      });

      if (options.requiredKeywords) {
        const normalizedMatched = matchedKeywords.map((kw) =>
          this.caseSensitive ? kw : kw.toLowerCase()
        );
        const normalizedRequired = options.requiredKeywords.map((kw) =>
          this.caseSensitive ? kw : kw.toLowerCase()
        );

        if (!normalizedRequired.every((kw) => normalizedMatched.includes(kw))) {
          continue;
        }
      }

      if (options.domain && metadata.domain !== options.domain) {
        continue;
      }

      let descriptionTokens = this.tokensByName.get(name);
      if (!descriptionTokens) {
        descriptionTokens = this.tokenize(metadata.description);
        this.tokensByName.set(name, descriptionTokens);
      }

      const matchedDescriptions = descriptionTokens.filter((token) =>
        tokens.includes(token)
      );

      const keywordScore =
        metadata.keywords.length > 0
          ? matchedKeywords.length / metadata.keywords.length
          : 0;

      const descriptionScore =
        descriptionTokens.length > 0
          ? matchedDescriptions.length / descriptionTokens.length
          : 0;

      const domainScore =
        options.domain && metadata.domain === options.domain ? 1 : 0;

      const triggerMatch = this.computeTriggerMatch(normalizedIntent, metadata);
      let confidence =
        keywordScore * 0.6 + descriptionScore * 0.3 + domainScore * 0.1;

      if (triggerMatch.score > 0) {
        confidence = Math.max(confidence, triggerMatch.score);
      }

      if (metadata.triggers?.priority && metadata.triggers.priority > 0) {
        confidence = Math.min(1, confidence + metadata.triggers.priority * 0.1);
      }

      if (confidence < minConfidence) {
        continue;
      }

      scoredResults.push({
        metadata: this.cloneMetadata(metadata),
        confidence: Number(confidence.toFixed(4)),
        matchedKeywords,
        matchedDescriptionTerms: matchedDescriptions,
        matchedTriggers: triggerMatch.matches.length > 0 ? triggerMatch.matches : undefined
      });
    }

    scoredResults.sort((a, b) => b.confidence - a.confidence);
    return scoredResults.slice(0, limit);
  }

  getStats(): SkillsIndexStats {
    return { ...this.stats };
  }

  private addToIndex(
    skillName: string,
    metadata: SkillMetadata,
    skillPath: string
  ): void {
    const normalizedName = this.normalizeName(skillName);

    const alreadyIndexed = this.metadataByName.has(normalizedName);
    const previousPath = this.metadataPathByName.get(normalizedName);

    if (alreadyIndexed && previousPath && previousPath !== skillPath) {
      logger.warn(
        `⚠️ [SkillsIndex] 检测到重复技能名称 "${metadata.name}"，将覆盖此前的索引记录`
      );
    } else if (alreadyIndexed) {
      logger.debug(
        `[SkillsIndex] 更新技能索引 "${metadata.name}" (${skillPath})`
      );
    }

    this.metadataByName.set(normalizedName, this.cloneMetadata(metadata));
    this.metadataPathByName.set(normalizedName, skillPath);

    const descriptionTokens = this.tokenize(metadata.description);
    this.tokensByName.set(normalizedName, descriptionTokens);

    this.stats.totalSkills = this.metadataByName.size;
  }

  private async scanSkillsDirectory(root: string): Promise<string[]> {
    const results: string[] = [];
    const queue: string[] = [root];

    while (queue.length > 0) {
      const currentDir = queue.shift()!;
      let containsSkillDefinition = false;

      let dirEntries;
      try {
        dirEntries = await fs.readdir(currentDir, { withFileTypes: true });
      } catch (error) {
        logger.warn(
          `⚠️ [SkillsIndex] 无法读取目录 ${currentDir}: ${(error as Error).message}`
        );
        continue;
      }

      for (const entry of dirEntries) {
        if (entry.name.startsWith('.')) {
          continue;
        }

        const entryPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          queue.push(entryPath);
        } else if (
          entry.isFile() &&
          (entry.name === 'METADATA.yml' || entry.name === 'SKILL.md')
        ) {
          containsSkillDefinition = true;
        }
      }

      if (containsSkillDefinition) {
        results.push(currentDir);
      }
    }

    return results;
  }

  private async findSkillDirectoryByName(
    skillName: string
  ): Promise<string | undefined> {
    const directories = await this.scanSkillsDirectory(this.skillsRoot);

    for (const dir of directories) {
      try {
        const metadata = await this.metadataProvider.loadMetadata(dir);
        const normalized = this.normalizeName(metadata.name);
        if (normalized === skillName) {
          this.addToIndex(normalized, metadata, dir);
          return dir;
        }
      } catch (error) {
        logger.warn(
          `⚠️ [SkillsIndex] 重新扫描技能失败 (${dir}): ${(error as Error).message}`
        );
      }
    }

    return undefined;
  }

  private normalizeName(name: string): string {
    return this.caseSensitive ? name : name.toLowerCase();
  }

  private tokenize(input: string): string[] {
    const sanitized = this.caseSensitive ? input : input.toLowerCase();
    return sanitized
      .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  private cloneMetadata(metadata: SkillMetadata): SkillMetadata {
    return {
      ...metadata,
      keywords: [...metadata.keywords],
      tags: metadata.tags ? [...metadata.tags] : undefined,
      capabilities: metadata.capabilities ? [...metadata.capabilities] : undefined,
      triggerPatterns: metadata.triggerPatterns
        ? metadata.triggerPatterns.map((pattern) =>
            typeof pattern === 'string' ? pattern : { ...pattern }
          )
        : undefined,
      triggers: metadata.triggers
        ? {
            intents: metadata.triggers.intents ? [...metadata.triggers.intents] : undefined,
            phrases: metadata.triggers.phrases ? [...metadata.triggers.phrases] : undefined,
            eventTypes: metadata.triggers.eventTypes ? [...metadata.triggers.eventTypes] : undefined,
            priority: metadata.triggers.priority
          }
        : undefined,
      permissions: metadata.permissions
        ? {
            ...metadata.permissions,
            externalApis: metadata.permissions.externalApis
              ? [...metadata.permissions.externalApis]
              : undefined,
            environment: metadata.permissions.environment
              ? { ...metadata.permissions.environment }
              : undefined
          }
        : {},
      security: metadata.security ? this.cloneSecurityPolicy(metadata.security) : undefined,
      resources: metadata.resources ? this.cloneResourceManifest(metadata.resources) : undefined,
      inputSchema: metadata.inputSchema ? this.clonePlainObject(metadata.inputSchema) : undefined,
      outputSchema: metadata.outputSchema ? this.clonePlainObject(metadata.outputSchema) : undefined
    };
  }

  private cloneSecurityPolicy(policy: SkillSecurityPolicy): SkillSecurityPolicy {
    return {
      timeoutMs: policy.timeoutMs,
      memoryMb: policy.memoryMb,
      network: policy.network,
      networkAllowlist: policy.networkAllowlist ? [...policy.networkAllowlist] : undefined,
      filesystem: policy.filesystem,
      environment: policy.environment ? { ...policy.environment } : undefined
    };
  }

  private cloneResourceManifest(
    manifest: SkillResourceManifest
  ): SkillResourceManifest {
    return {
      entry: manifest.entry,
      helpers: manifest.helpers ? [...manifest.helpers] : undefined,
      references: manifest.references ? [...manifest.references] : undefined,
      assets: manifest.assets ? [...manifest.assets] : undefined
    };
  }

  private clonePlainObject<T>(value: T | undefined): T | undefined {
    if (value === undefined) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(value));
  }

  private computeTriggerMatch(
    normalizedIntent: string,
    metadata: SkillMetadata
  ): { score: number; matches: string[] } {
    if (!metadata.triggers) {
      return { score: 0, matches: [] };
    }

    const matches: string[] = [];
    let score = 0;

    const evaluateExactMatch = (value: string, type: string, boost: number) => {
      const normalized = this.normalizeTrigger(value);
      if (!normalized) {
        return;
      }
      if (normalized === normalizedIntent) {
        matches.push(`${type}:${value}`);
        score = Math.max(score, 1);
        return;
      }
      if (
        normalizedIntent.includes(normalized) ||
        normalized.includes(normalizedIntent)
      ) {
        matches.push(`${type}:${value}`);
        score = Math.max(score, boost);
      }
    };

    if (metadata.triggers.intents) {
      for (const intent of metadata.triggers.intents) {
        evaluateExactMatch(intent, 'intent', 0.9);
        if (score === 1) {
          return { score, matches };
        }
      }
    }

    if (metadata.triggers.phrases) {
      for (const phrase of metadata.triggers.phrases) {
        evaluateExactMatch(phrase, 'phrase', 0.7);
      }
    }

    return { score, matches };
  }

  private normalizeTrigger(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }
    return this.caseSensitive ? value.trim() : value.trim().toLowerCase();
  }
}

