# Playbook 系统架构改造 - 迁移指南

## 文档信息
- **文档版本**: v1.0.0
- **创建日期**: 2025-12-18
- **作者**: 迁移团队
- **状态**: 待评审

## 1. 迁移概览

### 1.1 迁移目标
将现有 Playbook 系统从"固定类型+强制执行"平滑迁移到"动态类型+提示词注入"模式，确保业务连续性和数据完整性。

### 1.2 迁移原则
- **渐进式迁移**: 分阶段、分模块迁移
- **向后兼容**: 保持现有 API 不变
- **可回滚**: 任何阶段都可快速回滚
- **数据安全**: 保证数据不丢失、不损坏

### 1.3 迁移范围

#### 涉及组件
- ✅ PlaybookManager - 需要改造
- ✅ PlaybookMatcher - 需要重写
- ✅ PlaybookExecutor - 改造为 PlaybookInjector
- 🆕 TypeInductionEngine - 新增
- 🆕 PlaybookTemplateManager - 新增
- 🆕 相关数据表 - 新增

#### 不涉及组件
- ChatService - 仅集成点修改
- ReActStrategy - 仅 prepare() 方法增强
- SystemPromptService - 扩展功能
- VariableEngine - 增强功能

### 1.4 迁移时间线
```
Week 1: 准备阶段
├─ 环境准备
├─ 数据备份
├─ 迁移工具开发
└─ 测试验证

Week 2-3: 数据迁移
├─ 创建新表
├─ 迁移现有数据
├─ 验证数据完整性
└─ 性能对比测试

Week 4-5: 功能切换
├─ 代码部署
├─ 功能开关
├─ 灰度验证
└─ 全量切换

Week 6: 优化收尾
├─ 性能优化
├─ 清理旧代码
└─ 文档完善
```

## 2. 迁移前准备

### 2.1 环境准备

#### 开发环境
```bash
# 1. 备份当前代码
git checkout -b backup/pre-migration
git push origin backup/pre-migration

# 2. 创建迁移分支
git checkout -b feature/playbook-migration

# 3. 安装新依赖
npm install better-sqlite3  # 如果尚未安装

# 4. 创建迁移目录
mkdir -p src/database/migrations
mkdir -p scripts/migration
```

#### 测试环境
```bash
# 1. 复制生产数据 (脱敏)
cp /path/to/production/data.db /path/to/test/data_migration_test.db

# 2. 配置测试数据库
export DATABASE_URL=file:./data_migration_test.db

# 3. 启动测试服务
npm run dev -- --test-mode
```

### 2.2 数据备份

#### 完整备份
```bash
# 1. 备份向量数据库
cp -r /path/to/lancedb /path/to/lancedb_backup_$(date +%Y%m%d)

# 2. 备份配置文件
cp config/admin-config.json config/admin-config_backup_$(date +%Y%m%d).json

# 3. 导出 Playbook 数据
sqlite3 data.db ".dump strategic_playbook" > backup_playbook_$(date +%Y%m%d).sql

# 4. 压缩备份
tar -czf apex_bridge_backup_$(date +%Y%m%d).tar.gz \
  lancedb_backup_* \
  config/admin-config_backup_*.json \
  backup_playbook_*.sql
```

#### 验证备份
```bash
# 验证 SQL 备份
sqlite3 /tmp/test_restore.db < backup_playbook_20241218.sql
sqlite3 /tmp/test_restore.db "SELECT COUNT(*) FROM strategic_playbook;"

# 验证文件完整性
tar -tzf apex_bridge_backup_20241218.tar.gz
```

### 2.3 迁移工具开发

