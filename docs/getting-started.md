# ApexBridge 快速入门指南

ApexBridge 是一个企业级 AI Agent 框架，支持多模型编排（OpenAI、Claude、DeepSeek、Ollama）、MCP 协议集成以及 4 层上下文压缩策略。通过统一的 API 接口，您可以轻松构建智能对话应用并实现工具调用能力。

---

## 前置条件

在开始安装之前，请确保您的开发环境满足以下要求：

| 依赖项  | 最低版本 | 说明               |
| ------- | -------- | ------------------ |
| Node.js | 18.0.0+  | 建议使用 LTS 版本  |
| npm     | 9.0.0+   | 或使用 yarn / pnpm |
| Git     | 2.0.0+   | 用于克隆代码仓库   |

**验证环境：**

```bash
# 检查 Node.js 版本
node --version

# 检查 npm 版本
npm --version
```

此外，您需要准备以下 API 密钥（根据实际使用的模型）：

| 服务商    | 获取地址                                   | 用途                 |
| --------- | ------------------------------------------ | -------------------- |
| OpenAI    | https://platform.openai.com/api-keys       | GPT-4 / GPT-3.5 模型 |
| Anthropic | https://console.anthropic.com/account/keys | Claude 系列模型      |
| DeepSeek  | https://platform.deepseek.com              | DeepSeek 模型        |
| Ollama    | https://ollama.com                         | 本地部署模型         |

---

## 安装部署

### 1. 克隆代码仓库

```bash
# 克隆 ApexBridge 仓库
git clone https://github.com/suntianc/apex-bridge.git

# 进入项目目录
cd apex-bridge
```

### 2. 安装依赖

```bash
# 使用 npm 安装项目依赖
npm install
```

安装完成后，项目结构如下：

```
apex-bridge/
├── src/                      # 源代码目录
│   ├── core/                 # 核心引擎（协议解析、LLM 管理）
│   ├── services/             # 业务服务（聊天、工具检索、上下文压缩）
│   ├── strategies/           # 聊天策略（ReAct、单轮响应）
│   ├── api/                  # REST 控制器与 WebSocket
│   └── utils/                # 工具函数
├── config/                   # 配置文件目录
├── tests/                    # 测试文件
├── scripts/                  # 数据库迁移脚本
├── .data/                    # 数据存储（SurrealDB）
└── package.json
```

### 3. 数据库初始化

```bash
# 运行数据库迁移
npm run migrations
```

此命令将创建必要的数据库表并初始化向量存储。

---

## 配置说明

ApexBridge 采用分层配置模式：

- **系统级配置**：API 密钥、端口、路径等（`.env` 文件）
- **应用级配置**：功能开关、策略参数（`config/admin-config.json`）

### 1. 环境变量配置

复制模板文件并配置：

```bash
# 复制环境变量模板
cp .env.template .env
```

编辑 `.env` 文件：

```bash
# .env 配置示例

# ====================
# 服务器配置
# ====================
PORT=3000
HOST=0.0.0.0
APEX_BRIDGE_AUTOSTART=true

# ====================
# 安全配置（敏感信息）
# ====================
ABP_API_KEY=your-abp-api-key-here
JWT_SECRET=your-jwt-secret-here

# ====================
# LLM 提供商配置
# ====================
OPENAI_API_KEY=sk-your-openai-api-key-here
ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key-here
DEEPSEEK_API_KEY=sk-your-deepseek-api-key-here

# ====================
# Ollama 本地配置（可选）
# ====================
OLLAMA_BASE_URL=http://localhost:11434

# ====================
# 运行环境
# ====================
NODE_ENV=development
LOG_LEVEL=info
```

**关键配置项说明：**

| 配置项              | 说明               | 默认值      |
| ------------------- | ------------------ | ----------- |
| `PORT`              | 服务器监听端口     | 3000        |
| `ABP_API_KEY`       | API 认证密钥       | 必填        |
| `JWT_SECRET`        | JWT 签名密钥       | 必填        |
| `OPENAI_API_KEY`    | OpenAI API 密钥    | 选填        |
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 | 选填        |
| `DEEPSEEK_API_KEY`  | DeepSeek API 密钥  | 选填        |
| `NODE_ENV`          | 运行环境           | development |
| `LOG_LEVEL`         | 日志级别           | info        |

### 2. 应用配置

编辑 `config/admin-config.json`：

```json
{
  "api": {
    "host": "0.0.0.0",
    "port": 3000,
    "cors": {
      "origin": "*",
      "credentials": true
    }
  },
  "llm": {
    "providers": [],
    "defaultProvider": "openai",
    "timeout": 30000,
    "maxRetries": 3
  },
  "auth": {
    "enabled": true,
    "apiKey": "your-api-key",
    "jwtSecret": "your-jwt-secret",
    "jwtExpiresIn": "24h"
  },
  "security": {
    "rateLimit": {
      "enabled": true,
      "windowMs": 900000,
      "max": 1000
    }
  }
}
```

---

## 运行服务器

### 开发模式

使用 nodemon 启动开发服务器，支持热重载：

```bash
npm run dev
```

启动成功后，您将看到以下输出：

```
🧠 ApexBridge Server initializing...
✅ All required directories ensured
✅ Configuration loaded
✅ Protocol Engine initialized
✅ LLMManager initialized
✅ ChatService initialized
🚀 ApexBridge running on http://0.0.0.0:3000
```

### 生产模式

首先编译 TypeScript，然后启动生产服务器：

