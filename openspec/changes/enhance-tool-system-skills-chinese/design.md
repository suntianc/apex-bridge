# 技术设计：内置工具与Skills外置工具融合架构

## Context

### 技术背景

ApexBridge当前存在严重的工具系统缺陷：
- ReActStrategy中TODO未实现（src/strategies/ReActStrategy.ts:292-311）
- 工具执行逻辑只有示例代码，无法真实执行
- 架构顶层设计缺失，内外置工具边界模糊

### 核心约束

1. **非侵入式**: 保持现有ReAct循环不变，仅增强工具层
2. **安全优先**: 外置工具必须在沙箱中执行
3. **性能敏感**: 高频工具（FileRead等）必须零额外开销
4. **生态兼容**: 支持Claude Code Skills格式，复用社区资源
5. **中文优先**: 默认使用中文Skills和中文交互

### 存储约定

- Skills目录: `data/skills/{skill-name}/`
- 向量数据库: `.data/skills.lance/`
- 向量化标识: `data/skills/{skill-name}/.vectorized`（包含文件大小和修改时间）

## Goals / Non-Goals

### Goals

1. 实现内置工具体系（FileRead, FileWrite, VectorSearch等高频工具）
2. 实现Skills外置工具的向量检索和渐进式加载
3. 实现Skills生命周期完整管理（安装、卸载、修改、列表）
4. 实现Skills沙箱隔离执行（Node子进程，资源受限）
5. 提供Skills管理API（RESTful接口）
6. 支持Claude Code Skills格式（复用生态）

### Non-Goals

1. **不实现Workflow引擎**: 单步骤工具优先，Workflow在后续阶段考虑
2. **不引入重运行时**: 保持Node.js单进程，Skills执行仅限子进程
3. **不实现权限系统**: 简单权限等级（1-3级），但不做复杂RBAC
4. **不实现自动安装**: Skills需手动或API安装，不支持运行时网络下载
5. **不实现分布式执行**: Skills在本地执行，不支持远程调用

## Decisions

### Decision 1: 内置工具直接调用，外置工具沙箱执行

**选择**: 采用双执行器模式（BuiltInExecutor + SkillsSandboxExecutor）

**理由**:
- ✅ 性能最优：内置工具直接调用，零额外开销
- ✅ 安全可靠：外置工具沙箱隔离，保护主进程
- ✅ 架构清晰：明确工具类型边界，便于维护
- ✅ 资源可控：外置工具受限于沙箱规则（时间、输出）

**替代方案**:
- 统一沙箱执行：所有工具都在子进程，内置工具性能下降10-20倍
- 统一直接调用：外置工具无隔离，安全风险极高
- 插件化运行时：引入复杂的插件系统，违背轻量级理念

**实现详述**:
```typescript
// 执行器接口设计
interface ToolExecutor {
  execute(toolName: string, args: Record<string, any>): Promise<any>;
}

// 内置执行器（直接调用）
class BuiltInExecutor implements ToolExecutor {
  private tools = new Map<string, BuiltInTool>();

  async execute(toolName: string, args: any) {
    const tool = this.tools.get(toolName);
    if (!tool) throw new Error(`BuiltIn tool not found: ${toolName}`);

    // 直接调用方法，无序列化/进程开销
    return await tool.execute(args);
  }
}

// Skills沙箱执行器（子进程隔离）
class SkillsSandboxExecutor implements ToolExecutor {
  private options = {
    timeout: 60_000,        // 60秒超时
    maxOutputSize: 10 * 1024 * 1024,  // 10MB输出限制
  };

  async execute(skillName: string, args: any) {
    // 1. 定位Skill目录
    const skillPath = path.join('data/skills', skillName);
    const scriptPath = path.join(skillPath, 'scripts/execute.js');

    // 2. 创建临时工作区
    const workspace = await this.createWorkspace();

    // 3. Spawn子进程
    const proc = spawn('node', [scriptPath, JSON.stringify(args)], {
      cwd: workspace,
      env: { PATH: process.env.PATH },  // 仅继承PATH
      stdio: 'pipe',
    });

    // 4. 监控执行
    const result = await this.monitorExecution(proc);

    // 5. 清理
    await this.cleanup(workspace);

    return result;
  }

  private async monitorExecution(proc: ChildProcess): Promise<SkillResult> {
    const chunks: Buffer[] = [];
    let outputSize = 0;

    // 超时计时器
    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
    }, this.options.timeout);

    // 输出大小监控
    proc.stdout?.on('data', (chunk: Buffer) => {
      outputSize += chunk.length;
      if (outputSize > this.options.maxOutputSize) {
        proc.kill('SIGKILL');
      }
      chunks.push(chunk);
    });

    return new Promise((resolve, reject) => {
      proc.on('close', (code) => {
        clearTimeout(timeout);
        const stdout = Buffer.concat(chunks).toString('utf-8');

        resolve({
          success: code === 0,
          stdout,
          exitCode: code,
          duration: Date.now() - startTime,
        });
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }
}
```

