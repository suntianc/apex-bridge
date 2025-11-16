---
title: Skills 开发指南
type: documentation
module: skills
documentation: development
priority: high
environment: all
last-updated: 2025-11-16
---

# 🧩 Skills 开发指南

本文档介绍如何开发 ApexBridge 的 Skills 能力。

## 📚 目录

- [什么是 Skills](#什么是-skills)
- [快速开始](#快速开始)
- [目录结构](#目录结构)
- [SKILL.md 详解](#skillmd-详解)
- [开发步骤](#开发步骤)
- [测试 Skills](#测试-skills)
- [发布 Skills](#发布-skills)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)

## 🤔 什么是 Skills

Skills 是 ApexBridge 的能力单元，用于扩展系统功能。每个 Skill 包含：

- **元数据**: 名称、描述、参数定义
- **执行逻辑**: TypeScript/JavaScript 代码
- **资源文件**: 数据、配置、模板等

## 🚀 快速开始

### 1. 创建 Skills 结构

使用脚本创建新 Skill：

```bash
# 交互式创建 npm run skill:create

# 或手动创建目录
mkdir -p skills/MySkill/{scripts,references,assets}
```

### 2. 编写 SKILL.md

创建 `skills/MySkill/SKILL.md`:

```markdown
---
abp:
  tools:
    - name: "my_tool"
      kind: "tool"
      description: "我的工具"
      parameters:
        input:
          type: "string"
          description: "输入文本"
          required: true
---

## 执行逻辑

1. 接收输入
2. 处理数据
3. 返回结果
```

### 3. 编写执行脚本

创建 `skills/MySkill/scripts/execute.ts`:

```typescript
export default async function execute({
  parameters,
  metadata,
  logger
}: {
  parameters: any;
  metadata?: Record<string, any>;
  logger?: any;
}) {
  const { input } = parameters;

  logger?.info('MySkill executed', { input });

  return {
    success: true,
    result: {
      output: `Processed: ${input}`,
      timestamp: Date.now()
    }
  };
}
```

### 4. 测试 Skills

```bash
# 重启服务，自动加载新 Skill
npm run dev

# 或使用验证脚本
npm run validate:skills
```

## 📁 目录结构

```
skills/{SkillName}/
├── SKILL.md                          # Skills 定义
├── scripts/
│   └── execute.ts                    # 执行入口
├── references/                       # 参考数据
│   └── data.json
└── assets/                           # 资源文件
    └── template.html
```

### 必需文件

- `SKILL.md` - Skills 定义和说明
- `scripts/execute.ts` - 执行入口

### 可选目录

- `references/` - 静态数据文件
- `assets/` - 资源文件（图片、模板等）

## 📝 SKILL.md 详解

### 文件结构

```markdown
---
# 前言区（ABP配置）
abp:
  tools:
    - name: "tool_name"
      kind: "tool"
      description: "工具描述"
      parameters: { ... }
---

# 正文（执行指令）
## 注意事项
...

## 参考文件
- references/data.json
```

### ABP 配置

#### 工具定义

```yaml
abp:
  tools:
    - name: "calendar_task"              # 工具名（唯一）
      kind: "tool"                        # 类型：tool
      description: "记录日历任务"        # 描述
      parameters:                         # 参数
        title:
          type: "string"
          description: "任务标题"
          required: true
        deadline:
          type: "string"
          description: "截止日期"
          required: false
```

#### 参数类型

- `string`: 字符串
- `number`: 数字
- `boolean`: 布尔值
- `array`: 数组
- `object`: 对象

### 三段渐进式披露

系统根据置信度和偏好显示不同级别的信息：

**Metadata**（元数据）:
- 名称、描述、工具签名
- 用于快速识别

**Brief**（简要）:
- 参数定义
- 约束条件

**Full**（完整）:
- 完整说明
- 参考文件
- 示例

**配置偏好：**

```json
{
  "preferences": {
    "toolsDisclosure": "metadata|brief|full"
  }
}
```

## 🔧 开发步骤

### 步骤 1: 规划 Skills

- [ ] 确定 Skills 目标
- [ ] 定义输入输出
- [ ] 识别依赖
- [ ] 评估复杂度

### 步骤 2: 创建结构

```bash
cd skills
mkdir -p MyAmazingSkill/{scripts,references,assets}
cd MyAmazingSkill
```

### 步骤 3: 编写元数据

创建 `SKILL.md`:

```yaml
---
abp:
  tools:
    - name: "my_amazing_tool"
      kind: "tool"
      description: "执行令人惊叹的操作"
      parameters:
        input:
          type: "string"
          description: "输入数据"
          required: true
        options:
          type: "object"
          description: "选项配置"
          required: false
---

## 功能说明

这个 Skills 能...

## 使用示例

输入：
```json
{
  "input": "测试数据",
  "options": {
    "verbose": true
  }
}
```

输出：
```json
{
  "output": "处理结果",
  "metadata": {}
}
```

## 依赖

- Node.js 内置模块
- axios (需安装)
```

### 步骤 4: 实现执行逻辑

创建 `scripts/execute.ts`:

```typescript
import axios from 'axios';

interface Parameters {
  input: string;
  options?: {
    verbose?: boolean;
  };
}

interface Result {
  output: string;
  processedAt: number;
  metadata?: Record<string, any>;
}

export default async function execute({
  parameters,
  metadata,
  logger
}: {
  parameters: Parameters;
  metadata?: Record<string, any>;
  logger?: any;
}): Promise<{
  success: boolean;
  result?: Result;
  error?: {
    code: string;
    message: string;
  };
}> {
  try {
    const { input, options } = parameters;
    const userId = metadata?.userId;

    logger?.info('MyAmazingSkill executing', {
      input,
      userId,
      verbose: options?.verbose
    });

    // 处理逻辑
    const output = `Processed "${input}" with ${options?.verbose ? 'verbose' : 'normal'} mode`;

    if (options?.verbose) {
      logger?.debug('Verbose mode enabled', { inputLength: input.length });
    }

    // 异步操作示例
    const externalData = await fetchExternalData(input);

    return {
      success: true,
      result: {
        output,
        processedAt: Date.now(),
        metadata: {
          ...externalData,
          userId
        }
      }
    };
  } catch (error) {
    logger?.error('MyAmazingSkill failed', error);

    return {
      success: false,
      error: {
        code: 'EXECUTION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

// 辅助函数
async function fetchExternalData(input: string): Promise<Record<string, any>> {
  // 模拟 API 调用
  return {
    external: true,
    timestamp: Date.now()
  };
}
```

### 步骤 5: 添加依赖

如果 Skills 需要额外依赖：

```bash
# 在 skills/MyAmazingSkill/ 目录下
npm init -y
npm install axios
```

**注意**：
- 依赖会增大 Skills 加载时间
- 优先使用 Node.js 内置模块
- 考虑 bundle 大小

### 步骤 6: 添加资源

可选资源文件：

```
skills/MyAmazingSkill/
├── references/
│   └── data.json          # 静态数据
├── assets/
│   └── template.html      # 模板文件
```

在脚本中使用：

```typescript
import * as path from 'path';
import * as fs from 'fs';

const referencesPath = path.join(__dirname, '..', 'references');
const data = JSON.parse(fs.readFileSync(path.join(referencesPath, 'data.json'), 'utf8'));
```

### 步骤 7: 测试

```bash
# 验证格式
npm run validate:skills

# 运行特定 Skills 测试
npm test -- MyAmazingSkill

# 手动测试
npm run dev

# 使用测试脚本
npm run test:skill MyAmazingSkill
```

### 步骤 8: 文档完善

更新 `SKILL.md`：

```markdown
## 详细说明

### 参数

- `input` (string, required): 输入数据
- `options.verbose` (boolean, optional): 是否启用详细日志

### 返回值

```typescript
{
  "output": string;           // 处理结果
  "processedAt": number;      // 时间戳
  "metadata": {               // 附加信息
    "external": boolean;
    "timestamp": number;
    "userId"?: string;
  }
}
```

### 错误码

- `INVALID_INPUT`: 输入格式错误
- `EXECUTION_FAILED`: 执行失败
- `EXTERNAL_API_ERROR`: 外部 API 错误

### 完整示例

输入：
```json
{
  "input": "测试数据",
  "options": {
    "verbose": true
  }
}
```

输出：
```json
{
  "output": "Processed \"测试数据\" with verbose mode",
  "processedAt": 1700000000000,
  "metadata": {
    "external": true,
    "timestamp": 1700000000000
  }
}
```
```

## 🧪 测试 Skills

### 单元测试

创建 `scripts/execute.test.ts`:

```typescript
import execute from './execute';

describe('MyAmazingSkill', () => {
  test('should process input successfully', async () => {
    const result = await execute({
      parameters: {
        input: 'test data'
      },
      metadata: {
        userId: 'user-123'
      },
      logger: console
    });

    expect(result.success).toBe(true);
    expect(result.result?.output).toContain('test data');
  });

  test('should handle errors', async () => {
    const result = await execute({
      parameters: {
        input: ''  // 无效输入
      },
      logger: console
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

### 集成测试

```bash
# 启动服务
npm run dev

# 测试 API
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Use MyAmazingSkill with input \"测试\"",
    "userId": "test-user"
  }'
```

### 手动测试

**测试策略**：
1. 使用简单输入测试基本功能
2. 测试边界条件（空输入、特殊字符等）
3. 测试错误处理
4. 测试性能（大数据量）
5. 测试并发

## 📤 发布 Skills

### 发布到 Git

```bash
# 添加 Skills
git add skills/MyAmazingSkill/

# 提交
git commit -m "feat(skills): add MyAmazingSkill"

# 推送到远程
git push origin main
```

### 版本控制

```bash
# 使用语义化版本
git tag -a skills-my-amazing-v1.0.0 -m "Release MyAmazingSkill v1.0.0"
git push origin skills-my-amazing-v1.0.0

# 或提交到 main 分支
```

## 💡 最佳实践

### 1. 代码质量

- [ ] 使用 TypeScript 类型
- [ ] 添加错误处理
- [ ] 添加日志记录
- [ ] 编写测试
- [ ] 添加文档

### 2. 性能优化

- [ ] 避免阻塞操作
- [ ] 使用异步 API
- [ ] 合理使用缓存
- [ ] 限制资源使用

### 3. 安全考虑

- [ ] 验证输入参数
- [ ] 防止注入攻击
- [ ] 安全处理敏感数据
- [ ] 限制执行时间

### 4. 可维护性

- [ ] 清晰的命名
- [ ] 添加注释
- [ ] 模块化设计
- [ ] 版本控制

### 5. 用户体验

- [ ] 提供清晰的错误信息
- [ ] 返回有用的数据
- [ ] 合理的默认值
- [ ] 详细的文档

## ❓ 常见问题

### Q: Skills 加载失败？

**检查：**
- 文件结构是否正确
- SKILL.md 格式是否有效
- scripts/execute.ts 是否存在
- 语法错误

**验证：**
```bash
npm run validate:skills
```

### Q: 依赖安装失败？

**解决：**
```bash
# 清理缓存
npm cache clean --force

# 重新安装
npm install

# 检查网络
npm config get registry
```

### Q: 性能问题？

**优化：**
- 使用异步操作
- 减少依赖
- 缓存结果
- 优化算法

### Q: 如何处理异步操作？

**推荐：**
```typescript
export default async function execute({ ... }) {
  // ✅ 正确：使用 async/await
  const result = await fetchData();

  // ⚠️ 注意：错误处理
  try {
    const result = await riskyOperation();
  } catch (error) {
    logger?.error('Operation failed', error);
  }
}
```

### Q: 如何调试 Skills？

**方法：**
1. 使用 `logger?.debug()`
2. 查看日志: `logs/app.log`
3. 使用 console.log
4. 编写测试

### Q: Skills 可以调用其他 Skills 吗？

**回答：** 不推荐直接调用，建议：
- 保持 Skills 独立
- 在应用层组合
- 使用聊天服务协调

## 📚 示例 Skills

### 示例 1: WeatherInfo

**功能**: 获取天气信息
**路径**: `skills/WeatherInfo/`
**学习重点**: 外部 API 调用

### 示例 2: DemoAsyncTask

**功能**: 异步任务演示
**路径**: `skills/DemoAsyncTask/`
**学习重点**: 异步处理

### 示例 3: RockPaperScissors

**功能**: 石头剪刀布游戏
**路径**: `skills/RockPaperScissors/`
**学习重点**: 游戏逻辑

### 示例 4: SystemInfo

**功能**: 系统信息查询
**路径**: `skills/SystemInfo/`
**学习重点**: 系统调用

---

## 📞 获取帮助

- **文档**: [Skills 格式](./SKILL_FORMAT.md)
- **测试**: [Skills 集成测试](./INTEGRATION_TESTS.md)
- **迁移**: [迁移指南](./MIGRATION_GUIDE.md)
- **问题**: 提交 GitHub Issue

---

**最后更新**: 2025-11-16
**文档版本**: v1.0.1
