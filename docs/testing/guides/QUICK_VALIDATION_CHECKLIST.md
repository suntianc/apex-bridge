# 10 分钟快速验证清单

> **目标**: 快速验证 ApexBridge 核心功能是否正常  
> **预计时间**: 10 分钟  
> **适用场景**: 快速部署验证、更新后快速检查、CI/CD 验证

## 📋 验证概述

本清单包含最小化的测试步骤，用于快速确认系统核心功能正常工作。

### 验证范围

- ✅ 服务启动
- ✅ 健康检查
- ✅ 基本聊天（非流式）
- ✅ 流式聊天
- ✅ 工具调用（至少 1 个 Skill）

### 前置要求

- Node.js >= 16.0.0
- npm >= 8.0.0
- 已配置环境变量（`.env`）
- 至少一个 LLM API Key

---

## ⏱️ 快速验证步骤

### 步骤 1: 服务启动验证 (2 分钟)

#### 1.1 启动服务

```bash
# 进入项目目录
cd /home/suntc/project/ApexBridge/apex-bridge

# 启动服务
npm run dev
```

#### 1.2 检查启动日志

**预期输出**:
```
🧠 ApexBridge Server initializing (ABP-only)...
✅ Configuration loaded and validated
✅ Protocol Engine core components initialized
✅ All Skills loaded (5 skills found)
✅ WebSocket server initialized
🚀 ApexBridge Server started on port 8088
```

#### 验证点

- [ ] 无启动错误
- [ ] 显示 "Server started on port 8088"
- [ ] 显示 "5 skills found"
- [ ] 无红色错误日志

**如果失败**: 检查 `.env` 配置，确认 LLM API Key 已设置。

---

### 步骤 2: 健康检查 (30 秒)

#### 2.1 测试健康检查接口

```bash
# 新开一个终端窗口
curl http://localhost:8088/health
```

#### 预期结果

```json
{
  "status": "ok",
  "timestamp": "2025-11-18T10:00:00.000Z",
  "uptime": 5.123,
  "service": "ApexBridge",
  "version": "1.0.1"
}
```

#### 验证点

- [ ] HTTP 状态码 200
- [ ] `status` 为 `"ok"`
- [ ] 包含 `uptime` 字段
- [ ] 响应时间 < 1 秒

**如果失败**: 检查服务是否正常运行，端口是否被占用。

---

### 步骤 3: 基本聊天功能 (3 分钟)

#### 3.1 测试非流式聊天

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好，请用一句话介绍你自己"}
    ],
    "stream": false
  }'
```

#### 预期结果

```json
{
  "id": "chatcmpl-xxxxx",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "deepseek-chat",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "我是 AI 助手，..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {...}
}
```

#### 验证点

- [ ] HTTP 状态码 200
- [ ] 响应包含 `choices` 数组
- [ ] `choices[0].message.content` 不为空
- [ ] `finish_reason` 为 `"stop"`

**如果失败**: 检查 LLM API Key 是否有效，网络连接是否正常。

---

#### 3.2 测试流式聊天

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -N \
  -d '{
    "messages": [
      {"role": "user", "content": "用20字介绍北京"}
    ],
    "stream": true
  }'
```

#### 预期结果

应看到流式输出：
```
data: {"id":"chatcmpl-xxx","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","choices":[{"index":0,"delta":{"content":"北京"},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","choices":[{"index":0,"delta":{"content":"是"},"finish_reason":null}]}

...

data: [DONE]
```

#### 验证点

- [ ] HTTP 状态码 200
- [ ] Content-Type: `text/event-stream`
- [ ] 接收到多个 `data:` 块
- [ ] 最后接收到 `data: [DONE]`

**如果失败**: 检查 curl 是否支持流式输出（-N 参数）。

---

### 步骤 4: LLM 配置验证 (1 分钟) ⭐新增

#### 4.1 验证 LLM 配置（新架构）

```bash
# 查看配置的提供商和模型
curl http://localhost:8088/api/llm/providers | jq '.providers[] | {provider, name, modelCount}'
```

#### 预期结果

```json
{
  "provider": "deepseek",
  "name": "DeepSeek",
  "modelCount": 2
}
```

#### 验证点

- [ ] 至少有 1 个启用的提供商
- [ ] 至少有 1 个 NLP 模型
- [ ] modelCount > 0

---

### 步骤 5: 工具调用功能 (3 分钟)

#### 5.1 测试时间查询 (TimeInfo Skill)

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "现在几点了？"}
    ],
    "stream": false
  }'
```

#### 预期结果

响应应包含当前时间信息，例如：
```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "现在是 2025年11月18日 10:30:00"
      }
    }
  ]
}
```

#### 验证点

- [ ] HTTP 状态码 200
- [ ] 响应包含时间信息
- [ ] 时间包含年月日时分秒
- [ ] 时间与当前实际时间接近（±1分钟）

**如果失败**: 检查 Skills 是否正确加载（查看启动日志）。

---

#### 4.2 测试健康检查 (HealthCheck Skill - 可选)

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "检查服务健康状态"}
    ],
    "stream": false
  }'
```

#### 预期结果

响应应包含健康状态信息。

#### 验证点

- [ ] HTTP 状态码 200
- [ ] 响应包含健康相关信息
- [ ] 状态显示正常

---

### 步骤 6: WebSocket 功能 (可选，2 分钟)

#### 5.1 测试 WebSocket 连接

**方法 1: 使用 wscat (推荐)**

