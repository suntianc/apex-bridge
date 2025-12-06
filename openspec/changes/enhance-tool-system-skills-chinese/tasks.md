# 实施任务清单：内置工具与Skills外置工具融合架构

> 预计总工时：10-12天
> 实际复杂度：中高
> 涉及文件：~20个
> 代码行数：~1350行

## 1. 环境准备与依赖安装（0.5天）

### 1.1 安装依赖
- [ ] 安装LanceDB和嵌入模型
  ```bash
  npm install vectordb @xenova/transformers
  npm install --save-dev @types/vectordb
  ```
- [ ] 验证dependencies兼容性（Node.js ≥ 18）
- [ ] 检查node-gyp编译环境（vectordb需要）
- [ ] 更新package-lock.json

### 1.2 创建目录结构
- [ ] 创建Skills存储目录
  ```bash
  mkdir -p data/skills
  mkdir -p .data/skills.lance
  mkdir -p config/skills
  ```
- [ ] 创建内置工具目录
  ```bash
  mkdir -p src/core/tools/builtin
  ```
- [ ] 设置目录权限（读写权限）

### 1.3 配置文件
- [ ] 创建 `config/skills-config.yaml`
  ```yaml
  skills:
    storage:
      path: "./data/skills"
      vectorDbPath: "./.data/skills.lance"
    retrieval:
      model: "all-MiniLM-L6-v2"
      cacheSize: 1000
      dimensions: 384
      similarityThreshold: 0.6
    execution:
      timeout: 60000
      maxOutputSize: 10485760  # 10MB
      maxConcurrency: 3
  ```
- [ ] 更新 `.env.example` 添加配置示例

### 1.4 TypeScript配置
- [ ] 添加vectordb类型声明
- [ ] 配置transformers.js模型加载路径
- [ ] 更新tsconfig.json（如有必要）

## 2. 内置工具基础设施（2天）

### 2.1 创建执行器接口和基础类
- [ ] `src/services/executors/ToolExecutor.ts` - 执行器接口定义
  - [ ] 定义 `ToolExecutor` interface
  - [ ] 定义 `ToolExecuteOptions` interface
  - [ ] 定义 `ToolResult` type

- [ ] `src/services/executors/BuiltInExecutor.ts` - 内置工具执行器
  - [ ] 实现 `execute()` 方法（直接调用）
  - [ ] 实现 `registerTool()` 注册机制
  - [ ] 实现 `getTool()` 获取工具
  - [ ] 实现 `listTools()` 列出所有工具

- [ ] `src/services/executors/SkillsSandboxExecutor.ts` - 沙箱执行器
  - [ ] 实现 `execute()` 方法（子进程）
  - [ ] 实现 `createIsolatedWorkspace()` 创建工作区
  - [ ] 实现 `monitorExecution()` 监控执行
  - [ ] 实现 `setupResourceMonitors()` 资源监控（超时、输出大小）
  - [ ] 实现 `cleanup()` 清理资源

### 2.2 实现高频内置工具

#### 2.2.1 FileReadTool（文件读取）
- [ ] `src/core/tools/builtin/FileReadTool.ts`
  - [ ] 参数: `{ path: string, encoding?: string }`
  - [ ] 支持文本文件读取
  - [ ] 支持JSON解析（可选）
  - [ ] 安全路径检查（防止目录遍历）
  - [ ] 添加元数据（category: "filesystem", level: 1）

#### 2.2.2 FileWriteTool（文件写入）
- [ ] `src/core/tools/builtin/FileWriteTool.ts`
  - [ ] 参数: `{ path: string, content: string, encoding?: string }`
  - [ ] 自动创建目录
  - [ ] 备份已有文件（可选）
  - [ ] 安全路径检查
  - [ ] 添加元数据

#### 2.2.3 VectorSearchTool（向量搜索）
- [ ] `src/core/tools/builtin/VectorSearchTool.ts`
  - [ ] 参数: `{ query: string, collection?: string, limit?: number }`
  - [ ] 调用ToolRetrievalService
  - [ ] 返回格式化结果
  - [ ] 添加元数据

