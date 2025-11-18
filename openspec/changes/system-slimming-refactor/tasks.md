# 系统精简重构任务分解

## 任务执行规则

- 使用 `[-]` 标记当前进行中的任务
- 使用 `[x]` 标记已完成的任务
- 使用 `[ ]` 标记待开始的任务
- 任务之间可能有依赖关系，请按顺序执行
- 每个任务完成后需要运行 `openspec validate system-slimming-refactor --strict` 验证

## 阶段 1：无害模块移除（Phase 1）

### 任务 1.1：移除 PersonalityEngine 初始化
- **文件**：`src/server.ts`
- **操作**：删除或注释掉 PersonalityEngine 相关代码
- **验证**：服务启动无报错，ABP 变量解析正常
- **_Prompt**: "修改 src/server.ts，移除 PersonalityEngine 初始化。保留 ChatService 但不调用 setPersonalityEngine。确保 ProtocolEngine 初始化不受影响。启动服务验证 ABP 协议变量 {{time}} 正常工作。"

### 任务 1.2：移除 EmotionEngine 初始化
- **文件**：`src/server.ts`
- **操作**：删除或注释掉 EmotionEngine 相关代码
- **验证**：情感检测不再运行，不影响核心对话流程
- **_Prompt**: "修改 src/server.ts，移除 EmotionEngine 初始化。不调用 setEmotionEngine。验证对话 API 正常工作，情感相关变量不解析。"

### 任务 1.3：移除 PreferenceService 初始化
- **文件**：`src/server.ts`
- **操作**：删除 PreferenceService 实例化和路由挂载
- **验证**：/api/preference 端点返回 404
- **_Prompt**: "修改 src/server.ts，移除 PreferenceService 初始化。删除将 preferenceService 注入 ChatService 的代码。验证 preference API 不再可用。"

### 任务 1.4：移除 RelationshipService 和 TimelineService
- **文件**：`src/server.ts`
- **操作**：删除两个服务的初始化和路由挂载
- **验证**：相关 API 端点返回 404
- **_Prompt**: "修改 src/server.ts，移除 RelationshipService 和 TimelineService 初始化。删除对应的路由挂载。验证相关 API 返回 404。"

### 任务 1.5：移除 NodeManager 和 DistributedService
- **文件**：`src/server.ts`
- **操作**：删除 NodeManager 和 DistributedService 初始化
- **验证**：WebSocket 分布式通道不可用（后续任务会移除）
- **_Prompt**: "修改 src/server.ts，移除 NodeManager 和 DistributedService 初始化。暂不修改 WebSocketManager。验证服务启动无报错。"

### 任务 1.6：验证阶段 1 变更
- **操作**：运行完整测试套件
- **验证**：
  - ✅ 服务正常启动
  - ✅ ABP 协议解析工作（{{time}} 变量）
  - ✅ /v1/chat/completions 正常工作
  - ✅ Skills 执行正常
- **_Prompt**: "运行测试验证阶段 1 变更。确保所有核心功能正常工作，无回归问题。记录任何警告或错误。"

## 阶段 2：WebSocket 精简（Phase 2）

### 任务 2.1：移除 DistributedServerChannel 处理逻辑
- **文件**：`src/api/websocket/WebSocketManager.ts`
- **操作**：注释或删除第 58-73 行（distributed-server 路由匹配）
- **验证**：/distributed-server 路径返回 1003 错误
- **_Prompt**: "修改 WebSocketManager.setupConnectionHandler()，移除 DistributedServerChannel 处理逻辑。保留 ABPLogChannel 处理。验证 distributed-server 路径不可连接。"

### 任务 2.2：创建 ChatChannel 类
- **文件**：`src/api/websocket/channels/ChatChannel.ts`（新建）
- **操作**：实现 ChatChannel 处理实时对话
- **验证**：单元测试通过
- **_Prompt**: "创建 ChatChannel 类，实现 handleConnection 方法。支持 chat 和 stream_chat 消息类型。调用 ChatService 处理对话。返回格式化的响应。"

### 任务 2.3：集成 ChatChannel 到 WebSocketManager
- **文件**：`src/api/websocket/WebSocketManager.ts`
- **操作**：
  - 添加 chatChannel 构造函数参数
  - 添加 chat 路径路由匹配（/chat 或 /conversation）
  - 调用 chatChannel.handleConnection()