```bash
# 安装 wscat (如果未安装)
npm install -g wscat

# 连接 WebSocket
wscat -c ws://localhost:8088/ws

# 发送消息
> {"type":"chat","content":"你好"}

# 断开连接
Ctrl+C
```

**方法 2: 使用 Chrome 插件 "Simple WebSocket Client"**

1. 打开 Chrome 浏览器
2. 安装 "Simple WebSocket Client" 插件
3. 连接到 `ws://localhost:8088/ws`
4. 发送消息: `{"type":"chat","content":"你好"}`

#### 验证点

- [ ] WebSocket 连接成功
- [ ] 能发送消息
- [ ] 能接收响应
- [ ] 断开连接正常

**如果失败**: 检查 WebSocket 服务是否启动（查看启动日志）。

---

## ✅ 验证结果汇总

### 验证清单

| 步骤 | 功能 | 状态 | 备注 |
|------|------|------|------|
| 1 | 服务启动 | ⬜ | |
| 2 | 健康检查 | ⬜ | |
| 3.1 | 非流式聊天 | ⬜ | |
| 3.2 | 流式聊天 | ⬜ | |
| 4.1 | LLM 配置验证 ⭐ | ⬜ | 新架构 |
| 5.1 | 时间查询 Skill | ⬜ | |
| 5.2 | 健康检查 Skill (可选) | ⬜ | |
| 6 | WebSocket (可选) | ⬜ | |

### 通过标准

**最小通过标准** (必需):
- ✅ 步骤 1: 服务启动
- ✅ 步骤 2: 健康检查
- ✅ 步骤 3.1: 非流式聊天
- ✅ 步骤 3.2: 流式聊天
- ✅ 步骤 4.1: LLM 配置验证 ⭐新增
- ✅ 步骤 5.1: 时间查询 Skill

**完整通过标准** (推荐):
- 以上 6 项 + 步骤 5.2 + 步骤 6

---

## 🔍 快速故障排查

### 问题 1: 服务启动失败

**症状**: `npm run dev` 报错

**常见原因**:
1. 端口 8088 被占用
2. `.env` 配置错误
3. 依赖未安装

**解决方法**:

```bash
# 检查端口占用
lsof -i:8088

# 检查环境变量
cat .env | grep -E "(PORT|LLM_PROVIDER|API_KEY)"

# 重新安装依赖
rm -rf node_modules package-lock.json
npm install
```

---

### 问题 2: LLM API 调用失败

**症状**: 聊天请求返回 500 错误

**常见原因**:
1. API Key 无效或过期
2. 网络连接问题
3. API 配额用尽

**解决方法**:

```bash
# 验证 API Key
echo $DEEPSEEK_API_KEY

# 测试网络连接
curl https://api.deepseek.com

# 检查详细日志
LOG_LEVEL=debug npm run dev
```

---

### 问题 3: Skills 未加载

**症状**: 工具调用不工作

**常见原因**:
1. Skills 目录结构错误
2. 执行脚本缺失
3. 元数据解析失败

**解决方法**:

```bash
# 验证 Skills 结构
npm run validate:skills

# 查看 Skills 加载日志
npm run dev 2>&1 | grep -i skill

# 检查 Skills 目录
ls -la skills/*/
```

---

## 📊 预期时间分配

| 步骤 | 时间 | 累计时间 |
|------|------|----------|
| 1. 服务启动验证 | 2 分钟 | 2 分钟 |
| 2. 健康检查 | 30 秒 | 2.5 分钟 |
| 3. 基本聊天功能 | 3 分钟 | 5.5 分钟 |
| 4. LLM 配置验证 ⭐ | 1 分钟 | 6.5 分钟 |
| 5. 工具调用功能 | 3 分钟 | 9.5 分钟 |
| 6. WebSocket 功能 (可选) | 2 分钟 | 11.5 分钟 |

**实际时间可能因网络和 LLM API 响应速度而有所差异。**

---

## 🎯 下一步

### 如果快速验证通过

恭喜！核心功能正常，可以：
1. 进行 [完整验证](./FULL_VALIDATION_CHECKLIST.md)（30 分钟）
2. 开始使用系统
3. 进行功能开发

### 如果快速验证失败

1. 参考上方的快速故障排查
2. 查看 [故障排查指南](./TROUBLESHOOTING_GUIDE.md)
3. 查看服务日志: `tail -f logs/apexbridge.log`
4. 提交 Issue: https://github.com/suntianc/apex-bridge/issues

---

## 📝 测试记录模板

```markdown
## 快速验证记录

- **验证日期**: 2025-11-18
- **验证人员**: [姓名]
- **ApexBridge 版本**: v1.0.1
- **Node.js 版本**: v18.16.0
- **LLM 提供商**: DeepSeek

### 验证结果

| 步骤 | 结果 | 备注 |
|------|------|------|
| 服务启动 | ✅ | 启动时间 2.5s |
| 健康检查 | ✅ | 响应时间 50ms |
| 非流式聊天 | ✅ | 响应时间 1.2s |
| 流式聊天 | ✅ | 正常 |
| 时间查询 | ✅ | 时间准确 |
| WebSocket | ✅ | 连接正常 |

**总体结果**: ✅ 通过

**备注**: 无
```

---

## 🔗 相关文档

- [测试总览指南](../MANUAL_TESTING_GUIDE.md)
- [30 分钟完整验证清单](./FULL_VALIDATION_CHECKLIST.md)
- [回归测试清单](./REGRESSION_TEST_CHECKLIST.md)
- [故障排查指南](./TROUBLESHOOTING_GUIDE.md)

---

**Happy Testing! 🚀**

*最后更新: 2025-11-18*