#### 2.2.4 PlatformDetectorTool（平台检测）
- [ ] `src/core/tools/builtin/PlatformDetectorTool.ts`
  - [ ] 参数: `{}`
  - [ ] 返回: `{ platform, arch, nodeVersion, cwd }`
  - [ ] 用于诊断和兼容性判断
  - [ ] 添加元数据

#### 2.2.5 CalculationTool（计算工具）
- [ ] `src/core/tools/builtin/CalculationTool.ts`
  - [ ] 参数: `{ expression: string }`
  - [ ] 使用 `expr-eval` 库
  - [ ] 支持数学函数（sin, cos, sqrt等）
  - [ ] 错误处理（表达式无效、除零）
  - [ ] 添加元数据

### 2.3 创建内置工具注册表
- [ ] `src/services/BuiltInToolsRegistry.ts`
  - [ ] 实现单例模式 `getInstance()`
  - [ ] 实现 `register()` 注册工具
  - [ ] 实现 `get()` 获取工具（按名称）
  - [ ] 实现 `getAll()` 获取所有工具
  - [ ] 实现 `listByCategory()` 按类别筛选
  - [ ] 系统启动时自动注册所有内置工具

### 2.4 单元测试
- [ ] `tests/services/executors/BuiltInExecutor.test.ts`
  - [ ] 测试工具注册
  - [ ] 测试工具执行
  - [ ] 测试工具获取

- [ ] `tests/core/tools/builtin/FileReadTool.test.ts`
  - [ ] 测试正常读取
  - [ ] 测试文件不存在
  - [ ] 测试路径遍历防护

- [ ] `tests/core/tools/builtin/CalculationTool.test.ts`
  - [ ] 测试简单计算
  - [ ] 测试复杂表达式
  - [ ] 测试数学函数
  - [ ] 测试错误表达式

## 3. Skills向量检索服务（2天）

### 3.1 创建检索服务
- [ ] `src/services/ToolRetrievalService.ts`
  - [ ] 实现 `initialize()` LanceDB连接初始化
  - [ ] 实现 `getEmbedding()` 生成向量
  - [ ] 实现 `indexSkill()` Skills向量化入库
  - [ ] 实现 `removeSkill()` 删除Skills向量
  - [ ] 实现 `findRelevantSkills()` 向量相似度搜索
  - [ ] 实现 `updateSkill()` 更新Skills向量
  - [ ] **新增**: 实现 `loadEmbeddingModelConfig()` 从SQLite读取配置
  - [ ] **新增**: 实现 `generateLocalEmbedding()` 本地模型生成向量
  - [ ] **新增**: 实现 `generateApiEmbedding()` 外部API生成向量
  - [ ] **新增**: 实现 `ensureDefaultEmbeddingModel()` 创建默认配置（如果不存在）

### 3.2 实现启动时批量索引
- [ ] `src/services/SkillIndexingService.ts`
  - [ ] 实现 `onApplicationBootstrap()` 启动钩子
  - [ ] 实现 `scanSkillsDirectory()` 扫描Skills目录
  - [ ] 实现 `checkNeedsIndexing()` 检查是否需要索引
  - [ ] 实现 `indexSkill()` 索引单个Skills
  - [ ] 实现 `loadMetadata()` 从SKILL.md提取元数据

### 3.3 实现Embedding缓存
- [ ] 创建 `src/services/EmbeddingCache.ts`
  - [ ] LRU缓存（最大1000条目）
  - [ ] TTL 5分钟
  - [ ] 缓存键: 文本内容hash

### 3.4 相似度计算和排名
- [ ] 实现余弦相似度计算
- [ ] 实现结果排序（相似度降序）
- [ ] 实现阈值过滤（config.skills.retrieval.similarityThreshold）
- [ ] 支持返回Top-K（默认10个）

### 3.5 类型定义
- [ ] `src/types/skill-retrieval.ts`
  - [ ] `SkillVector` 类型
  - [ ] `VectorSearchResult` 类型
  - [ ] `EmbeddingOptions` 类型

