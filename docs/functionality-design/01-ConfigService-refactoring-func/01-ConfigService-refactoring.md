# ConfigService 重构功能设计文档

**需求编号**: R-001
**功能设计编号**: FD-001
**版本**: 1.0.0
**创建日期**: 2025-12-30
**关联需求**: 01-project-refactoring.md
**状态**: 已评审

---

## 1. 概述

### 1.1 文档目的

本文档为 ConfigService 模块重构的功能设计文档，详细描述如何将 1050 行的超大文件拆分为职责清晰的高内聚模块。设计遵循单一职责原则，建立清晰的类型分层和服务分层，同时保证 API 和数据格式的完全兼容。

### 1.2 设计目标

| 目标 | 当前状态 | 目标状态 |
|------|----------|----------|
| 文件行数 | 1050 行 | 单文件不超过 300 行 |
| 接口数量 | 20+ 混合定义 | 按职责分散到 5 个类型文件 |
| 类型与逻辑 | 混合在一起 | 严格分离 |
| 导出策略 | 从 ConfigService 导出 | 独立类型文件 + 统一导出 |
| 测试覆盖率 | 无 | 80%+ |

### 1.3 引用文档

- 需求文档: `docs/requirements/01-project-refactoring.md`
- 当前实现: `src/services/ConfigService.ts`
- 现有类型目录: `src/types/`
- 现有工具目录: `src/utils/`

---

## 2. 模块结构设计

### 2.1 目标目录结构

```
src/
├── services/
│   └── ConfigService.ts          # 主服务类（简化后 ~250行）
├── types/
│   ├── index.ts                   # 统一导出入口
│   ├── config.ts                  # 配置类型根文件
│   └── config/
│       ├── index.ts               # config子目录导出入口
│       ├── admin.ts               # AdminConfig 主配置类型
│       ├── rate-limit.ts          # 速率限制配置类型
│       ├── redis.ts               # Redis配置类型
│       ├── api-key.ts             # ApiKeyInfo类型
│       └── ace.ts                 # ACE架构配置类型
└── utils/
    └── config-validator.ts        # 配置验证工具类
```

### 2.2 文件职责划分

| 文件 | 职责 | 预估行数 | 依赖 |
|------|------|----------|------|
| `ConfigService.ts` | 主服务协调 | 250 | 所有子模块 |
| `types/config/index.ts` | 统一导出 | 50 | 子类型文件 |
| `types/config/admin.ts` | AdminConfig 及子配置 | 150 | 无 |
| `types/config/rate-limit.ts` | 速率限制类型 | 100 | 无 |
| `types/config/redis.ts` | Redis配置类型 | 80 | 无 |
| `types/config/api-key.ts` | ApiKeyInfo类型 | 40 | 无 |
| `types/config/ace.ts` | ACE配置类型 | 150 | 无 |
| `utils/config-validator.ts` | 验证逻辑 | 120 | config/类型 |

### 2.3 依赖关系图

```
                    ConfigService
                          |
         +----------------+----------------+
         |                |                |
    ConfigLoader     ConfigValidator    ConfigWriter
         |                |                |
    (fs读取)          (验证规则)        (fs写入)
         |                |                |
    +----+----+      +----+----+      +----+----+
    |         |      |         |      |         |
AdminConfig  SystemConfig  RateLimit  Redis  AceConfig
```

---

## 3. 类型拆分方案

### 3.1 类型清单

当前 ConfigService.ts 中定义的类型将全部迁移至 `types/config/` 目录：

| 原类型名 | 新位置 | 迁移优先级 |
|----------|--------|------------|
| `ApiKeyInfo` | `types/config/api-key.ts` | 高 |
| `RateLimitStrategyType` | `types/config/rate-limit.ts` | 高 |
| `RateLimitStrategyConfig` | `types/config/rate-limit.ts` | 高 |
| `RateLimitMatcherConfig` | `types/config/rate-limit.ts` | 高 |
| `RateLimitRuleConfig` | `types/config/rate-limit.ts` | 高 |
| `RateLimitHeadersConfig` | `types/config/rate-limit.ts` | 高 |
| `RateLimitSettings` | `types/config/rate-limit.ts` | 高 |
| `RedisConfig` | `types/config/redis.ts` | 高 |
| `AdminConfig` | `types/config/admin.ts` | 高 |
| `AceConfig` | `types/config/ace.ts` | 高 |
| `AceOrchestrationConfig` | `types/config/ace.ts` | 高 |
| `AceLayersConfig` | `types/config/ace.ts` | 高 |
| `AceLayerL1Config` ~ `AceLayerL6Config` | `types/config/ace.ts` | 高 |
| `AceMemoryConfig` | `types/config/ace.ts` | 高 |
| `AceOptimizationConfig` | `types/config/ace.ts` | 高 |
| `AceSkillsConfig` | `types/config/ace.ts` | 高 |
| `AceLocalImplementationConfig` | `types/config/ace.ts` | 高 |
| `SystemConfig` | `types/config/admin.ts` | 中 |
| `FullConfig` | `types/config/admin.ts` | 中 |

### 3.2 ApiKeyInfo 类型设计

**文件**: `types/config/api-key.ts`

```typescript
/**
 * API Key 信息结构
 */
export interface ApiKeyInfo {
  /** 唯一标识 */
  id: string;
  /** 名称（如 "默认项目"、"cherry"） */
  name: string;
  /** 完整的 API Key */
  key: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 上次使用时间戳（可选） */
  lastUsedAt?: number;
  /** 所属人ID（可选） */
  ownerId?: string;
}
```

### 3.3 RateLimit 类型设计

**文件**: `types/config/rate-limit.ts`

