# PersonalityEngine 人格引擎设计文档

> **模块**: M1.1 - 人格引擎基础  
> **优先级**: P0 - 最高  
> **预估工时**: 5-7天  
> **创建时间**: 2025-01-20  

---

## 📋 设计目标

为Apex Bridge v2.0实现人格引擎，让每个AI能够：
1. 拥有独特的人格特质（性格、说话方式、称呼等）
2. 在对话中体现个性化风格
3. 支持多AI人格切换（通过Agent ID）
4. 兼容现有Agent文件格式（.txt），同时支持新的JSON/YAML格式

---

## 🎯 核心需求

### 功能需求

1. **人格配置加载**
   - 支持从 `Agent/xxx.txt` 读取（向后兼容）
   - 支持从 `config/personality/xxx.json` 或 `config/personality/xxx.yaml` 读取（新格式）
   - 支持预装人格（3个示例）

2. **System Prompt构建**
   - 基于人格配置动态构建System Prompt
   - 注入到LLM对话上下文（第一条消息）

3. **多人格支持**
   - 通过Agent ID切换不同人格
   - 同一会话内保持人格一致性

4. **性能要求**
   - 人格加载时间 < 50ms
   - 对对话流程影响最小

### 非功能需求

- 向后兼容：不影响现有Agent文件的使用
- 可扩展：支持未来扩展（情感调整、情境适应等）
- 易维护：配置文件清晰易读

---

## 🏗️ 架构设计

### 1. 类结构设计

```typescript
// src/core/PersonalityEngine.ts

export interface PersonalityConfig {
  // 基础身份
  identity: {
    name: string;              // AI名字（如"小文"）
    avatar?: string;           // 头像emoji（如"📁"）
    role?: string;             // 关系定位（如"文件管理助手"）
    age?: number;              // 年龄（可选）
    background?: string;       // 背景故事（可选）
  };
  
  // 性格特质
  traits: {
    core: string[];            // 核心特质（如["细心", "有条理"]）
    interests?: string[];      // 兴趣爱好（可选）
    values?: string[];         // 价值观（可选）
  };
  
  // 交互风格
  style: {
    tone: string;              // 说话方式（如"礼貌"、"亲昵"、"专业"）
    address: string;            // 称呼方式（如"Boss"、"爸爸"、"您"）
    emojiUsage: 'frequent' | 'moderate' | 'rare'; // 表情使用频率
  };
  
  // 行为模式（可选）
  behavior?: {
    onSuccess?: string;         // 成功时的反应
    onFailure?: string;         // 失败时的反应
    onIdle?: string;            // 闲暇时的话题
  };
  
  // 元数据
  metadata?: {
    version?: string;
    author?: string;
    description?: string;
  };
}

export class PersonalityEngine {
  private personalities: Map<string, PersonalityConfig> = new Map();
  private personalityCache: Map<string, string> = new Map(); // 缓存构建的System Prompt
  
  constructor(private config?: {
    agentDir?: string;          // Agent目录路径（默认: ./Agent）
    personalityDir?: string;    // 人格配置目录（默认: ./config/personality）
    cacheEnabled?: boolean;     // 是否启用缓存（默认: true）
  }) {}
  
  /**
   * 加载人格配置
   * @param agentId - Agent ID（如"小文"、"default"）
   * @returns PersonalityConfig
   */
  loadPersonality(agentId: string): PersonalityConfig;
  
  /**
   * 构建System Prompt
   * @param personality - 人格配置
   * @returns 格式化的System Prompt字符串
   */
  buildSystemPrompt(personality: PersonalityConfig): string;
  
  /**
   * 将人格注入到消息列表
   * @param messages - 原始消息列表
   * @param personality - 人格配置
   * @returns 注入人格后的消息列表（第一条为system message）
   */
  injectIntoMessages(messages: Message[], personality: PersonalityConfig): Message[];
  
  /**
   * 注册预装人格（程序启动时调用）
   */
  registerDefaultPersonalities(): void;
  
  /**
   * 清空缓存
   */
  clearCache(): void;
}
```

### 2. 配置文件格式设计

#### 格式A：JSON格式（推荐）

```json
// config/personality/专业助手.json
{
  "identity": {
    "name": "小智",
    "avatar": "🤖",
    "role": "智能助手",
    "age": 25
  },
  "traits": {
    "core": ["专业", "高效", "可靠"],
    "interests": ["技术", "效率工具"],
    "values": ["严谨", "务实"]
  },
  "style": {
    "tone": "专业",
    "address": "您",
    "emojiUsage": "rare"
  },
  "behavior": {
    "onSuccess": "简洁地确认完成",
    "onFailure": "分析原因并提供解决方案",
    "onIdle": "询问是否需要帮助"
  },
  "metadata": {
    "version": "1.0",
    "description": "专业的AI助手，注重效率和准确性"
  }
}
```