- **验证**：WebSocket /chat 路径可连接
- **_Prompt**: "修改 WebSocketManager，集成 ChatChannel。更新构造函数接收 chatChannel 实例。添加 chat 路径路由匹配。验证 WebSocket 连接正常工作。"

### 任务 2.4：更新 server.ts WebSocket 配置
- **文件**：`src/server.ts`
- **操作**：
  - 删除 DistributedService 注入
  - 添加 ChatService 注入到 WebSocketManager
- **验证**：WebSocket 实时对话功能正常
- **_Prompt**: "修改 server.ts，更新 WebSocketManager 初始化。移除 DistributedService，注入 ChatService。创建 ChatChannel 实例并传入 WebSocketManager。验证完整 WebSocket 对话流程。"

### 任务 2.5：验证 WebSocket 功能
- **操作**：手动测试 WebSocket 连接
- **验证**：
  - ✅ ABPLog 通道正常工作
  - ✅ Chat 通道可连接
  - ✅ Chat 消息类型正常工作
  - ✅ Stream_chat 消息类型正常工作
- **_Prompt**: "编写 WebSocket 测试脚本，测试 chat 和 stream_chat 功能。验证消息接收、错误处理。记录响应时间和稳定性。"

## 阶段 3：Memory 系统简化（Phase 3）

### 任务 3.1：创建简化版 SemanticMemoryService
- **文件**：`src/services/memory/SemanticMemoryService.ts`（覆盖或新建）
- **操作**：
  - 移除复杂配置和选项
  - 简化接口至核心方法：searchSimilar 和 saveSemantic
  - 移除依赖项（EpisodicMemoryService、Bridge）
- **验证**：接口清晰，无外部依赖
- **_Prompt**: "重写 SemanticMemoryService，移除所有可选依赖。保持核心方法：searchSimilar 和 saveSemantic。简化参数，移除复杂配置。确保类型安全。"

### 任务 3.2：简化 ChatService RAG 集成
- **文件**：`src/services/ChatService.ts`
- **操作**：
  - 移除 EpisodicMemoryService setter
  - 在 createChatCompletion 中内联 RAG 查询逻辑
  - 移除 PromptBuilder 依赖
- **验证**：RAG 上下文成功注入系统提示
- **_Prompt**: "修改 ChatService，移除 EpisodicMemoryService 和 PromptBuilder。在 createChatCompletion 方法中直接调用 SemanticMemoryService.searchSimilar()。将检索结果格式化为系统提示。"

### 任务 3.3：删除 EpisodicMemory 相关文件
- **文件**：删除以下文件
  - `src/services/memory/EpisodicMemoryService.ts`
  - `src/services/memory/EpisodicSemanticBridge.ts`
  - `src/services/memory/PromptBuilder.ts`
  - `src/services/memory/stores/TimeSeriesEpisodicStore.ts`
  - `src/services/memory/stores/InMemoryEpisodicStore.ts`
- **验证**：编译无错误
- **_Prompt**: "删除所有 EpisodicMemory 相关文件。更新所有 import 语句。确保没有悬空的引用。运行编译验证。"

### 任务 3.4：删除 Memory 冲突解决模块
- **文件**：删除 `src/services/memory/conflict/` 目录下所有文件
- **操作**：删除 4个文件：
  - MemoryConflictDetector.ts
  - MemoryConflictArbiter.ts
  - MemoryMerger.ts
  - MergeRuleManager.ts
- **验证**：编译无错误
- **_Prompt**: "删除 conflict 目录及其所有文件。更新任何引用这些模块的代码。验证整个 memory 模块的编译。"

### 任务 3.5：更新配置文件
- **文件**：`config/default.yml` 或相关配置文件
- **操作**：
  - 删除 RAG 配置段
  - 添加简化版 Memory 配置
- **验证**：配置加载正常
- **_Prompt**: "更新配置文件，移除复杂的 RAG 配置。添加简化的 Memory 配置段。测试配置加载。验证 Memory 服务使用新配置初始化。"

### 任务 3.6：验证 Memory 功能
- **操作**：运行 Memory 相关测试
- **验证**：
  - ✅ SemanticMemoryService 可初始化
  - ✅ 向量存储可创建索引
  - ✅ 相似度搜索返回结果
  - ✅ 记忆存储正常工作
- **_Prompt**: "运行 Memory 服务测试。测试向量检索、存储和查询功能。验证 RAG 集成在对话中正常工作。记录性能基准。"

