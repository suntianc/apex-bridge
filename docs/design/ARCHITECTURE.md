# Apex Bridge - 家庭AI系统总体架构设计

> **文档版本**: v2.0  
> **创建时间**: 2025-11-02  
> **基于版本**: apex-bridge v1.0.0  
> **目标版本**: v2.0.0

---

## 📋 文档说明

**本文档定义**：
- 系统愿景与定位
- 总体技术架构
- 核心组件规划
- 开发演进路线

**不包含**：
- 具体代码实现
- 详细API设计
- 数据库Schema

---

## ⚠️ 重要说明

### 关于记忆系统的技术选型

**apex-bridge采用双轨记忆架构**：

#### 🟢 默认模式：RAG（Node.js）
- **技术**: vcp-intellicore-rag（Node.js + HNSW）
- **优势**: 开箱即用、零配置、轻量级
- **适用**: 90%的个人/家庭用户
- **部署**: 集成在apex-bridge中

#### 🔵 高级模式：apex-memory（Rust + 三库）
- **技术**: 独立Rust微服务 + PostgreSQL + Qdrant + Neo4j
- **优势**: Graph-RAG、情感图谱、极致性能
- **适用**: 技术团队、企业部署、深度用户
- **部署**: 独立服务，通过REST/gRPC集成

### 为什么apex-memory选择Rust？

**性能要求**:
- Graph-RAG检索涉及三库并行查询、复杂融合排序
- 目标延迟P95 ≤ 450ms（三路召回+排序+编排）
- Rust的零成本抽象和并发性能是最佳选择

**技术栈分离**:
```
apex-bridge (Node.js)
  - 专注对话、插件、人格化
  - 快速迭代、生态丰富
  - 与现有v1.0.0架构兼容

apex-memory (Rust)
  - 专注高性能记忆检索
  - 三库融合、图算法
  - 独立开发、独立部署
  - 不影响apex-bridge主线开发
```

**用户选择**:
- 大多数用户：只需apex-bridge（RAG模式）
- 高级用户：可选部署apex-memory
- 两种模式通过统一的IMemoryService接口切换

---

## 🎯 系统定位

### 愿景

**打造有温度的家庭AI生态系统**

不是冷冰冰的AI工具，而是：
- 🏠 **像家人一样** - 有个性、有记忆、有情感
- 💼 **工作好帮手** - 提升效率、自动化任务
- 🎮 **娱乐好伙伴** - 推荐内容、陪伴聊天
- 🚀 **零门槛使用** - 5分钟安装，开箱即用

### 核心理念

```
简单 > 复杂     # 极简安装，直观使用
温暖 > 冷漠     # 人格化交互，情感陪伴
智能 > 自动化   # 主动发现需求，而非被动执行
陪伴 > 工具     # 长期陪伴，而非一次性使用
```

### 目标用户

- **主要用户**: 家庭和个人（非技术背景）
- **使用场景**: 日常工作、生活管理、娱乐陪伴
- **技术要求**: 零技术门槛，会用微信就会用

---

## 🏗️ 系统架构

### 整体架构图

```
┌─────────────────────────────────────────────────────┐
│              🌐 用户端（多设备生态）                  │
│                                                     │
│  💻 Web浏览器    📱 移动App    🔊 智能音箱    ⌚ 手表 │
│  (控制面板)      (随身助手)    (语音交互)   (快捷操作)│
└───────────────────────┬─────────────────────────────┘
                        │
                        │ HTTP API / WebSocket
                        │
┌───────────────────────▼─────────────────────────────┐
│           🏠 Apex Bridge Hub (家庭中枢)              │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │          核心引擎层 (v1.0.0 已有)            │  │
│  │                                             │  │
│  │  VCPEngine   LLMClient   PluginRuntime      │  │
│  │  (协议引擎)  (多LLM)     (插件系统)          │  │
│  └─────────────────────────────────────────────┘  │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │        人格化层 (v2.0 新增)                  │  │
│  │                                             │  │
│  │  PersonalityEngine    EmotionEngine         │  │
│  │  (人格引擎)           (情感引擎)             │  │
│  │                                             │  │
│  │  ProactivityScheduler                       │  │
│  │  (主动性调度)                                │  │
│  └─────────────────────────────────────────────┘  │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │      🧠 记忆系统层 (可插拔设计)              │  │
│  │                                             │  │
│  │  IMemoryService (统一接口)                  │  │
│  │     │                                       │  │
│  │     ├─◉ RAG模式 (默认，v1.0.0已有)          │  │
│  │     │   └─ vcp-intellicore-rag             │  │
│  │     │                                       │  │
│  │     └─○ Memory模式 (v2.0新增，可选)         │  │
│  │         └─ apex-memory (独立服务)           │  │
│  └─────────────────────────────────────────────┘  │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │         节点管理层 (v2.0 新增)               │  │
│  │                                             │  │
│  │  NodeManager    DistributedService          │  │
│  │  (节点管理)     (分布式通信)                 │  │
│  └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
           │                           │
    ┌──────┴──────┐            ┌──────┴──────┐
    │             │            │             │
┌───▼────┐  ┌────▼────┐  ┌────▼────┐  ┌────▼────┐
│ 👷 AI员工│  │ 👷 AI员工│  │ 🤝 AI家人│  │ 🧠 记忆服务│
│ Worker │  │ Worker │  │Companion│  │ (可选)  │
├────────┤  ├─────────┤  ├─────────┤  ├─────────┤
│ 小文📁  │  │ 小账💰  │  │ 小悦🌸  │  │ apex-   │
│文件管理 │  │记账助手 │  │AI女儿   │  │ memory  │
└────────┘  └─────────┘  └─────────┘  └─────────┘
```

