# 技术调研报告

**调研日期**: 2025-11-14  
**调研人**: AI Assistant  
**调研范围**: ABP协议设计、错误恢复机制、记忆冲突解决、向量库生命周期管理

---

## 📊 执行摘要

**调研结论**:
- ✅ **ABP协议设计**: 已明确设计方向（JSON格式，`[[ABP_TOOL:...]]`标记）
- ✅ **错误恢复机制**: 已定义完整策略（JSON修复、噪声剥离、fallback）
- ✅ **记忆冲突解决**: 已设计策略（基于importance、recency、source-type自动仲裁）
- ✅ **向量库生命周期管理**: 已规划方案（批处理、安全重建、版本控制、GC）

**技术选型建议**:
1. ✅ ABP协议使用JSON格式（推荐）
2. ✅ 错误恢复机制采用多层次策略
3. ✅ 记忆冲突解决采用可配置规则
4. ✅ 向量库生命周期管理采用版本控制策略

---

## 1. ABP协议设计调研

### 1.1 协议标记格式

#### ✅ 推荐方案：JSON格式

**格式设计**:
```typescript
[[ABP_TOOL:Calculator]]
{
  "action": "calculate",
  "parameters": {
    "expression": "2+2"
  }
}
[[END_ABP_TOOL]]
```

**优点**:
- ✅ 结构化，易于解析
- ✅ 易于扩展（支持嵌套、数组等）
- ✅ 可以使用JSON Schema验证参数
- ✅ 符合现代API设计规范

**缺点**:
- ⚠️ 对LLM输出格式要求较高
- ⚠️ 需要错误恢复机制处理格式不一致

**技术实现**:
- 协议标记：`[[ABP_TOOL:ToolName]]` 到 `[[END_ABP_TOOL]]`
- JSON参数解析和验证
- 工具名称从标记中提取
- 参数从JSON中解析

### 1.2 ABP工具定义接口

#### ✅ 接口设计

**工具定义结构**:
```typescript
interface ABPToolDefinition {
  name: string;                    // 工具名称
  description: string;              // 工具描述
  kind: 'action' | 'query' | 'transform';  // 工具类型
  parameters: {
    [key: string]: {
      type: string;                 // 参数类型
      description?: string;         // 参数描述
      required?: boolean;           // 是否必需
    };
  };
  returns?: {
    type: string;                   // 返回值类型
    description?: string;           // 返回值描述
  };
}
```

**工具定义格式**:
```json
{
  "tools": [
    {
      "name": "Calculator",
      "description": "执行数学计算",
      "kind": "action",
      "parameters": {
        "expression": {
          "type": "string",
          "description": "数学表达式",
          "required": true
        }
      },
      "returns": {
        "type": "number",
        "description": "计算结果"
      }
    }
  ]
}
```

### 1.3 ABP变量系统

#### ✅ 变量格式设计

**变量格式**:
- 基本格式：`{{namespace:key}}`
- 命名空间：与VCP协议兼容（time, env, agent, diary, rag等）

**变量提供者**:
- ✅ TimeProvider: `{{time}}`, `{{date}}`, `{{datetime}}`
- ✅ EnvironmentProvider: `{{Var:xxx}}`, `{{Tar:xxx}}`
- ✅ AgentProvider: `{{agent:xxx}}`
- ✅ DiaryProvider: `{{diary:CharacterName}}`
- ✅ RAGProvider: `{{rag:knowledgeBase:query}}`

**技术实现**:
- 复用VCP协议的变量提供者核心逻辑
- 调整变量格式适配ABP协议（如果需要）
- 实现变量格式转换器（过渡期）

### 1.4 ABP消息格式

#### ✅ 消息格式设计

**消息结构**:
```typescript
interface ABPMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tools?: ABPToolDefinition[];      // 可选：工具定义
  tool_calls?: ABPToolCall[];       // 可选：工具调用
  tool_results?: ABPToolResult[];   // 可选：工具结果
}
```

