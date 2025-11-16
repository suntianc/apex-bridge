## 1. 核心功能实现

- [ ] 1.1 定义关系数据模型
  - [ ] 在`src/types/memory.ts`中添加Relationship接口定义
  - [ ] 定义关系类型枚举（family, friend, colleague, other）
  - [ ] 定义关系属性（name, birthday, anniversary, contact, notes等）
  - [ ] 定义存储的关系结构（StoredRelationship，包含id、userId、时间戳等）

- [ ] 1.2 实现关系存储机制
  - [ ] 创建`src/utils/relationshipStorage.ts`（参考PreferenceStorage实现）
  - [ ] 创建关系存储目录（`config/relationships/`）
  - [ ] 实现关系JSON文件读写（按userId组织）
  - [ ] 实现关系的增删改查操作
  - [ ] 添加关系ID生成逻辑
  - [ ] 实现提醒计算逻辑（计算距离生日/纪念日的天数）

- [ ] 1.3 在RAGMemoryService中扩展关系支持（可选）
  - [ ] 实现关系保存到RAG记忆系统的方法
  - [ ] 实现关系检索方法（从记忆系统中查找关系信息）
  - [ ] 添加日志记录

## 2. API开发

- [ ] 2.1 创建RelationshipController
  - [ ] 实现`listRelationships()` - GET /api/admin/relationships
  - [ ] 实现`getRelationship()` - GET /api/admin/relationships/:id
  - [ ] 实现`createRelationship()` - POST /api/admin/relationships
  - [ ] 实现`updateRelationship()` - PUT /api/admin/relationships/:id
  - [ ] 实现`deleteRelationship()` - DELETE /api/admin/relationships/:id
  - [ ] 实现`getRelationshipReminders()` - GET /api/admin/relationships/:id/reminders
  - [ ] 添加输入验证和错误处理
  - [ ] 使用createError统一错误处理

- [ ] 2.2 集成到路由系统
  - [ ] 在`src/server.ts`中添加路由
  - [ ] 使用`adminAuthMiddleware`保护API
  - [ ] 测试所有API端点

## 3. 主动性系统集成

- [ ] 3.1 创建生日提醒场景
  - [ ] 在`src/core/scenes/BasicScenes.ts`中添加`birthdayReminderScene`
  - [ ] 实现场景触发逻辑（基于关系中的生日信息）
  - [ ] 实现提醒时间窗口（7天前）
  - [ ] 实现消息生成逻辑（个性化生日提醒消息）

- [ ] 3.2 创建纪念日提醒场景
  - [ ] 在`src/core/scenes/BasicScenes.ts`中添加`anniversaryReminderScene`
  - [ ] 实现场景触发逻辑（基于关系中的纪念日信息）
  - [ ] 实现提醒时间窗口（7天前）
  - [ ] 实现消息生成逻辑（个性化纪念日提醒消息）

- [ ] 3.3 集成到ProactivityScheduler
  - [ ] 在`src/server.ts`中，启动ProactivityScheduler后注册关系提醒场景
  - [ ] 实现定时任务（每天检查一次是否有即将到来的生日/纪念日）
  - [ ] 确保场景遵循ProactivityScheduler的政策（静音窗、频次限制等）

- [ ] 3.4 实现关系提醒查询逻辑
  - [ ] 在RelationshipStorage中添加`getUpcomingReminders()`方法
  - [ ] 计算距离生日/纪念日的天数
  - [ ] 返回在提醒窗口内的关系列表

## 4. 可选功能

- [ ] 4.1 管理端UI（可选）
  - [ ] 创建`admin/src/api/relationshipApi.ts`（API客户端）
  - [ ] 创建`admin/src/pages/Relationships.tsx`（关系列表和编辑页面）
  - [ ] 添加关系创建/编辑表单（包含所有字段）
  - [ ] 添加提醒设置界面（显示即将到来的提醒）
  - [ ] 添加到导航菜单和路由
  - [ ] 实现响应式设计

- [ ] 4.2 集成到记忆系统（可选）
  - [ ] 在创建/更新关系时，同步保存到RAG记忆系统
  - [ ] 在对话中提及关系时，能够从记忆系统中检索相关信息
  - [ ] 实现关系信息的语义搜索

## 5. 测试

- [ ] 5.1 单元测试
  - [ ] RelationshipStorage测试（增删改查、提醒计算）
  - [ ] RelationshipController测试（所有API端点）
  - [ ] 关系提醒场景测试

- [ ] 5.2 集成测试
  - [ ] 关系管理API集成测试
  - [ ] 关系提醒场景集成测试
  - [ ] 与ProactivityScheduler集成测试

## 6. 文档

- [ ] 6.1 API文档
  - [ ] 编写关系管理API接口文档
  - [ ] 包含请求/响应示例
  - [ ] 包含错误码说明

- [ ] 6.2 开发文档
  - [ ] 更新架构文档（添加关系管理模块说明）
  - [ ] 更新开发优先级文档（标记M2.5为已完成）

