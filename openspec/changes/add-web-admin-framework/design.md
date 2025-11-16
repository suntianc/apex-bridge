## Context

当前系统所有配置都需要通过手动编辑.env文件完成，用户体验差且容易出错。需要开发Web管理后台，提供可视化的配置管理和系统监控能力。同时需要支持节点管理功能，为后续的分布式节点生态（apex-worker、apex-companion）做准备。

## Goals / Non-Goals

### Goals
- 创建现代化的Web管理后台基础框架
- UI设计风格参考Anthropic官网（简洁、现代、大量留白、优雅排版、柔和色彩）
- 实现设置向导，降低首次使用门槛
- **实现配置管理界面，完全替代.env文件，所有配置（包括系统参数）迁移到Web界面**
- 实现节点管理界面，支持节点注册、状态监控、配置管理
- 实现Dashboard，展示系统状态和统计信息
- 提供.env迁移工具，帮助现有用户迁移配置

### Non-Goals
- MVP阶段不实现高级监控功能（性能分析、告警系统等）
- MVP阶段不实现配置版本控制和回滚
- MVP阶段不实现多管理员和权限管理（后续扩展）
- 不保持.env兼容性（完全取消.env配置读取）

## Decisions

### 决策1: UI设计风格
**选择**: 参考Anthropic官网设计风格
**理由**:
- Anthropic官网设计优雅、现代、专业
- 简洁的界面降低认知负担
- 大量留白提升可读性
- 柔和的色彩方案适合管理界面
**实现**:
- 使用Tailwind CSS自定义主题，参考Anthropic的色彩方案
- 采用卡片式布局，清晰的层次结构
- 使用柔和的阴影和圆角
- 注重留白和排版

### 决策2: 配置管理策略（更新）
**选择**: **完全取消.env业务配置，只使用管理界面配置**
**理由**:
- 配置统一管理，单一数据源，避免冲突
- 简化配置读取逻辑，无需处理优先级
- 提供更好的用户体验（可视化配置）
- 降低配置错误率（表单验证 vs 手动编辑）
**实现**:
- **完全取消.env中的所有配置项**（包括业务配置和系统参数）
- **所有配置统一迁移到管理界面**（存储在config/admin-config.json）
- 管理界面配置持久化到 `config/admin-config.json`
- 首次启动时自动创建默认配置模板（如果config/admin-config.json不存在）
- 设置向导引导用户完成首次配置
- ConfigService统一管理配置读取和写入

**首次启动流程**:
1. 系统检测 `config/admin-config.json` 是否存在
2. 如果不存在，创建默认配置模板（所有配置项为空或默认值）
3. 系统启动后自动重定向到设置向导
4. 用户完成设置向导后，配置保存到 `config/admin-config.json`
5. 后续启动直接从JSON文件读取配置

**迁移方案**:
- 提供迁移工具：检测现有.env文件，自动导入到管理界面配置
- 在设置向导中提供"从.env导入"选项

### 决策3: 配置迁移范围（更新）
**选择**: **所有配置项都迁移到管理界面，完全取消.env业务配置**
**迁移的配置项**:
- LLM提供商配置（所有提供商的API Key、Base URL、Model等）
- 认证配置（VCP_KEY、VCP_API_KEY）
- 插件配置（PLUGIN_DIR、PLUGIN_AUTO_LOAD）
- 日志配置（LOG_LEVEL、LOG_FILE）
- 性能配置（WORKER_POOL_SIZE、REQUEST_TIMEOUT、MAX_REQUEST_SIZE）
- 缓存配置（Redis相关，如果启用）
- 异步结果清理配置（所有ASYNC_RESULT_*）
- RAG配置（所有RAG_*）
- Memory Service配置（MEMORY_SYSTEM、VERIFY_MEMORY_SERVICE）
- Rerank配置（所有RERANK_*）

