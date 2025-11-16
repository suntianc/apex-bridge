# Security Configuration Guide - 安全配置指南

本文档描述了 ApexBridge 系统的安全配置选项和最佳实践。

## 目录

- [概述](#概述)
- [API 限流配置](#api-限流配置)
- [输入验证配置](#输入验证配置)
- [安全头配置](#安全头配置)
- [审计日志配置](#审计日志配置)
- [竞态条件检测](#竞态条件检测)
- [最佳实践](#最佳实践)

## 概述

ApexBridge 实现了多层安全防护机制，包括：

1. **API 限流** - 防止 API 滥用和 DoS 攻击
2. **输入验证** - 验证和清理用户输入
3. **安全头** - 设置 HTTP 安全响应头
4. **审计日志** - 记录关键操作
5. **竞态条件检测** - 监控并发访问问题

## API 限流配置

### 配置位置

限流配置位于 `config/admin-config.json` 文件的 `security.rateLimit` 部分。

### 配置选项

```json
{
  "security": {
    "rateLimit": {
      "enabled": true,
      "provider": "auto",
      "trustProxy": true,
      "keyPrefix": "rate_limit",
      "defaultStrategyOrder": ["apiKey", "ip"],
      "whitelist": {
        "ips": [],
        "apiKeys": [],
        "users": []
      },
      "rules": [
        {
          "id": "chat-api",
          "name": "Chat Completions API",
          "windowMs": 60000,
          "maxRequests": 60,
          "mode": "sliding",
          "burstMultiplier": 1.5,
          "priority": 10,
          "matchers": [
            { "prefix": "/v1/chat", "methods": ["POST"] }
          ],
          "strategyOrder": ["apiKey", "ip"],
          "skipSuccessfulRequests": false,
          "skipFailedRequests": false,
          "responseHeaders": true
        }
      ]
    }
  }
}
```

### 配置说明

- **enabled**: 是否启用限流（默认: `true`）
- **provider**: 限流提供者，可选值：
  - `auto`: 自动选择（Redis 可用时使用 Redis，否则使用内存）
  - `redis`: 强制使用 Redis（需要 Redis 服务）
  - `memory`: 使用内存限流（单实例部署）
- **trustProxy**: 是否信任代理（默认: `true`）
- **defaultStrategyOrder**: 默认的识别策略顺序
- **whitelist**: 白名单配置（IP、API Key、用户）
- **rules**: 限流规则列表

### 限流规则配置

每个规则包含以下字段：

- **id**: 规则唯一标识
- **name**: 规则名称
- **windowMs**: 时间窗口（毫秒）
- **maxRequests**: 最大请求数
- **mode**: 限流模式（`sliding` 或 `fixed`）
- **burstMultiplier**: 突发流量倍数（默认: `1`）
- **priority**: 优先级（数字越小优先级越高）
- **matchers**: 匹配器列表（路径、方法等）
- **strategyOrder**: 识别策略顺序
- **skipSuccessfulRequests**: 是否跳过成功请求
- **skipFailedRequests**: 是否跳过失败请求
- **responseHeaders**: 是否在响应中包含限流头

### 识别策略

- **ip**: 按 IP 地址识别
- **apiKey**: 按 API Key 识别
- **user**: 按用户 ID 识别
- **header**: 按自定义请求头识别

### 示例配置

```json
{
  "rules": [
    {
      "id": "chat-api",
      "name": "Chat API",
      "windowMs": 60000,
      "maxRequests": 60,
      "mode": "sliding",
      "matchers": [
        { "prefix": "/v1/chat", "methods": ["POST"] }
      ],
      "strategyOrder": ["apiKey", "ip"]
    },
    {
      "id": "admin-api",
      "name": "Admin API",
      "windowMs": 60000,
      "maxRequests": 120,
      "mode": "fixed",
      "matchers": [
        { "prefix": "/api/admin" }
      ],
      "strategyOrder": ["user", "ip"]
    }
  ]
}
```

## 输入验证配置

### JSON Schema 验证

系统使用 JSON Schema 验证所有 API 请求。验证规则定义在 `src/api/middleware/validationSchemas.ts`。

### 自定义验证器

自定义业务规则验证器定义在 `src/api/middleware/customValidators.ts`。

### 输入清理

输入清理中间件自动清理以下类型的攻击：

- **XSS (跨站脚本)**: 清理 HTML 标签和 JavaScript
- **SQL 注入**: 清理 SQL 特殊字符
- **命令注入**: 清理 shell 特殊字符
- **路径遍历**: 清理路径遍历字符（`..`, `~`）

### 配置选项

清理中间件配置在 `server.ts` 中：

```typescript
createSanitizationMiddleware({
  sanitizeBody: true,
  sanitizeQuery: true,
  sanitizeParams: true,
  sanitizeHeaders: false,
  allowHtml: false,
  preventSqlInjection: true,
  preventCommandInjection: true,
  preventPathTraversal: true,
  skipFields: ['password', 'apiKey', 'vcpKey', 'token']
})
```

## 安全头配置

### 配置位置

安全头配置在 `src/api/middleware/securityHeadersMiddleware.ts` 中。

### 配置选项

```typescript
createSecurityHeadersMiddleware({
  enabled: true,
  csp: {
    enabled: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'"]
    }
  },
  hsts: {
    enabled: true,
    maxAge: 31536000,
    includeSubDomains: true,
    preload: false
  },
  frameguard: {
    enabled: true,
    action: 'DENY'
  },
  contentTypeNosniff: true,
  xssFilter: true,
  referrerPolicy: 'strict-origin-when-cross-origin'
})
```

### 安全头说明

- **Content-Security-Policy (CSP)**: 内容安全策略，防止 XSS 攻击
- **Strict-Transport-Security (HSTS)**: 强制 HTTPS 连接
- **X-Frame-Options**: 防止点击劫持
- **X-Content-Type-Options**: 防止 MIME 类型嗅探
- **X-XSS-Protection**: XSS 保护
- **Referrer-Policy**: 控制 Referer 头
- **Permissions-Policy**: 控制浏览器功能权限

## 审计日志配置

### 配置位置

审计日志配置在 `src/api/middleware/auditLoggerMiddleware.ts` 中。

### 配置选项

```typescript
createAuditLoggerMiddleware({
  enabled: true,
  logLevel: 'info',
  logSuccessfulOperations: true,
  logFailedOperations: true,
  excludePaths: ['/health', '/metrics']
})
```

### 记录的操作

审计日志自动记录以下关键操作：

- 配置更新 (`config_update`)
- 节点注册 (`node_register`)
- 节点更新 (`node_update`)
- 节点注销 (`node_unregister`)
- 认证登录 (`auth_login`)
- 认证登出 (`auth_logout`)
- 认证失败 (`auth_failed`)
- API Key 创建 (`api_key_create`)
- API Key 删除 (`api_key_delete`)
- 人格创建 (`personality_create`)
- 人格更新 (`personality_update`)
- 人格删除 (`personality_delete`)

### 敏感数据清理

审计日志自动清理以下敏感字段：

- `password`
- `apiKey`
- `vcpKey`
- `token`
- `secret`
- `key`

## 竞态条件检测

### 配置位置

竞态条件检测配置在 `src/utils/RaceDetector.ts` 中。

### 配置选项

```typescript
RaceDetector.getInstance({
  enabled: true,
  logLevel: 'warn',
  threshold: 1
})
```

### 监控的资源

系统自动监控以下资源的并发访问：

- LLMClient 初始化
- 配置更新
- 节点注册/更新/注销

## 最佳实践

### 1. 限流配置

- **生产环境**: 使用 Redis 提供者实现分布式限流
- **开发环境**: 使用内存提供者即可
- **规则优先级**: 为更具体的规则设置更高的优先级（更小的数字）
- **突发流量**: 使用 `burstMultiplier` 允许短时间内的流量突发

### 2. 输入验证

- **始终验证**: 对所有用户输入进行验证
- **使用 Schema**: 使用 JSON Schema 定义验证规则
- **自定义验证**: 对于业务规则，使用自定义验证器
- **清理输入**: 启用输入清理中间件

### 3. 安全头

- **CSP 配置**: 根据应用需求配置 CSP 指令
- **HSTS**: 在生产环境启用 HSTS
- **定期审查**: 定期审查安全头配置

### 4. 审计日志

- **启用审计**: 在生产环境始终启用审计日志
- **日志存储**: 将审计日志存储到安全的日志系统
- **定期审查**: 定期审查审计日志，查找异常操作

### 5. 竞态条件检测

- **监控关键路径**: 确保关键操作被监控
- **定期审查**: 定期审查竞态条件检测日志
- **性能影响**: 监控检测机制的性能影响

### 6. 安全更新

- **定期更新**: 定期更新依赖包
- **安全补丁**: 及时应用安全补丁
- **漏洞扫描**: 使用工具扫描已知漏洞

## 故障排除

### 限流不工作

1. 检查 `security.rateLimit.enabled` 是否为 `true`
2. 检查 Redis 连接（如果使用 Redis 提供者）
3. 检查限流规则是否正确匹配请求路径

### 输入验证失败

1. 检查 JSON Schema 定义是否正确
2. 检查自定义验证器是否正确注册
3. 查看验证错误消息了解具体问题

### 安全头未设置

1. 检查安全头中间件是否已启用
2. 检查配置是否正确
3. 查看浏览器开发者工具中的响应头

### 审计日志未记录

1. 检查审计日志中间件是否已启用
2. 检查操作是否在监控路径列表中
3. 检查日志级别配置

## 相关文档

- [API 文档](./API.md)
- [部署指南](./DEPLOYMENT.md)
- [开发指南](./DEVELOPMENT.md)

## 支持

如有安全问题，请通过以下方式联系：

- 创建 GitHub Issue
- 发送邮件至安全团队

---

**最后更新**: 2025-11-12
