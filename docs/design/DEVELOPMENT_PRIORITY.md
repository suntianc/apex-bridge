# Apex Bridge v2.0 - 功能模块研发优先级排期

> **文档版本**: v1.1  
> **创建时间**: 2025-01-20  
> **更新时间**: 2025-11-04  
> **基于架构**: ARCHITECTURE.md v2.0  
> **当前版本**: apex-bridge v1.0.0  

---

## 📋 文档说明

本文档基于《ARCHITECTURE.md》中的架构设计和开发路线图，结合项目当前实现状态（v1.0.0），制定详细的功能模块研发优先级排期计划。

**优先级原则**：
1. **依赖优先** - 被依赖的基础模块优先开发
2. **价值优先** - 用户价值高的功能优先
3. **风险可控** - 风险低、验证快的先做
4. **迭代交付** - 每个阶段都有可用的MVP

**重要说明**：
- ⚠️ **用户端UI界面开发暂时移除**（对话界面、移动端App等面向用户的界面）
- ✅ **管理端UI界面保留**（系统管理、配置管理、节点管理等后台管理界面）
- 📋 **本排期包含管理端UI开发和后端功能模块开发**
- 🔌 **需要确保后端API完整，供UI团队调用（用户端）和管理端使用**

---

## 📊 当前状态分析

### ✅ 已完成（v1.0.0）

**核心引擎层**：
- ✅ VCPEngine - VCP协议引擎
- ✅ LLMClient - 多LLM支持（DeepSeek、OpenAI、Zhipu、Ollama）
- ✅ PluginRuntime - 插件执行运行时
- ✅ VariableEngine - 变量解析引擎（7种Provider）
- ✅ ChatService - 对话服务（支持流式、工具调用循环）
- ✅ WebSocketManager - 实时通信
- ✅ DistributedService - 分布式服务基础

**记忆系统**：
- ✅ RAG服务基础 - vcp-intellicore-rag@1.0.2（HNSW向量检索）

**其他**：
- ✅ 插件系统（Direct/Hybrid/Service/Static）
- ✅ 日记归档服务
- ✅ 异步结果清理服务

### ❌ 待开发（v2.0）

**人格化层**：
- ❌ PersonalityEngine - 人格引擎
- ❌ EmotionEngine - 情感识别与响应
- ❌ ProactivityScheduler - 主动性调度

**记忆系统层**：
- ❌ IMemoryService - 统一接口（可插拔设计）
- ❌ 记忆系统增强（情感标注、偏好学习）
- ❌ 时间线功能

**节点管理层**：
- ❌ NodeManager - 节点注册与管理
- ❌ 节点通信协议扩展
- ❌ 节点可视化管理界面（管理端UI）

**管理界面**：
- ❌ Web管理后台（设置向导、Dashboard、配置管理等）
- ❌ 节点管理界面（管理端UI）
- ❌ 插件管理界面（管理端UI）
- ❌ 系统监控界面（管理端UI）

**用户界面**：
- ⚠️ 暂时移除，不在本排期范围内
  - ⚠️ 用户对话界面（Web聊天界面）
  - ⚠️ 移动端App（React Native）
  - ⚠️ 用户时间线查看界面
- ❌ Windows一键安装包

**节点生态**：
- ❌ apex-worker基础框架
- ❌ apex-companion基础框架
- ❌ 预装AI员工（小文、小账、小音等）
- ❌ 预装AI家人（小悦-AI女儿）

**高级功能**：
- ❌ apex-memory独立服务（Rust，可选）

---

## 🎯 优先级排期（详细版）

### P0级：MVP核心功能（Phase 1）

**目标**: 让用户能和AI自然对话，完成基础任务，体验人格化交互

**预估工期**: 1-1.5月

---

#### M1.1: 人格引擎基础 (PersonalityEngine)

**优先级**: 🔴 P0 - 最高  
**预估工时**: 5-7天  
**依赖**: 无  
**价值**: ⭐⭐⭐⭐⭐ 核心差异化特性

**任务清单**：
- [ ] 创建 `PersonalityEngine` 类（`src/core/PersonalityEngine.ts`）
- [ ] 定义人格配置格式（JSON/YAML）
- [ ] 实现人格配置文件加载（`Agent/xxx.txt` 或 `config/personality/xxx.json`）
- [ ] 实现System Prompt动态构建
- [ ] 集成到ChatService（在调用LLM前注入人格）
- [ ] 支持多AI人格切换（通过Agent ID）
- [ ] 单元测试

**交付物**：
- PersonalityEngine核心类
- 人格配置文件模板（3个示例：专业助手、温暖伙伴、活泼助手）
- 集成测试（验证人格注入生效）

**验收标准**：
- AI回复能体现人格特质（说话方式、称呼、表情）
- 不同人格配置文件能产生明显不同的回复风格
- 性能影响 < 50ms（人格加载时间）

