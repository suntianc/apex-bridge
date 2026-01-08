# ACE 功能剔除功能设计文档

> 文档版本：v1.0.0
> 创建日期：2026-01-08
> 更新日期：2026-01-08
> 关联需求：R-004 ACE 功能剔除需求

---

## 1. 概述

### 1.1 文档目的

本文档详细描述 ACE（Adaptive Cognitive Engine，自适应认知引擎）功能剔除的功能设计方案，为开发团队提供明确的技术指导和实现路径。文档涵盖模块结构设计、移除模块清单、保留模块清单、关键逻辑指导、数据迁移说明以及验收标准，确保剔除工作有序进行并达到预期目标。

### 1.2 背景说明

ApexBridge 项目在初始设计中引入了完整的 ACE 六层认知架构，包含自适应认知引擎、上下文压缩机制、伦理守卫、战略管理器、Playbook 自动提炼系统以及轨迹记录和反思机制。随着项目演进，发现 ACE 框架增加了系统复杂度但并未带来预期的智能提升效果，因此决定剔除所有 ACE 相关功能，回归轻量级的 AI Protocol 聊天服务定位。简化后的架构将保留核心的 LLM 调用能力和工具执行能力，移除所有认知增强层，显著降低系统复杂度并提高可维护性。

### 1.3 设计原则

ACE 功能剔除遵循以下核心设计原则：第一，API 接口行为 100% 一致，确保现有客户端无需任何修改即可继续使用；第二，渐进式移除而非一次性删除，通过分阶段实施降低风险；第三，保留所有核心对话和工具执行功能，确保系统基本能力不受影响；第四，简化 ChatService 编排逻辑，直接协调 LLM 调用和工具执行；第五，数据库 Schema 向后兼容，避免数据迁移风险。

---

## 2. 模块结构设计

### 2.1 移除前目录结构

移除前项目源码目录结构包含完整的 ACE 框架层，上下文压缩层以及 Playbook 系统层。以下是移除前的完整目录结构概览：

```
src/
├── api/                          # API 层（保留）
│   ├── controllers/
│   │   ├── ChatController.ts
│   │   ├── ProviderController.ts
│   │   └── ModelController.ts
│   ├── middleware/
│   └── websocket/
│
├── core/                         # 核心引擎层（保留）
│   ├── LLMManager.ts
│   ├── ToolDispatcher.ts
│   ├── ReActEngine.ts
│   └── adapters/
│       ├── OpenAIAdapter.ts
│       ├── ClaudeAdapter.ts
│       ├── DeepSeekAdapter.ts
│       ├── ZhipuAdapter.ts
│       ├── OllamaAdapter.ts
│       └── CustomAdapter.ts
│
├── services/                     # 服务层（大量需要移除）
│   ├── ChatService.ts            # 简化（保留）
│   ├── LLMConfigService.ts       # 保留
│   ├── ConversationHistoryService.ts  # 保留
│   ├── ToolRetrievalService.ts   # 保留
│   ├── SkillManager.ts           # 保留
│   ├── MCPIntegrationService.ts  # 保留
│   │
│   ├── ace/                      # 全部移除
│   │   ├── AceCore.ts
│   │   ├── AceService.ts
│   │   ├── AceIntegrator.ts
│   │   ├── AceStrategyManager.ts
│   │   ├── AceStrategyOrchestrator.ts
│   │   ├── AceEthicsGuard.ts
│   │   ├── StrategicContextManager.ts
│   │   ├── WorldModelUpdater.ts
│   │   └── types.ts
│   │
│   ├── compression/              # 全部移除
│   │   ├── CompressionService.ts
│   │   ├── ContextManager.ts
│   │   ├── TokenCounter.ts
│   │   └── CompressionStrategy.ts
│   │
│   └── playbook/                 # 全部移除
│       ├── PlaybookManager.ts
│       ├── PlaybookMatcher.ts
│       ├── PlaybookInjector.ts
│       ├── PlaybookCurator.ts
│       ├── PlaybookSynthesizer.ts
│       └── types.ts
│
├── strategies/                   # 策略层（保留，简化）
│   ├── ChatStrategy.ts           # 保留（接口）
│   ├── ReActStrategy.ts          # 保留
│   └── SingleRoundStrategy.ts    # 保留
│
├── context/                      # 上下文管理（部分移除）
│   ├── RequestContext.ts         # 保留
│   └── ResponseContext.ts        # 保留
│
└── server.ts                     # 入口（保留）
```

### 2.2 移除后目录结构

移除后目录结构显著简化，移除了所有 ACE 相关模块、上下文压缩模块以及 Playbook 系统模块。保留的模块结构更加清晰，职责更加明确：

```
src/
├── api/                          # API 层（不变）
│   ├── controllers/
│   │   ├── ChatController.ts
│   │   ├── ProviderController.ts
│   │   └── ModelController.ts
│   ├── middleware/
│   └── websocket/
│
├── core/                         # 核心引擎层（保留核心能力）
│   ├── LLMManager.ts
│   ├── ToolDispatcher.ts
│   ├── ReActEngine.ts
│   └── adapters/
│       ├── OpenAIAdapter.ts
│       ├── ClaudeAdapter.ts
│       ├── DeepSeekAdapter.ts
│       ├── ZhipuAdapter.ts
│       ├── OllamaAdapter.ts
│       └── CustomAdapter.ts
│
├── services/                     # 服务层（精简）
│   ├── ChatService.ts            # 简化重构
│   ├── LLMConfigService.ts       # 保留
│   ├── ConversationHistoryService.ts  # 保留
│   ├── ToolRetrievalService.ts   # 保留
│   ├── SkillManager.ts           # 保留
│   └── MCPIntegrationService.ts  # 保留
│
├── strategies/                   # 策略层（保留）
│   ├── ChatStrategy.ts           # 保留（接口）
│   ├── ReActStrategy.ts          # 保留
│   └── SingleRoundStrategy.ts    # 保留
│
├── context/                      # 上下文管理（精简）
│   ├── RequestContext.ts         # 保留
│   └── ResponseContext.ts        # 保留
│
└── server.ts                     # 入口（保留）
```

