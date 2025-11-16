## 1. 后端配置服务重构
- [x] 1.1 创建`src/services/ConfigService.ts`，实现JSON配置文件读写
- [x] 1.2 实现默认配置模板生成（createDefaultConfig）
- [x] 1.3 实现配置验证（validateConfig）
- [x] 1.4 实现配置备份机制（.backup文件）
- [x] 1.5 修改`src/config/index.ts`，从JSON文件读取配置（替代.env）
- [x] 1.6 实现首次启动检测逻辑（检查config/admin-config.json是否存在）

## 2. 后端API开发
- [x] 2.1 创建`src/api/controllers/SetupController.ts`（设置向导API）
  - [x] GET /api/setup/status - 检查首次启动状态
  - [x] POST /api/setup/complete - 完成设置向导
  - [x] POST /api/setup/migrate-from-env - 从.env导入配置
- [x] 2.2 创建`src/api/controllers/ConfigController.ts`（配置管理API）
  - [x] GET /api/admin/config - 读取所有配置
  - [x] PUT /api/admin/config - 更新配置项
  - [x] POST /api/admin/config/reset - 重置为默认配置
  - [x] GET /api/admin/config/export - 导出配置
  - [x] POST /api/admin/config/import - 导入配置
- [x] 2.3 创建`src/api/controllers/NodeController.ts`（节点管理API）
  - [x] GET /api/admin/nodes - 获取节点列表
  - [x] GET /api/admin/nodes/:id - 获取节点详情
  - [x] POST /api/admin/nodes - 注册节点
  - [x] PUT /api/admin/nodes/:id - 更新节点配置
  - [x] DELETE /api/admin/nodes/:id - 注销节点
- [x] 2.4 创建`src/api/controllers/AdminController.ts`（管理后台通用API）
  - [x] GET /api/admin/system/status - 获取系统状态
  - [x] GET /api/admin/system/stats - 获取统计信息
  - [x] POST /api/admin/auth/login - 管理员登录
  - [x] POST /api/admin/auth/logout - 登出

