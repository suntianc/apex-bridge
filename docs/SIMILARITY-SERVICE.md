# SimilarityService - 标签相似度管理服务

## 概述

SimilarityService 是 Playbook 系统的核心组件之一，负责计算和管理类型标签之间的相似度关系。该服务基于关键词分析和共现统计，提供高效的相似度计算和矩阵维护功能。

## 功能特性

### 1. 核心功能

#### 1.1 相似度计算
```typescript
calculateSimilarity(tag1: string, tag2: string): Promise<number>
```

计算两个标签之间的相似度，返回值范围 [0, 1]：
- **算法**: 基于关键词的 Jaccard 相似度
- **缓存**: 自动缓存计算结果（TTL: 5分钟）
- **优化**: 智能处理共现次数，提供加权评分

#### 1.2 相似标签查询
```typescript
getSimilarTags(tagName: string, threshold?: number): Promise<TypeSimilarity[]>
```

获取指定标签的相似标签列表：
- **阈值过滤**: 可配置相似度阈值（默认 0.7）
- **排序**: 按相似度降序排列
- **缓存**: 自动缓存查询结果

#### 1.3 相似度更新
```typescript
updateSimilarity(tag1: string, tag2: string, score: number): Promise<void>
```

更新标签对的相似度分数：
- **原子操作**: 使用 UPSERT 确保数据一致性
- **验证**: 自动验证分数范围 [0, 1]
- **缓存清理**: 自动清理相关缓存

#### 1.4 共现次数管理
```typescript
incrementCoOccurrence(tag1: string, tag2: string): Promise<void>
```

增加标签对的共现次数：
- **自动计算**: 新共现时会自动计算初始相似度
- **计数统计**: 维护共现次数用于相似度加权
- **事务安全**: 使用数据库事务确保一致性

#### 1.5 矩阵更新
```typescript
updateSimilarityMatrix(): Promise<void>
```

批量更新整个相似度矩阵：
- **全量计算**: 重新计算所有标签对的相似度
- **性能优化**: 使用数据库事务批量处理
- **进度追踪**: 提供详细的更新日志

### 2. 辅助方法

#### 2.1 Jaccard 相似度
```typescript
calculateJaccardSimilarity(set1: string[], set2: string[]): number
```

计算两个关键词集合的 Jaccard 相似度：
```
Jaccard(A, B) = |A ∩ B| / |A ∪ B|
```

#### 2.2 关键词相似度
```typescript
calculateKeywordSimilarity(keywords1: string[], keywords2: string[]): number
```

综合关键词相似度计算：
- **基础算法**: Jaccard 相似度
- **大小写无关**: 自动处理大小写
- **扩展支持**: 可扩展其他相似度指标

### 3. 缓存机制

#### 3.1 缓存策略
- **TTL**: 5分钟过期时间
- **分层缓存**:
  - 相似度结果缓存
  - 相似标签列表缓存
  - 标签数据缓存

#### 3.2 缓存管理
```typescript
// 获取缓存统计
getCacheStats(): CacheStats

// 清除过期缓存
clearExpiredCache(): void

// 清除所有缓存
clearAllCaches(): void
```

### 4. 统计信息

#### 4.1 矩阵统计
```typescript
getMatrixStats(): MatrixStats
```

提供相似度矩阵的详细统计：
- 总标签对数
- 平均相似度
- 最小/最大相似度
- 高于阈值的关系对数

#### 4.2 性能指标
- 缓存命中率
- 查询响应时间
- 矩阵更新耗时

## 使用示例

### 基础使用

```typescript
import { SimilarityService } from './services/SimilarityService';

// 获取服务实例
const similarityService = SimilarityService.getInstance();

// 计算两个标签的相似度
const similarity = await similarityService.calculateSimilarity(
  'rapid_iteration',
  'agile_execution'
);
console.log(`相似度: ${similarity}`); // 0.85

// 获取相似标签
const similarTags = await similarityService.getSimilarTags('rapid_iteration');
for (const tag of similarTags) {
  console.log(`${tag.tag2}: ${tag.similarity_score}`);
}

// 增加共现次数
await similarityService.incrementCoOccurrence('tag1', 'tag2');
```

### 批量更新矩阵

```typescript
// 更新整个相似度矩阵
await similarityService.updateSimilarityMatrix();
console.log('矩阵更新完成');
```

### 缓存管理

```typescript
// 获取缓存统计
const stats = similarityService.getCacheStats();
console.log(`缓存大小: ${stats.similarityCacheSize}`);

// 清除过期缓存
similarityService.clearExpiredCache();
```

## 数据库设计

### type_similarity_matrix 表

