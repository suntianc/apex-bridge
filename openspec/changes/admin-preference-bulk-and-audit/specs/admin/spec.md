# Admin Preference Bulk & Basic Audit

## ADDED Requirements

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


