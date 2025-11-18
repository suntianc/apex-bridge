# LLM动态管理规范

## 变更类型
`ADDED` + `MODIFIED`

## 变更范围
- 模块：`src/core/LLMClient.ts` → `src/core/LLMManager.ts`
- 新增：`src/services/LLMConfigService.ts`
- 新增：`src/core/llm/adapters/` 目录
- 新增：`src/api/controllers/LLMController.ts`

## 目标
实现LLM厂商配置的持久化存储和热更新，配置存储在SQLite数据库，启动时加载到内存，支持运行时更新现有厂商配置。

## ADDED Requirements

### REQ-LLM-001: SQLite配置存储
**Given** 系统启动
**When** LLMConfigService初始化
**Then** 自动创建SQLite数据库和表结构

**表结构**:
```sql
CREATE TABLE llm_providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

#### Scenario: 数据库初始化
```
Given 系统首次启动
When LLMConfigService.getInstance()被调用
Then 自动创建llm_config.sqlite数据库文件
And 创建llm_providers表
And 表结构符合规范
```

### REQ-LLM-002: 配置加载到内存
**Given** 系统启动
**When** LLMManager初始化
**Then** 从SQLite加载所有enabled=1的配置到内存
**And** 为每个配置创建对应的适配器实例

#### Scenario: 启动时加载配置
```
Given SQLite中有3个enabled=1的厂商配置
When LLMManager构造函数被调用
Then 从SQLite加载3个配置
And 创建3个适配器实例
And 设置第一个为默认厂商
```

### REQ-LLM-003: 更新现有厂商配置
**Given** 厂商配置已存在（启动时已加载）
**When** PUT /api/llm/providers/:id 请求包含更新配置
**Then** 先更新SQLite数据库
**And** SQLite更新成功后，更新内存中的适配器实例
**And** 使用新配置重新创建适配器
**And** 返回成功

**配置格式**:
```json
{
  "config": {
    "baseURL": "https://api.openai.com/v1",
    "apiKey": "sk-new-key",
    "defaultModel": "gpt-4o-mini",
    "timeout": 60000
  },
  "enabled": true
}
```

**限制**:
- 不支持修改provider字段（厂商类型不可变更）
- 不支持添加新厂商（仅支持更新现有厂商）
- 不支持删除厂商（仅支持启用/禁用）

#### Scenario: 运行时更新配置
```
Given OpenAI厂商已配置（id=1，启动时已加载）
When PUT /api/llm/providers/1 {config: {apiKey: "sk-new-key"}}
Then SQLite更新记录（updated_at更新）
And 内存中OpenAIAdapter使用新配置重新创建
And 返回成功响应
```

### REQ-LLM-004: 厂商适配器类映射
**Given** 配置包含provider字段
**When** LLMManager创建适配器
**Then** 根据provider字段选择对应的适配器类：
- `openai` → `OpenAIAdapter`
- `deepseek` → `DeepSeekAdapter`
- `zhipu` → `ZhipuAdapter`
- `claude` → `ClaudeAdapter`
- `ollama` → `OllamaAdapter`
- `custom` → `CustomAdapter`

**And** 如果provider不存在，抛出错误

#### Scenario: 适配器创建
```
Given 配置包含provider: "openai"
When LLMAdapterFactory.create("openai", config)
Then 返回OpenAIAdapter实例
And 适配器使用提供的config初始化
```

### REQ-LLM-005: 配置验证
**Given** 更新厂商配置
**When** 验证配置格式
**Then** config字段必填且为有效JSON
**And** baseURL字段必填（如果provider不是claude）
**And** apiKey字段可选但建议提供
**And** provider字段不可修改（仅更新配置内容）

#### Scenario: 配置验证失败
```
Given 更新请求包含无效配置
When LLMConfigService.update()验证配置
Then 抛出验证错误
And 不更新SQLite
And 不更新内存
```

### REQ-LLM-006: 事务保证
**Given** 更新厂商配置
**When** SQLite更新失败
**Then** 不更新内存配置
**And** 返回错误信息

**When** SQLite更新成功但内存更新失败
**Then** 记录错误日志
**And** 尝试回滚SQLite更改（可选）

#### Scenario: SQLite更新失败回滚
```
Given 更新厂商配置
When SQLite更新失败（如数据库锁定）
Then 不更新内存配置
And 返回错误："Failed to update provider: database error"
And 原有配置保持不变
```

## MODIFIED Requirements

### REQ-LLM-007: LLMClient重构为LLMManager
**Given** 现有LLMClient实现
**When** 重构为LLMManager
**Then** 保持原有API接口兼容性（chat, streamChat, getModels）
**And** 构造函数改为从LLMConfigService加载配置
**And** 添加配置更新方法（updateProvider, reloadConfig）
**And** 不支持动态添加/删除厂商（仅支持更新现有配置）

#### Scenario: 向后兼容性
```
Given 代码使用LLMClient类型
When 导入LLMClient
Then 实际导入的是LLMManager（别名）
And 所有原有方法调用正常工作
And chat()、streamChat()、getModels()方法行为一致
```