```sql
CREATE TABLE type_similarity_matrix (
  tag1 TEXT NOT NULL,
  tag2 TEXT NOT NULL,
  similarity_score REAL NOT NULL CHECK (similarity_score >= 0.0 AND similarity_score <= 1.0),
  co_occurrence_count INTEGER NOT NULL DEFAULT 0,
  last_updated INTEGER NOT NULL,
  PRIMARY KEY (tag1, tag2),
  FOREIGN KEY (tag1) REFERENCES type_vocabulary(tag_name),
  FOREIGN KEY (tag2) REFERENCES type_vocabulary(tag_name)
);
```

### 索引优化

```sql
-- 相似度分数索引（用于排序查询）
CREATE INDEX idx_similarity_score ON type_similarity_matrix(similarity_score DESC);

-- 标签索引（用于标签查询）
CREATE INDEX idx_similarity_tag1 ON type_similarity_matrix(tag1);
CREATE INDEX idx_similarity_tag2 ON type_similarity_matrix(tag2);
```

## 性能优化

### 1. 数据库优化
- **WAL 模式**: 启用 Write-Ahead Logging 提升并发性能
- **外键约束**: 确保数据完整性
- **索引优化**: 针对常用查询字段建立索引

### 2. 缓存策略
- **内存缓存**: 5分钟 TTL 减少重复计算
- **缓存键**: 规范化标签顺序确保缓存命中
- **缓存清理**: 自动清理过期缓存项

### 3. 查询优化
- **UPSERT 操作**: 使用 INSERT ... ON CONFLICT DO UPDATE
- **批量事务**: 矩阵更新使用事务减少 I/O
- **分页查询**: 大数据集支持分页（可扩展）

## 错误处理

### 常见错误

1. **标签不存在**
   ```typescript
   try {
     await similarityService.calculateSimilarity('nonexistent', 'tag2');
   } catch (error) {
     // Error: One or both tags not found
   }
   ```

2. **无效的相似度分数**
   ```typescript
   try {
     await similarityService.updateSimilarity('tag1', 'tag2', 1.5);
   } catch (error) {
     // Error: Similarity score must be in range [0, 1]
   }
   ```

3. **相同标签比较**
   ```typescript
   try {
     await similarityService.calculateSimilarity('tag1', 'tag1');
   } catch (error) {
     // Error: Cannot calculate similarity between the same tag
   }
   ```

### 日志记录

服务提供详细的日志记录：
- **INFO**: 操作成功记录
- **DEBUG**: 详细计算过程
- **ERROR**: 错误及堆栈信息

## 最佳实践

### 1. 缓存使用
- 频繁查询的标签相似度会自动缓存
- 定期调用 `clearExpiredCache()` 清理过期缓存
- 监控缓存命中率，调整 TTL 策略

### 2. 矩阵更新
- 在批量导入标签后调用 `updateSimilarityMatrix()`
- 避免频繁全量更新，推荐定时任务
- 监控更新耗时，优化大数据集性能

### 3. 共现统计
- 在标签关联时调用 `incrementCoOccurrence()`
- 共现次数越多，相似度加权越高
- 定期分析共现模式，发现潜在关联

### 4. 阈值设置
- 高质量匹配: threshold ≥ 0.8
- 一般相似: 0.5 ≤ threshold < 0.8
- 弱相关: threshold < 0.5

## 扩展性

### 1. 相似度算法扩展
可以扩展 `calculateKeywordSimilarity` 方法添加：
- 编辑距离算法
- 最长公共子序列
- 语义相似度（需集成词向量模型）

### 2. 缓存后端扩展
当前使用内存缓存，可扩展为：
- Redis 缓存（支持分布式部署）
- 本地文件缓存（持久化）
- 多级缓存（L1: 内存, L2: Redis）

### 3. 性能监控
可集成监控指标：
- 查询响应时间分布
- 缓存命中率趋势
- 矩阵更新频率和耗时

## 相关文档

- [TypeVocabularyService](./TYPE-VOCABULARY-SERVICE.md) - 类型词汇表管理
- [Playbook 数据模型设计](./playbook/02-DATA-MODEL-DESIGN.md) - 数据模型详细设计
- [Playbook 类型系统](./playbook/03-CORE-COMPONENTS-DESIGN.md) - 核心组件设计

## 更新日志

### v1.0.0 (2025-12-18)
- ✅ 初始版本发布
- ✅ 实现核心相似度计算功能
- ✅ 实现缓存机制
- ✅ 实现矩阵更新功能
- ✅ 实现统计和查询功能
- ✅ 添加完整的错误处理和日志记录

---

**服务路径**: `/src/services/SimilarityService.ts`
**依赖服务**: TypeVocabularyService
**数据库**: playbook.db (SQLite)
**状态**: 生产就绪