**技术方案**：
```typescript
// 核心接口设计
class PersonalityEngine {
  loadPersonality(agentId: string): PersonalityConfig;
  buildSystemPrompt(personality: PersonalityConfig): string;
  injectIntoMessages(messages: Message[], personality: PersonalityConfig): Message[];
}
```

---

#### M1.2: 情感引擎基础 (EmotionEngine)

**优先级**: 🔴 P0 - 最高  
**预估工时**: 7-10天  
**依赖**: PersonalityEngine（M1.1）  
**价值**: ⭐⭐⭐⭐⭐ 提升用户体验和温度感

**任务清单**：
- [ ] 创建 `EmotionEngine` 类（`src/core/EmotionEngine.ts`）
- [ ] 实现情感识别（基于LLM快速分析，非训练模型）
- [ ] 定义情感类型枚举（happy/sad/angry/excited/neutral/anxious）
- [ ] 实现情感响应模板库（不同人格不同响应）
- [ ] 集成到ChatService（识别用户情感 → 调整回复风格）
- [ ] 情感记录（存储到记忆系统，优先级较低）
- [ ] 单元测试

**交付物**：
- EmotionEngine核心类
- 情感响应模板配置（6种情感 × 3种人格 = 18个模板）
- 集成测试（验证情感识别和响应）

**验收标准**：
- 能识别80%+常见情感表达（准确率）
- AI回复能根据用户情绪调整（共情能力）
- 响应延迟增加 < 100ms

**技术方案**：
```typescript
// 核心接口设计
class EmotionEngine {
  detectEmotion(userMessage: string): Promise<Emotion>;
  generateEmpatheticResponse(emotion: Emotion, personality: PersonalityConfig): string;
  recordEmotion(userId: string, emotion: Emotion, context: string): Promise<void>;
}
```

---

#### M1.3: 记忆系统接口统一 (IMemoryService)

**优先级**: 🟠 P0.5 - 高（为后续功能打基础）  
**预估工时**: 3-5天  
**依赖**: 无（但需要RAG服务存在）  
**价值**: ⭐⭐⭐⭐ 架构基础，支持可插拔

**任务清单**：
- [ ] 定义 `IMemoryService` 接口（`src/types/memory.ts`）
- [ ] 创建 `RAGMemoryService` 实现类（包装现有RAG服务）
- [ ] 实现基础方法：`save()`, `recall()`
- [ ] 在ChatService中集成（替换直接调用RAG）
- [ ] 配置文件支持（`MEMORY_SYSTEM=rag`，为后续扩展预留）
- [ ] 单元测试

**交付物**：
- IMemoryService接口定义
- RAGMemoryService实现
- 集成测试（验证记忆保存和检索）

**验收标准**：
- 现有RAG功能正常工作（向后兼容）
- 接口设计支持后续扩展（apex-memory集成）
- 性能无损失（接口调用开销 < 10ms）

**技术方案**：
```typescript
// 接口定义
interface IMemoryService {
  save(memory: Memory): Promise<void>;
  recall(query: string, context: Context): Promise<Memory[]>;
  recordEmotion?(userId: string, emotion: Emotion, context: string): Promise<void>;
  learnPreference?(userId: string, preference: Preference): Promise<void>;
  buildTimeline?(userId: string, days: number): Promise<TimelineEvent[]>;
}

// 实现类
class RAGMemoryService implements IMemoryService {
  constructor(private ragService: RAGService) {}
  // ... 实现接口方法
}
```

---

#### M1.4: 人格配置管理（API + 管理端UI）

**优先级**: 🟡 P1 - 中高  
**预估工时**: 5-7天（API: 2-3天，管理端UI: 3-4天）  
**依赖**: PersonalityEngine（M1.1）  
**价值**: ⭐⭐⭐⭐ 支持人格配置管理

**任务清单**：
- [ ] 实现人格配置文件管理API（增删改查）
  - [ ] GET `/api/personalities` - 列出所有可用人格
  - [ ] GET `/api/personalities/:id` - 获取指定人格配置
  - [ ] POST `/api/personalities` - 创建新人格配置
  - [ ] PUT `/api/personalities/:id` - 更新人格配置
  - [ ] DELETE `/api/personalities/:id` - 删除人格配置
- [ ] 预装3个人格配置文件（专业助手、温暖伙伴、活泼助手）
- [ ] 管理端UI开发（人格管理界面）
  - [ ] 人格列表页面（显示所有人格、状态）
  - [ ] 人格编辑页面（创建/编辑人格配置）
  - [ ] 人格预览功能（测试对话风格）
  - [ ] 人格导入/导出功能
- [ ] API文档

**交付物**：
- 人格管理REST API
- 3个预装人格配置文件
- 管理端人格管理界面
- API接口文档（OpenAPI/Swagger）

**验收标准**：
- 所有API接口正常工作
- 支持人格配置的完整CRUD操作
- 管理端UI可用，能完成人格的增删改查
- API文档清晰完整

---

#### M1.5: Web管理后台基础框架

**优先级**: 🟠 P0.5 - 高（系统管理必需）  
**预估工时**: 7-10天  
**依赖**: 无（后端API已存在）  
**价值**: ⭐⭐⭐⭐⭐ 系统管理核心

