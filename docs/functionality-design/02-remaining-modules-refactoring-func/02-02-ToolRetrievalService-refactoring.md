# ToolRetrievalService 重构功能设计文档

**文档编号**: FD-003
**版本**: 1.0.0
**创建日期**: 2025-12-30
**关联需求**: R-002
**状态**: 待评审

---

## 1. 概述

### 1.1 背景说明

ToolRetrievalService 是工具检索系统的核心组件，当前文件 `src/services/ToolRetrievalService.ts` 包含 1149 行代码，混合关注点：数据库连接、嵌入生成、技能索引、搜索逻辑和 MCP 支持。

### 1.2 重构目标

1. 将 1149 行代码拆分为 6 个高内聚模块
2. 独立数据库连接管理
3. 抽象嵌入生成接口，支持多模型
4. 分离 MCP 工具支持逻辑
5. 保持公共 API 不变

### 1.3 参考标准

- 单个文件不超过 500 行
- 单一职责原则：每个类/模块只有一个变更理由
- 方法不超过 50 行（特殊情况不超过 100 行）
- 单元测试覆盖率不低于 80%

---

## 2. 目标结构

### 2.1 目录结构

```
src/services/tool-retrieval/
├── ToolRetrievalService.ts     # 主服务 (200行)
├── LanceDBConnection.ts        # 数据库连接管理 (150行)
├── EmbeddingGenerator.ts       # 嵌入生成 (200行)
├── SkillIndexer.ts             # 技能索引 (200行)
├── SearchEngine.ts             # 搜索逻辑 (200行)
├── MCPToolSupport.ts           # MCP 工具支持 (150行)
├── types.ts                    # 类型定义 (100行)
└── index.ts                    # 统一导出
```

### 2.2 架构图

```
                    +-----------------------+
                    |  ToolRetrievalService |
                    |      (主服务)          |
                    +-----------------------+
                             |
    +------------------------+------------------------+
    |                        |                        |
    v                        v                        v
+-----------------+  +-----------------+  +-----------------+
| LanceDBConnection|  |EmbeddingGenerator|  |  SearchEngine  |
+-----------------+  +-----------------+  +-----------------+
    |                        |                        |
    |                        |                        |
    v                        v                        v
+-----------------+  +-----------------+  +-----------------+
|    Schema       |  |   LLMManager    |  |  SkillIndexer  |
|   Management    |  |   (嵌入模型)    |  +-----------------+
+-----------------+  +-----------------+          |
                                                   v
                                            +-----------------+
                                            |  MCPToolSupport |
                                            +-----------------+
```

---

## 3. 职责划分

### 3.1 模块职责表

| 模块文件 | 职责描述 | 预估行数 | 依赖 |
|----------|----------|----------|------|
| ToolRetrievalService.ts | 主服务，公共 API，初始化协调 | 200 | LanceDBConnection, EmbeddingGenerator, SkillIndexer, SearchEngine, MCPToolSupport |
| LanceDBConnection.ts | 数据库连接、Schema 管理、表初始化 | 150 | lancedb (第三方库) |
| EmbeddingGenerator.ts | 嵌入生成逻辑，支持多模型 | 200 | LLMManager |
| SkillIndexer.ts | 技能索引操作：添加、删除、更新 | 200 | LanceDBConnection |
| SearchEngine.ts | 向量搜索、结果格式化、过滤 | 200 | LanceDBConnection, EmbeddingGenerator |
| MCPToolSupport.ts | MCP 工具特殊处理、嵌入生成 | 150 | EmbeddingGenerator, LLMManager |
| types.ts | 类型定义 | 100 | - |

### 3.2 方法迁移表

