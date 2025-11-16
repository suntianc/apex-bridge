# Skills系统开发者迁移指南

## 概述

本指南帮助开发者将传统插件迁移到新的Skills格式，充分利用渐进式加载架构的优势。

## 迁移步骤

### 步骤1: 分析现有插件

首先分析现有插件的结构和功能：

```typescript
// 传统插件结构
plugins/calculator/
├── plugin-manifest.json
├── index.js
└── README.md
```

**需要提取的信息**:
- 插件名称和描述
- 执行类型（direct/service/static等）
- 输入参数
- 输出格式
- 依赖关系
- 权限要求

### 步骤2: 创建METADATA.yml

将插件元数据提取到METADATA.yml：

**传统格式** (plugin-manifest.json):
```json
{
  "name": "calculator",
  "displayName": "计算器",
  "description": "执行基本数学计算",
  "version": "1.0.0",
  "type": "direct"
}
```

**新格式** (METADATA.yml):
```yaml
name: calculator
displayName: 计算器
description: 执行基本数学计算，支持加减乘除运算
version: 1.0.0
type: direct
domain: utilities
keywords:
  - 计算
  - calculator
  - 数学
  - math
  - 加减乘除
permissions:
  network: false
  filesystem: none
cacheable: true
ttl: 3600
```

### 步骤3: 创建SKILL.md

将代码和文档迁移到SKILL.md：

**传统格式** (index.js):
```javascript
module.exports = {
  execute: async (params) => {
    const { a, b, op } = params;
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return a / b;
      default: throw new Error('不支持的操作符');
    }
  }
};
```

**新格式** (SKILL.md):
```markdown
---
# 可选的前置元数据（如果METADATA.yml不存在）
name: calculator
type: direct
---

# 计算器

## 描述

执行基本数学计算，支持加减乘除运算。

## 参数

- `a` (number): 第一个操作数
- `b` (number): 第二个操作数
- `op` (string): 操作符（+、-、*、/）

## 示例

\`\`\`typescript
execute({ a: 10, b: 5, op: '+' }) // 返回 15
execute({ a: 10, b: 5, op: '-' }) // 返回 5
execute({ a: 10, b: 5, op: '*' }) // 返回 50
execute({ a: 10, b: 5, op: '/' }) // 返回 2
\`\`\`

## 代码

\`\`\`typescript
interface CalculatorParams {
  a: number;
  b: number;
  op: '+' | '-' | '*' | '/';
}

export function execute(params: CalculatorParams): number {
  const { a, b, op } = params;
  
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('操作数必须是数字');
  }
  
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      if (b === 0) {
        throw new Error('除数不能为零');
      }
      return a / b;
    default:
      throw new Error(`不支持的操作符: ${op}`);
  }
}
\`\`\`
```

### 步骤4: 迁移资源文件

如果有资源文件，移动到skills目录：

**传统结构**:
```
plugins/calculator/
├── plugin-manifest.json
├── index.js
└── assets/
    └── icon.png
```

**新结构**:
```
skills/calculator/
├── METADATA.yml
├── SKILL.md
└── assets/
    └── icon.png
```

### 步骤5: 更新依赖

检查并更新依赖关系：

**传统格式**:
```javascript
const axios = require('axios');
```

**新格式**:
```typescript
// 在SKILL.md的代码块中
// 系统会自动处理依赖注入
```

注意：确保依赖在允许列表中，或使用自定义解析器。

### 步骤6: 测试迁移结果

1. **功能测试**: 验证功能是否完整
2. **性能测试**: 检查执行时间和内存使用
3. **兼容性测试**: 确保与现有系统兼容

```typescript
// 测试示例
describe('Calculator Skill Migration', () => {
  it('should work as before', async () => {
    const response = await executionManager.execute({
      skillName: 'calculator',
      parameters: { a: 10, b: 5, op: '+' }
    });
    
    expect(response.success).toBe(true);
    expect(response.result?.data).toBe(15);
  });
});
```

## 迁移检查清单

- [ ] METADATA.yml包含所有必要字段
- [ ] SKILL.md包含清晰的文档和代码
- [ ] 代码使用TypeScript类型
- [ ] 输入验证完整
- [ ] 错误处理适当
- [ ] 权限配置最小化
- [ ] 资源文件已迁移
- [ ] 依赖关系已更新
- [ ] 功能测试通过
- [ ] 性能测试通过