### Decision 2: Skills向量检索基于名称+描述

**选择**: 对Skills整体（而非单个工具函数）进行向量化

**理由**:
- ✅ 契合渐进式披露：先发现Skill，再加载其内部工具
- ✅ 向量数量可控：100个Skills = 100个向量，而非1000个工具函数
- ✅ 语义完整：Skill名称+描述提供完整上下文
- ✅ 加载优化：只需检索一次，获取整个Skill包

**Skill向量生成示例**:
```typescript
// SKILL.md示例
---
name: git-commit
description: 自动分析Git改动并生成conventional commit信息，支持emoji和scope
tags: [git, commit, versioning]
---

执行流程:
1. 运行git status查看改动
2. 分析改动类型（feat/fix/docs等）
3. 自动生成commit message
4. 可选：运行git hooks
```

**向量化内容**:
```typescript
const vectorInput = `
名称: git-commit
描述: 自动分析Git改动并生成conventional commit信息，支持emoji和scope
标签: git, commit, versioning
执行流程: 运行git status查看改动，分析改动类型，自动生成commit message
`;

// 生成384维向量
const embedding = await generateEmbedding(vectorInput);
```

**检索示例**:
```
用户查询: "我想提交代码，帮我生成commit信息"

向量相似度计算:
- git-commit: 0.87 (高)
- file-read: 0.12 (低)
- http-request: 0.08 (低)

返回: [git-commit] (Top 1)
```

### Decision 3: Skills启动时扫描向量化

**选择**: 系统启动时批量扫描Skills目录，完成向量化索引

**理由**:
- ✅ 运行时性能：启动时一次性处理，避免运行时I/O阻塞
- ✅ 一致性保证：启动后向量与文件系统状态一致
- ✅ 增量更新：通过.vectorized标识实现增量索引
- ✅ 启动验证：及早发现损坏或无效的Skills

**启动流程**:
```typescript
class SkillIndexingService {
  async onApplicationBootstrap() {
    const skillsDir = 'data/skills';
    const skillDirs = await fs.readdir(skillsDir);

    for (const dir of skillDirs) {
      const skillPath = path.join(skillsDir, dir);
      const vectorizedPath = path.join(skillPath, '.vectorized');

      // 检查是否已向量化
      const needsIndexing = await this.checkNeedsIndexing(skillPath, vectorizedPath);

      if (needsIndexing) {
        await this.indexSkill(skillPath);
      }
    }

    logger.info(`✅ Indexed ${indexedCount} skills, reused ${reusedCount}`);
  }

  private async checkNeedsIndexing(skillPath: string, vectorizedPath: string): Promise<boolean> {
    try {
      // 1. 检查.vectorized文件是否存在
      const stats = await fs.stat(vectorizedPath);

      // 2. 检查SKILL.md修改时间
      const skillMdStats = await fs.stat(path.join(skillPath, 'SKILL.md'));

      // 3. 如果SKILL.md修改时间 > .vectorized时间，需要重新索引
      return skillMdStats.mtime > stats.mtime;
    } catch {
      // .vectorized不存在，需要索引
      return true;
    }
  }

  private async indexSkill(skillPath: string) {
    // 1. 读取SKILL.md
    const skillMd = await fs.readFile(path.join(skillPath, 'SKILL.md'), 'utf-8');
    const metadata = this.parseYamlFrontmatter(skillMd);

    // 2. 生成向量
    const vector = await this.generateVector(metadata);

    // 3. 存储到LanceDB
    await this.toolRetrievalService.indexSkill({
      name: metadata.name,
      description: metadata.description,
      tags: metadata.tags,
      vector,
      path: skillPath,
    });

    // 4. 创建.vectorized标识文件
    const skillSize = await this.calculateDirSize(skillPath);
    await fs.writeFile(
      path.join(skillPath, '.vectorized'),
      JSON.stringify({
        indexedAt: Date.now(),
        skillSize,
        hash: this.calculateHash(skillMd),
      })
    );
  }
}
```

### Decision 4: Skills压缩包结构规范

