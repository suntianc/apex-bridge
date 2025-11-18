# 缓存系统统一重构任务清单

## Task 1: 重构 SkillsCache 使用 Cache

### Task 1.1: 修改 SkillsCache 导入
- 将 `import { TTLCache } from '../../utils/TTLCache'` 改为 `import { Cache } from '../../utils/cache'`
- 更新类型定义：`TTLCache<string, SkillMetadata>` → `Cache<SkillMetadata>`

### Task 1.2: 重构 SkillsCache 构造函数
- 将三个 `TTLCache` 实例改为 `Cache` 实例
- 使用 `createCache()` 或 `new Cache()` 创建实例
- 保持相同的配置参数（maxSize、ttl）

### Task 1.3: 适配 API 差异
- `TTLCache` 的 `get()` 和 `set()` 与 `Cache` 兼容
- `TTLCache` 的 `size()` 与 `Cache` 的 `size()` 兼容
- `TTLCache` 的 `delete()` 与 `Cache` 的 `delete()` 兼容
- `TTLCache` 的 `clear()` 与 `Cache` 的 `clear()` 兼容

### Task 1.4: 验证功能
- 测试 SkillsCache 的 getMetadata/setMetadata
- 测试 SkillsCache 的 getContent/setContent
- 测试 SkillsCache 的 getResources/setResources
- 测试 SkillsCache 的统计功能

## Task 2: 重构 CodeCache 使用 Cache

### Task 2.1: 修改 CodeCache 导入
- 添加 `import { Cache } from '../../utils/cache'`
- 移除内部的 `Map` 实现

### Task 2.2: 重构 CodeCache 实现
- 将 `Map<string, InternalCacheEntry>` 改为 `Cache<CodeCacheEntry>`
- 使用 `Cache` 的 TTL 功能替代手动过期检查
- 保持 `get()` 和 `set()` 方法的签名不变

### Task 2.3: 适配特殊逻辑
- CodeCache 的 `get()` 需要检查 `hash` 匹配，在 `Cache` 基础上添加额外逻辑
- CodeCache 的 `set()` 需要设置 `expiresAt`，使用 `Cache` 的 TTL
- 保持 `cloneEntry()` 和统计功能

### Task 2.4: 验证功能
- 测试 CodeCache 的 get/set
- 测试 CodeCache 的 TTL 过期
- 测试 CodeCache 的统计功能

## Task 3: 重构 BaseSkillsExecutor 使用 Cache

### Task 3.1: 修改 BaseSkillsExecutor 导入
- 将 `import { TTLCache } from '../../utils/TTLCache'` 改为 `import { Cache } from '../../utils/cache'`
- 更新类型定义

### Task 3.2: 重构缓存初始化
- 将 `new TTLCache<string, CacheEntry>()` 改为 `new Cache<CacheEntry>()`
- 使用 `createCache()` 创建实例
- 保持相同的配置参数

### Task 3.3: 验证功能
- 测试 BaseSkillsExecutor 的缓存功能
- 确保缓存命中/未命中逻辑正常

## Task 4: 删除 TTLCache.ts

### Task 4.1: 检查所有引用
- 使用 `grep` 检查是否还有其他地方使用 `TTLCache`
- 确认所有使用都已迁移到 `Cache`

### Task 4.2: 删除文件
- 删除 `src/utils/TTLCache.ts`
- 更新相关导入（如果有）

## Task 5: 测试与验证

### Task 5.1: 单元测试
- 运行 SkillsCache 相关测试
- 运行 CodeCache 相关测试
- 运行 BaseSkillsExecutor 相关测试

### Task 5.2: 集成测试
- 测试 Skills 加载和缓存
- 测试代码生成和缓存
- 测试执行器缓存

### Task 5.3: 性能测试
- 验证缓存性能不受影响
- 验证 TTL 和 LRU 淘汰正常工作

## Task 6: 文档更新

### Task 6.1: 更新代码注释
- 更新 SkillsCache 的注释说明使用 Cache
- 更新 CodeCache 的注释说明使用 Cache

### Task 6.2: 更新架构文档
- 在 ARCHITECTURE_ANALYSIS.md 中说明统一的缓存策略

