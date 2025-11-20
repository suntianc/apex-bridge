# ApexBridge 人工测试指南

> **版本**: v1.0.0  
> **最后更新**: 2025-11-18  
> **适用项目**: ApexBridge 轻量级 ABP 聊天服务

## 📋 文档概述

本文档提供 ApexBridge 项目的完整人工测试指南，帮助开发者和测试人员快速验证系统功能完整性。

### 文档结构

```
docs/testing/
├── MANUAL_TESTING_GUIDE.md          # 本文档 - 测试总览指南
├── cases/                            # 测试用例
│   ├── PROTOCOL_ENGINE_TEST_CASES.md    # ProtocolEngine 测试用例
│   ├── LLM_MANAGER_TEST_CASES.md        # LLMManager 测试用例
│   ├── VARIABLE_ENGINE_TEST_CASES.md    # VariableEngine 测试用例
│   ├── CHAT_SERVICE_TEST_CASES.md       # ChatService 测试用例
│   ├── SKILLS_TEST_CASES.md             # Skills 体系测试用例
│   ├── WEBSOCKET_TEST_CASES.md          # WebSocket 测试用例
│   ├── LLM_CONFIG_SERVICE_TEST_CASES.md # LLMConfigService 测试用例
│   ├── CHAT_API_TEST_CASES.md           # 聊天接口测试用例
│   ├── LLM_CONFIG_API_TEST_CASES.md     # LLM 配置接口测试用例
│   └── HEALTH_CHECK_API_TEST_CASES.md   # 健康检查接口测试用例
├── scenarios/                        # 场景测试
│   ├── E2E_CHAT_SCENARIOS.md            # 端到端对话场景
│   ├── SKILLS_INTEGRATION_SCENARIOS.md  # Skills 集成场景
│   ├── LLM_SWITCHING_SCENARIOS.md       # 多 LLM 切换场景
│   └── ERROR_HANDLING_SCENARIOS.md      # 异常处理场景
└── guides/                           # 专项指南
    ├── PERFORMANCE_TESTING_GUIDE.md     # 性能测试指南
    ├── SECURITY_TESTING_GUIDE.md        # 安全测试指南
    ├── TROUBLESHOOTING_GUIDE.md         # 故障排查指南
    ├── QUICK_VALIDATION_CHECKLIST.md    # 10 分钟快速验证
    ├── FULL_VALIDATION_CHECKLIST.md     # 30 分钟完整验证
    └── REGRESSION_TEST_CHECKLIST.md     # 回归测试清单
```

## 🎯 测试目标

1. **功能完整性验证** - 确认所有核心功能正常工作
2. **集成测试** - 验证各模块之间的集成
3. **端到端验证** - 模拟真实用户场景
4. **性能基准** - 确认性能指标符合预期
5. **安全验证** - 确认安全机制生效

## 📋 测试环境要求

### 系统要求

- **操作系统**: Linux / macOS / Windows (WSL2)
- **Node.js**: >= 16.0.0
- **npm**: >= 8.0.0
- **内存**: >= 4GB 可用内存
- **磁盘**: >= 2GB 可用空间

### 必需软件

1. **Node.js 和 npm**
   ```bash
   # 检查版本
   node --version  # 应该 >= v16.0.0
   npm --version   # 应该 >= 8.0.0
   ```

2. **curl** (用于 API 测试)
   ```bash
   # Linux / macOS 通常已安装
   curl --version
   
   # Windows (WSL2)
   sudo apt-get install curl
   ```

3. **git** (用于代码获取)
   ```bash
   git --version
   ```

### 可选工具

1. **Postman** - 图形化 API 测试工具
   - 下载地址: https://www.postman.com/downloads/

2. **WebSocket Client** - WebSocket 测试工具
   - Chrome 插件: Simple WebSocket Client
   - 命令行工具: wscat (`npm install -g wscat`)

3. **jq** - JSON 处理工具
   ```bash
   # Linux
   sudo apt-get install jq
   
   # macOS
   brew install jq
   ```

