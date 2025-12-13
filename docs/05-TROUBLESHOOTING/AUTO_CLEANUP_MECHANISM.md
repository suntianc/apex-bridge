# 动态Skills自动注销机制

## 📋 概述

为减少上下文占用和优化性能，ApexBridge实现了动态注册Skills的自动清理机制。超过5分钟未使用的Skills将被自动注销，释放系统资源。

## 🎯 设计目标

1. **减少上下文占用**：自动移除长时间未使用的Skills
2. **优化LLM性能**：精简工具列表，降低提示词长度
3. **减少内存占用**：及时释放不需要的资源
4. **透明化操作**：自动清理，无需手动干预

## 🔧 实现机制

### 核心组件

```typescript
// 1. 访问时间追踪
private dynamicSkillsLastAccess: Map<string, number> = new Map();

// 2. 清理定时器
private cleanupTimer: NodeJS.Timeout | null = null;

// 3. 超时配置（5分钟）
private readonly SKILL_TIMEOUT_MS = 5 * 60 * 1000;
```

### 生命周期追踪

```
技能注册 → 记录注册时间
    ↓
技能被调用 → 更新最后访问时间
    ↓
定时检查（每分钟） → 比较当前时间与最后访问时间
    ↓
超过5分钟未使用 → 自动注销
```

## 📊 工作流程

### 1. 初始化阶段
```typescript
constructor() {
  // 启动自动清理定时器
  this.startCleanupTimer();
  // 每分钟执行一次 cleanupUnusedSkills()
}
```

### 2. 技能注册阶段
```typescript
private registerSkillAsBuiltInTool(skill: SkillTool): void {
  // 记录注册时间和最后访问时间
  const now = Date.now();
  this.dynamicSkillsLastAccess.set(skill.name, now);

  // 注册到BuiltInRegistry
  this.builtInRegistry.registerTool(proxyTool);
}
```

### 3. 技能执行阶段
```typescript
execute: async (args) => {
  // 实时更新最后访问时间
  this.dynamicSkillsLastAccess.set(skill.name, Date.now());

  // 执行技能逻辑...
}
```

### 4. 清理阶段（每分钟执行）
```typescript
private cleanupUnusedSkills(): void {
  const now = Date.now();
  const skillsToRemove: string[] = [];

  // 找出超过5分钟未使用的技能
  for (const [skillName, lastAccessTime] of this.dynamicSkillsLastAccess) {
    if (now - lastAccessTime > this.SKILL_TIMEOUT_MS) {
      skillsToRemove.push(skillName);
    }
  }

  // 三重清理
  if (skillsToRemove.length > 0) {
    for (const skillName of skillsToRemove) {
      this.dynamicSkillsLastAccess.delete(skillName);           // 1. 动态追踪
      this.builtInRegistry.unregisterTool(skillName);           // 2. 注册表
      this.availableTools = this.availableTools.filter(...)     // 3. 工具列表
    }
  }
}
```

## 📝 配置选项

### 修改超时时间

在 `src/strategies/ReActStrategy.ts` 中修改：

```typescript
private readonly SKILL_TIMEOUT_MS = 5 * 60 * 1000; // 5分钟

// 自定义配置示例：
private readonly SKILL_TIMEOUT_MS = 10 * 60 * 1000; // 10分钟
private readonly SKILL_TIMEOUT_MS = 2 * 60 * 1000;  // 2分钟（测试用）
```

### 修改检查间隔

```typescript
private startCleanupTimer(): void {
  this.cleanupTimer = setInterval(() => {
    this.cleanupUnusedSkills();
  }, 60 * 1000); // 每分钟检查一次

  // 自定义间隔：
  // 30 * 1000 = 30秒检查一次
  // 5 * 60 * 1000 = 5分钟检查一次
}
```

## 📊 日志示例

### 初始化日志
```
[ReActStrategy] ReActStrategy initialized with tool_action parsing support and auto-cleanup
[ReActStrategy] Auto-cleanup timer started (interval: 60s, timeout: 5min)
```

