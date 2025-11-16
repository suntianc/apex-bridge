## Why

当前系统已实现记忆系统、情感标注、偏好学习等功能，但缺乏对用户重要关系的管理能力。用户可能希望AI记住他们的家庭成员、朋友、重要日期（如生日、纪念日）等信息，并在合适的时机主动提醒或提及。M2.5旨在实现关系管理功能，让AI能够存储和管理用户的重要关系，并集成到主动性系统中，提供生日提醒、纪念日提醒等情感化功能。

## What Changes

- 定义关系数据模型
  - 关系类型（家庭成员、朋友、同事、其他）
  - 关系属性（姓名、生日、纪念日、联系方式、备注等）
  - 关系元数据（创建时间、更新时间、关联用户ID等）
- 实现关系存储机制
  - 使用JSON文件存储（类似PreferenceStorage）
  - 按userId组织关系数据
  - 支持关系的增删改查操作
- 实现关系管理REST API
  - `GET /api/admin/relationships` - 获取所有关系（支持userId筛选）
  - `GET /api/admin/relationships/:id` - 获取指定关系详情
  - `POST /api/admin/relationships` - 创建新关系
  - `PUT /api/admin/relationships/:id` - 更新关系
  - `DELETE /api/admin/relationships/:id` - 删除关系
  - `GET /api/admin/relationships/:id/reminders` - 获取关系相关提醒（生日、纪念日）
- 集成到主动性系统
  - 创建生日提醒场景（基于关系中的生日信息）
  - 创建纪念日提醒场景（基于关系中的纪念日信息）
  - 在ProactivityScheduler中注册场景
- 可选：管理端UI
  - 关系列表页面（显示所有关系）
  - 关系创建/编辑表单
  - 提醒设置界面
- 可选：集成到记忆系统
  - 将关系信息保存到RAG记忆系统
  - 在对话中提及关系时能够检索相关信息

**BREAKING**: 无，完全向后兼容

## Impact

- Affected specs: 扩展`memory`能力，增加关系管理功能
- Affected code:
  - `src/types/memory.ts` (修改，添加Relationship类型定义)
  - `src/utils/relationshipStorage.ts` (新增，关系存储工具)
  - `src/api/controllers/RelationshipController.ts` (新增)
  - `src/server.ts` (修改，添加路由)
  - `src/core/ProactivityScheduler.ts` (修改，集成关系提醒场景)
  - `src/core/scenes/BasicScenes.ts` (修改，添加生日/纪念日提醒场景)
  - `admin/src/pages/Relationships.tsx` (可选，新增)
  - `admin/src/api/relationshipApi.ts` (可选，新增)
  - `config/relationships/` (新增，关系存储目录)
- Dependencies:
  - IMemoryService (已完成) ✅
  - ProactivityScheduler (已完成基础实现) ✅
  - PreferenceStorage (可参考实现模式) ✅