4. **ApiFox / ApiPost** - 国产 API 测试工具（可选）

## 🛠️ 测试环境准备

### 步骤 1: 克隆项目

```bash
# 克隆仓库
git clone https://github.com/suntianc/apex-bridge.git
cd apex-bridge/apex-bridge

# 查看项目结构
ls -la
```

### 步骤 2: 安装依赖

```bash
# 安装项目依赖
npm install

# 验证安装成功
npm list --depth=0
```

### 步骤 3: 配置环境变量

```bash
# 复制环境变量模板
cp env.template .env

# 编辑配置文件
nano .env  # 或使用其他编辑器
```

**最小配置示例** (`.env`):

```env
# 服务配置
PORT=8088
NODE_ENV=development
LOG_LEVEL=info

# LLM 提供商配置（至少配置一个）
LLM_PROVIDER=deepseek  # 可选: openai, deepseek, zhipu, ollama

# DeepSeek 配置
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# 或使用 OpenAI
# OPENAI_API_KEY=sk-your-openai-api-key
# OPENAI_BASE_URL=https://api.openai.com/v1
# OPENAI_MODEL=gpt-3.5-turbo

# RAG 配置（可选）
RAG_ENABLED=false

# 认证配置（可选，测试时可以留空）
# API_KEY=your-custom-api-key

# 速率限制配置
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

**配置说明**:

| 配置项 | 说明 | 是否必需 | 默认值 |
|--------|------|----------|--------|
| `PORT` | 服务监听端口 | 否 | 8088 |
| `NODE_ENV` | 运行环境 | 否 | development |
| `LOG_LEVEL` | 日志级别 | 否 | info |
| `LLM_PROVIDER` | LLM 提供商 | 是 | - |
| `{PROVIDER}_API_KEY` | 对应提供商的 API Key | 是 | - |
| `RAG_ENABLED` | 是否启用 RAG | 否 | false |
| `API_KEY` | 自定义 API Key | 否 | - |

### 步骤 4: 启动服务

```bash
# 开发模式启动
npm run dev

# 或生产模式启动
npm run build
npm start
```

**预期输出**:

```
🧠 ApexBridge Server initializing (ABP-only)...
📋 Loading configuration...
✅ Configuration loaded and validated
✅ All required directories ensured
✅ LLMConfigService initialized (SQLite database ready)
✅ Protocol Engine core components initialized
ℹ️ LLMManager will be initialized on-demand (lazy loading from SQLite)
✅ All Skills loaded (5 skills found)
✅ WebSocket server initialized
🚀 ApexBridge Server started on port 8088
```

### 步骤 5: 验证服务启动

```bash
# 测试健康检查接口
curl http://localhost:8088/health