```typescript
/**
 * 速率限制策略类型
 */
export type RateLimitStrategyType = 'ip' | 'apiKey' | 'user' | 'header';

/**
 * 速率限制策略配置
 */
export interface RateLimitStrategyConfig {
  /** 策略类型 */
  type: RateLimitStrategyType | string;
  /** Header 名称（当 type='header' 时使用） */
  headerName?: string;
  /** 策略描述 */
  description?: string;
}

/**
 * 速率限制匹配器配置
 */
export interface RateLimitMatcherConfig {
  /** 路径匹配 */
  path?: string;
  /** 路径前缀 */
  prefix?: string;
  /** 正则表达式 */
  regex?: string;
  /** HTTP 方法 */
  methods?: string[];
}

/**
 * 速率限制规则配置
 */
export interface RateLimitRuleConfig {
  /** 规则唯一标识 */
  id: string;
  /** 规则名称 */
  name?: string;
  /** 规则描述 */
  description?: string;
  /** 优先级（数值越大优先级越高） */
  priority?: number;
  /** 时间窗口（毫秒） */
  windowMs: number;
  /** 窗口内最大请求数 */
  maxRequests: number;
  /** 匹配策略 */
  strategy: RateLimitStrategyConfig;
  /** 主匹配器 */
  matcher: RateLimitMatcherConfig;
  /** 附加匹配器列表 */
  matchers?: RateLimitMatcherConfig[];
  /** 窗口模式 */
  mode?: 'sliding' | 'fixed';
  /** 策略执行顺序 */
  strategyOrder?: RateLimitStrategyType[];
  /** 是否返回响应头 */
  responseHeaders?: boolean;
  /** 是否跳过成功请求 */
  skipSuccessfulRequests?: boolean;
  /** 是否跳过失败请求 */
  skipFailedRequests?: boolean;
  /** 是否启用 */
  enabled?: boolean;
}

/**
 * 速率限制响应头配置
 */
export interface RateLimitHeadersConfig {
  /** 限制数量头 */
  limit?: string;
  /** 剩余数量头 */
  remaining?: string;
  /** 重置时间头 */
  reset?: string;
  /** 重试后时间头 */
  retryAfter?: string;
}

/**
 * 速率限制设置
 */
export interface RateLimitSettings {
  /** 是否启用 */
  enabled: boolean;
  /** 默认时间窗口（毫秒） */
  windowMs: number;
  /** 默认最大请求数 */
  max: number;
  /** 超出限制时的消息 */
  message?: string;
  /** 是否使用标准响应头 */
  standardHeaders?: boolean;
  /** 是否使用传统响应头 */
  legacyHeaders?: boolean;
  /** 是否信任代理 */
  trustProxy?: boolean;
  /** 速率限制规则 */
  rules?: RateLimitRuleConfig[];
  /** 响应头配置 */
  headers?: RateLimitHeadersConfig;
  /** 默认策略顺序 */
  defaultStrategyOrder?: RateLimitStrategyType[];
  /** 提供商类型 */
  provider?: 'auto' | 'redis' | 'memory';
  /** 键前缀 */
  keyPrefix?: string;
}
```

### 3.4 RedisConfig 类型设计

**文件**: `types/config/redis.ts`

```typescript
/**
 * Redis 配置
 */
export interface RedisConfig {
  /** 是否启用 */
  enabled: boolean;
  /** Redis 主机地址 */
  host?: string;
  /** Redis 端口 */
  port?: number;
  /** 密码 */
  password?: string;
  /** 数据库编号 */
  db?: number;
  /** 键前缀 */
  keyPrefix?: string;
  /** 连接 URL */
  url?: string;
  /** Socket 配置 */
  socket?: {
    host?: string;
    port?: number;
  };
  /** 连接超时（毫秒） */
  connectTimeout?: number;
  /** 连接超时（毫秒，兼容旧名称） */
  connectTimeoutMs?: number;
  /** 延迟连接 */
  lazyConnect?: boolean;
  /** 每个请求最大重试次数 */
  maxRetriesPerRequest?: number;
  /** 故障转移重试延迟（毫秒） */
  retryDelayOnFailover?: number;
  /** 用户名 */
  username?: string;
  /** TLS 配置 */
  tls?: Record<string, unknown>;
}
```

### 3.5 ACE 配置类型设计

**文件**: `types/config/ace.ts`

```typescript
/**
 * ACE 架构配置
 */
export interface AceConfig {
  /** 是否启用 */
  enabled?: boolean;
  /** 编排配置 */
  orchestration?: AceOrchestrationConfig;
  /** 层级配置 */
  layers?: AceLayersConfig;
  /** 内存配置 */
  memory?: AceMemoryConfig;
  /** 优化配置 */
  optimization?: AceOptimizationConfig;
  /** 技能系统配置 */
  skills?: AceSkillsConfig;
  /** 本地化实现配置 */
  localImplementation?: AceLocalImplementationConfig;
}

/**
 * ACE 编排配置
 */
export interface AceOrchestrationConfig {
  /** 是否启用 */
  enabled?: boolean;
  /** 编排模式 */
  mode?: 'full' | 'minimal' | 'custom';
}

/**
 * ACE 层级配置（L1-L6）
 */
export interface AceLayersConfig {
  /** L1 层级配置（渴望层 - 道德约束） */
  l1?: AceLayerL1Config;
  /** L2 层级配置（全球战略层） */
  l2?: AceLayerL2Config;
  /** L3 层级配置（代理模型层） */
  l3?: AceLayerL3Config;
  /** L4 层级配置（执行功能层） */
  l4?: AceLayerL4Config;
  /** L5 层级配置（认知控制层） */
  l5?: AceLayerL5Config;
  /** L6 层级配置（任务执行层） */
  l6?: AceLayerL6Config;
}

/**
 * L1 层级配置（渴望层 - 道德约束）
 */
export interface AceLayerL1Config {
  /** 是否启用 */
  enabled?: boolean;
  /** 宪法文件路径 */
  constitutionPath?: string;
  /** 模型来源 */
  modelSource?: 'sqlite';
}

/**
 * L2 层级配置（全球战略层）
 */
export interface AceLayerL2Config {
  /** 是否启用 */
  enabled?: boolean;
  /** 模型来源 */
  modelSource?: 'sqlite';
}

/**
 * L3 层级配置（代理模型层）
 */
export interface AceLayerL3Config {
  /** 是否启用 */
  enabled?: boolean;
  /** 模型来源 */
  modelSource?: 'sqlite';
}

/**
 * L4 层级配置（执行功能层）
 */
export interface AceLayerL4Config {
  /** 是否启用 */
  enabled?: boolean;
  /** 模型来源 */
  modelSource?: 'sqlite';
}

/**
 * L5 层级配置（认知控制层）
 */
export interface AceLayerL5Config {
  /** 是否启用 */
  enabled?: boolean;
  /** 模型来源 */
  modelSource?: 'sqlite';
  /** 是否回退到进化模式 */
  fallbackToEvolution?: boolean;
}

/**
 * L6 层级配置（任务执行层）
 */
export interface AceLayerL6Config {
  /** 是否启用 */
  enabled?: boolean;
  /** 是否使用 LLM */
  useLLM?: boolean;
}

/**
 * ACE 内存配置
 */
export interface AceMemoryConfig {
  /** 提供商类型 */
  provider?: 'lancedb' | 'memory' | 'custom';
  /** 向量数据库路径 */
  vectorDbPath?: string;
  /** 集合前缀 */
  collectionPrefix?: string;
}

/**
 * ACE 优化配置
 */
export interface AceOptimizationConfig {
  /** 简单任务快速通道 */
  fastTrackSimpleTasks?: boolean;
  /** L5 草稿纸压缩 */
  l5ScratchpadCompression?: boolean;
  /** L6 非 LLM 执行 */
  l6NonLLMExecution?: boolean;
}

/**
 * ACE 技能系统配置
 */
export interface AceSkillsConfig {
  /** 自动清理是否启用 */
  autoCleanupEnabled?: boolean;
  /** 清理超时（毫秒） */
  cleanupTimeoutMs?: number;
  /** 最大活动技能数 */
  maxActiveSkills?: number;
}

/**
 * ACE 本地化实现配置
 */
export interface AceLocalImplementationConfig {
  /** 是否启用 */
  enabled?: boolean;
  /** ACE 核心配置 */
  aceCore?: {
    /** 反思周期间隔（毫秒） */
    reflectionCycleInterval?: number;
    /** 最大会话时长（毫秒） */
    maxSessionAge?: number;
  };
  /** 是否使用事件总线 */
  useEventBus?: boolean;
  /** 是否使用 LLM 管理器 */
  useLLMManager?: boolean;
  /** 是否使用 SQLite 配置 */
  useSQLiteConfig?: boolean;
}
```