**任务清单**：
- [ ] 创建Web管理后台项目（`apex-bridge/admin/`，集成在主项目内）
- [ ] 技术栈：React 18 + TypeScript + Vite + shadcn/ui
- [ ] 基础框架搭建（路由、状态管理、API客户端）
- [ ] 配置主项目提供静态文件服务（Express静态文件中间件）
- [ ] 设置向导（Setup Wizard）
  - [ ] 首次启动检测
  - [ ] 管理员账户设置
  - [ ] LLM配置向导
  - [ ] 可选功能选择
- [ ] 登录页面
- [ ] Dashboard主页（系统状态、统计信息）
- [ ] 基础布局（侧边栏导航、顶部栏）

**交付物**：
- Web管理后台基础框架
- 设置向导完整流程
- Dashboard基础页面

**验收标准**：
- 首次启动能显示设置向导
- 完成设置后能进入Dashboard
- 基础导航和布局正常

**技术方案**：
```
管理后台项目结构（集成在主项目内）：
apex-bridge/
├── admin/                  # 管理后台前端
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Setup/         # 设置向导
│   │   │   ├── Login.tsx      # 登录页
│   │   │   └── Dashboard.tsx  # 主页
│   │   ├── components/
│   │   ├── router/
│   │   ├── api/
│   │   └── App.tsx
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
│
├── src/                    # 后端服务
│   └── server.ts           # 提供静态文件服务：app.use('/admin', express.static('admin/dist'))
└── ...
```

---

#### M1.6: Windows一键安装包

**优先级**: 🟡 P1 - 中高（降低使用门槛）  
**预估工时**: 5-7天  
**依赖**: 无  
**价值**: ⭐⭐⭐⭐⭐ 零门槛部署

**任务清单**：
- [ ] 使用 `electron-builder` 或 `nsis` 创建安装包
- [ ] 自动检测Node.js（如无则提示安装）
- [ ] 自动安装依赖（npm install）
- [ ] 创建桌面快捷方式
- [ ] 配置开机自启动（可选）
- [ ] 安装向导（配置LLM API Key）
- [ ] 卸载程序

**交付物**：
- Windows安装包（.exe）
- 安装指南文档
- 卸载测试

**验收标准**：
- 普通用户5分钟内完成安装
- 安装后即可使用（无需手动配置）
- 卸载后无残留文件

---

### P1级：记忆与主动性（Phase 2）

**目标**: AI有记忆、有情感、能主动关心用户

**预估工期**: 1-1.5月

---

#### M2.1: 记忆系统增强（情感标注）

**优先级**: 🟠 P1 - 高  
**预估工时**: 5-7天  
**依赖**: IMemoryService（M1.3）、EmotionEngine（M1.2）  
**价值**: ⭐⭐⭐⭐ 提升记忆质量

**任务清单**：
- [ ] 扩展 `IMemoryService` 接口（`recordEmotion()`）
- [ ] 在 `RAGMemoryService` 中实现情感标注
- [ ] 集成到ChatService（对话结束时记录情感）
- [ ] 记忆检索时返回情感标签
- [ ] 单元测试

**交付物**：
- 情感标注功能
- 记忆存储格式扩展（包含emotion字段）

---

#### M2.2: 主动性调度系统 (ProactivityScheduler)

**优先级**: 🟠 P1 - 高  
**预估工时**: 7-10天（MVP阶段），后续增强功能 +7-10天  
**依赖**: PersonalityEngine（M1.1）、IMemoryService（M1.3）、EmotionEngine（M1.2）  
**价值**: ⭐⭐⭐⭐⭐ 差异化核心能力

**设计文档**: [PROACTIVITY_SCHEDULER_DESIGN.md](./PROACTIVITY_SCHEDULER_DESIGN.md)

**分阶段实施**：

**阶段1：MVP核心（Week 1-2）✅ 必须实现**

**任务清单**：
- [ ] 创建 `ProactivityScheduler` 类（`src/core/ProactivityScheduler.ts`）
- [ ] 创建 `TriggerHub` 类（触发枢纽，去重/防抖/静音窗）
- [ ] 创建 `EvaluationEngine` 类（简化版判断/评审）
- [ ] 创建 `PolicyGuard` 类（政策守门，频次/时段/开关）
- [ ] 基于 `node-schedule` 实现定时任务（工作日 09:30、14:30）
- [ ] 实现静音窗控制（22:00-08:00，Asia/Taipei）
- [ ] 定义3个基础场景（早安问候、晚安祝福、健康提醒）
- [ ] 实现场景消息生成（基于PersonalityEngine）
- [ ] 集成到ChatService（主动发送消息）
- [ ] 配置管理（启用/禁用场景、频次限制）
- [ ] 单元测试

**交付物**：
- ProactivityScheduler核心类
- TriggerHub、EvaluationEngine、PolicyGuard辅助类
- 3个基础场景实现（早安、晚安、健康提醒）
- 配置文件（`config/proactivity.json`）
- 配置文档

