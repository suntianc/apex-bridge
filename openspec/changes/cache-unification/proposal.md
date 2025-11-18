# 缓存系统统一重构提案

## Why

当前项目中存在多个缓存实现，造成代码重复和维护困难：

1. **src/utils/cache.ts** - `Cache` 类：功能最全面（TTL、LRU、统计）
2. **src/utils/TTLCache.ts** - `TTLCache` 类：功能较简单（仅TTL和LRU）
3. **src/core/skills/SkillsCache.ts** - `SkillsCache` 类：内部使用 `TTLCache`
4. **src/core/skills/CodeCache.ts** - `CodeCache` 类：自己实现的缓存逻辑

**问题**：
- 代码重复：多个缓存实现有相似的TTL和LRU逻辑
- 维护成本高：需要同时维护多套缓存实现
- 功能不一致：不同缓存的API和行为略有差异
- 难以统一管理：无法统一监控和配置缓存策略

## What Changes

### 目标
统一使用 `Cache` 类作为唯一的缓存实现，删除或重构其他缓存实现。

### 范围
1. **保留** `src/utils/cache.ts` 的 `Cache` 类作为统一基础实现
2. **重构** `SkillsCache` 改为使用 `Cache` 而不是 `TTLCache`
3. **重构** `CodeCache` 改为使用 `Cache`
4. **重构** `BaseSkillsExecutor` 的缓存改为使用 `Cache`
5. **删除** `TTLCache.ts`（如果不再被使用）
6. **保持向后兼容**：确保所有使用缓存的代码功能不受影响

### 非目标
- 不改变缓存的行为和性能特征
- 不改变现有的缓存配置选项
- 不引入新的缓存功能（如分布式缓存）

## 影响范围

### 文件修改
- `src/core/skills/SkillsCache.ts` - 改为使用 `Cache`
- `src/core/skills/CodeCache.ts` - 改为使用 `Cache`
- `src/core/skills/executors/BaseSkillsExecutor.ts` - 改为使用 `Cache`
- `src/utils/TTLCache.ts` - 删除（如果不再被使用）

### 文件保留
- `src/utils/cache.ts` - 保留作为统一实现
- `src/core/EmotionEngine.ts` - 已使用 `Cache`，无需修改
- `src/core/PersonalityEngine.ts` - 已使用 `Cache`，无需修改

## 验收标准

1. ✅ 所有缓存功能正常工作（SkillsCache、CodeCache、BaseSkillsExecutor）
2. ✅ 缓存性能不受影响（TTL、LRU淘汰正常工作）
3. ✅ 缓存统计信息正常（如果支持）
4. ✅ 代码通过编译和测试
5. ✅ `TTLCache.ts` 被删除（如果不再被使用）