#### 创建迁移脚本
```typescript
// scripts/migration/migrate-playbook-types.ts

import Database from 'better-sqlite3';
import { StrategicPlaybook } from '../../src/types/playbook';

interface MigrationConfig {
  batchSize: number;
  dryRun: boolean;
  verifyData: boolean;
}

class PlaybookTypeMigration {
  private db: Database.Database;
  private config: MigrationConfig;

  constructor(dbPath: string, config: MigrationConfig) {
    this.db = new Database(dbPath);
    this.config = config;
  }

  async run(): Promise<MigrationResult> {
    console.log('🚀 开始 Playbook 类型迁移...');

    const result: MigrationResult = {
      totalPlaybooks: 0,
      migratedPlaybooks: 0,
      errors: [],
      warnings: []
    };

    try {
      // 1. 创建新表
      await this.createNewTables();

      // 2. 迁移数据
      const playbooks = this.getAllPlaybooks();
      result.totalPlaybooks = playbooks.length;

      for (const playbook of playbooks) {
        try {
          await this.migratePlaybook(playbook, result);
        } catch (error) {
          result.errors.push({
            playbookId: playbook.id,
            error: (error as Error).message
          });
        }
      }

      // 3. 验证数据
      if (this.config.verifyData) {
        await this.verifyMigration(result);
      }

      console.log('✅ 迁移完成!', result);
      return result;

    } catch (error) {
      console.error('❌ 迁移失败:', error);
      throw error;
    }
  }

  private async createNewTables(): Promise<void> {
    const migrations = [
      `CREATE TABLE IF NOT EXISTS type_vocabulary (
        tag_name TEXT PRIMARY KEY,
        keywords TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.0,
        first_identified INTEGER NOT NULL,
        playbook_count INTEGER NOT NULL DEFAULT 0,
        discovered_from TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS type_similarity_matrix (
        tag1 TEXT NOT NULL,
        tag2 TEXT NOT NULL,
        similarity_score REAL NOT NULL,
        co_occurrence_count INTEGER NOT NULL DEFAULT 0,
        last_updated INTEGER NOT NULL,
        PRIMARY KEY (tag1, tag2)
      )`,
      // ... 其他表
    ];

    for (const migration of migrations) {
      this.db.exec(migration);
    }

    console.log('✅ 新表创建完成');
  }

  private getAllPlaybooks(): StrategicPlaybook[] {
    // 从向量数据库或现有存储中获取所有 Playbook
    // 这里简化处理，实际应从 LanceDB 获取
    return [];
  }

  private async migratePlaybook(
    playbook: StrategicPlaybook,
    result: MigrationResult
  ): Promise<void> {
    if (this.config.dryRun) {
      console.log(`[DRY RUN] 将迁移 Playbook: ${playbook.id}`);
      result.migratedPlaybooks++;
      return;
    }

    // 1. 将单一 type 转换为 type_tags
    const typeTags = playbook.type ? [playbook.type] : [];
    const typeConfidence = playbook.type ? { [playbook.type]: 1.0 } : {};

    // 2. 更新 Playbook
    const updateStmt = this.db.prepare(`
      UPDATE strategic_playbook
      SET type_tags = ?,
          type_confidence = ?,
          updated_at = ?
      WHERE id = ?
    `);

    updateStmt.run(
      JSON.stringify(typeTags),
      JSON.stringify(typeConfidence),
      Date.now(),
      playbook.id
    );

    // 3. 记录迁移信息
    if (playbook.type) {
      const insertStmt = this.db.prepare(`
        INSERT INTO playbook_type_assignments (
          playbook_id, tag_name, confidence, assigned_method, assigned_at
        ) VALUES (?, ?, ?, 'migration', ?)
      `);

      insertStmt.run(playbook.id, playbook.type, 1.0, Date.now());
    }

    result.migratedPlaybooks++;
  }

  private async verifyMigration(result: MigrationResult): Promise<void> {
    // 验证数据一致性
    const countStmt = this.db.prepare(`
      SELECT COUNT(*) FROM strategic_playbook
      WHERE type_tags IS NOT NULL
    `);

    const migratedCount = countStmt.get() as { COUNT: number };

    if (migratedCount.COUNT !== result.totalPlaybooks) {
      result.warnings.push(
        `迁移数量不匹配: 期望 ${result.totalPlaybooks}, 实际 ${migratedCount.COUNT}`
      );
    }

    console.log('✅ 数据验证完成');
  }
}

// 使用示例
async function main() {
  const config: MigrationConfig = {
    batchSize: 1000,
    dryRun: true, // 先试运行
    verifyData: true
  };

  const migration = new PlaybookTypeMigration('data.db', config);
  const result = await migration.run();

  if (!config.dryRun) {
    console.log('Migration completed:', result);
  }
}

main().catch(console.error);
```

#### 运行迁移脚本
```bash
# 1. 试运行 (dry run)
npx ts-node scripts/migration/migrate-playbook-types.ts

# 2. 实际迁移
npx ts-node scripts/migration/migrate-playbook-types.ts --execute

# 3. 验证迁移
npx ts-node scripts/migration/verify-migration.ts
```

## 3. 数据迁移方案

### 3.1 现有数据结构

#### 当前 Playbook 表
```sql
CREATE TABLE strategic_playbook (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT,                    -- ⚠️ 将被废弃
  version TEXT,
  status TEXT,
  context TEXT,                 -- JSON
  trigger TEXT,                 -- JSON
  actions TEXT,                 -- JSON
  -- ... 其他字段
);
```

#### 当前数据示例
```json
{
  "id": "pb_123",
  "name": "快速迭代问题解决",
  "description": "通过最小可行实验快速验证假设",
  "type": "problem_solving",     -- 单一类型
  "actions": [                   -- 强制执行步骤
    {
      "step": 1,
      "description": "明确问题边界",
      "expectedOutcome": "清晰的问题定义"
    }
  ]
}
```

### 3.2 目标数据结构

#### 新增字段
```sql
ALTER TABLE strategic_playbook ADD COLUMN type_tags TEXT;
ALTER TABLE strategic_playbook ADD COLUMN type_confidence TEXT;
ALTER TABLE strategic_playbook ADD COLUMN prompt_template_id TEXT;
ALTER TABLE strategic_playbook ADD COLUMN guidance_level TEXT;
ALTER TABLE strategic_playbook ADD COLUMN guidance_steps TEXT;
```

#### 迁移后数据示例
```json
{
  "id": "pb_123",
  "name": "快速迭代问题解决",
  "description": "通过最小可行实验快速验证假设",
  "type": "problem_solving",      -- 保留向后兼容
  "type_tags": [                  -- 🆕 多标签
    "rapid_iteration",
    "agile_execution"
  ],
  "type_confidence": {            -- 🆕 置信度
    "rapid_iteration": 0.92,
    "agile_execution": 0.85
  },
  "prompt_template_id": "rapid_iteration_guidance",  -- 🆕 模板
  "guidance_level": "medium",      -- 🆕 指导强度
  "guidance_steps": [              -- 🆕 指导步骤 (非强制)
    {
      "id": "step_1",
      "description": "明确问题边界",
      "expected_outcome": "清晰的问题定义",
      "key_points": ["具体", "可衡量"],
      "optional": false
    }
  ]
}
```

### 3.3 迁移步骤详解

#### 步骤 1: 创建新表
```sql
-- 创建类型词汇表
CREATE TABLE type_vocabulary (
  tag_name TEXT PRIMARY KEY,
  keywords TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.0,
  first_identified INTEGER NOT NULL,
  playbook_count INTEGER NOT NULL DEFAULT 0,
  discovered_from TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  metadata TEXT
);

-- 创建类型相似度矩阵
CREATE TABLE type_similarity_matrix (
  tag1 TEXT NOT NULL,
  tag2 TEXT NOT NULL,
  similarity_score REAL NOT NULL,
  co_occurrence_count INTEGER NOT NULL DEFAULT 0,
  last_updated INTEGER NOT NULL,
  PRIMARY KEY (tag1, tag2)
);

-- 创建类型演进历史
CREATE TABLE type_evolution_history (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  tag_name TEXT NOT NULL,
  previous_state TEXT,
  new_state TEXT,
  reason TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- 创建 Playbook-类型关联
CREATE TABLE playbook_type_assignments (
  playbook_id TEXT NOT NULL,
  tag_name TEXT NOT NULL,
  confidence REAL NOT NULL,
  assigned_method TEXT NOT NULL,
  assigned_at INTEGER NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  verified_at INTEGER,
  verified_by TEXT,
  PRIMARY KEY (playbook_id, tag_name)
);

-- 创建提示词模板
CREATE TABLE prompt_templates (
  template_id TEXT PRIMARY KEY,
  template_type TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  variables TEXT NOT NULL,
  applicable_tags TEXT NOT NULL,
  guidance_level TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  effectiveness_score REAL,
  metadata TEXT
);
```

#### 步骤 2: 迁移现有类型
```sql
-- 将现有 type 字段转换为 type_tags
UPDATE strategic_playbook
SET
  type_tags = json_array(type),
  type_confidence = json_object(type, 1.0),
  guidance_level = 'medium',
  updated_at = unixepoch()
WHERE type IS NOT NULL;

-- 记录迁移历史
INSERT INTO type_evolution_history (
  id,
  event_type,
  tag_name,
  previous_state,
  new_state,
  reason,
  triggered_by,
  created_at
)
SELECT
  'mig_' || id || '_' || type,
  'created',
  type,
  NULL,
  json_object('confidence', 1.0, 'playbook_count', 1),
  '从原有 type 字段迁移',
  'migration',
  unixepoch()
FROM (
  SELECT DISTINCT id, type
  FROM strategic_playbook
  WHERE type IS NOT NULL
);
```

#### 步骤 3: 初始化类型词汇表
```sql
-- 插入从历史数据归纳的初始类型
INSERT INTO type_vocabulary (
  tag_name, keywords, confidence, first_identified,
  playbook_count, discovered_from, created_at, updated_at
)
SELECT
  type as tag_name,
  json_array(type) as keywords,
  1.0 as confidence,
  min(created_at) as first_identified,
  COUNT(*) as playbook_count,
  'historical_migration' as discovered_from,
  min(created_at) as created_at,
  unixepoch() as updated_at
FROM strategic_playbook
WHERE type IS NOT NULL
GROUP BY type;
```

#### 步骤 4: 初始化提示词模板
```sql
-- 插入基础模板
INSERT INTO prompt_templates (
  template_id, template_type, name, content,
  variables, applicable_tags, guidance_level,
  created_at, updated_at
) VALUES
(
  'generic_guidance',
  'guidance',
  '通用指导模板',
  '根据以下最佳实践指导本次任务：\n\n【目标】{goal}\n【步骤】{steps}\n\n请在思考和行动中参考以上指导。',
  json_array('goal', 'steps'),
  json_array(),
  'medium',
  unixepoch(),
  unixepoch()
),
(
  'rapid_iteration_guidance',
  'guidance',
  '快速迭代指导模板',
  '根据以下快速迭代最佳实践指导本次任务：\n\n【目标】{goal}\n【关键步骤】{steps}\n【注意事项】{cautions}\n【预期结果】{expected_outcome}\n\n请在思考和行动中参考以上指导。',
  json_array('goal', 'steps', 'cautions', 'expected_outcome'),
  json_array('rapid_iteration', 'agile_execution'),
  'medium',
  unixepoch(),
  unixepoch()
);
```

#### 步骤 5: 验证迁移
```sql
-- 验证 1: 检查所有 Playbook 都有 type_tags
SELECT
  COUNT(*) as total,
  COUNT(type_tags) as has_type_tags
FROM strategic_playbook;

-- 验证 2: 检查类型词汇表
SELECT tag_name, playbook_count, confidence
FROM type_vocabulary
ORDER BY playbook_count DESC;

-- 验证 3: 检查关联表
SELECT
  pta.tag_name,
  COUNT(*) as assignment_count
FROM playbook_type_assignments pta
GROUP BY pta.tag_name;
```

### 3.4 增量迁移策略

#### 分批迁移
```typescript
// 迁移大批量数据时，分批处理避免锁表

class BatchMigration {
  async migrateInBatches(batchSize: number = 1000): Promise<void> {
    let offset = 0;

    while (true) {
      const batch = this.getPlaybookBatch(offset, batchSize);

      if (batch.length === 0) {
        break;
      }

      // 开启事务
      const transaction = this.db.transaction((playbooks) => {
        for (const playbook of playbooks) {
          this.migratePlaybook(playbook);
        }
      });

      transaction(batch);

      offset += batchSize;

      // 避免长时间锁表
      await this.sleep(100);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## 4. 代码迁移方案

### 4.1 文件变更清单

#### 新增文件
```
src/core/playbook/
├── TypeInductionEngine.ts          # 类型归纳引擎
├── PlaybookTemplateManager.ts      # 模板管理器
├── PlaybookInjector.ts             # 提示词注入器
└── types.ts                        # 新增类型定义

src/services/
├── TypeVocabularyService.ts        # 类型词汇表服务
├── PlaybookTypeService.ts          # Playbook类型服务
├── SimilarityService.ts            # 相似度服务
└── PromptTemplateService.ts        # 模板服务

src/database/migrations/
├── 001_create_type_vocabulary.sql
├── 002_create_type_similarity_matrix.sql
├── 003_create_type_evolution_history.sql
├── 004_create_playbook_type_assignments.sql
└── 005_create_prompt_templates.sql

scripts/migration/
├── migrate-playbook-types.ts
└── verify-migration.ts
```

#### 修改文件
```
src/services/
├── PlaybookManager.ts              # 添加 type_tags 支持
├── PlaybookMatcher.ts              # 重写匹配算法
├── SystemPromptService.ts          # 扩展模板功能
└── VariableEngine.ts               # 增强变量解析

src/strategies/
└── ReActStrategy.ts                # 集成 Playbook 注入

src/types/
└── playbook.ts                     # 扩展 Playbook 接口
```

#### 废弃文件（延迟删除）
```
src/services/
└── PlaybookExecutor.ts             # 标记为废弃，6个月后删除
```

### 4.2 代码改造示例

#### PlaybookManager 改造
```typescript
// 修改 src/services/PlaybookManager.ts

interface StrategicPlaybook {
  // 现有字段...
  id: string;
  name: string;
  description: string;

  // 🆕 新增字段
  type_tags?: string[];
  type_confidence?: Record<string, number>;
  prompt_template_id?: string;
  guidance_level?: 'light' | 'medium' | 'intensive';
  guidance_steps?: GuidanceStep[];

  // ⚠️ 保留字段 (向后兼容)
  type?: string;                    // 迁移后保留一段时间
  actions?: PlaybookAction[];       // 迁移后保留一段时间
}

class PlaybookManager {
  // 🆕 新增：获取多标签
  async getPlaybookTags(playbookId: string): Promise<string[]> {
    const playbook = await this.getPlaybook(playbookId);
    return playbook?.type_tags || [];
  }

  // 🆕 新增：分配类型标签
  async assignTypeTag(
    playbookId: string,
    tagName: string,
    confidence: number
  ): Promise<void> {
    const playbook = await this.getPlaybook(playbookId);
    if (!playbook) throw new Error('Playbook not found');

    const typeTags = playbook.type_tags || [];
    const typeConfidence = playbook.type_confidence || {};

    if (!typeTags.includes(tagName)) {
      typeTags.push(tagName);
      typeConfidence[tagName] = confidence;

      await this.updatePlaybook(playbookId, {
        type_tags: typeTags,
        type_confidence: typeConfidence
      });

      // 更新关联表
      await this.playbookTypeService.assignType(playbookId, tagName, confidence);
    }
  }

  // 🆕 新增：自动类型归纳
  async autoInduceTypes(): Promise<InducedType[]> {
    const engine = new TypeInductionEngine(
      this.config,
      this.llmManager,
      this.typeVocabularyService,
      this.similarityService
    );

    return await engine.induceTypes('historical');
  }
}
```

#### PlaybookExecutor → PlaybookInjector 迁移
```typescript
// 重命名 src/services/PlaybookExecutor.ts → src/core/playbook/PlaybookInjector.ts

export class PlaybookInjector {
  /**
   * 🆕 主要方法：从强制执行改为提示词注入
   */
  async injectGuidance(
    playbook: StrategicPlaybook,
    context: MatchingContext,
    options: InjectionOptions = {}
  ): Promise<InjectionResult> {
    // 替代原有的强制执行逻辑
    // 详见 03-CORE-COMPONENTS-DESIGN.md
  }

  /**
   * ⚠️ 保留方法 (向后兼容)
   * 标记为废弃，6个月后删除
   * @deprecated use injectGuidance() instead
   */
  async executePlan(
    plan: PlaybookPlan,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    logger.warn('[PlaybookExecutor] 已废弃，使用 PlaybookInjector 替代');

    // 简单的降级处理
    return {
      success: false,
      output: 'PlaybookExecutor 已废弃，请使用新的注入机制',
      duration: 0,
      steps_completed: 0,
      reason: 'deprecated'
    };
  }
}
```

### 4.3 数据库迁移脚本

#### 自动迁移脚本
```bash
#!/bin/bash
# scripts/migration/run-migration.sh

set -e

echo "🚀 开始 Playbook 系统迁移..."

# 1. 检查环境
echo "📋 检查环境..."
if [ ! -f ".env" ]; then
  echo "❌ .env 文件不存在"
  exit 1
fi

# 2. 备份数据
echo "💾 备份现有数据..."
BACKUP_DIR="backup/migration_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

cp data.db "$BACKUP_DIR/"
cp -r data/lancedb "$BACKUP_DIR/" 2>/dev/null || true

# 3. 运行数据库迁移
echo "🗄️ 运行数据库迁移..."
npx ts-node scripts/migration/migrate-database.ts

# 4. 运行数据迁移
echo "📊 运行数据迁移..."
npx ts-node scripts/migration/migrate-playbook-types.ts --execute

# 5. 验证迁移
echo "✅ 验证迁移结果..."
npx ts-node scripts/migration/verify-migration.ts

# 6. 部署新代码
echo "🚀 部署新代码..."
npm run build

# 7. 重启服务
echo "🔄 重启服务..."
pm2 restart apex-bridge || npm start &

echo "✅ 迁移完成!"
echo "📝 请查看 $BACKUP_DIR 了解备份位置"
```

## 5. 功能切换方案

### 5.1 功能开关

#### 配置开关
```json
// config/migration.json
{
  "features": {
    "dynamic_types": {
      "enabled": false,
      "phase": "disabled" | "enabled" | "required"
    },
    "playbook_injection": {
      "enabled": false,
      "guidance_level": "auto",
      "fallback_enabled": true
    },
    "multi_tag_matching": {
      "enabled": false,
      "min_match_score": 0.6
    }
  },
  "rollout": {
    "percentage": 0,      // 灰度百分比
    "start_time": null,
    "end_time": null
  }
}
```

#### 代码中的开关使用
```typescript
// src/config/index.ts

export const migrationConfig = {
  dynamicTypesEnabled: process.env.DYNAMIC_TYPES_ENABLED === 'true',
  playbookInjectionEnabled: process.env.PLAYBOOK_INJECTION_ENABLED === 'true',
  rolloutPercentage: parseInt(process.env.ROLLOUT_PERCENTAGE || '0', 10)
};

// src/services/PlaybookMatcher.ts

class PlaybookMatcher {
  async matchPlaybooks(
    context: MatchingContext,
    config: PlaybookRecommendationConfig
  ): Promise<PlaybookMatch[]> {
    // 根据开关选择算法
    if (migrationConfig.dynamicTypesEnabled) {
      return await this.matchPlaybooksDynamic(context, config);
    } else {
      return await this.matchPlaybooksLegacy(context, config);
    }
  }
}
```

### 5.2 灰度发布

#### 阶段 1: 内部测试 (10%)
```bash
# 启动配置
export ROLLOUT_PERCENTAGE=10
export FEATURE_FLAGS='{"dynamic_types": true}'

# 监控指标
- 错误率 < 1%
- 响应时间 P95 < 200ms
- 匹配准确率 > 80%
```

#### 阶段 2: 部分用户 (50%)
```bash
# 启动配置
export ROLLOUT_PERCENTAGE=50
export FEATURE_FLAGS='{"dynamic_types": true, "playbook_injection": true}'
```

#### 阶段 3: 全量用户 (100%)
```bash
# 启动配置
export ROLLOUT_PERCENTAGE=100
export FEATURE_FLAGS='{"dynamic_types": true, "playbook_injection": true, "multi_tag_matching": true}'

# 观察 24 小时
```

### 5.3 回滚机制

#### 自动回滚触发条件
```typescript
// 监控服务

class MigrationMonitor {
  checkRollbackConditions(): boolean {
    const metrics = this.getMetrics();

    return (
      metrics.errorRate > 0.05 ||           // 错误率 > 5%
      metrics.responseTimeP95 > 500 ||      // P95 响应时间 > 500ms
      metrics.userComplaints > 10 ||        // 用户投诉 > 10 个
      metrics.matchAccuracy < 0.7           // 匹配准确率 < 70%
    );
  }

  async triggerRollback(): Promise<void> {
    logger.error('检测到回滚条件，触发自动回滚');

    // 1. 关闭新功能
    await this.configService.updateConfig({
      'features.dynamic_types.enabled': false,
      'features.playbook_injection.enabled': false,
      'rollout_percentage': 0
    });

    // 2. 重启服务
    await this.serviceManager.restartServices();

    // 3. 通知团队
    await this.notificationService.sendAlert(
      'Migration rollback triggered',
      JSON.stringify(this.getMetrics())
    );
  }
}
```

#### 手动回滚步骤
```bash
#!/bin/bash
# scripts/migration/rollback.sh

echo "🔄 开始回滚..."

# 1. 恢复旧配置
export FEATURE_FLAGS='{"dynamic_types": false, "playbook_injection": false}'
export ROLLOUT_PERCENTAGE=0

# 2. 恢复旧代码 (如果需要)
git checkout backup/pre-migration

# 3. 重启服务
pm2 restart apex-bridge

# 4. 验证服务正常
curl -f http://localhost:3000/health || exit 1

echo "✅ 回滚完成"
```

## 6. 数据验证

### 6.1 迁移后验证清单

#### 数据完整性验证
```sql
-- ✅ 验证 1: 所有 Playbook 都有 type_tags
SELECT
  COUNT(*) as total_playbooks,
  COUNT(type_tags) as has_type_tags
FROM strategic_playbook;

-- 应该返回: total_playbooks = has_type_tags

-- ✅ 验证 2: type_confidence 格式正确
SELECT
  COUNT(*) as total,
  COUNT(CASE WHEN json_valid(type_confidence) THEN 1 END) as valid_confidence
FROM strategic_playbook
WHERE type_confidence IS NOT NULL;

-- 应该返回: total = valid_confidence

-- ✅ 验证 3: 关联表数据一致
SELECT
  (SELECT COUNT(*) FROM strategic_playbook WHERE type_tags IS NOT NULL) as pb_with_tags,
  (SELECT COUNT(DISTINCT playbook_id) FROM playbook_type_assignments) as assigned_playbooks;

-- 应该返回: pb_with_tags = assigned_playbooks

-- ✅ 验证 4: 类型词汇表
SELECT
  tag_name,
  playbook_count,
  confidence
FROM type_vocabulary
ORDER BY playbook_count DESC;

-- 应该返回: 有数据，且 confidence 在 [0,1] 范围内
```

#### 业务逻辑验证
```typescript
// scripts/migration/verify-business-logic.ts

async function verifyBusinessLogic(): Promise<VerificationResult> {
  const result: VerificationResult = {
    passed: [],
    failed: []
  };

  // 验证 1: 匹配算法正常
  const matches = await playbookMatcher.matchPlaybooks({
    userQuery: '如何快速迭代？',
    sessionHistory: []
  });

  if (matches.length > 0 && matches[0].matchScore > 0.5) {
    result.passed.push('匹配算法正常');
  } else {
    result.failed.push('匹配算法失败');
  }

  // 验证 2: 注入功能正常
  const injectionResult = await playbookInjector.injectGuidance(
    matches[0].playbook,
    { userQuery: '如何快速迭代？' }
  );

  if (injectionResult.success && injectionResult.guidance_applied) {
    result.passed.push('注入功能正常');
  } else {
    result.failed.push('注入功能失败');
  }

  // 验证 3: ReAct 集成正常
  const reactResult = await reactStrategy.prepare(
    [{ role: 'user', content: '如何快速迭代？' }],
    { stream: false }
  );

  if (reactResult.variables.playbook_guidance) {
    result.passed.push('ReAct 集成正常');
  } else {
    result.failed.push('ReAct 集成失败');
  }

  return result;
}
```

### 6.2 性能对比

#### 性能基准测试
```typescript
// scripts/migration/performance-test.ts

async function performanceTest(): Promise<PerformanceResult> {
  const iterations = 100;
  const results = {
    old: [] as number[],
    new: [] as number[]
  };

  console.log('🔬 运行性能测试...');

  // 测试旧算法
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await playbookMatcherLegacy.matchPlaybooks(testContext);
    results.old.push(performance.now() - start);
  }

  // 测试新算法
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await playbookMatcher.matchPlaybooksDynamic(testContext);
    results.new.push(performance.now() - start);
  }

  // 计算统计
  return {
    old: calculateStats(results.old),
    new: calculateStats(results.new),
    improvement: ((avg(results.old) - avg(results.new)) / avg(results.old)) * 100
  };
}

