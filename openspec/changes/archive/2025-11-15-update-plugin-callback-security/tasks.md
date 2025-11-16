## 1. 调研与设计
- [x] 1.1 评估 legacy VCP Key 在现有部署中的使用情况并制定迁移指引
- [x] 1.2 确定 HMAC 时间窗口默认值与配置项名称，评估是否需要 nonce 或一次性 token
- [x] 1.3 选型或自研回调速率限制方案（express-rate-limit 或内部实现）

## 2. 实现
- [x] 2.1 在配置层新增 `pluginCallback` 安全配置块（禁用 legacy、HMAC 窗口、限流参数）
- [x] 2.2 改造 `verifyCallbackAuth` 以读取新配置，默认禁用 legacy VCP Key
- [x] 2.3 更新 `plugin-callback` 路由：加入速率限制、统一错误响应、增强安全日志
- [x] 2.4 为新增配置提供 CLI/文档示例，并更新 README / Admin 指南

## 3. 测试与验证
- [x] 3.1 新增单元/集成测试覆盖 API Key、HMAC（合法/过期/重放）、legacy Key 禁用场景
- [x] 3.2 编写速率限制触发与错误响应一致性的测试
- [x] 3.3 更新安全手册或运营文档，说明配置项和迁移步骤
- [x] 3.4 运行 `openspec validate update-plugin-callback-security --strict`