**验收标准**：
- ✅ 能按时触发主动消息（工作日9:30、14:30）
- ✅ 静音窗内不触发（22:00-08:00）
- ✅ 消息内容符合人格设定
- ✅ 用户可配置场景开关
- ✅ 频次限制生效（每日最多1条）

**阶段2：增强功能（Week 3-4）🔄 建议实现**

**任务清单**：
- [ ] 扩展触发机制（事件触发、状态触发、随机触发）
- [ ] 引入评分维度（Value/Urgency/Novelty/Effort）
- [ ] 实现行动阈值判断（0.62）
- [ ] 实现话题多样性惩罚
- [ ] 集成EventBus监听事件（新文档、情感负向等）
- [ ] 增强场景判断逻辑
- [ ] 集成测试

**交付物**：
- 事件触发机制
- 评分系统
- 话题多样性控制

**阶段3：高级特性（Week 5+）⏳ 可选实现**

**任务清单**：
- [ ] 惊喜机制（沙箱预作业）
- [ ] 惊喜汇报卡（采纳/撤销/稍后）
- [ ] 工具白名单
- [ ] 奖励信号收集
- [ ] 阈值动态调整
- [ ] 探索/利用平衡

**交付物**：
- 惊喜机制完整实现
- 自适应学习系统

**技术方案**：
```typescript
// 核心接口设计
class ProactivityScheduler {
  registerScene(scene: ProactiveScene): void;
  schedule(sceneId: string, schedule: Schedule): void;
  trigger(sceneId: string, context?: any): Promise<void>;
  enable(sceneId: string): void;
  disable(sceneId: string): void;
  start(): void;
  stop(): void;
}

// 场景定义
interface ProactiveScene {
  id: string;
  name: string;
  trigger: 'schedule' | 'event' | 'condition' | 'random';
  schedule?: string; // Cron表达式
  generateMessage(context: Context, personality: PersonalityConfig): Promise<string>;
  enabled?: boolean;
  priority?: number;
}

// 触发枢纽
class TriggerHub {
  shouldTrigger(triggerId: string): boolean;
  isInQuietWindow(): boolean;
  isWorkday(): boolean;
}

// 判断/评审层
class EvaluationEngine {
  evaluateScenes(context: Context): Promise<SceneScore[]>;
  shouldAct(score: number): boolean;
}

// 政策守门
class PolicyGuard {
  canSendMessage(userId: string): boolean;
  isEnabled(sceneId: string): boolean;
}
```

**参考文档**：
- [PROACTIVITY_SCHEDULER_DESIGN.md](./PROACTIVITY_SCHEDULER_DESIGN.md) - 详细设计文档
- [记忆与主动性设计.md](../../记忆与主动性设计.md) - 完整设计理念

---

#### M2.3: 偏好学习功能（API + 管理端UI可选）

**优先级**: 🟡 P1.5 - 中  
**预估工时**: 5-7天（核心功能），管理端UI可选（+3-4天）  
**依赖**: IMemoryService（M1.3）  
**价值**: ⭐⭐⭐⭐ 提升个性化

**任务清单**：
- [ ] 扩展 `IMemoryService` 接口（`learnPreference()`）
- [ ] 实现偏好提取（从对话中识别偏好，如"喜欢科幻电影"）
- [ ] 偏好存储（轻量级JSON文件或扩展RAG）
- [ ] 偏好应用（在检索时优先返回相关偏好）
- [ ] 偏好管理API（供管理端和用户端调用）
  - [ ] GET `/api/preferences` - 获取用户偏好列表
  - [ ] POST `/api/preferences` - 手动添加偏好
  - [ ] PUT `/api/preferences/:id` - 更新偏好
  - [ ] DELETE `/api/preferences/:id` - 删除偏好
- [ ] 管理端UI（可选）- 偏好查看和编辑界面

**交付物**：
- 偏好学习功能
- 偏好管理REST API
- 管理端偏好管理界面（可选）
- API接口文档

---

#### M2.4: 时间线功能（API，用户端UI暂时移除）

**优先级**: 🟡 P1.5 - 中  
**预估工时**: 5-7天  
**依赖**: IMemoryService（M1.3）  
**价值**: ⭐⭐⭐⭐ 提升用户体验

**任务清单**：
- [ ] 扩展 `IMemoryService` 接口（`buildTimeline()`）
- [ ] 实现时间线构建（按时间排序记忆，生成叙述性摘要）
- [ ] 支持时间范围筛选（最近7天、30天、全部）
- [ ] 时间线管理API（供后续用户端调用）
  - [ ] GET `/api/timeline` - 获取时间线（支持时间范围参数）
  - [ ] GET `/api/timeline/search` - 搜索时间线事件
- [ ] API接口文档

**交付物**：
- 时间线构建功能
- 时间线REST API
- API接口文档（包含时间范围、搜索参数说明）

**说明**: 用户端时间线查看界面暂时移除，API保留供后续开发

---

