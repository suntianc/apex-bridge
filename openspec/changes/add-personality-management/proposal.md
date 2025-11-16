## Why

当前系统已实现PersonalityEngine核心功能，支持加载和使用人格配置文件，但缺乏管理界面。管理员无法通过API或Web界面进行人格配置的增删改查操作，只能通过直接修改文件系统来完成。M1.4旨在提供完整的REST API和管理端UI，让管理员能够方便地管理所有人格配置，包括创建、编辑、删除和预览功能。

## What Changes

- 实现人格配置文件管理REST API（增删改查）
  - `GET /api/admin/personalities` - 列出所有可用人格
  - `GET /api/admin/personalities/:id` - 获取指定人格配置
  - `POST /api/admin/personalities` - 创建新人格配置
  - `PUT /api/admin/personalities/:id` - 更新人格配置
  - `DELETE /api/admin/personalities/:id` - 删除人格配置
- 创建PersonalityController处理API请求
- 集成到管理端路由系统（使用adminAuthMiddleware保护）
- 管理端UI开发（React + TypeScript）
  - 人格列表页面（显示所有人格、状态、操作按钮）
  - 人格编辑页面（创建/编辑表单，支持完整PersonalityConfig字段）
  - 人格预览功能（可选，测试对话风格）
  - 人格导入/导出功能（可选）
- 验证并确保3个预装人格配置文件格式正确（专业助手、温暖伙伴、活泼助手）
- 添加输入验证和错误处理
- 添加API单元测试和集成测试

**BREAKING**: 无，完全向后兼容

## Impact

- Affected specs: 新增`personality`能力的API管理部分（personality management）
- Affected code:
  - `src/api/controllers/PersonalityController.ts` (新增)
  - `src/api/routes/admin.ts` 或 `src/server.ts` (修改，添加路由)
  - `admin/src/pages/Personalities.tsx` (新增)
  - `admin/src/api/personalityApi.ts` (新增，API客户端)
  - `admin/src/store/personalityStore.ts` (新增，状态管理，可选)
  - `config/personality/` (验证现有配置文件)
- Dependencies:
  - PersonalityEngine (已完成) ✅
  - Web管理后台基础框架 (已完成) ✅
  - Admin认证中间件 (已完成) ✅

