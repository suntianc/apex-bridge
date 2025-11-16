# Skills系统最佳实践指南

## 概述

本文档提供Skills系统开发和使用的最佳实践，帮助开发者编写高效、安全、可维护的技能。

## 技能设计原则

### 1. 单一职责原则

每个技能应该只做一件事，并且做好。

**好的例子**:
```yaml
# skills/calculator/METADATA.yml
name: calculator
description: 执行基本数学计算
type: direct
```

**不好的例子**:
```yaml
# skills/calculator/METADATA.yml
name: calculator-and-weather
description: 计算器和天气查询
type: direct
```

### 2. 清晰的描述和关键词

提供清晰、准确的描述和关键词，有助于智能匹配。

**好的例子**:
```yaml
name: dice-roller
displayName: 骰子投掷器
description: 投掷一个或多个骰子，支持自定义面数和数量
keywords:
  - 骰子
  - dice
  - 随机
  - 投掷
  - roll
domain: games
```

**不好的例子**:
```yaml
name: dice
description: 骰子
keywords: [dice]
```

### 3. 合理的权限配置

只请求必要的权限，遵循最小权限原则。

**好的例子**:
```yaml
permissions:
  network: false
  filesystem: read
  externalApis: []
```

**不好的例子**:
```yaml
permissions:
  network: true
  filesystem: read-write
  externalApis: ['*']
```

## 代码编写规范

### 1. TypeScript代码块

使用清晰的TypeScript代码，包含类型定义。

**好的例子**:
```typescript
interface DiceRollParams {
  sides: number;
  count: number;
}

export function execute(params: DiceRollParams): number[] {
  const results: number[] = [];
  for (let i = 0; i < params.count; i++) {
    results.push(Math.floor(Math.random() * params.sides) + 1);
  }
  return results;
}
```

**不好的例子**:
```typescript
export function execute(params: any): any {
  const results = [];
  for (let i = 0; i < params.count; i++) {
    results.push(Math.random() * params.sides);
  }
  return results;
}
```

### 2. 错误处理

始终包含适当的错误处理。

**好的例子**:
```typescript
export function execute(params: { a: number; b: number; op: string }): number {
  if (typeof params.a !== 'number' || typeof params.b !== 'number') {
    throw new Error('参数必须是数字');
  }
  
  switch (params.op) {
    case '+':
      return params.a + params.b;
    case '-':
      return params.a - params.b;
    case '*':
      return params.a * params.b;
    case '/':
      if (params.b === 0) {
        throw new Error('除数不能为零');
      }
      return params.a / params.b;
    default:
      throw new Error(`不支持的操作符: ${params.op}`);
  }
}
```

### 3. 避免副作用

尽量编写纯函数，避免副作用。

**好的例子**:
```typescript
export function calculateTotal(items: number[]): number {
  return items.reduce((sum, item) => sum + item, 0);
}
```

**不好的例子**:
```typescript
let total = 0;
export function calculateTotal(items: number[]): number {
  total = 0; // 副作用：修改外部变量
  for (const item of items) {
    total += item;
  }
  return total;
}
```

## 性能优化

### 1. 减少Token使用

- 保持元数据简洁（< 50 tokens）
- 避免在SKILL.md中包含不必要的文档
- 使用代码注释而非冗长的说明

### 2. 利用缓存

- 标记可缓存的技能
- 设置合理的TTL
- 避免频繁变化的输出

```yaml
cacheable: true
ttl: 3600
```

### 3. 优化代码执行

- 避免不必要的计算
- 使用高效的算法
- 减少内存分配

## 安全最佳实践

### 1. 输入验证

始终验证输入参数。

```typescript
export function execute(params: { url: string }): string {
  if (!params.url || typeof params.url !== 'string') {
    throw new Error('URL参数无效');
  }
  
  // 验证URL格式
  try {
    new URL(params.url);
  } catch {
    throw new Error('URL格式无效');
  }
  
  // 执行操作
  return fetch(params.url);
}
```

### 2. 避免危险操作

不要使用以下危险模式：
- `eval()`
- `Function()`
- `child_process`
- `fs.writeFile`（除非必要）
- 网络请求到不可信源

### 3. 资源限制

对于可能消耗大量资源的操作，设置合理的限制。

```typescript
export function execute(params: { count: number }): number[] {
  const MAX_COUNT = 1000;
  if (params.count > MAX_COUNT) {
    throw new Error(`数量不能超过 ${MAX_COUNT}`);
  }
  
  // 执行操作
}
```

## 测试

### 1. 单元测试

为技能编写单元测试。

```typescript
describe('Calculator Skill', () => {
  it('should add two numbers', () => {
    const result = execute({ a: 2, b: 3, op: '+' });
    expect(result).toBe(5);
  });
  
  it('should throw error for division by zero', () => {
    expect(() => {
      execute({ a: 10, b: 0, op: '/' });
    }).toThrow('除数不能为零');
  });
});
```

### 2. 集成测试

测试技能在完整系统中的行为。

## 文档

### 1. SKILL.md结构

使用清晰的结构组织SKILL.md。

```markdown
# 技能名称

## 描述
简要描述技能的功能。

## 参数
- `param1` (类型): 描述
- `param2` (类型): 描述

## 示例
\`\`\`typescript
execute({ param1: 'value1', param2: 'value2' })
\`\`\`

## 代码
\`\`\`typescript
export function execute(params: Params): Result {
  // 实现
}
\`\`\`
```

### 2. 代码注释

为复杂逻辑添加注释。

```typescript
/**
 * 计算斐波那契数列的第n项
 * @param n - 项数（必须 >= 0）
 * @returns 第n项的值
 */
export function fibonacci(n: number): number {
  if (n < 0) {
    throw new Error('n必须 >= 0');
  }
  
  // 使用动态规划优化性能
  const memo = new Map<number, number>();
  // ...
}
```

## 常见陷阱

### 1. 避免循环依赖

不要创建技能之间的循环依赖。

### 2. 避免全局状态

不要依赖全局状态，使用参数传递。

### 3. 避免阻塞操作

对于可能阻塞的操作，考虑使用异步执行器。

### 4. 避免硬编码

使用配置而非硬编码值。

## 性能监控

### 1. 使用性能分析器

```typescript
const profiler = new CodeGenerationProfiler();
const code = await generator.generate(content, { profiler });
const metrics = profiler.finalize();
console.log('编译时间:', metrics.phases.compilation, 'ms');
```

### 2. 监控执行指标

```typescript
const stats = executionManager.getExecutionStats();
if (stats.averageExecutionTime > 1000) {
  console.warn('执行时间过长，考虑优化');
}
```

## 迁移指南

### 从传统插件迁移

1. 提取元数据到METADATA.yml
2. 将代码移到SKILL.md的代码块
3. 更新描述和关键词
4. 测试功能完整性
5. 验证性能

## 总结

遵循这些最佳实践可以：
- 提高技能的可维护性
- 改善性能
- 增强安全性
- 提升用户体验

更多信息请参考：
- [技术架构文档](./ARCHITECTURE.md)
- [开发者迁移指南](./MIGRATION_GUIDE.md)
- [API文档](./API.md)

