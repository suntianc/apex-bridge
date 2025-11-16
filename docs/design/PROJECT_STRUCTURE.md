# Apex Bridge v2.0 - 项目结构清单

> **创建时间**: 2025-01-20  
> **用途**: 列出所有需要创建的项目文件夹

---

## 📁 核心项目（必需）

### 1. apex-bridge
**说明**: 主项目（Hub家庭中枢），已存在，无需创建  
**位置**: `apex-bridge/`  
**类型**: Node.js + TypeScript  
**阶段**: Phase 1-4

---

## 🆕 新增项目（需要创建）

### 2. apex-bridge-admin（集成在主项目中）
**说明**: Web管理后台（设置向导、Dashboard、配置管理等）  
**位置**: `apex-bridge/admin/`（集成在主项目内）  
**类型**: React 18 + TypeScript + Vite + shadcn/ui  
**阶段**: Phase 1 (M1.5)  
**预估工时**: 7-10天

**技术栈**:
- React 18
- TypeScript
- Vite
- shadcn/ui + Tailwind CSS
- Zustand（状态管理）

**优势**:
- 与主项目共享类型定义和配置
- 统一部署，无需分离
- 可以复用主项目的API和工具函数

---

### 3. apex-worker
**说明**: Worker节点框架（简化版，专精某个领域的AI员工）  
**位置**: `apex-worker/`  
**类型**: Node.js + TypeScript  
**阶段**: Phase 3 (M3.2)  
**预估工时**: 10-14天

**特点**:
- 简化版架构（移除LLMClient，使用Hub代理）
- WebSocket客户端（连接Hub）
- 基础插件系统
- 支持3个预装Worker（小文、小账、小音）

---

### 4. apex-companion
**说明**: Companion节点框架（完整版，具备全能力和自主权的AI家人）  
**位置**: `apex-companion/`  
**类型**: Node.js + TypeScript  
**阶段**: Phase 3 (M3.5)  
**预估工时**: 14-20天

**特点**:
- 完整版架构（独立LLMClient、完整MemoryService）
- 深度人格系统
- 情绪状态管理
- 自主决策引擎
- 示例：小悦-AI女儿

---

### 5. apex-memory（可选，独立项目）
**说明**: 基于Rust的高性能类脑记忆系统（三库融合）  
**位置**: `apex-memory/`  
**类型**: Rust + Axum + Tonic  
**阶段**: Phase 5（独立并行开发，7-9月）  
**预估工时**: 28-36周

**特点**:
- PostgreSQL + Qdrant + Neo4j三库融合
- Graph-RAG检索
- 独立Rust服务
- REST/gRPC接口

**说明**: 这是可选的高级功能，独立开发，不阻塞主线

---

## 📦 现有依赖项目（已存在，无需创建）

- **vcp-sdk** - VCP协议SDK（已存在）
- **vcp-rag** - RAG服务SDK（已存在）

---

## 📋 项目创建清单

### 需要立即创建的项目（Phase 1）

```
apex-bridge/admin/          # Web管理后台（集成在主项目内）
```

### Phase 3 需要创建的项目

```
apex-worker/                # Worker节点框架
apex-companion/             # Companion节点框架
```

### Phase 5 可选创建的项目

```
apex-memory/                # Rust记忆服务（独立项目）
```

---

## 🗂️ 完整目录结构建议

```
D:\Apex Bridge\
├── apex-bridge/              # ✅ 已存在 - 主项目（Hub）
│   └── admin/                # 🆕 需创建 - Web管理后台（集成在主项目内）
├── apex-worker/              # 🆕 Phase 3 - Worker节点
├── apex-companion/           # 🆕 Phase 3 - Companion节点
├── apex-memory/              # 🆕 Phase 5 - Rust记忆服务（可选）
│
├── vcp-sdk/                  # ✅ 已存在 - VCP协议SDK
├── vcp-rag/                  # ✅ 已存在 - RAG服务SDK
│
├── VCPChat/                  # ✅ 已存在 - 前端客户端（参考）
├── VCPToolBox/               # ✅ 已存在 - 后端服务（参考）
└── VCPDistributedServer/     # ✅ 已存在 - 分布式服务器（参考）
```

---

## 🎯 创建顺序建议

### 第一步：Phase 1 必需项目

1. **apex-bridge-admin** - Web管理后台（M1.5，Week 4-5开发）

### 第二步：Phase 3 节点生态

2. **apex-worker** - Worker节点框架（M3.2，Week 3-5开发）
3. **apex-companion** - Companion节点框架（M3.5，Week 10+开发）

### 第三步：Phase 5 高级功能（可选）

4. **apex-memory** - Rust记忆服务（独立项目，7-9月）

---

## 📝 注意事项

1. **apex-bridge/admin** 需要在 Phase 1 Week 4-5 前创建（集成在主项目内）
2. **apex-worker** 和 **apex-companion** 在 Phase 3 开始前创建即可
3. **apex-memory** 是独立并行项目，可延后创建
4. 所有项目建议放在同一父目录下，便于管理和引用

---

**最后更新**: 2025-01-20

