# Apex Bridge

[English](./README.md) | [简体中文](./README.zh-CN.md)

现代化AI协议服务器，支持工具调用、变量解析和插件管理。

## 功能特性

- **命名空间变量系统** - 统一的 `{{namespace:key}}` 语法，内置7种变量提供器
- **RAG高级检索** - 支持时间感知、语义组扩展和重排序
- **异步工具回调** - 支持长时间运行任务，自动解析结果
- **请求中断API** - 优雅地取消正在执行的请求
- **插件系统** - 支持直接执行、混合型和静态插件
- **多LLM支持** - DeepSeek、OpenAI、智谱、Ollama

## 安装

```bash
npm install
```

## 快速开始

1. 复制环境变量模板:
```bash
cp env.template .env
```

2. 在 `.env` 中配置LLM提供商:
```env
PORT=8088
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_api_key
```

3. 启动服务:
```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

4. 测试连接:
```bash
curl http://localhost:8088/health
```

## 使用方法

### 对话补全API

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'
```

### 命名空间变量

```
{{env:API_KEY}}           # 环境变量
{{time:now}}              # 当前时间
{{agent:name}}            # Agent名称
{{rag:diary:用户:time}}   # RAG时间感知检索
{{tool:all}}              # 所有工具描述
```

### RAG高级检索

```
{{rag:来源:目标:模式}}

模式:
- basic         # 向量检索
- time          # 时间感知检索
- group         # 语义组扩展
- rerank        # 外部重排序API
- time+group+rerank  # 组合模式
```

## 项目结构

```
vcp-intellicore/
├── src/
│   ├── api/              # API路由和控制器
│   ├── core/             # 核心引擎 (VCPEngine, LLMClient)
│   ├── services/         # 业务服务
│   └── server.ts         # 服务器入口
├── plugins/              # 插件目录
│   ├── direct/           # 直接执行插件
│   ├── hybrid/           # 混合型插件
│   └── static/           # 静态信息插件
├── config/               # 配置示例
└── docs/                 # 文档
```

## 配置说明

查看 [env.template](./env.template) 了解所有可用配置选项。

主要配置:
- LLM提供商设置
- RAG检索参数
- 异步结果清理
- 日记归档设置
- WebSocket配置

## API接口

- `POST /v1/chat/completions` - 对话补全 (兼容OpenAI)
- `POST /v1/interrupt` - 中断正在执行的请求
- `POST /plugin-callback/:pluginName/:taskId` - 异步工具回调
- `GET /v1/models` - 列出可用模型
- `GET /health` - 健康检查

## 依赖项

- [abp-rag-sdk](https://www.npmjs.com/package/abp-rag-sdk) (原vcp-intellicore-rag) - RAG服务
- 所有核心组件（Protocol引擎、VariableEngine、PluginRuntime、WebSocket通道）均为独立实现，不再依赖外部SDK

## 文档

- [用户手册（中文）](./docs/USER_GUIDE.zh-CN.md)
- [User Guide (English)](./docs/USER_GUIDE.md)

## 许可证

Apache-2.0 许可证 - 详见 [LICENSE](./LICENSE)

## 相关链接

- GitHub: https://github.com/suntianc/apex-bridge
- Issues: https://github.com/suntianc/apex-bridge/issues

## 致谢

特别感谢 VCPToolBox 项目及其作者，他们开创性地设计了 VCP 协议架构，并提供了基础实现，为本项目提供了重要的参考和启发。
