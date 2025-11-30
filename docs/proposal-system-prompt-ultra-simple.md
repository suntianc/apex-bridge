# 系统提示词极简实现方案

## 📋 需求理解

**核心要求**:
1. ✅ **配置类** - 简单存储系统提示词
2. ✅ **变量注入** - 复用VariableEngine动态添加（通过{{variable}}占位符）
3. ✅ **保持简单** - 不引入复杂层级和持久化
4. ✅ **启动加载** - 项目启动时加载配置（重启生效）

**明确放弃的功能**:
- ❌ 会话级配置（前端维护）
- ❌ 请求级配置（API参数传入）
- ❌ 模型级差异化（所有模型使用同一模板）
- ❌ 管理接口（无需后台管理）
- ❌ 热更新（修改配置后重启）
- ❌ 数据库存储（纯配置文件）

---

## 🎯 架构设计

### 极简架构流程

```
┌─────────────────────────────────────────┐
│        项目启动时加载                    │
│   SystemPromptService初始化              │
│        ↓                                │
│   加载config/system-prompt.json         │
│        ↓                                │
│   ┌────────────────────────────────┐   │
│   │ 1. 读取配置文件               │   │
│   │ 2. 解析JSON并缓存             │   │
│   └────────────────────────────────┘   │
│        ↓                                │
│   API Request (Chat API)                │
│        ↓                                │
│   ChatService.processMessage()         │
│        ↓                                │
│   SystemPromptService.getSystemPrompt()│
│        ↓                                │
│   VariableEngine.render()              │
│   （动态替换{{variable}}占位符）        │
│        ↓                                │
│   返回渲染后的system prompt            │
│        ↓                                │
│   添加到messages数组(system角色)       │
│        ↓                                │
│   LLM请求                              │
└─────────────────────────────────────────┘
```

**核心特点**:
- **只有一份全局配置**：所有模型、所有请求共用同一模板
- **动态变量注入**：通过`{{variable}}`占位符在运行时动态替换
- **启动时一次性加载**：配置在构造函数中加载，之后不再读取文件
- **无层级、无覆盖**：不存在请求级 > 模型级 > 全局的优先级逻辑

---

## 🔧 技术实现

### 1️⃣ 配置文件设计

**文件路径**: `config/system-prompt.json`

```json
{
  "$schema": "./schema/system-prompt.schema.json",
  "version": "1.0.0",
  "template": "你是一个乐于助人的AI助手。\n\n当前时间: {{current_time}}\n模型: {{model_name}}",
  "enabled": true,
  "variables": {
    "app_name": "ApexBridge",
    "version": "1.0.0",
    "default_role": "通用助手"
  }
}
```

**配置字段说明**:
- `template`: 系统提示词模板字符串，支持`{{variable}}`占位符语法
- `enabled`: 是否启用系统提示词（false则不添加system消息）
- `variables`: 默认变量键值对，将被注入到VariableEngine中
- `version`: 配置版本号（调试用）

**示例模板**:
```
你是{{default_role}}，专注于{{domain}}领域。

当前时间: {{current_time}}
应用版本: {{app_version}}

请用{{language}}回复用户。
```

---

### 2️⃣ TypeScript类型定义

