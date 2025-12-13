# ACE架构配置指南

## 概述

ACE（Autonomous Cognitive Engine）架构是ApexBridge的核心智能编排系统，支持L1-L6层级架构的智能决策和优化。本指南详细说明如何配置和使用ACE架构。

## 配置文件说明

### 1. admin-config.json
主配置文件，包含完整的ACE配置选项。
- **用途**: 生产环境使用
- **特点**: 包含所有必要的ACE配置，支持热更新

### 2. admin-config-template.json
模板配置文件，提供完整的配置选项参考。
- **用途**: 配置参考和快速入门
- **特点**: 包含默认配置值，便于复制和修改

### 3. admin-config-example.json
示例配置文件，展示典型配置场景。
- **用途**: 学习参考和最佳实践
- **特点**: 包含生产环境建议配置

## ACE配置结构详解

### 基本结构

```json
{
  "ace": {
    "enabled": true,
    "orchestration": { ... },
    "layers": { ... },
    "memory": { ... },
    "optimization": {skills": { ... },
    "local ... },
    " }
  }
}
```

### 1. Implementation": { ...编排配置 (orchestration)

```json
"orchestration": {
  "enabled": true,    // 是否启用ACE编排
  "mode": "full"      // 编排模式: full/minimal/custom
}
```

**模式说明**:
- `full`: 全功能模式，所有层级启用，适合复杂任务
- `minimal`: 最小化模式，仅启用必要层级，性能优先
- `custom`: 自定义模式，根据需要手动配置各层级

### 2. 层级配置 (layers)

ACE架构包含L1-L6六个层级，每个层级负责不同的认知和执行功能：

#### L1: 渴望层（道德约束层）
```json
"l1": {
  "enabled": true,
  "constitutionPath": "./config/constitution.md",  // 宪法文件路径
  "modelSource": "sqlite"
}
```
**职责**: 伦理判断、道德约束、价值观对齐
**建议模型**: GPT-4, Claude-3.5-Sonnet, Claude-3-Opus

#### L2: 全球战略层
```json
"l2": {
  "enabled": true,
  "modelSource": "sqlite"
}
```
**职责**: 长期规划、世界模型维护、宏观决策
**建议模型**: GPT-4-Turbo, Claude-3-Opus

#### L3: 代理模型层
```json
"l3": {
  "enabled": true,
  "modelSource": "sqlite"
}
```
**职责**: 自我认知、能力边界管理、反思能力
**建议模型**: GPT-4, Claude-3-Haiku

#### L4: 执行功能层
```json
"l4": {
  "enabled": true,
  "modelSource": "sqlite"
}
```
**职责**: 任务拆解、流程控制、步骤规划
**建议模型**: GPT-4-Turbo, Claude-3-Sonnet

#### L5: 认知控制层
```json
"l5": {
  "enabled": true,
  "modelSource": "sqlite",
  "fallbackToEvolution": true  // 允许降级到evolution模型
}
```
**职责**: 快速推理、Scratchpad管理、注意力控制
**建议模型**: Llama-3-8B-Instruct, GPT-3.5-Turbo, Claude-3-Haiku

#### L6: 任务执行层
```json
"l6": {
  "enabled": true,
  "useLLM": false  // L6通常不使用LLM
}
```
**职责**: 工具执行、直接操作、具体任务实施
**特点**: 通常不调用LLM，直接执行工具和操作

### 3. 内存配置 (memory)

```json
"memory": {
  "provider": "lancedb",     // 内存提供者: lancedb/memory/custom
  "vectorDbPath": "./.data", // 向量数据库路径
  "collectionPrefix": "apex_bridge"  // 集合名前缀
}
```

**提供者说明**:
- `lancedb`: 向量数据库，适合大规模数据存储
- `memory`: 内存存储，速度快但数据不持久化
- `custom`: 自定义实现

### 4. 优化配置 (optimization)

```json
"optimization": {
  "fastTrackSimpleTasks": true,        // 简单任务快速通道
  "l5ScratchpadCompression": true,     // L5层Scratchpad压缩
  "l6NonLLMExecution": true            // L6层非LLM执行优化
}
```

