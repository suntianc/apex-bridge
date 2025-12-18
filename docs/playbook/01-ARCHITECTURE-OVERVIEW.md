# Playbook 系统架构改造 - 总体设计文档

## 文档信息
- **文档版本**: v1.0.0
- **创建日期**: 2025-12-18
- **作者**: 系统架构团队
- **状态**: 待评审

## 1. 执行摘要

### 1.1 改造目标
将 Playbook 系统从"预设类型+强制执行"模式升级为"完全动态类型归纳+提示词注入指导"模式，实现从机械执行框架到智能推理增强器的根本性转变。

### 1.2 核心价值
- **智能化**: 从机械执行到智能指导，响应更灵活
- **扩展性**: 动态类型系统支持无限扩展
- **准确性**: 基于历史经验的指导更可靠
- **适应性**: 持续学习，持续优化

## 2. 当前系统分析

### 2.1 现有架构
```
┌─────────────────────────────────────────────────────────┐
│  PlaybookManager - CRUD、版本管理、生命周期管理            │
│  PlaybookMatcher - 基于上下文的模式匹配                   │
│  PlaybookExecutor - 强制执行 Plan 步骤                   │
│  PlaybookReflector - 执行结果反思优化                    │
└─────────────────────────────────────────────────────────┘
```

### 2.2 存在的问题
1. **固定类型体系**: 预设的 6 种类型限制适应性
2. **强制执行模式**: 机械按步骤执行，缺乏灵活性
3. **ReAct 集成度低**: 未在 prepare() 阶段注入指导
4. **匹配算法简单**: 缺乏置信度和多标签处理

### 2.3 现有代码结构分析
- `PlaybookManager.ts`: 891 行，管理 Playbook 生命周期
- `PlaybookMatcher.ts`: 827 行，基于向量检索和规则匹配
- `PlaybookExecutor.ts`: 274 行，强制执行模式
- 存储: LanceDB (向量) + 内存缓存
- 状态: active/archived/deprecated

## 3. 目标架构

### 3.1 核心组件
```
┌─────────────────────────────────────────────────────────┐
│  TypeInductionEngine - 动态类型归纳引擎                   │
│  PlaybookTemplateManager - 提示词模板管理器              │
│  PlaybookMatcher - 多标签动态类型匹配                    │
│  PlaybookInjector - 提示词注入器 (替代Executor)          │
└─────────────────────────────────────────────────────────┘
```

### 3.2 核心流程
```
用户查询 → ReActStrategy.prepare()
          ↓
      Playbook匹配 → 类型归纳 → 提示词模板选择
          ↓
      ChatService变量注入 → LLM推理增强
          ↓
      智能执行 → 效果评估 → 类型优化
```

### 3.3 数据流
```
历史轨迹 → 类型归纳引擎 → 动态类型词汇表
    ↓
用户查询 → 匹配引擎 → 多标签Playbook
    ↓
模板系统 → 提示词注入 → LLM上下文
```

## 4. 四大改造点

### 4.1 改造点一: 动态类型体系

#### 目标
- 完全从数据驱动，无预设类型
- 从历史实践中自然归纳标签
- 所有标签平等，无层次结构

#### 实施内容
- 新增 `TypeInductionEngine` 类
- 创建 `TypeVocabulary` 数据结构
- 实现类型归纳算法（聚类 + LLM模式识别）
- 支持多标签关联和置信度计算

#### 关键特性
- Jaccard 相似度 + 向量相似度聚类
- LLM 辅助模式识别
- 类型置信度动态更新
- 衰退类型检测与合并

### 4.2 改造点二: 提示词注入指导

#### 目标
- 从强制执行改为智能指导
- 基于现有 SystemPromptService 增强
- 注入历史经验到 LLM 推理链

#### 实施内容
- 扩展 `SystemPromptService` 支持模板片段
- 增强 `VariableEngine` 添加 Playbook 变量解析器
- 在 `ReActStrategy.prepare()` 中集成匹配逻辑
- 支持注入强度调节（轻/中/重）

#### 关键特性
- 4 种模板类型：指导型、约束型、框架型、示例型
- 动态变量替换：{goal}、{steps}、{cautions}
- 冲突处理机制
- 失败回退机制

### 4.3 改造点三: 深度集成 ReAct 策略

#### 目标
- 在 `prepare()` 阶段完成 Playbook 注入
- 将指导融入思考链 (Thought)
- 优化工具选择策略

#### 实施内容
- 修改 `ReActStrategy` 类
- 在 `prepare()` 中添加匹配和注入逻辑
- 实现智能注入决策
- 支持多 Playbook 同时注入

#### 关键特性
- 注入点：prepare() 中间阶段
- 思考链融合：Playbook指导作为背景
- 强度控制：轻/中/重三级
- 动态切换：基于效果评估

### 4.4 改造点四: 类型匹配算法升级

#### 目标
- 支持多标签 Playbook 匹配
- 标签相似度计算
- 置信度加权算法

