## 第一阶段：Skills架构实施（14-20周）

### 1. 基础设施搭建（3-4周）✅ 已完成

- [x] 1.1 核心框架开发（Week 1-2）
  - [x] 1.1.1 实现MetadataLoader类，支持METADATA.yml格式解析
  - [x] 1.1.2 开发SkillsIndex智能索引系统，支持元数据缓存
  - [x] 1.1.3 实现三级加载架构基础框架
  - [x] 1.1.4 搭建SkillsRepository目录结构扫描
  - [x] 1.1.5 编写基础缓存基础设施
  - [x] 1.1.6 实现SkillsMetadata类型定义和接口
  - [x] 1.1.7 开发元数据验证和错误处理机制

- [x] 1.2 指令加载器实现（Week 3-4）
  - [x] 1.2.1 实现InstructionLoader类，支持SKILL.md解析
  - [x] 1.2.2 开发结构化内容解析器（sections、codeBlocks）
  - [x] 1.2.3 实现ResourceScanner资源扫描器
  - [x] 1.2.4 添加TypeScript代码块提取和验证
  - [x] 1.2.5 实现预编译功能基础架构
  - [x] 1.2.6 编写单元测试覆盖核心功能
  - [x] 1.2.7 实现代码安全验证机制

### 2. 执行引擎改造（4-5周）✅ 核心功能已完成（95%）

- [x] 2.1 代码生成器开发（Week 5-6）
  - [x] 2.1.1 实现CodeGenerator类，支持TS→JS转换
  - [x] 2.1.2 开发代码安全验证和沙箱机制
  - [x] 2.1.3 实现临时文件管理和清理
  - [x] 2.1.4 添加错误处理和异常包装
  - [x] 2.1.5 实现代码依赖分析和注入
  - [x] 2.1.6 开发代码性能分析工具

- [x] 2.2 执行器全面改造（Week 7-9）
  - [x] 2.2.1 改造所有6种插件类型执行器
  - [x] 2.2.2 实现SkillsDirectExecutor（子进程模式）
  - [x] 2.2.3 实现SkillsServiceExecutor（HTTP模式）
  - [x] 2.2.4 实现SkillsDistributedExecutor（WebSocket模式）
  - [x] 2.2.5 实现SkillsStaticExecutor（静态数据模式）
  - [x] 2.2.6 添加向后兼容层支持
  - [x] 2.2.7 实现结果格式标准化

- [ ] 2.3 集成测试（Week 10）
  - [ ] 2.3.1 编写端到端集成测试
  - [ ] 2.3.2 实现性能基准测试
  - [ ] 2.3.3 添加安全性和权限测试
  - [ ] 2.3.4 实现缓存命中率监控
  - [ ] 2.3.5 编写回滚机制测试

### 3. 记忆系统基础集成（并行2/3，1-2周）✅ 部分完成（70%）

- [x] 3.1 IMemoryService v1实现（Week 7-8）
  - [x] 3.1.1 实现Profile Memory（用户/家庭结构化配置）
  - [x] 3.1.2 实现Session Memory（最近N条消息，默认50条）
  - [x] 3.1.3 使用现有存储（暂不拆分RAG）
  - [x] 3.1.4 实现基础CRUD操作（save, recall）

- [ ] 3.2 Skills与记忆系统对接（Week 8-9）
  - [ ] 3.2.1 定义统一的ToolExecutionResult接口（output, memoryWrites, intermediateSteps）
  - [ ] 3.2.2 定义MemoryWriteSuggestion接口
  - [ ] 3.2.3 定义StepTrace接口（stepId, stepName, input, output, duration, error?）
  - [ ] 3.2.4 在SkillsExecutionManager中收集memoryWrites和intermediateSteps
  - [ ] 3.2.5 将memoryWrites统一交给IMemoryService.appendMemory
  - [ ] 3.2.6 将intermediateSteps用于调试日志和可观测性监控
  - [ ] 3.2.7 更新SKILL.md格式规范，添加记忆写入说明

- [ ] 3.3 Chat Pipeline基础记忆注入（Week 9-10）
  - [ ] 3.3.1 在构建Prompt时注入UserProfile / HouseholdProfile
  - [ ] 3.3.2 注入最近消息（Session Memory）
  - [ ] 3.3.3 为后续Semantic/Episodic Memory预留参数位
  - [ ] 3.3.4 实现记忆上下文过滤（基于userId, householdId）