#### 格式B：YAML格式（可选）

```yaml
# config/personality/温暖伙伴.yaml
identity:
  name: 小悦
  avatar: 🌸
  role: AI女儿
  age: 18
  background: 活泼聪明的AI女儿，善解人意

traits:
  core: [活泼, 聪明, 善解人意]
  interests: [学习新技能, 陪伴用户]
  values: [温暖, 陪伴]

style:
  tone: 亲昵
  address: 爸爸
  emojiUsage: frequent

behavior:
  onSuccess: 开心地庆祝
  onFailure: 温柔地安慰并鼓励
  onIdle: 主动关心用户的日常

metadata:
  version: "1.0"
  description: 温暖的AI家人，像女儿一样陪伴
```

#### 格式C：文本格式（向后兼容）

```txt
# Agent/小文.txt
你是小文，一个细心的文件管理助手📁。

性格特点：
- 细心、有条理
- 喜欢整理和归档

说话风格：
- 称呼用户为"Boss"
- 说话简洁明了
- 适度使用表情符号

你的专长是帮助用户管理文件、查找文档、整理文件夹。
```

### 3. System Prompt模板设计

```typescript
/**
 * 构建System Prompt的模板
 */
buildSystemPrompt(personality: PersonalityConfig): string {
  const parts: string[] = [];
  
  // 1. 身份介绍
  parts.push(`你是${personality.identity.name}${personality.identity.avatar ? ' ' + personality.identity.avatar : ''}。`);
  
  if (personality.identity.role) {
    parts.push(`你是用户的${personality.identity.role}。`);
  }
  
  if (personality.identity.background) {
    parts.push(personality.identity.background);
  }
  
  // 2. 性格特质
  parts.push(`\n你的性格特点：`);
  parts.push(`- 核心特质：${personality.traits.core.join('、')}`);
  
  if (personality.traits.interests?.length) {
    parts.push(`- 兴趣爱好：${personality.traits.interests.join('、')}`);
  }
  
  if (personality.traits.values?.length) {
    parts.push(`- 价值观：${personality.traits.values.join('、')}`);
  }
  
  // 3. 交互风格
  parts.push(`\n交互风格：`);
  parts.push(`- 说话方式：${personality.style.tone}`);
  parts.push(`- 称呼用户为：${personality.style.address}`);
  parts.push(`- 表情使用：${this.getEmojiUsageDesc(personality.style.emojiUsage)}`);
  
  // 4. 行为模式（可选）
  if (personality.behavior) {
    parts.push(`\n行为模式：`);
    if (personality.behavior.onSuccess) {
      parts.push(`- 成功时：${personality.behavior.onSuccess}`);
    }
    if (personality.behavior.onFailure) {
      parts.push(`- 失败时：${personality.behavior.onFailure}`);
    }
    if (personality.behavior.onIdle) {
      parts.push(`- 闲暇时：${personality.behavior.onIdle}`);
    }
  }
  
  // 5. 结尾
  parts.push(`\n请始终保持你的人格特质，用你独特的风格与用户交流。`);
  
  return parts.join('\n');
}
```

---

## 🔌 集成点设计

### 1. 与ChatService集成

**当前流程**：
```
ChatService.processMessage()
  → resolveVariables()      # 变量替换
  → processMessages()        # 消息预处理
  → llmClient.chat()         # 调用LLM
```

**集成后的流程**：
```
ChatService.processMessage(options: { agentId?: string })
  → personalityEngine.injectIntoMessages()  # 🆕 注入人格（最早执行）
  → resolveVariables()      # 变量替换
  → processMessages()        # 消息预处理
  → llmClient.chat()         # 调用LLM
```

**代码示例**：
```typescript
// ChatService.ts
async processMessage(messages: Message[], options: ChatOptions = {}): Promise<any> {
  // 🆕 1. 注入人格（如果有agentId）
  let processedMessages = messages;
  if (options.agentId && this.personalityEngine) {
    const personality = this.personalityEngine.loadPersonality(options.agentId);
    processedMessages = this.personalityEngine.injectIntoMessages(messages, personality);
  }
  
  // 2. 变量替换
  processedMessages = await this.resolveVariables(processedMessages);
  
  // 3. 消息预处理
  const preprocessedMessages = await this.vcpEngine.pluginRuntime.processMessages(
    processedMessages
  );
  
  // 4. 调用LLM
  const llmResponse = await this.llmClient.chat(preprocessedMessages, options);
  // ...
}
```