| 原始方法 | 新位置 | 迁移类型 |
|----------|--------|----------|
| initialize() | ToolRetrievalService.ts | 重构 |
| connectToLanceDB() | LanceDBConnection.ts | 迁移 |
| initializeSkillsTable() | LanceDBConnection.ts | 迁移 |
| getEmbedding() | EmbeddingGenerator.ts | 迁移 |
| generateRemoteEmbedding() | EmbeddingGenerator.ts | 迁移 |
| prepareEmbeddingText() | EmbeddingGenerator.ts | 迁移 |
| indexSkill() | SkillIndexer.ts | 迁移 |
| removeSkill() | SkillIndexer.ts | 迁移 |
| findRelevantSkills() | SearchEngine.ts | 迁移 |
| formatSearchResults() | SearchEngine.ts | 迁移 |
| scanAndIndexAllSkills() | SkillIndexer.ts | 迁移 |
| checkReindexRequired() | SkillIndexer.ts | 迁移 |
| readSkillMetadata() | SkillIndexer.ts | 迁移 |
| indexTools() | MCPToolSupport.ts | 迁移 |
| getEmbeddingForTool() | MCPToolSupport.ts | 迁移 |
| removeTool() | MCPToolSupport.ts | 迁移 |

---

## 4. 详细类型设计

### 4.1 核心类型定义 (types.ts)

```typescript
// ==================== 工具检索结果 ====================

/**
 * 工具检索结果
 */
export interface ToolRetrievalResult {
  /** 工具/技能 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 相似度分数 (0-1) */
  score: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
  /** 类型标签 */
  tags?: string[];
}

/**
 * 检索结果排序选项
 */
export interface RetrievalSortingOptions {
  /** 排序字段 */
  field: 'score' | 'relevance' | 'popularity';
  /** 排序方向 */
  order: 'asc' | 'desc';
}

// ==================== 技能数据 ====================

/**
 * 技能数据结构
 */
export interface SkillData {
  /** 技能 ID */
  id: string;
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
  /** 执行命令 */
  command?: string;
  /** 参数模式 */
  parameters?: Record<string, unknown>;
  /** 类型 */
  type?: string;
  /** 标签 */
  tags?: string[];
  /** 文件路径 */
  filePath?: string;
  /** 最后修改时间 */
  lastModified?: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

// ==================== MCP 工具 ====================

/**
 * MCP 工具定义
 */
export interface MCPTool {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 输入模式 */
  inputSchema: MCPInputSchema;
  /** 工具类型 */
  type?: string;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * MCP 输入模式
 */
export interface MCPInputSchema {
  /** JSON Schema */
  schema: Record<string, unknown>;
  /** 属性 */
  properties?: Record<string, unknown>;
}

/**
 * MCP 工具检索结果
 */
export interface MCPToolRetrievalResult {
  /** 工具名称 */
  name: string;
  /** 相似度分数 */
  score: number;
  /** 描述 */
  description: string;
  /** 参数模式 */
  parameters?: Record<string, unknown>;
}

// ==================== 嵌入向量 ====================

/**
 * 嵌入向量配置
 */
export interface EmbeddingConfig {
  /** 嵌入模型提供商 */
  provider: 'openai' | 'deepseek' | 'zhipu' | 'ollama';
  /** 模型名称 */
  model: string;
  /** 嵌入维度 */
  dimensions: number;
  /** 最大 Token 数 */
  maxTokens?: number;
}

/**
 * 嵌入向量
 */
export interface EmbeddingVector {
  /** 向量值 */
  values: number[];
  /** 维度 */
  dimensions: number;
  /** 模型信息 */
  model: string;
}

// ==================== 数据库配置 ====================

/**
 * LanceDB 配置
 */
export interface LanceDBConfig {
  /** 数据库路径 */
  databasePath: string;
  /** 表名 */
  tableName: string;
  /** 向量维度 */
  vectorDimensions: number;
}

/**
 * 数据库连接状态
 */
export interface ConnectionStatus {
  /** 是否已连接 */
  connected: boolean;
  /** 最后连接时间 */
  lastConnected?: Date;
  /** 连接错误 */
  error?: string;
}

// ==================== 索配置 ====================

/**
 * 索引配置
 */
export interface IndexConfig {
  /** 索引名称 */
  name: string;
  /** 批量大小 */
  batchSize: number;
  /** 重新索引阈值（天数） */
  reindexThresholdDays: number;
  /** 是否启用增量索引 */
  enableIncrementalIndexing: boolean;
}

/**
 * 索引状态
 */
export interface IndexStatus {
  /** 已索引数量 */
  indexedCount: number;
  /** 最后索引时间 */
  lastIndexed?: Date;
  /** 索引中数量 */
  indexingCount: number;
  /** 待索引数量 */
  pendingCount: number;
}

// ==================== 检索配置 ====================

/**
 * 检索配置
 */
export interface RetrievalConfig {
  /** 最大返回数量 */
  maxResults: number;
  /** 最小分数阈值 */
  minScore: number;
  /** 相似度阈值 */
  similarityThreshold: number;
  /** 启用过滤 */
  enableFiltering: boolean;
  /** 过滤条件 */
  filters?: RetrievalFilter[];
}

/**
 * 检索过滤条件
 */
export interface RetrievalFilter {
  /** 字段名 */
  field: string;
  /** 操作符 */
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'in';
  /** 值 */
  value: unknown;
}

// ==================== 服务状态 ====================

/**
 * 服务状态
 */
export interface ServiceStatus {
  /** 数据库连接状态 */
  databaseStatus: ConnectionStatus;
  /** 索引状态 */
  indexStatus: IndexStatus;
  /** 已就绪 */
  ready: boolean;
  /** 健康状态 */
  healthy: boolean;
}
```