### 3.6 单元测试
- [ ] `tests/services/ToolRetrievalService.test.ts`
  - [ ] 测试LanceDB初始化
  - [ ] 测试向量生成
  - [ ] 测试Skills索引
  - [ ] 测试向量搜索
  - [ ] 测试缓存机制

## 4. Skills生命周期管理（2天）

### 4.1 创建Skills管理器
- [ ] `src/services/SkillManager.ts`
  - [ ] 实现 `installSkill()` 安装Skills
  - [ ] 实现 `uninstallSkill()` 卸载Skills
  - [ ] 实现 `updateSkill()` 修改Skills描述
  - [ ] 实现 `listSkills()` 列出已安装Skills
  - [ ] 实现 `getSkillByName()` 获取特定Skills
  - [ ] 实现 `isSkillExist()` 检查Skills是否存在

### 4.2 实现安装功能
- [ ] ZIP解压（使用 `yauzl` 或 `adm-zip`）
- [ ] 验证ZIP结构（必需字段检查）
- [ ] 验证SKILL.md（YAML Frontmatter解析）
- [ ] 检查名称冲突（支持覆盖选项）
- [ ] 解压到 `data/skills/{name}/`
- [ ] 调用 `ToolRetrievalService.indexSkill()`
- [ ] 创建 `.vectorized` 标识文件
- [ ] 返回安装结果

### 4.3 实现卸载功能
- [ ] 验证Skills存在
- [ ] 删除 `data/skills/{name}/` 目录（递归）
- [ ] 调用 `ToolRetrievalService.removeSkill()`
- [ ] 清理元数据缓存
- [ ] 返回卸载结果

### 4.4 实现修改功能
- [ ] 只能修改SKILL.md中的description字段
- [ ] 验证新描述长度（≤ 1024字符）
- [ ] 保存修改后的SKILL.md
- [ ] 重新生成向量索引（因为描述变更）
- [ ] 更新 `.vectorized` 标识
- [ ] 返回修改结果

### 4.5 实现列表功能
- [ ] 扫描 `data/skills/` 目录
- [ ] 读取每个Skills的元数据（SKILL.md）
- [ ] 返回列表（包含名称、描述、版本、安装时间）
- [ ] 支持过滤（按名称、标签、类别）

### 4.6 类型定义
- [ ] `src/types/skill-management.ts`
  - [ ] `SkillMetadata` 类型（从SKILL.md解析）
  - [ ] `InstallResult` 类型
  - [ ] `UninstallResult` 类型
  - [ ] `UpdateResult` 类型

### 4.7 单元测试
- [ ] `tests/services/SkillManager.test.ts`
  - [ ] 测试安装（成功、失败场景）
  - [ ] 测试卸载
  - [ ] 测试重复安装
  - [ ] 测试安装无效结构

## 5. API控制器（1天）

### 5.1 创建Skills管理控制器
- [ ] `src/api/controllers/SkillController.ts`
  - [ ] `installSkill()` POST /api/skills/install
  - [ ] `uninstallSkill()` DELETE /api/skills/:name
  - [ ] `listSkills()` GET /api/skills
  - [ ] `getSkill()` GET /api/skills/:name
  - [ ] `updateSkillDescription()` PUT /api/skills/:name/description

### 5.2 请求/响应格式化
- [ ] Multer配置（文件上传中间件）
- [ ] ZIP文件验证（大小、类型）
- [ ] 错误处理（400/404/500）
- [ ] 成功响应格式统一

### 5.3 权限和速率限制
- [ ] 上传文件大小限制（10MB）
- [ ] 安装速率限制（5次/分钟）
- [ ] 删除速率限制（10次/分钟）
- [ ] 管理员权限（生产环境）

### 5.4 路由配置
- [ ] `src/api/routes/skillRoutes.ts`
- [ ] 注册到 `app.ts`
- [ ] 添加swagger文档（可选）

### 5.5 集成测试
- [ ] `tests/api/SkillController.integration.test.ts`
  - [ ] 测试安装端点
  - [ ] 测试卸载端点
  - [ ] 测试列表面点
  - [ ] 测试更新端点

## 6. 策略层集成（2天）

