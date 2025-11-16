> [ARCHIVED] 本文档为历史参考，当前实现以 ABP/Skills 规范与 openspec/specs 为准。
# 当前活跃的OpenSpec变更概览

**更新时间**: 2025-11-16  
**总变更数**: 6个活跃 + 1个已完成

---

## 1. add-personality-management (0/14 tasks)
**状态**: 未开始  
**类型**: 新功能

### 目标
为人格引擎添加管理界面，支持通过REST API和Web界面管理人格配置文件。

### 主要变更
- 实现人格配置文件管理REST API（增删改查）
- 创建PersonalityController处理API请求
- 管理端UI开发（React + TypeScript）
  - 人格列表页面
  - 人格编辑页面
  - 人格预览功能
- 验证并确保3个预装人格配置文件格式正确

### 依赖
- ✅ PersonalityEngine (已完成)
- ✅ Web管理后台基础框架 (已完成)
- ✅ Admin认证中间件 (已完成)

---

## 2. add-preference-learning (0/11 tasks)
**状态**: 未开始  
**类型**: 新功能

### 目标
实现偏好学习功能，让AI能够从对话中识别、存储和应用用户偏好。

### 主要变更
- 在`RAGMemoryService`中实现`learnPreference()`方法
- 实现偏好提取逻辑（从对话消息中识别偏好信息）
- 扩展记忆检索，优先考虑相关偏好
- 实现偏好管理REST API
- 可选：管理端UI（偏好查看和编辑界面）

### 依赖
- ✅ IMemoryService (已完成)
- ✅ RAGMemoryService (已完成基础实现)
- ✅ LLMClient (可选，用于偏好提取)

---

## 3. add-relationship-management (0/15 tasks)
**状态**: 未开始  
**类型**: 新功能

### 目标
实现关系管理功能，存储和管理用户的重要关系（家庭成员、朋友、同事等），并提供生日提醒、纪念日提醒等功能。

### 主要变更
- 定义关系数据模型（关系类型、属性、元数据）
- 实现关系存储机制（JSON文件存储）
- 实现关系管理REST API
- 集成到主动性系统（生日提醒场景、纪念日提醒场景）
- 可选：管理端UI（关系列表、关系创建/编辑表单）
- 可选：集成到记忆系统

### 依赖
- ✅ IMemoryService (已完成)
- ✅ ProactivityScheduler (已完成基础实现)
- ✅ PreferenceStorage (可参考实现模式)

---

## 4. add-timeline-feature (0/8 tasks)
**状态**: 未开始  
**类型**: 新功能

### 目标
实现时间线功能，将分散的记忆按时间顺序组织，生成叙述性摘要。

### 主要变更
- 在`RAGMemoryService`中实现`buildTimeline()`方法
- 实现时间线事件构建（将记忆转换为TimelineEvent格式）
- 实现时间线管理REST API
- 可选：时间线摘要生成（使用LLM生成叙述性摘要）

### 依赖
- ✅ IMemoryService (已完成)
- ✅ RAGMemoryService (已完成基础实现)
- ✅ LLMClient (可选，用于生成摘要)

---

## 5. add-web-admin-framework (46/79 tasks)
**状态**: 进行中 (58%)  
**类型**: 基础架构

### 目标
开发Web管理后台基础框架，包含设置向导、Dashboard和管理界面，将所有配置迁移到Web界面。

### 主要变更
- 创建Web管理后台前端项目（React 18 + TypeScript + Vite + shadcn/ui）
- UI设计风格：参考Anthropic官网（简洁、现代、大量留白）
- 基础框架搭建（路由、状态管理、API客户端）
- 设置向导（首次启动检测、管理员账户设置、LLM配置向导）
- 登录页面
- Dashboard主页（系统状态、统计信息）
- **节点管理界面**（节点列表、状态监控、配置管理）
- **配置管理界面**（将所有.env可配置项迁移到Web界面）
  - 完全取消.env配置，所有配置项迁移到管理界面
  - 配置存储在 `config/admin-config.json`
  - 系统参数（PORT、HOST等）也迁移到管理界面

### 依赖
- React 18 (新增前端依赖)
- Vite (新增构建工具)
- shadcn/ui (新增UI组件库)
- Tailwind CSS (新增样式框架)

### 进度
- ✅ 46/79 任务已完成 (58%)
- ⏸️ 剩余33个任务待完成

---

