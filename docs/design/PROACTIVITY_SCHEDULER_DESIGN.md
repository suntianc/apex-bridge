# ProactivityScheduler 主动性调度系统设计文档

> **文档版本**: v1.0  
> **创建时间**: 2025-11-04  
> **基于**: 记忆与主动性设计.md  
> **状态**: 设计阶段

---

## 📋 文档说明

本文档基于《记忆与主动性设计.md》的完整设计，结合 Apex Bridge 现有架构，制定分阶段实施计划和技术方案。

**设计原则**：
1. **克制、可撤销、可解释** - 不强制打扰，用户可撤销，行为可解释
2. **任务推进型 + 陪伴/启发型** - 兼顾效率和情感
3. **低风险惊喜机制** - 预作业 + 用户确认，避免误操作
4. **分阶段实施** - MVP优先，逐步增强

---

## 1. 总体架构

```
[客户端/渠道] ←→ 触达编排层（Delivery Orchestrator）
                         ↑         ↑
                   主动开场生成   惊喜汇报卡
                         ↑         │
                  决策执行层（Decision Runner）
                 ┌──────────────┬──────────────┐
                 │ 判断/评审层  │  行动/工具层 │
                 └──────────────┴──────────────┘
                     ↑        ↑        ↑
               触发枢纽   记忆服务   政策与守门
                   ↑         │        │
              环境/事件/随机   长短期记忆   频次/时段/预算/权限
```

### 核心组件

* **触发枢纽（Trigger Hub）**：汇聚时间、事件、状态、随机、机会等触发；统一去重/合并/限频。
* **判断/评审层（Evaluation）**：生成候选"微目标（micro-goals）"，按价值/紧迫/努力/不确定/新颖 + 多样性惩罚排序；决定"发/不发""发哪一种"。
* **行动/工具层（Action/Tools）**：执行只读/沙箱工具调用、生成主动开场或惊喜产物（草稿/清单/对照表）。
* **政策与守门（Policy & Guardrails）**：频率、时段、静音、预算、权限白名单、合规审核、熔断降级。
* **记忆服务（Memory Service）**：用户画像、主题直方图、情绪轨迹、偏好画像、惊喜日志、奖励反馈。
* **触达编排层（Delivery Orchestrator）**：将"主动消息/汇报卡"发布到 IM/桌面/Inbox，支持撤销/采纳/稍后。

---

## 2. 分阶段实施计划

### 阶段1：MVP核心（Week 1-2）✅ 必须实现

**目标**：实现基础的主动消息能力

#### 2.1 触发枢纽（简化版）

- ✅ **时间触发**：工作日 09:30、14:30
- ✅ **静音窗**：22:00-08:00（Asia/Taipei时区）
- ✅ **基础去重**：30分钟防抖

**实现**：
```typescript
class TriggerHub {
  private lastTriggerTime: Map<string, number> = new Map();
  private readonly DEBOUNCE_MS = 30 * 60 * 1000; // 30分钟
  
  shouldTrigger(triggerId: string): boolean {
    const now = Date.now();
    const lastTime = this.lastTriggerTime.get(triggerId) || 0;
    if (now - lastTime < this.DEBOUNCE_MS) {
      return false; // 防抖
    }
    this.lastTriggerTime.set(triggerId, now);
    return true;
  }
  
  isInQuietWindow(): boolean {
    // 22:00-08:00 静音窗
    const hour = new Date().getHours();
    return hour >= 22 || hour < 8;
  }
  
  isWorkday(): boolean {
    const day = new Date().getDay();
    return day >= 1 && day <= 5; // 周一到周五
  }
}
```

#### 2.2 判断/评审层（简化版）

- ✅ **基础场景判断**（无需复杂评分）
- ✅ **场景类型**：
  - 每日问候（早安/晚安）
  - 健康提醒（喝水/休息）
  - 关怀提醒（长时间无互动）