**优化选项**:
- `fastTrackSimpleTasks`: 启用后，简单任务绕过复杂层级
- `l5ScratchpadCompression`: 压缩L5层中间结果，节省内存
- `l6NonLLMExecution`: L6层直接执行，不调用LLM

### 5. 技能系统配置 (skills)

```json
"skills": {
  "autoCleanupEnabled": true,    // 启用技能自动清理
  "cleanupTimeoutMs": 300000,    // 清理超时时间(5分钟)
  "maxActiveSkills": 50          // 最大并发活跃技能数
}
```

### 6. 本地化实现配置 (localImplementation)

```json
"localImplementation": {
  "enabled": true,
  "aceCore": {
    "reflectionCycleInterval": 60000,  // 反思周期间隔(1分钟)
    "maxSessionAge": 86400000          // 最大会话年龄(24小时)
  },
  "useEventBus": true,          // 使用事件总线
  "useLLMManager": true,        // 使用LLM管理器
  "useSQLiteConfig": true       // 使用SQLite配置存储
}
```

## 配置最佳实践

### 1. 生产环境配置

**安全性**:
- 修改所有默认密钥和API密钥
- 配置适当的JWT过期时间
- 启用认证和限流

**性能**:
- 根据硬件资源调整workerPoolSize
- 设置合理的requestTimeout
- 启用Redis缓存（如果可用）

**ACE架构**:
- 全功能模式适合复杂任务
- 根据需要启用或禁用各层级
- L6层通常不需要LLM

### 2. 开发环境配置

**易用性**:
- 可以使用默认配置快速启动
- 启用详细日志便于调试
- 关闭不必要的功能

**测试**:
- 禁用ACE架构进行基础功能测试
- 启用完整ACE进行集成测试

### 3. 层级模型配置

每个层级都需要在SQLite数据库中配置相应的模型：

1. 通过API添加LLM提供商
2. 通过API添加模型
3. 使用AceLayerConfigService设置层级模型

示例:
```typescript
const aceLayerService = new AceLayerConfigService();
// 设置GPT-4为L1层模型
aceLayerService.setModelAsLayer(1, 'l1');
```

## 配置验证

### 1. 语法验证

使用提供的测试脚本：
```bash
node test-ace-config.js
```

### 2. 配置加载测试

在代码中验证配置：
```typescript
const configService = ConfigService.getInstance();
const config = configService.readConfig();
const validation = configService.validateConfig(config);

if (!validation.valid) {
  console.error('配置错误:', validation.errors);
}

if (validation.warnings) {
  console.warn('配置警告:', validation.warnings);
}
```

### 3. 动态更新测试

测试配置热更新：
```typescript
const updatedConfig = await configService.updateConfigAsync({
  ace: {
    enabled: false
  }
});
```

## 常见问题

### Q: ACE架构无法启动？
A: 检查以下项：
1. 确认constitution.md文件存在
2. 验证SQLite中是否配置了evolution模型
3. 检查日志中的错误信息

### Q: L1层宪法文件路径错误？
A: 确保路径正确，建议使用相对路径：
```json
"constitutionPath": "./config/constitution.md"
```

### Q: 如何禁用某个层级？
A: 设置enabled为false：
```json
"l3": {
  "enabled": false,
  "modelSource": "sqlite"
}
```

### Q: 性能优化建议？
A:
1. 启用`fastTrackSimpleTasks`
2. 启用`l5ScratchpadCompression`
3. 禁用不必要的层级
4. 使用Redis缓存

## 升级指南

### 从旧版本升级

1. 备份现有配置
2. 参考模板文件添加ACE配置节
3. 迁移模型配置到SQLite
4. 测试配置加载
5. 逐步启用各层级

### 配置迁移工具

可以使用以下方法迁移配置：
```typescript
const oldConfig = readOldConfigFile();
const newConfig = {
  ...oldConfig,
  ace: {
    enabled: true,
    // ... 其他ACE配置
  }
};
writeNewConfigFile(newConfig);
```

## 更多信息

- [ACE架构实现方案](./docs/ace-implementation.md)
- [ACE层级配置API](./docs/ace-api.md)
- [Skills系统文档](./docs/skills.md)
- [API文档](./docs/api.md)