## 6. implement-skills-first-abp-later-strategy (8/36 tasks)
**状态**: 进行中 (22%)  
**类型**: 架构迁移

### 目标
采用"Skills优先，ABP后续"的分阶段策略，完成架构现代化和协议合规化。

### 第一阶段：Skills架构实施（14-20周）
- ✅ 核心功能已完成（约85%）
  - ✅ 基础设施搭建 - 100% 完成
  - ✅ 执行引擎改造 - 95% 完成
  - ⚠️ 记忆系统基础集成 - 70% 完成
  - ✅ 性能优化 - 95% 完成
  - ⚠️ 试点和迁移 - 40% 进行中
  - ⏸️ 优化和稳定 - 0% 待开始

### 第二阶段：ABP协议迁移（11-13周，可选但商业化必选）
- 实现ABP（ApexBridge Protocol）协议，替代VCP协议
- 实现ABP协议错误恢复机制
- 实现多维记忆系统
- 实现记忆冲突解决机制
- 完成RAG包重命名（vcp-intellicore-rag → abp-rag-sdk）

### 进度
- ✅ 8/36 任务已完成 (22%)
- ⏸️ 剩余28个任务待完成

### 状态
**第一阶段核心功能已完成（约85%）**，可以开始使用。第二阶段可根据商业化时间表启动。

---

## 7. remove-vcp-protocol-support (21/21 tasks) ✅
**状态**: ✅ 已完成并归档 (100%)  
**归档日期**: 2025-11-15  
**类型**: 架构简化（重大变更）

### 目标
完全移除VCP协议支持，仅保留ABP协议，实现品牌和协议完全独立。

### 已完成工作
- ✅ 阶段1：准备和规划
- ✅ 阶段2.1：重命名VCPEngine为ProtocolEngine
- ✅ 阶段2.2：更新所有引用（核心代码、测试文件）
- ✅ 阶段2.3：移除VCP协议转换器
- ✅ 阶段2.4：更新插件加载器（独立实现）
- ✅ 阶段2.5：更新变量引擎（独立实现 + 8个Provider）
- ✅ 阶段2.6：更新分布式服务（独立实现）
- ✅ 阶段3.1：移除npm依赖包（vcp-intellicore-sdk, vcp-intellicore-rag）
- ✅ 阶段3.2：清理类型定义
- ✅ 阶段4.1：更新WebSocket路径（/VCPlog → /ABPlog）
- ✅ 阶段4.2：更新配置项和环境变量（向后兼容）
- ✅ 阶段5：更新所有文档（README, CLAUDE.md, MIGRATION_GUIDE.md, API_REFERENCE.md）
- ✅ 阶段6：所有测试通过（107个测试套件，855个测试）

### 进度
- ✅ 21/21 任务已完成 (100%)
- ✅ 所有测试通过
- ✅ 文档已更新
- ✅ 已归档到 `openspec/changes/archive/2025-11-15-remove-vcp-protocol-support/`

### 状态
**✅ 完全完成**：VCP协议支持已完全移除，系统仅支持ABP协议。所有代码、测试、文档已更新并通过验证。

---

## 变更优先级建议

### 高优先级
1. **add-web-admin-framework** (58%完成) - 基础框架，其他功能依赖

### 中优先级
3. **implement-skills-first-abp-later-strategy** (22%完成) - 架构迁移，第一阶段已基本完成

### 低优先级（功能增强）
4. **add-personality-management** (0%完成) - 管理界面
5. **add-preference-learning** (0%完成) - 偏好学习
6. **add-relationship-management** (0%完成) - 关系管理
7. **add-timeline-feature** (0%完成) - 时间线功能

---

## 总结

- **总变更数**: 7个
- **已完成**: 1个（remove-vcp-protocol-support ✅）
- **进行中**: 2个（add-web-admin-framework, implement-skills-first-abp-later-strategy）
- **未开始**: 4个（personality-management, preference-learning, relationship-management, timeline-feature）
- **完成度**: 
  - 最高：remove-vcp-protocol-support (100% ✅)
  - 进行中最高：add-web-admin-framework (58%)
  - 最低：多个变更 (0%)

### 建议
1. 优先完成 **add-web-admin-framework**，为其他功能提供基础
2. 完成 **implement-skills-first-abp-later-strategy** 第一阶段剩余工作
3. 其他功能变更可在基础框架完成后并行开发
4. ✅ **remove-vcp-protocol-support** 已完成，系统现在仅支持ABP协议