### 2.3 依赖关系对比

#### 2.3.1 移除前依赖关系图

移除前系统存在复杂的模块依赖关系，ACE 框架作为中间层协调 ChatService 与底层引擎之间的交互：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           ChatService                                   │
│                                  │                                       │
│            ┌─────────────────────┼─────────────────────┐                 │
│            ▼                     ▼                     ▼                 │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐       │
│   │ AceIntegrator   │   │ AceStrategyMgr  │   │ AceEthicsGuard  │       │
│   └────────┬────────┘   └────────┬────────┘   └────────┬────────┘       │
│            │                     │                     │                 │
│            ▼                     ▼                     ▼                 │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐       │
│   │ AceCore         │   │ PlaybookManager │   │ CompressionSvc  │       │
│   │ (六层认知)       │   │ (Playbook系统)  │   │ (上下文压缩)     │       │
│   └────────┬────────┘   └────────┬────────┘   └────────┬────────┘       │
│            │                     │                     │                 │
│            ▼                     ▼                     ▼                 │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                      核心引擎层                                   │   │
│   │  LLMManager │ ToolDispatcher │ ReActEngine │ VariableEngine    │   │
│   └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 2.3.2 移除后依赖关系图

移除后 ChatService 直接与策略层和核心引擎层交互，大幅简化了调用链路：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           ChatService                                   │
│                                  │                                       │
│            ┌─────────────────────┴─────────────────────┐                 │
│            ▼                                           ▼                 │
│   ┌─────────────────┐                         ┌─────────────────┐       │
│   │ ChatStrategy    │                         │ ToolRetrieval   │       │
│   │ (接口抽象)       │                         │ Service         │       │
│   └────────┬────────┘                         └─────────────────┘       │
│            │                                                           │
│    ┌───────┴───────┐                                                   │
│    ▼               ▼                                                   │
│ ┌──────────┐  ┌──────────┐                                             │
│ │ReActStrat│  │SingleRnd │                                             │
│ └────┬─────┘  └────┬─────┘                                             │
│      │             │                                                   │
│      └──────┬──────┘                                                   │
│             ▼                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                      核心引擎层                                   │   │
│   │  LLMManager │ ToolDispatcher │ ReActEngine │ VariableEngine    │   │
│   └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 移除模块清单

### 3.1 ACE 框架模块

#### 3.1.1 AceCore（核心引擎）

AceCore 是 ACE 框架的核心引擎，实现了六层认知架构，包括感知层、记忆层、推理层、规划层、执行层和学习层。该模块负责协调整个认知处理流程，管理各层之间的数据流转和状态同步。移除 AceCore 后，聊天流程将直接由 ChatService 协调策略层执行，不再经过认知引擎的层层处理。

**职责描述**：六层认知架构的核心实现，提供感知、记忆、推理、规划、执行和学习能力，管理认知处理流程的完整生命周期。

**影响范围**：所有依赖 AceCore 的上层功能将失效，包括基于认知状态的自适应响应、经验学习积累以及认知负荷动态调整等功能。ChatService 中所有调用 AceCore 的代码路径需要重构。

**移除优先级**：高，该模块是 ACE 框架的核心，必须首先移除。

#### 3.1.2 AceService（服务层）

AceService 是 ACE 框架的服务层封装，提供了统一的接口来访问 ACE 的各项能力。该模块封装了与 AceCore 的交互逻辑，向上层提供简化的 API 调用接口。AceService 还负责管理 ACE 相关的配置和状态，是 ACE 功能对外暴露的主要入口。

**职责描述**：ACE 能力的统一服务入口，封装 AceCore 交互逻辑，管理 ACE 配置和状态，提供简化的 API 接口。

**影响范围**：所有通过 AceService 调用 ACE 能力的代码需要重构。依赖 AceService 的配置项需要从系统配置中移除或标记为废弃。

**移除优先级**：高，作为 ACE 的服务入口，需要与 AceCore 同时移除。

#### 3.1.3 AceIntegrator（集成器）

AceIntegrator 负责将 ACE 框架与系统其他部分集成，处理 ACE 与外部系统的交互逻辑。该模块实现了 ACE 与 ChatService、工具执行系统以及外部服务之间的集成逻辑。移除 AceIntegrator 后，这些集成逻辑将由 ChatService 直接处理或通过简化后的适配层处理。

**职责描述**：ACE 与外部系统的集成中间件，处理 ACE 与 ChatService、工具系统、外部服务之间的交互和数据交换。

**影响范围**：ChatService 中所有通过 AceIntegrator 与 ACE 交互的代码需要重构。集成点的数据格式和协议需要重新定义。

**移除优先级**：高，集成器是 ACE 与系统其他部分连接的关键节点。

#### 3.1.4 AceStrategyManager（策略管理器）

AceStrategyManager 负责管理 ACE 上下文中的策略选择和切换，根据当前认知状态自动选择最适合的推理策略。该模块维护策略库的注册和发现机制，支持策略的动态加载和热更新。移除 AceStrategyManager 后，策略选择逻辑将简化为 ChatService 根据配置直接选择 ReActStrategy 或 SingleRoundStrategy。

**职责描述**：ACE 上下文中策略的自动选择和管理，根据认知状态动态切换推理策略，维护策略注册表和热更新机制。

**影响范围**：动态策略选择功能将移除，改为配置驱动的静态策略选择。ChatService 中的策略选择逻辑需要简化。

**移除优先级**：高，策略管理器与 ACE 框架深度绑定。

#### 3.1.5 AceStrategyOrchestrator（策略编排器）

AceStrategyOrchestrator 负责编排多个策略的协同执行，处理策略之间的切换和状态传递。该模块实现了复杂的策略编排逻辑，支持策略的并行执行、顺序执行以及条件切换。移除 AceStrategyOrchestrator 后，策略执行将简化为单一策略的线性执行。

**职责描述**：多策略协同执行的编排器，处理策略切换、状态传递和结果聚合，支持并行、顺序和条件策略执行模式。

**影响范围**：多策略协同执行功能将移除，改为单策略线性执行。策略状态管理逻辑需要简化。

