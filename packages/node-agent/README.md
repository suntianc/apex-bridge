# Apex Node Agent (Preview)

节点运行时（Node Agent）为 Apex Bridge Hub 提供标准化的 Worker / Companion 节点框架。  
- ✅ 支持配置加载、CLI 启动、结构化日志与 Telemetry 健康检查  
- ✅ 实现 WebSocket 连接/重连、注册、心跳、任务调度与结果上报  
- ✅ 集成 Hub LLM 代理（含流式响应、限流处理）、默认能力包  
- ✅ 提供单元/集成测试脚手架（Jest + Mock Hub）

## 快速开始

```bash
cd packages/node-agent
npm install

# 复制示例配置并修改
cp config.example.json node-agent.config.json

# 启动节点（连接真实 Hub 并执行任务）
npx ts-node src/index.ts start --config node-agent.config.json
```

### 环境变量覆盖

常见覆盖项（优先级高于配置文件）：

| 变量 | 描述 |
|------|------|
| `NODE_AGENT_CONFIG` | 指定配置文件路径 |
| `NODE_AGENT_HUB_URL` | Hub WebSocket 地址 |
| `NODE_AGENT_NODE_NAME` | 节点名称 |
| `NODE_AGENT_NODE_TYPE` | 节点类型（`worker` / `companion`） |
| `NODE_AGENT_NODE_CAPABILITIES` | 能力列表，逗号分隔 |
| `NODE_AGENT_TASKS_MAX_CONCURRENT` | 任务并发数 |
| `NODE_AGENT_LLM_STREAM_ENABLED` | 是否启用 LLM 流式 |
| `NODE_AGENT_LOGGING_LEVEL` | 日志级别（debug/info/warn/error） |
| `NODE_AGENT_SKILLS_DIRECTORY` | Skills 目录路径 |

更多变量见 `src/config/loader.ts`。

### 配置文件结构

```jsonc
{
  "hub": {
    "url": "ws://localhost:8088/abp-distributed-server/ABP_Key=xxx",
    "abpKey": "sk-example"
  },
  "node": {
    "name": "Example Worker",
    "type": "worker",
    "capabilities": ["echo"],
    "tools": ["echo"]
  },
  "heartbeat": { "intervalMs": 30000 },
  "tasks": { "maxConcurrent": 2, "defaultTimeoutMs": 60000 },
  "llm": {
    "streamEnabled": true,
    "localFallback": false,
    "retry": { "attempts": 1, "delayMs": 1000 }
  },
  "telemetry": {
    "enabled": true,
    "port": 8765
  },
  "logging": { "level": "info", "format": "pretty" },
  "skills": {
    "directory": "skills"
  }
}
```

### Telemetry / 健康检查

启用后会在 `telemetry.port`（默认 8765）启动 HTTP 服务：

- `GET /healthz` 返回节点状态、最后一次心跳时间、任务统计、主机负载等信息  
- 状态说明：`ok`（连接正常）、`degraded`（重连中或存在告警）、`critical`（连接断开）

便于运维以 Prometheus/HTTP 检查方式监控节点健康状况。

## 默认能力（预览）

- **Worker**：
  - `echo`：返回原始参数
  - `wait`：延时执行，支持超时/终止
  - `llm-tool`：调用 Hub LLM，可选流式返回
- **Companion**：`companion_ack`、`companion_delegate`、`companion_conversation`（流式回复 + 限流降级）

可按需扩展自定义能力模块并注册到 `TaskOrchestrator`。

### Skills 体系

- 配置项 `skills.directory` 指定 Skills 目录（默认 `skills/`，相对运行目录）。
- 每个 Skill 必须包含 `SKILL.md`（元数据 + 描述）和 `scripts/execute.ts`（执行脚本）。
- 节点启动时自动扫描并加载所有有效的 Skills。

#### Skills 目录结构

```
skills/
  Echo/
    SKILL.md          # 技能元数据（YAML frontmatter + Markdown 描述）
    scripts/
      execute.ts      # 执行脚本（导出 execute 函数）
```

#### 示例 Skill

```typescript
// skills/Echo/scripts/execute.ts
export function execute(parameters: { message?: string }): { echoed: any } {
  return { echoed: parameters };
}

export default execute;
```

```yaml
# skills/Echo/SKILL.md
---
name: Echo
displayName: Echo
description: Echo tool for testing
version: 1.0.0
type: direct
input_schema:
  type: object
  properties:
    message:
      type: string
output_schema:
  type: object
  properties:
    echoed:
      type: object
security:
  timeout_ms: 5000
resources:
  entry: ./scripts/execute.ts
---
# Echo Skill

简单的回显工具，用于测试 Skills 系统。
```

- Skills 格式与主系统（Hub）保持一致，便于技能在 Hub 和节点间共享。
- 支持输入/输出参数验证（基于 JSON Schema）、超时控制、结果缓存等特性。
- 示例 Skill：`skills/Echo/`（已包含在项目中）。

## 日志

- 默认为 `pretty` 格式输出，便于本地调试。
- 可通过配置切换到 JSON 格式，方便收集与聚合。

### Companion 流式输出与限流处理

- `companion_conversation` 默认启用流式模式，实时收集 `partialOutputs`，最终返回完整回复与分片列表，方便前端逐步渲染。
- 当 Hub 返回 `rate_limit_exceeded` / `quota_exceeded` 等错误时，可在任务 `metadata.fallbackReply` 中指定降级文本，节点将带上 `degraded: true` 字段回传，便于上层回退策略。
- 通过 `llm` 配置（`stream`、`temperature`、`maxTokens`）可灵活控制 LLM 行为。

### 本地测试与验证

```bash
# 在 packages/node-agent 目录
npm run build           # TypeScript 编译
npm run test            # 运行 Jest 单元 + 集成测试
npm run test -- hub-companion.integration.test.ts  # Hub + Companion 实机联调用例
npm run test -- hub-worker.integration.test.ts     # Hub + Worker 实机联调用例
```

## 运行示例

### Worker 待办节点

```bash
cd packages/node-agent
npx node-agent start --config config.worker.todo.json
```

- 生成的待办、通知保存在 `runtime-data/` 目录（JSON Lines 格式）。
- 可通过 Skills 体系扩展自定义工具（如 `calendar_task`、`notify_user`）。
- 可结合 Companion 节点输出的 `delegations` 自动触发。

### Companion 节点

```bash
npx node-agent start --config config.companion.json
```

配合 Worker 与 Hub，可完成对话 → 委派工具 → 执行反馈的完整链路。

## 下一步计划

- 根据业务需要扩展更多 Worker 工具（如邮件、文档生成等）。
- 完善自动委派策略与监控仪表盘。
- 补充部署文档（Docker 镜像 / npm 包）、FAQ 与运维手册。