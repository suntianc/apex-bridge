# R-003: Vector-Search 工具类型返回需求

**需求编号**: R-003
**优先级**: 高
**状态**: ✅ 评审通过
**创建日期**: 2025-12-30
**评审日期**: 2025-12-30

---

## 1. 需求概述

### 1.1 问题描述

当前使用内置工具 `vector-search` 检索出来的工具没有返回工具类型（toolType），导致 LLM 无法正确区分工具类别。项目内工具分为三类：**mcp**（外部 MCP 服务器工具）、**builtin**（内置工具）、**skill**（技能工具）。

由于检索结果缺少工具类型信息，LLM 错误地使用 `readskill` 内置工具去读取 skill，而不是直接调用对应的 skill 工具。

### 1.2 问题定位

通过代码排查发现：

| 组件 | 状态 | 说明 |
|------|------|------|
| `ToolsTable` | ✅ 已有字段 | Schema 中包含 `toolType` 字段 |
| `ToolRetrievalResult` | ❌ 缺少字段 | 接口定义未包含 `toolType` |
| `SearchEngine.formatTool` | ⚠️ 不完整 | 只处理 `mcp` 和 `skill`，缺少 `builtin` |

**问题文件**: [SearchEngine.ts:138-145](src/services/tool-retrieval/SearchEngine.ts#L138-L145)

### 1.3 影响范围

- **受影响组件**: `vector-search` 工具、`ToolRetrievalService`
- **用户体验**: 工具调用逻辑混乱，可能导致不必要的工具调用
- **系统性能**: 额外的中间调用增加延迟和资源消耗

### 1.4 预期目标

1. `vector-search` 检索结果需要返回工具类型字段（`toolType`）
2. LLM 能够根据工具类型正确选择调用策略
3. 避免 LLM 错误地使用 `readskill` 去读取 skill
4. 三类工具的调用路径清晰：
   - `mcp` 工具 → 通过 MCP 协议调用
   - `builtin` 工具 → 直接调用内置实现
   - `skill` 工具 → 直接调用 skill 实现

---

## 2. 需求详情

### 2.1 当前行为

```typescript
// 当前 vector-search 返回结果（示例）
{
  "name": "data-validator",
  "description": "Validates input data against schema",
  // ❌ 缺少 toolType 顶层字段
  "metadata": { "type": "skill" },  // 类型在 metadata 内，非顶层
  "parameters": { ... }
}
```

### 2.2 期望行为

```typescript
// 期望的 vector-search 返回结果
{
  "name": "data-validator",
  "description": "Validates input data against schema",
  "toolType": "skill",  // ✅ 顶层字段
  "metadata": { ... },
  "parameters": { ... }
}
```

### 2.3 工具类型定义

| 类型值 | 含义 | 示例 |
|--------|------|------|
| `mcp` | 外部 MCP 服务器提供的工具 | `filesystem`, `postgres` |
| `builtin` | 系统内置工具 | `vector-search`, `read-file`, `readskill` |
| `skill` | 用户定义的 skill 工具 | `data-validator`, `git-commit-helper` |

---

## 3. 验收标准

- [ ] `vector-search` 工具返回结果包含顶层 `toolType` 字段
- [ ] `toolType` 字段值为 `"mcp"`、`"builtin"` 或 `"skill"` 之一
- [ ] `SearchEngine.formatTool` 方法完整处理三类工具
- [ ] TypeScript 编译无错误
- [ ] 现有功能 100% 正常

---

## 4. 实现方案

### 4.1 修改位置

1. **`types.ts`**: `ToolRetrievalResult` 接口添加 `toolType` 字段
2. **`SearchEngine.formatSearchResults`**: 返回结果添加 `toolType` 字段
3. **`SearchEngine.formatTool`**: 添加 `builtin` 类型处理分支

### 4.2 相关文件

```
src/services/tool-retrieval/
├── types.ts                   # 修改 ToolRetrievalResult 接口
├── SearchEngine.ts            # 修改 formatSearchResults 和 formatTool
└── ToolRetrievalService.ts    # 可能需要调整（视情况）
```

### 4.3 修改细节

```typescript
// 1. types.ts - ToolRetrievalResult 添加 toolType
export interface ToolRetrievalResult {
  id: string;
  name: string;
  description: string;
  score: number;
  toolType: 'mcp' | 'builtin' | 'skill';  // ✅ 新增
  metadata?: Record<string, unknown>;
  tags?: string[];
}

// 2. SearchEngine.formatSearchResults - 添加 toolType
formatted.push({
  id: data.id,
  name: data.name,
  description: data.description,
  score,
  toolType: data.toolType,  // ✅ 从数据库读取
  metadata: tool as Record<string, unknown>,
  tags: data.tags || []
});

// 3. SearchEngine.formatTool - 添加 builtin 处理
private formatTool(data: ToolsTable, metadata: Record<string, unknown>) {
  if (data.toolType === 'mcp') {
    // MCP tool format
  } else if (data.toolType === 'builtin') {  // ✅ 新增分支
    // Builtin tool format
  } else {
    // Skill tool format (默认)
  }
}
```

---

## 5. 关联需求

无直接关联需求。

---

## 6. 备注

### 6.1 依赖项

- 无外部依赖
- 基于现有 `ToolRetrievalService` 架构

### 6.2 风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| LLM 调用策略变更 | 低 | toolType 为新增字段，不影响现有逻辑 |
| 向后兼容性 | 无风险 | 新增字段，不修改现有字段 |

---

## 7. 版本历史

| 版本 | 日期 | 描述 |
|------|------|------|
| 1.0.0 | 2025-12-30 | 初始版本 |
| 1.1.0 | 2025-12-30 | 评审通过，完善实现方案，添加代码修改细节 |
