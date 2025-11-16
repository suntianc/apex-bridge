## 1. 后端API开发

- [ ] 1.1 创建 `PersonalityController.ts`
  - [ ] 实现 `listPersonalities()` - GET /api/admin/personalities
  - [ ] 实现 `getPersonality()` - GET /api/admin/personalities/:id
  - [ ] 实现 `createPersonality()` - POST /api/admin/personalities
  - [ ] 实现 `updatePersonality()` - PUT /api/admin/personalities/:id
  - [ ] 实现 `deletePersonality()` - DELETE /api/admin/personalities/:id
  - [ ] 添加输入验证（使用Joi或自定义验证器）
  - [ ] 添加错误处理（使用统一错误处理系统）
  - [ ] 集成PersonalityEngine进行配置验证

- [ ] 1.2 集成到路由系统
  - [ ] 在 `src/server.ts` 或 `src/api/routes/admin.ts` 中添加路由
  - [ ] 确保路由使用 `adminAuthMiddleware` 保护
  - [ ] 测试所有API端点

- [ ] 1.3 文件操作封装
  - [ ] 使用 `PathService` 获取人格配置目录路径
  - [ ] 使用异步文件操作（fs/promises）
  - [ ] 处理文件读写错误和并发冲突

- [ ] 1.4 配置验证
  - [ ] 验证PersonalityConfig格式（使用PersonalityEngine的验证逻辑）
  - [ ] 验证agentId唯一性
  - [ ] 验证必需字段

## 2. 管理端UI开发

- [ ] 2.1 创建API客户端
  - [ ] 创建 `admin/src/api/personalityApi.ts`
  - [ ] 实现所有API调用的TypeScript函数
  - [ ] 添加类型定义（PersonalityInfo, CreatePersonalityRequest等）

- [ ] 2.2 创建状态管理（可选）
  - [ ] 创建 `admin/src/store/personalityStore.ts`（使用Zustand或类似）
  - [ ] 实现状态管理逻辑（列表、加载、错误处理）

- [ ] 2.3 创建人格列表页面
  - [ ] 创建 `admin/src/pages/Personalities.tsx`
  - [ ] 显示所有人格列表（表格或卡片）
  - [ ] 显示人格状态（是否启用、最后修改时间等）
  - [ ] 添加操作按钮（编辑、删除、预览）
  - [ ] 添加"创建新人格"按钮
  - [ ] 实现加载和错误状态

- [ ] 2.4 创建人格编辑页面
  - [ ] 创建编辑表单组件
  - [ ] 支持所有PersonalityConfig字段的编辑
  - [ ] 实现表单验证
  - [ ] 支持创建和编辑两种模式
  - [ ] 添加保存和取消按钮
  - [ ] 实现保存成功/失败反馈

- [ ] 2.5 添加到导航菜单
  - [ ] 在 `admin/src/components/Layout.tsx` 中添加"人格管理"菜单项
  - [ ] 添加路由配置（React Router）

- [ ] 2.6 可选功能
  - [ ] 人格预览功能（测试对话风格）
  - [ ] 人格导入/导出功能（JSON文件）

## 3. 测试和验证

- [ ] 3.1 API单元测试
  - [ ] 测试所有API端点
  - [ ] 测试输入验证
  - [ ] 测试错误处理
  - [ ] 测试文件操作

- [ ] 3.2 集成测试
  - [ ] 测试完整的CRUD流程
  - [ ] 测试PersonalityEngine集成
  - [ ] 测试并发操作

- [ ] 3.3 预装配置验证
  - [ ] 验证3个预装人格配置文件格式正确
  - [ ] 确保配置文件可以被PersonalityEngine正确加载

## 4. 文档

- [ ] 4.1 API文档（可选）
  - [ ] 编写API接口文档
  - [ ] 包含请求/响应示例