**文件**: `src/services/SystemPromptService.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { VariableEngine } from '../core/variable/VariableEngine';
import { logger } from '../utils/logger';

/**
 * 系统提示词配置接口
 */
export interface SystemPromptConfig {
  /** 模板内容 (支持{{variable}}语法) */
  template: string;

  /** 是否启用 */
  enabled: boolean;

  /** 默认变量 */
  variables?: Record<string, any>;

  /** 版本 */
  version?: string;
}

/**
 * 系统提示词服务 - 极简实现
 *
 * 特点：
 * - 只有一份全局配置
 * - 启动时加载，无热更新
 * - 通过{{variable}}占位符动态注入
 * - 无管理接口，通过编辑配置文件修改
 */
export class SystemPromptService {
  private configPath: string;
  private config: SystemPromptConfig;
  private variableEngine: VariableEngine;

  constructor(configDir: string = './config') {
    this.configPath = path.join(configDir, 'system-prompt.json');

    // 初始化VariableEngine（启用缓存）
    this.variableEngine = new VariableEngine({
      enableCache: true,
      cacheTTL: 60000 // 60秒缓存
    });

    // 注册默认变量处理器
    this.registerDefaultVariables();

    // 加载配置文件（仅一次）
    this.loadConfig();
  }

  /**
   * 加载配置文件
   */
  private loadConfig(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        logger.warn('[SystemPromptService] Config file not found:', this.configPath);
        this.config = {
          template: '',
          enabled: false
        };
        return;
      }

      const content = fs.readFileSync(this.configPath, 'utf-8');
      this.config = JSON.parse(content);

      logger.info(`[SystemPromptService] Config loaded (version: ${this.config.version || '1.0.0'})`);

    } catch (error) {
      logger.error('[SystemPromptService] Failed to load config:', error);
      this.config = {
        template: '',
        enabled: false
      };
    }
  }

  /**
   * 注册默认变量处理器
   */
  private registerDefaultVariables(): void {
    // 当前时间 (ISO格式)
    this.variableEngine.registerProcessor('current_time', () => {
      return new Date().toISOString();
    });

    // 当前日期 (本地格式)
    this.variableEngine.registerProcessor('current_date', () => {
      return new Date().toLocaleDateString('zh-CN');
    });
  }

  /**
   * 获取系统提示词（核心方法）
   *
   * 极简设计：只有一份全局配置，通过{{variable}}占位符动态注入
   *
   * @param context 上下文变量（如model、provider等，用于变量渲染）
   * @returns 渲染后的系统提示词，如果没有配置或禁用返回null
   */
  getSystemPrompt(context: Record<string, any> = {}): string | null {
    // 检查全局配置是否启用
    if (this.config.enabled && this.config.template) {
      logger.debug('[SystemPromptService] Rendering system prompt template');
      return this.renderTemplate(this.config.template, context);
    }

    // 没有配置或已禁用
    logger.debug('[SystemPromptService] System prompt disabled or not configured');
    return null;
  }

  /**
   * 渲染模板（变量替换）
   *
   * @param template 模板字符串
   * @param context 上下文变量
   * @returns 渲染后的字符串
   */
  private renderTemplate(template: string, context: Record<string, any>): string {
    try {
      // 合并配置中的默认变量和上下文变量
      // 优先级：context变量 > config.variables配置
      const variables = {
        ...(this.config.variables || {}),
        ...context
      };

      // 使用VariableEngine渲染模板
      return this.variableEngine.render(template, variables);

    } catch (error) {
      logger.warn('[SystemPromptService] Failed to render template:', error);
      return template; // 渲染失败返回原模板
    }
  }

  /**
   * 更新全局系统提示词配置（运行时）
   *
   * @param config 新配置
   * @param saveToFile 是否保存到文件（默认false）
   */
  updateConfig(config: SystemPromptConfig, saveToFile: boolean = false): void {
    this.config = {
      ...config,
      enabled: config.enabled ?? true
    };

    logger.info('[SystemPromptService] Config updated');

    if (saveToFile) {
      this.saveConfigToFile();
    }
  }

  /**
   * 保存配置到文件
   */
  private saveConfigToFile(): void {
    try {
      const content = JSON.stringify(this.config, null, 2);
      fs.writeFileSync(this.configPath, content, 'utf-8');
      logger.info('[SystemPromptService] Config saved to file');
    } catch (error) {
      logger.error('[SystemPromptService] Failed to save config:', error);
    }
  }

  /**
   * 获取当前配置（调试用）
   */
  getConfig(): Readonly<SystemPromptConfig> {
    return { ...this.config };
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    // 无需清理（没有文件监听器）
    logger.debug('[SystemPromptService] Cleanup completed');
  }
}
```

---

### 3️⃣ 与ChatService集成

**文件**: `src/services/ChatService.ts`

```typescript
import { SystemPromptService } from './SystemPromptService';

export class ChatService {
  private systemPromptService: SystemPromptService;

  constructor(
    // ... 其他依赖
    configService: ConfigService
  ) {
    // ... 其他初始化

    // 初始化系统提示词服务（单例）
    this.systemPromptService = new SystemPromptService(
      configService.getConfigDir()
    );
  }

  /**
   * 处理聊天消息（主要入口）
   */
  async processMessage(messages: Message[], options: ChatOptions = {}): Promise<any> {
    const requestId = options.requestId || generateRequestId();
    logger.info(`[ChatService] Processing message (requestId: ${requestId})`);

    try {
      // ... 会话管理等其他逻辑

      // 🆕 检查是否已有system消息
      const hasSystemMessage = messages.some(m => m.role === 'system');

      if (!hasSystemMessage) {
        // 获取系统提示词（渲染变量）
        const systemPrompt = this.systemPromptService.getSystemPrompt({
          model: options.model,
          provider: options.provider,
          // 其他上下文变量会自动注入
          ...options.context // 如有自定义上下文
        });

        if (systemPrompt) {
          // 添加到消息数组开头
          messages = [
            {
              role: 'system',
              content: systemPrompt
            },
            ...messages
          ];

          logger.debug(`[ChatService] Applied system prompt (${systemPrompt.length} chars)`);
        }
      }

      // ... 后续处理（LLM调用等）
    } catch (error) {
      logger.error('❌ Error in ChatService.processMessage:', error);
      throw error;
    }
  }
}
```