# 预期输出
{
  "status": "ok",
  "timestamp": "2025-11-18T10:00:00.000Z",
  "uptime": 5.123,
  "service": "ApexBridge",
  "version": "1.0.1"
}
```

## 🧪 测试数据准备

### 测试用户数据

创建 `test-data/test-users.json`:

```json
{
  "users": [
    {
      "id": "test-user-001",
      "name": "测试用户A",
      "apiKey": "test-key-001"
    },
    {
      "id": "test-user-002",
      "name": "测试用户B",
      "apiKey": "test-key-002"
    }
  ]
}
```

### 测试对话数据

创建 `test-data/test-messages.json`:

```json
{
  "simple_chat": [
    {"role": "user", "content": "你好，请介绍一下你自己"}
  ],
  "multi_turn_chat": [
    {"role": "user", "content": "我叫张三"},
    {"role": "assistant", "content": "你好张三，很高兴认识你！"},
    {"role": "user", "content": "我刚才告诉你我叫什么名字？"}
  ],
  "tool_call_time": [
    {"role": "user", "content": "现在几点了？"}
  ],
  "tool_call_system": [
    {"role": "user", "content": "查询一下系统信息"}
  ],
  "tool_call_dice": [
    {"role": "user", "content": "帮我掷一个骰子"}
  ]
}
```

### 测试配置文件

创建 `test-data/test-config.json`:

```json
{
  "providers": [
    {
      "name": "openai",
      "enabled": true,
      "config": {
        "apiKey": "sk-test-key",
        "model": "gpt-3.5-turbo"
      }
    },
    {
      "name": "deepseek",
      "enabled": true,
      "config": {
        "apiKey": "sk-test-key",
        "model": "deepseek-chat"
      }
    }
  ]
}
```

## 📊 测试执行流程

### 快速测试流程（10 分钟）

适用于快速验证核心功能是否正常。

1. **服务启动验证** (2 分钟)
   - 启动服务
   - 检查健康检查接口
   - 查看日志无错误

2. **基本聊天功能** (3 分钟)
   - 测试非流式聊天
   - 测试流式聊天

3. **工具调用功能** (3 分钟)
   - 测试时间查询 (TimeInfo)
   - 测试健康检查 (HealthCheck)

4. **WebSocket 功能** (2 分钟)
   - 建立 WebSocket 连接
   - 发送测试消息

**详细步骤**: 参考 `guides/QUICK_VALIDATION_CHECKLIST.md`

### 完整测试流程（30 分钟）

适用于全面验证所有核心功能。

1. **服务启动与配置** (5 分钟)
2. **核心功能测试** (10 分钟)
   - ProtocolEngine
   - LLMManager
   - VariableEngine
   - ChatService
3. **API 接口测试** (8 分钟)
4. **Skills 测试** (5 分钟)
5. **WebSocket 测试** (2 分钟)

**详细步骤**: 参考 `guides/FULL_VALIDATION_CHECKLIST.md`

### 回归测试流程（30-60 分钟）

适用于版本更新后的全面验证。

**详细步骤**: 参考 `guides/REGRESSION_TEST_CHECKLIST.md`

## 🔍 测试工具使用

### curl 命令行测试

#### 基本 GET 请求

```bash
# 健康检查
curl http://localhost:8088/health
```

#### POST 请求（非流式）

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好"}
    ],
    "stream": false
  }'
```

#### POST 请求（流式）

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好"}
    ],
    "stream": true
  }'
```

#### 带认证的请求

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好"}
    ]
  }'
```

### WebSocket 测试（wscat）

```bash
# 安装 wscat
npm install -g wscat

# 连接 WebSocket
wscat -c ws://localhost:8088/ws

# 发送消息
{"type":"chat","content":"你好"}

# 断开连接
Ctrl+C
```

### Postman 测试

1. **导入集合**: 导入 `test-data/postman-collection.json`
2. **配置环境变量**:
   - `base_url`: http://localhost:8088
   - `api_key`: your-api-key (如果配置了认证)
3. **运行测试**: 点击 "Run Collection"

## 📝 测试记录

建议使用以下模板记录测试结果：

### 测试记录模板

```markdown
## 测试记录

- **测试日期**: 2025-11-18
- **测试人员**: 张三
- **测试环境**: 开发环境
- **ApexBridge 版本**: v1.0.1
- **Node.js 版本**: v18.16.0

### 测试结果汇总

| 测试模块 | 测试用例数 | 通过 | 失败 | 跳过 | 通过率 |
|----------|-----------|------|------|------|--------|
| ProtocolEngine | 10 | 10 | 0 | 0 | 100% |
| LLMManager | 12 | 11 | 1 | 0 | 92% |
| Skills | 8 | 8 | 0 | 0 | 100% |
| API 接口 | 15 | 15 | 0 | 0 | 100% |
| WebSocket | 6 | 6 | 0 | 0 | 100% |
| **总计** | **51** | **50** | **1** | **0** | **98%** |

### 失败用例详情

1. **LLM-TC-007**: 智谱 AI 提供商切换失败
   - 原因: API Key 未配置
   - 影响: 中
   - 解决方案: 配置 `ZHIPU_API_KEY`

### 性能指标

- 服务启动时间: 2.5s
- 平均响应时间: 1.2s
- 内存占用: 150MB
- CPU 占用: 5%

### 备注

无
```

