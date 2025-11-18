# 配置管理统一重构提案

## Why

当前项目中配置管理分散在多个服务中，造成以下问题：

1. **ConfigService.ts** - 基础配置服务，管理 `admin.json` 文件
2. **RuntimeConfigService.ts** - 运行时配置服务，包装 ConfigService，提供内存缓存和 LLMClient 懒加载
3. **LLMConfigService.ts** - LLM 特定配置服务，使用 SQLite 数据库存储
4. **ProactivityConfigService.ts** - 主动性配置服务，管理 `proactivity.json` 文件

**问题**：
- **功能重叠**：RuntimeConfigService 主要是 ConfigService 的包装，提供内存缓存功能
- **职责不清**：配置管理分散在多个服务中，难以统一管理
- **代码重复**：每个配置服务都有自己的单例模式、文件管理逻辑
- **维护困难**：需要同时维护多套配置服务
- **使用混乱**：不同模块使用不同的配置服务，缺乏统一入口

## What Changes

### 目标
统一配置管理，建立清晰的配置服务层次结构，减少代码重复，提高可维护性。

### 范围
1. **保留** `ConfigService` 作为基础配置服务（管理 `admin.json`）
2. **整合** `RuntimeConfigService` 的功能到 `ConfigService` 中（内存缓存、配置热更新）
3. **保留** `LLMConfigService` 作为专门的 LLM 配置服务（SQLite，已独立）
4. **保留** `ProactivityConfigService` 作为专门的主动性配置服务（独立文件）
5. **创建** 统一的配置管理器接口（可选，用于统一访问）

### 非目标
- 不改变 LLMConfigService 的 SQLite 存储方式（已独立且合理）
- 不改变 ProactivityConfigService 的独立文件存储（配置独立且合理）
- 不改变现有的配置格式和结构

## 影响范围

### 文件修改
- `src/services/ConfigService.ts` - 添加内存缓存和配置热更新功能
- `src/services/RuntimeConfigService.ts` - 重构为 ConfigService 的简单包装或删除
- 所有使用 `RuntimeConfigService` 的代码 - 改为使用 `ConfigService`

### 文件保留
- `src/services/LLMConfigService.ts` - 保留（SQLite 存储，已独立）
- `src/services/ProactivityConfigService.ts` - 保留（独立配置文件）

## 验收标准

1. ✅ ConfigService 提供内存缓存功能（替代 RuntimeConfigService）
2. ✅ ConfigService 支持配置热更新（无需重启）
3. ✅ 所有使用 RuntimeConfigService 的代码迁移到 ConfigService
4. ✅ RuntimeConfigService 被删除或简化为 ConfigService 的别名
5. ✅ 代码通过编译和测试
6. ✅ 配置功能正常工作（读取、更新、热更新）