**选择**: 严格遵循Claude Code Skills格式，支持ZIP安装

**理由**:
- ✅ 生态兼容：复用Claude Code社区Skills
- ✅ 结构清晰：明确的文件组织方式
- ✅ 标准化：降低用户学习成本
- ✅ 工具链成熟：现有打包、发布工具可用

**规范定义**（来自tool系统重构方案.md）:
```
skill-name/
├── SKILL.md              # 核心指令文件（必需）
│   └── YAML Frontmatter:
│       - name: skill-name
│       - description: 功能描述
│       - version: 1.0.0
│       - allowed-tools: [Read, Write, Glob]
├── reference.md          # 参考文档（可选）
├── examples.md           # 示例说明（可选）
├── scripts/              # 可执行脚本（可选）
│   └── execute.js        # 入口文件（必需，如果需要执行）
└── resources/            # 资源文件（可选）
    └── template.xlsx
```

**安装流程**:
```typescript
class SkillManager {
  async installSkill(zipBuffer: Buffer, options?: { overwrite?: boolean }) {
    // 1. 解压ZIP到临时目录
    const tempDir = await this.unzipToTemp(zipBuffer);

    // 2. 验证结构
    const validation = await this.validateStructure(tempDir);
    if (!validation.valid) {
      throw new Error(`Invalid skill structure: ${validation.errors.join(', ')}`);
    }

    // 3. 提取元数据
    const metadata = await this.extractMetadata(tempDir);

    // 4. 检查是否已存在
    const targetPath = path.join('data/skills', metadata.name);
    const exists = await fs.pathExists(targetPath);

    if (exists && !options?.overwrite) {
      throw new Error(`Skill ${metadata.name} already exists. Use overwrite:true to replace.`);
    }

    // 5. 移动到正式目录
    await fs.move(tempDir, targetPath, { overwrite: true });

    // 6. 向量化
    await this.indexingService.indexSkill(targetPath);

    // 7. 注册到可用列表
    await this.registerSkill(metadata);

    return { success: true, name: metadata.name };
  }

  private async validateStructure(dir: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const files = await fs.readdir(dir);

    // 检查SKILL.md是否存在
    if (!files.includes('SKILL.md')) {
      errors.push('Missing SKILL.md');
    } else {
      // 验证YAML Frontmatter
      const content = await fs.readFile(path.join(dir, 'SKILL.md'), 'utf-8');
      try {
        this.parseYamlFrontmatter(content);
      } catch (e) {
        errors.push('Invalid YAML Frontmatter in SKILL.md');
      }
    }

    // 如果有scripts，检查是否有execute.js
    const hasScripts = await fs.pathExists(path.join(dir, 'scripts'));
    if (hasScripts) {
      const scriptsExist = await fs.pathExists(path.join(dir, 'scripts/execute.js'));
      if (!scriptsExist) {
        errors.push('scripts directory exists but execute.js missing');
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
```

### Decision 5: Skills执行安全策略

**选择**: 多层安全防护（沙箱 + 资源限制 + 环境隔离）

**理由**:
- ✅ 纵深防御：多层防护避免单点失效
- ✅ 资源保护：防止恶意或错误Skills耗尽资源
- ✅ 数据隔离：Skills无法访问主进程数据
- ✅ 可追溯：完整的执行日志和审计

**安全策略矩阵**:

| 防护层 | 实现方式 | 限制 |
|--------|---------|------|
| **进程隔离** | Node.js child_process.spawn | 独立进程空间 |
| **执行超时** | setTimeout + SIGKILL | 60秒强制终止 |
| **输出限制** | Stream size monitoring | 10MB输出上限 |
| **环境隔离** | 仅继承PATH | 清理NODE_OPTIONS等 |
| **文件系统** | 工作区隔离 | 限制/只允许工作区 |
| **网络访问** | 默认允许（受控） | 记录所有网络请求 |
| **内存限制** | Node.js --max-old-space-size | 512MB堆内存 |

