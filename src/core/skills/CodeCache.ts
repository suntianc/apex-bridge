import {
  CodeCacheEntry,
  CodeCacheOptions,
  CodeCacheStats,
  CodeGenerationMetrics,
  GeneratedSkillCode,
  SecurityReport
} from '../../types';

interface InternalCacheEntry extends CodeCacheEntry {
  expiresAt: number;
}

const DEFAULT_OPTIONS: Required<CodeCacheOptions> = {
  maxSize: 64,
  ttlMs: 60 * 60 * 1000
};

const cloneGeneratedCode = (code: GeneratedSkillCode): GeneratedSkillCode => ({
  javascript: code.javascript,
  sourceMap: code.sourceMap,
  diagnostics: code.diagnostics ? [...code.diagnostics] : undefined,
  metadata: {
    exports: [...code.metadata.exports],
    imports: code.metadata.imports.map((dep) => ({ ...dep })),
    complexityScore: code.metadata.complexityScore
  },
  dependencies: code.dependencies.map((dep) => ({ ...dep }))
});

export class CodeCache {
  private readonly options: Required<CodeCacheOptions>;
  private readonly cache = new Map<string, InternalCacheEntry>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(options: CodeCacheOptions = {}) {
    this.options = {
      maxSize: options.maxSize ?? DEFAULT_OPTIONS.maxSize,
      ttlMs: options.ttlMs ?? DEFAULT_OPTIONS.ttlMs
    };
    if (this.options.maxSize <= 0) {
      throw new Error('[CodeCache] maxSize must be greater than 0');
    }
    if (this.options.ttlMs <= 0) {
      throw new Error('[CodeCache] ttlMs must be greater than 0');
    }
  }

  get(skillName: string, hash: string): CodeCacheEntry | undefined {
    const entry = this.cache.get(skillName);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }

    if (entry.hash !== hash || this.isExpired(entry)) {
      this.cache.delete(skillName);
      this.misses += 1;
      return undefined;
    }

    this.hits += 1;
    const now = Date.now();
    entry.lastUsed = now;
    entry.hitCount += 1;
    entry.expiresAt = now + this.options.ttlMs;

    // refresh LRU order
    this.cache.delete(skillName);
    this.cache.set(skillName, entry);

    return this.cloneEntry(entry);
  }

  set(
    skillName: string,
    hash: string,
    code: GeneratedSkillCode,
    securityReport: SecurityReport,
    profilerMetrics: CodeGenerationMetrics
  ): void {
    const now = Date.now();
    const entry: InternalCacheEntry = {
      hash,
      compiledAt: now,
      lastUsed: now,
      hitCount: 0,
      code: cloneGeneratedCode(code),
      securityReport: {
        ...securityReport,
        issues: securityReport.issues.map((issue) => ({ ...issue })),
        recommendations: [...securityReport.recommendations]
      },
      profilerMetrics: {
        phases: { ...profilerMetrics.phases },
        totalMs: profilerMetrics.totalMs,
        timestamp: profilerMetrics.timestamp,
        metadata: profilerMetrics.metadata ? { ...profilerMetrics.metadata } : undefined
      },
      expiresAt: now + this.options.ttlMs
    };

    if (this.cache.has(skillName)) {
      this.cache.delete(skillName);
    } else if (this.cache.size >= this.options.maxSize) {
      this.evictOldest();
    }

    this.cache.set(skillName, entry);
  }

  invalidate(skillName: string): void {
    this.cache.delete(skillName);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  getStats(): CodeCacheStats {
    const entries: CodeCacheStats['entries'] = [];
    for (const [, entry] of this.cache) {
      entries.push({
        hash: entry.hash,
        compiledAt: entry.compiledAt,
        lastUsed: entry.lastUsed,
        hitCount: entry.hitCount
      });
    }

    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      entries
    };
  }

  private isExpired(entry: InternalCacheEntry): boolean {
    return entry.expiresAt <= Date.now();
  }

  private evictOldest(): void {
    const iterator = this.cache.keys();
    const oldestKey = iterator.next();
    if (!oldestKey.done) {
      this.cache.delete(oldestKey.value);
      this.evictions += 1;
    }
  }

  private cloneEntry(entry: InternalCacheEntry): CodeCacheEntry {
    return {
      hash: entry.hash,
      compiledAt: entry.compiledAt,
      lastUsed: entry.lastUsed,
      hitCount: entry.hitCount,
      code: cloneGeneratedCode(entry.code),
      securityReport: {
        ...entry.securityReport,
        issues: entry.securityReport.issues.map((issue) => ({ ...issue })),
        recommendations: [...entry.securityReport.recommendations]
      },
      profilerMetrics: {
        phases: { ...entry.profilerMetrics.phases },
        totalMs: entry.profilerMetrics.totalMs,
        timestamp: entry.profilerMetrics.timestamp,
        metadata: entry.profilerMetrics.metadata ? { ...entry.profilerMetrics.metadata } : undefined
      }
    };
  }
}