function calculateStats(times: number[]) {
  return {
    avg: avg(times),
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99)
  };
}
```

### 6.3 对比报告

#### 生成对比报告
```bash
#!/bin/bash
# scripts/migration/generate-comparison-report.sh

echo "📊 生成迁移对比报告..."

# 运行性能测试
npx ts-node scripts/migration/performance-test.ts > reports/performance.json

# 运行验证
npx ts-node scripts/migration/verify-business-logic.ts > reports/verification.json

# 生成 HTML 报告
npx ts-node scripts/migration/generate-report.ts \
  --input reports/performance.json \
  --input reports/verification.json \
  --output reports/migration-report.html

echo "✅ 报告已生成: reports/migration-report.html"
```

## 7. 风险应对

### 7.1 常见风险

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|----------|
| 迁移过程中服务中断 | 中 | 高 | 选择低峰期迁移，缩短迁移时间 |
| 数据丢失或损坏 | 低 | 极高 | 完整备份，多重验证 |
| 性能回退 | 中 | 中 | 提前压测，性能对比 |
| 功能不兼容 | 中 | 中 | 向后兼容，灰度发布 |
| 用户投诉 | 中 | 中 | 监控告警，快速响应 |

### 7.2 应急预案

#### 服务中断应急预案
```bash
# 1. 立即回滚
./scripts/migration/rollback.sh