### 4. 性能优化（2-3周）✅ 核心功能已完成（95%）

- [x] 4.1 缓存和性能优化（Week 11-12）
  - [x] 4.1.1 实现多级LRU缓存系统（元数据/内容/资源）
  - [x] 4.1.2 开发预编译优化和代码缓存
  - [x] 4.1.3 添加性能监控和指标收集
  - [x] 4.1.4 实现异步加载优化
  - [x] 4.1.5 开发智能预加载策略
  - [x] 4.1.6 优化内存使用和垃圾回收

- [x] 4.2 调优和文档（Week 13）
  - [x] 4.2.1 性能调优和参数优化
  - [x] 4.2.2 编写技术架构文档
  - [x] 4.2.3 创建开发者迁移指南
  - [ ] 4.2.4 实现生产环境监控
  - [x] 4.2.5 编写最佳实践指南

- [ ] 4.3 监控与可观测性（Week 13）
  - [x] 4.3.1 实现Skills执行器监控（成功率、平均时延、超时率）
  - [x] 4.3.2 实现三级加载缓存命中率监控
  - [ ] 4.3.3 实现记忆系统监控（各ownerType的记忆增速、检索QPS、平均时延）
  - [ ] 4.3.4 实现重要性分布统计（importance 1-5的占比）
  - [ ] 4.3.5 集成告警系统（关键指标异常告警）

### 5. 试点和迁移（3-4周）⚠️ 进行中（40%）

- [x] 5.1 试点验证（Week 14-15）
  - [x] 5.1.1 选择5个典型插件进行试点迁移（实际完成6个）
  - [ ] 5.1.2 手动验证转换结果的正确性
  - [ ] 5.1.3 执行A/B测试对比性能
  - [ ] 5.1.4 收集试点反馈和优化建议
  - [x] 5.1.5 完善转换工具和错误处理（基础功能完成）

- [ ] 5.2 批量迁移（Week 16-17）
  - [x] 5.2.1 开发自动化批量迁移工具（PluginMigrationTool）
  - [ ] 5.2.2 按优先级分批处理所有插件
  - [ ] 5.2.3 实现自动化验证流程
  - [ ] 5.2.4 执行全面回归测试
  - [ ] 5.2.5 进行性能基准对比测试
  - [ ] 5.2.6 编写迁移完成报告

### 6. 优化和稳定（2-3周）

- [ ] 6.1 系统优化（Week 18-19）
  - [ ] 6.1.1 基于测试数据优化性能瓶颈
  - [ ] 6.1.2 调优缓存参数和策略
  - [ ] 6.1.3 优化智能匹配算法
  - [ ] 6.1.4 完善错误处理和日志系统
  - [ ] 6.1.5 实现高级监控和告警

- [ ] 6.2 文档和培训（Week 20）
  - [ ] 6.2.1 编写完整的用户文档
  - [ ] 6.2.2 创建开发者API文档
  - [ ] 6.2.3 制作迁移指南和教程
  - [ ] 6.2.4 进行团队技术培训
  - [ ] 6.2.5 建立知识库和FAQ

## 第二阶段：ABP协议迁移（11-13周，可选但商业化必选）

### 7. 迁移评估与准备（1周）

- [ ] 7.1 迁移评估（Week 1）
  - [ ] 7.1.1 评估Skills架构当前状态
  - [ ] 7.1.2 分析VCP协议使用情况
  - [ ] 7.1.3 评估迁移成本和风险
  - [ ] 7.1.4 制定迁移策略

- [ ] 7.2 合规审计（Week 1）
  - [ ] 7.2.1 扫描所有VCP协议相关代码
  - [ ] 7.2.2 标注高风险模块
  - [ ] 7.2.3 生成合规风险报告

- [ ] 7.3 OpenSpec规范更新（Week 1）
  - [ ] 7.3.1 定义ABP协议规范（specs/protocol/spec.md）
  - [ ] 7.3.2 定义Skills ABP适配规范（specs/skills/spec.md）

### 8. ABP协议核心实现（2周）

- [ ] 8.1 ABP协议设计（Week 1）
  - [ ] 8.1.1 设计ABP协议标记格式（`[[ABP_TOOL:...]]`）
  - [ ] 8.1.2 设计ABP工具定义接口
  - [ ] 8.1.3 设计ABP变量系统
  - [ ] 8.1.4 设计ABP消息格式

