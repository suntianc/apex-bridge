# Playbook 系统架构改造 - 数据模型设计文档

## 文档信息
- **文档版本**: v1.0.0
- **创建日期**: 2025-12-18
- **作者**: 数据架构团队
- **状态**: 待评审

## 1. 设计原则

### 1.1 核心原则
- **无预设**: 类型标签完全从数据中自然归纳
- **无层次**: 所有标签平等，不存在主类型/子类型关系
- **多标签**: 每个 Playbook 可关联多个类型标签
- **置信度**: 每个标签关联都有置信度评分
- **动态性**: 类型体系可随数据变化动态演进

### 1.2 数据一致性
- 支持事务性更新
- 保证引用完整性
- 版本化历史追踪

## 2. 现有数据模型分析

### 2.1 当前 Playbook 模型 (StrategicPlaybook)

```typescript
// 当前模型
interface StrategicPlaybook {
  id: string;
  name: string;
  description: string;
  type: string;                    // ⚠️ 将被废弃
  version: string;
  status: 'active' | 'archived' | 'deprecated';
  context: {
    domain: string;
    scenario: string;
    complexity: 'low' | 'medium' | 'high';
    stakeholders: string[];
  };
  trigger: {
    type: string;
    condition: string;
  };
  actions: PlaybookAction[];       // ⚠️ 将改为 guidance_steps
  sourceLearningIds: string[];
  createdAt: number;
  lastUpdated: number;
  lastOptimized: number;
  metrics: PlaybookMetrics;
  optimizationCount: number;
  parentId?: string;
  tags: string[];
  author: string;
  reviewers: string[];
}

interface PlaybookAction {
  step: number;
  description: string;
  expectedOutcome: string;
  resources?: string[];
}
```

### 2.2 存储实现
- **向量存储**: LanceDB (主要存储)
- **索引字段**: name, description, type, context.domain, tags
- **元数据**: 完整 Playbook JSON
- **缓存**: 内存缓存 (24h TTL)

## 3. 目标数据模型

### 3.1 扩展 Playbook 模型

```typescript
// 新增字段
interface StrategicPlaybook {
  // 现有字段保持不变...
  id: string;
  name: string;
  description: string;

  // ⚠️ 废弃: type: string
  // ✅ 新增: type_tags (多标签)
  type_tags?: string[];           // 动态类型标签数组

  // ✅ 新增: type_confidence
  type_confidence?: Record<string, number>;  // 类型置信度映射

  // ✅ 新增: prompt_template_id
  prompt_template_id?: string;    // 关联的提示词模板

  // ✅ 新增: guidance_level
  guidance_level?: 'light' | 'medium' | 'intensive';  // 指导强度

  // ✅ 新增: guidance_steps (替代强制 actions)
  guidance_steps?: GuidanceStep[];

  // 其他字段保持不变...
  actions?: PlaybookAction[];     // 向后兼容，逐步迁移
  context: PlaybookContext;
  metrics: PlaybookMetrics;
}

interface GuidanceStep {
  id: string;
  description: string;
  expected_outcome?: string;
  key_points?: string[];          // 关键要点
  cautions?: string[];            // 注意事项
  optional?: boolean;             // 是否可选
}

// 类型置信度示例
{
  "playbook_id": "pb_123",
  "type_tags": ["rapid_iteration", "data_driven", "user_centric"],
  "type_confidence": {
    "rapid_iteration": 0.92,
    "data_driven_decision": 0.88,
    "user_centric": 0.76
  },
  "prompt_template_id": "rapid_iteration_guidance",
  "guidance_level": "medium"
}
```

### 3.2 新增数据实体

#### 3.2.1 TypeVocabulary (类型词汇表)

