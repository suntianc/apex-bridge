# LLMManager 测试用例 (LLMManager Test Cases)

> **模块**: LLMManager (LLM 管理器 - 新架构)  
> **优先级**: P0  
> **架构版本**: v2.0 (两级配置：提供商+模型)  
> **最后更新**: 2025-11-18

## 📋 测试概述

本文档包含 LLMManager 模块的详细测试用例，基于新的两级配置架构（提供商 + 模型）和多模型类型支持。

### 测试范围

- ✅ LLM 管理器初始化
- ✅ 多提供商加载
- ✅ 多模型类型（NLP, Embedding, Rerank）
- ✅ 模型自动选择
- ✅ 默认模型使用
- ✅ 流式响应
- ✅ 配置热更新
- ✅ 错误处理

### 新架构特点

| 特性 | 说明 |
|------|------|
| **两级配置** | 提供商 + 模型分离 |
| **多模型类型** | NLP, Embedding, Rerank, Image, Audio |
| **ModelRegistry** | 内存缓存，快速查询 |
| **灵活端点** | 根据模型类型自动选择 API 端点 |

### 前置条件

- ApexBridge 服务已启动
- LLMConfigService 已初始化
- ModelRegistry 已加载
- 至少配置一个提供商和模型

---

## LLM 初始化测试

### 用例 LLM-001: LLMManager 初始化和提供商加载

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证 LLMManager 从 SQLite 加载提供商配置并初始化。

#### 测试步骤

1. 确保数据库有配置
2. 启动服务
3. 观察日志

```bash
# 查看数据库配置
node scripts/check-db-structure.js

# 启动服务并查看 LLM 初始化日志
npm run dev 2>&1 | grep -i "LLM"
```

#### 预期日志

```
🤖 Initializing LLM Manager (new architecture)...
✅ Loaded provider: deepseek (DeepSeek)
✅ Loaded 1 LLM providers
✅ ModelRegistry initialized
```

#### 验证点

- [ ] LLMManager 初始化成功
- [ ] 从数据库加载提供商
- [ ] ModelRegistry 初始化成功
- [ ] 日志显示加载的提供商数量

#### 通过标准

LLMManager 成功初始化，加载所有启用的提供商。

---

### 用例 LLM-002: ModelRegistry 缓存机制

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证 ModelRegistry 的模型缓存机制。

#### 测试步骤

```bash
# 启动服务
npm run dev &
sleep 5

# 多次查询默认模型（应使用缓存）
for i in {1..5}; do
  time curl -s "http://localhost:8088/api/llm/models/default?type=nlp" > /dev/null
done
```

#### 预期结果

- 首次查询加载数据
- 后续查询使用缓存
- 响应时间稳定且快速

#### 验证点

- [ ] ModelRegistry 缓存启用
- [ ] 后续查询使用缓存
- [ ] 响应时间 < 10ms
- [ ] 60秒后自动刷新

#### 通过标准

缓存机制正常工作，性能优秀。

---

## 多模型类型测试

### 用例 LLM-003: NLP 模型选择和使用

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证 NLP 模型的自动选择和使用。

#### 测试步骤

**测试 1: 使用默认 NLP 模型**

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好"}
    ]
  }'
```

**测试 2: 指定提供商**

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "你好"}],
    "provider": "deepseek"
  }'
```

**测试 3: 指定具体模型**

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "你好"}],
    "provider": "deepseek",
    "model": "deepseek-coder"
  }'
```

#### 预期结果

- 测试 1: 使用默认 NLP 模型 (deepseek-chat)
- 测试 2: 使用 DeepSeek 的默认模型
- 测试 3: 使用指定的 deepseek-coder 模型

#### 验证点

- [ ] 默认模型选择正确
- [ ] 指定提供商生效
- [ ] 指定模型生效
- [ ] 日志显示使用的模型

#### 通过标准

模型选择逻辑正确，所有方式都能正常工作。

---

### 用例 LLM-004: Embedding 模型使用（待 RAG 集成）

**优先级**: P1  
**类型**: 功能测试

#### 测试目标

验证 Embedding 模型的查询和使用。

#### 测试步骤

```bash
# 查询默认 Embedding 模型
curl "http://localhost:8088/api/llm/models/default?type=embedding" | jq
```

#### 预期结果

```json
{
  "success": true,
  "model": {
    "provider": "openai",
    "modelKey": "text-embedding-ada-002",
    "modelType": "embedding",
    "baseConfig": {
      "baseURL": "https://api.openai.com/v1",
      "apiEndpointSuffix": "/embeddings"
    }
  }
}
```

#### 验证点

- [ ] 返回默认 Embedding 模型
- [ ] 包含完整配置信息
- [ ] API 端点后缀正确

#### 通过标准

能够正确查询 Embedding 模型配置。

---

### 用例 LLM-005: 多模型类型共存

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证同一提供商可以有多种类型的模型。

#### 测试步骤

```bash
# 为 DeepSeek 添加 Embedding 模型
curl -X POST http://localhost:8088/api/llm/providers/1/models \
  -H "Content-Type: application/json" \
  -d '{
    "modelKey": "deepseek-embeddings",
    "modelName": "DeepSeek Embeddings",
    "modelType": "embedding",
    "modelConfig": {"dimensions": 1024},
    "apiEndpointSuffix": "/embeddings",
    "enabled": true,
    "isDefault": true
  }'