#### 实施内容
- 重写匹配算法
- 多标签处理逻辑
- 置信度计算模型
- 类型发现与学习

#### 关键特性
- 完全匹配：权重 1.0
- 语义相似：权重 0.8
- 共现模式：权重 0.6
- match_score = Σ(type_confidence × tag_weight × similarity_score)

## 5. 数据模型调整

### 5.1 Playbook 模型变化

#### 新增字段
```typescript
interface StrategicPlaybook {
  // 现有字段...
  type_tags?: string[];           // 动态类型标签数组
  type_confidence?: Record<string, number>;  // 类型置信度映射
  prompt_template_id?: string;    // 关联的提示词模板
  guidance_level?: 'light' | 'medium' | 'intensive';  // 指导强度
  guidance_steps?: string[];      // 指导步骤（非强制执行）
}
```

#### 废弃字段
- `type`: 单一类型字段 → 改为 `type_tags`
- `actions`: 机械执行步骤 → 改为 `guidance_steps`

### 5.2 新增数据表

#### type_vocabulary
```sql
CREATE TABLE type_vocabulary (
  tag_name TEXT PRIMARY KEY,
  keywords TEXT, -- JSON array
  confidence REAL,
  first_identified INTEGER,
  playbook_count INTEGER,
  discovered_from TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
```

#### type_similarity_matrix
```sql
CREATE TABLE type_similarity_matrix (
  tag1 TEXT,
  tag2 TEXT,
  similarity_score REAL,
  co_occurrence_count INTEGER,
  updated_at INTEGER,
  PRIMARY KEY (tag1, tag2)
);
```

#### playbook_type_assignments
```sql
CREATE TABLE playbook_type_assignments (
  playbook_id TEXT,
  tag_name TEXT,
  confidence REAL,
  assigned_at INTEGER,
  PRIMARY KEY (playbook_id, tag_name)
);
```

## 6. API 调整

### 6.1 内部接口

#### 触发类型归纳
```http
POST /api/playbook/types/induce
Content-Type: application/json

{
  "source": "historical" | "batch" | "manual",
  "min_samples": 3,
  "similarity_threshold": 0.7
}

Response: 200 OK
{
  "induced_types": 5,
  "confidence_scores": {...},
  "playbooks_reassigned": 23
}
```

### 6.2 外部接口
- 无需额外暴露 Playbook 专用接口
- 所有功能通过现有 `/v1/chat/completions` 提供
- 类型归纳接口用于后台维护任务

## 7. 兼容性策略

### 7.1 向后兼容
- 保持现有 API 不变
- 现有 Playbook 自动迁移
- 提供降级到强制执行模式

### 7.2 迁移路径
1. **阶段1**: 新旧模式并行运行
2. **阶段2**: 逐步切换核心 Playbook
3. **阶段3**: 完全切换，清理旧代码

### 7.3 风险缓解
- A/B 测试验证新算法
- 人工审核机制
- 用户反馈收集
- 快速回滚能力

## 8. 性能影响

### 8.1 性能指标
- 类型匹配: < 100ms
- 提示词注入: < 50ms
- 总体延迟增加: < 200ms

### 8.2 优化策略
- 类型词汇表缓存
- 相似度矩阵预计算
- 异步类型归纳
- 增量更新机制

## 9. 测试策略

### 9.1 单元测试
- TypeInductionEngine 算法测试
- 匹配算法准确性测试
- 提示词模板渲染测试

### 9.2 集成测试
- ReAct 策略集成测试
- 端到端流程测试
- 性能压力测试

### 9.3 A/B 测试
- 新旧匹配算法对比
- 注入效果评估
- 用户满意度调查

## 10. 实施计划

### 10.1 阶段划分
| 阶段 | 时间 | 目标 | 交付物 |
|------|------|------|--------|
| 基础建设 | 2周 | 动态类型引擎 + 注入基础设施 | TypeInductionEngine、可运行注入流程 |
| 核心功能 | 3周 | 动态匹配 + 多标签管理 | 匹配算法、模板系统、多标签支持 |
| 深度集成 | 2周 | ReAct 策略集成 | 智能注入、思考链融合 |
| 优化完善 | 1周 | 性能优化 + 文档 | 性能达标、完整文档 |

### 10.2 里程碑
- [ ] TypeInductionEngine 核心类创建
- [ ] SystemPromptService 扩展完成
- [ ] 动态类型词汇表建立
- [ ] PlaybookMatcher 重写完成
- [ ] ReAct 策略集成完成
- [ ] 性能测试通过
- [ ] 文档完成

## 11. 后续工作

### 11.1 持续优化
- 类型质量定期评估
- 模板效果持续优化
- 匹配算法迭代改进

### 11.2 扩展规划
- 支持用户自定义类型
- 多语言类型支持
- 跨域类型迁移

---

**下一步行动**: 请查看 `02-DATA-MODEL-DESIGN.md` 了解详细的数据模型设计。
