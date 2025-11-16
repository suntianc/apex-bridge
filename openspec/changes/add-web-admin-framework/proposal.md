## Why

当前系统缺乏Web管理界面，所有配置都需要手动编辑配置文件，用户体验差且容易出错。为了提供友好的系统管理体验，降低使用门槛，需要开发Web管理后台基础框架，包含设置向导、Dashboard和管理界面。同时需要将.env中的可配置项迁移到管理界面，实现可视化管理。

## What Changes

- 创建Web管理后台前端项目（`admin/`目录，集成在主项目内）
- 技术栈：React 18 + TypeScript + Vite + shadcn/ui + Tailwind CSS
- **UI设计风格：参考Anthropic官网（简洁、现代、大量留白、优雅排版、柔和色彩）**
- 基础框架搭建（路由、状态管理、API客户端）
- 配置主项目提供静态文件服务（Express静态文件中间件）
- 设置向导（Setup Wizard）
  - 首次启动检测
  - 管理员账户设置
  - LLM配置向导
  - 可选功能选择
- 登录页面
- Dashboard主页（系统状态、统计信息）
- **节点管理界面**（节点列表、状态监控、配置管理）
- **配置管理界面**（将所有.env可配置项迁移到Web界面）
  - LLM提供商配置（OpenAI、DeepSeek、Zhipu、Claude、Ollama、Custom）
  - 认证配置（VCP_KEY、VCP_API_KEY）
  - 插件配置（PLUGIN_DIR、PLUGIN_AUTO_LOAD）
  - 日志配置（LOG_LEVEL、LOG_FILE）
  - 性能配置（WORKER_POOL_SIZE、REQUEST_TIMEOUT、MAX_REQUEST_SIZE）
  - 缓存配置（Redis相关）
  - 异步结果清理配置
  - RAG配置（RAG_ENABLED、RAG_VECTORIZER_*等）
  - Memory Service配置（MEMORY_SYSTEM、VERIFY_MEMORY_SERVICE）
  - Rerank配置（RERANK_*）
- 基础布局（侧边栏导航、顶部栏）

**配置策略**：
- ✅ **完全取消.env配置**（包括业务配置和系统参数），所有配置项迁移到管理界面
- ✅ 配置存储在 `config/admin-config.json`（JSON格式）
- ✅ 首次启动自动创建默认配置模板
- ✅ 设置向导引导用户完成首次配置
- ✅ 系统参数（PORT、HOST、NODE_ENV、DEBUG_MODE）也迁移到管理界面，修改后提示需要重启服务

**BREAKING**: ⚠️ **轻微破坏性变更** - 现有.env配置需要迁移到管理界面
- 提供迁移工具：自动检测.env并导入到管理界面
- 设置向导中提供"从.env导入"选项
- 向后兼容：首次启动时如果检测到.env文件，提示导入

## Impact

- Affected specs: 新增`admin`能力（capability）
- Affected code:
  - `admin/` (新增整个前端项目)
    - `admin/src/` - React前端代码
      - `admin/src/pages/` - 页面组件（Setup、Login、Dashboard、Nodes、Settings等）
      - `admin/src/components/` - 共享组件（参考Anthropic设计风格）
      - `admin/src/router/` - 路由配置
      - `admin/src/api/` - API客户端
      - `admin/src/store/` - 状态管理（Zustand）
      - `admin/src/styles/` - 样式文件（Tailwind配置，Anthropic风格主题）
    - `admin/public/` - 静态资源
    - `admin/package.json` - 前端依赖
    - `admin/vite.config.ts` - Vite配置
    - `admin/tailwind.config.js` - Tailwind配置（Anthropic风格）
  - `src/server.ts` (修改，添加静态文件服务和API路由)
  - `src/api/controllers/AdminController.ts` (新增，管理后台API)
  - `src/api/controllers/SetupController.ts` (新增，设置向导API)
  - `src/api/controllers/ConfigController.ts` (新增，配置管理API - CRUD所有可配置项)
  - `src/api/controllers/NodeController.ts` (新增，节点管理API)
  - `src/services/ConfigService.ts` (新增，配置管理服务 - 读写JSON配置文件和持久化)
  - `src/config/index.ts` (修改，**从JSON文件读取配置，完全移除.env业务配置读取**)
  - `config/admin-config.json` (新增，所有配置项的持久化存储)
- Dependencies:
  - React 18 (新增前端依赖)
  - Vite (新增构建工具)
  - shadcn/ui (新增UI组件库)
  - Tailwind CSS (新增样式框架)
  - Zustand (新增状态管理)
  - React Router (新增路由)
  - Axios (新增HTTP客户端)

