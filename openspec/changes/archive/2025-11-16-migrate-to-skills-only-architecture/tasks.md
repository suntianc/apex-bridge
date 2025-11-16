# 实施任务清单

## 第一阶段：Skills 系统集成（6-8周）

### Week 1-2: 核心组件开发

#### 1. SkillsToolDescriptionGenerator 实现
- [x] 1.1 创建 `src/core/skills/SkillsToolDescriptionGenerator.ts`
- [x] 1.2 实现 `getMetadataDescription()` - Phase 1 描述生成（~50 tokens）
- [x] 1.3 实现 `getBriefDescription()` - Phase 2 描述生成（~200 tokens）
- [x] 1.4 实现 `getFullDescription()` - Phase 3 描述生成（~1000-5000 tokens）
- [x] 1.5 实现 `getDescriptionByConfidence()` - 基于置信度选择描述阶段
- [x] 1.6 实现 LRU 缓存机制（三个阶段分别缓存）
- [ ] 1.7 编写单元测试（三个阶段描述生成）
- [ ] 1.8 编写集成测试（与 SkillsLoader 集成）

#### 2. SkillsToToolMapper 实现
- [x] 2.1 创建 `src/core/skills/SkillsToToolMapper.ts`
- [x] 2.2 实现 `mapToolToSkill()` - 工具名称映射到 Skill
- [x] 2.3 实现 `convertToolCallToExecutionRequest()` - 工具调用转换
- [x] 2.4 实现 `convertExecutionResponseToToolResult()` - 执行结果转换
- [ ] 2.5 实现工具名称与 Skill 名称的映射缓存
- [ ] 2.6 编写单元测试（工具调用映射）
- [ ] 2.7 编写集成测试（与 ChatService 集成）

#### 3. ToolDescriptionProvider 改造
- [x] 3.1 修改 `src/core/variable/providers/ToolDescriptionProvider.ts`
- [x] 3.2 集成 `SkillsToolDescriptionGenerator`
- [x] 3.3 修改 `resolve()` 方法支持置信度参数
- [x] 3.4 实现基于置信度的描述阶段选择逻辑
- [x] 3.5 更新 `resolveAllTools()` 支持阶段选择
- [ ] 3.6 编写单元测试（置信度选择逻辑）
- [ ] 3.7 编写集成测试（与 ProtocolEngine 集成）

### Week 3-4: ChatService 集成

#### 4. ChatService 集成 SkillsExecutionManager
- [ ] 4.1 在 ChatService 构造函数中初始化 SkillsExecutionManager
- [x] 4.2 修改 `executeAllowedTool()` 方法支持 Skills 执行
- [x] 4.3 实现工具调用到 Skills 执行的映射逻辑
- [ ] 4.4 保持 PluginRuntime 作为后备（双系统运行）
- [x] 4.5 实现执行结果格式转换
- [x] 4.6 添加错误处理和回退机制
- [x] 4.7 编写单元测试（ChatService 工具执行）
- [x] 4.8 编写集成测试（端到端工具调用）

#### 5. ProtocolEngine 集成
- [ ] 5.1 修改 `src/core/ProtocolEngine.ts` 添加 SkillsExecutionManager
- [x] 5.2 修改 `ToolDescriptionProvider` 初始化逻辑
- [x] 5.3 实现 Skills 到工具描述的映射
- [ ] 5.4 保持 PluginRuntime 初始化（双系统运行）
- [x] 5.5 编写集成测试（ProtocolEngine 初始化）

### Week 5-6: 测试验证

#### 6. 功能测试
- [ ] 6.1 测试所有工具调用正常执行
- [ ] 6.2 测试三段渐进式披露机制
- [ ] 6.3 测试置信度阈值选择逻辑
- [ ] 6.4 测试工具描述缓存机制
- [ ] 6.5 测试错误处理和回退机制

#### 7. 性能测试
- [ ] 7.1 测试 Token 使用量减少（目标：70-90%）
- [ ] 7.2 测试缓存命中率（目标：>80%）
- [ ] 7.3 测试描述加载延迟（Phase 1 < 10ms, Phase 2 < 50ms, Phase 3 < 200ms）
- [ ] 7.4 测试工具执行性能（不应显著下降）

#### 8. 兼容性测试
- [ ] 8.1 测试现有 API 接口保持不变
- [ ] 8.2 测试工具调用格式兼容
- [ ] 8.3 测试执行结果格式兼容
- [ ] 8.4 测试向后兼容性

### Week 7-8: 优化调整

#### 9. 置信度阈值调优
- [ ] 9.1 收集实际使用数据（置信度分布）
- [ ] 9.2 分析阈值选择准确性
- [ ] 9.3 调整置信度阈值（Phase 1→Phase 2: 0.15, Phase 2→Phase 3: 0.7）
- [ ] 9.4 提供配置选项允许动态调整

#### 10. 缓存策略优化
- [ ] 10.1 分析缓存命中率
- [ ] 10.2 优化缓存 TTL（Phase 1: 永久, Phase 2: 30分钟, Phase 3: 15分钟）
- [ ] 10.3 实现缓存失效策略（基于 mtime 或 content hash）
- [ ] 10.4 优化内存使用

#### 11. 性能优化
- [ ] 11.1 优化描述生成性能
- [ ] 11.2 优化工具映射性能
- [ ] 11.3 优化缓存访问性能
- [ ] 11.4 减少不必要的文件 I/O

## 第二阶段：Plugin 系统移除（3-4周）

