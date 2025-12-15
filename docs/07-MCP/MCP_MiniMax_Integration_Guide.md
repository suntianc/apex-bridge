# MiniMax MCP 服务器集成指南

## 📋 概述

本指南说明如何将 MiniMax MCP 服务器集成到 ApexBridge 项目中。

## ✅ 测试结果

MiniMax MCP 服务器已通过测试，具备以下功能：

### 可用工具

1. **web_search** - 网络搜索工具
   - 功能：类似Google的网络搜索
   - 参数：`query` (必需)
   - 返回：JSON格式的搜索结果

2. **understand_image** - 图像理解工具
   - 功能：分析图像内容
   - 参数：`prompt`, `image_source` (必需)
   - 支持格式：JPEG, PNG, WebP

### 服务器信息
- **名称**: Minimax
- **版本**: 1.24.0
- **协议版本**: 2024-11-05
- **传输方式**: stdio
- **语言**: Python

## 🔧 集成步骤

### 1. 注册 MCP 服务器

在 ApexBridge 中注册 MiniMax MCP 服务器：

```typescript
import { mcpIntegration } from './services/MCPIntegrationService';

const minimaxConfig = {
  id: 'minimax-mcp',
  type: 'stdio',
  command: 'uvx',
  args: ['minimax-coding-plan-mcp', '-y'],
  env: {
    MINIMAX_API_KEY: 'YOUR_API_KEY',
    MINIMAX_API_HOST: 'https://api.minimaxi.com'
  }
};

await mcpIntegration.registerServer(minimaxConfig);
```

### 2. 使用统一工具管理器

通过 UnifiedToolManager 调用工具：

```typescript
import { unifiedToolManager } from './services/UnifiedToolManager';

// 搜索网络
const searchResult = await unifiedToolManager.callTool('web_search', {
  query: 'latest AI news 2025'
});

// 分析图像
const imageResult = await unifiedToolManager.callTool('understand_image', {
  prompt: '描述这张图片中的内容',
  image_source: 'https://example.com/image.jpg'
});
```

### 3. 使用 REST API

通过 REST API 调用工具：

```bash
# 注册服务器
curl -X POST http://localhost:3000/api/mcp/servers \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "minimax-mcp",
    "type": "stdio",
    "command": "uvx",
    "args": ["minimax-coding-plan-mcp", "-y"],
    "env": {
      "MINIMAX_API_KEY": "YOUR_API_KEY",
      "MINIMAX_API_HOST": "https://api.minimaxi.com"
    }
  }'

# 调用 web_search 工具
curl -X POST http://localhost:3000/api/mcp/tools/call \
  -H 'Content-Type: application/json' \
  -d '{
    "toolName": "web_search",
    "arguments": {
      "query": "latest AI news 2025"
    }
  }'

# 调用 understand_image 工具
curl -X POST http://localhost:3000/api/mcp/tools/call \
  -H 'Content-Type: application/json' \
  -d '{
    "toolName": "understand_image",
    "arguments": {
      "prompt": "描述这张图片中的内容",
      "image_source": "https://example.com/image.jpg"
    }
  }'
```

## 📝 使用示例

### 示例1：网络搜索

```typescript
// 搜索AI新闻
const result = await unifiedToolManager.callTool('web_search', {
  query: 'latest AI news 2025'
});

console.log(result.content[0].text);
// 输出：搜索结果JSON，包含organic和related_searches
```

### 示例2：图像理解

```typescript
// 分析图像
const result = await unifiedToolManager.callTool('understand_image', {
  prompt: '这张图片描述了什么场景？',
  image_source: '/path/to/image.jpg'
});

console.log(result.content[0].text);
// 输出：图像分析结果
```

### 示例3：向量搜索 + 自动路由

```typescript
// 搜索相关工具
const tools = await unifiedToolManager.searchTools({
  query: '搜索网络信息',
  type: 'mcp',
  limit: 5
});

console.log(tools);
// 输出：包含 web_search 工具的候选列表
```