---

## 🧩 核心组件

### 1. Apex Bridge Hub (家庭中枢)

**定位**: 系统核心，统一调度和管理

**核心职责**:
- 🤖 **对话引擎** - 处理用户对话，调用LLM
- 🔧 **工具调度** - 执行插件，管理任务
- 🧠 **记忆管理** - 存储和检索记忆
- 📡 **节点管理** - 管理子节点（Worker/Companion）
- 🎭 **人格控制** - 注入人格，生成个性化回复

**技术基础**（v1.0.0已有）:
- VCPEngine - VCP协议引擎
- LLMClient - 多LLM提供商支持（DeepSeek、OpenAI、Zhipu、Ollama）
- PluginRuntime - 插件执行运行时
- VariableEngine - 变量解析引擎（7种Provider）
- ChatService - 对话服务
- WebSocketManager - 实时通信

**新增能力**（v2.0规划）:
- PersonalityEngine - 人格引擎
- EmotionEngine - 情感识别与响应
- NodeManager - 节点注册与管理
- ProactivityScheduler - 主动性调度（定时任务、事件触发）
- FamilyMemorySystem - 家庭记忆系统（可选升级）

---

### 2. 记忆系统（可插拔设计）

**设计原则**: 接口统一，实现可切换

#### 统一接口：IMemoryService

```
核心方法:
  - save(memory)          # 保存记忆
  - recall(query)         # 检索记忆
  - recordEmotion(...)    # 记录情感
  - learnPreference(...)  # 学习偏好
  - buildTimeline(...)    # 构建时间线
```

#### 实现A：RAG模式（默认）

**优势**:
- ✅ 基于v1.0.0现有架构
- ✅ 无需额外组件
- ✅ 开箱即用

**技术栈**:
- vcp-intellicore-rag@1.0.0
- HNSW向量检索
- 文件存储

**适用场景**: 
- 个人用户
- 轻量级使用
- 快速部署

#### 实现B：Memory模式（v2.0新增，Rust实现）

**优势**:
- ✅ **Graph-RAG检索** - 三路融合（向量+图谱+事实）
- ✅ **情感化记忆** - 情感时刻、情绪追踪
- ✅ **关系图谱** - 实体网络、图推理
- ✅ **完整时间线** - 叙述性时间线生成
- ✅ **高性能** - Rust实现，P95 ≤ 450ms
- ✅ **可扩展** - 三库独立扩展

**技术栈（Rust）**:
```
语言: Rust
框架: Axum (REST) + Tonic (gRPC)
三库:
  - PostgreSQL   # 事实锚定（user_facts, user_profile, active_topics）
  - Qdrant       # 向量检索（memories_semantic, snapshots_archive）
  - Neo4j        # 图数据库（实体、关系、推理路径）
```

**部署架构**:
```
apex-memory (独立Rust服务)
  ├── ingestor服务     # 记忆写入（Port 8081）
  ├── retriever服务    # 记忆检索（Port 8080）
  └── consolidator服务 # 记忆巩固（定时任务）
```

**通信接口**:
- REST API（Axum）
- gRPC（Tonic）
- 支持HTTP客户端和gRPC客户端

**适用场景**:
- 需要Graph-RAG高级检索
- 需要深度情感和关系建模
- 需要极致性能（< 450ms）
- 技术团队有Rust能力
- 企业级部署需求

#### 配置切换

```env
# 使用RAG模式（默认）
MEMORY_SYSTEM=rag

# 使用Memory模式（嵌入）
MEMORY_SYSTEM=memory

# 使用Memory模式（独立服务）
MEMORY_SYSTEM=memory
MEMORY_SERVICE_URL=http://192.168.1.100:9000
```

---

### 3. AI员工节点（Worker）

**定位**: 专精某个领域的AI助手，有基础对话能力

**核心特点**:
- 👤 **人格化** - 有名字、性格、专长
- 💬 **能对话** - 围绕专业领域聊天
- 🔧 **执行任务** - 调用专业插件
- 📊 **轻量级** - 资源占用小（树莓派可运行）
- 🔗 **依赖Hub** - 通过Hub访问LLM和记忆

**技术架构**（简化版apex-bridge）:
```
apex-worker/
├── 保留组件:
│   ├── PluginRuntime     # 插件执行
│   ├── WebSocketClient   # 连接Hub
│   └── BasicChatService  # 基础对话（依赖Hub的LLM）
│
└── 移除组件:
    ├── LLMClient         # ❌ 使用Hub的LLM
    ├── RAGService        # ❌ 使用Hub的记忆
    └── FullVariableEngine # ❌ 仅基础变量
```