**工具调用格式**:
```typescript
interface ABPToolCall {
  id: string;                        // 调用ID
  tool: string;                      // 工具名称
  parameters: Record<string, any>;   // 参数
}
```

**工具结果格式**:
```typescript
interface ABPToolResult {
  id: string;                        // 调用ID
  result: any;                       // 结果
  error?: string;                    // 错误（如果有）
}
```

---

## 2. 错误恢复机制调研

### 2.1 JSON修复方案

#### ✅ 自动JSON修复

**策略**:
1. **括号补全**: 检测缺失的括号、引号，自动补全
2. **引号修复**: 检测未闭合的引号，自动修复
3. **逗号修复**: 检测缺失的逗号，自动添加
4. **结构验证**: 修复后验证JSON结构有效性

**实现方案**:
```typescript
class JSONRepairer {
  repair(jsonString: string): string {
    // 1. 检测并补全缺失的括号
    // 2. 检测并修复未闭合的引号
    // 3. 检测并添加缺失的逗号
    // 4. 验证修复后的JSON结构
    return repairedJson;
  }
  
  validate(jsonString: string): boolean {
    try {
      JSON.parse(jsonString);
      return true;
    } catch {
      return false;
    }
  }
}
```

**技术选型**:
- ✅ 使用正则表达式检测JSON结构问题
- ✅ 使用堆栈算法补全括号
- ✅ 使用状态机修复引号
- ✅ 使用JSON Schema验证结构

### 2.2 噪声文本剥离方案

#### ✅ 文本清理策略

**策略**:
1. **协议边界识别**: 识别`[[ABP_TOOL:...]]`和`[[END_ABP_TOOL]]`标记
2. **文本提取**: 提取标记之间的内容
3. **JSON提取**: 从提取的内容中提取JSON块
4. **清理冗余**: 移除解释性文本、多余空白等

**实现方案**:
```typescript
class NoiseStripper {
  strip(content: string): string {
    // 1. 识别协议边界标记
    const toolBlocks = this.extractToolBlocks(content);
    
    // 2. 提取每个块中的JSON
    const jsonBlocks = toolBlocks.map(block => 
      this.extractJSON(block)
    );
    
    // 3. 取最后一个有效JSON块
    const lastValidJSON = this.getLastValidJSON(jsonBlocks);
    
    return lastValidJSON;
  }
  
  private extractJSON(block: string): string {
    // 使用正则表达式提取JSON块
    // 处理嵌套JSON
    // 处理多行JSON
    return extractedJSON;
  }
}
```

**技术选型**:
- ✅ 使用正则表达式提取协议标记
- ✅ 使用JSON解析器提取JSON块
- ✅ 使用AST分析工具验证JSON结构

### 2.3 协议边界校验方案

#### ✅ 边界验证策略

**策略**:
1. **开始标记验证**: 验证`[[ABP_TOOL:...]]`标记格式
2. **结束标记验证**: 验证`[[END_ABP_TOOL]]`标记格式
3. **配对验证**: 验证开始和结束标记配对
4. **嵌套验证**: 验证嵌套标记的正确性

**实现方案**:
```typescript
class ProtocolBoundaryValidator {
  validate(content: string): ValidationResult {
    // 1. 提取所有协议标记
    const markers = this.extractMarkers(content);
    
    // 2. 验证标记格式
    const formatValid = markers.every(m => this.validateFormat(m));
    
    // 3. 验证标记配对
    const pairingValid = this.validatePairing(markers);
    
    // 4. 验证嵌套结构
    const nestingValid = this.validateNesting(markers);
    
    return {
      valid: formatValid && pairingValid && nestingValid,
      errors: [...]
    };
  }
}
```

**技术选型**:
- ✅ 使用正则表达式匹配协议标记
- ✅ 使用堆栈算法验证配对
- ✅ 使用状态机验证嵌套结构

### 2.4 Fallback机制方案

#### ✅ 多级Fallback策略

