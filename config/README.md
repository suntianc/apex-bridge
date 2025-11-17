# 配置文件说明

## 重要提示

⚠️ **配置文件包含敏感信息（API Keys、密码等），不应提交到 Git 仓库！**

## 配置文件模板

- `admin-config.json.template` - 主配置文件模板
- `rag_tags.json.example` - RAG 标签配置示例
- `semantic_groups.json.example` - 语义组配置示例

## 初始化配置

首次使用时，请复制模板文件并填写实际配置：

```bash
# 复制主配置模板
cp config/admin-config.json.template config/admin-config.json

# 编辑配置文件，填写你的 API Keys 和其他敏感信息
# 注意：此文件已在 .gitignore 中，不会被提交到 Git
```

## 配置文件说明

### admin-config.json

主配置文件，包含以下敏感信息（ABP-only）：
- **auth.apiKey**: ABP 节点认证密钥（WebSocket 节点间认证）
- **auth.apiKeys**: 客户端 API 密钥列表（HTTP 认证）
- **auth.admin**: 管理员用户名和密码
- **auth.jwt.secret**: JWT 签名密钥
- **llm.*.apiKey**: 各 LLM 提供商的 API 密钥
- **rag.vectorizer.apiKey**: 向量化服务的 API 密钥
- **rag.rerank.apiKey**: Rerank 服务的 API 密钥

### 其他配置文件

- `nodes.json` - 节点配置（运行时生成）
- `proactivity.json` - 主动性配置（运行时生成）
- `emotion/` - 情感配置目录（运行时生成）
- `personality/` - 人格配置目录（运行时生成）
- `preferences/` - 偏好配置目录（运行时生成）
- `relationships/` - 关系配置目录（运行时生成）

这些文件都是运行时生成的，不应手动编辑或提交到 Git。

## 安全建议

1. **永远不要提交包含真实 API Keys 的配置文件**
2. **使用环境变量或密钥管理服务存储敏感信息**（未来功能）
3. **定期轮换 API Keys 和密码**
4. **限制配置文件的访问权限**（chmod 600）

## 配置验证

系统启动时会自动验证配置文件的完整性。如果配置缺失或无效，系统会提示错误信息。