### 3.6 AdminConfig 类型设计

**文件**: `types/config/admin.ts`

```typescript
import type { ApiKeyInfo } from './api-key';
import type { RateLimitSettings } from './rate-limit';
import type { RedisConfig } from './redis';
import type { AceConfig } from './ace';

/**
 * API 配置
 */
export interface ApiConfig {
  /** 主机地址 */
  host?: string;
  /** 端口 */
  port?: number;
  /** CORS 配置 */
  cors?: {
    /** 允许的源 */
    origin?: string | string[];
    /** 是否支持凭证 */
    credentials?: boolean;
  };
}

/**
 * LLM 提供商配置项
 */
export interface LLMProviderItem {
  /** 提供商 ID */
  id: string;
  /** 提供商标识 */
  provider: string;
  /** 提供商名称 */
  name: string;
  /** 提供商配置 */
  config: Record<string, unknown>;
  /** 是否启用 */
  enabled: boolean;
  /** 创建时间戳 */
  createdAt: number;
  /** 更新时间戳 */
  updatedAt: number;
}

/**
 * LLM 配置
 */
export interface LLMConfig {
  /** LLM 提供商列表 */
  providers?: LLMProviderItem[];
  /** 默认提供商 */
  defaultProvider?: string;
  /** 备用提供商 */
  fallbackProvider?: string;
  /** 请求超时（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
}

/**
 * 认证配置
 */
export interface AuthConfig {
  /** 是否启用认证 */
  enabled: boolean;
  /** API Key */
  apiKey?: string;
  /** JWT 密钥 */
  jwtSecret?: string;
  /** JWT 过期时间 */
  jwtExpiresIn?: string;
  /** API Key 列表 */
  apiKeys?: ApiKeyInfo[];
}

/**
 * 日志配置
 */
export interface LoggingConfig {
  /** 日志级别 */
  level?: string;
  /** 日志文件路径 */
  file?: string;
}

/**
 * 性能配置
 */
export interface PerformanceConfig {
  /** 工作线程池大小 */
  workerPoolSize?: number;
  /** 请求超时（毫秒） */
  requestTimeout?: number;
  /** 最大请求大小 */
  maxRequestSize?: string;
}

/**
 * 安全配置
 */
export interface SecurityConfig {
  /** 速率限制设置 */
  rateLimit?: RateLimitSettings;
}

/**
 * 管理员配置（主配置类型）
 */
export interface AdminConfig {
  /** API 配置 */
  api: ApiConfig;
  /** LLM 配置 */
  llm: LLMConfig;
  /** 认证配置 */
  auth: AuthConfig;
  /** 日志配置 */
  logging?: LoggingConfig;
  /** 性能配置 */
  performance?: PerformanceConfig;
  /** Redis 配置 */
  redis?: RedisConfig;
  /** 安全配置 */
  security?: SecurityConfig;
  /** ACE 架构配置 */
  ace?: AceConfig;
  /** Playbook 配置 */
  playbook?: Record<string, unknown>;
  /** 设置完成状态 */
  setup_completed?: boolean;
  /** 允许动态属性 */
  [key: string]: unknown;
}
```

### 3.7 系统配置类型设计

**文件**: `types/config/admin.ts`（追加）

```typescript
/**
 * 路径配置
 */
export interface PathsConfig {
  /** 根目录 */
  rootDir: string;
  /** 配置目录 */
  configDir: string;
  /** 数据目录 */
  dataDir: string;
  /** 日志目录 */
  logDir: string;
  /** 向量存储目录 */
  vectorStoreDir: string;
}

/**
 * 安全配置（系统级）
 */
export interface SystemSecurityConfig {
  /** ABP API Key */
  abpApiKey: string;
  /** JWT 密钥 */
  jwtSecret: string;
  /** 宪法文件路径 */
  constitutionPath: string;
}

/**
 * 环境配置
 */
export interface EnvironmentConfig {
  /** Node 环境 */
  nodeEnv: string;
  /** 日志级别 */
  logLevel: string;
  /** 日志文件路径 */
  logFile: string;
  /** 最大请求大小 */
  maxRequestSize: string;
  /** 安全日志级别 */
  securityLogLevel: string;
  /** 是否启用安全日志 */
  securityLogEnabled: boolean;
  /** 是否详细日志 */
  verboseLogging: boolean;
}

/**
 * 数据库配置
 */
export interface DatabaseConfig {
  /** SQLite 数据库路径 */
  sqlitePath: string;
  /** LanceDB 路径 */
  lancedbPath: string;
}

/**
 * Playbook 配置
 */
export interface PlaybookConfig {
  /** 提取超时（毫秒） */
  extractionTimeout: number;
  /** 相似度阈值 */
  similarityThreshold: number;
  /** 最大推荐数 */
  maxRecommendations: number;
}

/**
 * 系统级配置接口
 */
export interface SystemConfig {
  /** 服务端口 */
  port: number;
  /** 是否自动启动 */
  autostart: boolean;
  /** 路径配置 */
  paths: PathsConfig;
  /** 安全配置 */
  security: SystemSecurityConfig;
  /** 环境配置 */
  environment: EnvironmentConfig;
  /** 数据库配置 */
  database: DatabaseConfig;
  /** Playbook 配置 */
  playbook: PlaybookConfig;
}

/**
 * 完整配置接口（系统级 + 应用级）
 */
export interface FullConfig {
  /** 系统级配置 */
  port: number;
  autostart: boolean;
  paths: PathsConfig;
  systemSecurity: SystemSecurityConfig;
  environment: EnvironmentConfig;
  database: DatabaseConfig;
  playbookConfig: PlaybookConfig;
  /** 应用级配置 */
  setup_completed?: boolean;
  api?: ApiConfig;
  auth?: AuthConfig;
  performance?: PerformanceConfig;
  redis?: RedisConfig;
  appSecurity?: SecurityConfig;
  ace?: AceConfig;
  playbook?: Record<string, unknown>;
}
```

---

## 4. 服务拆分设计

### 4.1 ConfigLoader 服务

**文件**: `utils/config-loader.ts`