**实现**:
```typescript
class SkillsSandboxExecutor {
  private readonly DEFAULT_OPTIONS = {
    timeout: 60_000,                    // 60秒
    maxOutputSize: 10 * 1024 * 1024,    // 10MB
    maxMemory: 512 * 1024 * 1024,       // 512MB
    allowedEnvironment: ['PATH'],        // 仅允许PATH
  };

  async execute(skillName: string, args: any, options?: Partial<ExecutionOptions>) {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const skillPath = path.join('data/skills', skillName);
    const scriptPath = path.join(skillPath, 'scripts/execute.js');

    // 1. 创建隔离工作区
    const workspace = await this.createIsolatedWorkspace(skillPath);

    // 2. 构建安全环境变量
    const env: Record<string, string> = {};
    for (const key of opts.allowedEnvironment) {
      if (process.env[key]) {
        env[key] = process.env[key];
      }
    }

    // 3. Spawn限制子进程
    const proc = spawn('node', [
      `--max-old-space-size=${Math.floor(opts.maxMemory / 1024 / 1024)}`,
      scriptPath,
      JSON.stringify(args)
    ], {
      cwd: workspace,
      env,
      stdio: 'pipe',
    });

    // 4. 资源监控
    const monitors = this.setupResourceMonitors(proc, opts);

    try {
      // 5. 执行并等待
      const result = await this.waitForCompletion(proc, monitors);
      return result;
    } finally {
      // 6. 清理
      this.cleanup(proc, workspace, monitors);
    }
  }

  private setupResourceMonitors(proc: ChildProcess, options: ExecutionOptions) {
    const monitors: ResourceMonitors = {
      timeout: null,
      outputSize: 0,
    };

    // 超时监控
    monitors.timeout = setTimeout(() => {
      proc.kill('SIGKILL');
    }, options.timeout);

    // 输出大小监控
    proc.stdout?.on('data', (chunk: Buffer) => {
      monitors.outputSize += chunk.length;
      if (monitors.outputSize > options.maxOutputSize!) {
        proc.kill('SIGKILL');
      }
    });

    return monitors;
  }
}
```

### Decision 6: Embedding模型配置管理

**选择**: 复用LLMConfigService统一管理Embedding模型配置（本地/外部API）

**理由**:
- ✅ 架构统一：与LLM模型管理保持一致性
- ✅ 配置灵活：支持本地模型（all-MiniLM-L6-v2）和外部API（OpenAI嵌入）
- ✅ 运行时切换：通过数据库配置实现，无需重启服务
- ✅ 资源优化：统一连接池和连接管理

**模型类型扩展**:
```typescript
// src/types/llm-models.ts
export enum LLMModelType {
  NLP = 'nlp',
  EMBEDDING = 'embedding',  // 用于向量生成
  RERANK = 'rerank'         // 用于结果重排（未来）
}
```

**SQLite配置示例**:
```typescript
// 本地Embedding模型配置（默认）
LLMConfigService.createModel(providerId, {
  modelKey: 'all-MiniLM-L6-v2',
  modelName: '句向量-本地-384维/量化',
  modelType: LLMModelType.EMBEDDING,
  modelConfig: {
    modelPath: './models/embedding/all-MiniLM-L6-v2',  // 本地模型路径
    dimensions: 384,
    local: true
  },
  isDefault: true,
  enabled: true
});

// OpenAI Embedding API配置（外部）
LLMConfigService.createModel(providerId, {
  modelKey: 'text-embedding-3-small',
  modelName: 'OpenAI文本嵌入-small-512维',
  modelType: LLMModelType.EMBEDDING,
  modelConfig: {
    apiEndpoint: '/embeddings',  // 相对路径
    dimensions: 512,
    local: false,
    timeout: 10000
  },
  isDefault: false,
  enabled: true
});
```

**配置灵活性**:
```typescript
interface EmbeddingModelConfig {
  // 通用配置
  dimensions: number;           // 向量维度（384, 512, 768, 1024, 1536）
  maxInputLength?: number;      // 最大输入长度（默认512 tokens）

  // 本地模型配置
  modelPath?: string;           // 本地.ONNX模型路径
  quantized?: boolean;          // 是否使用量化（性能优化）

  // 外部API配置
  apiEndpoint?: string;         // API endpoint（相对于provider.baseURL）
  apiKey?: string;              // API密钥（从provider.baseConfig继承）
  timeout?: number;             // 超时时间（默认30秒）
  rateLimit?: number;           // 速率限制（queries/minute）

  // 缓存配置
  cacheEnabled?: boolean;       // 是否启用缓存（默认true）
  cacheSize?: number;           // 缓存大小（默认1000条目）
  cacheTTL?: number;            // 缓存TTL（默认5分钟，单位ms）
}
```