#### M2.5: 关系管理（API + 管理端UI可选）

**优先级**: 🟡 P1.5 - 中  
**预估工时**: 5-7天（核心功能），管理端UI可选（+3-4天）  
**依赖**: IMemoryService（M1.3）  
**价值**: ⭐⭐⭐⭐ 情感化特性

**任务清单**：
- [ ] 定义关系数据模型（家庭成员、朋友、重要日期）
- [ ] 实现关系存储（JSON文件或扩展RAG）
- [ ] 关系管理API（供管理端和后续用户端调用）
  - [ ] GET `/api/relationships` - 获取所有关系
  - [ ] POST `/api/relationships` - 创建新关系
  - [ ] PUT `/api/relationships/:id` - 更新关系
  - [ ] DELETE `/api/relationships/:id` - 删除关系
  - [ ] GET `/api/relationships/:id/reminders` - 获取关系相关提醒（生日、纪念日）
- [ ] 集成到主动性系统（生日提醒、纪念日提醒）
- [ ] 管理端UI（可选）- 关系管理界面（增删改查、提醒设置）
- [ ] API接口文档

**交付物**：
- 关系管理功能
- 关系管理REST API
- 管理端关系管理界面（可选）
- API接口文档

---

### P2级：节点生态（Phase 3）

**目标**: 支持分布式节点，AI员工和AI家人

**预估工期**: 1-1.5月

---

#### M3.1: 节点管理器 (NodeManager)

**优先级**: 🟠 P2 - 高（节点生态基础）  
**预估工时**: 10-14天  
**依赖**: WebSocketManager（已有）、DistributedService（已有基础）  
**价值**: ⭐⭐⭐⭐ 分布式架构核心

**设计文档**: [NODE_MANAGER_DESIGN.md](./NODE_MANAGER_DESIGN.md)

**任务清单**：
- [x] 详细设计文档（节点注册协议、任务分发、LLM代理等）
- [ ] 创建 `NodeManager` 类（`src/core/NodeManager.ts`）
- [ ] 定义节点注册协议（扩展WebSocket消息类型）
- [ ] 实现节点注册（node_register消息）
- [ ] 实现节点心跳（heartbeat消息，每30秒）
- [ ] 实现节点状态管理（在线/离线/忙碌）
- [ ] 实现任务分发（task_assign消息）
- [ ] 实现LLM代理请求（Worker向Hub请求LLM）
- [ ] 节点管理API（列出节点、查看状态）
- [ ] 单元测试

**交付物**：
- NodeManager核心类
- 节点通信协议文档（扩展现有协议）
- 节点管理API
- 集成测试（模拟节点注册和通信）

**验收标准**：
- 节点能成功注册到Hub
- Hub能正确分发任务给节点
- 节点心跳机制正常工作
- 节点离线能正确检测

**技术方案**：
```typescript
// 核心接口设计
class NodeManager {
  registerNode(nodeInfo: NodeInfo): Promise<void>;
  unregisterNode(nodeId: string): void;
  getNode(nodeId: string): NodeInfo | undefined;
  listNodes(): NodeInfo[];
  assignTask(nodeId: string, task: Task): Promise<void>;
  handleLLMRequest(nodeId: string, request: LLMRequest): Promise<LLMResponse>;
}

// 节点信息
interface NodeInfo {
  nodeId: string;
  nodeType: 'worker' | 'companion';
  personality: PersonalityConfig;
  capabilities: string[];
  status: 'online' | 'offline' | 'busy';
  lastHeartbeat: number;
}
```

---

#### M3.2: apex-worker基础框架

**优先级**: 🟠 P2 - 高  
**预估工时**: 10-14天  
**依赖**: NodeManager（M3.1）  
**价值**: ⭐⭐⭐⭐ 节点生态基础

**任务清单**：
- [ ] 创建 `apex-worker` 项目（独立仓库或monorepo子包）
- [ ] 简化版架构（移除LLMClient，使用Hub代理）
- [ ] 实现WebSocket客户端（连接Hub）
- [ ] 实现节点注册流程
- [ ] 实现任务接收和执行
- [ ] 实现心跳机制
- [ ] 实现LLM代理请求（向Hub请求LLM服务）
- [ ] 基础插件系统（保留PluginRuntime，简化VariableEngine）
- [ ] 配置管理（Hub地址、节点ID、人格配置）
- [ ] 启动脚本和文档

**交付物**：
- apex-worker完整项目
- 3个示例Worker（小文-文件管理、小账-记账助手、小音-音乐管家）
- 部署文档

**验收标准**：
- Worker能成功连接Hub
- Worker能接收并执行任务
- Worker能通过Hub访问LLM
- Worker有基础人格化对话能力

**技术方案**：
```
apex-worker项目结构：
apex-worker/
├── src/
│   ├── core/
│   │   ├── WorkerEngine.ts
│   │   ├── HubClient.ts (WebSocket)
│   │   └── PluginRuntime.ts (简化版)
│   ├── config/
│   └── main.ts
└── package.json
```