```typescript
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { logger } from './logger';
import type { AdminConfig } from '../types/config';
import { DEFAULT_CONFIG } from './config-constants';
import { PathService } from '../services/PathService';

/**
 * 配置加载器
 * 负责从文件系统读取和缓存配置
 */
export class ConfigLoader {
  private static instance: ConfigLoader;
  private configCache: AdminConfig | null = null;
  private readonly configPath: string;

  private constructor() {
    const pathService = PathService.getInstance();
    this.configPath = pathService.getConfigFilePath();
  }

  public static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  /**
   * 读取配置（同步）
   */
  public loadSync(): AdminConfig {
    if (this.configCache) {
      return this.configCache;
    }

    try {
      const configData = fs.readFileSync(this.configPath, 'utf-8');
      const config = JSON.parse(configData) as AdminConfig;
      this.configCache = config;
      return config;
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'ENOENT') {
        logger.warn(`配置文件不存在: ${this.configPath}，创建默认配置`);
        this.writeSync(DEFAULT_CONFIG);
        return DEFAULT_CONFIG;
      }
      logger.error(`配置文件损坏: ${this.configPath}`, err.message);
      throw new Error(`Configuration load failed: ${err.message}`);
    }
  }

  /**
   * 读取配置（异步）
   */
  public async loadAsync(): Promise<AdminConfig> {
    if (this.configCache) {
      return this.configCache;
    }

    try {
      const configData = await fsPromises.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configData) as AdminConfig;
      this.configCache = config;
      return config;
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'ENOENT') {
        logger.warn(`配置文件不存在: ${this.configPath}，创建默认配置`);
        await this.writeAsync(DEFAULT_CONFIG);
        return DEFAULT_CONFIG;
      }
      logger.error(`配置文件损坏: ${this.configPath}`, err.message);
      throw new Error(`Configuration load failed: ${err.message}`);
    }
  }

  /**
   * 写入配置（同步 - 原子写入）
   */
  public writeSync(config: AdminConfig): void {
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const configData = JSON.stringify(config, null, 2);
    const tempPath = `${this.configPath}.tmp`;

    fs.writeFileSync(tempPath, configData, 'utf-8');
    fs.renameSync(tempPath, this.configPath);

    this.configCache = config;
    logger.info(`配置已保存: ${this.configPath}`);
  }

  /**
   * 写入配置（异步 - 原子写入）
   */
  public async writeAsync(config: AdminConfig): Promise<void> {
    const configDir = path.dirname(this.configPath);
    await fsPromises.mkdir(configDir, { recursive: true });

    const configData = JSON.stringify(config, null, 2);
    const tempPath = `${this.configPath}.tmp`;

    await fsPromises.writeFile(tempPath, configData, 'utf-8');
    await fsPromises.rename(tempPath, this.configPath);

    this.configCache = config;
    logger.info(`配置已保存: ${this.configPath}`);
  }

  /**
   * 清除缓存
   */
  public clearCache(): void {
    this.configCache = null;
  }

  /**
   * 获取缓存的配置
   */
  public getCached(): AdminConfig | null {
    return this.configCache;
  }
}
```

### 4.2 ConfigValidator 服务

**文件**: `utils/config-validator.ts`

