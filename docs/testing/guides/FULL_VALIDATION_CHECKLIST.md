# 30 分钟完整验证清单

> **目标**: 全面验证 ApexBridge 所有核心功能  
> **预计时间**: 30 分钟  
> **适用场景**: 版本发布前验证、重大更新后检查、完整功能测试

## 📋 验证概述

本清单包含完整的测试步骤，全面覆盖系统核心功能和常见使用场景。

### 验证范围

- ✅ 服务启动与配置
- ✅ 所有 API 接口
- ✅ 所有 Skills (5个)
- ✅ 流式和非流式响应
- ✅ 多轮对话
- ✅ WebSocket 通信
- ✅ 错误处理
- ✅ 基本性能指标

---

## 阶段 1: 服务启动与配置 (5 分钟)

### 1.1 环境检查

```bash
# 检查 Node.js 版本
node --version  # 应 >= 16.0.0

# 检查 npm 版本
npm --version   # 应 >= 8.0.0

# 检查项目目录
pwd  # 应在 apex-bridge 目录
```

#### 验证点
- [ ] Node.js >= 16.0.0
- [ ] npm >= 8.0.0
- [ ] 在正确的项目目录

---

### 1.2 配置验证

```bash
# 检查环境变量文件
cat .env

# 必需配置项检查
grep -E "^(LLM_PROVIDER|.*_API_KEY)" .env
```

#### 验证点
- [ ] `.env` 文件存在
- [ ] `LLM_PROVIDER` 已设置
- [ ] 对应提供商的 `API_KEY` 已设置
- [ ] `PORT` 设置（默认 8088）

---

### 1.3 服务启动

```bash
# 启动服务
npm run dev
```

#### 预期日志
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

#### 验证点
- [ ] 无启动错误
- [ ] Skills 数量为 5
- [ ] WebSocket 初始化成功
- [ ] 服务监听端口 8088

---

### 1.4 健康检查

```bash
# 新开终端，测试健康检查
curl http://localhost:8088/health | jq
```

#### 验证点
- [ ] HTTP 200
- [ ] `status: "ok"`
- [ ] 包含 `uptime` 和 `version`

---

## 阶段 2: API 接口测试 (10 分钟)

### 2.1 非流式聊天

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好，请用一句话介绍你自己"}
    ],
    "stream": false
  }' | jq '.choices[0].message.content'
```

#### 验证点
- [ ] HTTP 200
- [ ] 响应包含 content
- [ ] `finish_reason: "stop"`
- [ ] 响应时间 < 5s

---

### 2.2 流式聊天

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -N \
  -d '{
    "messages": [
      {"role": "user", "content": "用50字介绍人工智能"}
    ],
    "stream": true
  }'
```

#### 验证点
- [ ] HTTP 200
- [ ] Content-Type: text/event-stream
- [ ] 接收到多个 data: 块
- [ ] 最后接收到 data: [DONE]

---

### 2.3 多轮对话上下文

```bash
# 第一轮
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "我叫张三"}
    ],
    "stream": false
  }' > response1.json

# 第二轮（带上下文）
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "我叫张三"},
      {"role": "assistant", "content": "你好张三，很高兴认识你！"},
      {"role": "user", "content": "我刚才告诉你我叫什么？"}
    ],
    "stream": false
  }' | jq '.choices[0].message.content'
```

#### 验证点
- [ ] 两轮对话都成功
- [ ] 第二轮响应提到 "张三"
- [ ] 上下文被正确保持

---

### 2.4 System Prompt 测试

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "你是一个诗人，总是用诗句回答。"},
      {"role": "user", "content": "今天天气怎么样？"}
    ],
    "stream": false
  }' | jq '.choices[0].message.content'
```

#### 验证点
- [ ] HTTP 200
- [ ] 响应风格符合 system prompt
- [ ] 回答具有诗意

---

### 2.5 参数验证测试

```bash
# 测试缺少 messages 字段
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "stream": false
  }'

# 测试空 messages 数组
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [],
    "stream": false
  }'
```

#### 验证点
- [ ] 两个请求都返回 400
- [ ] 错误消息明确指出问题
- [ ] 包含 error 对象

---

## 阶段 3: Skills 功能测试 (8 分钟)

### 3.1 TimeInfo 技能

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "现在几点了？"}
    ],
    "stream": false
  }' | jq '.choices[0].message.content'
```