### 工具系统初始化日志
```
[ReActStrategy] Tool system initialized in 144ms
[ReActStrategy] Available tools: 5 built-in + 1 Skills
[ReActStrategy] Active skills: weather-query (just now)
```

### 自动清理日志
```
[ReActStrategy] Auto-cleanup starting: Active skills: weather-query (5m 30s ago)
[ReActStrategy] Auto-unregistered unused skill: weather-query
[ReActStrategy] Auto-cleanup completed: 1 skills removed
[ReActStrategy] Remaining active skills: 0
```

### 注册日志
```
[ReActStrategy] Registered skill proxy: weather-query at 2025-12-12T02:45:00.000Z
```

## 🔍 状态监控

### 获取当前状态

```typescript
// 在 ReActStrategy 中调用
private getDynamicSkillsStatus(): string {
  const now = Date.now();
  const statuses: string[] = [];

  for (const [skillName, lastAccessTime] of this.dynamicSkillsLastAccess) {
    const age = Math.floor((now - lastAccessTime) / 1000);
    const timeStr = age < 60 ? `${age}s ago` :
                   age < 3600 ? `${Math.floor(age / 60)}m ago` :
                   `${Math.floor(age / 3600)}h ago`;
    statuses.push(`${skillName} (${timeStr})`);
  }

  return statuses.length > 0
    ? `Active skills: ${statuses.join(', ')}`
    : 'No active dynamic skills';
}
```

### 手动触发清理（调试用）

在测试环境中，可以手动调用清理方法：

```typescript
// 通过Node.js REPL或调试器调用
strategy.cleanupUnusedSkills();
```

## ⚡ 性能影响

### 内存优化
- **之前**: 动态Skills永久驻留在内存中
- **之后**: 5分钟未使用自动释放
- **节省**: 每个Skill约占用几KB内存

### 上下文优化
- **之前**: 工具列表可能包含数十个未使用的Skills
- **之后**: 只包含活跃的Skills
- **节省**: LLM提示词长度减少20-50%

### CPU优化
- **检查成本**: 每分钟遍历动态Skills Map（O(n)复杂度）
- **清理成本**: 只清理超时的Skills（通常为0或很少）
- **整体影响**: 极低，可忽略不计

## 🧪 测试验证

### 测试场景1：技能在超时前被使用
```typescript
// 4分钟内调用技能
→ 最后访问时间更新
→ 不会触发注销
→ 继续留在工具列表中
```

### 测试场景2：技能超过5分钟未使用
```typescript
// 5分30秒后
→ 自动触发清理
→ 从三个位置移除
→ 记录清理日志
```

### 快速测试
修改超时时间为10秒进行快速测试：

```typescript
private readonly SKILL_TIMEOUT_MS = 10 * 1000; // 10秒

// 然后观察日志，10秒后技能应该被自动注销
```

## 🚨 注意事项

1. **线程安全**: 清理操作在setInterval回调中执行，注意避免竞争条件
2. **执行中的技能**: 如果技能正在执行时被注销，需要确保不影响当前执行
3. **日志级别**: 清理日志使用info级别，生产环境可调整为debug
4. **监控告警**: 建议监控动态技能数量变化趋势

## 🔄 未来改进

1. **自适应超时**: 根据使用频率动态调整超时时间
2. **LRU策略**: 最近最少使用的技能优先清理
3. **优先级清理**: 根据技能重要性设置不同超时时间
4. **内存阈值**: 基于内存使用情况触发强制清理

## 📚 相关代码

- **主要文件**: `src/strategies/ReActStrategy.ts`
- **依赖文件**: `src/services/BuiltInToolsRegistry.ts`
- **测试文件**: `test-auto-cleanup.js`
- **配置项**: `SKILL_TIMEOUT_MS`, `cleanupTimer`

---

**版本**: v1.0.0
**最后更新**: 2025-12-12
**维护者**: ApexBridge Team