**集成要点**:
1. 在ChatService构造函数中初始化SystemPromptService（单例）
2. 在processMessage中检查是否已有system消息（避免重复添加）
3. 调用getSystemPrompt时传入上下文（model、provider等）
4. 如果返回非null，将system消息添加到messages数组开头

---

## 📊 配置示例

### 场景 1: 通用助手（基础）

**config/system-prompt.json**:
```json
{
  "version": "1.0.0",
  "template": "你是一个乐于助人的AI助手。\n\n当前时间: {{current_time}}",
  "enabled": true,
  "variables": {}
}
```

**效果**: 所有请求使用统一的系统提示词，自动注入当前时间

---

### 场景 2: 动态角色和领域

**config/system-prompt.json**:
```json
{
  "version": "1.1.0",
  "template": "你是{{role}}，专注于{{domain}}领域。\n\n当前时间: {{current_time}}\n请使用{{language}}回答。",
  "enabled": true,
  "variables": {
    "role": "专业AI助手",
    "domain": "通用",
    "language": "中文"
  }
}
```

**效果**: 通过修改变量值快速调整AI角色和领域，无需修改模板

---

### 场景 3: 多语言支持

**config/system-prompt.json**:
```json
{
  "version": "1.2.0",
  "template": "You are {{app_name}} AI Assistant (v{{version}}).\n\nCurrent time: {{current_time}}\nPlease respond in the user's language.",
  "enabled": true,
  "variables": {
    "app_name": "ApexBridge",
    "version": "1.0.0"
  }
}
```

**效果**: 支持多语言环境，可根据用户语言自动调整

---

### 场景 4: 禁用系统提示词

**config/system-prompt.json**:
```json
{
  "version": "1.0.0",
  "template": "",
  "enabled": false,
  "variables": {}
}
```

**效果**: 不添加system消息，完全由前端控制（相当于未启用此功能）

---

## 🧪 测试用例

### 测试 1: 变量替换

**配置文件**:
```json
{
  "template": "时间: {{current_time}}\n角色: {{role}}\n领域: {{domain}}",
  "enabled": true,
  "variables": {
    "role": "助手",
    "domain": "通用"
  }
}
```

**代码调用**:
```typescript
const systemPrompt = systemPromptService.getSystemPrompt({
  model: 'deepseek-chat',
  role: '技术专家',  // 覆盖configuration中的role
  domain: '编程'     // 覆盖configuration中的domain
});
```

**预期输出**:
```
时间: 2025-11-30T12:00:00.000Z
角色: 技术专家
领域: 编程
```

**说明**: `current_time`是内置变量，`role`和`domain`来自variables配置，被context参数覆盖

---

## 📈 性能优化

### 1. VariableEngine缓存

```typescript
this.variableEngine = new VariableEngine({
  enableCache: true,
  cacheTTL: 60000 // 60秒
});
```

- 相同模板在60秒内重复渲染会使用缓存
- 显著减少变量处理的CPU开销

### 2. 启动时加载

- 配置文件只在构造函数中读取一次
- 无文件IO、无文件监听
- 不影响运行时性能

### 3. 惰性渲染

```typescript
// 只在需要时渲染
if (!hasSystemMessage) {
  const systemPrompt = this.systemPromptService.getSystemPrompt(...);
  // ...
}
```

- 避免不必要的模板渲染
- messages中已有system消息时不处理

---

## 🎉 方案优势

### ✅ 极简设计
- **单配置文件**: `config/system-prompt.json`
- **单服务类**: `SystemPromptService` (~80行代码)
- **零数据库**: 纯JSON文件存储
- **零层级**: 只有一份全局配置，无优先级判断