# 查看 DeepSeek 的所有模型
curl http://localhost:8088/api/llm/providers/1/models | jq
```

#### 预期结果

DeepSeek 包含多种类型的模型：
- deepseek-chat (nlp)
- deepseek-coder (nlp)
- deepseek-embeddings (embedding)

#### 验证点

- [ ] Embedding 模型创建成功
- [ ] 不影响 NLP 模型
- [ ] 每种类型有独立的默认模型
- [ ] API 端点后缀不同

#### 通过标准

同一提供商可以有多种类型的模型，互不干扰。

---

## API 端点适配测试

### 用例 LLM-006: 端点自动选择

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证根据模型类型自动选择正确的 API 端点。

#### 测试步骤

**查看端点配置**:

```bash
# 查看 NLP 模型的端点
curl http://localhost:8088/api/llm/models?type=nlp | jq '.models[] | {provider, modelKey, apiEndpointSuffix}'

# 查看 Embedding 模型的端点
curl http://localhost:8088/api/llm/models?type=embedding | jq '.models[] | {provider, modelKey, apiEndpointSuffix}'
```

#### 预期结果

- NLP 模型: `/chat/completions`
- Embedding 模型: `/embeddings`
- Rerank 模型: `/rerank`

#### 验证点

- [ ] 不同类型有不同端点
- [ ] 端点后缀正确
- [ ] 与提供商匹配

#### 通过标准

端点自动选择逻辑正确。

---

### 用例 LLM-007: 自定义端点后缀

**优先级**: P1  
**类型**: 功能测试

#### 测试目标

验证为模型配置自定义 API 端点后缀。

#### 测试步骤

```bash
# 创建带自定义端点的模型
curl -X POST http://localhost:8088/api/llm/providers/1/models \
  -H "Content-Type: application/json" \
  -d '{
    "modelKey": "custom-model",
    "modelName": "Custom Model",
    "modelType": "nlp",
    "apiEndpointSuffix": "/custom/endpoint",
    "enabled": true
  }'

# 查看配置
curl http://localhost:8088/api/llm/providers/1/models/3 | jq '.model.apiEndpointSuffix'
```

#### 预期结果

- 自定义端点被保存
- 使用时调用自定义端点

#### 验证点

- [ ] 自定义端点保存成功
- [ ] 查询返回正确端点
- [ ] 实际调用使用自定义端点

#### 通过标准

支持自定义端点后缀。

---

## 默认模型管理测试

### 用例 LLM-008: 默认模型设置和查询

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证默认模型的设置和查询机制。

#### 测试步骤

```bash
# 1. 查询当前默认 NLP 模型
curl "http://localhost:8088/api/llm/models/default?type=nlp" | jq

# 2. 设置新的默认模型
curl -X PUT http://localhost:8088/api/llm/providers/1/models/2 \
  -H "Content-Type: application/json" \
  -d '{"isDefault": true}'

# 3. 再次查询默认模型
curl "http://localhost:8088/api/llm/models/default?type=nlp" | jq
```

#### 预期结果

- 首次查询: deepseek-chat (模型 ID 1)
- 设置后查询: deepseek-coder (模型 ID 2)
- 旧的默认标记自动取消

#### 验证点

- [ ] 默认模型查询正确
- [ ] 设置新默认成功
- [ ] 旧默认自动取消
- [ ] 每种类型只有一个默认

#### 通过标准

默认模型管理机制正常工作。

---

### 用例 LLM-009: 多类型默认模型独立管理

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证不同类型的默认模型独立管理。

#### 测试步骤

```bash
# 设置 NLP 默认模型
curl -X PUT http://localhost:8088/api/llm/providers/1/models/1 \
  -d '{"isDefault": true}'