- [ ] 8.2 协议解析器实现（Week 1-2）
  - [ ] 8.2.1 实现ABPProtocolParser（协议标记解析、JSON参数解析）
  - [ ] 8.2.2 实现错误恢复机制（自动JSON修复、噪声文本剥离、协议边界校验）
  - [ ] 8.2.3 实现多JSON块处理（取最后一个有效块）
  - [ ] 8.2.4 实现指令抽取器（从杂乱输出中恢复ABP block）
  - [ ] 8.2.5 实现fallback机制（无法解析时fallback至纯文本响应）
  - [ ] 8.2.6 实现ABP变量引擎
  - [ ] 8.2.7 实现协议转换工具（VCP → ABP）

### 9. Skills ABP适配（3-4周）

- [ ] 9.1 SKILL.md格式调整（Week 3）
  - [ ] 9.1.1 更新SKILL.md格式，支持ABP工具定义
  - [ ] 9.1.2 添加ABP协议字段（tools, kind等）
  - [ ] 9.1.3 保持向后兼容（支持VCP格式）

- [ ] 9.2 Skills执行引擎适配（Week 3-4）
  - [ ] 9.2.1 实现ABPSkillsAdapter
  - [ ] 9.2.2 修改SkillsExecutionManager支持ABP协议
  - [ ] 9.2.3 修改SkillsLoader支持ABP格式
  - [ ] 9.2.4 实现双协议兼容层

- [ ] 9.3 迁移工具开发（Week 4-5）
  - [ ] 9.3.1 开发VCP到ABP的自动转换工具
  - [ ] 9.3.2 批量更新SKILL.md文件
  - [ ] 9.3.3 验证转换结果

### 10. 多维记忆系统落地与RAG拆分（2-3周）

- [ ] 10.1 RAG与Memory物理拆分（Week 5-6）
  - [ ] 10.1.1 将RAGMemoryService拆分为RAGService和MemoryService
  - [ ] 10.1.2 使用不同的向量索引/库（避免混淆）
  - [ ] 10.1.3 实现数据迁移脚本（从旧结构迁移到新结构）
  - [ ] 10.1.4 对旧的"伪记忆/伪RAG"数据做一次性embedding & 归档
  - [ ] 10.1.5 实现批处理embedding机制
  - [ ] 10.1.6 实现安全重建索引流程
  - [ ] 10.1.7 实现索引版本控制
  - [ ] 10.1.8 实现tombstone/GC策略

- [ ] 10.2 Semantic + Episodic Memory实现（Week 6-7）
  - [ ] 10.2.1 定义MemoryEntry实体（包含sourceType字段）
  - [ ] 10.2.2 在appendMemory中加入Embedding + HNSW向量写入
  - [ ] 10.2.3 实现searchSemanticMemories，支持按user/group/task检索topK
  - [ ] 10.2.4 实现记忆重要性评估算法
  - [ ] 10.2.5 实现记忆聚类和去重机制
  - [ ] 10.2.6 实现冲突检测算法
  - [ ] 10.2.7 实现自动仲裁策略（基于importance/recency/source-type）
  - [ ] 10.2.8 实现记忆合并算法
  - [ ] 10.2.9 定义memoryMergeRules配置
  - [ ] 10.2.10 支持手动冲突解决接口

- [ ] 10.3 记忆策略与权限（Week 7）
  - [ ] 10.3.1 为MemoryEntry增加visibility字段
  - [ ] 10.3.2 在MemoryContextKey中引入权限/可见性控制
  - [ ] 10.3.3 定义Agent类型与ownerType的访问权限矩阵
  - [ ] 10.3.4 在loadContextMemories时实现权限过滤
  - [ ] 10.3.5 Skills/插件在写入memoryWrites时支持指定visibility

- [ ] 10.4 记忆注入策略（Week 7-8）
  - [ ] 10.4.1 在ABP Chat Pipeline中明确记忆注入时机和策略
  - [ ] 10.4.2 实现智能记忆选择算法
  - [ ] 10.4.3 控制注入条数和Token上限
  - [ ] 10.4.4 实现记忆优先级排序
  - [ ] 10.4.5 支持按场景动态调整记忆注入策略
  - [ ] 10.4.6 明确定义Prompt结构格式（[SYSTEM]、[MEMORY]、[RAG]、[USER]、[TOOL INSTR]）
  - [ ] 10.4.7 为不同Agent persona定义不同的prompt layout模板