**典型Worker角色**:

| 员工 | 专长 | 性格 | 预装插件 |
|-----|------|------|---------|
| 小文 📁 | 文件管理 | 细心、有条理 | FileSearch, FileOrganize, AutoBackup |
| 小影 🎬 | 视频管理 | 活泼、高效 | VideoDownload, VideoConvert, SubtitleSearch |
| 小音 🎵 | 音乐管家 | 温柔、文艺 | MusicPlayer, PlaylistManager, LyricsFinder |
| 小厨 👨‍🍳 | 菜谱助手 | 热情、贴心 | RecipeRecommend, GroceryList, NutritionCalc |
| 小账 💰 | 记账助手 | 严谨、负责 | ExpenseTracker, BudgetAlert, ReportGenerator |
| 小健 💪 | 健身教练 | 积极、鼓励 | WorkoutPlan, CalorieTracker, MotivationReminder |

**通信机制**:
- 通过WebSocket连接Hub
- 接收任务指令
- 请求LLM服务（代理到Hub）
- 返回执行结果

---

### 4. AI家人节点（Companion）

**定位**: 具备全能力和自主权的AI伙伴

**核心特点**:
- 💝 **深度人格** - 有背景故事、情感、记忆
- 🎯 **全能力** - 可使用所有Worker的技能
- 🧠 **独立思考** - 有独立LLM，可自主决策
- 🌱 **自我进化** - 可学习、可生成新插件
- 🔓 **自主权** - 在安全范围内自主行动

**技术架构**（完整版apex-bridge）:
```
apex-companion/
├── 完整组件:
│   ├── LLMClient         # ✅ 独立LLM访问
│   ├── MemoryService     # ✅ 完整记忆访问
│   ├── PluginRuntime     # ✅ 所有插件
│   └── AutonomyEngine    # ✅ 自主决策引擎
│
└── 特殊组件:
    ├── DeepPersonality   # 深度人格系统
    ├── EmotionalState    # 情绪状态
    └── PluginGenerator   # AI插件生成器（高级）
```

**典型Companion角色**:

| 角色 | 关系 | 性格 | 特殊能力 |
|-----|------|------|---------|
| 小悦 🌸 | AI女儿 | 活泼、聪明、善解人意 | 情感陪伴、学习新技能 |
| 老张 🧓 | AI管家 | 稳重、经验丰富、可靠 | 家庭事务统筹、建议 |
| 小智 🎓 | 学习伙伴 | 好学、耐心、鼓励 | 一起学习、讨论问题 |
| 阿福 🐕 | AI宠物 | 忠诚、活泼、逗趣 | 陪玩、娱乐、解压 |

**自主权设计**:
- ✅ **可以做**: 生成插件、优化流程、主动提醒、提出建议
- ⚠️ **需批准**: 安装第三方、修改配置、删除数据
- ❌ **禁止**: 访问隐私、对外分享、破坏性操作

---

### 5. apex-memory（独立记忆服务，可选）

**定位**: 基于Rust的高性能类脑记忆系统，替代RAG模式

**核心架构**: **三库融合 + 四层记忆**

```
apex-memory (Rust 微服务)
├── PostgreSQL    # 事实锚定（用户画像、高频事实）
├── Qdrant        # 语义向量（对话、快照）
└── Neo4j         # 关系图谱（实体、关系、推理）
```

**核心功能**:
- 📚 **Graph-RAG检索** - 向量+图谱+事实三路融合
- 💝 **情感记忆** - 情感时刻标注、情绪追踪
- 👥 **关系图谱** - 实体关系网络、图扩展推理
- ⭐ **偏好学习** - 自动提取、置信度更新
- 📅 **智能时间线** - 叙述性时间线生成
- 🎯 **记忆巩固** - 重要性评分、分层归档、遗忘机制
- 🖼️ **快照归档** - HTML→PNG + OCR双通道索引

**技术栈**:
```
语言: Rust (高性能、低延迟)
框架: Axum (REST) + Tonic (gRPC)
数据库:
  - PostgreSQL     # 事实存储
  - Qdrant         # 向量检索（HNSW）
  - Neo4j          # 图数据库
依赖: sqlx, neo4rs, qdrant-client
```

**性能指标**（设计目标）:
- 检索延迟 P95 ≤ 450ms
- 吞吐量 ≥ 50 RPS
- 可用性 ≥ 99.9%

**部署模式**:
- **独立服务**（标准）: Rust独立进程，REST/gRPC接口
- **分布式**（高级）: 三库分离部署，水平扩展
- **容器化**（企业）: Docker + Kubernetes

**与apex-bridge集成**:
```
apex-bridge (Node.js)
     │
     │ HTTP/gRPC
     ▼
apex-memory (Rust)
  ├── POST /v1/ingest       # 写入记忆
  ├── POST /v1/retrieve     # 检索记忆
  ├── POST /v1/topics/snapshot  # 话题快照
  └── POST /v1/profile/upsert   # 用户画像
```