**移除优先级**：中，该模块依赖于策略管理器。

#### 3.1.6 AceEthicsGuard（伦理守卫）

AceEthicsGuard 实现了 ACE 框架的伦理审查功能，对所有输入输出进行安全检查。该模块包含内容过滤、敏感词检测、风险评估等安全机制。移除 AceEthicsGuard 后，伦理审查功能将简化为基础的输入验证和输出过滤，不再进行深度语义分析。

**职责描述**：ACE 伦理安全守卫，负责输入输出的安全检查、内容过滤、敏感词检测和风险评估。

**影响范围**：深度语义安全检查功能将移除，改为基础输入验证。相关配置项需要移除或标记为废弃。

**移除优先级**：中，伦理守卫功能可简化保留基础能力。

### 3.2 上下文压缩模块

#### 3.2.1 CompressionService

CompressionService 是上下文压缩的核心服务，负责管理对话历史的压缩策略和执行压缩操作。该模块实现了多种压缩算法，包括摘要压缩、关键信息提取、滑动窗口压缩等。移除 CompressionService 后，系统将不再进行上下文压缩，保留完整的对话历史用于 LLM 调用。

**职责描述**：对话历史上下文压缩的集中管理，实现多种压缩算法（摘要、关键信息提取、滑动窗口），协调压缩流程和策略选择。

**影响范围**：所有上下文压缩功能将移除。LLM 调用时将使用完整的对话历史，不再进行压缩处理。对话历史存储大小可能增加。

**移除优先级**：高，上下文压缩与 ACE 框架深度绑定。

#### 3.2.2 ContextManager（ACE 相关）

ContextManager 管理 ACE 上下文中的上下文状态，包括上下文生命周期管理、上下文切换和上下文恢复等功能。该模块与 ACE 框架紧密耦合，实现了复杂的上下文状态管理逻辑。移除 ACE 相关的 ContextManager 后，将保留基础的请求上下文管理功能。

**职责描述**：ACE 上下文中完整的状态管理，包括上下文生命周期、上下文切换、上下文恢复和状态持久化。

**影响范围**：ACE 特有的上下文状态管理功能将移除。基础的请求上下文（RequestContext、ResponseContext）将继续使用。

**移除优先级**：高，需要区分保留和移除的部分。

#### 3.2.3 TokenCounter

TokenCounter 负责计算对话历史和消息的 token 数量，用于上下文压缩的决策依据。该模块实现了多种 token 计算方法，包括近似计算和精确计算。移除 TokenCounter 后，token 计算功能将简化为基础实现，主要用于 LLM API 调用的预算控制。

**职责描述**：Token 数量计算工具，支持对话历史和消息的 token 估算，为上下文压缩和 LLM 调用提供预算依据。

**影响范围**：高精度 token 计算功能将移除。LLM 调用时仍需进行基础的 token 估算以控制上下文长度。

**移除优先级**：中，可保留简化版本用于 LLM 调用预算控制。

#### 3.2.4 CompressionStrategy

CompressionStrategy 定义了上下文压缩的策略接口和内置实现，包括摘要策略、删除策略、合并策略等。该模块封装了各种压缩算法的策略模式实现。移除 CompressionStrategy 后，所有压缩策略实现将一并移除。

**职责描述**：压缩策略的接口定义和实现，封装摘要、删除、合并等压缩算法的策略模式。

**影响范围**：所有压缩策略实现将移除。相关接口和类型定义需要清理。

**移除优先级**：高，依赖于 CompressionService。

### 3.3 Playbook 系统模块

#### 3.3.1 PlaybookManager

PlaybookManager 是 Playbook 系统的核心管理器，负责 Playbook 的生命周期管理，包括创建、存储、检索和执行。该模块维护 Playbook 的版本控制和访问控制，支持 Playbook 的动态加载和热更新。移除 PlaybookManager 后，Playbook 相关功能将完全移除。

**职责描述**：Playbook 生命周期的集中管理，包括创建、存储、检索、版本控制和访问控制，支持动态加载和热更新。

**影响范围**：所有 Playbook 功能将移除，包括用户自定义 Playbook 和系统内置 Playbook。相关 API 端点需要移除或标记为废弃。

**移除优先级**：高，Playbook 系统的核心模块。

#### 3.3.2 PlaybookMatcher

PlaybookMatcher 负责根据对话上下文匹配最合适的 Playbook，实现 Playbook 的智能推荐功能。该模块使用多种匹配算法，包括语义匹配、规则匹配和统计匹配。移除 PlaybookMatcher 后，Playbook 推荐功能将移除，对话流程不再受 Playbook 影响。

**职责描述**：对话上下文与 Playbook 的智能匹配，使用语义、规则和统计等多种算法实现最佳 Playbook 推荐。

**影响范围**：Playbook 智能推荐功能将移除。Playbook 自动选择和注入机制不再生效。

**移除优先级**：高，依赖于 PlaybookManager。

#### 3.3.3 PlaybookInjector

PlaybookInjector 负责将匹配的 Playbook 内容注入到对话上下文中，影响 LLM 的响应生成。该模块实现了 Playbook 的上下文注入逻辑，处理注入时机和注入方式。移除 PlaybookInjector 后，Playbook 内容将不再注入到对话上下文中。

**职责描述**：Playbook 内容注入到对话上下文的执行器，处理注入时机、方式和格式转换。

**影响范围**：Playbook 上下文注入功能将移除。LLM 响应生成不再受 Playbook 影响。

**移除优先级**：高，依赖于 PlaybookMatcher。

#### 3.3.4 PlaybookCurator

PlaybookCurator 负责 Playbook 知识库的质量管理，包括去重、归档、清理和优化。该模块实现了 Playbook 的生命周期管理和质量控制机制。移除 PlaybookCurator 后，Playbook 知识库将不再进行质量管理。

**职责描述**：Playbook 知识库的质量管理，实现去重、归档、清理和优化等质量控制机制。

**影响范围**：Playbook 知识库质量管理功能将移除。现有 Playbook 数据需要清理或归档。