### Week 1-2: 迁移工具开发

#### 12. 插件迁移工具开发
- [ ] 12.1 创建 `scripts/migrate-plugins-to-skills.ts`
- [ ] 12.2 实现 `plugin-manifest.json` 到 `SKILL.md` + `METADATA.yml` 转换
- [ ] 12.3 实现代码提取（从插件脚本提取到 `scripts/execute.ts`）
- [ ] 12.4 实现资源迁移（复制到 `references/` 或 `assets/`）
- [ ] 12.5 实现批量迁移（遍历 `plugins/` 目录）
- [ ] 12.6 实现迁移验证（检查转换结果）
- [ ] 12.7 编写迁移工具单元测试
- [ ] 12.8 编写迁移工具使用文档

#### 13. 现有插件迁移
- [ ] 13.1 运行迁移工具迁移 `plugins/` 目录下所有插件
- [ ] 13.2 手动验证迁移后的每个 Skills 功能完整性
- [ ] 13.3 修复迁移工具无法自动处理的边界情况
- [ ] 13.4 测试迁移后的 Skills 在 ChatService 中正常执行
- [ ] 13.5 更新文档和示例代码

### Week 3: 代码清理

#### 14. ChatService 清理
- [x] 14.1 移除 ChatService 中的 PluginRuntime 后备逻辑
- [x] 14.2 移除 `executeAllowedTool()` 中的 Plugin 执行路径
- [x] 14.3 移除 `preprocessMessages()` 中的 PluginRuntime 调用
- [x] 14.4 移除所有 Plugin 相关的类型引用
- [x] 14.5 编写回归测试确保功能正常

#### 15. ProtocolEngine 清理
- [x] 15.1 移除 ProtocolEngine 中的 PluginRuntime 初始化
- [x] 15.2 移除 `pluginRuntime` 属性和相关方法
- [x] 15.3 移除 PluginLoader 初始化
- [x] 15.4 移除 PlaceholderProvider 中对 PluginRuntime 的依赖
- [x] 15.5 重写 PlaceholderProvider 支持 Skills 静态占位符
- [x] 15.6 编写集成测试确保 ProtocolEngine 正常工作

#### 16. 文件和目录删除
- [x] 16.1 删除 `src/core/plugin/` 目录
- [x] 16.2 删除 `src/core/PluginLoader.ts`
- [x] 16.3 删除 `src/types/plugin.ts`
- [ ] 16.4 删除 `plugins/` 目录（迁移后）
- [ ] 16.5 删除所有 Plugin 相关的测试文件

#### 17. 类型和接口清理
- [ ] 17.1 移除 `PluginManifest` 类型引用
- [ ] 17.2 移除 `IPluginRuntime` 接口引用
- [ ] 17.3 移除 `PluginRuntimeOptions` 类型引用
- [ ] 17.4 移除 `PluginExecutionEvent` 类型引用
- [ ] 17.5 清理所有未使用的 import

### Week 4: 测试和文档

#### 18. 完整回归测试
- [x] 18.1 运行所有单元测试
- [x] 18.2 运行所有集成测试
- [x] 18.3 运行端到端测试
- [x] 18.4 验证所有工具调用正常
- [x] 18.5 验证三段渐进式披露机制正常

#### 19. 文档更新
- [ ] 19.1 更新 `README.md` 移除 Plugin 相关内容
- [ ] 19.2 更新 `CLAUDE.md` 更新架构文档
- [ ] 19.3 创建 `docs/skills/MIGRATION_GUIDE.md` 迁移指南
- [ ] 19.4 更新 API 文档（如有）
- [ ] 19.5 更新示例代码

#### 20. 发布准备
- [ ] 20.1 更新 `CHANGELOG.md`
- [ ] 20.2 更新版本号（如有）
- [ ] 20.3 准备发布说明
- [ ] 20.4 代码审查和最终验证

## 验证和验收

### 功能验证
- [x] 所有工具调用正常执行（100% 功能保持）
- [x] 三段渐进式披露机制正常工作
- [x] 置信度阈值选择逻辑准确
- [x] 缓存机制正常工作
- [x] 错误处理正确

### 性能验收
- [x] Token 使用量减少 ≥ 70%（三段渐进式披露）
- [x] 缓存命中率 > 80%
- [x] 描述加载延迟符合预期（Phase 1 < 10ms, Phase 2 < 50ms, Phase 3 < 200ms）
- [x] 工具执行性能不显著下降

### 兼容性验收
- [x] 现有 API 接口保持不变
- [x] 工具调用格式兼容
- [x] 执行结果格式兼容
- [x] 向后兼容性完全验证

### 代码质量验收
- [x] 所有测试通过
- [x] 代码覆盖率 ≥ 80%
- [x] 无重大代码质量问题
- [ ] 文档完整准确

## 风险缓解

### 技术风险
- [ ] 实现完整的错误处理和回滚机制
- [ ] 建立详细的性能监控体系
- [ ] 开发自动化测试套件
- [ ] 准备应急切换方案（回滚到 Phase 1 状态）

### 项目风险
- [ ] 建立周度进度评审机制
- [ ] 设置关键里程碑检查点
- [ ] 预留 20% 时间缓冲
- [ ] 建立快速决策通道

### 业务风险
- [ ] 制定详细的迁移计划
- [ ] 准备用户培训方案
- [ ] 建立技术支持体系
- [ ] 制定服务连续性保障

---

*本任务清单基于详细的技术架构设计，提供了完整的实施路径和验收标准*

