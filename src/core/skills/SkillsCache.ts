import {
  CacheConfig,
  SkillsCacheConfig,
  SkillsCacheOptions,
  SkillsCacheStats,
  SkillMetadata,
  SkillContent,
  SkillResources
} from '../../types';
import { TTLCache } from '../../utils/TTLCache';

const DEFAULT_CACHE_CONFIG: SkillsCacheConfig = {
  metadata: {
    maxSize: 256,
    ttl: 1000 * 60 * 60 // 1 hour
  },
  content: {
    maxSize: 32,
    ttl: 1000 * 60 * 30 // 30 minutes
  },
  resources: {
    maxSize: 16,
    ttl: 1000 * 60 * 15 // 15 minutes
  }
};

interface CacheHitMissCounter {
  hits: number;
  misses: number;
}

export class SkillsCache {
  private readonly metadataCache: TTLCache<string, SkillMetadata>;
  private readonly contentCache: TTLCache<string, SkillContent>;
  private readonly resourceCache: TTLCache<string, SkillResources>;

  private readonly metadataStats: CacheHitMissCounter = { hits: 0, misses: 0 };
  private readonly contentStats: CacheHitMissCounter = { hits: 0, misses: 0 };
  private readonly resourceStats: CacheHitMissCounter = { hits: 0, misses: 0 };
  private readonly config: SkillsCacheConfig;

  constructor(options: SkillsCacheOptions = {}) {
    this.config = this.mergeConfig(options.config);

    this.metadataCache = new TTLCache<string, SkillMetadata>(
      this.toTTLConfig(this.config.metadata)
    );
    this.contentCache = new TTLCache<string, SkillContent>(
      this.toTTLConfig(this.config.content)
    );
    this.resourceCache = new TTLCache<string, SkillResources>(
      this.toTTLConfig(this.config.resources)
    );
  }

  getMetadata(skillName: string): SkillMetadata | undefined {
    const value = this.metadataCache.get(skillName);
    this.updateStats(this.metadataStats, Boolean(value));
    return value ? { ...value, keywords: [...value.keywords] } : undefined;
  }

  setMetadata(skillName: string, metadata: SkillMetadata): void {
    this.metadataCache.set(skillName, { ...metadata, keywords: [...metadata.keywords] });
  }

  getContent(skillName: string): SkillContent | undefined {
    const value = this.contentCache.get(skillName);
    this.updateStats(this.contentStats, Boolean(value));
    return value ? this.cloneContent(value) : undefined;
  }

  setContent(skillName: string, content: SkillContent): void {
    this.contentCache.set(skillName, this.cloneContent(content));
  }

  getResources(skillName: string): SkillResources | undefined {
    const value = this.resourceCache.get(skillName);
    this.updateStats(this.resourceStats, Boolean(value));
    return value ? this.cloneResources(value) : undefined;
  }

  setResources(skillName: string, resources: SkillResources): void {
    this.resourceCache.set(skillName, this.cloneResources(resources));
  }

  clear(skillName?: string): void {
    if (skillName) {
      this.metadataCache.delete(skillName);
      this.contentCache.delete(skillName);
      this.resourceCache.delete(skillName);
      return;
    }

    this.metadataCache.clear();
    this.contentCache.clear();
    this.resourceCache.clear();
    this.metadataStats.hits = this.metadataStats.misses = 0;
    this.contentStats.hits = this.contentStats.misses = 0;
    this.resourceStats.hits = this.resourceStats.misses = 0;
  }

  getStats(): SkillsCacheStats {
    return {
      metadata: {
        ...this.metadataStats,
        size: this.metadataCache.size(),
        capacity: this.config.metadata.maxSize
      },
      content: {
        ...this.contentStats,
        size: this.contentCache.size(),
        capacity: this.config.content.maxSize
      },
      resources: {
        ...this.resourceStats,
        size: this.resourceCache.size(),
        capacity: this.config.resources.maxSize
      }
    };
  }

  private mergeConfig(
    overrides: Partial<SkillsCacheConfig> | undefined
  ): SkillsCacheConfig {
    if (!overrides) {
      return DEFAULT_CACHE_CONFIG;
    }

    return {
      metadata: { ...DEFAULT_CACHE_CONFIG.metadata, ...overrides.metadata },
      content: { ...DEFAULT_CACHE_CONFIG.content, ...overrides.content },
      resources: { ...DEFAULT_CACHE_CONFIG.resources, ...overrides.resources }
    };
  }

  private toTTLConfig(config: CacheConfig) {
    return {
      maxSize: config.maxSize,
      ttl: config.ttl
    };
  }

  private updateStats(counter: CacheHitMissCounter, hit: boolean): void {
    if (hit) {
      counter.hits += 1;
    } else {
      counter.misses += 1;
    }
  }

  private cloneContent(content: SkillContent): SkillContent {
    return {
      ...content,
      sections: content.sections.map((section) => ({ ...section })),
      codeBlocks: content.codeBlocks.map((block) => ({ ...block })),
      frontMatter: content.frontMatter ? { ...content.frontMatter } : undefined
    };
  }

  private cloneResources(resources: SkillResources): SkillResources {
    return {
      loadedAt: resources.loadedAt,
      dependencies: [...resources.dependencies],
      scripts: resources.scripts.map((script) => ({ ...script })),
      assets: resources.assets.map((asset) => ({ ...asset })),
      references: resources.references
        ? resources.references.map((reference) => ({ ...reference }))
        : undefined
    };
  }
}