**ToolRetrievalService集成**:
```typescript
class ToolRetrievalService {
  private embeddingModel: LLMModelFull | null = null;

  async initialize(): Promise<void> {
    // 1. 初始化LanceDB（原有逻辑）

  // 2. 获取Embedding模型配置
  const llmConfig = LLMConfigService.getInstance();
    this.embeddingModel = llmConfig.getDefaultModel(LLMModelType.EMBEDDING);

    if (!this.embeddingModel) {
  logger.warn('⚠️ No embedding model configured, using fallback to all-MiniLM-L6-v2');
      // 降级到本地模型
      await this.loadLocalEmbeddingModel('all-MiniLM-L6-v2');
    }
  }

  async getEmbedding(text: string): Promise<number[]> {
    // 检查缓存
    const cached = this.embeddingCache.get(text);
    if (cached) {
      return cached;
    }

    // 根据模型配置选择生成方式
  if (this.embeddingModel?.modelConfig.local) {
      // 本地模型：使用transformers.js
      return await this.generateLocalEmbedding(text);
    } else {
      // 外部API：调用LLM适配器
  return await this.generateApiEmbedding(text);
    }
  }

  private async generateApiEmbedding(text: string): Promise<number[]> {
    const model = this.embeddingModel!;
    const config = model.modelConfig;

    // 调用LLMManager的适配器
    const llmManager = LLMManager.getInstance();
    const response = await llmManager.generateEmbedding({
      model: model.modelKey,
      input: text,
      dimensions: config.dimensions,
    }, {
  timeout: config.timeout || 30000,
      providerId: model.providerId
    });

    const embedding = response.embedding;

  // 存储到缓存
    this.embeddingCache.set(text, embedding);

    return embedding;
  }
}
```

**配置切换**:
```typescript
// 运行时切换Embedding模型（无需重启）
const llmConfig = LLMConfigService.getInstance();

// 方式1: 更新现有模型为默认
llmConfig.updateModel(modelId, { isDefault: true });

// 方式2: 创建新的Embedding模型并设为默认
llmConfig.createModel(providerId, {
  modelKey: 'text-embedding-3-small',
  modelName: 'OpenAI文本嵌入-新版',
  modelType: LLMModelType.EMBEDDING,
  modelConfig: { ... },
  isDefault: true
});
```

**配置管理API**:
```typescript
// 添加Embedding模型管理端点
POST /api/llm/models                   // 创建Embedding模型配置
PUT /api/llm/models/:id               // 更新配置
GET /api/llm/models?type=embedding    // 查询Embedding模型列表
GET /api/llm/models/:id               // 获取单个模型配置
DELETE /api/llm/models/:id            // 删除配置
```

**适配器架构扩展**:
```typescript
// 扩展ILLMAdapter接口
export interface ILLMAdapter {
  chat(messages: Message[], options: ChatOptions, signal?: AbortSignal): Promise<LLMResponse>;
  streamChat(messages: Message[], options: ChatOptions, signal?: AbortSignal): AsyncIterableIterator<string>;
  getModels(): Promise<string[]>;
  embed(texts: string[], model?: string): Promise<number[][]>;  // 新增
}

// BaseAdapter提供默认实现（OpenAI兼容）
export abstract class BaseOpenAICompatibleAdapter implements ILLMAdapter {
  async embed(texts: string[], model?: string): Promise<number[][]> {
    const response = await this.client.post('/embeddings', {
      input: texts,
      model: model || this.config.defaultModel,
      encoding_format: 'float'
    });
    return response.data.data.map((item: any) => item.embedding);
  }
}

// 本地Embedding适配器（使用transformers.js）
export class LocalEmbeddingAdapter implements ILLMAdapter {
  private model: any;

  async loadModel(modelPath: string) {
    const { pipeline } = await import('@xenova/transformers');
    this.model = await pipeline('feature-extraction', modelPath);
  }

  async embed(texts: string[]): Promise<number[][]> {
    const outputs = await this.model(texts);
    return outputs.map((output: any) => output.tolist());
  }
}
```

**迁移路径**（向后兼容）:
```typescript
// 如果未在SQLite中配置Embedding模型，使用默认本地模型
async function ensureDefaultEmbeddingModel(): Promise<void> {
  const llmConfig = LLMConfigService.getInstance();
  const defaultEmbedding = llmConfig.getDefaultModel(LLMModelType.EMBEDDING);

  if (!defaultEmbedding) {
    logger.info('🔄 Creating default embedding model configuration...');

    // 创建默认提供商（如果还不存在）
    const localProvider = llmConfig.getProviderByKey('local') ||
      llmConfig.createProvider({
        provider: 'local',
    name: '本地模型',
        description: '本地运行的Embedding模型',
        baseConfig: {
          baseURL: 'file://./models'
        },
        enabled: true
      });

    // 创建默认Embedding模型（all-MiniLM-L6-v2）
    llmConfig.createModel(localProvider.id, {
      modelKey: 'all-MiniLM-L6-v2',
      modelName: '句向量-本地-384维',
      modelType: LLMModelType.EMBEDDING,
  modelConfig: {
        local: true,
        modelPath: './models/embedding/all-MiniLM-L6-v2',
        dimensions: 384,
        quantized: true
  },
      isDefault: true,
      enabled: true
    });

    logger.info('✅ Default embedding model configuration created');
  }
}
```