**何时启用**:
- 需要Graph-RAG高级检索
- 需要深度情感和关系建模
- 需要极致性能（Rust优势）
- 愿意部署多个数据库组件
- 技术团队有Rust能力

---

## 🎭 人格化系统

### 设计理念

**让AI有"人格"，不只是"功能"**

### 核心组件

#### 1. PersonalityEngine (人格引擎)

**职责**: 为每个AI注入独特人格

**实现方式**:
- 读取人格配置文件（`Agent/小智.txt`）
- 动态构建System Prompt
- 注入到LLM对话上下文

**人格要素**:
```
基础身份:
  - 名字、头像、关系定位
  - 年龄、背景故事

性格特质:
  - 核心特质（温和、活泼、专业...）
  - 兴趣爱好
  - 价值观

交互风格:
  - 说话方式（礼貌、亲昵、专业...）
  - 称呼方式（Boss、爸爸、您...）
  - 表情使用（频繁、适度、克制）

行为模式:
  - 成功时的反应
  - 失败时的反应
  - 闲暇时的话题
```

#### 2. EmotionEngine (情感引擎)

**职责**: 识别情感、响应情感、记录情感

**核心能力**:
- **情感识别** - 从文字识别用户情绪（happy/sad/angry/excited/neutral）
- **共情响应** - 根据情绪生成贴心回应
- **情感记录** - 保存强烈情感时刻
- **情感学习** - 学习如何更好地安慰/庆祝

**实现策略**:
- 基于LLM的快速情感分析
- 预设情感响应模板库
- 人格化调整（不同AI不同反应）

#### 3. ProactivityScheduler (主动性调度)

**职责**: 让AI主动关心用户，而非被动响应

**主动场景**:
- ☀️ **每日例程** - 早安问候、晚安祝福
- ⏰ **智能提醒** - 日程、生日、重要事项
- 🔍 **需求发现** - 分析行为模式，主动提供帮助
- 💡 **建议提供** - 基于偏好的智能推荐
- 💪 **关怀提醒** - 健康提醒（喝水、休息、运动）

**技术实现**:
- 基于node-schedule的定时任务（v1.0.0已有）
- 事件驱动触发（用户行为触发）
- 上下文感知（根据时间、场景调整）

---

## 🌐 通信架构

### Hub ↔ Node 通信协议

**基础**: 基于v1.0.0的WebSocket + DistributedServerChannel

**扩展协议**:

#### 节点注册
```
Worker/Companion → Hub

{
  "type": "node_register",
  "nodeId": "file-worker-001",
  "nodeType": "worker",
  "personality": {
    "name": "小文",
    "avatar": "📁",
    "domain": "file"
  },
  "capabilities": ["FileSearch", "FileOrganize"]
}
```

#### 任务分发
```
Hub → Worker

{
  "type": "task_assign",
  "taskId": "task_xxx",
  "targetNode": "file-worker-001",
  "payload": {
    "action": "search_file",
    "query": "昨天的报告"
  }
}
```

#### LLM代理请求（Worker专用）
```
Worker → Hub

{
  "type": "llm_request",
  "workerId": "file-worker-001",
  "messages": [...],
  "personalityContext": "小文的对话风格"
}

Hub → Worker

{
  "type": "llm_response",
  "content": "找到了3个文件..."
}
```

#### 心跳与状态
```
Worker/Companion → Hub (每30秒)

{
  "type": "heartbeat",
  "nodeId": "file-worker-001",
  "status": "idle",
  "resources": {
    "cpu": 15,
    "memory": 80
  }
}
```

---

## 📊 数据架构

### 数据分层

```
┌─────────────────────────────────────┐
│        应用层数据                    │
│  - 对话历史                          │
│  - 任务记录                          │
│  - 用户配置                          │
└─────────────────────────────────────┘
                │
┌───────────────▼─────────────────────┐
│        记忆系统数据                  │
│  - 长期记忆（RAG/Memory）            │
│  - 情感记忆                          │
│  - 偏好数据                          │
│  - 关系图谱                          │
└─────────────────────────────────────┘
                │
┌───────────────▼─────────────────────┐
│        系统层数据                    │
│  - 插件配置                          │
│  - 节点注册                          │
│  - 日志文件                          │
└─────────────────────────────────────┘
```

### 数据存储位置

**默认数据目录** (单机模式):
```
apex-bridge/
├── data/
│   ├── vector_store/        # RAG向量库（v1.0.0已有）
│   ├── dailynote/           # 日记（v1.0.0已有）
│   ├── config/              # 运行时配置
│   │   ├── personality/     # 人格配置
│   │   └── nodes/           # 节点配置
│   └── logs/                # 日志文件
│
└── async_results/           # 异步任务结果（v1.0.0已有）
```

**apex-memory数据目录** (独立服务):
```
apex-memory/
├── data/
│   ├── postgres/            # PostgreSQL数据目录
│   ├── qdrant/              # Qdrant数据目录
│   ├── neo4j/               # Neo4j数据目录
│   └── snapshots/           # PNG快照归档（对象存储）
│
└── logs/                    # 日志文件
```