# 2. 检查服务状态
curl -f http://localhost:3000/health

# 3. 恢复数据 (如需要)
sqlite3 data.db ".backup backup_emergency.db"
sqlite3 data.db ".restore backup/migration_20241218/data.db"

# 4. 重启服务
pm2 restart apex-bridge

# 5. 通知团队
curl -X POST https://hooks.slack.com/... \
  -d '{"text":"Migration rollback triggered at $(date)"}'
```

#### 数据损坏应急预案
```bash
# 1. 停止写入
pm2 stop apex-bridge

# 2. 恢复备份
rm data.db
cp backup/apex_bridge_backup_20241218.tar.gz .
tar -xzf apex_bridge_backup_20241218.tar.gz

# 3. 验证数据
sqlite3 data.db "SELECT COUNT(*) FROM strategic_playbook;"

# 4. 重启服务
pm2 start apex-bridge
```

## 8. 迁移检查清单

### 8.1 迁移前检查
- [ ] 代码已备份
- [ ] 数据已备份
- [ ] 迁移脚本已测试
- [ ] 回滚方案已验证
- [ ] 监控告警已配置
- [ ] 团队已通知
- [ ] 时间窗口已确定

### 8.2 迁移中检查
- [ ] 迁移进度实时监控
- [ ] 错误日志实时检查
- [ ] 性能指标实时跟踪
- [ ] 数据完整性实时验证
- [ ] 服务状态实时检查

### 8.3 迁移后检查
- [ ] 所有功能正常运行
- [ ] 性能指标达标
- [ ] 用户反馈正常
- [ ] 监控数据正常
- [ ] 文档已更新
- [ ] 团队培训已完成

## 9. 迁移后优化

### 9.1 清理旧代码

#### 删除废弃代码 (6个月后)
```bash
# 标记为废弃的代码，在 6 个月后清理