#### 验证点
- [ ] 响应包含时间信息
- [ ] 时间格式正确
- [ ] 时间准确（±1分钟）

---

### 3.2 SystemInfo 技能

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "查询系统信息"}
    ],
    "stream": false
  }' | jq '.choices[0].message.content'
```

#### 验证点
- [ ] 响应包含系统信息
- [ ] 包含操作系统类型
- [ ] 包含 CPU 或内存信息

---

### 3.3 SimpleDice 技能

```bash
# 测试 3 次，验证随机性
for i in {1..3}; do
  echo "第 $i 次："
  curl -X POST http://localhost:8088/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{
      "messages": [
        {"role": "user", "content": "掷骰子"}
      ],
      "stream": false
    }' | jq '.choices[0].message.content'
  echo ""
done
```

#### 验证点
- [ ] 所有请求都成功
- [ ] 结果都在 1-6 之间
- [ ] 至少有 2 个不同的结果（随机性）

---

### 3.4 RockPaperScissors 技能

```bash
# 测试石头剪刀布
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "石头剪刀布，我出石头"}
    ],
    "stream": false
  }' | jq '.choices[0].message.content'
```

#### 验证点
- [ ] 响应包含 AI 的出招
- [ ] 包含游戏结果
- [ ] 游戏逻辑正确

---

### 3.5 HealthCheck 技能

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "检查服务健康状态"}
    ],
    "stream": false
  }' | jq '.choices[0].message.content'
```

#### 验证点
- [ ] 响应包含健康状态
- [ ] 状态显示正常
- [ ] 包含运行时间

---

### 3.6 多 Skills 连续调用

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "请告诉我现在几点，然后查询系统信息"}
    ],
    "stream": false
  }' | jq '.choices[0].message.content'
```

#### 验证点
- [ ] 响应包含时间信息
- [ ] 响应包含系统信息
- [ ] 两个 Skills 都被调用

---

## 阶段 4: WebSocket 测试 (3 分钟)

### 4.1 WebSocket 连接

```bash
# 使用 wscat
npm install -g wscat  # 如果未安装

# 连接
wscat -c ws://localhost:8088/ws
```

#### 验证点
- [ ] 连接成功
- [ ] 无连接错误

---

### 4.2 WebSocket 消息

```bash
# 在 wscat 中发送
> {"type":"chat","content":"你好"}
```

#### 验证点
- [ ] 消息发送成功
- [ ] 接收到响应
- [ ] 响应格式正确

---

### 4.3 WebSocket 断开

```bash
# 在 wscat 中按 Ctrl+C
```

#### 验证点
- [ ] 连接正常断开
- [ ] 服务无错误日志

---

## 阶段 5: 错误处理测试 (2 分钟)

### 5.1 无效 JSON 请求

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{invalid json}'
```

#### 验证点
- [ ] 返回 400
- [ ] 错误消息明确

---

### 5.2 超长请求

```bash
# 生成长文本
LONG_TEXT=$(python3 -c "print('测试' * 1000)")

curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d "{
    \"messages\": [
      {\"role\": \"user\", \"content\": \"$LONG_TEXT 请总结\"}
    ],
    \"stream\": false
  }"
```

#### 验证点
- [ ] 请求被处理或返回明确的限制错误
- [ ] 服务未崩溃

---

## 阶段 6: 性能基准测试 (2 分钟)

### 6.1 响应时间测试

```bash
# 测试 5 次，计算平均响应时间
for i in {1..5}; do
  echo "第 $i 次："
  time curl -X POST http://localhost:8088/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{
      "messages": [
        {"role": "user", "content": "你好"}
      ],
      "stream": false
    }' > /dev/null 2>&1
done
```

#### 验证点
- [ ] 所有请求都成功
- [ ] 平均响应时间 < 5s
- [ ] 无超时错误

---

### 6.2 并发请求测试

```bash
# 并发 5 个请求
for i in {1..5}; do
  curl -X POST http://localhost:8088/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{
      "messages": [
        {"role": "user", "content": "测试'$i'"}
      ],
      "stream": false
    }' &
done
wait
```

#### 验证点
- [ ] 所有 5 个请求都返回 200
- [ ] 无请求失败
- [ ] 服务稳定

---