## 阶段 4：Skills 体系精简（Phase 4）

### 任务 4.1：确定核心保留模块清单
- **操作**：审查并确定保留的 10 个核心模块
- **输出**：创建保留清单文档
- **验证**：团队评审通过
- **_Prompt**: "审查所有 30+ Skills 模块，确定保留的 10 个核心模块清单（5个核心 + 代码生成 + 安全 + 2个执行器）。创建清单文档并获取团队确认。"

### 任务 4.2：删除监控和指标模块
- **文件**：删除以下模块
  - `ProductionMonitorService.ts`
  - `SkillsMetricsCollector.ts`
  - `PerformanceOptimizer.ts`
  - `MemoryMonitor.ts`
  - `CodeGenerationProfiler.ts`
- **验证**：编译无错误
- **_Prompt**: "删除所有监控和性能分析模块。更新 import 引用。验证 SkillsExecutionManager 不依赖这些模块。运行编译测试。"

### 任务 4.3：删除预加载管理模块
- **文件**：删除以下模块
  - `PreloadManager.ts`
  - `PreloadStrategy.ts`
  - `ResourceLoader.ts`
- **验证**：Skills 懒加载正常工作
- **_Prompt**: "删除预加载相关模块。确保 Skills 按需加载机制正常工作。验证首次执行性能可接受。考虑部署时预热策略。"

### 任务 4.4：删除内存管理模块
- **文件**：删除以下模块
  - `MemoryManager.ts`
  - `MemoryCleaner.ts`
- **验证**：依赖 Node.js GC，无内存泄漏
- **_Prompt**: "删除内存管理模块。验证 Skills 执行无内存泄漏。考虑使用 --max-old-space-size 限制内存。测试长时间运行稳定性。"

### 任务 4.5：删除分布式执行器
- **文件**：删除 `executors/SkillsDistributedExecutor.ts`
- **验证**：不影响其他执行器
- **_Prompt**: "删除分布式执行器（依赖已移除的 NodeManager）。验证其他执行器正常工作。更新执行器索引文件。"

### 任务 4.6：更新执行器索引和加载逻辑
- **文件**：`src/core/skills/executors/index.ts`
- **操作**：
  - 删除分布式执行器导出
  - 精简执行器列表
- **验证**：执行器加载正常
- **_Prompt**: "更新执行器索引文件，移除分布式执行器。验证 SkillsExecutionManager 能正确加载剩余执行器。测试所有执行器类型。"

### 任务 4.7：验证 Skills 核心功能
- **操作**：测试 Skills 执行全流程
- **验证**：
  - ✅ Skills 发现正常
  - ✅ 代码生成正常
  - ✅ 沙箱执行安全
  - ✅ 缓存功能工作
  - ✅ 工具映射正确
- **_Prompt**: "全面测试 Skills 体系。测试内置 Skills 执行、代码生成、安全验证、缓存机制。确保核心执行流程正常工作。记录性能指标。"

## 阶段 5：ABP 协议瘦身（Phase 5，可选）

### 任务 5.1：移除 DiaryProvider 注册
- **文件**：`src/core/ProtocolEngine.ts`
- **操作**：注释或删除第 224-231 行（DiaryProvider）
- **验证**：{{diary:xxx}} 变量不解析
- **_Prompt**: "修改 ProtocolEngine.initializeCore()，移除 DiaryProvider 注册。如果不使用 Memory，这是必需的。验证服务启动无错误。"

### 任务 5.2：移除 RAGProvider 注册
- **文件**：`src/core/ProtocolEngine.ts`
- **操作**：注释或删除第 243-256 行（RAGProvider）
- **验证**：{{rag:xxx}} 变量不解析
- **_Prompt**: "修改 ProtocolEngine.initializeCore()，移除 RAGProvider 注册。如果不使用 RAG，这是必需的。验证服务启动无错误。测试 ABP 解析器正常工作。"

### 任务 5.3：更新配置文档
- **文件**：配置文档
- **操作**：记录移除的变量解析器
- **验证**：文档准确
- **_Prompt**: "更新配置文档，说明哪些变量解析器被移除。提供替代方案（如果需要这些功能，应如何配置）。"

## 阶段 6：管理后台移除（Phase 6，可选）