```typescript
import { logger } from './logger';
import type {
  AdminConfig,
  AceConfig,
  AceLayersConfig,
  AceMemoryConfig,
  AceOptimizationConfig,
  AceSkillsConfig,
  AceLocalImplementationConfig
} from '../types/config';

/**
 * 配置验证结果
 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误列表 */
  errors: string[];
  /** 警告列表 */
  warnings?: string[];
}

/**
 * 配置验证器
 * 负责验证配置的正确性
 */
export class ConfigValidator {
  /**
   * 验证完整配置
   */
  public validate(config: AdminConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 基础验证
      this.validateAuth(config.auth, errors, warnings);
      this.validateApi(config.api, errors, warnings);

      // ACE 配置验证
      if (config.ace) {
        this.validateAceConfig(config.ace, errors, warnings);
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    } catch (error) {
      logger.error('配置验证失败:', error);
      return {
        valid: false,
        errors: ['配置验证过程中发生错误']
      };
    }
  }

  /**
   * 验证认证配置
   */
  private validateAuth(
    auth: AdminConfig['auth'],
    errors: string[],
    warnings: string[]
  ): void {
    if (!auth || typeof auth.enabled !== 'boolean') {
      errors.push('auth.enabled 必须是布尔值');
    }

    if (auth?.enabled && !auth?.apiKey) {
      errors.push('启用认证时必须提供 apiKey');
    }
  }

  /**
   * 验证 API 配置
   */
  private validateApi(
    api: AdminConfig['api'],
    errors: string[],
    warnings: string[]
  ): void {
    if (!api || typeof api.port !== 'number') {
      errors.push('api.port 必须是数字');
    }

    if (api?.port && (api.port < 1 || api.port > 65535)) {
      errors.push('api.port 必须在 1-65535 范围内');
    }
  }

  /**
   * 验证 ACE 配置
   */
  private validateAceConfig(
    aceConfig: AceConfig,
    errors: string[],
    warnings: string[]
  ): void {
    if (aceConfig.layers) {
      this.validateAceLayers(aceConfig.layers, errors, warnings);
    }

    if (aceConfig.memory) {
      this.validateAceMemory(aceConfig.memory, errors, warnings);
    }

    if (aceConfig.optimization) {
      this.validateAceOptimization(aceConfig.optimization, errors, warnings);
    }

    if (aceConfig.skills) {
      this.validateAceSkills(aceConfig.skills, errors, warnings);
    }

    if (aceConfig.localImplementation) {
      this.validateAceLocalImplementation(
        aceConfig.localImplementation,
        errors,
        warnings
      );
    }
  }

  /**
   * 验证 ACE 层级配置
   */
  private validateAceLayers(
    layers: AceLayersConfig,
    errors: string[],
    warnings: string[]
  ): void {
    const layerNames = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'] as const;

    for (const layerName of layerNames) {
      const layer = layers[layerName];
      if (layer?.enabled) {
        // 验证 L1 层宪法文件路径
        if (layerName === 'l1' && layer.constitutionPath) {
          if (typeof layer.constitutionPath !== 'string') {
            errors.push(`ace.layers.${layerName}.constitutionPath 必须是字符串`);
          } else if (!layer.constitutionPath.startsWith('./')) {
            warnings.push(`ace.layers.${layerName}.constitutionPath 建议使用相对路径`);
          }
        }

        // 验证模型来源
        if (layer.modelSource && layer.modelSource !== 'sqlite') {
          errors.push(`ace.layers.${layerName}.modelSource 只支持 sqlite`);
        }

        // L5 层 fallbackToEvolution 验证
        if (layerName === 'l5' && typeof layer.fallbackToEvolution !== 'boolean') {
          warnings.push(`ace.layers.${layerName}.fallbackToEvolution 建议设置为布尔值`);
        }

        // L6 层 useLLM 验证
        if (layerName === 'l6' && typeof layer.useLLM !== 'boolean') {
          warnings.push(`ace.layers.${layerName}.useLLM 建议设置为布尔值`);
        }
      }
    }
  }

  /**
   * 验证 ACE 内存配置
   */
  private validateAceMemory(
    memory: AceMemoryConfig,
    errors: string[],
    warnings: string[]
  ): void {
    const validProviders = ['lancedb', 'memory', 'custom'];
    if (memory.provider && !validProviders.includes(memory.provider)) {
      errors.push(`ace.memory.provider 必须是: ${validProviders.join(', ')} 中的一个`);
    }

    if (memory.vectorDbPath && typeof memory.vectorDbPath !== 'string') {
      errors.push('ace.memory.vectorDbPath 必须是字符串');
    }

    if (memory.collectionPrefix && typeof memory.collectionPrefix !== 'string') {
      errors.push('ace.memory.collectionPrefix 必须是字符串');
    }
  }

  /**
   * 验证 ACE 优化配置
   */
  private validateAceOptimization(
    optimization: AceOptimizationConfig,
    errors: string[],
    warnings: string[]
  ): void {
    if (typeof optimization.fastTrackSimpleTasks !== 'boolean') {
      warnings.push('ace.optimization.fastTrackSimpleTasks 建议设置为布尔值');
    }

    if (typeof optimization.l5ScratchpadCompression !== 'boolean') {
      warnings.push('ace.optimization.l5ScratchpadCompression 建议设置为布尔值');
    }

    if (typeof optimization.l6NonLLMExecution !== 'boolean') {
      warnings.push('ace.optimization.l6NonLLMExecution 建议设置为布尔值');
    }
  }

  /**
   * 验证 ACE 技能配置
   */
  private validateAceSkills(
    skills: AceSkillsConfig,
    errors: string[],
    warnings: string[]
  ): void {
    if (typeof skills.autoCleanupEnabled !== 'boolean') {
      warnings.push('ace.skills.autoCleanupEnabled 建议设置为布尔值');
    }

    if (skills.cleanupTimeoutMs !== undefined) {
      if (typeof skills.cleanupTimeoutMs !== 'number') {
        errors.push('ace.skills.cleanupTimeoutMs 必须是数字');
      } else if (skills.cleanupTimeoutMs < 0) {
        errors.push('ace.skills.cleanupTimeoutMs 必须大于0');
      }
    }

    if (skills.maxActiveSkills !== undefined) {
      if (typeof skills.maxActiveSkills !== 'number') {
        errors.push('ace.skills.maxActiveSkills 必须是数字');
      } else if (skills.maxActiveSkills < 1) {
        errors.push('ace.skills.maxActiveSkills 必须大于0');
      }
    }
  }

  /**
   * 验证 ACE 本地化实现配置
   */
  private validateAceLocalImplementation(
    localImpl: AceLocalImplementationConfig,
    errors: string[],
    warnings: string[]
  ): void {
    if (typeof localImpl.enabled !== 'boolean') {
      warnings.push('ace.localImplementation.enabled 建议设置为布尔值');
    }

    if (localImpl.aceCore) {
      if (localImpl.aceCore.reflectionCycleInterval !== undefined) {
        if (typeof localImpl.aceCore.reflectionCycleInterval !== 'number') {
          errors.push('ace.localImplementation.aceCore.reflectionCycleInterval 必须是数字');
        } else if (localImpl.aceCore.reflectionCycleInterval < 1000) {
          warnings.push('ace.localImplementation.aceCore.reflectionCycleInterval 建议大于1000毫秒');
        }
      }

      if (localImpl.aceCore.maxSessionAge !== undefined) {
        if (typeof localImpl.aceCore.maxSessionAge !== 'number') {
          errors.push('ace.localImplementation.aceCore.maxSessionAge 必须是数字');
        } else if (localImpl.aceCore.maxSessionAge < 60000) {
          warnings.push('ace.localImplementation.aceCore.maxSessionAge 建议大于60000毫秒');
        }
      }
    }

    if (typeof localImpl.useEventBus !== 'boolean') {
      warnings.push('ace.localImplementation.useEventBus 建议设置为布尔值');
    }

    if (typeof localImpl.useLLMManager !== 'boolean') {
      warnings.push('ace.localImplementation.useLLMManager 建议设置为布尔值');
    }

    if (typeof localImpl.useSQLiteConfig !== 'boolean') {
      warnings.push('ace.localImplementation.useSQLiteConfig 建议设置为布尔值');
    }
  }
}
```

### 4.3 ConfigWriter 服务

**文件**: `utils/config-writer.ts`

```typescript
import type { AdminConfig } from '../types/config';
import { ConfigLoader } from './config-loader';

/**
 * 配置写入器
 * 负责配置的更新和合并
 */
export class ConfigWriter {
  private readonly loader: ConfigLoader;

  constructor() {
    this.loader = ConfigLoader.getInstance();
  }

  /**
   * 更新配置（异步）
   */
  public async updateAsync(updates: Partial<AdminConfig>): Promise<AdminConfig> {
    const currentConfig = await this.loader.loadAsync();
    const updatedConfig = this.mergeConfig(currentConfig, updates);
    await this.loader.writeAsync(updatedConfig);
    return updatedConfig;
  }

  /**
   * 更新配置（同步）
   */
  public update(updates: Partial<AdminConfig>): AdminConfig {
    const currentConfig = this.loader.loadSync();
    const updatedConfig = this.mergeConfig(currentConfig, updates);
    this.loader.writeSync(updatedConfig);
    return updatedConfig;
  }

  /**
   * 重载配置
   */
  public reload(): AdminConfig {
    this.loader.clearCache();
    return this.loader.loadSync();
  }

  /**
   * 递归合并配置对象
   */
  private mergeConfig(base: AdminConfig, updates: Partial<AdminConfig>): AdminConfig {
    const result: AdminConfig = { ...base };

    for (const key of Object.keys(updates)) {
      const updateValue = updates[key as keyof Partial<AdminConfig>];
      const baseValue = base[key as keyof AdminConfig];

      // 如果更新值和基础值都是对象（非数组），进行递归合并
      if (
        updateValue !== undefined &&
        updateValue !== null &&
        typeof updateValue === 'object' &&
        !Array.isArray(updateValue) &&
        baseValue !== undefined &&
        baseValue !== null &&
        typeof baseValue === 'object' &&
        !Array.isArray(baseValue)
      ) {
        result[key as keyof AdminConfig] = this.mergeConfig(
          baseValue as AdminConfig,
          updateValue as Partial<AdminConfig>
        ) as AdminConfig[keyof AdminConfig];
      } else if (updateValue !== undefined) {
        result[key as keyof AdminConfig] = updateValue as AdminConfig[keyof AdminConfig];
      }
    }

    return result;
  }
}
```