**理由详解** (与现有架构的契合):

1. **架构一致性**: 复用LLMConfigService的模式
   - 提供商 (Provider): 区分本地(local)和外部API（openai, azure, siliconflow等）
   - 模型 (Model): Embedding模型的具体配置
   - 默认模型: 通过isDefault标记，避免硬编码

2. **运维友好**:
   - 所有模型配置在SQLite中，可备份和迁移
   - 通过管理API或直接在数据库中修改配置
   - 支持A/B测试：可并行配置多个Embedding模型，运行时切换

3. **成本优化**:
   - 开发环境：使用本地模型（免费）
   - 生产环境：可切换为外部API（付费但质量更高）
   - 混合模式：高频查询用本地缓存，长尾查询用外部API

4. **未来扩展**:
   - 支持Rerank模型（搜索结果重排）
   - 支持Multi-modal Embedding（图像、音频）
   - 支持自定义Embedding微调模型

## Risks / Trade-offs

### Risk 1: Skills执行性能开销

**风险**: Skills在子进程中执行，比内置工具慢10-20倍

**概率**: 高
**影响**: 中

**缓解措施**:
1. 明确性能预期（文档中说明：内置工具1-5ms，Skills 50-200ms）
2. 高频工具内置化（FileRead, FileWrite等不放在Skills中）
3. 提供执行时间监控，识别慢Skills
4. 缓存Skills执行结果（如果幂等）

