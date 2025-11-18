# 缓存系统统一规范

## Purpose

统一项目中的缓存实现，使用 `Cache` 类作为唯一的缓存基础实现，消除代码重复，提高可维护性。

## Requirements

### Requirement 1: 统一缓存基础实现

**描述**: 所有缓存功能必须基于 `src/utils/cache.ts` 的 `Cache` 类实现。

**约束**:
- `Cache` 类必须支持 TTL（可配置，0表示永不过期）
- `Cache` 类必须支持 LRU 淘汰策略
- `Cache` 类必须支持统计信息（hits、misses、hitRate等）
- `Cache` 类必须支持定期清理过期项

**Scenario**: 
- 当创建新的缓存实例时，应使用 `Cache` 类或 `createCache()` / `createPermanentCache()` 工厂函数
- 当需要 TTL 缓存时，使用 `createCache(ttl, maxSize)`
- 当需要永久缓存时，使用 `createPermanentCache(maxSize)`

### Requirement 2: SkillsCache 使用统一缓存

**描述**: `SkillsCache` 必须使用 `Cache` 类而不是 `TTLCache`。

**约束**:
- `SkillsCache` 的三个缓存实例（metadata、content、resources）必须使用 `Cache` 类
- 保持相同的配置参数（maxSize、ttl）
- 保持相同的 API（getMetadata、setMetadata、getContent、setContent、getResources、setResources）
- 保持统计功能正常工作

**Scenario**:
- 当 `SkillsCache` 初始化时，使用 `Cache` 创建三个缓存实例
- 当调用 `getMetadata()` 时，从 `Cache` 实例获取并更新统计
- 当调用 `setMetadata()` 时，写入 `Cache` 实例并更新统计

### Requirement 3: CodeCache 使用统一缓存

**描述**: `CodeCache` 必须使用 `Cache` 类而不是自己实现的缓存逻辑。

**约束**:
- `CodeCache` 必须使用 `Cache` 类作为底层实现
- 保持 `get(skillName, hash)` 和 `set(skillName, hash, code)` 的 API 不变
- 保持 hash 匹配检查逻辑
- 保持统计功能（hits、misses、evictions）

**Scenario**:
- 当 `CodeCache` 初始化时，使用 `Cache` 创建缓存实例
- 当调用 `get(skillName, hash)` 时，从 `Cache` 获取并检查 hash 匹配
- 当调用 `set(skillName, hash, code)` 时，写入 `Cache` 并设置 TTL

### Requirement 4: BaseSkillsExecutor 使用统一缓存

**描述**: `BaseSkillsExecutor` 的缓存必须使用 `Cache` 类。

**约束**:
- 将 `TTLCache` 替换为 `Cache`
- 保持相同的配置参数（maxSize、ttl）
- 保持缓存功能正常工作

**Scenario**:
- 当 `BaseSkillsExecutor` 初始化时，使用 `Cache` 创建缓存实例
- 当执行技能时，从 `Cache` 获取缓存结果
- 当执行成功时，将结果写入 `Cache`

### Requirement 5: 删除冗余实现

**描述**: 删除 `TTLCache.ts` 文件，因为所有功能已由 `Cache` 类提供。

**约束**:
- 确认所有 `TTLCache` 的使用都已迁移到 `Cache`
- 删除 `src/utils/TTLCache.ts` 文件
- 确保没有编译错误

**Scenario**:
- 使用 `grep` 检查项目中是否还有 `TTLCache` 的引用
- 如果所有引用都已迁移，删除 `TTLCache.ts` 文件
- 运行编译验证没有错误

## Delta for Cache Unification

### ADDED Requirements

无新增需求。

### UPDATED Requirements

1. **SkillsCache 实现** - 从使用 `TTLCache` 改为使用 `Cache`
2. **CodeCache 实现** - 从自己实现的缓存改为使用 `Cache`
3. **BaseSkillsExecutor 缓存** - 从使用 `TTLCache` 改为使用 `Cache`

### REMOVED Requirements

1. **TTLCache 类** - 删除 `TTLCache.ts`，功能由 `Cache` 类提供