**实现**：
```typescript
class EvaluationEngine {
  async evaluateScenes(context: Context): Promise<SceneScore[]> {
    const scenes: SceneScore[] = [];
    
    // 简化版：基于时间和状态判断
    if (this.isMorningTime()) {
      scenes.push({
        sceneId: 'morning_greeting',
        score: 0.8, // 固定高分
        reason: 'morning_time'
      });
    }
    
    if (this.hasLongInactivity(context)) {
      scenes.push({
        sceneId: 'care_reminder',
        score: 0.7,
        reason: 'inactivity'
      });
    }
    
    return scenes.sort((a, b) => b.score - a.score);
  }
  
  shouldAct(score: number): boolean {
    return score >= 0.6; // 简化阈值
  }
}
```

#### 2.3 行动层（简化版）

- ✅ **主动开场生成**（基于PersonalityEngine）
- ❌ **不使用惊喜机制**（后期扩展）

**实现**：
```typescript
class ProactiveMessageGenerator {
  async generateMessage(
    scene: ProactiveScene,
    personality: PersonalityConfig,
    context: Context
  ): Promise<string> {
    // 使用PersonalityEngine生成个性化消息
    const template = this.getTemplate(scene.id);
    return this.personalityEngine.injectPersonality(template, personality);
  }
}
```

#### 2.4 守门机制（基础版）

- ✅ **时段控制**（静音窗）
- ✅ **频次限制**（每日最多1条）
- ✅ **场景开关**（启用/禁用）

**实现**：
```typescript
class PolicyGuard {
  private dailyMessageCount: Map<string, number> = new Map();
  private readonly MAX_DAILY_MESSAGES = 1;
  
  canSendMessage(userId: string): boolean {
    const today = new Date().toDateString();
    const key = `${userId}:${today}`;
    const count = this.dailyMessageCount.get(key) || 0;
    
    if (count >= this.MAX_DAILY_MESSAGES) {
      return false;
    }
    
    this.dailyMessageCount.set(key, count + 1);
    return true;
  }
  
  isEnabled(sceneId: string): boolean {
    // 从配置读取场景开关状态
    return this.config.scenes[sceneId]?.enabled ?? true;
  }
}
```

---

### 阶段2：增强功能（Week 3-4）🔄 建议实现

**目标**：增加事件触发和智能判断

#### 2.1 触发机制扩展

- 🔄 **事件触发**：新文档入库、DDL提醒
- 🔄 **状态触发**：长时间无互动、情绪负向
- 🔄 **随机触发**：泊松过程（λ=0.15/h）

**实现**：
```typescript
// 事件触发
eventBus.subscribe('memory:new_document', (data) => {
  proactivityScheduler.trigger('document_analysis', data);
});

// 状态触发
eventBus.subscribe('emotion:negative_detected', (data) => {
  proactivityScheduler.trigger('care_reminder', data);
});

// 随机触发（泊松过程）
class RandomTrigger {
  private readonly LAMBDA = 0.15; // 每小时0.15次
  
  schedule(): void {
    // 使用泊松过程生成下一次触发时间
    const interval = this.generatePoissonInterval();
    setTimeout(() => {
      this.trigger();
      this.schedule(); // 递归调度
    }, interval);
  }
}
```

#### 2.2 判断机制增强

- 🔄 **引入评分维度**（Value/Urgency/Novelty）
- 🔄 **行动阈值**（0.62）
- 🔄 **话题多样性惩罚**

