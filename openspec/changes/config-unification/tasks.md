# 配置管理统一重构任务清单

## Task 1: 增强 ConfigService 功能

### Task 1.1: 添加内存缓存功能
- 在 `ConfigService` 中添加 `cachedConfig` 属性
- 实现 `loadConfig()` 方法（从文件读取并缓存到内存）
- 实现 `getCurrentConfig()` 方法（返回缓存的配置）
- 实现 `reloadConfig()` 方法（清除缓存并重新加载）

### Task 1.2: 添加配置热更新功能
- 实现 `updateConfigAsync()` 方法（已存在，确认功能完整）
- 实现配置变更通知机制（可选，用于热更新）
- 确保配置更新后自动清除缓存

### Task 1.3: 添加 LLMClient 懒加载功能（可选）
- 如果 RuntimeConfigService 的 LLMClient 懒加载功能仍需要，可以保留
- 或者将 LLMClient 初始化逻辑移到 LLMManager 中（已实现）

## Task 2: 重构 RuntimeConfigService

### Task 2.1: 分析 RuntimeConfigService 的使用
- 使用 `grep` 查找所有 `RuntimeConfigService.getInstance()` 的调用
- 分析每个使用场景，确定迁移方案

### Task 2.2: 迁移到 ConfigService
- 将 `RuntimeConfigService.loadConfig()` 调用改为 `ConfigService.loadConfig()`
- 将 `RuntimeConfigService.getCurrentConfig()` 调用改为 `ConfigService.getCurrentConfig()`
- 将 `RuntimeConfigService.updateConfig()` 调用改为 `ConfigService.updateConfigAsync()`
- 将 `RuntimeConfigService.reloadConfig()` 调用改为 `ConfigService.reloadConfig()`

### Task 2.3: 处理 LLMClient 懒加载
- 如果 RuntimeConfigService 的 `getLLMClient()` 仍在使用，考虑：
  - 方案A：将逻辑移到 ConfigService
  - 方案B：直接在需要的地方使用 `new LLMManager()`（已支持懒加载）
  - 方案C：保留 RuntimeConfigService 但简化为仅提供 LLMClient 懒加载

### Task 2.4: 删除或简化 RuntimeConfigService
- 如果所有功能都已迁移，删除 `RuntimeConfigService.ts`
- 或者简化为 ConfigService 的简单包装（向后兼容）

## Task 3: 更新所有引用

### Task 3.1: 更新导入语句
- 将所有 `import { RuntimeConfigService } from './services/RuntimeConfigService'` 改为 `import { ConfigService } from './services/ConfigService'`
- 更新所有使用 RuntimeConfigService 的代码

### Task 3.2: 更新方法调用
- 更新所有 `RuntimeConfigService.getInstance()` 为 `ConfigService.getInstance()`
- 更新所有方法调用以匹配 ConfigService 的 API

### Task 3.3: 验证功能
- 测试配置读取功能
- 测试配置更新功能
- 测试配置热更新功能（如果实现）

## Task 4: 文档更新

### Task 4.1: 更新代码注释
- 更新 ConfigService 的注释，说明内存缓存和热更新功能
- 更新架构文档，说明配置服务的层次结构

### Task 4.2: 更新架构文档
- 在 ARCHITECTURE_ANALYSIS.md 中说明统一的配置管理策略
- 说明 ConfigService、LLMConfigService、ProactivityConfigService 的职责划分

## Task 5: 测试与验证

### Task 5.1: 单元测试
- 测试 ConfigService 的内存缓存功能
- 测试 ConfigService 的配置更新功能
- 测试配置热更新（如果实现）

### Task 5.2: 集成测试
- 测试配置读取和更新流程
- 测试配置变更后的服务重新加载

### Task 5.3: 验证向后兼容
- 确保所有使用配置的代码功能正常
- 确保配置格式和结构未改变