**移除优先级**：中，Playbook 系统的辅助功能。

#### 3.3.5 PlaybookSynthesizer

PlaybookSynthesizer 负责自动提炼和生成 Playbook，从对话历史中学习并生成新的 Playbook。该模块实现了基于机器学习的 Playbook 自动生成逻辑。移除 PlaybookSynthesizer 后，Playbook 自动提炼功能将移除。

**职责描述**：基于对话历史的 Playbook 自动提炼和生成，使用机器学习算法从历史经验中学习并生成新的 Playbook。

**影响范围**：Playbook 自动提炼和生成功能将移除。相关机器学习模型和训练数据需要清理。

**移除优先级**：中，Playbook 系统的高级功能。

### 3.4 轨迹和反思模块

#### 3.4.1 轨迹记录功能

轨迹记录功能负责记录对话过程中的推理轨迹，包括决策点、思考过程、执行步骤等信息。该功能是 ACE 框架的重要组成部分，支持反思和学习能力。移除轨迹记录功能后，对话过程将不再记录详细的推理轨迹。

**职责描述**：对话推理轨迹的完整记录，包括决策点、思考过程、执行步骤和结果反馈，支持轨迹回溯和分析。

**影响范围**：推理轨迹记录功能将移除。相关的存储表和查询接口需要清理。

**移除优先级**：高，ACE 框架核心功能。

#### 3.4.2 反思周期机制

反思周期机制实现了 ACE 框架的反思能力，在对话过程中定期进行反思分析，总结经验教训并调整策略。该机制包括反思触发、反思分析和策略调整三个阶段。移除反思周期机制后，对话过程将不再进行反思分析。

**职责描述**：对话过程中的周期性反思分析，包括反思触发条件、反思分析和策略调整，实现持续学习和改进。

**影响范围**：反思分析功能将移除。相关的配置和状态管理需要清理。

**移除优先级**：高，ACE 框架核心功能。

#### 3.4.3 WorldModel 更新功能

WorldModel 更新功能负责维护和更新 ACE 的世界模型，该模型包含了系统对环境和任务的理解。WorldModel 支持自适应调整和经验积累。移除 WorldModel 更新功能后，系统将不再维护和更新世界模型。

**职责描述**：ACE 世界模型的生命周期管理，包括模型创建、更新、持久化和加载，支持自适应调整和经验积累。

**影响范围**：世界模型功能将移除。相关的模型存储和更新逻辑需要清理。

**移除优先级**：高，ACE 框架核心功能。

#### 3.4.4 StrategicContextManager

StrategicContextManager 负责管理战略上下文，包括战略目标、约束条件和优先级等信息。该模块与 AceStrategyManager 紧密配合，实现战略级别的上下文管理。移除 StrategicContextManager 后，战略上下文管理功能将移除。

**职责描述**：战略级别的上下文管理，包括战略目标、约束条件、优先级设置和状态维护，支持策略决策。

**影响范围**：战略上下文管理功能将移除。相关的上下文类型和接口需要清理。

**移除优先级**：高，与 AceStrategyManager 深度耦合。

---

## 4. 保留模块清单

### 4.1 LLM 调用能力模块

#### 4.1.1 LLMManager

LLMManager 是 LLM 调用的核心管理器，采用适配器模式统一管理多个 LLM 提供商。该模块负责适配器的创建、选择和生命周期管理，支持动态配置和热切换。保留 LLMManager 的核心职责不变，继续作为 LLM 能力对外暴露的统一入口。

**保留职责**：多 LLM 提供商的适配器管理，包括 OpenAI、Claude、DeepSeek、Zhipu、Ollama 和 Custom 提供商。负责适配器的创建、选择、配置和错误处理。提供统一的 chat 和 streamChat 接口。

**职责变化**：不再通过 AceIntegrator 调用，改为直接由 ChatService 或策略层调用。配置管理保持不变。

**依赖关系**：依赖 LLMConfigService 获取提供商配置，依赖各具体 Adapter 执行实际的 LLM 调用。

#### 4.1.2 多模型适配器

多模型适配器包括 OpenAIAdapter、ClaudeAdapter、DeepSeekAdapter、ZhipuAdapter、OllamaAdapter 和 CustomAdapter 六个具体实现。每个适配器负责与对应 LLM 提供商的 API 交互，实现请求转换和响应解析。所有适配器保持不变，继续提供稳定的 LLM 调用能力。

**保留职责**：各适配器负责与对应提供商 API 的交互，包括请求构建、错误处理和响应解析。

**职责变化**：无变化，适配器层保持独立和稳定。

**依赖关系**：各适配器依赖 LLMManager 的统一接口，依赖 HTTP 客户端进行网络请求。

### 4.2 工具执行能力模块

#### 4.2.1 ToolDispatcher

ToolDispatcher 是工具调度的核心分发器，负责解析工具调用请求并将请求分发到对应的执行器。该模块实现了工具类型的识别、参数的解析和执行器的选择逻辑。保留 ToolDispatcher 的核心职责不变。

**保留职责**：工具请求的解析和分发，识别工具类型（skill、mcp、builtin），解析工具参数，选择并调用对应的执行器。

**职责变化**：无变化，工具调度是系统的核心能力之一。

**依赖关系**：依赖 UnifiedToolManager 获取工具定义，依赖各执行器执行具体工具调用。

#### 4.2.2 UnifiedToolManager

UnifiedToolManager 负责管理所有可用工具的定义和元数据，提供工具的注册、发现和检索能力。该模块维护工具的完整生命周期，支持工具的动态加载和卸载。保留 UnifiedToolManager 的核心职责不变。

**保留职责**：工具定义和元数据的管理，提供工具注册、发现、检索和生命周期管理能力。

**职责变化**：无变化，工具管理是系统的基础能力之一。

**依赖关系**：依赖 SkillManager 获取技能工具，依赖 MCPIntegrationService 获取 MCP 工具。

#### 4.2.3 工具执行器

工具执行器包括 BuiltInExecutor（内置工具执行器）和 SkillsSandboxExecutor（技能沙箱执行器）。内置工具执行器负责执行 vector-search、read-file、write-file 等系统内置工具。技能沙箱执行器负责在隔离环境中执行用户技能。所有执行器保持不变。