# 设置 Embedding 默认模型
curl -X PUT http://localhost:8088/api/llm/providers/2/models/3 \
  -d '{"isDefault": true}'

# 查询两个默认模型
curl "http://localhost:8088/api/llm/models/default?type=nlp" | jq '.model.modelKey'
curl "http://localhost:8088/api/llm/models/default?type=embedding" | jq '.model.modelKey'
```

#### 预期结果

- NLP 默认: deepseek-chat
- Embedding 默认: text-embedding-ada-002
- 两者独立，互不影响

#### 验证点

- [ ] NLP 默认模型正确
- [ ] Embedding 默认模型正确
- [ ] 互不影响
- [ ] 可以同时存在

#### 通过标准

不同类型的默认模型独立管理。

---

## 流式响应测试

### 用例 LLM-010: 流式聊天使用 NLP 模型

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证流式聊天使用正确的 NLP 模型。

#### 测试步骤

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -N \
  -d '{
    "messages": [
      {"role": "user", "content": "用50字介绍 AI"}
    ],
    "stream": true
  }'
```

#### 预期结果

- 使用默认 NLP 模型 (deepseek-chat)
- 流式返回响应
- 正确的 API 端点 (`/chat/completions`)

#### 验证点

- [ ] 流式响应启动
- [ ] 使用正确的模型
- [ ] 使用正确的端点
- [ ] 数据流正常

#### 通过标准

流式聊天正常工作，使用正确的 NLP 模型。

---

## 配置热更新测试

### 用例 LLM-011: 提供商配置热更新

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证更新提供商配置后无需重启服务。

#### 测试步骤

```bash
# 1. 启动服务
npm run dev &
sleep 5

# 2. 发送初始请求
curl -X POST http://localhost:8088/v1/chat/completions \
  -d '{"messages": [{"role": "user", "content": "测试1"}]}'

# 3. 更新提供商配置
curl -X PUT http://localhost:8088/api/llm/providers/1 \
  -H "Content-Type: application/json" \
  -d '{
    "baseConfig": {
      "timeout": 120000
    }
  }'

# 4. 发送新请求（应使用新配置）
curl -X POST http://localhost:8088/v1/chat/completions \
  -d '{"messages": [{"role": "user", "content": "测试2"}]}'
```

#### 预期结果

- 配置更新成功
- 新请求使用新配置
- 服务未重启

#### 验证点

- [ ] 配置更新成功
- [ ] ModelRegistry 刷新
- [ ] 新配置生效
- [ ] 服务不中断

#### 通过标准

配置热更新正常工作。

---

### 用例 LLM-012: 模型配置热更新

**优先级**: P1  
**类型**: 功能测试

#### 测试目标

验证更新模型配置后立即生效。

#### 测试步骤

```bash
# 更新模型配置
curl -X PUT http://localhost:8088/api/llm/providers/1/models/1 \
  -H "Content-Type: application/json" \
  -d '{
    "modelConfig": {
      "temperature": 0.8
    }
  }'

# 查看更新后的配置
curl http://localhost:8088/api/llm/providers/1/models/1 | jq '.model.modelConfig'
```

#### 预期结果

- 配置立即更新
- 缓存自动刷新

#### 验证点

- [ ] 模型配置更新
- [ ] 缓存刷新
- [ ] 新配置可查询

#### 通过标准

模型配置热更新正常。

---

## 错误处理测试

### 用例 LLM-013: 无可用模型处理

**优先级**: P0  
**类型**: 异常测试

#### 测试目标

验证无可用 NLP 模型时的错误处理。

#### 测试步骤

```bash
# 1. 禁用所有 NLP 模型
curl -X PUT http://localhost:8088/api/llm/providers/1/models/1 \
  -d '{"enabled": false}'

curl -X PUT http://localhost:8088/api/llm/providers/1/models/2 \
  -d '{"enabled": false}'

# 2. 尝试聊天
curl -X POST http://localhost:8088/v1/chat/completions \
  -d '{"messages": [{"role": "user", "content": "你好"}]}'

# 3. 恢复配置
curl -X PUT http://localhost:8088/api/llm/providers/1/models/1 \
  -d '{"enabled": true}'
```

#### 预期结果

- 返回明确的错误信息
- 提示无可用模型

#### 验证点

- [ ] 错误被检测
- [ ] 返回 500 或 503 错误
- [ ] 错误消息明确
- [ ] 服务未崩溃

#### 通过标准

优雅地处理无可用模型的情况。

---

### 用例 LLM-014: 提供商 API Key 无效

**优先级**: P0  
**类型**: 异常测试

#### 测试目标

验证 API Key 无效时的错误处理。