### 4.4 ConfigConstants 常量文件

**文件**: `utils/config-constants.ts`

```typescript
import type {
  AdminConfig,
  RateLimitSettings,
  RedisConfig,
  SystemConfig,
  FullConfig
} from '../types/config';
import type { ApiKeyInfo } from '../types/config/api-key';

/**
 * 默认 API Key 信息
 */
export const DEFAULT_API_KEY: ApiKeyInfo = {
  id: 'default',
  name: '默认项目',
  key: '',
  createdAt: Date.now()
};

/**
 * 创建默认速率限制设置
 */
export function createDefaultRateLimitSettings(): RateLimitSettings {
  return {
    enabled: true,
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 1000, // 限制每个IP 15分钟内最多1000个请求
    message: '请求过于频繁，请稍后再试',
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: false
  };
}

/**
 * 默认 Redis 配置
 */
export const DEFAULT_REDIS_CONFIG: RedisConfig = {
  enabled: false,
  host: 'localhost',
  port: 6379,
  db: 0,
  keyPrefix: 'apex_bridge:',
  connectTimeout: 10000,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100
};

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: AdminConfig = {
  api: {
    host: '0.0.0.0',
    port: 3000,
    cors: {
      origin: '*',
      credentials: true
    }
  },
  llm: {
    providers: [],
    defaultProvider: 'openai',
    timeout: 30000,
    maxRetries: 3
  },
  auth: {
    enabled: true,
    apiKey: process.env.ABP_API_KEY || '',
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
    jwtExpiresIn: '24h'
  },
  performance: {
    workerPoolSize: 4,
    requestTimeout: 60000,
    maxRequestSize: '50mb'
  },
  redis: {
    ...DEFAULT_REDIS_CONFIG
  },
  security: {
    rateLimit: createDefaultRateLimitSettings()
  }
};
```

---

## 5. 统一导出设计

### 5.1 类型导出文件

**文件**: `types/config/index.ts`

```typescript
/**
 * 配置类型统一导出
 */

// API Key 类型
export type { ApiKeyInfo } from './api-key';

// 速率限制类型
export type {
  RateLimitStrategyType,
  RateLimitStrategyConfig,
  RateLimitMatcherConfig,
  RateLimitRuleConfig,
  RateLimitHeadersConfig,
  RateLimitSettings
} from './rate-limit';

// Redis 配置类型
export type { RedisConfig } from './redis';

// ACE 配置类型
export type {
  AceConfig,
  AceOrchestrationConfig,
  AceLayersConfig,
  AceLayerL1Config,
  AceLayerL2Config,
  AceLayerL3Config,
  AceLayerL4Config,
  AceLayerL5Config,
  AceLayerL6Config,
  AceMemoryConfig,
  AceOptimizationConfig,
  AceSkillsConfig,
  AceLocalImplementationConfig
} from './ace';

// Admin 配置类型
export type {
  AdminConfig,
  ApiConfig,
  LLMProviderItem,
  LLMConfig,
  AuthConfig,
  LoggingConfig,
  PerformanceConfig,
  SecurityConfig,
  SystemConfig,
  FullConfig,
  PathsConfig,
  SystemSecurityConfig,
  EnvironmentConfig,
  DatabaseConfig,
  PlaybookConfig
} from './admin';
```

### 5.2 现有 types/config.ts 更新

**文件**: `types/config.ts`（更新内容）

```typescript
/**
 * 配置接口统一导出
 *
 * 此文件统一导出所有配置接口，便于查找和维护。
 * 各模块的配置接口保留在各自的类型文件中，通过此文件统一导出。
 */

// ==================== ConfigService 配置 ====================

export type {
  ApiKeyInfo,
  RateLimitStrategyType,
  RateLimitStrategyConfig,
  RateLimitMatcherConfig,
  RateLimitRuleConfig,
  RateLimitHeadersConfig,
  RateLimitSettings,
  RedisConfig,
  AdminConfig,
  AceConfig,
  AceOrchestrationConfig,
  AceLayersConfig,
  AceLayerL1Config,
  AceLayerL2Config,
  AceLayerL3Config,
  AceLayerL4Config,
  AceLayerL5Config,
  AceLayerL6Config,
  AceMemoryConfig,
  AceOptimizationConfig,
  AceSkillsConfig,
  AceLocalImplementationConfig,
  SystemConfig,
  FullConfig
} from './config';

// ==================== 默认值和工厂函数 ====================

export {
  DEFAULT_REDIS_CONFIG,
  DEFAULT_CONFIG,
  createDefaultRateLimitSettings
} from '../utils/config-constants';

// ==================== 验证结果类型 ====================

export type { ValidationResult } from '../utils/config-validator';
```

### 5.3 工具导出文件

**文件**: `utils/config/index.ts`

```typescript
/**
 * 配置工具导出
 */

export { ConfigLoader } from './config-loader';
export { ConfigValidator, type ValidationResult } from './config-validator';
export { ConfigWriter } from './config-writer';
```

---

## 6. 主服务重构设计

### 6.1 简化后的 ConfigService

**文件**: `services/ConfigService.ts`

