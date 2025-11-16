# 任务清单

## 1. 规格与模型
1.1 定义 Preference 模型（用户级/会话级/系统级默认；键值与来源/权重/TTL）  
1.2 定义合并规则（precedence：会话 > 用户 > 系统默认；来源追踪；冲突策略）

## 2. 服务与存储
2.1 创建 PreferenceService（get/set/merge/getView，带来源与TTL）  
2.2 选择存储实现（内存实现为 MVP，留出接口便于后续 Redis/DB 扩展）  
2.3 单元测试：模型与服务合并逻辑

## 3. API
3.1 PreferenceController：  
- GET /api/preferences/:userId → 合并视图（含来源说明）  
- PUT /api/preferences/:userId → 写入用户偏好（可部分字段）  
3.2 集成测试：API 读写与合并视图

## 4. 聊天管线注入
4.1 在 ChatService 构建系统消息与工具描述前，合并偏好并注入上下文（system prompt 片段、工具参数默认值）  
4.2 针对三段披露：允许以偏好影响“工具白名单/参数展示详细度/默认值”  
4.3 集成测试：更新偏好后下一轮对话的提示与工具参数变化生效

## 5. 文档
5.1 更新 README/CLAUDE：增加 Preference 模型与 API 概览  
5.2 在 docs/skills/MIGRATION_GUIDE.md 标注“偏好学习”为可选增强，提供示例

## 6. 验收
6.1 openspec validate --strict 通过  
6.2 所有新增测试通过，现有测试不回归

---

执行顺序建议：1 → 2 → 3 → 4 → 5 → 6（小步提交，每步附测试）
## 1. 核心功能实现

- [ ] 1.1 实现偏好存储机制
  - [ ] 创建偏好存储目录（`config/preferences/`）
  - [ ] 实现偏好JSON文件读写（按userId组织）
  - [ ] 实现偏好去重和更新逻辑（相同type的偏好，更新value和confidence）
  - [ ] 添加偏好ID生成（UUID或时间戳）

- [ ] 1.2 在RAGMemoryService中实现learnPreference方法
  - [ ] 实现偏好保存逻辑
  - [ ] 实现偏好读取逻辑（获取用户的所有偏好）
  - [ ] 实现偏好更新和删除逻辑
  - [ ] 添加日志记录

- [ ] 1.3 实现偏好提取逻辑（可选，简化版使用关键词匹配）
  - [ ] 创建PreferenceExtractor工具类
  - [ ] 实现关键词匹配（如"喜欢"、"不喜欢"、"偏好"等）
  - [ ] 可选：实现LLM辅助提取（调用LLM分析对话内容）
  - [ ] 提取偏好类型和值（如"movie_genre:科幻"）

- [ ] 1.4 扩展记忆检索逻辑
  - [ ] 在`recall()`方法中，如果查询匹配已存储偏好，优先返回相关记忆
  - [ ] 可选：在检索时注入偏好信息到查询上下文

## 2. API开发

- [ ] 2.1 创建PreferenceController
  - [ ] 实现`listPreferences()` - GET /api/admin/preferences
  - [ ] 实现`getPreference()` - GET /api/admin/preferences/:id
  - [ ] 实现`createPreference()` - POST /api/admin/preferences
  - [ ] 实现`updatePreference()` - PUT /api/admin/preferences/:id
  - [ ] 实现`deletePreference()` - DELETE /api/admin/preferences/:id
  - [ ] 添加输入验证和错误处理

- [ ] 2.2 集成到路由系统
  - [ ] 在`src/server.ts`中添加路由
  - [ ] 使用`adminAuthMiddleware`保护API
  - [ ] 测试所有API端点

## 3. 可选功能

- [ ] 3.1 集成到ChatService（自动提取偏好）
  - [ ] 在`processMessage`或`streamMessage`中，检测对话内容
  - [ ] 调用PreferenceExtractor提取偏好
  - [ ] 如果检测到偏好，调用`memoryService.learnPreference()`保存

- [ ] 3.2 管理端UI（可选）
  - [ ] 创建`admin/src/api/preferenceApi.ts`（API客户端）
  - [ ] 创建`admin/src/pages/Preferences.tsx`（偏好列表和编辑页面）
  - [ ] 添加到导航菜单和路由

## 4. 测试和文档

- [ ] 4.1 单元测试
  - [ ] 测试learnPreference方法
  - [ ] 测试偏好提取逻辑
  - [ ] 测试API端点

- [ ] 4.2 集成测试
  - [ ] 测试完整的偏好学习流程
  - [ ] 测试偏好在记忆检索中的应用

- [ ] 4.3 文档
  - [ ] API接口文档（可选）
  - [ ] 偏好类型说明文档（可选）

