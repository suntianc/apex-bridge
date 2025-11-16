---
title: 故障排除指南
type: documentation
module: troubleshooting
priority: high
environment: all
last-updated: 2025-11-16
---

# 🔧 故障排除指南

本文档汇总了 ApexBridge 项目常见问题及解决方案。

## 📋 问题快速索引

| 问题类型 | 常见症状 | 解决方案 |
|---------|---------|---------|
| [服务启动失败](#服务启动失败) | 端口占用、配置错误 | 检查端口、验证配置 |
| [WebSocket 连接问题](#WebSocket-连接问题) | 无法连接、频繁断开 | 检查路径、认证、日志 |
| [Skills 加载失败](#Skills-加载失败) | 技能不可用、执行错误 | 检查路径、权限、格式 |
| [RAG 搜索异常](#RAG-搜索异常) | 搜索结果为空、性能慢 | 检查索引、配置 |
| [API 认证失败](#API-认证失败) | 401 Unauthorized | 检查 API Key、权限配置 |
| [内存泄漏](#内存-泄漏) | 内存持续增长 | 监控、优化代码 |
| [性能问题](#性能问题) | 响应慢、超时 | 优化提示词、检查资源 |

---

## 🔴 服务启动失败

### 现象

```
Error: listen EADDRINUSE: address already in use :::3000
Error: Configuration loading failed
Error: Cannot find module './config'
```

### 排查步骤

#### 1. 端口被占用

**检查端口占用：**
```bash
# Linux/macOS
lsof -i :3000

# Windows
netstat -ano | findstr :3000
tasklist | findstr <PID>
```

**解决方法：**
```bash
# 方法1：结束占用进程
kill -9 <PID>  # Linux/macOS
taskkill /PID <PID> /F  # Windows

# 方法2：修改端口
# 编辑 config/admin-config.json
{
  "general": {
    "server": {
      "port": 3001  # 修改为其他端口
    }
  }
}
```

#### 2. 配置错误

**验证配置：**
```bash
# 检查配置文件
npm run validate:config

# 或使用脚本
ts-node scripts/validate-config.ts
```

**常见配置错误：**
- JSON 格式错误（缺少逗号、引号）
- 必填字段缺失（apiKey、port 等）
- 类型不匹配（字符串 vs 数字）

**解决方法：**
```bash
# 使用模板重新生成配置
cp config/admin-config.json.template config/admin-config.json
# 然后重新填写正确信息
```

#### 3. 依赖缺失

**检查依赖：**
```bash
# 重新安装依赖
npm install

# 检查特定包
npm ls <package-name>
```

---

## 🟠 WebSocket 连接问题

### 现象

- 无法建立连接
- 连接后立即断开
- 消息发送失败
- 认证错误

### 排查步骤

#### 1. 检查连接 URL

**正确格式：**
```
ws://localhost:3000/ABPlog/ABP_Key=your-key
ws://localhost:3000/admin/ABP_Key=your-key
```

**常见错误：**
```
❌ ws://localhost:3000/log              # 缺少 ABP_Key
❌ ws://localhost:3000/ABPlog           # 缺少认证参数
❌ http://localhost:3000/ABPlog/...     # 使用 http 而不是 ws
```

#### 2. 检查服务器日志

**查看 WebSocket 日志：**
```bash
# 查找 WebSocket 相关日志
grep -i "websocket\|ABPlog\|ABPLog" logs/app.log

# 或实时查看
tail -f logs/app.log | grep -i websocket
```

**正常日志示例：**
```
📡 New ABPLog client connecting: abplog-1-1234567890
✅ ABPLog client abplog-1-1234567890 connected (total: 1)
📡 Broadcasted to 1/1 ABPLog clients
```

**错误日志示例：**
```
❌ ABPLog WebSocket error from abplog-1-1234567890: Invalid ABP_Key
🔌 ABPLog client abplog-1-1234567890 disconnected
```

#### 3. 测试工具

**使用 wscat 测试：**
```bash
# 安装 wscat
npm install -g wscat

# 测试连接
wscat -c ws://localhost:3000/ABPlog/ABP_Key=your-key

# 测试消息
> {"type":"subscribe","data":{"channel":"logs"}}
```

**使用 Postman：**
1. 新建 WebSocket 请求
2. URL: `ws://localhost:3000/ABPlog/ABP_Key=your-key`
3. 点击 Connect

#### 4. 常见错误与解决

**错误 1：连接超时**
```
Error: Unexpected server response: 404
```
**解决：**
- 检查服务器是否运行
- 验证 URL 路径是否正确
- 确认端口是否开放

**错误 2：认证失败**
```
Error: Invalid ABP_Key
```
**解决：**
- 检查 config/admin-config.json 中的 abp.apiKey
- 确认 URL 中的 key 是否正确
- 检查是否有多余的空格或字符

**错误 3：连接立即断开**
```
connected (press CTRL+C to quit)
disconnected
```
**解决：**
- 检查服务器日志
- 查看是否有异常抛出
- 验证客户端是否发送了正确的握手消息

详见完整指南：[WebSocket 故障排除](./testing/WEBSOCKET_TROUBLESHOOTING.md)

---

## 🟡 Skills 加载失败

### 现象

```
Error: Skill not found: WeatherInfo
Error: Failed to load skill: Invalid metadata
Error: Skill execution failed: Timeout
```

### 排查步骤

#### 1. 检查 Skills 路径

**验证 Skills 存在：**
```bash
# 检查 Skills 目录
ls -la skills/

# 检查具体 Skill
ls -la skills/WeatherInfo/
cat skills/WeatherInfo/SKILL.md
```

#### 2. 检查 Skills 格式

**验证元数据格式：**
```bash
# 使用验证脚本
npm run validate:skills

# 或严格模式
npm run validate:skills:strict
```

**常见格式错误：**
- METADATA.yml 缺失或格式错误
- SKILL.md 格式不正确
- scripts/execute.ts 不存在

#### 3. 检查权限

**验证文件权限：**
```bash
# 检查 Skills 目录权限
ls -la skills/

# 确保有执行权限
chmod +x skills/*/scripts/execute.ts
```

#### 4. 查看加载日志

**检查 Skills 加载：**
```bash
# 查看启动日志
grep -i "skill\|metadata" logs/app.log

# 正常示例
✅ Loaded 5 skills from skills/
✅ skills/WeatherInfo metadata loaded
✅ skills/WeatherInfo scripts/execute.ts loaded
```

---

## 🟢 RAG 搜索异常

### 现象

```
RAG search returned empty results
RAG search timeout
Error: Vector store not initialized
```

### 排查步骤

#### 1. 检查 RAG 服务状态

**查看 RAG 初始化日志：**
```bash
grep -i "rag\|vector" logs/app.log

# 正常示例
✅ RAGService initialized
✅ Vector store loaded: ./data/vectors
MemoryService initialized (RAG mode)
```

#### 2. 验证索引文件

**检查索引文件：**
```bash
# 检查向量存储目录
ls -la data/vectors/

# 应该包含索引文件
index.bin
metadata.json
```

#### 3. 测试搜索功能

**使用测试脚本：**
```bash
# 运行 MemoryService 测试
npm test -- MemoryServiceRAG

# 或运行时测试
npm run test:memory-runtime
```

详见完整指南：[MemoryService 测试指南](./MEMORY_SERVICE_TEST_GUIDE.md)

---

## 🔵 API 认证失败

### 现象

```
HTTP 401 Unauthorized
Error: Invalid API key
Error: Permission denied
```

### 排查步骤

#### 1. 检查 API Key

**验证 API Key 配置：**
```bash
# 检查配置文件
cat config/admin-config.json | grep -i apikey
```

**测试 API：**
```bash
# 使用正确 API key
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello"}'

# 或使用 ABP_Key
curl -X POST "http://localhost:3000/api/chat?ABP_Key=your-key" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello"}'
```

#### 2. 检查权限配置

**查看权限设置：**
```json
{
  "security": {
    "apiKeys": {
      "admin": "admin-key",
      "user": "user-key"
    },
    "permissions": {
      "admin": ["*"],
      "user": ["chat", "rag"]
    }
  }
}
```

---

## 🟣 性能问题

### 现象

- 响应时间过长（> 5秒）
- 频繁超时
- CPU/内存占用过高

### 排查步骤

#### 1. 监控资源使用

**检查系统资源：**
```bash
# 查看 CPU 和内存
top -p $(pgrep -f "node.*server.js")

# 或 htop（更友好）
htop
```

**使用性能测试：**
```bash
# 运行性能基准测试
npm run test:benchmark

# 查看测试报告
cat test-results/benchmark-results.json
```

#### 2. 优化建议

**减少响应时间：**
- 优化 system prompt，减少不必要的内容
- 启用流式响应（streaming）
- 调整 max_tokens 限制

**降低资源占用：**
- 减少并发连接数
- 优化 Skills 缓存策略
- 定期清理日志文件

#### 3. 性能分析

**查看详细性能数据：**
```bash
# 查看应用日志中的性能信息
grep -i "performance\|latency\|duration" logs/app.log

# 示例输出
[Performance] Chat response: 3200ms
[Performance] RAG search: 150ms
[Performance] Skills execution: 450ms
```

---

## ⚫ 内存泄漏

### 现象

- 内存持续增长不释放
- 进程被 OOM killer 终止
- 响应变慢

### 排查步骤

#### 1. 监控内存使用

**检查内存趋势：**
```bash
# 持续监控内存
watch -n 5 "ps aux | grep node | grep -v grep"

# 查看内存占用
RSS=$(ps -o rss= -p $(pgrep -f "node.*server.js"))
echo "Memory usage: $((RSS / 1024)) MB"
```

#### 2. 使用分析工具

**使用 heapdump：**
```bash
# 生成内存快照
npm run heapdump

# 分析快照
node --inspect analyze-heap.js
```

**启用详细日志：**
```bash
# 在 .env 中设置
LOG_LEVEL=debug
DEBUG=memory,gc
```

#### 3. 常见泄漏源

**WebSocket 连接：**
- 未正确关闭连接
- 消息监听器未清理

**Skills 缓存：**
- 缓存无限增长
- 缺少过期策略

**日志积累：**
- 日志文件无限增大
- 缺少轮转机制

**解决方案：**
```bash
# 1. 重启服务
npm run restart

# 2. 清理缓存
rm -rf tmp/
pm run clean:caches

# 3. 归档日志
mv logs/app.log logs/app.log.$(date +%Y%m%d)
```

---

## 📞 获取帮助

如果以上方法无法解决问题，请：

1. **收集日志**
   ```bash
   # 打包日志文件
   tar -czf debug-logs.tar.gz logs/ config/ *.log
   ```

2. **查看完整指南**
   - [📊 测试结果汇总](./testing/TEST_RESULTS_SUMMARY.md)
   - [🎯 集成测试场景](./testing/INTEGRATION_SCENARIOS.md)

3. **提交 Issue**
   - 访问: https://github.com/suntianc/apex-bridge/issues
   - 附上日志文件
   - 描述详细的复现步骤

---

**最后更新**: 2025-11-16
**文档版本**: v1.0.1