**策略**:
1. **ABP协议解析**: 优先尝试ABP协议解析
2. **VCP协议解析**: ABP解析失败时fallback到VCP协议（双协议模式）
3. **纯文本响应**: VCP解析也失败时，返回纯文本响应

**实现方案**:
```typescript
class ProtocolParserWithFallback {
  async parse(content: string): Promise<ParseResult> {
    // 1. 尝试ABP协议解析
    try {
      const abpResult = await this.abpParser.parse(content);
      if (abpResult.success) {
        return abpResult;
      }
    } catch (error) {
      logger.debug('ABP parsing failed, trying VCP...');
    }
    
    // 2. Fallback到VCP协议（如果启用双协议模式）
    if (this.dualProtocolEnabled) {
      try {
        const vcpResult = await this.vcpParser.parse(content);
        if (vcpResult.success) {
          return { ...vcpResult, fallback: 'vcp' };
        }
      } catch (error) {
        logger.debug('VCP parsing also failed, falling back to plain text...');
      }
    }
    
    // 3. Fallback到纯文本响应
    return {
      success: false,
      fallback: 'plain-text',
      content: content
    };
  }
}
```

**技术选型**:
- ✅ 实现多级解析器链
- ✅ 使用try-catch处理解析错误
- ✅ 记录fallback统计信息（用于监控）

---

## 3. 记忆冲突解决策略调研

### 3.1 冲突检测算法

#### ✅ 冲突检测策略

**策略**:
1. **语义相似性检测**: 使用向量相似度检测语义相似的记忆
2. **关键词匹配**: 检测包含相同关键词的记忆
3. **时间窗口检测**: 检测在时间窗口内创建的相似记忆
4. **重要性检测**: 检测重要性评分冲突的记忆

**实现方案**:
```typescript
class MemoryConflictDetector {
  async detectConflicts(
    memories: Memory[],
    newMemory: Memory
  ): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];
    
    // 1. 语义相似性检测
    const semanticConflicts = await this.detectSemanticConflicts(
      memories,
      newMemory
    );
    conflicts.push(...semanticConflicts);
    
    // 2. 关键词匹配
    const keywordConflicts = this.detectKeywordConflicts(
      memories,
      newMemory
    );
    conflicts.push(...keywordConflicts);
    
    // 3. 时间窗口检测
    const temporalConflicts = this.detectTemporalConflicts(
      memories,
      newMemory
    );
    conflicts.push(...temporalConflicts);
    
    return conflicts;
  }
  
  private async detectSemanticConflicts(
    memories: Memory[],
    newMemory: Memory
  ): Promise<Conflict[]> {
    // 使用向量相似度检测
    const similarities = await this.vectorService.computeSimilarities(
      memories.map(m => m.content),
      newMemory.content
    );
    
    return similarities
      .filter(sim => sim.score > this.threshold)
      .map(sim => ({
        type: 'semantic',
        existing: memories[sim.index],
        new: newMemory,
        similarity: sim.score
      }));
  }
}
```

**技术选型**:
- ✅ 使用向量相似度算法（余弦相似度）
- ✅ 使用关键词提取和匹配
- ✅ 使用时间窗口过滤
- ✅ 使用机器学习模型检测语义冲突

### 3.2 自动仲裁策略

#### ✅ 多因素仲裁策略

**策略**:
1. **重要性评分**: 优先保留重要性评分高的记忆
2. **时间戳**: 优先保留最新的记忆
3. **来源类型**: 优先保留特定来源的记忆（如用户直接输入）
4. **可配置规则**: 支持自定义仲裁规则