**量化指标**:
- Skills执行P99延迟 < 500ms
- 内置工具执行P99延迟 < 10ms
- Skills调用占比 < 30%（大多数场景用内置工具）
    maxOutputSize: 10 * 1024 * 1024,    // 10MB
    maxMemory: 512 * 1024 * 1024,       // 512MB
    allowedEnvironment: ['PATH'],        // 仅允许PATH
  };

  async execute(skillName: string, args: any, options?: Partial<ExecutionOptions>) {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const skillPath = path.join('data/skills', skillName);
    const scriptPath = path.join(skillPath, 'scripts/execute.js');

    // 1. 创建隔离工作区
    const workspace = await this.createIsolatedWorkspace(skillPath);

    // 2. 构建安全环境变量
    const env: Record<string, string> = {};
    for (const key of opts.allowedEnvironment) {
      if (process.env[key]) {
        env[key] = process.env[key];
      }
    }

    // 3. Spawn限制子进程
    const proc = spawn('node', [
      `--max-old-space-size=${Math.floor(opts.maxMemory / 1024 / 1024)}`,
      scriptPath,
      JSON.stringify(args)
    ], {
      cwd: workspace,
      env,
      stdio: 'pipe',
    });

    // 4. 资源监控
    const monitors = this.setupResourceMonitors(proc, opts);

    try {
      // 5. 执行并等待
      const result = await this.waitForCompletion(proc, monitors);
      return result;
    } finally {
      // 6. 清理
      this.cleanup(proc, workspace, monitors);
    }
  }

  private setupResourceMonitors(proc: ChildProcess, options: ExecutionOptions) {
    const monitors: ResourceMonitors = {
      timeout: null,
      outputSize: 0,
    };

    // 超时监控
    monitors.timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      monitors.timeoutTriggered = true;
    }, options.timeout);

    // 输出大小监控
    proc.stdout?.on('data', (chunk: Buffer) => {
      monitors.outputSize += chunk.length;
      if (monitors.outputSize > options.maxOutputSize!) {
        proc.kill('SIGKILL');
        monitors.outputLimitTriggered = true;
      }
    });

    return monitors;
  }
}
```

## Risks / Trade-offs

### Risk 1: Skills执行性能开销

**风险**: Skills在子进程中执行，比内置工具慢10-20倍

**概率**: 高
**影响**: 中

**缓解措施**:
1. 明确性能预期（文档中说明：内置工具1-5ms，Skills 50-200ms）
2. 高频工具内置化（FileRead, FileWrite等不放在Skills中）
3. 提供执行时间监控，识别慢Skills
4. 缓存Skills执行结果（如果幂等）

**量化指标**:
- Skills执行P99延迟 < 500ms
- 内置工具执行P99延迟 < 10ms
- Skills调用占比 < 30%（大多数场景用内置工具）

### Risk 2: 向量检索准确性不足

**风险**: Skills检索返回不相关的结果，LLM无法获取正确工具

**概率**: 中
**影响**: 高

**缓解措施**:
1. 人工审查Skills描述的清晰度和完整性
2. 提供检索准确率监控（多少查询返回了用户手动指定的工具）
3. 实现混合检索：向量检索 + 关键词检索
4. 提供调试模式：显示检索结果和相似度分数

**阈值设置**:
- 相似度阈值: 0.6（低于此值不返回）
- Top-K: 5-10（返回最多10个Skills）
- 准确率目标: >70%（用户手动选择的结果在检索结果中）

### Risk 3: Skills安全风险

**风险**: 恶意Skills利用子进程逃逸，危害主系统

**概率**: 低
**影响**: 极高

**缓解措施**:
1. 代码审查：Skills安装前人工审查（生产环境）
2. 签名验证：受信任来源的Skills（未来可考虑）
3. 最小权限：仅继承PATH，其他环境变量全部清理
4. 资源限制：60秒超时 + 10MB输出 + 512MB内存
5. 审计日志：所有Skills执行记录（谁、何时、什么、结果）
6. 禁用危险API：在子进程中禁用child_process, fs原生模块（提供安全封装）

**安全审计清单**:
- [ ] 不允许require('child_process')
- [ ] 不允许require('fs')直接访问（提供安全封装）
- [ ] 不允许eval()和Function()
- [ ] 网络访问需白名单（生产环境）

### Risk 4: Skills管理复杂度

**风险**: Skills安装、卸载、版本管理引入运维复杂度

**概率**: 中
**影响**: 中

**缓解措施**:
1. 自动化测试：安装/卸载流程CI测试
2. 版本管理：.vectorized文件包含版本信息
3. 依赖管理：SKILL.md声明allowed-tools（限制可用Claude Code工具）
4. 清理机制：卸载时彻底删除（文件 + 向量 + 元数据）
5. 管理UI：提供API和CLI工具，简化操作

**版本策略**:
- Skills版本: 语义化版本（v1.0.0）
- API版本: v1（初始版本）
- 向量版本: 1（向量算法变更时递增）

### Risk 5: 兼容性和迁移成本

**风险**: 现有项目迁移到新架构成本高

**概率**: 低
**影响**: 中

**缓解措施**:
1. 向后兼容：现有工具调用方式不变
2. 迁移指南：详细的迁移文档和脚本
3. 渐进迁移：支持旧架构和新架构并存
4. 兼容性层：translateLegacyTool()适配器

**迁移工具**:
```bash
# 自动迁移脚本
apex-tools migrate --source old-tools.json --target data/skills/