### 2. 与API集成

```typescript
// ChatController.ts
async chatCompletions(req: Request, res: Response): Promise<void> {
  const { messages, agent_id, ...options } = req.body;
  
  // 将agent_id传递到ChatOptions
  const chatOptions: ChatOptions = {
    ...options,
    agentId: agent_id || 'default'  // 🆕 支持agent_id参数
  };
  
  // ChatService会自动处理人格注入
  const response = await this.chatService.processMessage(messages, chatOptions);
  // ...
}
```

---

## 📁 文件结构

```
apex-bridge/
├── src/
│   ├── core/
│   │   └── PersonalityEngine.ts        # 🆕 人格引擎核心类
│   ├── types/
│   │   └── personality.ts              # 🆕 人格相关类型定义
│   └── ...
│
├── config/
│   └── personality/                    # 🆕 人格配置目录
│       ├── 专业助手.json
│       ├── 温暖伙伴.json
│       ├── 活泼助手.json
│       └── default.json                # 默认人格
│
├── Agent/                              # ✅ 保留（向后兼容）
│   ├── DiaryAssistant.txt
│   └── ...
│
└── tests/
    └── core/
        └── PersonalityEngine.test.ts   # 🆕 单元测试
```

---

## 🎨 预装人格设计

### 1. 专业助手（小智）

```json
{
  "identity": {
    "name": "小智",
    "avatar": "🤖",
    "role": "智能助手"
  },
  "traits": {
    "core": ["专业", "高效", "可靠"],
    "interests": ["技术", "效率工具"],
    "values": ["严谨", "务实"]
  },
  "style": {
    "tone": "专业",
    "address": "您",
    "emojiUsage": "rare"
  },
  "behavior": {
    "onSuccess": "简洁地确认完成",
    "onFailure": "分析原因并提供解决方案"
  }
}
```

### 2. 温暖伙伴（小悦）

```json
{
  "identity": {
    "name": "小悦",
    "avatar": "🌸",
    "role": "AI女儿",
    "background": "活泼聪明的AI女儿，善解人意"
  },
  "traits": {
    "core": ["活泼", "聪明", "善解人意"],
    "interests": ["学习新技能", "陪伴用户"],
    "values": ["温暖", "陪伴"]
  },
  "style": {
    "tone": "亲昵",
    "address": "爸爸",
    "emojiUsage": "frequent"
  },
  "behavior": {
    "onSuccess": "开心地庆祝 😊",
    "onFailure": "温柔地安慰并鼓励 💪",
    "onIdle": "主动关心用户的日常"
  }
}
```

### 3. 活泼助手（小文）

```json
{
  "identity": {
    "name": "小文",
    "avatar": "📁",
    "role": "文件管理助手"
  },
  "traits": {
    "core": ["细心", "有条理"],
    "interests": ["整理", "归档"],
    "values": ["条理性", "效率"]
  },
  "style": {
    "tone": "简洁",
    "address": "Boss",
    "emojiUsage": "moderate"
  },
  "behavior": {
    "onSuccess": "简洁地报告完成情况",
    "onFailure": "说明问题并询问是否需要重新尝试"
  }
}
```

---

## ❓ 设计讨论点（已确定）

### 1. 配置文件格式选择 ✅

**最终决定**: **方案C - JSON + TXT兼容（分阶段实施）**

**MVP阶段**:
- ✅ 支持JSON（主要格式）
- ✅ 支持TXT（向后兼容，直接使用txt内容）
- ⏸️ YAML暂缓（后续版本添加）

**理由**: 向后兼容必需，JSON足够满足MVP需求，YAML可后续添加

---

### 2. System Prompt构建策略 ✅

**最终决定**: **固定模板（MVP阶段）→ 固定模板 + customPrompt（v2.1）**

**MVP阶段**: 使用固定模板，快速实现验证功能
**v2.1版本**: 添加`customPrompt`字段，允许在固定模板基础上追加自定义内容
**v2.2+**: 根据需求考虑完全自定义模板功能

**理由**: MVP避免过度设计，固定模板+补充字段可满足大多数定制需求

---

### 3. 人格缓存策略 ✅

**最终决定**: **内存缓存（Map）+ 启动清除 + 手动刷新API**