---

## 5. 接口定义

### 5.1 ToolRetrievalService 接口

```typescript
/**
 * ToolRetrievalService 主接口
 */
export interface IToolRetrievalService {
  /**
   * 初始化服务
   */
  initialize(): Promise<void>;

  /**
   * 查找相关技能
   * @param query 查询文本
   * @param limit 返回数量限制
   * @param threshold 分数阈值
   * @returns 检索结果数组
   */
  findRelevantSkills(
    query: string,
    limit?: number,
    threshold?: number
  ): Promise<ToolRetrievalResult[]>;

  /**
   * 索引技能
   * @param skill 技能数据
   */
  indexSkill(skill: SkillData): Promise<void>;

  /**
   * 移除技能索引
   * @param skillId 技能 ID
   */
  removeSkill(skillId: string): Promise<void>;

  /**
   * 扫描并索引所有技能
   * @param skillsDir 技能目录路径
   */
  scanAndIndexAllSkills(skillsDir?: string): Promise<void>;

  /**
   * 获取服务状态
   * @returns 服务状态
   */
  getStatus(): ServiceStatus;
}
```

### 5.2 LanceDBConnection 接口

```typescript
/**
 * LanceDB 连接接口
 */
export interface ILanceDBConnection {
  /**
   * 连接数据库
   * @param config 数据库配置
   */
  connect(config: LanceDBConfig): Promise<void>;

  /**
   * 断开连接
   */
  disconnect(): Promise<void>;

  /**
   * 初始化表
   */
  initializeTable(): Promise<void>;

  /**
   * 获取表实例
   * @returns 表实例
   */
  getTable(): Promise<unknown>;

  /**
   * 检查 Schema 兼容性
   * @returns 是否兼容
   */
  checkSchemaCompatibility(): Promise<boolean>;

  /**
   * 获取连接状态
   * @returns 连接状态
   */
  getStatus(): ConnectionStatus;
}
```

### 5.3 EmbeddingGenerator 接口

```typescript
/**
 * 嵌入生成器接口
 */
export interface IEmbeddingGenerator {
  /**
   * 生成技能嵌入
   * @param skill 技能数据
   * @returns 嵌入向量
   */
  generateForSkill(skill: SkillData): Promise<EmbeddingVector>;

  /**
   * 生成工具嵌入
   * @param tool MCP 工具
   * @returns 嵌入向量
   */
  generateForTool(tool: MCPTool): Promise<EmbeddingVector>;

  /**
   * 生成文本嵌入
   * @param text 文本内容
   * @returns 嵌入向量
   */
  generateForText(text: string): Promise<EmbeddingVector>;

  /**
   * 批量生成嵌入
   * @param texts 文本数组
   * @returns 嵌入向量数组
   */
  generateBatch(texts: string[]): Promise<EmbeddingVector[]>;

  /**
   * 获取配置
   * @returns 嵌入配置
   */
  getConfig(): EmbeddingConfig;
}
```