```typescript
/**
 * ConfigService - 简化配置管理服务
 *
 * 重构说明：
 * - 类型定义迁移到 types/config/ 目录
 * - 配置加载逻辑迁移到 ConfigLoader
 * - 配置验证逻辑迁移到 ConfigValidator
 * - 配置写入逻辑迁移到 ConfigWriter
 * - 主服务仅保留协调逻辑
 */

import { ConfigLoader, ConfigValidator, ConfigWriter } from '../utils/config';
import {
  DEFAULT_CONFIG,
  createDefaultRateLimitSettings,
  DEFAULT_REDIS_CONFIG
} from '../utils/config-constants';
import type {
  AdminConfig,
  SystemConfig,
  FullConfig,
  SystemSecurityConfig,
  EnvironmentConfig,
  DatabaseConfig,
  PlaybookConfig,
  PathsConfig
} from '../types/config';
import { logger } from '../utils/logger';

/**
 * 配置服务
 *
 * 单例模式，协调 ConfigLoader、ConfigValidator、ConfigWriter
 */
export class ConfigService {
  private static instance: ConfigService;
  private readonly loader: ConfigLoader;
  private readonly validator: ConfigValidator;
  private readonly writer: ConfigWriter;

  private constructor() {
    this.loader = ConfigLoader.getInstance();
    this.validator = new ConfigValidator();
    this.writer = new ConfigWriter();
  }

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  // ==================== 配置读取方法 ====================

  /**
   * 读取配置（同步）
   */
  public readConfig(): AdminConfig {
    return this.loader.loadSync();
  }

  /**
   * 读取配置（异步）
   */
  public async readConfigAsync(): Promise<AdminConfig> {
    return this.loader.loadAsync();
  }

  /**
   * 获取当前配置（兼容性方法）
   */
  public getCurrentConfig(): AdminConfig {
    return this.readConfig();
  }

  /**
   * 加载配置（兼容性方法）
   */
  public loadConfig(): AdminConfig {
    return this.readConfig();
  }

  // ==================== 配置写入方法 ====================

  /**
   * 写入配置（同步）
   */
  public writeConfig(config: AdminConfig): void {
    this.loader.writeSync(config);
  }

  /**
   * 写入配置（异步）
   */
  public async writeConfigAsync(config: AdminConfig): Promise<void> {
    await this.loader.writeAsync(config);
  }

  // ==================== 配置更新方法 ====================

  /**
   * 更新配置（异步）
   */
  public async updateConfigAsync(updates: Partial<AdminConfig>): Promise<AdminConfig> {
    return this.writer.updateAsync(updates);
  }

  /**
   * 更新配置（同步）
   */
  public updateConfig(updates: Partial<AdminConfig>): AdminConfig {
    return this.writer.update(updates);
  }

  // ==================== 配置重载方法 ====================

  /**
   * 重载配置（清除缓存）
   */
  public reloadConfig(): AdminConfig {
    this.loader.clearCache();
    return this.readConfig();
  }

  /**
   * 重载（兼容性方法）
   */
  public reload(): AdminConfig {
    return this.reloadConfig();
  }

  // ==================== 配置验证方法 ====================

  /**
   * 验证配置
   */
  public validateConfig(config: AdminConfig): ReturnType<ConfigValidator['validate']> {
    return this.validator.validate(config);
  }

  /**
   * 验证系统配置（环境变量）
   */
  public validateSystemConfig(): { valid: boolean; errors: string[]; warnings: string[] } {
    const systemConfig = this.getSystemConfig();
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!systemConfig.security.abpApiKey) {
      errors.push('ABP_API_KEY 未设置（环境变量）');
    }

    if (!systemConfig.security.jwtSecret) {
      errors.push('JWT_SECRET 未设置（环境变量）');
    }

    if (systemConfig.port < 1 || systemConfig.port > 65535) {
      errors.push(`PORT 必须在 1-65535 范围内，当前值：${systemConfig.port}`);
    }

    if (!systemConfig.paths.rootDir) {
      errors.push('APEX_BRIDGE_ROOT_DIR 未设置');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  // ==================== 系统配置方法 ====================

  /**
   * 检查是否已完成初始化设置
   */
  public isSetupCompleted(): boolean {
    try {
      const config = this.readConfig();
      return !!(config?.auth?.apiKey && config.auth.apiKey.trim() !== '');
    } catch (error) {
      logger.error('检查初始化状态失败:', error);
      return false;
    }
  }

  /**
   * 获取系统级配置（从环境变量读取）
   */
  public getSystemConfig(): SystemConfig {
    const port = parseInt(process.env.PORT || '3000', 10);
    const autostart = process.env.APEX_BRIDGE_AUTOSTART !== 'false';

    return {
      port,
      autostart,
      paths: this.getPathsConfig(),
      security: this.getSystemSecurityConfig(),
      environment: this.getEnvironmentConfig(),
      database: this.getDatabaseConfig(),
      playbook: this.getPlaybookConfig()
    };
  }

  /**
   * 获取应用级配置（从 JSON 读取）
   */
  public getAppConfig(): Partial<AdminConfig> {
    const config = this.readConfig();
    return {
      setup_completed: config.setup_completed,
      api: config.api,
      llm: config.llm,
      auth: config.auth,
      performance: config.performance,
      redis: config.redis,
      security: config.security,
      ace: config.ace,
      playbook: config.playbook
    };
  }

  /**
   * 获取完整配置（env 优先，JSON 作为后备）
   */
  public getFullConfig(): FullConfig {
    const systemConfig = this.getSystemConfig();
    const appConfig = this.getAppConfig();

    return {
      port: systemConfig.port,
      autostart: systemConfig.autostart,
      paths: systemConfig.paths,
      systemSecurity: systemConfig.security,
      environment: systemConfig.environment,
      database: systemConfig.database,
      playbookConfig: systemConfig.playbook,
      setup_completed: appConfig.setup_completed,
      api: appConfig.api,
      auth: {
        ...appConfig.auth,
        apiKey: systemConfig.security.abpApiKey,
        jwtSecret: systemConfig.security.jwtSecret
      },
      performance: appConfig.performance,
      redis: appConfig.redis,
      appSecurity: appConfig.security,
      ace: appConfig.ace,
      playbook: appConfig.playbook
    };
  }

  // ==================== 私有辅助方法 ====================

  private getPathsConfig(): PathsConfig {
    return {
      rootDir: process.env.APEX_BRIDGE_ROOT_DIR || process.cwd(),
      configDir: process.env.APEX_BRIDGE_CONFIG_DIR || `${process.cwd()}/config`,
      dataDir: process.env.APEX_BRIDGE_DATA_DIR || `${process.cwd()}/.data`,
      logDir: process.env.APEX_BRIDGE_LOG_DIR || `${process.cwd()}/logs`,
      vectorStoreDir: process.env.APEX_BRIDGE_VECTOR_STORE_DIR || `${process.cwd()}/.data/lancedb`
    };
  }

  private getSystemSecurityConfig(): SystemSecurityConfig {
    return {
      abpApiKey: process.env.ABP_API_KEY || '',
      jwtSecret: process.env.JWT_SECRET || '',
      constitutionPath: process.env.CONSTITUTION_PATH || './config/constitution.md'
    };
  }

  private getEnvironmentConfig(): EnvironmentConfig {
    return {
      nodeEnv: process.env.NODE_ENV || 'development',
      logLevel: process.env.LOG_LEVEL || 'info',
      logFile: process.env.LOG_FILE || './logs/apex-bridge.log',
      maxRequestSize: process.env.MAX_REQUEST_SIZE || '100mb',
      securityLogLevel: process.env.SECURITY_LOG_LEVEL || 'warn',
      securityLogEnabled: process.env.SECURITY_LOG_ENABLED !== 'false',
      verboseLogging: process.env.VERBOSE_LOGGING === 'true'
    };
  }

  private getDatabaseConfig(): DatabaseConfig {
    return {
      sqlitePath: process.env.SQLITE_PATH || './.data/llm_providers.db',
      lancedbPath: process.env.LANCEDB_PATH || './.data/lancedb'
    };
  }

  private getPlaybookConfig(): PlaybookConfig {
    return {
      extractionTimeout: parseInt(process.env.PLAYBOOK_EXTRACTION_TIMEOUT || '30000', 10),
      similarityThreshold: parseFloat(process.env.PLAYBOOK_SIMILARITY_THRESHOLD || '0.5'),
      maxRecommendations: parseInt(process.env.PLAYBOOK_MAX_RECOMMENDATIONS || '5', 10)
    };
  }
}

// ==================== 导出兼容 ====================

// 导出常量（保持原有导出位置）
export {
  DEFAULT_CONFIG,
  DEFAULT_REDIS_CONFIG,
  createDefaultRateLimitSettings
} from '../utils/config-constants';

// 导出类型（保持原有导出位置）
export type {
  ApiKeyInfo,
  RateLimitSettings,
  RedisConfig,
  AdminConfig,
  AceConfig,
  AceOrchestrationConfig,
  AceLayersConfig,
  AceLayerL1Config,
  AceLayerL2Config,
  AceLayerL3Config,
  AceLayerL4Config,
  AceLayerL5Config,
  AceLayerL6Config,
  AceMemoryConfig,
  AceOptimizationConfig,
  AceSkillsConfig,
  AceLocalImplementationConfig,
  SystemConfig,
  FullConfig
} from '../types/config';
```