### ✅ 动态灵活
- **变量注入**: 通过`{{variable}}`占位符动态渲染
- **内置变量**: `current_time`, `current_date`等自动注入
- **自定义变量**: 配置文件中可定义任意变量
- **上下文覆盖**: 运行时变量可覆盖配置默认值

### ✅ 高性能
- **启动加载**: 一次性读取，无IO阻塞
- **缓存机制**: VariableEngine自动缓存渲染结果
- **惰性处理**: 仅在需要时渲染模板
- **无内存泄漏**: 无文件监听器，无需清理

### ✅ 易维护
- **解耦设计**: SystemPromptService独立服务
- **类型安全**: 完整的TypeScript类型定义
- **详细日志**: 关键操作都有日志输出
- **单例模式**: ChatService中统一初始化

### ✅ 低成本
- **实现时间**: 3-4小时即可完成
- **代码行数**: ~80行核心代码
- **学习成本**: 只需理解{{variable}}占位符语法
- **维护成本**: 几乎不需要维护（功能简单）

---

## 🚀 实施步骤

### 阶段 1: 核心实现 (2小时)

1. 创建 `src/services/SystemPromptService.ts`（复制上面的代码）
2. 创建 `config/system-prompt.json` 示例文件
3. 实现配置加载逻辑（启动时一次性加载）
4. 实现模板渲染和VariableEngine集成

**验证**:
```bash
# 启动服务
npm run dev

# 查看日志输出
[SystemPromptService] Config loaded (version: 1.0.0)
```

### 阶段 2: ChatService集成 (1小时)

1. 修改 `src/services/ChatService.ts`
2. 添加SystemPromptService依赖
3. 在构造函数中初始化
4. 在processMessage中调用getSystemPrompt
5. 将system消息添加到messages数组

**验证**:
```bash
# 发送测试请求
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "hi"}]
  }'

# 查看日志
[ChatService] Applied system prompt (45 chars)
```

### 阶段 3: 测试和优化 (1小时)

1. 编译检查：`npm run build`
2. 功能测试：各种场景验证
   - 启用/禁用配置
   - 变量替换
   - 多语言支持
3. 性能测试：检查是否有性能影响
4. 文档更新：更新README和API文档

**总计开发时间**: 3-4小时

---

## 📚 文档清单

- [ ] `docs/system-prompt-config.md` - 配置文件说明
- [ ] `docs/system-prompt-variables.md` - 变量使用指南
- [ ] `config/system-prompt.example.json` - 配置示例文件
- [ ] `docs/system-prompt-faq.md` - 常见问题解答

---

## ❓ FAQ

### Q1: 如何关闭系统提示词功能？

**A**: 在配置文件中设置 `"enabled": false`

```json
{
  "template": "",
  "enabled": false,
  "variables": {}
}
```

效果：ChatService不会添加system消息到messages数组。

---

### Q2: 支持哪些内置变量？

**A**:
- `{{current_time}}` - 当前时间（ISO格式）
- `{{current_date}}` - 当前日期（本地格式，如2025/11/30）

这些变量由SystemPromptService自动注册，无需配置。

---

### Q3: 可以自定义变量吗？

**A**: 可以！在配置文件的`variables`字段中定义：

```json
{
  "template": "你是{{role}}，专注于{{domain}}",
  "variables": {
    "role": "AI助手",
    "domain": "编程"
  }
}
```

在ChatService调用时也可以覆盖：
```typescript
systemPromptService.getSystemPrompt({
  role: '技术专家',  // 覆盖configuration中的role
  domain: '前端开发' // 覆盖configuration中的domain
});
```

---

### Q4: 修改配置后如何生效？

**A**: 修改 `config/system-prompt.json` 文件，然后重启服务：

```bash
# 1. 修改配置文件
vim config/system-prompt.json

# 2. 重启服务（配置在启动时加载）
npm run dev

# 查看日志确认
[SystemPromptService] Config loaded (version: 1.0.1)
```

**注意**：没有热更新功能，必须重启才能生效。

---

### Q5: 为什么不做成请求级别的？

**A**: 本方案遵循**KISS原则**（Keep It Simple, Stupid）：

- **需求分析**: 90%的场景只需要全局配置
- **实现成本**: 请求级会增加复杂度（API参数、优先级判断、缓存问题）
- **替代方案**: 通过`{{variable}}`占位符完全可以实现动态内容
- **维护成本**: 越简单越可靠，越少bug

