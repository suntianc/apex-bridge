import {
  CodeCacheEntry,
  CodeCacheOptions,
  CodeCacheStats,
  CodeGenerationMetrics,
  GeneratedSkillCode,
  SecurityReport
} from '../../types';
import { Cache, createCache } from '../../utils/cache';

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
  private readonly cache: Cache<InternalCacheEntry>;
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
    
    // 使用统一的 Cache 类替代 Map
    this.cache = createCache<InternalCacheEntry>(
      this.options.ttlMs,
      this.options.maxSize
    );
  }

  get(skillName: string, hash: string): CodeCacheEntry | undefined {
    const entry = this.cache.get(skillName);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }

    // 检查 hash 匹配（Cache 类已处理过期，无需手动检查）
    if (entry.hash !== hash) {
      this.cache.delete(skillName);
      this.misses += 1;
      return undefined;
    }

    this.hits += 1;
    const now = Date.now();
    entry.lastUsed = now;
    entry.hitCount += 1;
    entry.expiresAt = now + this.options.ttlMs;

    // 刷新 TTL（通过重新设置）
    this.cache.set(skillName, entry, this.options.ttlMs);

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

    // Cache 类自动处理 LRU 淘汰，无需手动处理
    // 如果已存在，先删除再设置（确保更新）
    if (this.cache.has(skillName)) {
      this.cache.delete(skillName);
    }
    this.cache.set(skillName, entry, this.options.ttlMs);
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
    // Cache 类不提供 entries() 方法，需要通过 keys() 获取
    for (const key of this.cache.keys()) {
      const entry = this.cache.get(key);
      if (entry) {
        entries.push({
          hash: entry.hash,
          compiledAt: entry.compiledAt,
          lastUsed: entry.lastUsed,
          hitCount: entry.hitCount
        });
      }
    }

    return {
      size: this.cache.size(),
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      entries
    };
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