### 5.4 SkillIndexer 接口

```typescript
/**
 * 技能索引器接口
 */
export interface ISkillIndexer {
  /**
   * 添加技能索引
   * @param skill 技能数据
   */
  addSkill(skill: SkillData): Promise<void>;

  /**
   * 移除技能索引
   * @param skillId 技能 ID
   */
  removeSkill(skillId: string): Promise<void>;

  /**
   * 更新技能索引
   * @param skill 技能数据
   */
  updateSkill(skill: SkillData): Promise<void>;

  /**
   * 批量添加技能
   * @param skills 技能数据数组
   */
  addSkillsBatch(skills: SkillData[]): Promise<void>;

  /**
   * 扫描目录并索引
   * @param dirPath 目录路径
   * @returns 索引的技能数量
   */
  scanAndIndex(dirPath: string): Promise<number>;

  /**
   * 检查是否需要重新索引
   * @param skill 技能数据
   * @returns 是否需要重新索引
   */
  checkReindexRequired(skill: SkillData): Promise<boolean>;

  /**
   * 读取技能元数据
   * @param filePath 文件路径
   * @returns 技能数据
   */
  readSkillMetadata(filePath: string): Promise<SkillData | null>;
}
```

### 5.5 SearchEngine 接口

```typescript
/**
 * 搜索引擎接口
 */
export interface ISearchEngine {
  /**
   * 搜索相关技能
   * @param query 查询文本
   * @param limit 返回数量限制
   * @param minScore 最小分数阈值
   * @returns 检索结果数组
   */
  search(
    query: string,
    limit?: number,
    minScore?: number
  ): Promise<ToolRetrievalResult[]>;

  /**
   * 格式化搜索结果
   * @param results 原始结果
   * @returns 格式化后的结果
   */
  formatResults(results: unknown[]): ToolRetrievalResult[];

  /**
   * 应用过滤条件
   * @param results 搜索结果
   * @param filters 过滤条件
   * @returns 过滤后的结果
   */
  applyFilters(
    results: ToolRetrievalResult[],
    filters: RetrievalFilter[]
  ): ToolRetrievalResult[];

  /**
   * 排序结果
   * @param results 搜索结果
   * @param options 排序选项
   * @returns 排序后的结果
   */
  sortResults(
    results: ToolRetrievalResult[],
    options: RetrievalSortingOptions
  ): ToolRetrievalResult[];
}
```

### 5.6 MCPToolSupport 接口

```typescript
/**
 * MCP 工具支持接口
 */
export interface IMCPToolSupport {
  /**
   * 索引 MCP 工具
   * @param tools MCP 工具数组
   */
  indexTools(tools: MCPTool[]): Promise<void>;

  /**
   * 为工具生成嵌入
   * @param tool MCP 工具
   * @returns 嵌入向量
   */
  getEmbeddingForTool(tool: MCPTool): Promise<EmbeddingVector>;

  /**
   * 移除工具索引
   * @param toolName 工具名称
   */
  removeTool(toolName: string): Promise<void>;

  /**
   * 搜索 MCP 工具
   * @param query 查询文本
   * @param limit 返回数量限制
   * @returns 工具检索结果数组
   */
  searchTools(
    query: string,
    limit?: number
  ): Promise<MCPToolRetrievalResult[]>;
}
```

---

## 6. 依赖关系

### 6.1 外部依赖