### 6.1 重构ReActStrategy
- [ ] 读取 `src/strategies/ReActStrategy.ts`
- [ ] 注入依赖:
  - [ ] `BuiltInToolsRegistry.getInstance()`
  - [ ] `ToolRetrievalService.getInstance()`
  - [ ] `BuiltInExecutor.getInstance()`
  - [ ] `SkillsSandboxExecutor.getInstance()`

### 6.2 实现工具发现逻辑
- [ ] 在 `execute()` 开始时检索相关Skills
  ```typescript
  const query = messages[messages.length - 1].content;
  const relevantSkills = await this.toolRetrievalService.findRelevantSkills(query, {
    limit: 5,
    threshold: 0.6,
  });
  ```
- [ ] 加载内置工具到执行器
  ```typescript
  const builtInTools = this.builtInRegistry.getAll();
  for (const tool of builtInTools) {
    this.builtInExecutor.register(tool);
  }
  ```
- [ ] 加载检索到的Skills
  ```typescript
  for (const skill of relevantSkills) {
    this.skillsExecutor.register(skill);
  }
  ```

### 6.3 实现工具执行逻辑
- [ ] 改造 `registerDefaultTools()`:
  ```typescript
  private registerDefaultTools(): void {
    // 1. 注册内置工具（直接调用）
    const builtInTools = this.builtInRegistry.getAll();
    for (const tool of builtInTools) {
      this.builtInExecutor.register(tool);
    }

    // 2. 注册检索到的Skills（子进程）
    const relevantSkills = await this.toolRetrievalService.findRelevantSkills(query);
    for (const skill of relevantSkills) {
      this.skillsExecutor.register(skill);
    }
  }
  ```

### 6.4 实现双执行器路由
- [ ] 改造 `executeCustomTool()`:
  ```typescript
  private async executeCustomTool(toolName: string, params: any): Promise<any> {
    // 1. 先尝试内置执行器
    const builtInResult = await this.builtInExecutor.execute(toolName, params)
      .catch(() => null);

    if (builtInResult) {
      return builtInResult;
    }

    // 2. 尝试Skills执行器
    const skillResult = await this.skillsExecutor.execute(toolName, params)
      .catch((error) => {
        throw new Error(`Skills execution failed: ${error.message}`);
      });

    return skillResult;
  }
  ```

### 6.5 实现工具使用统计
- [ ] 在内置执行器中记录统计
- [ ] 在Skills执行器中记录统计
- [ ] 统计包括: 调用次数、成功率、平均耗时
- [ ] 提供 `GET /api/tools/stats` 端点

### 6.6 集成测试
- [ ] `tests/strategies/ReActStrategy.integration.test.ts`
  - [ ] 测试工具检索流程
  - [ ] 测试内置工具执行
  - [ ] 测试Skills执行
  - [ ] 测试混合工具调用
  - [ ] 测试工具统计记录

## 7. 测试（2天）

### 7.1 单元测试（1天）
- [ ] 所有服务类的单元测试（见各章节）
- [ ] 所有工具类的单元测试
- [ ] 所有执行器的单元测试
- [ ] 覆盖率目标: >80%

### 7.2 集成测试（0.5天）
- [ ] ReActStrategy集成测试（见6.6）
- [ ] Skills安装→检索→执行端到端测试
- [ ] 错误处理流程测试

### 7.3 性能测试（0.5天）
- [ ] 内置工具性能:
  - [ ] FileRead: P99 < 10ms
  - [ ] Calculation: P99 < 5ms
  - [ ] VectorSearch: P99 < 20ms
- [ ] Skills执行性能:
  - [ ] 简单Skills: P99 < 200ms
  - [ ] 复杂Skills: P99 < 500ms
- [ ] 向量检索性能:
  - [ ] 100个Skills: < 10ms
  - [ ] 1000个Skills: < 50ms

### 7.4 安全测试（额外）
- [ ] Skills沙箱隔离测试
- [ ] 超时机制测试
- [ ] 输出大小限制测试
- [ ] 环境变量隔离测试

### 7.5 手动验收测试
- [ ] 场景1: 数学计算（内置工具）
  - [ ] 输入: "计算 (10 + 5) * 2"
  - [ ] 期望: 使用内置calculate工具，响应时间 < 50ms

