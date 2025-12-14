# Playbook生命周期管理与失败经验转化示例

## 重要设计理念

**个人知识库是永久资产** - 不因时间久远而失效或淘汰

### 生命周期管理策略

我们区分两种情况：

1. **归档（Archived）** - 长期未用但保留
   - 180天未使用且使用次数<5次
   - 降低检索权重30%，但不淘汰
   - 可随时重新激活

2. **淘汰（Deprecated）** - 明确低效才淘汰
   - 成功率<30%且使用次数>10次
   - 用户满意度<2分且反馈>5次
   - 优化超过5次仍低效

**为什么这样做？**
- 避免"你去搞土木研究6个月，回来发现代码部署Playbook被删了"的恼火情况
- 个人知识是长期资产，应该被保留
- 只有明确低效的才应该被淘汰

---

## 示例1：长期未用自动归档（而非淘汰）

```typescript
// 场景：你去搞土木研究了，6个月没写代码
// 你的"代码部署 Playbook"已经180天没用了

// 定期评估任务检测到：
const playbook = await playbookManager.getPlaybook('pb_deploy_123');

console.log(playbook.status); // 'active'
console.log(playbook.metrics.usageCount); // 3
console.log(playbook.metrics.lastUsed); // 1703123456789 (6个月前)

// 自动归档（不是淘汰！）
await strategyManager.evaluateAndUpdatePlaybookStatuses();

const archived = await playbookManager.getPlaybook('pb_deploy_123');
console.log(archived.status); // 'archived'

// 向L2层报告：
// {
//   type: 'PLAYBOOK_ARCHIVED',
//   content: 'Playbook "代码部署策略" has been archived due to long-term non-use',
//   metadata: {
//     playbookId: 'pb_deploy_123',
//     daysSinceLastUsed: 180,
//     usageCount: 3,
//     reason: '长期未使用（180天+）',
//     timestamp: Date.now()
//   }
// }

// 但你回来写代码时，仍然能找到它
const query = {
  userQuery: '怎么部署代码到服务器？',
  sessionHistory: [],
  currentState: 'development'
};

const matches = await strategyManager.matchPlaybooks(query);
console.log(matches);
// 输出包含已归档的Playbook，但权重降低：
[
  {
    playbook: { name: '代码部署策略', status: 'archived', ... },
    matchScore: 0.63, // 原本可能是0.9，但降低30%
    matchReasons: [
      '文本相似度高 (90%)',
      '已归档（降低权重）' // 标记但仍可找到
    ]
  }
]

// 重新使用3次后，自动恢复为active
for (let i = 0; i < 3; i++) {
  await strategyManager.recordPlaybookExecution('pb_deploy_123', 'success');
}

const reactivated = await playbookManager.getPlaybook('pb_deploy_123');
console.log(reactivated.status); // 'active'
```

---

## 示例2：明确低效才淘汰（而非归档）

```typescript
// 场景：某个Playbook明确低效，应该被淘汰
const playbook = await playbookManager.getPlaybook('pb_inefficient_456');

console.log(playbook.status); // 'active'
console.log(playbook.metrics.successRate); // 0.25 (25%)
console.log(playbook.metrics.usageCount); // 15
console.log(playbook.metrics.userSatisfaction); // 1.5

// 自动淘汰（明确低效）
await strategyManager.evaluateAndUpdatePlaybookStatuses();

const deprecated = await playbookManager.getPlaybook('pb_inefficient_456');
console.log(deprecated.status); // 'deprecated'

// 向L2层报告：
// {
//   type: 'PLAYBOOK_DEPRECATED',
//   content: 'Playbook "错误方案" has been deprecated due to low performance',
//   metadata: {
//     playbookId: 'pb_inefficient_456',
//     successRate: 0.25,
//     usageCount: 15,
//     reason: '成功率过低（<30%）',
//     timestamp: Date.now()
//   }
// }

// 查询时不再出现（真正淘汰）
const matches = await strategyManager.matchPlaybooks({
  userQuery: '如何处理XX问题？',
  sessionHistory: [],
  currentState: 'problem_solving'
});

// deprecated的Playbook不会出现在结果中
console.log(matches.length); // 0 (被淘汰了)
```

---

## 示例3：失败经验转化

