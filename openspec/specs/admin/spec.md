# admin Specification

## Purpose
TBD - created by archiving change add-admin-preference-management. Update Purpose after archive.
## Requirements
### Requirement: Admin 导航包含“偏好管理”入口
系统 SHALL 在管理后台侧边栏提供“偏好管理”入口，并可导航到对应页面。
#### Scenario: 导航展示偏好管理入口并可访问
- Given 管理员已登录后台
- When 点击侧边栏“偏好管理”
- Then 跳转至 `/preferences` 页面

### Requirement: 页面支持根据 userId 查询并展示偏好
系统 MUST 允许按 userId 查询偏好，并在表格中展示 key、value、source、TTL、剩余TTL。
#### Scenario: 查询并展示偏好列表
- Given 在“偏好管理”页面输入 userId
- When 点击“刷新”
- Then 表格展示该 userId 的偏好列表，包含 key、value、source、TTL、剩余TTL

### Requirement: 支持新增、编辑（含 TTL）、删除操作
系统 MUST 提供新增、编辑（可调整 ttlMs）、删除偏好的能力，变更后列表应实时更新。
#### Scenario: 新增偏好
- Given 打开“新增偏好”对话框并填写 key/value/source/ttlMs
- When 点击“保存”
- Then 新记录出现在表格中

#### Scenario: 编辑偏好
- Given 在列表行点击“编辑”
- When 修改 value 或 ttlMs 并保存
- Then 记录更新，表格显示新值

#### Scenario: 删除偏好
- Given 在列表行点击“删除”
- When 确认删除
- Then 记录从表格中移除

### Requirement: 提供偏好批量导出接口
系统 MUST 提供 GET `/api/preferences/export?userId=...` 导出该用户所有偏好（含基本审计字段）。
#### Scenario: 导出用户偏好
- Given 管理员提供 userId
- When 调用导出接口
- Then 返回 `{ success, userId, preferences[] }`，preferences 含 key/value/source/createdAt/updatedAt/ttlMs

### Requirement: 提供偏好批量导入接口
系统 MUST 提供 POST `/api/preferences/import` 接收 `{userId, preferences[]}` 并写入（同 type 覆盖）。
#### Scenario: 批量导入用户偏好
- Given 请求体包含 userId 与 preferences 数组
- When 调用导入接口
- Then 返回 `{ success, imported, preferences[] }`，imported ≥ 1

### Requirement: Admin UI 展示基本审计字段
系统 SHALL 在 Admin 偏好管理页面展示 createdAt/updatedAt 字段。
#### Scenario: 列表显示审计字段
- Given 进入偏好管理页面并完成查询
- When 数据加载完成
- Then 表格展示 createdAt/updatedAt 列

### Requirement: Admin UI 提供导出/导入操作
系统 SHALL 在 Admin 偏好管理页面提供导出按钮与导入 JSON 的入口。
#### Scenario: 导出与导入
- Given 输入 userId
- When 点击导出
- Then 下载 `preferences-<userId>.json`

- Given 选择 JSON 文件导入
- When 点击确认
- Then 显示导入结果并刷新列表