```typescript
interface TypeVocabulary {
  tag_name: string;               // 唯一标签名 (e.g., "rapid_iteration")
  keywords: string[];             // 关联关键词
  confidence: number;             // 全局置信度 [0-1]
  first_identified: number;       // 首次识别时间
  playbook_count: number;         // 关联的 Playbook 数量
  discovered_from: 'historical_clustering' | 'manual_creation' | 'llm_suggestion';
  created_at: number;
  updated_at: number;
  metadata?: {
    description?: string;         // 类型描述
    usage_examples?: string[];    // 使用示例
    related_tags?: string[];      // 相关标签
    decay_score?: number;         // 衰退评分 [0-1]
  };
}

// 示例
{
  "tag_name": "rapid_iteration",
  "keywords": ["快速", "迭代", "实验", "验证", "敏捷"],
  "confidence": 0.95,
  "first_identified": 1701234567890,
  "playbook_count": 23,
  "discovered_from": "historical_clustering",
  "created_at": 1701234567890,
  "updated_at": 1701234567890,
  "metadata": {
    "description": "快速迭代问题解决方法",
    "usage_examples": ["MVP开发", "A/B测试", "原型验证"],
    "related_tags": ["agile_execution", "data_driven_decision"],
    "decay_score": 0.1
  }
}
```

#### 3.2.2 TypeSimilarityMatrix (类型相似度矩阵)

```typescript
interface TypeSimilarityMatrix {
  tag1: string;                   // 标签1
  tag2: string;                   // 标签2
  similarity_score: number;       // 相似度 [0-1]
  co_occurrence_count: number;    // 共现次数
  last_updated: number;           // 最后更新时间
}

// 示例
{
  "tag1": "rapid_iteration",
  "tag2": "agile_execution",
  "similarity_score": 0.85,
  "co_occurrence_count": 18,
  "last_updated": 1701234567890
}
```

#### 3.2.3 TypeEvolutionHistory (类型演进历史)

```typescript
interface TypeEvolutionHistory {
  id: string;                     // 记录ID
  event_type: 'created' | 'merged' | 'deprecated' | 'split' | 'confidence_updated';
  tag_name: string;               // 涉及的标签
  previous_state?: any;           // 之前状态
  new_state?: any;                // 新状态
  reason: string;                 // 变化原因
  triggered_by: 'automatic' | 'manual' | 'llm_analysis';
  created_at: number;
}

// 示例
{
  "id": "teh_001",
  "event_type": "merged",
  "tag_name": "agile_execution",
  "previous_state": {
    "confidence": 0.6,
    "playbook_count": 15
  },
  "new_state": {
    "confidence": 0.85,
    "playbook_count": 28
  },
  "reason": "与 rapid_iteration 高度相似 (0.85)，合并以提高匹配准确性",
  "triggered_by": "automatic",
  "created_at": 1701234567890
}
```

#### 3.2.4 PlaybookTypeAssignment (Playbook-类型关联)

```typescript
interface PlaybookTypeAssignment {
  playbook_id: string;            // Playbook ID
  tag_name: string;               // 类型标签
  confidence: number;             // 关联置信度 [0-1]
  assigned_method: 'automatic' | 'manual';
  assigned_at: number;
  verified: boolean;              // 是否已人工验证
  verified_at?: number;           // 验证时间
  verified_by?: string;           // 验证人
}

// 示例
{
  "playbook_id": "pb_123",
  "tag_name": "rapid_iteration",
  "confidence": 0.92,
  "assigned_method": "automatic",
  "assigned_at": 1701234567890,
  "verified": true,
  "verified_at": 1701234567890,
  "verified_by": "system"
}
```

#### 3.2.5 PromptTemplate (提示词模板)

