# LLM动态管理与系统精简提案

## Why

当前系统存在以下问题：
1. LLM配置硬编码在配置文件中，无法动态添加和管理，需要重启服务才能生效
2. ProtocolEngine包含不必要的变量Provider（AgentProvider、DiaryProvider），增加系统复杂度
3. ChatService仍保留可选但未使用的依赖（PersonalityEngine、EmotionEngine、MemoryService），代码冗余
4. Skills执行体系缺少细粒度的沙箱控制配置，无法针对特定Skill选择执行方式

这些问题导致系统维护成本高、代码复杂度增加、灵活性不足。

## What Changes

### 新增功能
- LLM配置数据库服务（SQLite）
- LLM配置管理API（仅支持查询和更新）
- 每个LLM厂商独立适配器类
- Skills沙箱执行配置

### 移除功能
- ProtocolEngine: AgentProvider、DiaryProvider
- ChatService: PersonalityEngine、EmotionEngine、MemoryService相关代码

### 修改功能
- LLMClient重构为LLMManager，支持配置持久化和热更新
- SkillsExecutionManager支持基于配置的沙箱控制

## 目标

1. **LLM配置管理**：配置持久化到SQLite，启动时加载到内存，支持运行时更新现有厂商配置（不支持添加/删除）
2. **ProtocolEngine精简**：移除AgentProvider、DiaryProvider，简化变量解析系统
3. **ChatService精简**：完全移除PersonalityEngine、EmotionEngine、MemoryService相关代码
4. **Skills沙箱配置**：每个Skill支持独立配置是否使用沙箱执行

## 范围

### 新增功能
- LLM配置数据库服务（SQLite）
- LLM配置管理API（仅支持查询和更新）
- 每个LLM厂商独立适配器类
- Skills沙箱执行配置

### 移除功能
- ProtocolEngine: AgentProvider、DiaryProvider
- ChatService: PersonalityEngine、EmotionEngine、MemoryService相关代码

### 修改功能
- LLMClient重构为LLMManager，支持配置持久化和热更新
- SkillsExecutionManager支持基于配置的沙箱控制

## 非目标

- 不修改Skills体系的其他部分
- 不修改ABP协议解析逻辑
- 不修改WebSocket系统
- 不修改其他服务层组件

## 预期收益

- **可维护性提升**：LLM配置集中管理，持久化存储
- **代码精简**：移除未使用的依赖，减少代码复杂度
- **灵活性提升**：Skills可选择性使用沙箱，提升性能
- **数据持久化**：LLM配置持久化，重启后自动恢复

## 相关规范

- 影响规范：`llm-management`, `protocol-variables`, `chat-pipeline`, `skills-execution`
- 新增规范：`llm-dynamic-config`, `skills-sandbox-config`