```typescript
// 场景：谈判失败案例，被转化为"避免错误"指南
const outcome = {
  summary: '客户谈判失败，未能达成合作',
  learnings: [
    '客户对价格敏感，未能有效传达价值',
    '竞品提供了更优惠的方案',
    '决策者未充分参与谈判过程'
  ],
  outcome: 'failure' as const
};

// AceStrategyManager自动处理
await strategyManager.updateWorldModel('session_123', outcome);

// 系统自动：
// 1. 存储失败案例到LanceDB
// 2. 提炼"避免错误"Playbook
// 3. 向L2层报告

// 生成的失败衍生Playbook：
{
  id: 'pb_failure_1703123456_xyz789',
  name: '避免价格异议处理错误',
  description: '如何避免在价格敏感客户面前犯常见错误',
  type: 'risk_avoidance',
  tags: ['failure-derived', 'risk-avoidance', 'prevention'],
  author: 'failure-analysis',
  actions: [
    {
      step: 1,
      description: '先展示产品价值，再讨论价格',
      expectedOutcome: '客户认同价值后对价格敏感度降低'
    },
    {
      step: 2,
      description: '使用ROI计算工具量化价值',
      expectedOutcome: '通过数据证明投资回报率'
    },
    {
      step: 3,
      description: '提供灵活的价格方案（分期、阶梯定价）',
      expectedOutcome: '降低客户一次性支付压力'
    }
  ],
  metrics: {
    successRate: 0, // 失败衍生Playbook初始成功率为0
    usageCount: 0,
    averageOutcome: 0,
    lastUsed: 0,
    timeToResolution: 0,
    userSatisfaction: 0
  }
}
```

## 示例4：智能匹配失败衍生Playbook

```typescript
// 用户查询：客户说价格太高，要考虑竞品
const query = {
  userQuery: '客户反馈价格太贵，正在评估竞争对手',
  sessionHistory: [
    '今天和客户讨论了产品方案',
    '客户对功能很满意',
    '但是提到预算有限'
  ],
  currentState: 'negotiation_stage'
};

// PlaybookMatcher会智能匹配：
const matches = await strategyManager.matchPlaybooks(query);

console.log(matches);
// 输出：
[
  {
    playbook: { name: '预算异议处理策略', type: 'negotiation', ... },
    matchScore: 0.92,
    matchReasons: [
      '文本相似度高 (85%)',
      '高成功率 (88%)',
      '经常使用 (45次)'
    ]
  },
  {
    // 失败衍生的风险规避Playbook
    playbook: { name: '避免价格异议处理错误', type: 'risk_avoidance', tags: ['failure-derived'], ... },
    matchScore: 0.78,
    matchReasons: [
      '文本相似度高 (75%)',
      '风险规避场景匹配',
      '失败经验衍生（风险规避）'
    ]
  }
]

// 注意：失败衍生Playbook的特殊处理：
// - 更看重场景匹配度（40%权重）而非成功率
// - 即使初始成功率为0，只要场景匹配也会推荐
// - 帮助用户避免历史上的常见错误
```

## 示例3：Playbook重新激活

```typescript
// 场景：某个被淘汰的Playbook通过优化重新激活
const playbook = await playbookManager.getPlaybook('pb_old_123');

// 当前状态：已被标记为deprecated
console.log(playbook.status); // 'deprecated'

// 经过用户反馈和优化后，成功率提升
const updatedMetrics = {
  successRate: 0.65, // 从0.38提升到0.65
  usageCount: 15,
  userSatisfaction: 7.2
};

await playbookManager.updatePlaybook('pb_old_123', {
  metrics: updatedMetrics
});

// 下次定期评估任务会检测到：
// - 成功率 > 60% → 重新激活
await strategyManager.evaluateAndUpdatePlaybookStatuses();

// 重新激活成功
const reactivated = await playbookManager.getPlaybook('pb_old_123');
console.log(reactivated.status); // 'active'

// 向L2层报告重新激活事件
// {
//   type: 'PLAYBOOK_REACTIVATED',
//   content: 'Playbook "预算异议处理策略" has been reactivated due to improved performance',
//   metadata: {
//     playbookId: 'pb_old_123',
//     successRate: 0.65,
//     previousStatus: 'deprecated',
//     newStatus: 'active',
//     timestamp: Date.now()
//   }
// }
```

## 示例4：失败案例的完整生命周期

