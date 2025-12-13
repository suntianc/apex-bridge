# Playbook系统使用示例

## 示例1：任务完成后自动提炼Playbook

```typescript
// 任务成功完成，触发Playbook提炼
const outcome = {
  summary: '通过提供免费试用和技术支持，成功说服客户从竞争对手转换',
  learnings: [
    '免费试用期能有效降低客户决策门槛',
    '技术支持的响应速度是客户最关心的指标',
    '竞争对手的定价过高是我们的优势',
    '强调ROI计算能帮助CFO快速决策'
  ],
  outcome: 'success' as const
};

// AceStrategyManager自动提炼Playbook
await strategyManager.updateWorldModel('session_123', outcome);

// 系统自动生成Playbook：
{
  id: 'pb_1703123456_abc123',
  name: '竞争对手客户转化策略',
  type: 'negotiation',
  context: {
    domain: 'sales',
    scenario: '客户使用竞品，考虑转换',
    complexity: 'medium',
    stakeholders: ['客户决策者', '技术负责人']
  },
  trigger: {
    type: 'event',
    condition: '客户提及正在使用竞争对手产品',
    threshold: 0.8
  },
  actions: [
    {
      step: 1,
      description: '提供免费试用账号',
      expectedOutcome: '降低客户试用门槛',
      resources: ['试用账号', '技术支持']
    },
    {
      step: 2,
      description: '强调技术支持的响应速度优势',
      expectedOutcome: '突出差异化价值',
      resources: ['SLA文档', '客户案例']
    },
    {
      step: 3,
      description: '提供ROI计算工具',
      expectedOutcome: '帮助CFO快速决策',
      resources: ['ROI计算器', '成本对比']
    }
  ],
  metrics: {
    successRate: 1.0,
    usageCount: 0,
    averageOutcome: 9.5
  }
}
```

## 示例2：智能匹配Playbook

```typescript
// 用户查询：客户说预算不够，要考虑竞品
const query = {
  userQuery: '客户反馈预算有限，正在考虑竞品的方案',
  sessionHistory: [
    '今天和客户进行了产品演示',
    '客户对功能比较满意',
    '提到下季度预算已经分配'
  ],
  currentState: 'negotiation_stage',
  userProfile: {
    userId: 'user_001',
    preferences: {
      negotiation_style: 'consultative',
      past_success_patterns: ['value_based', 'roi_calculator']
    }
  }
};

// 匹配最佳Playbook
const matches = await strategyManager.matchPlaybooks(query);

console.log(matches);
// 输出：
[
  {
    playbook: { name: '预算异议处理策略', ... },
    matchScore: 0.92,
    matchReasons: [
      '文本相似度高 (85%)',
      '高成功率 (90%)',
      '经常使用 (45次)',
      '上下文高度匹配'
    ],
    applicableSteps: [1, 2, 3, 4]
  },
  {
    playbook: { name: '竞品对比策略', ... },
    matchScore: 0.78,
    matchReasons: [
      '文本相似度高 (72%)',
      '高成功率 (88%)'
    ],
    applicableSteps: [1, 2, 3]
  }
]
```

## 示例3：推荐Playbook序列

```typescript
// 复杂任务：新产品发布到企业客户
const complexContext = {
  userQuery: '计划向大型企业客户发布新产品，需要完整的执行策略',
  sessionHistory: [
    '新产品已完成开发和测试',
    '目标客户是金融行业大型企业',
    '预计3个月内完成首单'
  ],
  targetOutcome: '成功签约2个大型企业客户'
};

// 推荐执行序列
const recommendation = await playbookMatcher.recommendPlaybookSequence(
  complexContext,
  '成功签约2个大型企业客户'
);

console.log(recommendation);
// 输出：
{
  sequence: [
    {
      playbook: { name: '企业客户需求调研', ... },
      matchScore: 0.95,
      matchReasons: ['企业客户', '需求分析', '高成功率']
    },
    {
      playbook: { name: '产品演示策略', ... },
      matchScore: 0.88,
      matchReasons: ['金融行业', '产品展示', '经常使用']
    },
    {
      playbook: { name: '企业级安全审查流程', ... },
      matchScore: 0.82,
      matchReasons: ['大型企业', '安全合规', '最近更新']
    },
    {
      playbook: { name: '企业采购流程导航', ... },
      matchScore: 0.79,
      matchReasons: ['采购流程', '决策链', '上下文匹配']
    }
  ],
  rationale: '基于目标客户特征和历史成功模式，推荐按需求调研→产品演示→安全审查→采购流程的顺序执行，整体估计成功率85%',
  estimatedSuccessRate: 0.85
}
```

## 示例4：记录Playbook执行与反馈