---

#### M3.3: 节点管理（API + 管理端UI）

**优先级**: 🟡 P2.5 - 中  
**预估工时**: 8-12天（API: 3-5天，管理端UI: 5-7天）  
**依赖**: NodeManager（M3.1）  
**价值**: ⭐⭐⭐⭐ 节点可视化管理

**任务清单**：
- [ ] 节点管理REST API
  - [ ] GET `/api/nodes` - 列出所有节点
  - [ ] GET `/api/nodes/:nodeId` - 获取节点详情（能力、状态、资源占用）
  - [ ] GET `/api/nodes/:nodeId/logs` - 获取节点日志
  - [ ] POST `/api/nodes/:nodeId/restart` - 重启节点（如果支持）
  - [ ] DELETE `/api/nodes/:nodeId` - 卸载节点
  - [ ] WebSocket事件：节点状态变化推送（扩展现有WebSocket）
- [ ] 管理端UI开发（节点管理界面）
  - [ ] 节点列表页面（显示所有节点、状态、资源占用）
  - [ ] 节点详情页面（能力列表、日志查看、操作按钮）
  - [ ] 实时状态更新（WebSocket推送）
  - [ ] 节点注册引导页面（添加新节点）
  - [ ] 节点操作按钮（重启、卸载等）
- [ ] API接口文档（包含WebSocket事件说明）

**交付物**：
- 节点管理REST API
- WebSocket事件扩展（节点状态推送）
- 管理端节点管理界面
- API接口文档

---

#### M3.4: 额外Worker开发（小影、小厨、小健）

**优先级**: 🟡 P2.5 - 中  
**预估工时**: 每个Worker 3-5天（共9-15天）  
**依赖**: apex-worker框架（M3.2）  
**价值**: ⭐⭐⭐ 丰富生态

**任务清单**（每个Worker）：
- [ ] 人格配置文件
- [ ] 专业插件开发（2-3个核心插件）
- [ ] 测试和优化

**Worker清单**：
- 小影 🎬 - 视频管理（VideoDownload, VideoConvert, SubtitleSearch）
- 小厨 👨‍🍳 - 菜谱助手（RecipeRecommend, GroceryList, NutritionCalc）
- 小健 💪 - 健身教练（WorkoutPlan, CalorieTracker, MotivationReminder）

---

#### M3.5: apex-companion基础框架

**优先级**: 🟡 P2.5 - 中  
**预估工时**: 14-20天  
**依赖**: NodeManager（M3.1）、PersonalityEngine（M1.1）  
**价值**: ⭐⭐⭐⭐ 高级特性

**任务清单**：
- [ ] 创建 `apex-companion` 项目
- [ ] 完整版架构（独立LLMClient、完整MemoryService、完整PluginRuntime）
- [ ] 深度人格系统（DeepPersonality）
- [ ] 情绪状态管理（EmotionalState）
- [ ] 自主决策引擎（AutonomyEngine）- 基础版
- [ ] AI插件生成器（PluginGenerator）- 高级功能，可延后
- [ ] 示例Companion（小悦-AI女儿）

**交付物**：
- apex-companion完整项目
- 小悦人格配置和实现
- 部署文档

---

### P3级：多端与完善（Phase 4）

**目标**: 多设备生态，完善用户体验

**预估工期**: 3-4周（移动端API支持）

---

#### M4.1: 移动端API支持（为UI团队准备）

**优先级**: 🟡 P3 - 中  
**预估工时**: 2-3天  
**依赖**: 后端API（已有）  
**价值**: ⭐⭐⭐⭐ 支持移动端开发

**任务清单**：
- [ ] 确保所有API支持移动端调用（CORS配置、Token认证）
- [ ] 移动端特定API优化（简化响应格式，减少数据传输）
- [ ] 推送通知API（如果UI团队需要）
  - [ ] POST `/api/push/register` - 注册推送设备
  - [ ] POST `/api/push/unregister` - 注销推送设备
- [ ] 扫码绑定Hub功能API
  - [ ] GET `/api/qr-code` - 生成绑定二维码（包含Hub信息）
  - [ ] POST `/api/bind` - 移动端绑定Hub（验证二维码信息）
- [ ] API接口文档（移动端专用说明）

**交付物**：
- 移动端API支持
- 推送通知API（可选）
- 扫码绑定API
- API接口文档

**说明**: 移动端UI由外部团队开发，本模块仅提供后端API支持

---

#### M4.2: 语音交互API支持（为UI团队准备）

**优先级**: 🟡 P3 - 中（可选）  
**预估工时**: 3-5天  
**依赖**: 后端API  
**价值**: ⭐⭐⭐ 支持语音交互功能

**任务清单**：
- [ ] 语音识别结果处理API（接收UI端的语音转文字结果）
  - [ ] POST `/api/voice/transcript` - 接收语音识别文本（如果UI端自行处理语音识别）
- [ ] 语音合成配置API（TTS配置）
  - [ ] GET `/api/tts/config` - 获取TTS配置
  - [ ] PUT `/api/tts/config` - 更新TTS配置（语音类型、语速等）