```typescript
// 第一次失败
const failure1 = {
  summary: '客户认为价格太高，谈判破裂',
  learnings: ['没有充分展示价值', '直接报价导致客户流失'],
  outcome: 'failure' as const
};

await strategyManager.updateWorldModel('session_1', failure1);
// 生成：避免价格异议处理错误（初始成功率0）

// 第二次相似失败
const failure2 = {
  summary: '客户再次因价格问题拒绝',
  learnings: ['应该先做价值调研', '缺乏ROI数据支持'],
  outcome: 'failure' as const
};

await strategyManager.updateWorldModel('session_2', failure2);
// 生成：产品演示前的价值调研策略（初始成功率0）

// 第三次成功应用失败衍生Playbook
const success = {
  summary: '通过先展示ROI数据，成功说服客户',
  learnings: ['ROI工具很有效', '客户认同投资回报率'],
  outcome: 'success' as const
};

await strategyManager.updateWorldModel('session_3', success);

// 更新失败衍生Playbook的指标
// 避免价格异议处理错误：
// - successRate: 0 → 0.33 (1/3)
// - usageCount: 0 → 1
// - userSatisfaction: 0 → 8.5

// 随着更多成功应用，这些"风险规避"Playbook会逐渐积累成功率
// 成为真正有价值的"预防性策略"
```

## 示例5：失败经验与成功经验的对比

```typescript
// 成功案例提炼的Playbook
const successPlaybook = {
  name: '高效客户谈判策略',
  type: 'negotiation',
  author: 'auto-extracted',
  tags: ['negotiation', 'success-derived'],
  metrics: {
    successRate: 0.85,
    usageCount: 42
  },
  actions: [
    { step: 1, description: '了解客户需求和痛点' },
    { step: 2, description: '展示产品价值和使用场景' },
    { step: 3, description: '提供ROI数据支持' },
    { step: 4, description: '讨论价格和合作方案' }
  ]
};

// 失败案例提炼的Playbook
const failurePlaybook = {
  name: '避免价格异议处理错误',
  type: 'risk_avoidance',
  author: 'failure-analysis',
  tags: ['failure-derived', 'risk-avoidance'],
  metrics: {
    successRate: 0.72, // 预防成功的比率
    usageCount: 18
  },
  actions: [
    { step: 1, description: '避免直接报价' },
    { step: 2, description: '先传达价值而非价格' },
    { step: 3, description: '准备ROI工具和数据' },
    { step: 4, description: '避免与竞品直接比价' }
  ]
};

// 两者可以结合使用：
// - 成功Playbook告诉您"做什么"
// - 失败Playbook告诉您"避免什么"
// - 组合使用形成更完整的策略指导
```

---

## 示例5：Playbook激活日志输出

当Agent匹配到Playbook时，会在终端/UI输出格式化的日志：

```typescript
// 用户查询：客户提到价格太高
const query = {
  userQuery: '客户反馈价格太贵，正在评估竞争对手',
  sessionHistory: ['客户对功能满意', '但预算有限'],
  currentState: 'negotiation_stage'
};

// 匹配Playbook
const matches = await strategyManager.matchPlaybooks(query);

// 终端输出日志：
📖 Activated Strategy: [谈判-价格异议处理] (Success: 85%)
📖 Activated Strategy: [风险规避-避免价格异议处理错误] (Success: 72%)
```

**日志格式说明**：
- `📖` - Playbook激活标识
- `Activated Strategy` - 固定文本
- `[谈判-价格异议处理]` - [类型-具体名称]，类型会转换为中文
- `(Success: 85%)` - 当前成功率

**类型映射**：
- `negotiation` → `谈判`
- `problem_solving` → `问题解决`
- `crisis` → `危机处理`
- `risk_avoidance` → `风险规避`
- `crisis_prevention` → `危机预防`
- 其他类型 → 保持英文

这样的日志输出让用户清晰知道：
1. 当前激活了哪个策略
2. 这个策略的历史成功率如何
3. 便于跟踪策略使用情况

## 总结

Playbook系统的生命周期管理和失败经验转化实现了：

1. **自我净化**：自动淘汰低效Playbook，保持系统质量
2. **失败转化**：将失败经验转化为有价值的"风险规避"指南
3. **智能匹配**：失败衍生Playbook使用不同的匹配策略（场景优先）
4. **持续进化**：Playbook可以重新激活，形成动态优化的闭环

这正是ACE架构L2层的核心价值——**从所有经验中学习，包括失败**。
