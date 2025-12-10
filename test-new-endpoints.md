# 新接口测试说明

## 1. 获取适配器供应商列表接口

**请求：**
```bash
curl -X GET http://localhost:12345/api/llm/providers/adapters
```

**预期响应：**
```json
{
  "success": true,
  "adapters": [
    {
      "name": "OpenAI",
      "provider": "openai"
    },
    {
      "name": "DeepSeek",
      "provider": "deepseek"
    },
    {
      "name": "智谱AI",
      "provider": "zhipu"
    },
    {
      "name": "Claude",
      "provider": "claude"
    },
    {
      "name": "Ollama",
      "provider": "ollama"
    },
    {
      "name": "Custom",
      "provider": "custom"
    }
  ]
}
```

## 2. LLM服务测试连接接口

**路径**: `POST /api/llm/providers/:id/test
**功能**: 仅测试服务商的连通性，不验证具体模型

**请求：**
```bash
curl -X POST http://localhost:12345/api/llm/providers/1/test
```

**成功响应：**
```json
{
  "success": true,
  "message": "连接成功",
  "latency": 245,
  "details": {
    "provider": "openai",
    "testedAt": "2024-01-01T12:00:00Z",
    "responseTime": 245
  }
}
```

**失败响应：**
```json
{
  "error": "Connection failed",
  "message": "连接失败: API key is invalid"
}
```

## 3. 模型验证接口

**路径**: `POST /api/llm/providers/validate-model`
**功能**: 新增模型前验证模型是否可用（使用临时配置进行测试）

**请求：**
```bash
# 验证 OpenAI 的 gpt-4 模型是否可用
curl -X POST http://localhost:12345/api/llm/providers/validate-model \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "baseConfig": {
      "apiKey": "your-api-key",
      "baseURL": "https://api.openai.com/v1"
    },
    "model": "gpt-4"
  }'

# 验证 DeepSeek 的 deepseek-chat 模型
curl -X POST http://localhost:12345/api/llm/providers/validate-model \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "deepseek",
    "baseConfig": {
      "apiKey": "your-api-key",
      "baseURL": "https://api.deepseek.com/v1"
    },
    "model": "deepseek-chat"
  }'
```

**成功响应（模型存在）：**
```json
{
  "success": true,
  "message": "模型验证成功",
  "latency": 150,
  "details": {
    "provider": "openai",
    "model": "gpt-4",
    "available": true,
    "testedAt": "2024-01-01T12:00:00Z",
    "responseTime": 150
  }
}
```

**失败响应（模型验证失败）：**
```json
{
  "success": false,
  "error": "Model validation failed",
  "message": "模型不存在或不可用",
  "details": {
    "provider": "openai",
    "model": "gpt-5",
    "errorType": "model_not_found"
  }
}
```

**使用场景：**
1. 新增LLM模型前，验证模型是否可用
2. 在保存提供商配置前，测试模型配置是否正确
3. 在用户界面中实时验证模型选择和API配置

**功能特点：**
- 使用临时配置进行测试，无需先保存提供商信息
- 支持所有已实现的提供商类型（openai、deepseek、zhipu等）
- 直接进行API调用测试，发送"Hi"消息并接收响应
- 根据错误类型返回详细的错误信息（401、403、429、404等）
- 限制测试用的token数量为10个，减少费用
- 返回响应内容长度，可用于判断模型是否正常工作

**注意事项：**
- 此接口会实际调用LLM API，请确保API密钥有效
- 建议在客户端添加适当的频率限制，避免滥用
- 测试完成后，可以使用相同的配置信息创建提供商和模型

## 3. 供应商唯一性校验测试

### 测试Custom类型允许多个
```bash
# 创建第一个Custom供应商
curl -X POST http://localhost:12345/api/llm/providers \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "custom",
    "name": "Custom Provider 1",
    "baseConfig": {
      "baseURL": "https://api.example1.com",
      "apiKey": "key1"
    }
  }'

# 创建第二个Custom供应商（应该成功）
curl -X POST http://localhost:12345/api/llm/providers \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "custom",
    "name": "Custom Provider 2",
    "baseConfig": {
      "baseURL": "https://api.example2.com",
      "apiKey": "key2"
    }
  }'
```

### 测试非Custom类型只能有一个
```bash
# 尝试创建第二个OpenAI供应商（应该失败）
curl -X POST http://localhost:12345/api/llm/providers \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "name": "OpenAI 2",
    "baseConfig": {
      "baseURL": "https://api.openai.com",
      "apiKey": "another-key"
    }
  }'
```

**预期错误响应：**
```json
{
  "error": "Resource already exists",
  "message": "Provider already exists: openai. Each provider type can only have one instance, except for Custom providers."
}
```

## 测试步骤

1. 启动服务器：`npm run dev`
2. 按上述顺序测试各个接口
3. 验证响应格式和数据正确性
4. 检查控制台日志是否有异常

## 注意事项

- 测试连接接口需要有效的API密钥
- 确保数据库中有已配置的供应商
- Custom类型测试时，可以使用不同的baseURL来区分