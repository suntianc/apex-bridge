# DemoAsyncTask 演示插件

## 📖 功能说明

这是一个演示异步工具回调机制的示例插件，用于展示 VCP IntelliCore 的异步工具协议。

### 工作流程

1. **立即响应**: 插件收到请求后立即返回任务ID（Archery异步模式）
2. **后台执行**: 在后台模拟长时间运行的任务
3. **回调通知**: 任务完成后，自动回调到 `/plugin-callback/:pluginName/:taskId` 端点
4. **结果查询**: 用户可以通过占位符 `{{async:DemoAsyncTask::TaskId}}` 查询结果

## 🔧 使用方法

### 基础用法

```
DemoAsyncTask「始」{ "taskName": "数据处理", "duration": 5 }「末」
```

### 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `taskName` | string | 否 | "异步任务" | 任务名称 |
| `duration` | number | 否 | 5 | 模拟执行时长（秒） |
| `shouldFail` | boolean | 否 | false | 是否模拟失败 |

### 示例场景

#### 1. 正常执行（5秒）

```
DemoAsyncTask「始」{ "taskName": "报告生成", "duration": 5 }「末」
```

**立即响应**:
```
TaskId: task_1730000000000_abc123
Tips: 异步任务已启动，任务ID: task_1730000000000_abc123。
      任务完成后将通过回调通知，您可以通过占位符 {{async:DemoAsyncTask::task_1730000000000_abc123}} 获取结果。
```

**5秒后回调**（自动保存到 `async_results/2025_10_30/DemoAsyncTask-task_1730000000000_abc123.json`）:
```json
{
  "requestId": "task_1730000000000_abc123",
  "status": "Succeed",
  "message": "任务 \"报告生成\" 已完成",
  "content": "✅ 异步任务成功完成！\n任务名称: 报告生成\n执行时长: 5秒\n完成时间: 2025/10/30 14:30:00",
  "timestamp": 1730000000000,
  "pluginName": "DemoAsyncTask",
  "taskName": "报告生成",
  "duration": 5,
  "completedAt": "2025-10-30T06:30:00.000Z"
}
```

**在后续对话中使用**:
```
用户: 我的报告生成好了吗？{{async:DemoAsyncTask::task_1730000000000_abc123}}
```

系统会自动将占位符替换为结果内容。

#### 2. 快速任务（1秒）

```
DemoAsyncTask「始」{ "taskName": "快速查询", "duration": 1 }「末」
```

#### 3. 长时间任务（30秒）

```
DemoAsyncTask「始」{ "taskName": "大数据分析", "duration": 30 }「末」
```

#### 4. 模拟失败

```
DemoAsyncTask「始」{ "taskName": "错误测试", "duration": 3, "shouldFail": true }「末」
```

**失败回调**:
```json
{
  "requestId": "task_xxx",
  "status": "Failed",
  "message": "任务 \"错误测试\" 执行失败",
  "content": "模拟失败场景，任务ID: task_xxx",
  "reason": "这是一个模拟的失败",
  "timestamp": 1730000000000,
  "pluginName": "DemoAsyncTask"
}
```

## 🔑 环境变量配置

插件需要以下环境变量：

```bash
# .env
VCP_CALLBACK_URL=http://localhost:8088/plugin-callback  # 回调端点URL
VCP_API_KEY=sk-your-api-key-here                        # API认证密钥
```

## 📊 数据流程图

```
用户 -> VCPChat -> IntelliCore -> DemoAsyncTask
                                    |
                                    | (立即返回 TaskId)
                                    v
                                 后台任务
                                    |
                                    | (模拟执行 N 秒)
                                    v
                                 完成/失败
                                    |
                                    | (HTTP POST 回调)
                                    v
IntelliCore <- /plugin-callback <- AsyncResultProvider (保存结果)
    |
    | (WebSocket 推送)
    v
VCPChat (显示通知)

--- 后续对话 ---

用户: 查询结果 {{async:DemoAsyncTask::TaskId}}
          |
          v
    占位符解析 -> 从文件加载结果 -> 替换到消息中
```

## 📁 文件存储格式

异步结果保存在按日期组织的目录中：

```
async_results/
├── 2025_10_30/
│   ├── DemoAsyncTask-task_1730000000000_abc123.json
│   ├── DemoAsyncTask-task_1730000001234_def456.json
│   └── ...
├── 2025_10_31/
│   └── ...
└── ...
```

## 🧪 测试命令

1. **启动 IntelliCore**:
   ```bash
   cd vcp-intellicore
   npm start
   ```

2. **触发异步任务**（通过 VCPChat 或 API）:
   ```json
   POST http://localhost:8088/v1/chat/completions
   {
     "messages": [{
       "role": "user",
       "content": "请帮我执行：DemoAsyncTask「始」{\"taskName\": \"测试任务\", \"duration\": 3}「末」"
     }]
   }
   ```

3. **查看日志**（观察回调过程）:
   ```bash
   tail -f logs/intellicore.log
   ```

4. **查询结果**（等待任务完成后）:
   ```json
   POST http://localhost:8088/v1/chat/completions
   {
     "messages": [{
       "role": "user",
       "content": "查询任务结果: {{async:DemoAsyncTask::task_1730000000000_abc123}}"
     }]
   }
   ```

## 🔍 故障排查

### 问题1: 回调失败（401 Unauthorized）

**原因**: API密钥不匹配

**解决**:
```bash
# 确保环境变量一致
VCP_API_KEY=sk-your-api-key-here
```

### 问题2: 回调超时

**原因**: 网络问题或URL配置错误

**解决**:
```bash
# 检查回调URL
VCP_CALLBACK_URL=http://localhost:8088/plugin-callback
```

### 问题3: 占位符未替换

**原因**: 结果文件未找到或TaskId错误

**解决**:
1. 检查 `async_results/` 目录下是否有对应文件
2. 确认 TaskId 拼写正确
3. 查看日志确认回调是否成功

## 📚 扩展建议

基于此插件，您可以开发实际的异步工具：

- **邮件发送插件**: 发送邮件后异步确认
- **文件转换插件**: 后台转换大文件（视频、图片等）
- **数据抓取插件**: 爬取网页内容并回调
- **AI绘图插件**: 调用外部绘图API异步生成图片
- **定时任务插件**: 设置未来某个时间执行任务

