## Why

插件回调接口仍然允许 legacy VCP Key 与弱校验逻辑，无法满足现阶段对 HMAC、防重放与限流的安全要求。一旦密钥泄漏，恶意方可以在缺乏速率限制与审计信息的情况下持续伪造回调，给主系统造成安全与稳定风险。

## What Changes

- 在配置层新增 `pluginCallback` 安全配置块，集中管理 legacy key 开关、HMAC 时间窗口、速率限制与安全日志。
- 改造 `verifyCallbackAuth` 逻辑，默认禁用 legacy VCP Key，启用 HMAC-SHA256 校验、时间窗口校验与重放防护。
- 为 `/api/plugin-callback` 路由增加速率限制、统一错误响应、结构化安全日志，方便审计。
- 提供 CLI/README/Admin 指南示例，指引如何迁移并验证新配置。

**BREAKING**: 无（默认行为更安全，但可通过配置显式控制）。

## Impact

- Affected specs: `security` 能力新增“插件回调安全加固”要求。
- Affected code:
  - `src/config`（新增 `pluginCallback` 配置块）
  - `src/api/routes/plugin-callback.ts` / `verifyCallbackAuth.ts`
  - 相关 CLI / 文档
- Dependencies:
  - 现有插件回调实现
  - Express 中间件链（用于限流）