```typescript
// 记录Playbook执行结果
await strategyManager.recordPlaybookExecution(
  'pb_1703123456_abc123',  // playbookId
  'session_456',           // sessionId
  'success',               // outcome
  '客户最终选择了我们的方案，感谢ROI计算工具的帮助'  // notes
);

// 系统更新Playbook指标
const updatedMetrics = {
  successRate: 0.83,      // 从 0.80 提升到 0.83
  usageCount: 12,         // 使用次数+1
  averageOutcome: 8.7,    // 用户满意度平均分
  lastUsed: Date.now()
};

// 自动生成优化建议
const optimizations = await playbookManager.optimizePlaybook('pb_1703123456_abc123');

console.log(optimizations);
// 输出：
[
  {
    playbookId: 'pb_1703123456_abc123',
    type: 'trigger_refinement',
    suggestion: '优化触发条件，提高匹配的准确性',
    rationale: '当前成功率83%接近阈值，建议优化触发条件以进一步提升',
    expectedImprovement: {
      successRateDelta: 0.15,
      usageIncreaseEstimate: 0.3
    },
    confidence: 0.8
  }
]
```

## 示例5：搜索和发现Playbook

```typescript
// 搜索所有谈判相关的Playbook
const negotiationPlaybooks = await strategyManager.searchPlaybooks(
  '客户谈判和异议处理',
  {
    type: 'negotiation',
    minSuccessRate: 0.7,
    limit: 10
  }
);

console.log(negotiationPlaybooks);
// 输出：
[
  { name: '预算异议处理策略', successRate: 0.85, usageCount: 45 },
  { name: '竞品对比策略', successRate: 0.88, usageCount: 32 },
  { name: '决策者沟通策略', successRate: 0.82, usageCount: 28 },
  ...
]

// 查找相似Playbook
const similar = await playbookMatcher.findSimilarPlaybooks(
  'pb_1703123456_abc123',
  5
);

console.log(similar);
// 输出：
[
  { name: '企业客户谈判策略', matchScore: 0.89 },
  { name: 'SaaS产品销售策略', matchScore: 0.76 },
  { name: '长期合同续约策略', matchScore: 0.71 },
  ...
]
```

## 示例6：实时Playbook推荐

```typescript
// 聊天过程中实时推荐
const conversation = [
  { role: 'user', content: '客户说预算已经用完了' },
  { role: 'assistant', content: '我理解预算的限制...' },
  { role: 'user', content: '而且他们还在看竞争对手的方案' }
];

// 实时匹配Playbook
const realTimeMatch = await strategyManager.matchPlaybooks({
  userQuery: '客户预算用完，竞争对手方案',
  sessionHistory: conversation.map(m => m.content)
});

console.log('实时推荐:', realTimeMatch[0]);
// 推荐：'预算异议处理策略' + '竞品对比策略'
```

## 示例7：Playbook统计分析

```typescript
// 获取Playbook系统统计
const stats = strategyManager.getPlaybookStats();

console.log(stats);
// 输出：
{
  totalPlaybooks: 156,
  activePlaybooks: 142,
  deprecatedPlaybooks: 14,
  averageSuccessRate: 0.78,
  mostUsedType: 'negotiation'
}

// 按类型统计
const typeStats = {
  growth: { count: 45, avgSuccess: 0.82 },
  crisis: { count: 23, avgSuccess: 0.76 },
  negotiation: { count: 58, avgSuccess: 0.79 },
  problem_solving: { count: 18, avgSuccess: 0.75 },
  product_launch: { count: 8, avgSuccess: 0.71 },
  customer_success: { count: 4, avgSuccess: 0.83 }
};
```

## 示例8：Playbook版本管理

```typescript
// 创建新版本Playbook
const updatedPlaybook = await playbookManager.updatePlaybook(
  'pb_1703123456_abc123',
  {
    version: '2.0.0',
    actions: [
      // 添加新步骤
      {
        step: 5,
        description: '跟进客户反馈，确认决策时间',
        expectedOutcome: '获得明确的采购时间表'
      }
    ],
    trigger: {
      ...originalTrigger,
      threshold: 0.85  // 提高触发阈值
    }
  }
);

console.log('版本历史:');
// 1.0.0 (初始版本)
// 1.1.0 (优化触发条件)
// 2.0.0 (增加跟进步骤)
```

## 示例9：ACE层级协作

```typescript
// L4层调用L2的Playbook进行任务编排
const orchestration = await aceStrategyOrchestrator.orchestrate(
  messages,
  {
    aceOrchestration: { enabled: true },
    playbookAssistance: true  // 启用Playbook辅助
  }
);

// L2自动提供Playbook指导
// L4根据Playbook优化任务执行顺序
```

## 示例10：Playbook自动优化

```typescript
// 每日自动优化任务
setInterval(async () => {
  const underperformingPlaybooks = await playbookManager
    .searchPlaybooks('', { minSuccessRate: 0 });

  for (const playbook of underperformingPlaybooks) {
    if (playbook.metrics.successRate < 0.6) {
      const optimizations = await playbookManager.optimizePlaybook(playbook.id);
      console.log(`优化建议 for ${playbook.name}:`, optimizations);
    }
  }
}, 24 * 60 * 60 * 1000); // 每天执行
```

## 总结

Playbook系统的核心价值在于：
1. **经验传承**：将个人智慧转化为组织资产
2. **智能辅助**：实时推荐最佳策略
3. **持续进化**：基于反馈自动优化
4. **认知卸载**：降低决策复杂度

通过这些示例，展示了Playbook如何从"隐性知识"到"显性资产"，再到"智能决策"的完整闭环。