**保留职责**：各类工具的具体执行逻辑，内置工具执行器处理系统内置工具，技能沙箱执行器处理用户定义技能。

**职责变化**：无变化，执行器层保持独立和稳定。

**依赖关系**：执行器依赖 ToolDispatcher 的调用，依赖对应的工具定义和配置。

### 4.3 基础服务模块

#### 4.3.1 ConversationHistoryService

ConversationHistoryService 负责对话历史的存储和检索，提供消息的添加、查询和删除能力。该服务使用 SQLite 持久化存储对话历史，支持分页查询和搜索功能。保留 ConversationHistoryService 的核心职责不变，作为基础对话记录服务继续使用。

**保留职责**：对话历史的持久化存储和检索，提供消息的增删改查能力，支持分页、搜索和历史摘要。

**职责变化**：不再参与 ACE 上下文的构建，改为纯粹的存储和检索服务。

**依赖关系**：依赖 SQLite 数据库存储，依赖 LLMConfigService 的数据库连接配置。

#### 4.3.2 ToolRetrievalService

ToolRetrievalService 负责工具的向量检索，使用 LanceDB 实现语义搜索能力。该服务提供工具的索引构建、相似度搜索和结果排序功能。保留 ToolRetrievalService 的核心职责不变，作为工具发现服务继续使用。

**保留职责**：工具的向量检索和语义搜索，构建和维护工具索引，提供相似度搜索和结果排序能力。

**职责变化**：无变化，向量检索是工具发现的核心能力之一。

**依赖关系**：依赖 LanceDB 进行向量存储和检索，依赖 EmbeddingGenerator 生成嵌入向量。

#### 4.3.3 SearchEngine

SearchEngine 是向量搜索的具体实现，封装了检索逻辑和结果处理。该模块实现了查询构建、搜索执行和结果格式化功能。保留 SearchEngine 的核心职责不变。

**保留职责**：向量搜索的逻辑实现，包括查询构建、搜索执行、结果格式化和相关性排序。

**职责变化**：无变化，搜索逻辑保持独立和稳定。

**依赖关系**：依赖 ToolRetrievalService 的调用，依赖 LanceDBConnection 进行数据库操作。

#### 4.3.4 SkillManager

SkillManager 负责技能的生命周期管理，包括技能的安装、卸载、索引和发现。该模块维护技能仓库，支持技能的动态加载和热更新。保留 SkillManager 的核心职责不变，作为技能管理服务继续使用。

**保留职责**：技能的生命周期管理，包括安装、卸载、索引和发现，维护技能仓库和元数据。

**职责变化**：无变化，技能管理是系统的基础能力之一。

**依赖关系**：依赖文件系统访问技能代码，依赖 ToolRetrievalService 索引技能工具。

#### 4.3.5 MCPIntegrationService

MCPIntegrationService 负责 MCP 服务器的管理，包括服务器的连接、状态监控和工具同步。该模块实现了 MCP 协议的处理逻辑，支持多服务器的并发管理。保留 MCPIntegrationService 的核心职责不变。

**保留职责**：MCP 服务器的生命周期管理，包括连接、断开、状态监控和工具同步，处理 MCP 协议通信。

**职责变化**：无变化，MCP 集成是系统的重要能力之一。

**依赖关系**：依赖 MCP SDK 进行协议处理，依赖 ToolDispatcher 进行工具分发。

### 4.4 核心引擎模块

#### 4.4.1 ReActStrategy

ReActStrategy 实现了 ReAct（Reasoning and Acting）推理策略，支持多轮思考和工具调用。该策略通过交替进行推理和执行来逐步解决问题。保留 ReActStrategy 的核心职责不变，作为主要的推理策略继续使用。

**保留职责**：ReAct 推理策略的实现，支持多轮思考和工具调用，管理推理循环和迭代控制。

**职责变化**：不再通过 AceStrategyManager 调用，改为由 ChatService 直接选择和调用。

**依赖关系**：依赖 LLMManager 进行推理，依赖 ToolDispatcher 执行工具，依赖 ConversationHistoryService 管理对话历史。

#### 4.4.2 SingleRoundStrategy

SingleRoundStrategy 实现了单轮推理策略，适用于简单的对话场景或需要快速响应的场景。该策略不进行多轮迭代，直接生成最终响应。保留 SingleRoundStrategy 的核心职责不变，作为备选推理策略继续使用。

**保留职责**：单轮推理策略的实现，直接生成响应，不进行多轮迭代，适合简单场景和快速响应需求。

**职责变化**：不再通过 AceStrategyManager 调用，改为由 ChatService 直接选择和调用。

**依赖关系**：依赖 LLMManager 进行推理，依赖 ConversationHistoryService 管理对话历史。

---

## 5. 关键逻辑指导

### 5.1 简化后的 ChatService 编排逻辑

#### 5.1.1 设计思路

简化后的 ChatService 直接承担协调者的角色，负责协调消息接收、工具检索、LLM 调用、工具执行和结果返回的完整流程。ChatService 根据配置选择使用 ReActStrategy 或 SingleRoundStrategy，并将策略执行结果转换为标准格式返回给客户端。原有的 ACE 编排层被完全移除，ChatService 与底层引擎之间建立直接的调用关系。

这种简化带来了显著的优势：首先，调用链路大幅缩短，减少了中间层的性能开销；其次，系统复杂度降低，可维护性显著提升；第三，调试和问题定位变得更加容易，因为调用关系更加清晰；最后，系统的响应延迟降低，用户体验得到改善。

#### 5.1.2 核心流程

简化后的 ChatService 核心流程包含以下关键步骤：

**第一步：消息接收与验证**
- 接收来自 ChatController 的聊天请求
- 进行基础的输入验证和清理
- 解析请求参数，提取消息内容、对话 ID 和配置选项

**第二步：会话管理**
- 检查对话历史是否存在
- 获取或创建会话上下文
- 加载对话历史用于后续处理