## ✅ 完整验证结果汇总

### 验证清单

| 阶段 | 项目 | 状态 | 备注 |
|------|------|------|------|
| **阶段 1: 服务启动** | | | |
| 1.1 | 环境检查 | ⬜ | |
| 1.2 | 配置验证 | ⬜ | |
| 1.3 | 服务启动 | ⬜ | |
| 1.4 | 健康检查 | ⬜ | |
| **阶段 2: API 接口** | | | |
| 2.1 | 非流式聊天 | ⬜ | |
| 2.2 | 流式聊天 | ⬜ | |
| 2.3 | 多轮对话 | ⬜ | |
| 2.4 | System Prompt | ⬜ | |
| 2.5 | 参数验证 | ⬜ | |
| **阶段 3: Skills** | | | |
| 3.1 | TimeInfo | ⬜ | |
| 3.2 | SystemInfo | ⬜ | |
| 3.3 | SimpleDice | ⬜ | |
| 3.4 | RockPaperScissors | ⬜ | |
| 3.5 | HealthCheck | ⬜ | |
| 3.6 | 多 Skills 调用 | ⬜ | |
| **阶段 4: WebSocket** | | | |
| 4.1 | 连接 | ⬜ | |
| 4.2 | 消息 | ⬜ | |
| 4.3 | 断开 | ⬜ | |
| **阶段 5: 错误处理** | | | |
| 5.1 | 无效 JSON | ⬜ | |
| 5.2 | 超长请求 | ⬜ | |
| **阶段 6: 性能** | | | |
| 6.1 | 响应时间 | ⬜ | |
| 6.2 | 并发请求 | ⬜ | |

### 通过标准

**完整通过**: 所有 22 个验证项都通过  
**基本通过**: 至少 18 个验证项通过 (82%)  
**需要关注**: 少于 18 个验证项通过

---

## 📊 测试记录模板

```markdown
## 完整验证记录

- **验证日期**: 2025-11-18
- **验证人员**: [姓名]
- **ApexBridge 版本**: v1.0.1
- **Node.js 版本**: v18.16.0
- **LLM 提供商**: DeepSeek

### 验证结果统计

- **总验证项**: 22
- **通过项**: XX
- **失败项**: XX
- **跳过项**: XX
- **通过率**: XX%

### 性能指标

- **服务启动时间**: X.Xs
- **平均响应时间**: X.Xs
- **并发请求成功率**: 100%
- **内存占用**: XXX MB

### 失败项详情

1. [项目编号]: [失败原因]
2. ...

### 总体评估

[简要总结系统状态和建议]

### 备注

[其他需要说明的信息]
```

---

## 🎯 验证后行动

### 如果完整验证通过 (>90%)

✅ 系统状态良好，可以：
1. 投入生产使用
2. 进行版本发布
3. 开始高级功能开发

### 如果部分验证失败 (70-90%)

⚠️ 系统基本可用，但需要：
1. 查看失败项详情
2. 修复已知问题
3. 重新进行验证

### 如果大量验证失败 (<70%)

❌ 系统存在严重问题：
1. 停止使用当前版本
2. 回滚到上一个稳定版本
3. 进行全面排查和修复
4. 参考 [故障排查指南](./TROUBLESHOOTING_GUIDE.md)

---

## 📚 相关文档

- [10 分钟快速验证](./QUICK_VALIDATION_CHECKLIST.md)
- [回归测试清单](./REGRESSION_TEST_CHECKLIST.md)
- [测试总览指南](../MANUAL_TESTING_GUIDE.md)
- [故障排查指南](./TROUBLESHOOTING_GUIDE.md)

---

## 💡 验证技巧

1. **使用 jq 美化输出**: 
   ```bash
   curl ... | jq
   ```

2. **保存响应用于分析**:
   ```bash
   curl ... > response.json
   ```

3. **查看详细的 HTTP 信息**:
   ```bash
   curl -v ...
   ```

4. **并行执行测试**:
   ```bash
   # 使用 GNU parallel
   parallel -j 5 curl ... ::: test1 test2 test3
   ```

5. **自动化验证脚本**:
   ```bash
   # 创建 validate.sh
   #!/bin/bash
   # 按顺序执行所有验证
   ```

---

**Happy Testing! 🎉**

*最后更新: 2025-11-18*