# 1. 确认无引用
grep -r "PlaybookExecutor" src/ --include="*.ts" || echo "无引用，可删除"

# 2. 删除文件
rm src/services/PlaybookExecutor.ts

# 3. 清理 type 字段 (可选，保留 1 年)
# ALTER TABLE strategic_playbook DROP COLUMN type;
```

#### 更新文档
```markdown
# 更新 CHANGELOG.md

## [2.0.0] - 2026-02-12

### 重大变更
- 🎉 Playbook 系统全面升级：从固定类型升级为动态类型体系
- ✨ 新增提示词注入机制，替代强制执行
- 🚀 深度集成 ReAct 策略，智能推理增强

### 新增功能
- TypeInductionEngine: 动态类型归纳引擎
- PlaybookTemplateManager: 提示词模板管理器
- PlaybookInjector: 智能提示词注入器
- 多标签匹配算法

### 破坏性变更
- PlaybookExecutor 已废弃，使用 PlaybookInjector 替代
- Playbook.type 字段保留但建议使用 type_tags

### 迁移指南
详见 docs/playbook/06-MIGRATION-GUIDE.md
```

### 9.2 持续优化

#### 监控指标持续跟踪
```typescript
// 持续监控新系统的效果

class MigrationMetrics {
  trackSuccess() {
    const metrics = {
      timestamp: Date.now(),
      match_accuracy: this.calculateMatchAccuracy(),
      user_satisfaction: this.getUserSatisfaction(),
      performance: this.getPerformanceMetrics(),
      error_rate: this.getErrorRate()
    };

    this.metricsDB.insert(metrics);
  }

  generateWeeklyReport(): WeeklyReport {
    return {
      period: this.getLastWeek(),
      total_requests: this.metricsDB.count(),
      success_rate: this.metricsDB.avg('success_rate'),
      avg_response_time: this.metricsDB.avg('response_time'),
      top_playbooks: this.getTopPlaybooks(),
      recommendations: this.generateRecommendations()
    };
  }
}
```

---

## 总结

本迁移指南提供了完整的迁移路径，从准备阶段到上线优化，确保 Playbook 系统平稳过渡到新架构。关键要点：

1. **充分准备**: 环境、数据、工具、人员
2. **渐进迁移**: 分阶段、分模块、可回滚
3. **严格验证**: 数据完整性、业务逻辑、性能对比
4. **风险控制**: 监控告警、应急预案、快速响应
5. **持续优化**: 清理旧代码、更新文档、跟踪效果

按照本指南执行，可以确保迁移过程安全、平稳、高效。

---

**下一步行动**: 请查看 `07-TESTING-STRATEGY.md` 了解测试策略。