## 3. 服务器集成
- [x] 3.1 修改`src/server.ts`，添加静态文件服务（Express.static for admin/dist）
- [x] 3.2 添加管理后台路由（/admin/* -> 静态文件，/api/admin/* -> API路由）
- [x] 3.3 实现首次启动重定向逻辑（检测配置状态，重定向到设置向导）
- [x] 3.4 添加配置热更新支持（部分配置项无需重启 - 通过ConfigService.clearCache实现）

## 4. 前端项目初始化
- [x] 4.1 创建`admin/`目录结构
- [x] 4.2 初始化React项目（Vite + TypeScript）
- [x] 4.3 配置Tailwind CSS（Anthropic风格主题）
- [ ] 4.4 安装shadcn/ui组件库（暂缓，使用基础组件）
- [x] 4.5 配置React Router
- [x] 4.6 配置Zustand状态管理
- [x] 4.7 创建API客户端（Axios封装）

## 5. 前端基础组件和布局
- [x] 5.1 创建基础布局组件（Layout.tsx）
  - [x] 侧边栏导航（参考Anthropic风格）
  - [x] 顶部栏（用户信息、通知等）
  - [x] 主内容区域
- [x] 5.2 创建共享UI组件库（基础组件）
  - [x] Button、Input、Card样式（通过Tailwind类）
- [ ] 表单组件（Form、Select、Switch等）- 待实现完整功能（延后）
- [ ] 数据展示组件（Table、Badge、Status等）- 待实现完整功能（延后）
- [x] 5.3 实现Anthropic风格主题配置
  - [x] 色彩方案（柔和蓝色系、浅灰背景等）
  - [x] 字体和排版（Inter字体、间距系统）
  - [x] 阴影和圆角样式

## 6. 设置向导（Setup Wizard）
- [x] 6.1 创建设置向导页面结构（Setup/index.tsx）- 基础结构已创建
- [x] 6.2 实现首次启动检测（调用/api/setup/status）- 已集成到Router
- [x] 6.3 实现步骤1：管理员账户设置
  - [x] 用户名/密码设置表单
  - [x] 密码强度验证（至少6个字符，密码确认）
- [x] 6.4 实现步骤2：LLM配置向导
  - [x] 选择默认LLM提供商
  - [x] 配置API Key和Base URL
  - [x] 支持多个提供商配置
- [x] 6.5 实现步骤3：可选功能选择
  - [x] RAG功能启用/禁用
  - [x] RAG配置项（storagePath, baseURL, apiKey, model, dimensions）
- [x] 6.6 实现步骤4：完成设置
  - [x] 显示配置摘要
  - [x] 提供"从.env导入"选项（如果检测到.env文件）
  - [x] 提交配置并跳转到登录页
- [x] 6.7 实现.env迁移功能
  - [x] 检测.env文件存在性（通过setupApi检测）
  - [x] 解析.env文件内容（通过POST /api/setup/migrate-from-env）
  - [x] 转换为JSON格式并填充表单

## 7. 登录页面
- [x] 7.1 创建登录页面（Login.tsx）
- [x] 7.2 实现登录表单（用户名/密码）
- [x] 7.3 实现登录API调用（POST /api/admin/auth/login）
- [x] 7.4 实现Token存储和状态管理
- [x] 7.5 实现登录状态检查（路由守卫）
- [x] 7.6 实现登出功能

## 8. Dashboard主页
- [x] 8.1 创建Dashboard页面（Dashboard.tsx）
- [x] 8.2 实现系统状态卡片
  - [x] 服务器运行状态
  - [x] 在线节点数
  - [x] 总节点数
- [x] 8.3 实现统计信息展示
  - [x] 今日请求数
  - [x] 总对话数
  - [ ] 系统资源使用情况（待完善）
- [x] 8.4 实现快速操作入口
  - [x] 配置管理快捷入口
  - [x] 节点管理快捷入口
  - [x] 安全仪表板快捷入口

## 9. 配置管理界面
- [x] 9.1 创建配置管理页面（Settings/index.tsx）
- [x] 9.2 实现配置项分组显示
  - [x] 系统参数组（PORT、HOST、NODE_ENV、DEBUG_MODE）
  - [x] LLM配置组（所有提供商）
  - [x] 认证配置组
  - [x] 插件配置组
- [ ] 日志配置组（延后）
- [ ] 性能配置组（延后）
  - [x] RAG配置组
- [ ] Memory Service配置组（延后）
- [ ] Rerank配置组（延后）
- [x] 9.3 实现配置表单（参考Anthropic风格）
  - [x] 输入框、下拉框、开关等控件
  - [x] 表单验证（基础验证）
  - [x] 保存按钮和取消按钮
- [x] 9.4 实现配置保存功能（PUT /api/admin/config）
- [x] 9.5 实现配置导入/导出功能
  - [x] 导出配置到JSON文件（文件名包含日期）
  - [x] 从JSON文件导入配置（带验证和确认提示）
  - [x] 导入后重新加载配置
  - [x] 导入时检测是否需要重启服务器
- [x] 9.6 实现系统参数修改提示（需要重启服务）
- [x] 9.7 实现配置重置功能

## 10. 节点管理界面
- [x] 10.1 创建节点管理页面（Nodes/index.tsx）
- [x] 10.2 实现节点列表展示
  - [x] 节点信息表格（ID、名称、类型、状态、注册时间）
  - [x] 状态指示器（在线/离线、健康状态）
  - [x] 操作按钮（编辑、删除）
- [x] 10.3 实现节点详情页面（模态框形式，无需独立页面）
  - [x] 节点基本信息（ID、名称、类型、状态、注册时间、最后活跃）
  - [x] 配置信息展示（端点、能力列表）
  - [x] 人格绑定信息展示
  - [x] 快速编辑入口
- [x] 10.4 实现节点注册功能
  - [x] 注册表单（节点名称、类型、连接信息等）
  - [x] API调用（POST /api/admin/nodes）
- [x] 10.5 实现节点配置更新（PUT /api/admin/nodes/:id）
- [x] 10.6 实现节点注销功能（DELETE /api/admin/nodes/:id）
- [x] 10.7 实现节点状态实时更新（轮询，每5秒刷新一次）

## 11. 路由和导航
- [x] 11.1 配置React Router路由
  - [x] /setup - 设置向导
  - [x] /admin/login - 登录页
  - [x] /admin/dashboard - Dashboard
  - [x] /admin/settings - 配置管理
  - [x] /admin/nodes - 节点管理
- [x] 11.2 实现路由守卫（未登录重定向到登录页）
- [x] 11.3 实现首次启动检测（未完成设置重定向到设置向导）
- [x] 11.4 实现侧边栏导航组件
  - [x] 菜单项（Dashboard、配置管理、节点管理等）
  - [x] 当前路由高亮
  - [x] 响应式折叠（移动端）

## 12. 状态管理
- [x] 12.1 创建认证Store（Zustand）
  - [x] 登录状态
  - [x] 用户信息
  - [x] Token管理
- [x] 12.2 创建配置Store
  - [x] 当前配置数据
  - [x] 配置加载状态
  - [x] 配置更新操作
- [x] 12.3 创建节点Store
  - [x] 节点列表数据
  - [x] 选中节点信息
  - [x] 节点操作（注册、更新、删除）

## 13. API客户端封装
- [x] 13.1 创建API客户端基础类（admin/src/api/client.ts）
- [x] 13.2 实现请求拦截器（添加Token）
- [x] 13.3 实现响应拦截器（错误处理、Token刷新）
- [x] 13.4 创建各模块API封装
  - [x] setupApi.ts - 设置向导API
  - [x] configApi.ts - 配置管理API
  - [x] nodeApi.ts - 节点管理API
  - [x] authApi.ts - 认证API
  - [x] systemApi.ts - 系统状态API

## 14. 测试和验证
- [x] 14.1 测试首次启动流程（无配置文件）
- [x] 14.2 测试设置向导完整流程
- [x] 14.3 测试.env迁移功能
- [x] 14.4 测试配置管理功能（读取、更新、重置）
- [x] 14.5 测试节点管理功能（注册、更新、删除）
- [x] 14.6 测试登录/登出流程
- [x] 14.7 测试路由守卫和重定向
- [ ] 14.8 验证UI风格符合Anthropic设计规范（延后）

## 15. 文档和部署
- [ ] 15.1 更新README，说明Web管理后台使用方法（延后）
- [ ] 15.2 创建管理员使用指南（延后）
- [ ] 15.3 更新.env迁移说明文档（延后）
- [x] 15.4 配置生产环境构建（npm run build:admin）
  - [x] 添加 `build:admin` 脚本到主项目 package.json
  - [x] 添加 `build:all` 脚本（同时构建后端和前端）
- [x] 15.5 验证静态文件服务配置
  - [x] 静态文件服务已在 src/server.ts 中配置（/admin 路径）
  - [x] 支持 SPA 路由（所有 /admin/* 路径返回 index.html）
  - [x] 静态资源缓存配置（1小时）