- [ ] API接口文档（语音交互相关）

**交付物**：
- 语音交互API支持
- API接口文档

**说明**: 语音识别和TTS在UI端实现，后端仅提供配置和结果处理API

---

#### M4.3: 智能家居集成（可选）

**优先级**: 🟢 P4 - 低（可选）  
**预估工时**: 10-14天  
**依赖**: PluginRuntime（已有）  
**价值**: ⭐⭐⭐ 场景扩展

**任务清单**：
- [ ] 智能家居插件开发（小米、HomeKit等）
- [ ] 语音控制集成
- [ ] 场景自动化

---

#### M4.4: 插件市场（社区共享）

**优先级**: 🟡 P3.5 - 中低  
**预估工时**: 10-14天  
**依赖**: PluginRuntime（已有）  
**价值**: ⭐⭐⭐⭐ 生态建设

**任务清单**：
- [ ] 插件市场后端API（上传、下载、评分）
- [ ] Web UI插件市场页面
- [ ] 插件安装/卸载流程
- [ ] 插件审核机制（基础版）

---

### P4级：高级记忆系统（Phase 5，独立项目）

**目标**: 基于Rust的高性能类脑记忆系统

**预估工期**: 7-9月（独立并行开发，不阻塞主线）

**说明**: 这是一个**独立并行项目**，详细路线图见 `apex-memory/类脑记忆系统研发路线图.md`

**关键里程碑**：
- 阶段1（8-10周）: MVP核心 - PostgreSQL + Qdrant双库基础
- 阶段2（6-8周）: 图谱增强 - Neo4j集成，Graph-RAG三路融合
- 阶段3（8-10周）: 高级特性 - 快照归档、多模态检索
- 阶段4（6-8周）: 生产化 - 监控告警、安全机制

**集成方式**：
- apex-bridge通过HTTP/gRPC调用apex-memory
- 配置切换：`MEMORY_SYSTEM=memory`
- 保持IMemoryService接口兼容

---

### P5级：AI自主进化（Phase 6，长期）

**目标**: AI能自我学习和进化

**预估工期**: 1.5月（长期迭代）

**关键功能**：
- AI插件生成器（PluginGenerator）
- 自主学习引擎
- 代码安全审核
- 用户审批机制

---

## 📅 总体时间线

### 第1-2个月：MVP核心功能

```
Week 1-2:  M1.1 人格引擎 + M1.2 情感引擎基础
Week 3:    M1.3 记忆系统接口统一
Week 4-5:  M1.5 Web管理后台基础框架（设置向导、Dashboard）
Week 6:    M1.4 人格配置管理（API + 管理端UI）
Week 7-8:  M1.6 Windows安装包
```

**交付物**: 可用的AI管家后端，支持人格化对话；Web管理后台（设置向导、Dashboard、人格管理）；完整的REST API供后续用户端调用

---

### 第3-4个月：情感与记忆

```
Week 1:    M2.1 记忆系统增强（情感标注）
Week 2-3:  M2.2 主动性调度系统
Week 4:    M2.3 偏好学习功能
Week 5-6:  M2.4 时间线功能
Week 7:    M2.5 关系管理
```

**交付物**: AI有记忆、有情感、能主动关心用户

---

### 第5-6个月：节点生态

```
Week 1-2:  M3.1 节点管理器
Week 3-5:  M3.2 apex-worker基础框架
Week 6:    M3.3 节点管理API
Week 7-9:  M3.4 额外Worker开发（3个）
Week 10:   M3.5 apex-companion基础框架（启动）
```

**交付物**: 支持分布式节点，AI员工和AI家人；完整的节点管理API供UI团队调用

---

### 第7个月：多端与完善

```
Week 1:    M4.1 移动端API支持
Week 2:    M4.2 语音交互API支持（可选）
Week 3-4:  M4.3 智能家居集成（可选）
Week 5:    M4.4 插件市场后端API（基础版）
```

**交付物**: 完整的后端API支持多端场景；所有API文档完整，供UI团队使用

---

### 第8-16个月：高级记忆系统（并行）

```
独立并行开发，不阻塞主线功能
详见：apex-memory/类脑记忆系统研发路线图.md
```

---

### 第17-18个月：AI自主进化（长期）

```
持续迭代，功能逐步完善
```

---

## 📊 优先级矩阵