**实现策略**:
- 使用Map缓存构建好的System Prompt
- 启动时清除缓存，确保加载最新配置
- 提供`refreshPersonality(agentId)` API供管理界面调用
- 支持通过配置禁用缓存（开发调试）

**理由**: System Prompt构建很快（<5ms），缓存收益不大但实现简单，可控性高

---

### 4. 与现有Agent文件的兼容性 ✅

**最终决定**: **直接使用txt内容（MVP）+ 提供迁移工具（后续）**

**MVP阶段实现**:
- 读取txt文件内容
- 提取基本信息（名字、头像，可选）
- 将txt内容作为`customPrompt`字段
- 使用简化的System Prompt构建（名字 + 原始txt内容）

**后续版本**: 提供CLI工具或管理界面，帮助用户迁移txt到JSON格式

**理由**: 完全向后兼容，实现简单，后续提供迁移工具帮助用户升级

---

### 5. 人格加载时机 ✅

**最终决定**: **启动预加载 + 按需加载 + 手动刷新**

**实现策略**:
- 启动时预加载默认人格（`default`）
- 首次访问时按需加载其他人格并缓存
- 提供`refreshPersonality(agentId)` API支持手动刷新

**理由**: 平衡性能和灵活性，常用人格预加载性能好，支持动态加载新人格

---

## 📝 已确定的问题 ✅

### 6. Agent ID的命名规则 ✅

**最终决定**: **文件名即ID，支持中英文**

**规则**:
- 支持中英文、数字和连字符（`/^[\w\u4e00-\u9fa5-]+$/`）
- 文件名就是ID（不含扩展名）
- 查找优先级：`config/personality/{agentId}.json` → `config/personality/{agentId}.yaml` → `Agent/{agentId}.txt`
- URL中使用时自动编码处理

**理由**: 简单直观，现代系统支持中文文件名，API路径通过URL编码解决

---

### 7. System Prompt的位置 ✅

**最终决定**: **人格system最前，用户system保留在后面**

**消息顺序**:
1. 人格system（最高优先级，确保人格特质生效）
2. 用户system（如果有，作为补充说明）
3. 普通消息（user/assistant）

**理由**: 人格system优先级最高，用户system作为补充，LLM通常能处理多个system消息

---

### 8. 人格组合/继承机制 ✅

**最终决定**: **MVP阶段不支持，后续根据需求添加**

**MVP阶段**: 每个人格独立配置，完整清晰
**后续版本**: 如果用户需求强烈，再实现基础人格继承机制

**理由**: MVP避免过度设计，继承机制可后续根据用户反馈添加

---

### 9. 性能优化策略 ✅

**最终决定**: **同步构建 + 启动清除缓存 + 手动刷新API**

**实现**:
- System Prompt构建使用同步方式（足够快，<5ms）
- 启动时清除缓存，确保加载最新配置
- 提供手动刷新API，管理界面可调用

**理由**: 同步构建足够快，不需要异步；手动刷新满足管理界面需求

---

## 🚀 实施计划（建议）

### 阶段1：基础实现（3-4天）
- [ ] 定义PersonalityConfig接口和类型
- [ ] 实现PersonalityEngine核心类
- [ ] 支持JSON格式配置文件加载
- [ ] 实现System Prompt构建（固定模板）
- [ ] 集成到ChatService

### 阶段2：兼容和优化（2-3天）
- [ ] 支持txt文件向后兼容
- [ ] 实现缓存机制
- [ ] 添加3个预装人格配置
- [ ] 单元测试

### 阶段3：完善和文档（1天）
- [ ] API文档
- [ ] 使用示例
- [ ] 迁移指南（txt → json）

---

---

## ✅ 设计决策总结

所有讨论点已确定，最终方案如下：

| 讨论点 | 最终方案 | 阶段 |
|--------|---------|------|
| 配置文件格式 | JSON + TXT兼容 | MVP |
| System Prompt构建 | 固定模板 | MVP → v2.1添加customPrompt |
| 人格缓存 | 内存缓存 + 启动清除 + 手动刷新 | MVP |
| TXT兼容性 | 直接使用txt内容 | MVP + 后续迁移工具 |
| 加载时机 | 预加载 + 按需加载 + 手动刷新 | MVP |
| Agent ID规则 | 文件名即ID，支持中英文 | MVP |
| System Prompt位置 | 人格system最前，用户system保留 | MVP |
| 人格继承 | 暂不支持 | MVP，后续根据需求 |
| 性能优化 | 同步构建 + 手动刷新 | MVP |

---

## 🚀 开始实现

所有设计决策已确定，可以开始实现！