## 常见迁移场景

### 场景1: Direct插件迁移

**传统插件**:
```javascript
module.exports = {
  execute: async (params) => {
    // 同步或异步逻辑
    return result;
  }
};
```

**Skills格式**:
```typescript
export async function execute(params: Params): Promise<Result> {
  // 相同的逻辑，但使用TypeScript
  return result;
}
```

### 场景2: Service插件迁移

**传统插件**:
```javascript
module.exports = {
  execute: async (params) => {
    const response = await axios.get('https://api.example.com/data');
    return response.data;
  }
};
```

**Skills格式**:
```yaml
# METADATA.yml
type: service
config:
  endpoint: https://api.example.com/data
  method: GET
```

或保持direct类型但使用HTTP客户端（如果允许）。

### 场景3: Static插件迁移

**传统插件**:
```javascript
module.exports = {
  execute: async (params) => {
    return {
      data: require('./data.json')
    };
  }
};
```

**Skills格式**:
```yaml
# METADATA.yml
type: static
config:
  dataFile: data.json
```

### 场景4: 带资源的插件迁移

**传统插件**:
```javascript
const fs = require('fs');
module.exports = {
  execute: async (params) => {
    const template = fs.readFileSync('./template.html', 'utf-8');
    return template.replace('{{name}}', params.name);
  }
};
```

**Skills格式**:
```
skills/template/
├── METADATA.yml
├── SKILL.md
└── templates/
    └── template.html
```

在SKILL.md中：
```typescript
// 资源会自动加载到resources中
export function execute(params: { name: string }, resources: SkillResources): string {
  const template = resources.assets.find(a => a.name === 'template.html');
  return template.content.replace('{{name}}', params.name);
}
```

## 性能优化建议

### 1. 利用缓存

标记可缓存的技能：
```yaml
cacheable: true
ttl: 3600
```

### 2. 优化元数据

保持元数据简洁（< 50 tokens）：
```yaml
# 好的例子
description: 执行数学计算

# 不好的例子
description: 这是一个功能强大的计算器，支持加法、减法、乘法、除法等多种运算，可以处理整数、小数、负数等各种数值类型...
```

### 3. 减少代码大小

将大型代码拆分为多个辅助函数，或使用资源文件。

## 故障排查

### 问题1: 技能无法找到

**原因**: 索引未构建或路径不正确

**解决**:
```typescript
await skillsIndex.buildIndex();
const metadata = skillsIndex.getMetadata('calculator');
```

### 问题2: 执行失败

**原因**: 代码错误或依赖缺失

**解决**:
- 检查代码语法
- 验证依赖是否在允许列表
- 查看错误日志

### 问题3: 性能下降

**原因**: 缓存未启用或配置不当

**解决**:
- 启用缓存
- 调整缓存大小和TTL
- 使用代码缓存

## 向后兼容

本项目现已切换为 Skills-only 架构，传统插件运行时（PluginRuntime）已移除。
如需迁移历史插件，请使用仓库内提供的迁移脚本：

```bash
node apex-bridge/scripts/migrate-skills-to-claude-package.js --source ./plugins --target ./skills
```

迁移完成后，确保：
- `SKILL.md` 前言区包含 ABP 配置（protocol: abp / abp.tools）
- 执行入口位于 `scripts/execute.ts` 并默认导出
- 资源与参考资料已移动至 `assets/`、`references/`

## 迁移工具

### 自动化迁移脚本

```typescript
import { migratePlugin } from './migration-tool';

await migratePlugin({
  sourcePath: './plugins/calculator',
  targetPath: './skills/calculator',
  options: {
    generateMetadata: true,
    generateSkillDoc: true,
    preserveResources: true
  }
});
```

## 总结

迁移到Skills格式可以：
- 减少Token使用90%
- 提升加载速度60%
- 改善开发体验
- 增强可维护性

更多信息请参考：
- [技术架构文档](./ARCHITECTURE.md)
- [最佳实践指南](./BEST_PRACTICES.md)
- [API文档](./API.md)