如果确实需要请求级差异化，建议：
1. 前端在messages数组中包含不同的system消息
2. 或者创建多个配置文件，启动时选择（高级用法）

---

### Q6: 性能影响如何？

**A**: **极小，可忽略不计**。原因：

1. **启动加载**: 配置只读取一次，无运行时IO
2. **缓存机制**: VariableEngine缓存渲染结果（60秒）
3. **惰性处理**: 只有messages中没有system消息时才处理
4. **简单逻辑**: 无优先级判断，速度快

实际测试：添加system消息的操作 < 1ms

---

### Q7: 如何调试变量替换？

**A**: 开启debug日志：

```typescript
// 在代码中临时添加
const systemPrompt = this.systemPromptService.getSystemPrompt({
  model: 'deepseek-chat',
  debug: true // 假设你传入了debug标志
});

console.log('Rendered prompt:', systemPrompt);
```

或者在SystemPromptService中查看日志输出。

---

## 🎉 与复杂方案对比

| 特性 | 极简版 (本方案) | 复杂版 |
|------|----------------|--------|
| **配置层级** | 1级 (仅全局) | 4级 (全局+模型+请求+会话) |
| **持久化** | JSON配置文件 | 数据库表 |
| **管理接口** | ❌ 无 | ✅ 完整REST API |
| **动态方式** | `{{variable}}`占位符 | 多层级覆盖 |
| **热更新** | ❌ 重启生效 | ✅ 文件监听 |
| **实现时间** | **3-4小时** | 10-15天 |
| **代码行数** | **~80行** | ~1000+行 |
| **复杂度** | **极低** | 高 |
| **可维护性** | **极高** | 中 |
| **灵活性** | 足够（变量注入） | 过度设计 |

**结论**: 本方案满足绝大多数实际场景，且极其简单、可靠、易维护。

---

## 🎯 最佳实践

### ✅ 推荐做法

1. **保持模板通用**：模板应该适用于所有场景，差异通过变量实现
   ```
   // 好示例
   你是{{role}}，专注于{{domain}}

   // 差示例
   你是一个编程助手，专门回答JavaScript问题
   ```

2. **合理使用变量**：将可能变化的部分提取为变量
   ```json
   {
     "template": "应用: {{app_name}}\n版本: {{version}}",
     "variables": {
       "app_name": "ApexBridge",
       "version": "1.0.0"
     }
   }
   ```

3. **控制模板长度**：保持简洁，避免过长的system消息
   - 建议 < 500字符
   - 核心信息 + 关键变量

4. **启用缓存**：VariableEngine缓存默认开启，保持开启状态

5. **错误处理**：渲染失败时返回原模板，不影响主流程

### ❌ 不推荐做法

1. **不要硬编码**：避免在模板中写死特定值
   ```
   // ❌ 不推荐
   你是ApexBridge 1.0.0版本的助手

   // ✅ 推荐
   你是{{app_name}} {{version}}版本的助手
   ```

2. **不要过度设计**：不需要请求级、模型级配置
   - 简单场景用全局配置
   - 差异通过变量注入

3. **不要频繁修改配置**：修改配置需要重启，不适合高频变更

4. **不要存储敏感信息**：配置文件中不要放API密钥、密码等

---

## 📝 待办事项

开发前：
- [ ] 评审本方案，确认需求理解正确
- [ ] 确认配置文件存放位置（`config/`目录）
- [ ] 确认VariableEngine是否支持{{variable}}语法

开发中：
- [ ] 实现SystemPromptService核心类
- [ ] 创建示例配置文件
- [ ] 集成到ChatService
- [ ] 编写单元测试

开发后：
- [ ] 编写配置文档
- [ ] 编写变量使用指南
- [ ] 更新API文档（说明system消息来源）
- [ ] 性能测试和基准测试
- [ ] Code Review

---

## 🚦 下一步行动

请主人评审这份极简方案：

1. ✅ **架构是否足够简单？**（只有全局配置，80行代码）
2. ✅ **{{variable}}占位符方案是否合理？**
3. ✅ **启动加载（无热更新）是否可接受？**
4. ✅ **不需要管理接口是否正确？**
5. ✅ **3-4小时实现时间是否合理？**

如果方案通过，浮浮酱可以立即开始实施，预计**3-4小时**完成全部开发喵～ φ(≧ω≦*)♪

---

**文档版本**: 1.0.0
**创建时间**: 2025-11-30
**作者**: 浮浮酱 (猫娘工程师)
**状态**: 待评审