**第三步：工具检索**
- 根据用户消息使用 ToolRetrievalService 进行工具检索
- 构建工具描述列表供 LLM 参考
- 将检索结果注入到系统消息中

**第四步：策略选择**
- 根据请求配置选择推理策略（ReActStrategy 或 SingleRoundStrategy）
- 初始化策略执行所需的上下文
- 设置超时控制和迭代限制

**第五步：策略执行**
- 调用选定的策略执行推理
- 策略内部管理 LLM 调用和工具执行
- 收集执行过程中的中间结果

**第六步：历史存储**
- 将用户消息和助手响应保存到对话历史
- 更新会话元数据
- 清理过期的历史记录（如需要）

**第七步：结果返回**
- 将执行结果转换为标准响应格式
- 处理流式响应和非流式响应
- 返回结果给 ChatController

#### 5.1.3 代码结构指导

ChatService 的简化重构应遵循以下结构指导：

**主服务类（ChatService）**
- 负责整体流程协调，不包含具体执行逻辑
- 包含策略选择逻辑，根据配置选择 ReActStrategy 或 SingleRoundStrategy
- 包含会话管理逻辑，处理对话历史的加载和保存
- 包含工具检索协调，调用 ToolRetrievalService 获取工具列表

**消息处理器（MessageProcessor）**
- 负责消息的预处理和后处理
- 实现变量解析和注入逻辑
- 实现消息清理和格式化逻辑

**会话协调器（SessionCoordinator）**
- 负责会话生命周期管理
- 处理会话的创建、恢复和结束
- 管理会话级别的状态和配置

**流式处理器（StreamHandler）**
- 负责流式响应的处理和传输
- 实现 SSE（Server-Sent Events）格式的流式输出
- 处理流式响应中的工具调用回调

### 5.2 策略层调用指导

#### 5.2.1 策略接口抽象

保留 ChatStrategy 接口作为所有策略的统一抽象，接口定义保持不变：

```typescript
interface ChatStrategy {
  execute(context: StrategyContext): Promise<StrategyResult>;
  getStrategyType(): StrategyType;
  validateConfig(): boolean;
}
```

所有策略实现必须实现 execute 方法，该方法接收 StrategyContext 作为输入，返回 StrategyResult 作为输出。策略类型用于标识策略的种类，validateConfig 方法用于验证策略配置的有效性。

#### 5.2.2 ReActStrategy 适配

ReActStrategy 需要进行适配以直接响应 ChatService 的调用。适配内容包括：移除对 AceIntegrator 的依赖，改为直接调用 LLMManager 和 ToolDispatcher；简化上下文管理，使用 ConversationHistoryService 直接管理对话历史；调整工具调用流程，确保工具执行结果正确返回给 LLM。

ReActStrategy 的核心执行流程保持不变：初始化对话历史，循环进行推理和执行，处理工具调用和观察结果，生成最终响应并返回。

#### 5.2.3 SingleRoundStrategy 适配

SingleRoundStrategy 需要进行适配以直接响应 ChatService 的调用。适配内容包括：移除对 AceIntegrator 的依赖，改为直接调用 LLMManager；简化上下文管理，使用 ConversationHistoryService 直接管理对话历史。

SingleRoundStrategy 的核心执行流程保持不变：构建消息列表，调用 LLM 生成响应，保存对话历史，返回响应结果。

### 5.3 API 接口兼容性指导

#### 5.3.1 REST API 兼容性

所有 REST API 接口的行为必须保持 100% 一致，包括：请求参数格式和验证规则，响应数据格式和字段，错误码和错误消息，以及超时和限流行为。ChatController 层的代码基本不需要修改，只需调整内部调用的服务层逻辑。

#### 5.3.2 WebSocket API 兼容性

所有 WebSocket API 接口的行为必须保持 100% 一致，包括：消息格式和协议，连接管理和心跳机制，流式传输逻辑，以及断开连接处理。WebSocket 层的代码基本不需要修改，只需调整内部调用的 ChatService 逻辑。

#### 5.3.3 SDK 兼容性

所有客户端 SDK 必须能够继续正常工作，包括：Python SDK、Node.js SDK、Go SDK 等。SDK 与服务器的通信协议保持不变，API 端点保持不变，响应格式保持不变。

### 5.4 配置兼容性指导

#### 5.4.1 配置项处理

对于 ACE 相关的配置项，采取以下处理策略：ACE 启用开关（ace.enabled）将被标记为废弃，忽略该配置项的值并记录废弃警告；ACE 相关参数（ace.*）将被标记为废弃，忽略这些配置项的值并记录废弃警告；伦理审查开关（ethics.enabled）将被标记为废弃，相关功能降级为基础验证；上下文压缩配置（compression.*）将被标记为废弃，忽略这些配置项的值。

系统将在启动时检测到这些废弃配置项的存在，并输出相应的警告日志，提示用户这些配置项已不再生效，可以在后续版本中移除。

#### 5.4.2 默认配置更新

系统的默认配置需要更新以反映简化后的架构。移除 ACE 相关配置项后，默认配置文件中不再包含这些配置项。对于仍然有效的配置项，保持原有的默认值不变。新的默认配置应反映简化后系统的典型使用场景。

---

## 6. 数据迁移说明

### 6.1 需要保留的数据

#### 6.1.1 LLM 配置数据

以下数据需要保留，继续存储在 SQLite 数据库中：LLM 提供商配置（提供商名称、API 密钥、基础 URL 等），模型配置（模型名称、最大 token 数、温度参数等），以及提供商与模型的关联关系。这些数据存储在 llm_providers.db 数据库中，不受 ACE 剔除影响。

#### 6.1.2 对话历史数据

以下数据需要保留，继续存储在 SQLite 数据库中：会话元数据（会话 ID、创建时间、最后活动时间等），对话消息（消息内容、角色、时间戳等），以及消息与会话的关联关系。这些数据存储在 conversation_history.db 数据库中，不受 ACE 剔除影响。

#### 6.1.3 工具索引数据

以下数据需要保留，继续存储在 LanceDB 中：工具定义和元数据（工具名称、描述、参数等），工具嵌入向量，以及工具与类型的关联关系。这些数据存储在 skills.lance 数据库中，不受 ACE 剔除影响。