| 模块 | 优先级 | 价值 | 工作量 | 依赖复杂度 | 建议顺序 |
|------|--------|------|--------|-----------|---------|
| M1.1 人格引擎 | P0 | ⭐⭐⭐⭐⭐ | 5-7天 | 低 | 1 |
| M1.2 情感引擎 | P0 | ⭐⭐⭐⭐⭐ | 7-10天 | 低 | 2 |
| M1.3 记忆接口统一 | P0.5 | ⭐⭐⭐⭐ | 3-5天 | 低 | 3 |
| M1.4 人格配置管理 | P1 | ⭐⭐⭐⭐ | 5-7天 | 中 | 5 |
| M1.5 Web管理后台基础 | P0.5 | ⭐⭐⭐⭐⭐ | 7-10天 | 低 | 4 |
| M1.6 Windows安装包 | P1 | ⭐⭐⭐⭐⭐ | 5-7天 | 低 | 6 |
| M2.1 记忆增强 | P1 | ⭐⭐⭐⭐ | 5-7天 | 中 | 7 |
| M2.2 主动性调度 | P1 | ⭐⭐⭐⭐⭐ | 7-10天 | 中 | 8 |
| M2.3 偏好学习 | P1.5 | ⭐⭐⭐⭐ | 5-7天 | 中 | 9 |
| M2.4 时间线 | P1.5 | ⭐⭐⭐⭐ | 5-7天 | 中 | 10 |
| M2.5 关系管理 | P1.5 | ⭐⭐⭐⭐ | 5-7天 | 中 | 11 |
| M3.1 节点管理器 | P2 | ⭐⭐⭐⭐ | 10-14天 | 中 | 12 |
| M3.2 apex-worker | P2 | ⭐⭐⭐⭐ | 10-14天 | 高 | 13 |
| M3.3 节点管理 | P2.5 | ⭐⭐⭐⭐ | 8-12天 | 中 | 14 |
| M3.4 额外Worker | P2.5 | ⭐⭐⭐ | 9-15天 | 中 | 15 |
| M3.5 apex-companion | P2.5 | ⭐⭐⭐⭐ | 14-20天 | 高 | 16 |
| M4.1 移动端API支持 | P3 | ⭐⭐⭐⭐ | 2-3天 | 低 | 17 |
| M4.2 语音交互API | P3 | ⭐⭐⭐ | 3-5天 | 中 | 18（可选）|
| M4.3 智能家居 | P4 | ⭐⭐⭐ | 10-14天 | 低 | 19（可选）|
| M4.4 插件市场 | P3.5 | ⭐⭐⭐⭐ | 10-14天 | 低 | 20 |
| apex-memory | P4 | ⭐⭐⭐⭐⭐ | 7-9月 | 高 | 并行 |
| AI自主进化 | P5 | ⭐⭐⭐⭐ | 1.5月+ | 高 | 长期 |

---

## 🔄 依赖关系图

```
Phase 1 (MVP核心功能):
M1.1 人格引擎 ──┐
                ├─→ M1.2 情感引擎
M1.3 记忆接口 ──┘
                └─→ M2.1 记忆增强
M1.4 Web UI ────→ M1.5 人格配置系统
                 └─→ M2.3 偏好学习
                 └─→ M2.4 时间线
                 └─→ M3.3 节点管理UI

Phase 2 (情感与记忆):
M1.2 情感引擎 ──→ M2.1 记忆增强
M1.3 记忆接口 ──→ M2.1 记忆增强
                ├─→ M2.3 偏好学习
                └─→ M2.4 时间线
M1.1 人格引擎 ──→ M2.2 主动性调度
M1.3 记忆接口 ──→ M2.2 主动性调度

Phase 3 (节点生态):
WebSocketManager ──→ M3.1 节点管理器 ──→ M3.2 apex-worker
                                               ├─→ M3.4 额外Worker
                                               └─→ M3.5 apex-companion
M1.1 人格引擎 ──────→ M3.5 apex-companion
```

---

## ⚠️ 风险与建议

### 高风险模块

1. **M3.5 apex-companion** - 复杂度高，建议分阶段实现
2. **apex-memory** - 独立项目，需专门团队，不阻塞主线

### 可延后模块

- **M4.2 语音交互API** - 可选功能，优先级较低
- **M4.3 智能家居** - 可选功能，优先级较低
- **M3.5 AI插件生成器** - 高级功能，可在Companion基础版后再实现

### UI开发策略

1. **管理端UI** - 由本团队开发，包含在排期内
2. **用户端UI** - 暂时移除，后续开发（对话界面、移动端App等）
3. **API优先** - 所有功能先完成API设计和实现，管理端调用，用户端API预留
4. **接口文档** - 所有API需提供完整的OpenAPI/Swagger文档
5. **WebSocket事件** - 明确文档化所有WebSocket事件类型和数据格式
6. **版本协调** - API版本与UI版本保持同步

### 开发建议

1. **MVP优先** - 优先完成Phase 1，快速验证价值
2. **迭代交付** - 每个阶段都有可用版本
3. **并行开发** - apex-memory独立开发，不阻塞主线
4. **API文档** - 每个功能模块完成后立即更新API文档，便于UI团队对接
5. **用户反馈** - 与UI团队协作收集用户反馈，调整后续优先级

---

## 📝 更新记录

- **2025-01-20**: 初版创建，基于ARCHITECTURE.md v2.0
- **2025-01-20**: 移除UI相关模块，聚焦后端功能开发；保留API部分供UI团队使用

---

**文档维护**: 随着开发进展持续更新  
**负责人**: Apex Bridge Team