### 11. 系统集成与测试（1周）

- [ ] 11.1 系统集成（Week 9）
  - [ ] 11.1.1 集成ABP协议到VCPEngine
  - [ ] 11.1.2 更新Chat Pipeline
  - [ ] 11.1.3 更新所有API接口

- [ ] 11.2 全面测试（Week 9）
  - [ ] 11.2.1 单元测试（MemoryService、SkillsLoader、ABPProtocolParser等）
  - [ ] 11.2.2 集成测试（工具调用全链路、Memory injection pipeline等）
  - [ ] 11.2.3 兼容性测试（VCP → ABP双协议、fallback机制）
  - [ ] 11.2.4 性能测试（Memory检索QPS、Protocol parsing耗时等）
  - [ ] 11.2.5 烟雾测试（全系统E2E流程、错误场景测试）
  - [ ] 11.2.6 记忆系统专项测试（四维记忆、权限控制、注入策略、冲突解决）
  - [ ] 11.2.7 数据迁移测试（RAG/Memory拆分、向量库迁移）

### 12. 文档与发布（1周）

- [ ] 12.1 文档完善（Week 10）
  - [ ] 12.1.1 ABP协议规范文档
  - [ ] 12.1.2 Skills ABP适配指南
  - [ ] 12.1.3 迁移指南
  - [ ] 12.1.4 API文档更新
  - [ ] 12.1.5 ABP协议示例库
  - [ ] 12.1.6 SKILL.md记忆写入规范文档（更新，包含ABP格式）
  - [ ] 12.1.7 Memory调试工具文档
  - [ ] 12.1.8 Prompt结构规范文档
  - [ ] 12.1.9 错误恢复机制文档

- [ ] 12.2 发布准备（Week 10）
  - [ ] 12.2.1 版本号规划（v3.0.0）
  - [ ] 12.2.2 变更日志
  - [ ] 12.2.3 发布说明

- [ ] 12.3 系统级回滚策略（Week 10）
  - [ ] 12.3.1 代码回滚（Git revert流程和检查清单）
  - [ ] 12.3.2 数据回滚（Memory/RAG双写期间的回滚策略、向量库版本回滚）
  - [ ] 12.3.3 协议回滚（ABP → VCP fallback机制、自动降级策略）
  - [ ] 12.3.4 Skills引擎降级（新执行器失败时切回旧执行器）
  - [ ] 12.3.5 Feature Flag总开关（全局管理、紧急关闭能力）
  - [ ] 12.3.6 回滚测试（流程演练、RTO/RPO定义）

### 13. RAG包重命名与发布（1周）

- [ ] 13.1 包重命名准备（Week 11）
  - [ ] 13.1.1 创建新的abp-rag-sdk项目结构
  - [ ] 13.1.2 更新所有包名引用（package.json, README等）
  - [ ] 13.1.3 更新所有代码中的导入路径
  - [ ] 13.1.4 更新文档中的包名引用
  - [ ] 13.1.5 更新CI/CD配置

- [ ] 13.2 代码迁移与验证（Week 11）
  - [ ] 13.2.1 将vcp-intellicore-rag代码迁移到abp-rag-sdk
  - [ ] 13.2.2 更新所有类型定义和接口
  - [ ] 13.2.3 移除VCP相关命名和引用
  - [ ] 13.2.4 更新测试套件
  - [ ] 13.2.5 验证功能完整性

- [ ] 13.3 npm包发布（Week 11）
  - [ ] 13.3.1 发布abp-rag-sdk到npm（版本从1.0.0开始）
  - [ ] 13.3.2 在vcp-intellicore-rag包中添加废弃警告
  - [ ] 13.3.3 更新vcp-intellicore-rag README，指向新包
  - [ ] 13.3.4 设置vcp-intellicore-rag为deprecated状态

- [ ] 13.4 依赖更新（Week 11）
  - [ ] 13.4.1 更新apex-bridge项目依赖（package.json）
  - [ ] 13.4.2 更新所有导入语句
  - [ ] 13.4.3 更新文档和示例代码
  - [ ] 13.4.4 执行全面测试验证