**实现**：
```typescript
class EvaluationEngine {
  async evaluateScenes(context: Context): Promise<SceneScore[]> {
    const scenes = await this.generateCandidates(context);
    
    return scenes.map(scene => ({
      ...scene,
      score: this.calculateScore(scene, context)
    })).sort((a, b) => b.score - a.score);
  }
  
  calculateScore(scene: Scene, context: Context): number {
    const value = this.calculateValue(scene, context) * 0.35;
    const urgency = this.calculateUrgency(scene, context) * 0.30;
    const novelty = this.calculateNovelty(scene, context) * 0.10;
    const effort = this.calculateEffort(scene, context) * -0.20;
    
    let score = value + urgency + novelty + effort;
    
    // 多样性惩罚
    if (this.isTopicRepeated(scene.topic, context)) {
      score -= 0.10;
    }
    
    return Math.max(0, Math.min(1, score));
  }
  
  shouldAct(score: number): boolean {
    return score >= 0.62; // 行动阈值
  }
}
```

---

### 阶段3：高级特性（Week 5+）⏳ 可选实现

**目标**：惊喜机制和自适应学习

#### 3.1 惊喜机制

- ⏳ **沙箱预作业**
- ⏳ **汇报卡**（采纳/撤销/稍后）
- ⏳ **工具白名单**

#### 3.2 自适应学习

- ⏳ **奖励信号收集**
- ⏳ **阈值动态调整**
- ⏳ **探索/利用平衡**

---

## 3. 技术实现方案

### 3.1 核心类设计

```typescript
// 触发枢纽
class TriggerHub {
  private lastTriggerTime: Map<string, number> = new Map();
  private readonly DEBOUNCE_MS = 30 * 60 * 1000;
  
  // 时间触发
  registerTimeTrigger(trigger: TimeTrigger): void;
  // 事件触发
  registerEventTrigger(trigger: EventTrigger): void;
  // 去重与防抖
  shouldTrigger(triggerId: string): boolean;
  // 静音窗检查
  isInQuietWindow(): boolean;
  // 工作日检查
  isWorkday(): boolean;
}

// 判断/评审层
class EvaluationEngine {
  // 评分候选场景
  evaluateScenes(context: Context): Promise<SceneScore[]>;
  // 决定是否执行
  shouldAct(score: number): boolean;
  // 计算评分
  calculateScore(scene: Scene, context: Context): number;
}

// 政策守门
class PolicyGuard {
  // 频次检查
  canSendMessage(userId: string): boolean;
  // 场景开关
  isEnabled(sceneId: string): boolean;
  // 时段检查
  isAllowedTime(): boolean;
}

// 主动性调度器（主类）
class ProactivityScheduler {
  private triggerHub: TriggerHub;
  private evaluationEngine: EvaluationEngine;
  private policyGuard: PolicyGuard;
  private personalityEngine: PersonalityEngine;
  private memoryService: IMemoryService;
  private chatService: ChatService;
  
  // 注册场景
  registerScene(scene: ProactiveScene): void;
  // 启动调度
  start(): void;
  // 执行场景
  executeScene(sceneId: string, context: Context): Promise<void>;
  // 触发场景（事件驱动）
  trigger(sceneId: string, context?: any): Promise<void>;
  // 启用/禁用场景
  enable(sceneId: string): void;
  disable(sceneId: string): void;
}
```

### 3.2 场景定义

```typescript
interface ProactiveScene {
  id: string;
  name: string;
  trigger: 'schedule' | 'event' | 'condition' | 'random';
  schedule?: string; // Cron表达式
  condition?: (context: Context) => boolean;
  generateMessage: (context: Context, personality: PersonalityConfig) => Promise<string>;
  enabled?: boolean;
  priority?: number;
}

// 基础场景示例
const morningGreetingScene: ProactiveScene = {
  id: 'morning_greeting',
  name: '早安问候',
  trigger: 'schedule',
  schedule: '30 9 * * 1-5', // 工作日9:30
  generateMessage: async (context, personality) => {
    return `早上好！${personality.name}，今天有什么计划吗？`;
  },
  enabled: true,
  priority: 1
};
```

### 3.3 与现有系统集成