# 验证迁移
apex-tools validate-skills --directory data/skills/
```

## Migration Plan

### Phase 1: 环境准备（并行）

**时长**: 1天
**服务中断**: 无

- [ ] 安装LanceDB依赖
  ```bash
  npm install vectordb @xenova/transformers
  ```
- [ ] 创建目录结构
  ```bash
  mkdir -p data/skills          # Skills存储
  mkdir -p .data/skills.lance   # 向量数据库
  mkdir -p config/skills        # 配置
  ```
- [ ] 准备示例Skills（3-5个测试用）
  ```bash
  data/skills/
  ├── file-read/          # 文件读取（内置+Skills双版本）
  ├── git-commit/         # Git提交
  └── http-request/       # HTTP请求
  ```

### Phase 2: 核心服务实现（并行）

**时长**: 4天
**服务中断**: 无

- [ ] 第1天: BuiltInExecutor + 工具基础类
- [ ] 第2天: BuiltInToolsRegistry（FileRead, FileWrite, VectorSearch）
- [ ] 第3天: ToolRetrievalService + Skills向量化
- [ ] 第4天: SkillsSandboxExecutor（沙箱执行+安全策略）

### Phase 3: Skills管理器（并行）

**时长**: 2天
**服务中断**: 无

- [ ] 第1天: SkillManager（安装、卸载、列表）
- [ ] 第2天: 修改功能 + 向量化标识管理

### Phase 4: API和控制器（并行）

**时长**: 1天
**服务中断**: 无

- [ ] 第1天: SkillController（REST API）
  ```
  POST   /api/skills/install    # 安装
  DELETE /api/skills/:name      # 卸载
  GET    /api/skills            # 列表
  PUT    /api/skills/:name      # 修改（描述）
  ```

### Phase 5: 策略层集成（关键）

**时长**: 1天
**服务中断**: 无（需充分测试）

- [ ] 重构ReActStrategy（100行变更）
- [ ] 集成ToolRetrievalService（运行时检索）
- [ ] 集成双执行器（内置优先，外置备选）

### Phase 6: 测试和验证（并行）

**时长**: 2天
**服务中断**: 无

- [ ] 单元测试（所有核心服务）
- [ ] 集成测试（端到端工具调用）
- [ ] 性能测试（内置工具 < 10ms, Skills < 500ms）
- [ ] 安全测试（沙箱逃逸、资源限制）
- [ ] 手动验收（3个典型场景）

### Phase 7: 文档和发布（并行）

**时长**: 1天
**服务中断**: 10分钟（部署重启）

- [ ] 更新CLAUDE.md（架构文档）
- [ ] 编写Skills开发指南
- [ ] 编写API文档（OpenAPI）
- [ ] 部署到预发布环境
- [ ] 生产环境灰度发布（10% → 50% → 100%）

### Phase 8: 监控和优化（持续）

**时长**: 持续
**服务中断**: 无

- [ ] 添加Metrics指标
  ```yaml
  metrics:
    tool_execution_total: Counter    # 工具执行总数
    tool_execution_duration: Histogram # 执行耗时
    skill_vector_search_duration: Histogram  # 检索耗时
    skill_install_total: Counter     # Skills安装数
  ```
- [ ] 配置告警
- [ ] 收集用户反馈
- [ ] 优化检索准确率

## Rollback Plan

### 紧急回滚（问题严重时）

**步骤**:
1. 禁用新功能（配置开关）
```yaml
skills:
  enabled: false    # 禁用Skills
  retrieval:
    enabled: false  # 禁用向量检索
```

2. 回退到旧架构（如果已部署）
```bash
git revert HEAD    # 回退最后一次提交
npm run deploy     # 重新部署
```

3. 数据清理（如果需要）
```bash
# 保留Skills但不使用
mv data/skills data/skills.backup
cp -r backup/skills data/skills
```

### 渐进迁移（推荐）

1. **Feature Flag**: 使用配置控制新旧架构
2. **A/B测试**: 10%流量走新架构，90%走旧架构
3. **监控指标**: 对比成功率、延迟、错误率
4. **逐步放大**: 新架构稳定后，逐步增加流量比例

**配置示例**:
```yaml
skills:
  enabled: true
  rollout:
    percentage: 10  # 10%流量使用新架构
    users:
      - test-user-1
      - test-user-2
```

### 服务降级

如果Skills系统故障：

1. **检索服务故障**: 降级为手动指定Skills
   ```typescript
   const skills = skillRetrievalService.isHealthy()
     ? await skillRetrievalService.findRelevantSkills(query)
     : manuallySpecifiedSkills;
   ```

2. **沙箱执行器故障**: 降级为禁用外置工具
   ```typescript
   const executor = skillSandboxExecutor.isHealthy()
     ? skillSandboxExecutor
     : new DisabledExecutor();  // 仅执行内置工具
   ```

3. **查询用户确认**: 如果工具无法执行，询问用户是否重试
   ```
   暂时无法执行Skills，建议：
   [重试] [仅使用内置工具] [取消]
   ```

## Open Questions

1. **Skill热更新**: 是否需要运行时加载/卸载，还是必须重启服务？
   - 方案A（推荐）: 服务重启时扫描，简单可靠
   - 方案B: 运行时监听文件变化，复杂但灵活

2. **Skills版本管理**: 是否需要支持多版本并存？
   - 方案A（推荐）: 单版本，卸载重装即升级
   - 方案B: 多版本并存，调用时指定版本

3. **Skills依赖网络**: 是否允许Skills访问外部API？
   - 方案A（推荐）: 允许，但需审计和记录
   - 方案B: 生产环境禁止，需白名单配置

4. **Skills共享**: 是否提供Skills市场或共享机制？
   - 当前方案: 手动打包分享（ZIP文件）
   - 未来可期: Git集成 + 版本管理

5. **检索模型选择**: all-MiniLM-L6-v2是否足够？
   - 短期: all-MiniLM-L6-v2（384维，50MB）
   - 中期: gte-small（512维，80MB）
   - 长期: 领域微调模型

---

**决策**: 待讨论确定后更新设计文档。