```bash
# 编译 TypeScript
npm run build

# 启动生产服务器
npm start
```

### 其他常用命令

| 命令                 | 说明            |
| -------------------- | --------------- |
| `npm run dev`        | 启动开发服务器  |
| `npm run build`      | 编译 TypeScript |
| `npm start`          | 启动生产服务器  |
| `npm run test`       | 运行所有测试    |
| `npm run lint`       | 代码检查        |
| `npm run migrations` | 运行数据库迁移  |

---

## 第一个 API 请求

ApexBridge 提供 OpenAI 兼容的 API 接口。以下是使用 curl 进行首次调用的示例：

### 1. 基础聊天请求

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-abp-api-key-here" \
  -d '{
    "messages": [
      {"role": "system", "content": "你是一个专业助手"},
      {"role": "user", "content": "请介绍一下 ApexBridge 的主要特性"}
    ],
    "model": "gpt-4",
    "stream": false
  }'
```

**请求参数说明：**

| 参数          | 类型    | 必填 | 说明              |
| ------------- | ------- | ---- | ----------------- |
| `messages`    | array   | 是   | 对话消息数组      |
| `model`       | string  | 是   | 使用的模型名称    |
| `stream`      | boolean | 否   | 是否启用流式响应  |
| `temperature` | number  | 否   | 温度参数 (0-2)    |
| `max_tokens`  | number  | 否   | 最大输出 token 数 |

**响应示例：**

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1699000000,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "ApexBridge 是一个高性能的 AI Agent 框架..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 120,
    "total_tokens": 170
  }
}
```

### 2. 流式响应

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-abp-api-key-here" \
  -d '{
    "messages": [
      {"role": "user", "content": "用 Python 写一个快速排序算法"}
    ],
    "model": "gpt-4",
    "stream": true
  }'
```

流式响应将逐字返回结果，数据格式为：

```
data: {"id":"...","choices":[{"delta":{"content":"d"},"index":0}]}
data: {"id":"...","choices":[{"delta":{"content":"e"},"index":0}]}
...
data: [DONE]
```

### 3. 查看可用模型

```bash
curl -X GET http://localhost:3000/v1/models \
  -H "Authorization: Bearer your-abp-api-key-here"
```

---

## 测试

ApexBridge 提供完整的测试套件：

### 运行所有测试

```bash
npm run test
```

### 运行带覆盖率报告的测试

```bash
npm run test:coverage
```

### 上下文压缩专项测试

```bash
# 测试所有压缩策略
npm run test:all-strategies

# 测试压缩集成
npm run test:compression-integration

# 测试真实场景压缩
npm run test:compression-realistic
```

### 监控测试

```bash
npm run test:context-compression
```

---

## 后续步骤

完成快速入门后，您可以：

### 1. 探索核心功能

| 功能       | 文档                                       | 说明                 |
| ---------- | ------------------------------------------ | -------------------- |
| 上下文压缩 | [上下文压缩指南](./context-compression.md) | 4 层压缩策略详解     |
| MCP 集成   | [MCP 集成指南](./mcp-integration.md)       | MCP 服务器配置与使用 |
| 技能系统   | 源码：`src/services/SkillManager.ts`       | 模块化技能管理       |

### 2. 配置多个 LLM 提供商

ApexBridge 支持动态配置多个 LLM 提供商：

```bash
# 运行 LLM 配置初始化脚本
node scripts/init-llm-config-v2.js
```

通过 API 管理提供商：

```bash
# 列出所有提供商
curl http://localhost:3000/api/llm/providers \
  -H "Authorization: Bearer your-api-key"

# 添加新的提供商
curl -X POST http://localhost:3000/api/llm/providers \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "deepseek",
    "type": "deepseek",
    "apiKey": "sk-your-deepseek-key",
    "baseUrl": "https://api.deepseek.com"
  }'
```

### 3. 使用 WebSocket 进行实时通信

WebSocket 支持实时流式响应和中断功能：

```javascript
const ws = new WebSocket("ws://localhost:3000/ws/chat");

ws.onopen = () => {
  ws.send(
    JSON.stringify({
      type: "chat",
      messages: [{ role: "user", content: "你好！" }],
      model: "gpt-4",
    })
  );
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log("Received:", data.content);
};
```

### 4. 部署到生产环境

生产部署建议：

1. 设置 `NODE_ENV=production`
2. 配置反向代理（如 Nginx）
3. 启用 HTTPS
4. 设置监控和日志
5. 配置备份策略

---

## 常见问题

### Q: 端口被占用怎么办？

修改 `.env` 中的 `PORT` 配置：

```bash
PORT=8088
```

### Q: API 请求返回 401 错误？

检查认证配置：

```bash
# 验证 API 密钥是否正确配置
cat .env | grep ABP_API_KEY

# 验证请求头格式
curl -H "Authorization: Bearer your-api-key" ...
```

### Q: 模型调用失败？

1. 检查对应提供商的 API 密钥是否有效
2. 确认网络连接正常
3. 查看日志获取详细错误信息：

```bash
tail -f logs/apex-bridge.log
```

### Q: 如何启用上下文压缩？

在请求中启用压缩策略：

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [...],
    "model": "gpt-4",
    "contextCompression": {
      "enabled": true,
      "strategy": "hybrid",
      "auto": true
    }
  }'
```

---

## 获取帮助

- **项目仓库**：https://github.com/suntianc/apex-bridge
- **问题反馈**：https://github.com/suntianc/apex-bridge/issues
- **文档更新**：欢迎提交 PR 完善文档