**实现方案**:
```typescript
class MemoryConflictResolver {
  resolve(conflict: Conflict, rules: MergeRules): Resolution {
    // 1. 基于重要性评分
    if (rules.priorityImportance) {
      const winner = this.selectByImportance(conflict);
      if (winner) return { action: 'keep', memory: winner };
    }
    
    // 2. 基于时间戳
    if (rules.priorityRecency) {
      const winner = this.selectByRecency(conflict);
      if (winner) return { action: 'keep', memory: winner };
    }
    
    // 3. 基于来源类型
    if (rules.prioritySource) {
      const winner = this.selectBySource(conflict);
      if (winner) return { action: 'keep', memory: winner };
    }
    
    // 4. 合并记忆
    if (rules.mergeStrategy) {
      const merged = this.mergeMemories(conflict, rules.mergeStrategy);
      return { action: 'merge', memory: merged };
    }
    
    // 默认：保留最新的
    return { action: 'keep', memory: conflict.new };
  }
  
  private selectByImportance(conflict: Conflict): Memory | null {
    const importance1 = conflict.existing.metadata?.importance || 0;
    const importance2 = conflict.new.metadata?.importance || 0;
    return importance1 > importance2 ? conflict.existing : conflict.new;
  }
}
```

**技术选型**:
- ✅ 实现多因素评分算法
- ✅ 使用配置规则驱动仲裁
- ✅ 支持自定义仲裁策略

### 3.3 记忆合并算法

#### ✅ 智能合并策略

**策略**:
1. **内容合并**: 合并相似记忆的内容
2. **元数据合并**: 合并记忆的元数据（取最大值、最新值等）
3. **重要性提升**: 合并后提升重要性评分
4. **去重优化**: 移除重复信息

**实现方案**:
```typescript
class MemoryMerger {
  merge(
    memory1: Memory,
    memory2: Memory,
    strategy: MergeStrategy
  ): Memory {
    // 1. 合并内容
    const mergedContent = this.mergeContent(
      memory1.content,
      memory2.content,
      strategy
    );
    
    // 2. 合并元数据
    const mergedMetadata = this.mergeMetadata(
      memory1.metadata,
      memory2.metadata,
      strategy
    );
    
    // 3. 计算新的重要性评分
    const mergedImportance = Math.max(
      memory1.metadata?.importance || 0,
      memory2.metadata?.importance || 0
    ) + 0.1; // 合并后略微提升
    
    return {
      content: mergedContent,
      metadata: {
        ...mergedMetadata,
        importance: Math.min(mergedImportance, 1.0),
        merged: true,
        sourceMemories: [memory1.id, memory2.id]
      }
    };
  }
  
  private mergeContent(
    content1: string,
    content2: string,
    strategy: MergeStrategy
  ): string {
    if (strategy === 'concatenate') {
      return `${content1}\n${content2}`;
    } else if (strategy === 'summarize') {
      // 使用LLM总结合并
      return this.summarize([content1, content2]);
    } else {
      // 默认：保留最新的
      return content2;
    }
  }
}
```

**技术选型**:
- ✅ 实现多种合并策略（连接、总结、替换）
- ✅ 使用LLM辅助内容合并（可选）
- ✅ 使用自然语言处理工具去重

### 3.4 可配置合并规则

#### ✅ 规则配置系统

**规则配置**:
```typescript
interface MemoryMergeRules {
  priorityImportance?: boolean;      // 优先保留重要性高的
  priorityRecency?: boolean;         // 优先保留最新的
  prioritySource?: string[];         // 优先保留特定来源的
  mergeStrategy?: 'keep-new' | 'keep-old' | 'merge' | 'summarize';
  similarityThreshold?: number;      // 相似度阈值
  timeWindow?: number;               // 时间窗口（毫秒）
}
```

**配置示例**:
```typescript
const defaultRules: MemoryMergeRules = {
  priorityImportance: true,
  priorityRecency: true,
  prioritySource: ['user', 'explicit'],
  mergeStrategy: 'keep-new',
  similarityThreshold: 0.8,
  timeWindow: 7 * 24 * 60 * 60 * 1000 // 7天
};
```

**技术选型**:
- ✅ 使用配置对象定义规则
- ✅ 支持规则继承和覆盖
- ✅ 支持运行时规则更新

---

## 4. 向量库生命周期管理调研

### 4.1 批处理Embedding方案

#### ✅ 批量Embedding策略