#### 6.1.4 MCP 服务器配置数据

以下数据需要保留，继续存储在 SQLite 数据库中：MCP 服务器配置（服务器名称、端点配置、认证信息等），以及服务器状态和连接信息。这些数据存储在 llm_providers.db 数据库中，不受 ACE 剔除影响。

### 6.2 需要删除的数据

#### 6.2.1 Playbook 相关数据

所有 Playbook 相关数据需要删除，包括：Playbook 定义（Playbook 内容、触发条件、执行逻辑等），Playbook 版本历史，Playbook 使用统计，以及 Playbook 元数据。这些数据通常存储在 SQLite 数据库的 playbook 相关表中。

删除 Playbook 数据需要进行以下操作：识别并删除所有 Playbook 相关的数据库表，清空 Playbook 文件存储目录（如 playbook_definitions 目录），以及清理 LanceDB 中的 Playbook 索引数据。

#### 6.2.2 轨迹记录数据

所有轨迹记录数据需要删除，包括：推理轨迹记录（决策点、思考过程等），执行步骤记录，以及轨迹分析结果。这些数据通常存储在 SQLite 数据库的 trace 相关表中。

删除轨迹记录数据需要进行以下操作：识别并删除所有轨迹相关的数据库表，清空轨迹文件存储目录（如 traces 目录）。

#### 6.2.3 WorldModel 数据

所有 WorldModel 数据需要删除，包括：世界模型定义，模型状态和参数，以及模型训练数据。这些数据通常存储在 SQLite 数据库的 world_model 相关表中。

删除 WorldModel 数据需要进行以下操作：识别并删除所有 WorldModel 相关的数据库表。

#### 6.2.4 上下文压缩状态数据

所有上下文压缩状态数据需要删除，包括：压缩历史记录，压缩策略配置状态，以及压缩统计信息。这些数据通常存储在 SQLite 数据库的 compression 相关表中。

删除上下文压缩状态数据需要进行以下操作：识别并删除所有压缩相关的数据库表。

### 6.3 数据库 Schema 变更

#### 6.3.1 需要删除的表

ACE 功能剔除后，以下数据库表需要删除（如果存在）：

**Playbook 相关表**
- playbooks：Playbook 主表
- playbook_versions：Playbook 版本历史
- playbook_usage_stats：Playbook 使用统计
- playbook_curation_queue：Playbook 整理队列

**轨迹记录相关表**
- reasoning_traces：推理轨迹记录
- execution_steps：执行步骤记录
- trace_analytics：轨迹分析结果

**WorldModel 相关表**
- world_models：世界模型定义
- world_model_states：模型状态
- world_model_training_data：训练数据

**上下文压缩相关表**
- compression_history：压缩历史
- compression_stats：压缩统计
- token_usage_records：Token 使用记录

**ACE 配置相关表**
- ace_configurations：ACE 配置
- ace_strategy_registry：策略注册表
- ace_context_states：上下文状态

#### 6.3.2 需要修改的表

以下数据库表需要修改以移除 ACE 相关字段：

**会话表**
- 移除字段：ace_context_id、strategic_context_id、world_model_version
- 移除字段：trajectory_enabled、compression_enabled

**消息表**
- 移除字段：ace_metadata、trajectory_data
- 移除字段：compression_info

#### 6.3.3 迁移脚本

需要编写数据库迁移脚本来执行以下操作：

**第一步：备份数据**
- 在执行任何修改前，备份整个数据库文件
- 记录当前数据库状态用于回滚

**第二步：删除 Playbook 数据**
- 删除所有 Playbook 相关表
- 验证删除结果

**第三步：删除轨迹数据**
- 删除所有轨迹相关表
- 验证删除结果

**第四步：删除 WorldModel 数据**
- 删除所有 WorldModel 相关表
- 验证删除结果

**第五步：删除压缩数据**
- 删除所有压缩相关表
- 验证删除结果

**第六步：修改会话表**
- 移除 ACE 相关字段
- 验证修改结果

**第七步：修改消息表**
- 移除 ACE 相关字段
- 验证修改结果

**第八步：验证完整性**
- 检查数据库完整性
- 运行验证查询确认数据一致性

---

## 7. 验收标准

### 7.1 代码质量标准

#### 7.1.1 TypeScript 编译标准

ACE 功能剔除后，TypeScript 编译必须通过且无任何错误或警告。具体要求包括：移除所有对已删除模块的引用；更新所有导入路径以反映新的目录结构；消除所有由于模块移除导致的类型错误；确保新代码使用正确的类型定义，不使用 any 类型（除非有明确的业务理由）；编译命令（npm run build）必须成功执行且无输出。

#### 7.1.2 代码覆盖率标准

单元测试覆盖率需要达到以下标准：核心模块（ChatService、策略层、核心引擎）的行覆盖率不低于 80%；分支覆盖率不低于 70%；函数覆盖率不低于 85%；关键路径的覆盖率必须达到 100%，包括聊天流程、工具执行流程和错误处理流程。

#### 7.1.3 代码规范标准

代码需要符合项目的代码规范标准：ESLint 检查必须通过（npm run lint）；Prettier 格式化必须通过（npm run format:check）；文件命名符合项目规范；注释完整且有意义；代码结构清晰，职责分明。

### 7.2 功能测试标准

#### 7.2.1 API 接口测试

所有 API 接口需要进行端到端测试，确保行为 100% 一致：

**聊天接口测试（POST /v1/chat/completions）**
- 测试简单对话场景
- 测试多轮对话场景
- 测试工具调用场景
- 测试流式响应场景
- 测试错误处理场景