```typescript
interface PromptTemplate {
  template_id: string;            // 模板ID
  template_type: 'guidance' | 'constraint' | 'framework' | 'example';
  name: string;                   // 模板名称
  content: string;                // 模板内容 (支持变量)
  variables: string[];            // 支持的变量列表
  applicable_tags: string[];      // 适用的类型标签
  guidance_level?: 'light' | 'medium' | 'intensive';
  created_at: number;
  updated_at: number;
  usage_count: number;            // 使用次数
  effectiveness_score?: number;   // 效果评分 [0-1]
  metadata?: {
    language?: 'zh' | 'en';
    tone?: 'professional' | 'friendly' | 'concise';
    max_length?: number;          // 最大长度
  };
}

// 示例
{
  "template_id": "rapid_iteration_guidance",
  "template_type": "guidance",
  "name": "快速迭代指导模板",
  "content": "根据以下最佳实践指导本次任务：\n\n【目标】{goal}\n【关键步骤】{steps}\n【注意事项】{cautions}\n【预期结果】{expected_outcome}\n\n请在思考和行动中参考以上指导。",
  "variables": ["goal", "steps", "cautions", "expected_outcome"],
  "applicable_tags": ["rapid_iteration", "agile_execution"],
  "guidance_level": "medium",
  "created_at": 1701234567890,
  "updated_at": 1701234567890,
  "usage_count": 156,
  "effectiveness_score": 0.88,
  "metadata": {
    "language": "zh",
    "tone": "professional",
    "max_length": 500
  }
}
```

## 4. 数据库表结构设计

### 4.1 SQLite 表结构

#### type_vocabulary 表
```sql
CREATE TABLE type_vocabulary (
  tag_name TEXT PRIMARY KEY,
  keywords TEXT NOT NULL, -- JSON array
  confidence REAL NOT NULL DEFAULT 0.0,
  first_identified INTEGER NOT NULL,
  playbook_count INTEGER NOT NULL DEFAULT 0,
  discovered_from TEXT NOT NULL CHECK (discovered_from IN ('historical_clustering', 'manual_creation', 'llm_suggestion')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  metadata TEXT -- JSON object
);

-- 索引
CREATE INDEX idx_type_vocabulary_confidence ON type_vocabulary(confidence DESC);
CREATE INDEX idx_type_vocabulary_playbook_count ON type_vocabulary(playbook_count DESC);
CREATE INDEX idx_type_vocabulary_created ON type_vocabulary(created_at DESC);
```

#### type_similarity_matrix 表
```sql
CREATE TABLE type_similarity_matrix (
  tag1 TEXT NOT NULL,
  tag2 TEXT NOT NULL,
  similarity_score REAL NOT NULL,
  co_occurrence_count INTEGER NOT NULL DEFAULT 0,
  last_updated INTEGER NOT NULL,
  PRIMARY KEY (tag1, tag2),
  FOREIGN KEY (tag1) REFERENCES type_vocabulary(tag_name),
  FOREIGN KEY (tag2) REFERENCES type_vocabulary(tag_name)
);

-- 索引
CREATE INDEX idx_similarity_score ON type_similarity_matrix(similarity_score DESC);
CREATE INDEX idx_similarity_tags ON type_similarity_matrix(tag1, tag2);
```

#### type_evolution_history 表
```sql
CREATE TABLE type_evolution_history (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'merged', 'deprecated', 'split', 'confidence_updated')),
  tag_name TEXT NOT NULL,
  previous_state TEXT, -- JSON
  new_state TEXT, -- JSON
  reason TEXT NOT NULL,
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('automatic', 'manual', 'llm_analysis')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (tag_name) REFERENCES type_vocabulary(tag_name)
);

-- 索引
CREATE INDEX idx_evolution_tag ON type_evolution_history(tag_name);
CREATE INDEX idx_evolution_date ON type_evolution_history(created_at DESC);
CREATE INDEX idx_evolution_type ON type_evolution_history(event_type);
```