- [ ] 场景2: 文件读取（内置工具）
  - [ ] 输入: "读取README.md"
  - [ ] 期望: 使用内置FileRead，成功读取

- [ ] 场景3: Skills检索和执行
  - [ ] 前置: 安装git-commit Skills
  - [ ] 输入: "提交代码"
  - [ ] 期望: 检索到git-commit Skills，成功执行

## 8. 性能优化（1天）

### 8.1 Embedding缓存优化
- [ ] 实现LRU缓存（1000条目）
- [ ] 实现TTL（5分钟）
- [ ] 监控缓存命中率（目标 > 80%）

### 8.2 向量检索优化
- [ ] 配置索引类型（IVF_PQ）
- [ ] 调整检索参数（nprobe）
- [ ] 预加载热数据到内存

### 8.3 Skills执行优化
- [ ] 子进程复用（考虑连接池）
- [ ] 工作区复用（减少I/O）
- [ ] 并行执行控制（p-queue）

### 8.4 瓶颈分析
- [ ] 使用Clinic.js分析性能
- [ ] 识别热点函数
- [ ] 优化慢查询

## 9. 文档（0.5天）

### 9.1 API文档
- [ ] `docs/api-skills.md` - API接口文档
- [ ] Swagger/OpenAPI配置
- [ ] POSTMAN/Insomnia导出

### 9.2 开发指南
- [ ] `docs/skills-development-guide.md` - Skills开发指南
- [ ] 内置工具开发模板
- [ ] 最佳实践和约定

### 9.3 架构文档
- [ ] 更新主CLAUDE.md
- [ ] 创建src/services/CLAUDE.md
- [ ] 绘制架构图（Mermaid）

### 9.4 运维文档
- [ ] 部署指南
- [ ] 故障排查手册
- [ ] 性能调优建议

## 10. 部署和发布（0.5天）

### 10.1 预发布验证
- [ ] 部署到staging环境
- [ ] 运行自动化测试
- [ ] 执行手动验收测试
- [ ] 验证监控指标

### 10.2 生产发布
- [ ] 配置环境变量
- [ ] 准备Skills示例包
- [ ] 灰度发布（10% → 50% → 100%）
- [ ] 监控告警配置

### 10.3 发布检查清单
- [ ] 所有测试通过 ✅
- [ ] 文档完整 ✅
- [ ] 配置验证 ✅
- [ ] 监控就绪 ✅
- [ ] 回滚方案准备 ✅

## 风险标记

- 🟢 低风险任务: 1.1, 1.2, 9.1, 10.1
- 🟡 中风险任务: 3.1, 4.2, 6.3, 7.2
- 🔴 高风险任务: 2.4, 5.3, 6.5, 8.1

## 关键路径

```
Phase 1 (0.5天) → Phase 2 (2天) → Phase 3 (2天) → Phase 6 (2天) → Phase 10 (0.5天)
     ↓                ↓                ↓                ↓
Phase 4 (1天)    Phase 5 (1天)    Phase 7 (1天)
     ↓                ↓                ↓
Phase 8 (1天)    Phase 9 (0.5天)
```

**总关键路径**: 7天
**总缓冲时间**: 3-5天
**建议预留**: 10-12天

### 11.8 Embedding模型配置集成（1天）

#### 11.8.1 适配器接口扩展
- [ ] `src/core/llm/adapters/BaseAdapter.ts`
  - [ ] 在 `ILLMAdapter` 接口添加 `embed(texts: string[], model?: string): Promise<number[][]>`
  - [ ] 在 `BaseOpenAICompatibleAdapter` 中实现默认embed方法（OpenAI兼容）
  - [ ] 实现请求格式：`{ input: texts, model, encoding_format: 'float' }`
  - [ ] 解析响应：`response.data.data.map(item => item.embedding)`

#### 11.8.2 LLMManager embed()方法实现
- [ ] `src/core/LLMManager.ts`
  - [ ] 完成第219-261行的 `embed()` 方法TODO
  - [ ] 复用已有的模型选择逻辑（第222-239行）
  - [ ] 调用适配器的 `embed()` 方法
  - [ ] 添加错误处理：提供商不支持embedding时的降级
  - [ ] 添加日志：记录使用的模型、生成的向量维度、耗时