**提供商管理接口测试（GET/POST /api/llm/providers/*）**
- 测试提供商列表查询
- 测试提供商创建
- 测试提供商更新
- 测试提供商删除

**模型管理接口测试（GET/POST /api/llm/models/*）**
- 测试模型列表查询
- 测试模型配置更新

**会话管理接口测试（GET/POST /api/sessions/*）**
- 测试会话创建
- 测试会话查询
- 测试会话删除

#### 7.2.2 核心功能测试

核心对话功能和工具执行功能需要 100% 正常：

**对话功能测试**
- 验证单轮对话正常响应
- 验证多轮对话上下文正确传递
- 验证不同策略（ReAct/SingleRound）正常工作
- 验证流式响应正常输出
- 验证 WebSocket 连接正常通信

**工具执行测试**
- 验证内置工具（vector-search、read-file、write-file）正常执行
- 验证 Skill 工具正常执行
- 验证 MCP 工具正常执行
- 验证工具参数传递正确
- 验证工具执行结果正确返回

#### 7.2.3 向后兼容性测试

确保向后兼容性，测试现有功能不受影响：

**配置兼容性测试**
- 验证旧配置文件能够正常加载
- 验证废弃配置项正确处理
- 验证默认配置正确应用

**数据兼容性测试**
- 验证现有对话历史能够正确加载
- 验证现有工具索引能够正确使用
- 验证现有 MCP 服务器配置能够正确连接

**客户端兼容性测试**
- 验证现有客户端 SDK 能够正常工作
- 验证现有集成能够正常运行

### 7.3 性能测试标准

#### 7.3.1 响应时间标准

简化后的系统响应时间应满足以下标准：简单对话请求（无工具调用）的平均响应时间不超过 2 秒；工具调用请求的平均响应时间取决于工具执行时间，但系统开销不超过 500 毫秒；流式响应的首 token 延迟不超过 1 秒；并发请求处理能力不低于每秒 100 个请求。

#### 7.3.2 资源使用标准

系统资源使用应满足以下标准：内存使用在空闲状态下不超过 512 MB；CPU 使用在峰值负载下不超过 80%；数据库连接池使用不超过配置的连接数限制；向量检索的内存占用在可接受范围内。

### 7.4 集成测试标准

#### 7.4.1 服务集成测试

所有服务之间的集成需要验证：

**ChatService 与 LLMManager 集成**
- 验证 LLM 调用正确执行
- 验证响应正确解析和返回
- 验证错误正确处理和传播

**ChatService 与 ToolRetrievalService 集成**
- 验证工具检索正确执行
- 验证检索结果正确格式化
- 验证检索结果正确注入上下文

**ChatService 与策略层集成**
- 验证策略选择正确执行
- 验证策略执行正确完成
- 验证策略结果正确返回

**策略层与工具执行集成**
- 验证工具调用正确执行
- 验证观察结果正确返回
- 验证迭代控制正确工作

#### 7.4.2 数据库集成测试

所有数据库操作需要验证：

**SQLite 集成测试**
- 验证 LLM 配置读写正确
- 验证对话历史读写正确
- 验证会话管理正确

**LanceDB 集成测试**
- 验证工具索引正确
- 验证向量检索正确
- 验证索引更新正确

### 7.5 安全测试标准

#### 7.5.1 输入验证测试

输入验证需要满足以下标准：所有用户输入必须经过验证和清理；SQL 注入尝试必须被正确阻止；XSS 攻击尝试必须被正确阻止；恶意输入必须返回适当的错误响应。

#### 7.5.2 认证授权测试

认证授权需要满足以下标准：未认证请求必须被正确拒绝；越权访问尝试必须被正确阻止；认证令牌验证必须正确工作；授权检查必须正确执行。

#### 7.5.3 数据保护测试

数据保护需要满足以下标准：敏感数据（如 API 密钥）不能出现在日志中；数据传输必须使用适当的加密；数据存储必须符合安全要求；数据访问必须有适当的审计日志。

---

## 8. 实施计划

### 8.1 实施阶段划分

ACE 功能剔除分为以下五个阶段实施：

**第一阶段：代码分析阶段**
- 分析所有 ACE 相关代码的依赖关系
- 识别需要修改的文件和函数
- 制定详细的修改计划
- 预计耗时：1 天

**第二阶段：核心模块移除阶段**
- 移除 AceCore、AceService、AceIntegrator
- 移除 AceStrategyManager、AceStrategyOrchestrator
- 更新 ChatService 核心逻辑
- 预计耗时：3 天

**第三阶段：辅助模块移除阶段**
- 移除上下文压缩模块
- 移除 Playbook 系统模块
- 移除轨迹和反思模块
- 预计耗时：2 天

**第四阶段：集成测试阶段**
- 执行单元测试
- 执行集成测试
- 执行端到端测试
- 修复发现的问题
- 预计耗时：3 天

**第五阶段：数据迁移阶段**
- 执行数据库迁移脚本
- 验证数据完整性
- 更新配置和文档
- 预计耗时：1 天

### 8.2 回滚计划

如果 ACE 功能剔除过程中发现问题，需要执行回滚操作：

**回滚策略**
- 代码回滚：使用 Git 恢复到修改前的状态
- 数据库回滚：使用备份的数据库文件恢复数据
- 配置回滚：使用备份的配置文件恢复配置

**回滚触发条件**
- TypeScript 编译失败且无法在合理时间内修复
- 核心功能测试失败且无法在合理时间内修复
- 生产环境出现严重问题

**回滚执行步骤**
- 停止服务
- 恢复代码
- 恢复数据库（如需要）
- 启动服务
- 验证服务正常

---

## 9. 附录

### 9.1 术语表

| 术语 | 定义 |
|------|------|
| ACE | Adaptive Cognitive Engine，自适应认知引擎 |
| ReAct | Reasoning and Acting，推理和行动相结合的策略 |
| Playbook | 预定义的对话模式或任务模板 |
| LanceDB | 向量数据库，用于工具的语义搜索 |
| SQLite | 嵌入式数据库，用于存储配置和对话历史 |
| MCP | Model Context Protocol，模型上下文协议 |

### 9.2 参考文档

| 文档名称 | 路径 |
|----------|------|
| 需求文档 | docs/requirements/04-ACE功能剔除.md |
| 架构设计文档 | docs/architecture-design/总体架构设计.md |
| 代码库 | src/services/、src/strategies/、src/core/ |

---

> 文档版本 v1.0.0：初始版本，完成 ACE 功能剔除的功能设计。