## 🚨 常见问题排查

### 问题 1: 服务启动失败

**症状**: `npm run dev` 启动失败

**可能原因**:
1. 端口被占用
2. 环境变量配置错误
3. 依赖未安装

**解决方法**:

```bash
# 检查端口占用
lsof -i:8088

# 检查环境变量
cat .env

# 重新安装依赖
rm -rf node_modules package-lock.json
npm install
```

### 问题 2: LLM API 调用失败

**症状**: 聊天请求返回错误

**可能原因**:
1. API Key 无效
2. 网络连接问题
3. API 配额用尽

**解决方法**:

```bash
# 检查 API Key
echo $DEEPSEEK_API_KEY

# 测试网络连接
curl https://api.deepseek.com

# 查看详细日志
LOG_LEVEL=debug npm run dev
```

### 问题 3: Skills 执行失败

**症状**: 工具调用返回错误

**可能原因**:
1. Skills 未正确加载
2. 执行脚本错误
3. 权限不足

**解决方法**:

```bash
# 检查 Skills 加载状态
curl http://localhost:8088/api/skills/list

# 查看 Skills 日志
tail -f logs/skills.log

# 验证 Skills 结构
npm run validate:skills
```

**更多故障排查**: 参考 `guides/TROUBLESHOOTING_GUIDE.md`

## 📚 相关文档

### 测试用例文档

- [ProtocolEngine 测试用例](./cases/PROTOCOL_ENGINE_TEST_CASES.md)
- [LLMManager 测试用例](./cases/LLM_MANAGER_TEST_CASES.md)
- [VariableEngine 测试用例](./cases/VARIABLE_ENGINE_TEST_CASES.md)
- [ChatService 测试用例](./cases/CHAT_SERVICE_TEST_CASES.md)
- [Skills 体系测试用例](./cases/SKILLS_TEST_CASES.md)
- [WebSocket 测试用例](./cases/WEBSOCKET_TEST_CASES.md)
- [LLMConfigService 测试用例](./cases/LLM_CONFIG_SERVICE_TEST_CASES.md)

### 场景测试文档

- [端到端对话场景](./scenarios/E2E_CHAT_SCENARIOS.md)
- [Skills 集成场景](./scenarios/SKILLS_INTEGRATION_SCENARIOS.md)
- [多 LLM 切换场景](./scenarios/LLM_SWITCHING_SCENARIOS.md)
- [异常处理场景](./scenarios/ERROR_HANDLING_SCENARIOS.md)

### 专项测试指南

- [性能测试指南](./guides/PERFORMANCE_TESTING_GUIDE.md)
- [安全测试指南](./guides/SECURITY_TESTING_GUIDE.md)
- [故障排查指南](./guides/TROUBLESHOOTING_GUIDE.md)

### 快速清单

- [10 分钟快速验证](./guides/QUICK_VALIDATION_CHECKLIST.md)
- [30 分钟完整验证](./guides/FULL_VALIDATION_CHECKLIST.md)
- [回归测试清单](./guides/REGRESSION_TEST_CHECKLIST.md)

## 🤝 贡献指南

如果你发现测试文档有问题或需要改进，欢迎提交 Issue 或 Pull Request。

### 文档更新流程

1. Fork 项目
2. 创建特性分支 (`git checkout -b docs/update-testing-guide`)
3. 更新文档
4. 提交更改 (`git commit -m 'docs: update testing guide'`)
5. 推送到分支 (`git push origin docs/update-testing-guide`)
6. 创建 Pull Request

## 📜 版本历史

- **v1.0.0** (2025-11-18): 初始版本
  - 基础测试环境准备指南
  - 核心功能测试流程
  - 常见问题排查指南

## 📞 获取帮助

- **文档问题**: 查阅 [故障排查指南](./guides/TROUBLESHOOTING_GUIDE.md)
- **功能问题**: 提交 [GitHub Issue](https://github.com/suntianc/apex-bridge/issues)
- **安全问题**: 发送邮件至 security@apexbridge.com

---

**Happy Testing! 🎉**