```typescript
// ToolRetrievalService.ts
import { ILanceDBConnection } from './LanceDBConnection';
import { IEmbeddingGenerator } from './EmbeddingGenerator';
import { ISkillIndexer } from './SkillIndexer';
import { ISearchEngine } from './SearchEngine';
import { IMCPToolSupport } from './MCPToolSupport';
import { LLMManager } from '../core/LLMManager';
```

### 6.2 内部依赖图

```
ToolRetrievalService
    |
    +---> LanceDBConnection
    |         |
    |         +---> lancedb (第三方库)
    |
    +---> EmbeddingGenerator
    |         |
    |         +---> LLMManager
    |
    +---> SkillIndexer
    |         |
    |         +---> LanceDBConnection
    |         +---> EmbeddingGenerator
    |
    +---> SearchEngine
    |         |
    |         +---> LanceDBConnection
    |         +---> EmbeddingGenerator
    |
    +---> MCPToolSupport
              |
              +---> EmbeddingGenerator
              +---> LLMManager
```

### 6.3 依赖注入设计

```typescript
/**
 * ToolRetrievalService 构造函数依赖注入
 */
export class ToolRetrievalService implements IToolRetrievalService {
  constructor(
    private readonly connection: ILanceDBConnection,
    private readonly embeddingGenerator: IEmbeddingGenerator,
    private readonly skillIndexer: ISkillIndexer,
    private readonly searchEngine: ISearchEngine,
    private readonly mcpToolSupport: IMCPToolSupport
  ) {}

  async initialize(): Promise<void> {
    // 初始化数据库连接
    await this.connection.connect({
      databasePath: this.getDatabasePath(),
      tableName: 'skills',
      vectorDimensions: 1536,
    });

    // 初始化表结构
    await this.connection.initializeTable();

    // 初始化嵌入生成器
    await this.embeddingGenerator.getConfig();
  }

  async findRelevantSkills(
    query: string,
    limit: number = 10,
    threshold: number = 0.7
  ): Promise<ToolRetrievalResult[]> {
    return this.searchEngine.search(query, limit, threshold);
  }

  async indexSkill(skill: SkillData): Promise<void> {
    // 检查是否需要重新索引
    if (await this.skillIndexer.checkReindexRequired(skill)) {
      await this.skillIndexer.addSkill(skill);
    }
  }

  async removeSkill(skillId: string): Promise<void> {
    await this.skillIndexer.removeSkill(skillId);
  }

  async scanAndIndexAllSkills(skillsDir?: string): Promise<void> {
    const count = await this.skillIndexer.scanAndIndex(
      skillsDir || this.getDefaultSkillsDir()
    );
    console.log(`Indexed ${count} skills`);
  }

  getStatus(): ServiceStatus {
    return {
      databaseStatus: this.connection.getStatus(),
      indexStatus: {
        indexedCount: 0,
        indexingCount: 0,
        pendingCount: 0,
      },
      ready: this.connection.getStatus().connected,
      healthy: this.connection.getStatus().connected,
    };
  }

  // 私有辅助方法
  private getDatabasePath(): string {
    return process.env.LANCEDB_PATH || './data/lancedb';
  }

  private getDefaultSkillsDir(): string {
    return process.env.SKILLS_DIR || './skills';
  }
}
```

---

## 7. 迁移步骤

### 7.1 阶段一：创建类型定义

| 步骤 | 操作 | 预计工时 | 验证标准 |
|------|------|----------|----------|
| 1.1 | 创建 `types.ts` 文件 | 1h | 文件创建成功 |
| 1.2 | 迁移所有类型定义 | 2h | 编译通过 |
| 1.3 | 添加类型别名兼容层 | 1h | 旧类型引用正常 |

### 7.2 阶段二：创建子模块