**系统参数处理**:
- **采用方案A**：系统参数也迁移到管理界面，修改后提示需要重启服务
  - PORT、HOST（服务器绑定参数）
  - NODE_ENV（运行环境）
  - DEBUG_MODE（调试模式）
- **理由**：
  - 完全统一配置管理，单一数据源
  - 提供"应用配置"功能，批量重启服务
  - 更好的用户体验（所有配置在一个地方）
  - 简化配置读取逻辑（无需处理.env和管理界面优先级）

**实现细节**：
- 修改系统参数（PORT、HOST）后，提示用户需要重启服务
- 提供"应用并重启"功能（可选，高级用户）
- 首次启动时使用默认值（PORT=8088, HOST=0.0.0.0）

### 决策4: 节点管理功能
**选择**: 实现基础的节点管理界面，为后续分布式节点做准备
**理由**:
- 为Phase 3的节点生态（apex-worker、apex-companion）打基础
- 提供节点注册和监控能力
- 支持节点配置管理
**实现**:
- 节点列表页面（显示所有已注册节点）
- 节点状态监控（在线/离线、健康状态）
- 节点详情页面（配置、日志、性能指标）
- 节点管理API（注册、注销、更新配置）

### 决策5: 配置持久化方案
**选择**: 使用JSON文件存储所有配置（`config/admin-config.json`），完全替代.env业务配置
**理由**:
- 简单直接，无需数据库
- 易于备份和迁移
- 统一配置管理，单一数据源
- JSON格式易于阅读和编辑（如果需要）
**实现**:
```typescript
// config/admin-config.json
{
  "server": {
    "port": 8088,
    "host": "0.0.0.0",
    "nodeEnv": "development",
    "debugMode": false
  },
  "auth": {
    "vcpKey": "sk-intellicore-xxx",
    "apiKeys": ["sk-intellicore-xxx"]
  },
  "llm": {
    "defaultProvider": "deepseek",
    "deepseek": {
      "apiKey": "xxx",
      "baseURL": "https://api.deepseek.com/v1",
      "defaultModel": "deepseek-chat",
      "timeout": 60000,
      "maxRetries": 3
    }
    // ... 其他提供商
  },
  "plugins": {
    "directory": "./plugins",
    "autoLoad": true
  },
  "logging": {
    "level": "info",
    "file": "./logs/intellicore.log"
  },
  "performance": {
    "workerPoolSize": 4,
    "requestTimeout": 60000,
    "maxRequestSize": "50mb"
  },
  "rag": {
    "enabled": true,
    "storagePath": "./vector_store",
    "vectorizer": {
      "apiUrl": "https://api.siliconflow.cn/v1",
      "apiKey": "xxx",
      "model": "Qwen/Qwen3-Embedding-4B",
      "dimensions": 2560
    }
  },
  // ... 其他配置
}
```

**首次启动处理**:
- 系统启动时检查 `config/admin-config.json` 是否存在
- 如果不存在，自动创建默认模板（所有字段为空或默认值）
- 检查配置完整性，未完成设置时重定向到设置向导

### 决策6: 技术栈选择
**选择**: React 18 + TypeScript + Vite + shadcn/ui + Tailwind CSS + Zustand
**理由**:
- React 18: 成熟稳定，生态丰富
- TypeScript: 类型安全，与后端保持一致
- Vite: 快速构建，优秀开发体验
- shadcn/ui: 高质量组件库，易于定制（符合Anthropic风格）
- Tailwind CSS: 快速开发，易于实现自定义主题
- Zustand: 轻量级状态管理，适合中小型应用

## Risks / Trade-offs

### 风险1: 首次启动问题
**风险**: 完全取消.env后，首次启动时系统可能无法读取配置
**缓解**:
- 自动创建默认配置模板（config/admin-config.json）
- 设置向导在首次启动时强制引导
- 提供最小可运行配置（所有配置项有合理默认值）
- 系统检测到未完成设置时，自动重定向到设置向导

