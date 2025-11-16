# Add Admin Preference Management

## Purpose
Provide a Preferences management page in the Admin UI to view/create/update/delete user preferences, and display TTL and source for auditing.

## Scope
- Admin frontend only: API client and UI page
- No backend behavior change (uses existing Preference APIs)

## Non-Goals
- Complex RBAC or audit trail backend
- Preference inference logic

## Acceptance Criteria
1. Admin左侧导航出现“偏好管理”，点击进入新页面
2. 支持按 userId 查询偏好，展示 key/value/source/TTL/剩余TTL
3. 支持新增、编辑（含 TTL）、删除
4. 构建无错误，lint 通过（或仅剩预期告警）