#### 测试步骤

```bash
# 更新为无效的 API Key
curl -X PUT http://localhost:8088/api/llm/providers/1 \
  -d '{"baseConfig": {"apiKey": "invalid-key"}}'

# 尝试聊天
curl -X POST http://localhost:8088/v1/chat/completions \
  -d '{"messages": [{"role": "user", "content": "你好"}]}'

# 恢复正确的 API Key
curl -X PUT http://localhost:8088/api/llm/providers/1 \
  -d '{"baseConfig": {"apiKey": "sk-correct-key"}}'
```

#### 预期结果

- LLM API 调用失败
- 返回明确的错误
- 服务保持稳定

#### 验证点

- [ ] 错误被捕获
- [ ] 返回有用的错误信息
- [ ] 服务未崩溃

#### 通过标准

API Key 错误被正确处理。

---

### 用例 LLM-015: 模型切换测试

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证在对话中动态切换模型。

#### 测试步骤

```bash
# 使用 deepseek-chat
curl -X POST http://localhost:8088/v1/chat/completions \
  -d '{
    "messages": [{"role": "user", "content": "你好"}],
    "provider": "deepseek",
    "model": "deepseek-chat"
  }' | jq '.model'

# 切换到 deepseek-coder
curl -X POST http://localhost:8088/v1/chat/completions \
  -d '{
    "messages": [{"role": "user", "content": "写一个函数"}],
    "provider": "deepseek",
    "model": "deepseek-coder"
  }' | jq '.model'
```

#### 预期结果

- 第一次请求使用 deepseek-chat
- 第二次请求使用 deepseek-coder
- 切换无延迟

#### 验证点

- [ ] 模型切换成功
- [ ] 响应显示正确模型
- [ ] 切换无延迟
- [ ] 无缓存问题

#### 通过标准

模型切换机制正常工作。

---

## 📊 测试结果汇总

### 测试用例统计

| 类别 | 用例数 | 描述 |
|------|--------|------|
| 初始化 | 2 | LLMManager 初始化、ModelRegistry 缓存 |
| 多模型类型 | 3 | NLP、Embedding、多类型共存 |
| API 端点 | 2 | 端点选择、自定义端点 |
| 默认模型 | 2 | 设置、独立管理 |
| 流式响应 | 1 | 流式聊天 |
| 配置热更新 | 2 | 提供商、模型热更新 |
| 错误处理 | 3 | 无模型、无效 Key、模型切换 |
| **总计** | **15** | |

### 优先级分布

| 优先级 | 用例数 | 用例编号 |
|--------|--------|----------|
| P0 | 12 | LLM-001, 002, 003, 005, 006, 008, 009, 010, 011, 013, 014, 015 |
| P1 | 3 | LLM-004, 007, 012 |

### 测试记录模板

```markdown
## LLMManager 测试执行记录（新架构）

- **测试日期**: YYYY-MM-DD
- **测试人员**: [姓名]
- **ApexBridge 版本**: v1.0.1 (v2 架构)
- **架构**: 两级配置（提供商+模型）

| 用例编号 | 用例名称 | 结果 | 备注 |
|----------|----------|------|------|
| LLM-001 | LLMManager 初始化 | ✅ PASS | 加载 1 个提供商 |
| LLM-002 | ModelRegistry 缓存 | ✅ PASS | 响应 < 10ms |
| LLM-003 | NLP 模型选择 | ✅ PASS | 3 种方式都正常 |
| ... | ... | ... | ... |

**总通过率**: XX%
```

---

## 🔗 相关文档

- [测试总览指南](../MANUAL_TESTING_GUIDE.md)
- [LLMConfigService 测试用例](./LLM_CONFIG_SERVICE_TEST_CASES.md)
- [提供商和模型 API 测试](./LLM_API_TEST_CASES.md)
- [Chat API 测试用例](./CHAT_API_TEST_CASES.md)

---

## 💡 测试技巧

1. **查看模型选择日志**:
   ```bash
   LOG_LEVEL=debug npm run dev 2>&1 | grep -i "using model"
   ```

2. **验证端点配置**:
   ```bash
   curl http://localhost:8088/api/llm/models | jq '.models[] | {provider, modelType, apiEndpointSuffix}'
   ```

3. **测试模型切换**:
   - 指定不同的 provider 和 model
   - 观察日志中使用的模型

4. **验证缓存**:
   - 多次查询同一模型
   - 检查响应时间

---

**文档维护**: 如发现测试用例有问题或需要补充，请提交 Issue 或 PR。

*最后更新: 2025-11-18*
