import {
  SkillsCacheConfig,
  PreloadConfig,
  MemoryManagerConfig,
  CodeCacheOptions,
  ExecutorCacheConfig
} from '../../types';

/**
 * Skills系统性能配置
 * 
 * 提供统一的性能参数配置接口，支持不同环境的优化配置
 */
export interface SkillsPerformanceConfig {
  // 缓存配置
  cache: SkillsCacheConfig;
  
  // 代码缓存配置
  codeCache: CodeCacheOptions;
  
  // 执行器缓存配置
  executorCache: ExecutorCacheConfig;
  
  // 预加载配置
  preload: PreloadConfig;
  
  // 内存管理配置
  memory: MemoryManagerConfig;
  
  // 加载并发配置
  loading: {
    maxConcurrentLoads: number;
    requestTimeout: number;
  };
  
  // 索引配置
  indexing: {
    defaultSearchLimit: number;
    defaultConfidenceThreshold: number;
    caseSensitive: boolean;
  };
  
  // 元数据配置
  metadata: {
    maxMetadataTokens: number;
    maxContentTokens: number;
  };
}

/**
 * 默认性能配置（开发环境）
 */
export const DEFAULT_PERFORMANCE_CONFIG: SkillsPerformanceConfig = {
  cache: {
    metadata: {
      maxSize: 256,
      ttl: 1000 * 60 * 60 // 1小时
    },
    content: {
      maxSize: 32,
      ttl: 1000 * 60 * 30 // 30分钟
    },
    resources: {
      maxSize: 16,
      ttl: 1000 * 60 * 15 // 15分钟
    }
  },
  codeCache: {
    maxSize: 64,
    ttlMs: 60 * 60 * 1000 // 1小时
  },
  executorCache: {
    maxSize: 128,
    ttlMs: 30 * 60 * 1000 // 30分钟
  },
  preload: {
    enabled: true,
    interval: 5 * 60 * 1000, // 5分钟
    frequencyThreshold: 0.1, // 10%
    confidenceThreshold: 0.7, // 70%
    maxSkills: 10,
    lowLoadThreshold: 0.3, // 30%
    minMemoryMB: 100
  },
  memory: {
    enabled: true,
    monitoringInterval: 30 * 1000, // 30秒
    normalThreshold: 0.5, // 50%
    moderateThreshold: 0.7, // 70%
    highThreshold: 0.85, // 85%
    criticalThreshold: 0.95, // 95%
    maxMemoryMB: 500,
    autoCleanup: true,
    cleanupInterval: 5 * 60 * 1000, // 5分钟
    aggressiveCleanup: false
  },
  loading: {
    maxConcurrentLoads: 5,
    requestTimeout: 30000 // 30秒
  },
  indexing: {
    defaultSearchLimit: 3,
    defaultConfidenceThreshold: 0.15,
    caseSensitive: false
  },
  metadata: {
    maxMetadataTokens: 50,
    maxContentTokens: 5000
  }
};

/**
 * 生产环境性能配置（优化版）
 */
export const PRODUCTION_PERFORMANCE_CONFIG: SkillsPerformanceConfig = {
  ...DEFAULT_PERFORMANCE_CONFIG,
  cache: {
    metadata: {
      maxSize: 512, // 增加元数据缓存
      ttl: 1000 * 60 * 60 * 2 // 2小时
    },
    content: {
      maxSize: 64, // 增加内容缓存
      ttl: 1000 * 60 * 60 // 1小时
    },
    resources: {
      maxSize: 32, // 增加资源缓存
      ttl: 1000 * 60 * 30 // 30分钟
    }
  },
  codeCache: {
    maxSize: 128, // 增加代码缓存
    ttlMs: 2 * 60 * 60 * 1000 // 2小时
  },
  executorCache: {
    maxSize: 256, // 增加执行器缓存
    ttlMs: 60 * 60 * 1000 // 1小时
  },
  preload: {
    enabled: true,
    interval: 3 * 60 * 1000, // 3分钟（更频繁）
    frequencyThreshold: 0.05, // 5%（更低的阈值）
    confidenceThreshold: 0.65, // 65%（更低的阈值）
    maxSkills: 20, // 更多技能
    lowLoadThreshold: 0.2, // 20%（更低的负载阈值）
    minMemoryMB: 200 // 更多内存要求
  },
  memory: {
    enabled: true,
    monitoringInterval: 20 * 1000, // 20秒（更频繁）
    normalThreshold: 0.6, // 60%（更高的正常阈值）
    moderateThreshold: 0.75, // 75%
    highThreshold: 0.9, // 90%
    criticalThreshold: 0.98, // 98%
    maxMemoryMB: 1000, // 1GB（更大的内存限制）
    autoCleanup: true,
    cleanupInterval: 3 * 60 * 1000, // 3分钟（更频繁）
    aggressiveCleanup: true // 启用激进清理
  },
  loading: {
    maxConcurrentLoads: 10, // 更多并发
    requestTimeout: 20000 // 20秒（更短的超时）
  },
  indexing: {
    defaultSearchLimit: 5, // 更多搜索结果
    defaultConfidenceThreshold: 0.1, // 更低的阈值
    caseSensitive: false
  },
  metadata: {
    maxMetadataTokens: 50,
    maxContentTokens: 5000
  }
};