#### 11.8.3 具体适配器实现（优先级排序）
- [ ] `src/core/llm/adapters/OpenAIAdapter.ts`
  - [ ] 验证继承的embed方法可用（OpenAI原生支持）
  - [ ] 测试 text-embedding-3-small 和 text-embedding-3-large
  - [ ] 添加支持的embedding模型列表

- [ ] `src/core/llm/adapters/OllamaAdapter.ts`
  - [ ] 实现Ollama的embed方法（endpoint: '/api/embed'）
  - [ ] 转换请求/响应格式适配Ollama API
  - [ ] 测试 nomic-embed-text 等开源embedding模型

- [ ] `src/core/llm/adapters/CustomAdapter.ts`
  - [ ] 实现可配置的embed方法（支持任意兼容API）
  - [ ] 通过modelConfig.customEmbeddingEndpoint自定义端点

- [ ] `src/core/llm/adapters/LocalEmbeddingAdapter.ts`（新增）
  - [ ] 创建独立适配器（不继承BaseAdapter）
  - [ ] 使用 `@xenova/transformers` 加载本地模型
  - [ ] 实现异步模型加载：`pipeline('feature-extraction', modelPath)`
  - [ ] 缓存加载的模型实例（避免重复加载）
  - [ ] 支持的模型：all-MiniLM-L6-v2, gte-small, multilingual-e5等

#### 11.8.4 模型配置初始化
- [ ] `src/services/LLMConfigService.ts` 或初始化脚本
  - [ ] 创建默认的本地提供商（provider: 'local'）
  - [ ] 创建默认Embedding模型配置（all-MiniLM-L6-v2）
  - [ ] 设置模型参数：dimensions=384, quantized=true
  - [ ] 在应用启动时调用初始化（如果数据库为空）

#### 11.8.5 端点映射配置
- [ ] `src/config/endpoint-mappings.ts`
  - [ ] 添加 `embedding` 类型的端点映射
  - [ ] OpenAI: `/embeddings`
  - [ ] Ollama: `/api/embed`
  - [ ] 通义千问: `/v1/services/embeddings/text-embedding/text-embedding`
  - [ ] 更新 `buildApiUrl()` 函数支持embedding类型

#### 11.8.6 集成测试
- [ ] `tests/unit/llm-manager-embedding.test.ts`
  - [ ] 测试从SQLite读取Embedding配置
  - [ ] 测试本地模型生成向量
  - [ ] 测试外部API生成向量
  - [ ] 测试配置切换（运行时切换模型）
  - [ ] 测试错误处理（模型不可用、网络失败）

- [ ] `tests/integration/embedding-end-to-end.test.ts`
  - [ ] 完整流程：配置 → 加载 → 生成向量 → Skills索引 → 检索
  - [ ] 性能测试：单文本、批量文本（100条）的生成速度
  - [ ] 准确性测试：验证生成的向量维度正确

#### 11.8.7 文档和示例
- [ ] `docs/embedding-configuration.md`
  - [ ] 配置本地Embedding模型的步骤
  - [ ] 配置OpenAI Embedding的步骤
  - [ ] 配置Ollama Embedding的步骤
  - [ ] Troubleshooting：常见问题解决

- [ ] `examples/embedding-models.yaml`
  - [ ] 提供主流Embedding模型的配置模板
  - [ ] OpenAI (text-embedding-3-small/large)
  - [ ] 通义千问 (text-embedding-v1/v2)
  - [ ] 百度文心 (embedding-v1)
  - [ ] 讯飞星火 (embedding)

## 人员分工（如果团队）

- **开发者A**: Phase 2 + 8（内置工具+性能优化）
- **开发者B**: Phase 3 + 4（向量检索+Skills管理）
- **开发者C**: Phase 5 + 6 + 7（API+策略集成+测试）

---

**每Phase完成后**: 更新tasks.md并标记[X]
**发现问题时**: 创建issue并关联到对应任务
**需要评审时**: 提交PR并@代码审查者