**策略**:
1. **批量收集**: 收集待embedding的记忆
2. **批量处理**: 批量调用embedding API
3. **批量写入**: 批量写入向量库
4. **进度追踪**: 追踪处理进度

**实现方案**:
```typescript
class BatchEmbeddingProcessor {
  async processBatch(
    memories: Memory[],
    batchSize: number = 100
  ): Promise<void> {
    // 1. 分批处理
    for (let i = 0; i < memories.length; i += batchSize) {
      const batch = memories.slice(i, i + batchSize);
      
      // 2. 批量embedding
      const embeddings = await this.embedBatch(batch);
      
      // 3. 批量写入向量库
      await this.vectorStore.batchInsert(batch, embeddings);
      
      // 4. 进度追踪
      this.updateProgress(i + batch.length, memories.length);
    }
  }
  
  private async embedBatch(memories: Memory[]): Promise<number[][]> {
    const texts = memories.map(m => m.content);
    return await this.embeddingService.embedBatch(texts);
  }
}
```

**技术选型**:
- ✅ 使用批处理API（如果支持）
- ✅ 实现批处理队列
- ✅ 使用进度追踪机制

### 4.2 安全重建索引方案

#### ✅ 索引重建策略

**策略**:
1. **备份索引**: 重建前备份现有索引
2. **增量重建**: 支持增量重建（仅重建变更部分）
3. **原子切换**: 重建完成后原子切换索引
4. **回滚机制**: 支持回滚到旧索引

**实现方案**:
```typescript
class IndexRebuilder {
  async rebuild(
    memories: Memory[],
    options: RebuildOptions = {}
  ): Promise<void> {
    // 1. 备份现有索引
    const backupPath = await this.backupIndex();
    
    try {
      // 2. 创建新索引
      const newIndex = await this.createNewIndex(memories, options);
      
      // 3. 验证新索引
      await this.validateIndex(newIndex);
      
      // 4. 原子切换索引
      await this.atomicSwitch(newIndex);
      
      // 5. 清理旧索引（延迟清理）
      this.scheduleCleanup(backupPath);
    } catch (error) {
      // 回滚到旧索引
      await this.rollback(backupPath);
      throw error;
    }
  }
  
  private async atomicSwitch(newIndex: Index): Promise<void> {
    // 使用文件系统原子操作切换索引
    // 或使用数据库事务切换索引
    await this.indexStore.switchIndex(newIndex);
  }
}
```

**技术选型**:
- ✅ 使用文件系统备份和恢复
- ✅ 使用数据库事务保证原子性
- ✅ 使用版本控制机制管理索引

### 4.3 索引版本控制方案

#### ✅ 版本控制策略

**策略**:
1. **版本号管理**: 为每个索引版本分配版本号
2. **版本元数据**: 记录索引版本的元数据（创建时间、结构版本等）
3. **版本切换**: 支持在版本间切换
4. **版本清理**: 清理旧版本索引

**实现方案**:
```typescript
class IndexVersionManager {
  async createVersion(
    index: Index,
    metadata: IndexMetadata
  ): Promise<string> {
    const version = this.generateVersion();
    
    // 1. 保存索引
    await this.indexStore.saveVersion(version, index);
    
    // 2. 保存元数据
    await this.metadataStore.saveMetadata(version, {
      ...metadata,
      createdAt: Date.now(),
      version: version
    });
    
    // 3. 更新当前版本
    await this.setCurrentVersion(version);
    
    return version;
  }
  
  async switchVersion(version: string): Promise<void> {
    // 1. 验证版本存在
    await this.validateVersion(version);
    
    // 2. 加载索引
    const index = await this.indexStore.loadVersion(version);
    
    // 3. 原子切换
    await this.atomicSwitch(index, version);
  }
  
  async cleanupOldVersions(keepCount: number = 5): Promise<void> {
    const versions = await this.getAllVersions();
    const oldVersions = versions.slice(0, -keepCount);
    
    for (const version of oldVersions) {
      await this.indexStore.deleteVersion(version);
      await this.metadataStore.deleteMetadata(version);
    }
  }
}
```