#### playbook_type_assignments 表
```sql
CREATE TABLE playbook_type_assignments (
  playbook_id TEXT NOT NULL,
  tag_name TEXT NOT NULL,
  confidence REAL NOT NULL,
  assigned_method TEXT NOT NULL CHECK (assigned_method IN ('automatic', 'manual')),
  assigned_at INTEGER NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  verified_at INTEGER,
  verified_by TEXT,
  PRIMARY KEY (playbook_id, tag_name),
  FOREIGN KEY (tag_name) REFERENCES type_vocabulary(tag_name)
);

-- 索引
CREATE INDEX idx_assignment_playbook ON playbook_type_assignments(playbook_id);
CREATE INDEX idx_assignment_tag ON playbook_type_assignments(tag_name);
CREATE INDEX idx_assignment_confidence ON playbook_type_assignments(confidence DESC);
```

#### prompt_templates 表
```sql
CREATE TABLE prompt_templates (
  template_id TEXT PRIMARY KEY,
  template_type TEXT NOT NULL CHECK (template_type IN ('guidance', 'constraint', 'framework', 'example')),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  variables TEXT NOT NULL, -- JSON array
  applicable_tags TEXT NOT NULL, -- JSON array
  guidance_level TEXT CHECK (guidance_level IN ('light', 'medium', 'intensive')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  effectiveness_score REAL,
  metadata TEXT -- JSON object
);

-- 索引
CREATE INDEX idx_template_type ON prompt_templates(template_type);
CREATE INDEX idx_template_tags ON prompt_templates(applicable_tags); -- JSON search
CREATE INDEX idx_template_effectiveness ON prompt_templates(effectiveness_score DESC);
```

### 4.2 LanceDB 扩展

#### 现有字段保留
```json
{
  "name": "playbook_id",
  "description": "Playbook description",
  "tags": ["playbook", "type1", "type2"],
  "metadata": {
    "type": "strategic_playbook",
    "playbookId": "pb_123",
    // ... 现有字段
  }
}
```

#### 新增字段
```json
{
  "metadata": {
    // 现有字段...
    "type_tags": ["rapid_iteration", "data_driven"],  // 新增
    "type_confidence": {                               // 新增
      "rapid_iteration": 0.92,
      "data_driven_decision": 0.88
    },
    "prompt_template_id": "rapid_iteration_guidance",  // 新增
    "guidance_level": "medium"                         // 新增
  }
}
```

## 5. 数据迁移策略

### 5.1 迁移阶段

#### 阶段1: 创建新表
```sql
-- 在现有数据库中创建新表
-- 不影响现有功能
```

#### 阶段2: 数据迁移脚本
```typescript
// 伪代码
async function migratePlaybookTypes() {
  // 1. 读取所有现有 Playbook
  const playbooks = await getAllPlaybooks();

  // 2. 将单一 type 转换为 type_tags
  for (const pb of playbooks) {
    const typeTags = pb.type ? [pb.type] : [];
    const typeConfidence = pb.type ? { [pb.type]: 1.0 } : {};

    await updatePlaybook(pb.id, {
      type_tags: typeTags,
      type_confidence: typeConfidence
    });
  }

  // 3. 从历史数据中归纳初始类型词汇表
  await induceInitialTypes();
}
```

#### 阶段3: 验证迁移
- 验证数据一致性
- 验证引用完整性
- 性能测试

#### 阶段4: 清理旧字段
```sql
-- 所有数据迁移完成后，删除旧字段
ALTER TABLE strategic_playbook DROP COLUMN type;
```

### 5.2 回滚策略
```sql
-- 如需回滚，可从备份恢复
-- 或使用 evolution_history 表记录进行逆向操作
```

## 6. 数据访问层设计

### 6.1 TypeVocabularyService

```typescript
class TypeVocabularyService {
  // 创建新类型标签
  async createTag(tag: Omit<TypeVocabulary, 'created_at' | 'updated_at'>): Promise<TypeVocabulary>

  // 获取所有标签
  async getAllTags(): Promise<TypeVocabulary[]>

  // 根据置信度筛选
  async getTagsByConfidence(minConfidence: number): Promise<TypeVocabulary[]>

  // 更新标签置信度
  async updateConfidence(tagName: string, newConfidence: number): Promise<void>

  // 合并相似标签
  async mergeTags(sourceTag: string, targetTag: string): Promise<void>

  // 标记为衰退
  async markAsDecaying(tagName: string): Promise<void>
}
```