```typescript
// 在server.ts中初始化
this.proactivityScheduler = new ProactivityScheduler({
  personalityEngine: this.personalityEngine,
  emotionEngine: this.emotionEngine,
  memoryService: this.memoryService,
  chatService: this.chatService,
  eventBus: this.eventBus
});

// 注册基础场景
this.proactivityScheduler.registerScene({
  id: 'morning_greeting',
  name: '早安问候',
  trigger: 'schedule',
  schedule: '30 9 * * 1-5',
  generateMessage: async (context) => { ... }
});

// 启动
this.proactivityScheduler.start();
```

### 3.4 事件集成

```typescript
// 通过EventBus监听事件触发
eventBus.subscribe('memory:new_document', (data) => {
  proactivityScheduler.trigger('document_analysis', data);
});

eventBus.subscribe('emotion:negative_detected', (data) => {
  proactivityScheduler.trigger('care_reminder', data);
});
```

---

## 4. 配置管理

### 4.1 默认配置

```typescript
interface ProactivityConfig {
  enabled: boolean;
  timezone: string; // 'Asia/Taipei'
  quietWindow: {
    start: string; // '22:00'
    end: string; // '08:00'
  };
  workdayHours: {
    start: string; // '09:00'
    end: string; // '20:00'
  };
  maxDailyMessages: number; // 1
  actionThreshold: number; // 0.62
  scenes: {
    [sceneId: string]: {
      enabled: boolean;
      schedule?: string;
      priority?: number;
    };
  };
}
```

### 4.2 配置文件位置

- `config/proactivity.json` - 主动性调度配置

---

## 5. 验收标准

### 阶段1 MVP验收

- ✅ 能按时触发主动消息（工作日9:30、14:30）
- ✅ 静音窗内不触发（22:00-08:00）
- ✅ 消息内容符合人格设定
- ✅ 用户可配置场景开关
- ✅ 频次限制生效（每日最多1条）

### 阶段2增强验收

- 🔄 事件触发正常工作
- 🔄 状态触发正常工作
- 🔄 评分机制正常工作
- 🔄 话题多样性惩罚生效

### 阶段3高级验收

- ⏳ 惊喜机制正常工作
- ⏳ 自适应学习生效
- ⏳ 奖励信号收集正常

---

## 6. 风险与对策

### 6.1 打扰感

**风险**：频次过高、时段不当导致用户反感

**对策**：
- 保守阈值：默认频次低（≤1/天）、阈值高（≥0.62）
- 静音窗严格：22:00-08:00禁止触发
- 用户可一键暂停

### 6.2 资源消耗

**风险**：频繁触发、LLM调用导致资源消耗过大

**对策**：
- 轻量化判断：优先规则判断，避免复杂LLM调用
- 缓存机制：相同场景消息可缓存
- 自适应降频：系统忙时自动降频

### 6.3 复杂度

**风险**：评分系统复杂、维护困难

**对策**：
- 渐进式实施：先MVP，再逐步增强
- 简化评分：MVP阶段使用简化评分
- 可配置：阈值可调整

---

## 7. 实施路线图

### 第一步：MVP实现（1-2周）

- [ ] 实现基础的ProactivityScheduler
- [ ] 3个基础场景（早安、晚安、健康提醒）
- [ ] 时间触发 + 静音窗 + 频次限制
- [ ] 与PersonalityEngine集成生成消息
- [ ] 单元测试

### 第二步：增强功能（1-2周）

- [ ] 增加事件触发
- [ ] 引入基础评分机制
- [ ] 话题多样性控制
- [ ] 集成测试

### 第三步：高级特性（2-3周）

- [ ] 惊喜机制
- [ ] 自适应学习
- [ ] 完整评分系统
- [ ] 性能优化

---

## 8. 参考文档

- [记忆与主动性设计.md](../../记忆与主动性设计.md) - 完整设计文档
- [DEVELOPMENT_PRIORITY.md](./DEVELOPMENT_PRIORITY.md) - 开发优先级
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 系统架构

---

**文档维护**: 随着开发进展持续更新  
**负责人**: Apex Bridge Team