### 任务 6.1：删除 admin 目录
- **操作**：`rm -rf admin/`
- **验证**：目录成功删除
- **_Prompt**: "删除 admin 目录及其所有内容。确认删除前已备份重要文件。记录此操作不可逆。"

### 任务 6.2：更新 package.json 脚本
- **文件**：`package.json`
- **操作**：删除所有 admin 相关 npm scripts
- **验证**：`npm run` 不再显示 admin 脚本
- **_Prompt**: "修改 package.json，删除 admin:dev、admin:build、admin:preview 等脚本。更新任何引用这些脚本的文档。"

### 任务 6.3：更新文档
- **文件**：README.md、API文档
- **操作**：
  - 移除管理后台相关说明
  - 添加替代配置方法（文件编辑、API调用）
- **验证**：文档准确完整
- **_Prompt**: "更新 README.md 和其他文档，移除管理后台相关内容。添加新的配置方法说明（直接编辑配置文件、使用 API）。提供示例。"

## 最终验证与优化

### 任务 7.1：完整回归测试
- **操作**：运行所有测试套件
- **验证**：
  - ✅ 所有单元测试通过
  - ✅ 所有集成测试通过
  - ✅ 无回归问题
- **_Prompt**: "运行完整的测试套件（npm test）。修复任何失败测试。确保代码覆盖率不低于原始水平。记录测试结果。"

### 任务 7.2：性能基准测试
- **操作**：运行性能基准测试
- **验证**：
  - ✅ 启动时间 < 5秒
  - ✅ 内存占用 < 350MB
  - ✅ API 响应时间保持或提升
- **_Prompt**: "运行性能基准测试（启动时间、内存占用、API响应）。记录所有指标。与原始基准对比，确保达到优化目标。"

### 任务 7.3：代码质量检查
- **操作**：运行 lint 和类型检查
- **验证**：
  - ✅ 无 lint 错误
  - ✅ TypeScript 编译无错误
  - ✅ 无未使用的导入
- **_Prompt**: "运行 eslint 和 TypeScript 编译检查。修复所有错误和警告。检查未使用的导入和变量。确保代码质量。"

### 任务 7.4：部署验证
- **操作**：在 staging 环境部署
- **验证**：
  - ✅ 生产配置加载正常
  - ✅ 所有 API 端点可用
  - ✅ WebSocket 连接稳定
  - ✅ Skills 执行正常
  - ✅ RAG 功能（如果配置）正常
- **_Prompt**: "在 staging 环境部署精简后的系统。使用生产配置验证。测试所有关键路径。与生产流量对比（如果可以）。监控错误率。"

### 任务 7.5：文档最终更新
- **操作**：完成所有文档更新
- **内容**：
  - 架构变更说明
  - 迁移指南
  - 配置文档
  - API 文档（如果有变更）
  - 部署指南
- **_Prompt**: "完成所有文档更新。包括架构变更说明、迁移指南、配置文档、API 文档。确保文档准确反映新系统状态。获取文档审核。"

## 任务依赖关系

```
任务 1.1-1.5（阶段 1）
    ↓
任务 1.6（验证）
    ↓
任务 2.1-2.4（阶段 2）
    ↓
任务 2.5（验证）
    ↓
任务 3.1-3.5（阶段 3）
    ↓
任务 3.6（验证）
    ↓
任务 4.1-4.7（阶段 4）
    ↓
任务 5.1-5.3（阶段 5，可选）
    ↓
任务 6.1-6.3（阶段 6，可选）
    ↓
任务 7.1-7.5（最终验证）
```

## 并行任务

以下任务可以并行执行：
- 任务 1.1-1.5（阶段 1 的各个移除操作）
- 任务 3.1-3.5（阶段 3 的 Memory 简化）和任务 4.1-4.7（阶段 4 的 Skills 精简）
- 任务 5.x（阶段 5）和任务 6.x（阶段 6）均为可选，可并行

## 预估时间表

- **阶段 1（无害移除）**: 2-3 小时
- **阶段 2（WebSocket）**: 1-2 小时
- **阶段 3（Memory）**: 4-6 小时
- **阶段 4（Skills）**: 6-8 小时
- **阶段 5（ABP，可选）**: 3-4 小时
- **阶段 6（Admin，可选）**: 2-3 小时
- **最终验证**: 4-6 小时

**总计（必需阶段 1-4 + 验证）**: 21-35 小时（3-4 工作日）
**总计（全部阶段）**: 26-46 小时（4-5 工作日）
