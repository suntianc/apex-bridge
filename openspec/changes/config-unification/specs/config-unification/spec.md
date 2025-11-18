# 配置管理统一规范

## Purpose

统一项目中的配置管理，建立清晰的配置服务层次结构，减少代码重复，提高可维护性。

## Requirements

### Requirement 1: ConfigService 作为基础配置服务

**描述**: `ConfigService` 必须提供完整的配置管理功能，包括文件读写、内存缓存、配置热更新。

**约束**:
- `ConfigService` 必须管理 `admin.json` 配置文件
- `ConfigService` 必须提供内存缓存功能（避免频繁读取文件）
- `ConfigService` 必须支持配置热更新（更新后自动清除缓存）
- `ConfigService` 必须提供同步和异步的配置更新方法

**Scenario**: 
- 当首次调用 `readConfig()` 时，从文件读取并缓存到内存
- 当再次调用 `readConfig()` 时，返回缓存的配置（如果缓存存在）
- 当调用 `updateConfigAsync()` 时，更新文件并清除缓存
- 当调用 `reloadConfig()` 时，清除缓存并重新从文件读取

### Requirement 2: RuntimeConfigService 功能整合

**描述**: `RuntimeConfigService` 的功能必须整合到 `ConfigService` 中，或简化为 ConfigService 的包装。

**约束**:
- `RuntimeConfigService` 的内存缓存功能必须由 `ConfigService` 提供
- `RuntimeConfigService` 的配置热更新功能必须由 `ConfigService` 提供
- `RuntimeConfigService` 的 LLMClient 懒加载功能可以保留（如果仍需要）或移除

**Scenario**:
- 当代码需要加载配置时，使用 `ConfigService.loadConfig()` 而不是 `RuntimeConfigService.loadConfig()`
- 当代码需要更新配置时，使用 `ConfigService.updateConfigAsync()` 而不是 `RuntimeConfigService.updateConfig()`
- 当代码需要获取当前配置时，使用 `ConfigService.getCurrentConfig()` 而不是 `RuntimeConfigService.getCurrentConfig()`

### Requirement 3: 配置服务职责划分

**描述**: 不同配置服务必须有明确的职责划分。

**约束**:
- `ConfigService` 负责基础系统配置（`admin.json`）
- `LLMConfigService` 负责 LLM 厂商配置（SQLite 数据库）
- `ProactivityConfigService` 负责主动性调度配置（`proactivity.json`）
- 各配置服务之间不相互依赖（除了 ConfigService 可能被其他服务使用）

**Scenario**:
- 当需要读取系统配置时，使用 `ConfigService`
- 当需要管理 LLM 厂商配置时，使用 `LLMConfigService`
- 当需要管理主动性调度配置时，使用 `ProactivityConfigService`

### Requirement 4: 向后兼容

**描述**: 配置统一后必须保持向后兼容，不破坏现有功能。

**约束**:
- 配置格式和结构不能改变
- 配置文件的路径和名称不能改变
- 配置 API 的行为不能改变（除了性能优化）

**Scenario**:
- 现有的配置文件可以正常读取
- 现有的配置更新代码可以正常工作
- 现有的配置验证逻辑可以正常工作

## Delta for Config Unification

### ADDED Requirements

1. **ConfigService 内存缓存** - ConfigService 必须提供内存缓存功能
2. **ConfigService 配置热更新** - ConfigService 必须支持配置热更新

### UPDATED Requirements

1. **ConfigService 功能增强** - 添加内存缓存和配置热更新功能
2. **RuntimeConfigService 重构** - 功能整合到 ConfigService 或简化为包装

### REMOVED Requirements

1. **RuntimeConfigService 独立实现** - RuntimeConfigService 不再作为独立的配置服务（功能整合到 ConfigService）