/**
 * 高性能环境配置（资源充足）
 */
export const HIGH_PERFORMANCE_CONFIG: SkillsPerformanceConfig = {
  ...PRODUCTION_PERFORMANCE_CONFIG,
  cache: {
    metadata: {
      maxSize: 1024,
      ttl: 1000 * 60 * 60 * 4 // 4小时
    },
    content: {
      maxSize: 128,
      ttl: 1000 * 60 * 60 * 2 // 2小时
    },
    resources: {
      maxSize: 64,
      ttl: 1000 * 60 * 60 // 1小时
    }
  },
  codeCache: {
    maxSize: 256,
    ttlMs: 4 * 60 * 60 * 1000 // 4小时
  },
  executorCache: {
    maxSize: 512,
    ttlMs: 2 * 60 * 60 * 1000 // 2小时
  },
  preload: {
    ...PRODUCTION_PERFORMANCE_CONFIG.preload,
    maxSkills: 50, // 更多技能
    minMemoryMB: 500 // 更多内存
  },
  memory: {
    ...PRODUCTION_PERFORMANCE_CONFIG.memory,
    maxMemoryMB: 2000, // 2GB
    normalThreshold: 0.7, // 70%
    moderateThreshold: 0.8, // 80%
    highThreshold: 0.95, // 95%
    criticalThreshold: 0.99 // 99%
  },
  loading: {
    maxConcurrentLoads: 20, // 更多并发
    requestTimeout: 15000 // 15秒
  }
};

/**
 * 低资源环境配置（资源受限）
 */
export const LOW_RESOURCE_CONFIG: SkillsPerformanceConfig = {
  ...DEFAULT_PERFORMANCE_CONFIG,
  cache: {
    metadata: {
      maxSize: 128,
      ttl: 1000 * 60 * 30 // 30分钟
    },
    content: {
      maxSize: 16,
      ttl: 1000 * 60 * 15 // 15分钟
    },
    resources: {
      maxSize: 8,
      ttl: 1000 * 60 * 10 // 10分钟
    }
  },
  codeCache: {
    maxSize: 32,
    ttlMs: 30 * 60 * 1000 // 30分钟
  },
  executorCache: {
    maxSize: 64,
    ttlMs: 15 * 60 * 1000 // 15分钟
  },
  preload: {
    enabled: false, // 禁用预加载
    interval: 10 * 60 * 1000,
    frequencyThreshold: 0.2,
    confidenceThreshold: 0.8,
    maxSkills: 5,
    lowLoadThreshold: 0.1,
    minMemoryMB: 50
  },
  memory: {
    enabled: true,
    monitoringInterval: 60 * 1000, // 60秒
    normalThreshold: 0.4, // 40%
    moderateThreshold: 0.6, // 60%
    highThreshold: 0.8, // 80%
    criticalThreshold: 0.9, // 90%
    maxMemoryMB: 200, // 200MB
    autoCleanup: true,
    cleanupInterval: 2 * 60 * 1000, // 2分钟
    aggressiveCleanup: true
  },
  loading: {
    maxConcurrentLoads: 2, // 更少并发
    requestTimeout: 60000 // 60秒
  }
};

/**
 * 根据环境获取性能配置
 */
export function getPerformanceConfig(env: 'development' | 'production' | 'high-performance' | 'low-resource' = 'development'): SkillsPerformanceConfig {
  switch (env) {
    case 'production':
      return PRODUCTION_PERFORMANCE_CONFIG;
    case 'high-performance':
      return HIGH_PERFORMANCE_CONFIG;
    case 'low-resource':
      return LOW_RESOURCE_CONFIG;
    default:
      return DEFAULT_PERFORMANCE_CONFIG;
  }
}

/**
 * 合并配置（深度合并）
 */
export function mergePerformanceConfig(
  base: SkillsPerformanceConfig,
  overrides: Partial<SkillsPerformanceConfig>
): SkillsPerformanceConfig {
  return {
    ...base,
    ...overrides,
    cache: {
      ...base.cache,
      ...overrides.cache,
      metadata: {
        ...base.cache.metadata,
        ...overrides.cache?.metadata
      },
      content: {
        ...base.cache.content,
        ...overrides.cache?.content
      },
      resources: {
        ...base.cache.resources,
        ...overrides.cache?.resources
      }
    },
    codeCache: {
      ...base.codeCache,
      ...overrides.codeCache
    },
    executorCache: {
      ...base.executorCache,
      ...overrides.executorCache
    },
    preload: {
      ...base.preload,
      ...overrides.preload
    },
    memory: {
      ...base.memory,
      ...overrides.memory
    },
    loading: {
      ...base.loading,
      ...overrides.loading
    },
    indexing: {
      ...base.indexing,
      ...overrides.indexing
    },
    metadata: {
      ...base.metadata,
      ...overrides.metadata
    }
  };
}

