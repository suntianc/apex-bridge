# 任务清单

## Task 1: LLM动态管理实现

### Task 1.1: 创建SQLite数据库服务
- [x] 创建 `src/services/LLMConfigService.ts`
- [x] 实现SQLite数据库初始化（表结构：id, provider, name, config_json, enabled, created_at, updated_at）
- [x] 实现CRUD操作（create, read, update, delete, list）
- [x] 添加配置验证逻辑

### Task 1.2: 创建LLM适配器工厂
- [x] 创建 `src/core/llm/adapters/` 目录
- [x] 为每个厂商创建独立适配器类：
  - [x] `OpenAIAdapter.ts`
  - [x] `DeepSeekAdapter.ts`
  - [x] `ZhipuAdapter.ts`
  - [x] `ClaudeAdapter.ts`
  - [x] `OllamaAdapter.ts`
  - [x] `CustomAdapter.ts`
- [x] 创建 `LLMAdapterFactory.ts` 工厂类，根据provider字段返回对应适配器

### Task 1.3: 重构LLMClient为LLMManager
- [x] 重命名 `LLMClient.ts` → `LLMManager.ts`
- [x] 修改构造函数，从LLMConfigService加载配置
- [x] 实现更新适配器方法 `updateProvider(id, config)`（仅更新现有厂商）
- [x] 实现配置热重载 `reloadConfig()`
- [x] 不支持动态添加/删除厂商（仅支持更新现有配置）

### Task 1.4: 实现启动时配置加载
- [x] 在 `server.ts` 初始化阶段调用LLMConfigService加载所有配置
- [x] 将配置传递给LLMManager初始化（采用懒加载模式）
- [x] 确保配置加载失败不影响服务启动（降级处理）

### Task 1.5: 实现配置更新流程
- [x] 在LLMConfigService中实现事务：先更新SQLite，成功后更新内存
- [x] 实现配置验证（config字段必填、配置格式验证）
- [x] 添加错误回滚机制（SQLite更新失败时回滚）
- [x] 限制：不支持修改provider字段，不支持添加/删除厂商

### Task 1.6: 创建LLM配置管理API
- [x] 创建 `src/api/controllers/LLMController.ts`
- [x] 实现 `GET /api/llm/providers` - 列出所有厂商
- [x] 实现 `PUT /api/llm/providers/:id` - 更新现有厂商配置
- [x] 添加请求验证中间件
- [x] 不实现POST（添加）和DELETE（删除）端点

## Task 2: ProtocolEngine精简

### Task 2.1: 移除AgentProvider
- [x] 在 `ProtocolEngine.ts` 中移除AgentProvider注册代码
- [x] 保留 `src/core/variable/providers/AgentProvider.ts`（保留文件，但不再使用）
- [ ] 更新相关测试用例（待后续测试阶段）

### Task 2.2: 移除DiaryProvider
- [x] 在 `ProtocolEngine.ts` 中移除DiaryProvider注册代码
- [x] 保留 `src/core/variable/providers/DiaryProvider.ts`（保留文件，但不再使用）
- [x] 移除DiaryProvider相关依赖注入（移除diaryService属性）
- [ ] 更新相关测试用例（待后续测试阶段）

### Task 2.3: 更新变量引擎文档
- [x] 更新ProtocolEngine注释，说明当前支持的变量Provider
- [ ] 更新架构文档（待后续文档更新阶段）

## Task 3: ChatService精简

### Task 3.1: 移除PersonalityEngine
- [x] 在 `ChatService.ts` 中移除 `personalityEngine` 属性
- [x] 移除 `setPersonalityEngine()` 方法
- [x] 移除所有使用PersonalityEngine的代码逻辑
- [x] 更新构造函数和相关方法

### Task 3.2: 移除EmotionEngine
- [x] 在 `ChatService.ts` 中移除 `emotionEngine` 属性
- [x] 移除 `setEmotionEngine()` 方法
- [x] 移除所有使用EmotionEngine的代码逻辑

### Task 3.3: 移除MemoryService
- [x] 在 `ChatService.ts` 中移除 `memoryService` 和 `semanticMemoryService` 属性
- [x] 移除 `setMemoryService()` 方法
- [x] 移除所有MemoryService相关的代码逻辑（保留RAG能力，通过ProtocolEngine访问）
- [x] 移除 `promptBuilder` 相关代码

### Task 3.4: 清理server.ts中的注入代码
- [x] 在 `server.ts` 中移除PersonalityEngine、EmotionEngine、MemoryService的初始化（已确认无需在server.ts中初始化）
- [x] 移除相关的setter调用（已确认无需调用）
- [x] 清理相关import语句（已清理）

## Task 4: Skills沙箱配置

### Task 4.1: 扩展SkillMetadata类型
- [x] 在 `src/types/skills.ts` 中为 `SkillMetadata` 添加 `sandboxExecution?: boolean` 字段
- [ ] 更新METADATA.yml schema文档（待后续文档更新阶段）

### Task 4.2: 修改SkillsExecutionManager
- [x] 在 `SkillsDirectExecutor.executeSkill()` 方法中读取Skill的 `sandboxExecution` 配置
- [x] 根据配置决定是否使用SandboxEnvironment执行
- [x] 如果 `sandboxExecution === false`，使用Node.js vm模块直接执行
- [x] 添加执行方式日志记录和安全警告

### Task 4.3: 实现直接执行器
- [x] 在 `SkillsDirectExecutor` 中实现不使用VM2的直接执行逻辑（使用Node.js vm模块）
- [x] 添加安全警告（非沙箱执行的风险提示）

### Task 4.4: 更新Skills验证工具
- [ ] 在 `SkillValidationTool.ts` 中验证 `sandboxExecution` 字段（待后续验证工具更新）
- [ ] 添加警告：如果 `sandboxExecution === false`，提示安全风险（待后续验证工具更新）

### Task 4.5: 更新示例Skills
- [ ] 为现有Skills的METADATA.yml添加 `sandboxExecution` 配置（待后续Skills更新）
- [ ] 更新Skills开发文档（待后续文档更新阶段）

## Task 5: 测试与验证

### Task 5.1: LLM管理测试
- [ ] 测试SQLite配置存储和读取
- [ ] 测试动态添加/更新/删除厂商
- [ ] 测试配置热重载
- [ ] 测试配置更新事务（SQLite先更新，内存后更新）

### Task 5.2: ProtocolEngine测试
- [ ] 测试移除AgentProvider后变量解析正常
- [ ] 测试移除DiaryProvider后变量解析正常
- [ ] 验证其他Provider正常工作

### Task 5.3: ChatService测试
- [ ] 测试移除PersonalityEngine后对话正常
- [ ] 测试移除EmotionEngine后对话正常
- [ ] 测试移除MemoryService后对话正常

### Task 5.4: Skills沙箱配置测试
- [ ] 测试 `sandboxExecution: true` 使用沙箱执行
- [ ] 测试 `sandboxExecution: false` 使用直接执行
- [ ] 测试默认行为（未配置时使用沙箱）

## Task 6: 文档更新

### Task 6.1: 更新API文档
- [ ] 添加LLM配置管理API文档
- [ ] 更新ChatService API文档（移除可选参数）

### Task 6.2: 更新开发文档
- [ ] 更新LLM适配器开发指南
- [ ] 更新Skills开发指南（沙箱配置说明）
- [ ] 更新架构文档

