# 需求讨论纪要

**需求**: R-003: Vector-Search 工具类型返回
**日期**: 2025-12-30
**参与**: 用户、Claude Code

---

## 讨论议题

1. 需求理解确认
2. 功能边界确认
3. 实现方案讨论
4. 代码排查

---

## 讨论内容

### 1. 需求理解确认

**确认内容**:
- 当前 `vector-search` 检索结果缺少 `toolType` 字段
- 项目有 3 类工具：mcp、builtin、skill
- LLM 错误使用 `readskill` 工具调用 skill

**结论**: ✅ 理解正确

### 2. 功能边界确认

**问题**: 功能边界是什么？是仅修改返回格式，还是也需要修改 LLM 调用决策逻辑？

**结论**: 仅修改返回格式，不涉及 LLM 调用决策逻辑。

### 3. 实现方案讨论

**讨论主题**: 修改类型定义 vs 修改返回格式

**分析**:
- 方案 A（修改类型定义）: Schema 变更，数据持久化
- 方案 B（修改返回格式）: 快速实现，动态判断类型

**推荐**: 先排查现有代码，确认问题根源

### 4. 代码排查结果

| 组件 | 状态 | 说明 |
|------|------|------|
| `ToolsTable` | ✅ 已有字段 | Schema 中包含 `toolType` 字段 |
| `ToolRetrievalResult` | ❌ 缺少字段 | 接口定义未包含 `toolType` |
| `SearchEngine.formatTool` | ⚠️ 不完整 | 只处理 `mcp` 和 `skill`，缺少 `builtin` |

**问题位置**: [SearchEngine.ts:138-145](src/services/tool-retrieval/SearchEngine.ts#L138-L145)

**结论**:
- `toolType` 已存入数据库
- `ToolRetrievalResult` 接口缺少该字段
- 需要修改 `types.ts` 和 `SearchEngine.ts`

---

## 决议事项

1. ✅ 需求评审通过
2. ✅ 确认修改范围：types.ts + SearchEngine.ts
3. ✅ 确认三类工具类型：mcp、builtin、skill

---

## 待办

| 任务 | 负责人 | 状态 |
|------|--------|------|
| 修改 ToolRetrievalResult 接口 | - | 待开始 |
| 修改 SearchEngine.formatSearchResults | - | 待开始 |
| 修改 SearchEngine.formatTool (添加 builtin) | - | 待开始 |
| TypeScript 编译验证 | - | 待开始 |

---

## 附件

- 需求文档: [03-vector-search-tool-type.md](../requirements/03-vector-search-tool-type.md)