**技术选型**:
- ✅ 使用语义化版本控制（semver）
- ✅ 使用文件系统或数据库存储版本
- ✅ 实现版本元数据管理

### 4.4 Tombstone/GC策略

#### ✅ 删除和垃圾回收策略

**策略**:
1. **Tombstone标记**: 删除记忆时标记为tombstone，不立即删除
2. **延迟删除**: 延迟删除机制（如30天后删除）
3. **批量清理**: 定期批量清理tombstone记录
4. **索引更新**: 清理时更新索引

**实现方案**:
```typescript
class TombstoneManager {
  async markAsDeleted(memoryId: string): Promise<void> {
    // 1. 标记为tombstone
    await this.memoryStore.markAsDeleted(memoryId, {
      deletedAt: Date.now(),
      tombstone: true
    });
    
    // 2. 从索引中移除（但不删除向量）
    await this.vectorStore.removeFromIndex(memoryId);
  }
  
  async cleanupTombstones(olderThanDays: number = 30): Promise<void> {
    const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    
    // 1. 查找待清理的tombstone记录
    const tombstones = await this.memoryStore.findTombstones(cutoff);
    
    // 2. 批量删除
    for (const tombstone of tombstones) {
      await this.memoryStore.delete(tombstone.id);
      await this.vectorStore.delete(tombstone.id);
    }
    
    // 3. 重建索引（如果需要）
    if (tombstones.length > 100) {
      await this.indexRebuilder.rebuild();
    }
  }
}
```

**技术选型**:
- ✅ 使用tombstone标记策略
- ✅ 使用定时任务清理
- ✅ 使用批量删除优化性能

---

## 5. 技术选型建议

### 5.1 ABP协议设计

#### ✅ 推荐方案：JSON格式

**理由**:
1. ✅ 结构化，易于解析
2. ✅ 易于扩展（支持嵌套、数组等）
3. ✅ 可以使用JSON Schema验证参数
4. ✅ 符合现代API设计规范

**实现技术**:
- TypeScript类型定义
- JSON Schema验证
- 正则表达式解析标记
- JSON解析器解析参数

### 5.2 错误恢复机制

#### ✅ 推荐方案：多层次策略

**理由**:
1. ✅ 提高解析成功率
2. ✅ 降低对LLM输出格式的要求
3. ✅ 提升系统稳定性

**实现技术**:
- JSON修复库（或自研）
- 正则表达式文本清理
- 协议边界验证算法
- 多级fallback机制

### 5.3 记忆冲突解决

#### ✅ 推荐方案：可配置规则

**理由**:
1. ✅ 灵活适应不同场景
2. ✅ 支持自定义策略
3. ✅ 易于测试和验证

**实现技术**:
- 向量相似度算法（余弦相似度）
- 关键词提取和匹配
- 配置驱动仲裁
- LLM辅助内容合并（可选）

### 5.4 向量库生命周期管理

#### ✅ 推荐方案：版本控制策略

**理由**:
1. ✅ 支持安全回滚
2. ✅ 降低重建风险
3. ✅ 支持增量更新

**实现技术**:
- 批处理API
- 文件系统备份和恢复
- 版本控制机制
- 定时任务清理

---

## 6. 附录

### 6.1 相关文档

- **主变更提案**: `openspec/changes/implement-skills-first-abp-later-strategy/proposal.md`
- **最终解决方案**: `docs/REFACTOR_FINAL_SOLUTION.md`
- **协议规范**: `openspec/changes/implement-skills-first-abp-later-strategy/specs/protocol/spec.md`

### 6.2 技术参考

- **JSON修复**: 参考 `jsonrepair` 库
- **向量相似度**: 参考 `hnswlib-node` 库
- **批处理Embedding**: 参考OpenAI批量API
- **版本控制**: 参考Git版本控制模型

---

*本报告将随着技术调研进展持续更新*