### 6.2 PlaybookTypeService

```typescript
class PlaybookTypeService {
  // 为 Playbook 分配类型标签
  async assignType(playbookId: string, tagName: string, confidence: number): Promise<void>

  // 移除类型标签
  async unassignType(playbookId: string, tagName: string): Promise<void>

  // 获取 Playbook 的所有类型标签
  async getPlaybookTypes(playbookId: string): Promise<PlaybookTypeAssignment[]>

  // 批量更新置信度
  async batchUpdateConfidence(updates: Array<{playbookId: string, tagName: string, confidence: number}>): Promise<void>
}
```

### 6.3 SimilarityService

```typescript
class SimilarityService {
  // 计算两个标签的相似度
  async calculateSimilarity(tag1: string, tag2: string): Promise<number>

  // 获取标签的相似标签
  async getSimilarTags(tagName: string, threshold: number = 0.7): Promise<TypeSimilarityMatrix[]>

  // 更新相似度矩阵
  async updateSimilarityMatrix(): Promise<void>
}
```

## 7. 性能优化

### 7.1 索引策略
- **高频查询字段**: 所有外键字段建立索引
- **排序字段**: confidence, effectiveness_score, similarity_score
- **时间字段**: created_at, updated_at, last_used

### 7.2 缓存策略
- **类型词汇表**: Redis 缓存，24h TTL
- **相似度矩阵**: 内存缓存，定期更新
- **Playbook-类型关联**: L2 缓存

### 7.3 分区策略
```sql
-- 按时间分区 evolution_history 表
CREATE TABLE type_evolution_history_2025_01 PARTITION OF type_evolution_history
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

## 8. 数据质量保证

### 8.1 约束规则
- tag_name: 非空、唯一、字母数字下划线
- confidence: [0, 1] 范围
- similarity_score: [0, 1] 范围
- playbook_id: 外键约束

### 8.2 验证机制
```typescript
// 数据验证示例
function validateTypeVocabulary(tag: TypeVocabulary): ValidationResult {
  const errors: string[] = [];

  if (!tag.tag_name || !/^[a-z0-9_]+$/.test(tag.tag_name)) {
    errors.push('tag_name must be non-empty alphanumeric + underscore');
  }

  if (tag.confidence < 0 || tag.confidence > 1) {
    errors.push('confidence must be in [0, 1]');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
```

### 8.3 数据清理
```sql
-- 删除衰退类型（90天未使用且置信度 < 0.5）
DELETE FROM type_vocabulary
WHERE decay_score > 0.7
  AND playbook_count < 5
  AND updated_at < (unixepoch() - 90 * 24 * 60 * 60);
```

## 9. 监控指标

### 9.1 数据质量指标
- 类型标签数量增长趋势
- 平均置信度分布
- 相似度矩阵覆盖率
- 数据一致性检查结果

### 9.2 性能指标
- 查询响应时间 (P50, P95, P99)
- 缓存命中率
- 索引使用率
- 锁等待时间

### 9.3 业务指标
- 类型归纳准确率
- 模板使用效果评分
- Playbook 匹配成功率

## 10. 备份与恢复

### 10.1 备份策略
- **全量备份**: 每日凌晨
- **增量备份**: 每小时
- ** WAL 模式**: 实时增量

### 10.2 恢复流程
```bash
# 恢复示例
sqlite3 playbook.db ".backup backup_$(date +%Y%m%d_%H%M%S).db"
```

---

**下一步行动**: 请查看 `03-CORE-COMPONENTS-DESIGN.md` 了解核心组件的详细设计。