---

## 🔌 插件系统

### 插件分层

**v1.0.0已有**:
- Direct Plugin - stdio协议执行
- Hybrid Plugin - 混合型（v1.0.1 起不再内置 RAGDiaryPlugin，保留扩展点）
- Static Plugin - 静态信息
- Service Plugin - HTTP服务

**v2.0扩展**:
- **人格化配置** - 插件可定义"员工人格"
- **权限控制** - 插件声明所需权限
- **资源限制** - CPU/内存/执行时间限制
- **节点绑定** - 插件可绑定到特定节点

### 插件权限模型

```
权限级别:
  - hub-only      # 仅Hub可执行
  - worker-safe   # Worker可安全执行
  - companion-only # 仅Companion执行
  - all           # 所有节点可执行

资源限制:
  - maxMemory: 100MB
  - maxCPU: 50%
  - maxExecutionTime: 30s
  - networkAccess: true/false
```

---

## 🌈 用户体验设计

### 多端统一体验

#### Web端（主力）
- **定位**: 完整功能控制面板
- **功能**: 对话、节点管理、配置、监控
- **技术**: React + shadcn/ui
- **访问**: http://localhost:8088

#### 移动端（随身）
- **定位**: 随时随地的AI伙伴
- **功能**: 语音对话、推送通知、快捷操作
- **技术**: React Native
- **连接**: 扫码绑定家里的Hub

#### 智能音箱（语音）
- **定位**: 纯语音交互
- **功能**: 语音唤醒、对话、智能家居控制
- **技术**: 集成小爱/天猫精灵/小度

### 交互设计原则

- **简单直观** - 无需学习，像聊天一样自然
- **温暖友好** - 使用温暖的语言和表情
- **主动贴心** - AI主动关心，而非被动等待
- **容错友好** - 理解口语化表达，智能纠错

---

## 🔐 安全架构

### 多层安全防护

**网络安全**:
- HTTPS加密（生产环境）
- WebSocket TLS
- CORS策略
- 请求频率限制

**认证授权**:
- API Key认证（可选）
- 节点JWT认证
- 用户密码保护（可选）
- 多设备Token管理

**插件安全**:
- 权限声明与检查
- 资源限制（Worker Threads隔离）
- 代码审核（AI生成插件）
- 沙箱执行

**数据安全**:
- 敏感数据本地加密
- 备份文件加密
- 定期自动备份
- 数据导出功能

**隐私保护**:
- 默认本地存储
- 可选云端备份
- 匿名统计（可关闭）
- 数据完全可控

---

## 🔗 apex-memory 详细架构（Rust服务）

### 三库融合设计

**设计理念**: 模拟人脑的多模态记忆机制

```
┌──────────────────────────────────────────┐
│         apex-memory (Rust Services)       │
├──────────────────────────────────────────┤
│                                          │
│  ┌────────────┐  ┌────────────┐         │
│  │ Ingestor   │  │ Retriever  │         │
│  │ (Port 8081)│  │ (Port 8080)│         │
│  └──────┬─────┘  └─────┬──────┘         │
│         │               │                │
│  ┌──────▼───────────────▼──────┐        │
│  │    Consolidator (CRON)      │        │
│  │    (定时巩固任务)             │        │
│  └──────┬──────────────────────┘        │
│         │                                │
├─────────▼────────────────────────────────┤
│          Storage Layer (三库)            │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │PostgreSQL│ │  Qdrant  │ │  Neo4j  │ │
│  │  事实库  │ │  向量库  │ │ 图谱库  │ │
│  └──────────┘ └──────────┘ └─────────┘ │
└──────────────────────────────────────────┘
```

### 三库职责分工

**PostgreSQL - 事实锚定层**:
- **user_profile** - 用户画像（名字、地区、特质）
- **user_facts** - 高频事实（偏好、能力、限制）
- **active_topics** - 跨会话话题快照
- **优势**: 精确查询、ACID保证、事务支持

**Qdrant - 语义联想层**:
- **memories_semantic** - 对话摘要向量（1024维）
- **snapshots_archive** - 快照多向量（图像512维 + 文本1024维）
- **优势**: 高性能ANN检索、HNSW算法、毫秒级响应

**Neo4j - 关系推理层**:
- **节点**: User, Entity, Memory, Topic, Event, Decision
- **关系**: MENTIONS, RELATES, CONFIRMS, CONTRADICTS, LINKS
- **优势**: 图扩展、路径推理、关系强化/冲突

### 四层记忆机制

```
Layer 1: 短期记忆
  - 位置: apex-bridge的ChatService内存
  - 容量: 当前会话（10-20轮）
  - 时长: 会话结束即清空

Layer 2: 中期记忆
  - 位置: Qdrant (memories_semantic)
  - 容量: 最近7-30天
  - 检索: 向量相似度检索

Layer 3: 用户画像
  - 位置: PostgreSQL (user_profile, user_facts)
  - 内容: 高频事实、稳定偏好
  - 检索: 精确匹配

Layer 4: 长期归档
  - 位置: Qdrant (snapshots_archive) + 对象存储
  - 内容: 重要时刻快照（PNG + OCR）
  - 检索: 多通道融合（图像+文本）
```