---

## 7. 接口兼容性设计

### 7.1 类型别名兼容层

为确保现有代码无需修改即可工作，提供类型别名：

```typescript
// src/services/ConfigService.ts 中添加

// 保持原有类型导出位置不变
export {
  // ... 其他导出
  RateLimitStrategyType,
  RateLimitStrategyConfig,
  RateLimitMatcherConfig,
  RateLimitRuleConfig,
  RateLimitHeadersConfig,
} from '../types/config/rate-limit';
```

### 7.2 API 接口兼容性

| 接口路径 | 方法 | 保持不变 | 说明 |
|----------|------|----------|------|
| `/api/config` | GET | 是 | 返回 AdminConfig |
| `/api/config` | POST | 是 | 接受 Partial<AdminConfig> |
| `/api/config/system` | GET | 是 | 返回 SystemConfig |
| `/api/config/validate` | POST | 是 | 返回 ValidationResult |

### 7.3 数据格式兼容性

配置 JSON 结构保持完全一致：

```json
{
  "api": { "host": "0.0.0.0", "port": 3000, "cors": { "origin": "*" } },
  "llm": { "providers": [], "defaultProvider": "openai" },
  "auth": { "enabled": true, "apiKey": "", "jwtSecret": "" },
  "redis": { "enabled": false, "host": "localhost", "port": 6379 },
  "security": { "rateLimit": { "enabled": true, "windowMs": 900000, "max": 1000 } },
  "ace": { "enabled": false, "layers": { "l1": { "enabled": false } } }
}
```

---

## 8. 迁移步骤

### 8.1 第一阶段：创建类型文件

**任务清单**:

| 步骤 | 操作 | 文件 |
|------|------|------|
| 1 | 创建 `types/config/api-key.ts` | ApiKeyInfo |
| 2 | 创建 `types/config/rate-limit.ts` | RateLimit* |
| 3 | 创建 `types/config/redis.ts` | RedisConfig |
| 4 | 创建 `types/config/ace.ts` | Ace* |
| 5 | 创建 `types/config/admin.ts` | AdminConfig, SystemConfig, FullConfig |
| 6 | 创建 `types/config/index.ts` | 统一导出 |

### 8.2 第二阶段：创建工具服务

**任务清单**:

| 步骤 | 操作 | 文件 |
|------|------|------|
| 1 | 创建 `utils/config-constants.ts` | DEFAULT_CONFIG, 默认值 |
| 2 | 创建 `utils/config-loader.ts` | ConfigLoader |
| 3 | 创建 `utils/config-validator.ts` | ConfigValidator |
| 4 | 创建 `utils/config-writer.ts` | ConfigWriter |
| 5 | 创建 `utils/config/index.ts` | 统一导出 |

### 8.3 第三阶段：重构主服务

**任务清单**:

| 步骤 | 操作 | 文件 |
|------|------|------|
| 1 | 更新 `types/config.ts` | 重新导出路径 |
| 2 | 重构 `services/ConfigService.ts` | 简化主服务 |
| 3 | 更新所有引用 ConfigService 的文件 | 验证兼容性 |

### 8.4 第四阶段：验证与测试

**验证清单**:

- [ ] TypeScript 编译无错误
- [ ] `npm test` 全部通过
- [ ] API 接口行为一致
- [ ] 配置加载/写入功能正常
- [ ] 配置验证功能正常

---

## 9. 验证方法

### 9.1 编译验证

```bash
# TypeScript 编译检查
npm run build

# 或仅检查
npx tsc --noEmit
```

### 9.2 功能测试

```bash
# 运行配置相关测试
npm test -- --testPathPattern="config"

# 或运行所有测试
npm test
```

### 9.3 手动验证步骤

1. **配置加载测试**:
   ```bash
   curl http://localhost:3000/api/config
   # 预期: 返回正确格式的 JSON 配置
   ```

2. **配置写入测试**:
   ```bash
   curl -X POST http://localhost:3000/api/config \
     -H "Content-Type: application/json" \
     -d '{"api": {"port": 3001}}'
   # 预期: 配置更新成功，服务正常运行
   ```

3. **配置验证测试**:
   ```bash
   curl -X POST http://localhost:3000/api/config/validate \
     -H "Content-Type: application/json" \
     -d '{"api": {"port": 99999}}'
   # 预期: 返回验证错误
   ```

---

## 10. 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 类型变更导致编译错误 | 中 | 低 | 提供类型别名兼容层 |
| 循环引用导致编译问题 | 中 | 低 | 仔细设计依赖关系 |
| API 行为不一致 | 高 | 低 | 完整的功能测试覆盖 |
| 性能下降 | 中 | 低 | 性能基准测试与优化 |
| 迁移过程复杂 | 中 | 中 | 分阶段迁移，每阶段验证 |

---

## 11. 附录

### 11.1 变更记录

| 版本 | 日期 | 作者 | 描述 |
|------|------|------|------|
| 1.0.0 | 2025-12-30 | - | 初始功能设计文档 |

### 11.2 相关文件清单

| 文件路径 | 描述 |
|----------|------|
| `src/services/ConfigService.ts` | 主服务（重构后） |
| `src/types/config/index.ts` | 配置类型统一导出 |
| `src/types/config/admin.ts` | AdminConfig 及系统配置 |
| `src/types/config/rate-limit.ts` | 速率限制配置类型 |
| `src/types/config/redis.ts` | Redis 配置类型 |
| `src/types/config/api-key.ts` | ApiKeyInfo 类型 |
| `src/types/config/ace.ts` | ACE 架构配置类型 |
| `src/utils/config/index.ts` | 配置工具统一导出 |
| `src/utils/config-loader.ts` | 配置加载器 |
| `src/utils/config-validator.ts` | 配置验证器 |
| `src/utils/config-writer.ts` | 配置写入器 |
| `src/utils/config-constants.ts` | 配置常量 |

---

**文档版本**: 1.0.0
**最后更新**: 2025-12-30
**状态**: 评审通过