| 步骤 | 操作 | 预计工时 | 验证标准 |
|------|------|----------|----------|
| 2.1 | 创建 `LanceDBConnection.ts` 并迁移连接方法 | 4h | 数据库连接独立测试 |
| 2.2 | 创建 `EmbeddingGenerator.ts` 并迁移嵌入方法 | 6h | 嵌入生成独立测试 |
| 2.3 | 创建 `SkillIndexer.ts` 并迁移索引方法 | 6h | 技能索引功能测试 |
| 2.4 | 创建 `SearchEngine.ts` 并迁移搜索方法 | 4h | 搜索功能测试 |
| 2.5 | 创建 `MCPToolSupport.ts` 并迁移 MCP 方法 | 4h | MCP 支持功能测试 |

### 7.3 阶段三：重构主服务

| 步骤 | 操作 | 预计工时 | 验证标准 |
|------|------|----------|----------|
| 3.1 | 重构 `ToolRetrievalService.ts` 主服务 | 3h | 不超过 200 行 |
| 3.2 | 实现依赖注入 | 2h | 编译通过 |
| 3.3 | 创建 `index.ts` 统一导出 | 1h | 导出正确 |

### 7.4 阶段四：验证与测试

| 步骤 | 操作 | 预计工时 | 验证标准 |
|------|------|----------|----------|
| 4.1 | 运行现有测试 | 1h | 测试通过 |
| 4.2 | 补充单元测试 | 4h | 覆盖率 80%+ |
| 4.3 | 集成测试验证 | 2h | 功能正常 |

### 7.5 总工时

| 阶段 | 预计工时 |
|------|----------|
| 阶段一：类型定义 | 4h |
| 阶段二：子模块 | 24h |
| 阶段三：主服务 | 6h |
| 阶段四：验证测试 | 7h |
| **合计** | **41h (约 1.5 周)** |

---

## 8. 验收标准

### 8.1 代码质量标准

- [ ] ToolRetrievalService 不超过 200 行
- [ ] LanceDBConnection 不超过 150 行
- [ ] EmbeddingGenerator 不超过 200 行
- [ ] SkillIndexer 不超过 200 行
- [ ] SearchEngine 不超过 200 行
- [ ] MCPToolSupport 不超过 150 行
- [ ] 消除所有 `any` 类型
- [ ] 重复代码率低于 5%

### 8.2 功能验收标准

- [ ] `findRelevantSkills()` API 行为 100% 一致
- [ ] `indexSkill()` API 行为 100% 一致
- [ ] `removeSkill()` API 行为 100% 一致
- [ ] `scanAndIndexAllSkills()` API 行为 100% 一致
- [ ] 数据库连接逻辑独立
- [ ] 嵌入生成可独立替换
- [ ] MCP 支持逻辑独立

### 8.3 测试标准

- [ ] 单元测试覆盖率不低于 80%
- [ ] 数据库连接有独立测试
- [ ] 嵌入生成有独立测试
- [ ] 搜索逻辑有独立测试

### 8.4 兼容性标准

- [ ] 保持公共 API 不变
- [ ] 保持 `ToolRetrievalResult` 类型兼容
- [ ] 保持 `SkillData` 类型兼容
- [ ] TypeScript 编译无错误
- [ ] 现有功能 100% 正常
- [ ] 数据库 Schema 保持向后兼容

---

## 9. 风险与缓解措施

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 向量检索功能中断 | 高 | 中 | 建立功能测试基准 |
| 数据库 Schema 变更 | 中 | 低 | 保持向后兼容 |
| 嵌入模型切换 | 低 | 低 | 抽象嵌入生成接口 |
| MCP 工具索引失效 | 中 | 低 | 独立测试 MCP 支持 |

---

## 10. 附录

### 10.1 术语表

| 术语 | 定义 |
|------|------|
| LanceDB | 高性能嵌入式向量数据库 |
| Embedding | 嵌入向量，将文本转换为数值表示 |
| Skill | 可执行的技能/工具 |
| MCP | Model Context Protocol，模型上下文协议 |

### 10.2 变更记录

| 版本 | 日期 | 作者 | 描述 |
|------|------|------|------|
| 1.0.0 | 2025-12-30 | - | 初始版本 |

---

**文档版本**: 1.0.0
**最后更新**: 2025-12-30
**状态**: 评审通过