### Graph-RAG检索流程

```
用户查询
  ↓
Planner (意图识别)
  ↓
三路并行召回:
  ├─► Vector召回 (Qdrant ANN)
  ├─► Graph扩展 (Neo4j路径推理)
  └─► Facts查表 (PostgreSQL精确匹配)
  ↓
融合排序 (多维度评分)
  ↓
上下文编排 (贪心装载到Token预算)
  ↓
返回结果
```

### 记忆巩固机制

**重要性评分**:
```
S(m) = 0.20×频率 + 0.15×新近度 + 0.15×中心性 
     + 0.15×稳定性 + 0.20×用户标记 + 0.10×实用性 
     + 0.05×新颖性
```

**层级迁移**:
- **短→中**: 会话结束 → Qdrant
- **中→长**: S ≥ 0.65 且 age ≥ 7天 → 快照归档（PNG + OCR）
- **降级**: S < 0.25 且 age ≥ 30天 → 聚类降采样

### 与apex-bridge集成方式

```typescript
// apex-bridge中的集成
class RemoteMemoryClient implements IMemoryService {
  private baseUrl: string;  // http://localhost:8080
  
  async save(memory: Memory): Promise<void> {
    // 调用apex-memory的REST API
    await axios.post(`${this.baseUrl}/v1/ingest`, {
      user_id: memory.userId,
      turn_id: memory.turnId,
      user_utterance: memory.userMessage,
      assistant_reply: memory.aiResponse,
      meta: memory.metadata
    });
  }
  
  async recall(query: string, context: Context): Promise<Memory[]> {
    // 调用Graph-RAG检索
    const res = await axios.post(`${this.baseUrl}/v1/retrieve`, {
      user_id: context.userId,
      query: query,
      budget_tokens: 2000,
      latency_ms: 450
    });
    
    // 解析evidences和facts
    return this.parseEvidences(res.data);
  }
}
```

### 性能优势

**对比RAG模式**:

| 指标 | RAG模式 | Memory模式 (Rust) |
|-----|---------|------------------|
| 检索延迟 | ~300ms | **< 200ms** (P95) |
| 检索质量 | 语义匹配 | **三路融合** |
| 关系推理 | ❌ | **✅ 图扩展** |
| 情感记忆 | ❌ | **✅ 情感标注** |
| 事实锚定 | ❌ | **✅ 精确事实** |
| 扩展性 | 单库 | **三库独立扩展** |
| 复杂度 | 低 | **高** |

### apex-memory API规范

**核心接口**（基于OpenAPI + gRPC）:

```
REST API (Axum):
  POST /v1/ingest               # 写入对话
  POST /v1/retrieve             # Graph-RAG检索
  POST /v1/topics/snapshot      # 话题快照
  POST /v1/profile/upsert       # 用户画像更新
  POST /v1/forget               # 完全遗忘（GDPR）
  GET  /health                  # 健康检查

gRPC API (Tonic):
  Retriever.Retrieve            # 检索服务
  Ingestor.IngestTurn           # 写入服务
  Embedder.EmbedText            # 文本向量化
  OCR.OcrPng                    # 图像识别
```

**数据格式示例**:
```json
// POST /v1/ingest
{
  "user_id": "u_001",
  "turn_id": "t_12345",
  "user_utterance": "我喜欢看科幻电影",
  "assistant_reply": "已记住您喜欢科幻电影",
  "meta": {
    "emotion": "neutral",
    "importance": 0.7
  }
}

// POST /v1/retrieve
{
  "user_id": "u_001",
  "query": "我喜欢什么类型的电影？",
  "budget_tokens": 2000,
  "latency_ms": 450
}

// Response
{
  "plan": {
    "intent": "qa",
    "need_semantic": true,
    "need_graph": true,
    "need_facts": true
  },
  "evidences": [
    {
      "id": "m_123",
      "text": "用户喜欢科幻电影",
      "score": 0.95,
      "source": "facts"
    }
  ],
  "facts": [
    {
      "subj": "user",
      "pred": "likes",
      "obj": "sci-fi movies",
      "confidence": 0.9
    }
  ],
  "ctx_text": "根据记录，您喜欢科幻电影..."
}
```

---

## 🚀 技术选型

### 后端技术栈

#### apex-bridge (Node.js)

**核心框架** (v1.0.0已有):
- Node.js 18+ LTS
- TypeScript 5.x
- Express 4.x

**核心依赖**:
- vcp-intellicore-sdk@2.0.0 - VCP协议SDK
- vcp-intellicore-rag@1.0.0 - RAG服务（默认记忆）
- ws@8.x - WebSocket
- node-schedule@2.x - 定时任务

**新增依赖** (v2.0规划):
- axios/grpc-js - HTTP/gRPC客户端（连接apex-memory）
- @nlpjs/core - NLP处理（情感识别）
- simple-git - Git操作（插件更新）

#### apex-memory (Rust，可选)