### 风险2: 配置丢失或损坏
**风险**: JSON配置文件丢失或格式错误
**缓解**:
- 定期自动备份配置文件（config/admin-config.json.backup）
- 支持配置导出/导入功能
- 配置文件损坏时自动恢复默认配置
- 提供配置验证机制（JSON Schema验证）
- 配置写入前先备份现有配置

### 风险3: 容器化部署兼容性
**风险**: Docker等容器环境通常使用环境变量传递配置
**缓解**:
- 提供配置初始化脚本（读取环境变量并写入JSON配置）
- 支持从环境变量导入配置（在设置向导中）
- 文档说明如何在容器环境中使用管理界面配置
- 提供.env到JSON的迁移工具

### 风险3: UI风格实现偏差
**风险**: 实际UI与Anthropic风格差距较大
**缓解**:
- 深入研究Anthropic官网设计元素
- 创建设计系统文档
- 使用Tailwind自定义主题，精确匹配色彩和间距

### 风险4: 性能影响
**风险**: 配置读取增加延迟
**缓解**:
- 配置缓存机制
- 启动时一次性加载配置
- 配置变更时热更新（无需重启）

## UI设计规范（参考Anthropic）

### 色彩方案
- **主色调**: 柔和的蓝色系（参考Anthropic）
- **背景色**: 浅灰色（#F9FAFB）
- **卡片背景**: 白色（#FFFFFF）
- **文字颜色**: 深灰色（#1F2937）
- **强调色**: 蓝色（#3B82F6）
- **成功色**: 绿色（#10B981）
- **警告色**: 黄色（#F59E0B）
- **错误色**: 红色（#EF4444）

### 排版
- **字体**: Inter 或 System Font Stack
- **字号**: 正文14px，标题18-24px，小字12px
- **行高**: 1.5-1.75
- **字重**: 正文400，标题600-700

### 间距
- **页面边距**: 24px-32px
- **卡片内边距**: 24px
- **元素间距**: 16px、24px、32px（8px倍数）
- **大量留白**: 卡片之间、区块之间保持充足间距

### 组件样式
- **卡片**: 白色背景，柔和阴影，圆角8-12px
- **按钮**: 扁平化设计，圆角6px，hover效果柔和
- **输入框**: 细边框，圆角6px，focus状态清晰
- **导航**: 侧边栏式，清晰的层级结构

## 配置管理API设计

### 配置读取API
```
GET /api/admin/config
- 返回所有可配置项及其当前值
- 从config/admin-config.json读取
```

### 配置更新API
```
PUT /api/admin/config
- 更新指定配置项
- 验证配置有效性
- 持久化到config/admin-config.json
- 热更新（如果支持）或提示重启
- 自动备份原配置（.backup文件）
```

### 配置导入/导出API
```
GET /api/admin/config/export
- 导出当前配置为JSON文件

POST /api/admin/config/import
- 导入配置JSON文件
- 验证并应用配置

POST /api/admin/config/migrate-from-env
- 从.env文件导入配置（迁移工具）
- 检测.env文件并转换格式
- 合并到现有配置（如果有冲突，提示用户）
```

### 配置重置API
```
POST /api/admin/config/reset
- 重置为默认配置
- 创建备份后重置
```

### 首次启动检测API
```
GET /api/setup/status
- 检查是否已完成首次设置
- 返回：{ "completed": true/false, "hasEnvFile": true/false }
```

## 节点管理API设计

### 节点列表
```
GET /api/admin/nodes
- 返回所有已注册节点列表
- 包含节点状态、健康信息
```

### 节点详情
```
GET /api/admin/nodes/:nodeId
- 返回节点详细信息
- 配置、日志、性能指标
```

### 节点注册
```
POST /api/admin/nodes
- 注册新节点
- 验证节点信息
```

### 节点更新
```
PUT /api/admin/nodes/:nodeId
- 更新节点配置
```

### 节点注销
```
DELETE /api/admin/nodes/:nodeId
- 注销节点
```