## 🔍 测试脚本

已创建以下测试脚本：

1. **test-mcp-minimax.js** - 基础启动测试
2. **test-mcp-minimax-rpc.js** - JSON-RPC 协议测试
3. **test-mcp-minimax-websearch.js** - web_search 工具测试

运行测试：

```bash
# 基础测试
node test-mcp-minimax.js

# JSON-RPC测试
node test-mcp-minimax-rpc.js

# web_search测试
node test-mcp-minimax-websearch.js
```

## 📊 API 响应格式

### web_search 响应

```json
{
  "success": true,
  "content": [
    {
      "type": "text",
      "text": "搜索结果JSON字符串"
    }
  ],
  "duration": 1234,
  "metadata": {
    "toolType": "mcp",
    "source": "minimax-mcp",
    "toolName": "web_search"
  }
}
```

### understand_image 响应

```json
{
  "success": true,
  "content": [
    {
      "type": "text",
      "text": "图像分析结果"
    }
  ],
  "duration": 2345,
  "metadata": {
    "toolType": "mcp",
    "source": "minimax-mcp",
    "toolName": "understand_image"
  }
}
```

## ⚙️ 配置说明

### 环境变量

| 变量名 | 必需 | 描述 | 示例 |
|--------|------|------|------|
| MINIMAX_API_KEY | ✅ | MiniMax API密钥 | eyJ... |
| MINIMAX_API_HOST | ✅ | API服务器地址 | https://api.minimaxi.com |

### 必需依赖

确保系统已安装：
- **uvx** - Python包管理器
- **Python 3.8+** - Python运行环境
- **pip** - Python包安装工具

安装命令：
```bash
# 安装 uvx
curl -LsSf https://astral.sh/uv/install.sh | sh

# 或使用 pip
pip install uvx
```

## 🔐 安全建议

1. **API密钥安全**
   - 不要在代码中硬编码API密钥
   - 使用环境变量或密钥管理服务
   - 定期轮换API密钥

2. **权限控制**
   - 限制MCP服务器的访问权限
   - 监控工具调用日志
   - 设置调用频率限制

3. **网络安全**
   - 使用HTTPS连接
   - 验证SSL证书
   - 防止中间人攻击

## 🐛 故障排除

### 常见问题

**Q: 服务器启动失败**
```
错误：uvx: command not found
解决：安装 uvx
```

**Q: API调用失败**
```
错误：Invalid API key
解决：检查 MINIMAX_API_KEY 是否正确
```

**Q: 网络搜索超时**
```
错误：Request timeout
解决：增加超时时间或检查网络连接
```

### 调试方法

1. 查看服务器日志：
```bash
# 查看 stderr 输出
node test-mcp-minimax-rpc.js 2>&1 | grep STDERR
```

2. 测试JSON-RPC通信：
```bash
# 手动发送请求
echo '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}' \
  | uvx minimax-coding-plan-mcp -y
```

## 📚 参考资源

- [MiniMax API 文档](https://api.minimaxi.com/docs)
- [MCP 协议规范](https://modelcontextprotocol.io/)
- [ApexBridge 项目仓库](https://github.com/suntianc/apex-bridge)

## ✅ 集成检查清单

- [ ] 安装必需依赖（uvx, Python 3.8+）
- [ ] 获取 MiniMax API 密钥
- [ ] 配置环境变量
- [ ] 注册 MCP 服务器到 ApexBridge
- [ ] 测试工具调用
- [ ] 集成到生产环境
- [ ] 设置监控和日志
- [ ] 配置安全策略

## 🎯 下一步

1. 在 ApexBridge 中注册 MiniMax MCP 服务器
2. 配置API密钥和环境变量
3. 运行集成测试
4. 添加到生产环境
5. 配置监控和告警

---

**维护者**: ApexBridge Team
**最后更新**: 2025-01-15
**状态**: ✅ 集成就绪