**核心框架**:
- Rust 1.70+
- Axum 0.7 - REST框架
- Tonic 0.12 - gRPC框架

**核心依赖**:
- sqlx - PostgreSQL客户端
- neo4rs - Neo4j客户端
- qdrant-client - Qdrant客户端
- tokio - 异步运行时
- serde/serde_json - 序列化
- tracing - 日志追踪

**数据库组件**:
- PostgreSQL 14+ - 关系数据库
- Qdrant 1.x - 向量数据库
- Neo4j 5.x - 图数据库

### 前端技术栈 (v2.0新增)

**Web UI**:
- React 18 + TypeScript
- Vite - 构建工具
- shadcn/ui + Tailwind CSS - UI组件
- Zustand - 状态管理
- EventSource + WebSocket - 实时通信

**移动端**:
- React Native - 跨平台
- React Navigation - 路由
- WatermelonDB - 离线存储

---

## 🏭 部署架构

### 部署模式对比

| 模式 | 组件 | 技术栈 | 适用场景 | 复杂度 |
|-----|------|--------|---------|--------|
| **单机部署** | apex-bridge (RAG模式) | Node.js | 个人用户、快速开始 | ⭐ 低 |
| **分布式节点** | Hub + Workers + Companions | Node.js | 大家庭、多设备 | ⭐⭐⭐ 中 |
| **高级记忆** | Hub + apex-memory | Node.js + Rust + 3DB | 深度用户、Graph-RAG | ⭐⭐⭐⭐⭐ 高 |

### 典型部署场景

#### 场景1: 个人用户（推荐）
```
硬件: 一台PC/笔记本
组件: apex-bridge (单机)
配置: 云端LLM + RAG记忆
安装: 5分钟（一键安装包）
```

#### 场景2: 家庭用户
```
硬件: 树莓派（中枢）+ 手机App
组件: apex-bridge (树莓派) + Mobile App
配置: 本地LLM (Ollama) + RAG记忆
安装: 10分钟（烧录镜像 + App扫码）
```

#### 场景3: 高级用户（Graph-RAG记忆）
```
硬件: 
  - 主PC（apex-bridge）
  - 服务器/NAS（apex-memory + 三库）
组件: 
  - apex-bridge (主PC, Node.js)
  - apex-memory (服务器, Rust)
  - PostgreSQL + Qdrant + Neo4j (三库)
配置: 云端LLM + Memory记忆（独立Rust服务）
安装: 60分钟（需要技术背景）
```

---

## 📈 开发路线图

### Phase 1: MVP - 可用的AI管家 (1-1.5月)

**目标**: 让用户能和AI自然对话，完成基础任务

**核心功能**:
- ✅ 基于v1.0.0的对话能力
- 🆕 人格化对话（PersonalityEngine）
- 🆕 基础情感识别（EmotionEngine）
- 🆕 简洁Web UI（对话界面）
- 🆕 Windows一键安装包
- 🆕 3个预装AI员工（小文、小账、小音）

**交付标准**:
- 用户5分钟内完成安装
- 能和AI自然对话
- AI有基础人格（可选择）
- AI能调用工具完成任务

---

### Phase 2: 情感与记忆 (1-1.5月)

**目标**: AI有记忆、有情感、能主动关心

**核心功能**:
- 🆕 记忆系统增强（情感标注、偏好学习）
- 🆕 主动性系统（每日问候、智能提醒）
- 🆕 关系管理（家庭成员、重要日期）
- 🆕 时间线功能（回顾历史）
- 改进 Web UI（记忆查看、时间线展示）

**交付标准**:
- AI能记住之前的对话
- AI能主动问候和提醒
- AI能识别并响应用户情绪
- 用户能查看完整时间线

---

### Phase 3: 节点生态 (1-1.5月)

**目标**: 支持分布式节点，AI员工和AI家人

**核心功能**:
- 🆕 apex-worker基础框架
- 🆕 节点注册与管理（NodeManager）
- 🆕 节点可视化管理界面
- 🆕 3个额外Worker（小影、小厨、小健）
- 🆕 1个Companion（小悦-AI女儿）

**交付标准**:
- 支持添加Worker节点
- 节点能独立对话（围绕专长）
- 可视化管理节点状态
- Companion有自主性

---

### Phase 4: 多端与完善 (1月)

**目标**: 多设备生态，完善用户体验

**核心功能**:
- 🆕 移动端App（iOS + Android）
- 🆕 语音交互（可选）
- 🆕 智能家居集成（可选）
- 🆕 插件市场（社区共享）
- 🆕 apex-memory独立服务（高级功能）

**交付标准**:
- 手机App可用
- 支持语音对话
- 用户可安装社区插件
- 高级用户可启用独立记忆服务

---

### Phase 5: apex-memory开发 (独立项目，7-9月)

**目标**: 基于Rust的高性能类脑记忆系统（可选高级功能）

**说明**: 此阶段为**独立并行项目**，不阻塞apex-bridge主线开发

**开发路线**（详见《类脑记忆系统研发路线图》）:

**阶段1: MVP核心（8-10周）**
- PostgreSQL + Qdrant双库基础
- 基础写入/检索流程
- 简化版重要性评分
- REST API接口

**阶段2: 图谱增强（6-8周）**
- Neo4j图数据库集成
- Graph-RAG三路融合
- 实体关系抽取
- 图扩展检索

**阶段3: 高级特性（8-10周）**
- 快照归档（HTML→PNG + OCR）
- 多模态检索
- 话题延续机制
- 性能优化

**阶段4: 生产化（6-8周）**
- 监控告警体系
- 安全机制
- 自动化运维
- 文档完善

**技术团队要求**:
- Rust开发经验
- 数据库运维能力
- 向量检索/图算法理解
- 6-7人团队

**与apex-bridge集成**:
- apex-bridge通过HTTP/gRPC调用
- 配置切换: `MEMORY_SYSTEM=memory`
- 向后兼容: 保持IMemoryService接口

**资源投入估算**（参考路线图）:
- **人力**: 6-7人团队（Rust工程师×4 + AI工程师×2 + DevOps×1）
- **工期**: 28-36周（7-9个月）
- **人天**: 约1400-1500人天
- **基础设施**: PostgreSQL + Qdrant + Neo4j集群

**决策建议**:
- apex-bridge v1.0-v2.0使用RAG模式即可满足需求
- apex-memory作为**独立并行项目**开发
- 待apex-memory成熟后再集成
- 不阻塞apex-bridge主线功能开发

### Phase 6: AI自主进化 (1.5月，长期)

**目标**: AI能自我学习和进化

**核心功能**:
- 🆕 AI插件生成器
- 🆕 自主学习引擎
- 🆕 代码安全审核
- 🆕 用户审批机制

**交付标准**:
- Companion可生成简单插件
- 生成的插件经过安全审核
- 用户可审批AI的自主行为

---

## 🎯 成功指标

### 用户体验指标

- **安装成功率** > 95%
- **首次对话成功率** > 98%
- **平均安装时间** < 5分钟
- **用户留存率** > 70% (7天)

### 技术性能指标

- **对话响应延迟** < 1秒
- **插件执行时间** < 3秒
- **内存占用** < 512MB (单机模式)
- **系统可用性** > 99%

### 用户满意度

- **易用性评分** > 4.5/5
- **AI人格满意度** > 4.0/5
- **功能实用性** > 4.2/5
- **愿意推荐** > 80%

---

## 🔄 架构演进策略

### 向后兼容

**原则**: 新版本不破坏旧版本的功能和数据

**保证**:
- v1.0.0的所有API保持可用
- 现有插件无需修改
- 数据自动迁移
- 配置文件向后兼容

### 渐进增强

**策略**: 核心功能稳定，高级功能可选

```
基础功能（必需）:
  - 对话
  - 插件执行
  - 基础记忆（RAG）

增强功能（可选）:
  - 人格化
  - 情感识别
  - 主动性
  - 独立记忆系统

高级功能（可选）:
  - 分布式节点
  - AI插件生成
  - 多端同步
```

---

## 🌟 差异化特性

### 与其他AI系统的区别

| 特性 | 通用AI助手 | Apex Bridge |
|-----|-----------|-------------|
| **定位** | 工具 | **家人/伙伴** |
| **交互** | 问答式 | **主动关心式** |
| **记忆** | Session级 | **长期记忆** |
| **人格** | 统一风格 | **多样化人格** |
| **部署** | 云端SaaS | **本地优先** |
| **隐私** | 数据上云 | **数据本地** |
| **扩展** | 预设功能 | **插件生态** |
| **门槛** | 需技术 | **零门槛** |

### 核心竞争力

1. **真正的家庭成员** - 不是工具，是有温度的AI
2. **极简部署** - 5分钟安装，会用微信就会用
3. **隐私保护** - 数据本地，完全可控
4. **可扩展性** - 插件生态，社区共建
5. **工作娱乐兼顾** - 既是助手也是伙伴

---

## 📚 相关文档

### apex-bridge文档
- [部署方案设计](./DEPLOYMENT.md) - apex-bridge安装部署方案（待创建）
- [API参考](../USER_GUIDE.md) - v1.0.0 API文档

### apex-memory文档（独立项目）
- 《类脑记忆系统（三库融合，Rust方案）详细设计文档》 - 完整技术设计
- 《类脑记忆系统研发路线图》 - 4阶段开发计划
- 《仓库骨架+README+Makefile》 - Rust项目结构
- 《实施附件包》 - OpenAPI/Proto/SQL/Cypher模板

**注意**: apex-memory是**可选的独立Rust项目**，需要单独开发和部署。apex-bridge默认使用RAG模式，无需apex-memory即可运行。

---

## 📞 反馈与讨论

本文档是架构设计的指导性文件，欢迎提出建议和讨论。

- GitHub Issues: https://github.com/suntianc/apex-bridge/issues
- 标签: `architecture`, `design`, `discussion`

---

**文档维护**: 随着开发进展持续更新  
**最后更新**: 2025-11-02  
**负责人**: Apex Bridge Team

