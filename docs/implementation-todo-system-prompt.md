# 系统提示词功能 - 详细实施Todo清单

> 基于：docs/proposal-system-prompt-ultra-simple.md
> 预计总时间：3-4小时
> 更新日期：2025-11-30

---

## 📋 任务清单总览

共25个任务，分为5个阶段

---

## 一、前置准备（5分钟）

### 【前置准备】确认设计文档并创建实施计划

**任务编号**: T-00
**预估时间**: 5分钟
**优先级**: P0（阻塞）

**具体内容**:
- [ ] 确认设计文档已评审通过
- [ ] 确认所有需求已明确
  - 只有全局配置 ✅
  - 无请求/会话级别 ✅
  - {{variable}}占位符方案 ✅
  - 启动加载（无热更新） ✅
  - 无管理接口 ✅
- [ ] 确认待办清单完整

**验证标准**:
- [ ] 设计文档状态：已评审通过
- [ ] 需求理解：100%一致
- [ ] 待办清单：覆盖所有实施步骤

**相关文件**:
- `docs/proposal-system-prompt-ultra-simple.md`

**注意事项**:
- 如果需求有变更，需要重新评审设计文档
- 所有后续任务依赖于本任务的确认

---

## 二、阶段1: 核心实现（2小时）

### 【阶段1-1】创建SystemPromptService.ts文件

**任务编号**: T-01
**预估时间**: 5分钟
**优先级**: P0（阻塞）

**具体内容**:
- [ ] 创建文件 `src/services/SystemPromptService.ts`
- [ ] 添加文件头注释（功能描述、作者、日期）
- [ ] 导入必要的模块（fs、path、VariableEngine、logger）

**验证标准**:
- [ ] 文件已创建
- [ ] 编译无语法错误
- [ ] 导入路径正确

**相关文件**:
- `src/services/SystemPromptService.ts` ⭐ 新建

**注意事项**:
- 确保导入的VariableEngine路径正确
- 确保导入的logger路径正确

---

### 【阶段1-2】实现SystemPromptConfig接口和SystemPromptService类

**任务编号**: T-02
**预估时间**: 20分钟
**优先级**: P0（阻塞）

**具体内容**:
- [ ] 定义接口 `SystemPromptConfig`
  - template: string
  - enabled: boolean
  - variables?: Record<string, any>
  - version?: string
- [ ] 定义类 `SystemPromptService`
  - 私有属性：configPath, config, variableEngine
  - 构造函数：参数configDir，默认值'./config'

**验证标准**:
- [ ] 接口定义完整，类型正确
- [ ] 类结构清晰
- [ ] 无TypeScript类型错误

**相关文件**:
- `src/services/SystemPromptService.ts` ⭐ 修改

**注意事项**:
- 确保接口字段与配置文件结构一致
- 确保构造函数完成VariableEngine初始化

---

### 【阶段1-3】实现配置文件加载逻辑

**任务编号**: T-03
**预估时间**: 15分钟
**优先级**: P0（阻塞）

**具体内容**:
- [ ] 实现 `loadConfig()` 私有方法
  - 检查文件是否存在
  - 读取文件内容
  - 解析JSON
  - 错误处理（文件不存在、JSON解析失败）
  - 日志输出（成功和失败）

**验证标准**:
- [ ] 文件存在时正确加载
- [ ] 文件不存在时返回默认配置
- [ ] JSON解析失败时有错误处理
- [ ] 关键操作有日志输出

**相关文件**:
- `src/services/SystemPromptService.ts` ⭐ 修改

**注意事项**:
- 默认配置：{ template: '', enabled: false }
- 使用fs.existsSync()检查文件
- 使用fs.readFileSync()读取文件
- 使用JSON.parse()解析（需try-catch）

---

### 【阶段1-4】实现模板渲染逻辑

**任务编号**: T-04
**预估时间**: 15分钟
**优先级**: P0（阻塞）

**具体内容**:
- [ ] 实现 `renderTemplate()` 私有方法
  - 参数：template（字符串），context（Record<string, any>）
  - 合并变量：config.variables + context
  - 调用VariableEngine.render()
  - 返回渲染后的字符串
  - 错误处理（渲染失败返回原模板）

**验证标准**:
- [ ] 变量合并正确（context覆盖config）
- [ ] 调用VariableEngine正确
- [ ] 错误处理完善

**相关文件**:
- `src/services/SystemPromptService.ts` ⭐ 修改

**注意事项**:
- 变量优先级：context优先于config.variables
- 确保VariableEngine初始化了缓存
- 渲染失败时返回原模板（不阻断流程）

---

### 【阶段1-5】注册默认变量处理器

**任务编号**: T-05
**预估时间**: 10分钟
**优先级**: P0（阻塞）

**具体内容**:
- [ ] 实现 `registerDefaultVariables()` 私有方法
  - 注册 `current_time`：返回new Date().toISOString()
  - 注册 `current_date`：返回new Date().toLocaleDateString('zh-CN')
- [ ] 在构造函数中调用此方法

**验证标准**:
- [ ] current_time变量正常替换
- [ ] current_date变量正常替换
- [ ] 输出格式正确

**相关文件**:
- `src/services/SystemPromptService.ts` ⭐ 修改

**注意事项**:
- 使用VariableEngine.registerProcessor()注册
- toLocaleDateString('zh-CN')会返回中文格式日期

---

### 【阶段1-6】实现getSystemPrompt核心方法

**任务编号**: T-06
**预估时间**: 10分钟
**优先级**: P0（阻塞）

**具体内容**:
- [ ] 实现 `getSystemPrompt()` 公共方法
  - 参数：context（Record<string, any> = {}）
  - 返回值：string | null
  - 检查config.enabled
  - 调用renderTemplate
  - 日志输出

**验证标准**:
- [ ] enabled为false时返回null
- [ ] enabled为true时返回渲染后的template
- [ ] 日志输出正确

**相关文件**:
- `src/services/SystemPromptService.ts` ⭐ 修改

**注意事项**:
- 该方法在ChatService中被调用
- 返回null表示不添加system消息

---

### 【阶段1-7】创建默认配置文件

**任务编号**: T-07
**预估时间**: 10分钟
**优先级**: P1

**具体内容**:
- [ ] 创建目录 `config/`（如果不存在）
- [ ] 创建文件 `config/system-prompt.json`
- [ ] 编写示例配置
  - 模板包含{{current_time}}
  - enabled: true
  - 示例variables

**验证标准**:
- [ ] 文件格式为UTF-8
- [ ] JSON格式正确
- [ ] 包含所有必需字段

**相关文件**:
- `config/system-prompt.json` ⭐ 新建

**注意事项**:
- 为中文环境，模板使用中文
- 提供有意义的默认值

**示例内容**:
```json
{
  "$schema": "./schema/system-prompt.schema.json",
  "version": "1.0.0",
  "template": "你是一个乐于助人的AI助手。\n\n当前时间: {{current_time}}",
  "enabled": true,
  "variables": {}
}
```

---

### 【阶段1-8】验证SystemPromptService独立编译

**任务编号**: T-08
**预估时间**: 15分钟
**优先级**: P0（阻塞）

**具体内容**:
- [ ] 运行 `npm run build` 或 `tsc --noEmit`
- [ ] 确保SystemPromptService.ts无编译错误
- [ ] 修复任何TypeScript类型错误

**验证标准**:
- [ ] TypeScript编译器无错误输出
- [ ] 无类型错误
- [ ] 无import路径错误

**相关文件**:
- `src/services/SystemPromptService.ts`

**注意事项**:
- 只编译单个文件或整个项目
- 确保所有依赖路径正确

---

## 三、阶段2: ChatService集成（1小时）

### 【阶段2-1】修改ChatService.ts - 添加SystemPromptService导入

**任务编号**: T-09
**预估时间**: 5分钟
**优先级**: P0（阻塞）

**具体内容**:
- [ ] 打开 `src/services/ChatService.ts`
- [ ] 添加导入：`import { SystemPromptService } from './SystemPromptService';`

**验证标准**:
- [ ] 导入无编译错误
- [ ] 路径正确（./SystemPromptService）

**相关文件**:
- `src/services/ChatService.ts` ⭐ 修改

**注意事项**:
- 确保导入路径是相对于当前文件

---

### 【阶段2-2】在ChatService构造函数中初始化SystemPromptService

**任务编号**: T-10
**预估时间**: 10分钟
**优先级**: P0（阻塞）

**具体内容**:
- [ ] 在ChatService类中添加私有属性：`private systemPromptService: SystemPromptService;`
- [ ] 在构造函数中初始化：`this.systemPromptService = new SystemPromptService(configService.getConfigDir());`

**验证标准**:
- [ ] 属性类型声明正确
- [ ] 初始化时configDir传入正确
- [ ] 无编译错误

**相关文件**:
- `src/services/ChatService.ts` ⭐ 修改

**注意事项**:
- 需要ConfigService提供getConfigDir()方法
- 确保这一步在构造函数的位置正确

---

### 【阶段2-3】修改processMessage方法 - 添加system消息检查

**任务编号**: T-11
**预估时间**: 10分钟
**优先级**: P0（阻塞）

**具体内容**:
- [ ] 在processMessage方法中找到处理messages的位置
- [ ] 添加检查：`const hasSystemMessage = messages.some(m => m.role === 'system');`

**验证标准**:
- [ ] 能正确识别已有的system消息
- [ ] 无编译错误

**相关文件**:
- `src/services/ChatService.ts` ⭐ 修改

**注意事项**:
- 确保Message接口有role属性
- 该检查避免重复添加system消息

---

### 【阶段2-4】实现system提示词逻辑

**任务编号**: T-12
**预估时间**: 20分钟
**优先级**: P0（阻塞）

**具体内容**:
- [ ] 在检查之后添加逻辑：
  ```typescript
  if (!hasSystemMessage) {
    const systemPrompt = this.systemPromptService.getSystemPrompt({
      model: options.model,
      provider: options.provider
    });

    if (systemPrompt) {
      messages = [
        {
          role: 'system',
          content: systemPrompt
        },
        ...messages
      ];
    }
  }
  ```

**验证标准**:
- [ ] 正确调用getSystemPrompt
- [ ] 正确判断返回值（null或非null）
- [ ] 正确修改messages数组
- [ ] 新system消息在数组开头

**相关文件**:
- `src/services/ChatService.ts` ⭐ 修改

**注意事项**:
- 确保getSystemPrompt调用时传入必要的context
- 只在hasSystemMessage为false时处理

---

### 【阶段2-5】添加关键日志输出

**任务编号**: T-13
**预估时间**: 10分钟
**优先级**: P1

**具体内容**:
- [ ] 添加SystemPromptService加载日志
- [ ] 添加system提示词应用日志：长度和内容摘要
- [ ] 添加禁用日志（如果config.enabled为false）

**验证标准**:
- [ ] 启动时输出：[SystemPromptService] Config loaded
- [ ] 应用时输出：[ChatService] Applied system prompt (X chars)
- [ ] 日志级别合适（info或debug）

**相关文件**:
- `src/services/SystemPromptService.ts`
- `src/services/ChatService.ts`

**注意事项**:
- 使用logger.info或logger.debug
- 日志内容要简洁明了

**示例日志**:
```
[SystemPromptService] Config loaded (version: 1.0.0)
[ChatService] Applied system prompt (45 chars)
```

---

### 【阶段2-6】验证ChatService集成编译

**任务编号**: T-14
**预估时间**: 15分钟
**优先级**: P0（阻塞）

**具体内容**:
- [ ] 运行 `npm run build` 或 `tsc --noEmit`
- [ ] 修复任何TypeScript错误
- [ ] 验证无编译警告

**验证标准**:
- [ ] TypeScript编译器无错误输出
- [ ] ChatService.ts无类型错误
- [ ] 所有import路径正确

**相关文件**:
- `src/services/ChatService.ts`
- `src/services/SystemPromptService.ts`

**注意事项**:
- 确保所有依赖已安装
- 修复所有类型错误

---

## 四、阶段3: 测试和优化（1小时）

### 【阶段3-1】功能测试 - 启用/禁用配置测试

**任务编号**: T-15
**预估时间**: 10分钟
**优先级**: P0（阻塞）

**具体内容**:
- [ ] 测试场景1：enabled为true时，system消息正常添加
- [ ] 测试场景2：enabled为false时，system消息不添加
- [ ] 验证日志输出正确

**验证标准**:
- [ ] enabled为true时，LLM请求包含system消息
- [ ] enabled为false时，LLM请求不包含system消息
- [ ] 日志输出与预期一致

**测试方法**:
```bash
# 1. 修改config/system-prompt.json，设置enabled为true
# 2. 重启服务
# 3. 发送测试请求
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"hi"}]}'
# 4. 查看日志确认

# 5. 修改enabled为false，重复测试
```

**相关文件**:
- `config/system-prompt.json`

**注意事项**:
- 每次修改配置后需要重启服务（无热更新）
- 使用简短的消息测试，便于查看日志

---

### 【阶段3-2】功能测试 - 内置变量替换测试

**任务编号**: T-16
**预估时间**: 10分钟
**优先级**: P0（阻塞）

**具体内容**:
- [ ] 测试 `{{current_time}}` 变量是否正确替换为ISO时间
- [ ] 测试 `{{current_date}}` 变量是否正确替换为本地日期

**验证标准**:
- [ ] current_time输出格式：2025-11-30T12:00:00.000Z
- [ ] current_date输出格式：2025/11/30（或中文格式）
- [ ] 每请求的变量值不同（时间变化）

**测试方法**:
```bash
# config/system-prompt.json
{
  "template": "当前时间: {{current_time}}\n当前日期: {{current_date}}",
  "enabled": true
}

# 重启后发送请求，查看LLM收到的实际system消息
```

**相关文件**:
- `config/system-prompt.json`

**注意事项**:
- 确保VariableEngine缓存不会影响时间更新（缓存60秒）
- 如果需要实时时间，确保cacheTTL足够短

---

### 【阶段3-3】功能测试 - 自定义变量替换测试

**任务编号**: T-17
**预估时间**: 15分钟
**优先级**: P1

**具体内容**:
- [ ] 测试配置文件中的variables字段是否正确注入
- [ ] 测试context参数是否覆盖config.variables
- [ ] 测试多变量同时替换

**验证标准**:
- [ ] variables字段的变量被正确替换
- [ ] context参数覆盖variables字段值
- [ ] 多变量同时替换正确

**测试方法**:
```bash
# config/system-prompt.json
{
  "template": "角色: {{role}}\n领域: {{domain}}",
  "enabled": true,
  "variables": {
    "role": "助手",
    "domain": "通用"
  }
}

# 查看输出：角色: 助手，领域: 通用

# 修改ChatService调用，添加context
systemPromptService.getSystemPrompt({
  model: 'deepseek-chat',
  role: '专家',
  domain: '编程'
});

# 查看输出：角色: 专家，领域: 编程
```

**相关文件**:
- `config/system-prompt.json`
- `src/services/ChatService.ts`

**注意事项**:
- 确保变量名在template中使用{{variable}}格式
- context中的变量优先级高于config.variables

---

### 【阶段3-4】功能测试 - 完整聊天请求流程测试

**任务编号**: T-18
**预估时间**: 15分钟
**优先级**: P0（阻塞）

**具体内容**:
- [ ] 测试完整聊天请求，system消息正确添加到messages开头
- [ ] 测试已有system消息的messages，不再添加第二个system消息
- [ ] 测试多轮对话，每轮都包含system消息

**验证标准**:
- [ ] system消息在messages数组的第一个位置
- [ ] messages中最多只有一个system消息
- [ ] LLM收到的消息格式正确

**测试方法**:
```bash
# 场景1: messages中没有system消息
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "messages": [
      {"role": "user", "content": "hi"}
    ]
  }'

# 查看日志：应该添加system消息

# 场景2: messages中已有system消息
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "messages": [
      {"role": "system", "content": "You are a test assistant"},
      {"role": "user", "content": "hi"}
    ]
  }'

# 查看日志：不应添加第二个system消息
```

**相关文件**:
- `src/services/ChatService.ts`

**注意事项**:
- hasSystemMessage检查必须正确工作
- 确保system消息内容正确渲染

---

### 【阶段3-5】性能测试 - 模板渲染性能基准测试

**任务编号**: T-19
**预估时间**: 10分钟
**优先级**: P2

**具体内容**:
- [ ] 测试模板渲染耗时（使用performance.now()或console.time）
- [ ] 测试简单模板（无变量）的渲染性能
- [ ] 测试复杂模板（多变量）的渲染性能

**验证标准**:
- [ ] 简单模板渲染 < 1ms
- [ ] 复杂模板渲染 < 5ms
- [ ] 符合性能要求

**测试代码**:
```typescript
// 在SystemPromptService中添加测试代码（完成后删除）
const start = performance.now();
const result = this.renderTemplate(template, context);
const end = performance.now();
console.log(`Render time: ${end - start}ms`);
```

**相关文件**:
- `src/services/SystemPromptService.ts`

**注意事项**:
- 性能测试代码不提交到git
- 记录测试数据以便对比

---

### 【阶段3-6】性能测试 - 完整请求延迟对比

**任务编号**: T-20
**预估时间**: 10分钟
**优先级**: P2

**具体内容**:
- [ ] 测试启用system提示词时的完整请求延迟
- [ ] 测试禁用system提示词时的完整请求延迟
- [ ] 对比添加system提示词对总延迟的影响

**验证标准**:
- [ ] 添加system提示词延迟 < 5ms
- [ ] 对总延迟影响 < 5%
- [ ] 性能可接受

**测试方法**:
```bash
# 启用system提示词
curl -w "@curl-format.txt" -X POST http://localhost:8088/v1/chat/completions \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"hi"}]}'

# 记录总耗时

# 禁用system提示词（修改config），重复测试

# 对比两次测试结果
```

**相关文件**:
- 无需修改代码

**注意事项**:
- 多次测试取平均值
- 排除网络波动影响

---

### 【阶段3-7】更新README.md - 添加系统提示词功能说明

**任务编号**: T-21
**预估时间**: 10分钟
**优先级**: P1

**具体内容**:
- [ ] 在README.md中添加系统提示词功能说明
- [ ] 说明配置文件位置
- [ ] 说明变量使用方式
- [ ] 说明启用/禁用方法

**验证标准**:
- [ ] README内容完整、清晰
- [ ] 包含配置示例
- [ ] 说明修改配置后需要重启

**相关文件**:
- `README.md` ⭐ 修改

**注意事项**:
- 保持README简洁
- 指向详细文档（后续创建）

**示例内容**:
```markdown
## 系统提示词配置

本项目支持通过配置文件设置默认系统提示词。

配置文件：`config/system-prompt.json`

示例：
```json
{
  "template": "你是{{role}}助手\n当前时间: {{current_time}}",
  "enabled": true,
  "variables": { "role": "AI" }
}
```

支持 `{{variable}}` 占位符语法，内置变量包括：`current_time`, `current_date`。

修改配置后需要重启服务生效。
```

---

### 【阶段3-8】创建配置文档 - docs/system-prompt-config.md

**任务编号**: T-22
**预估时间**: 20分钟
**优先级**: P1

**具体内容**:
- [ ] 创建文档 `docs/system-prompt-config.md`
- [ ] 说明配置文件格式
- [ ] 说明各个字段含义
- [ ] 提供示例配置
- [ ] 说明修改后重启的要求

**验证标准**:
- [ ] 文档结构清晰
- [ ] 示例代码正确
- [ ] 说明完整

**相关文件**:
- `docs/system-prompt-config.md` ⭐ 新建

**文档结构**:
```markdown
# 系统提示词配置文档

## 配置文件位置

## 配置格式

## 字段说明

- template
- enabled
- variables

## 示例配置

## 修改配置

## 注意事项
```

---

### 【阶段3-9】创建变量指南 - docs/system-prompt-variables.md

**任务编号**: T-23
**预估时间**: 20分钟
**优先级**: P1

**具体内容**:
- [ ] 创建文档 `docs/system-prompt-variables.md`
- [ ] 列出所有内置变量及说明
- [ ] 说明自定义变量使用方法
- [ ] 提供示例

**验证标准**:
- [ ] 内置变量列表完整
- [ ] 自定义变量说明清晰
- [ ] 示例正确

**相关文件**:
- `docs/system-prompt-variables.md` ⭐ 新建

**文档内容**:
```markdown
# 系统提示词变量使用指南

## 内置变量

### {{current_time}}
类型：ISO时间字符串
示例：2025-11-30T12:00:00.000Z

### {{current_date}}
类型：本地日期字符串
示例：2025/11/30

## 自定义变量

## 变量优先级

## 示例

### 示例1：基础使用

### 示例2：覆盖默认值
```

---

### 【阶段3-10】创建配置示例 - config/system-prompt.example.json

**任务编号**: T-24
**预估时间**: 10分钟
**优先级**: P1

**具体内容**:
- [ ] 创建示例配置文件
- [ ] 包含多个示例场景（通用、技术、多语言）
- [ ] 添加注释说明

**验证标准**:
- [ ] JSON格式正确
- [ ] 包含多个示例
- [ ] 有清晰的注释

**相关文件**:
- `config/system-prompt.example.json` ⭐ 新建

**示例内容**:
```json
{
  "_comment": "系统提示词配置示例文件",
  "examples": {
    "通用助手": {
      "template": "你是一个乐于助人的AI助手。\n当前时间: {{current_time}}",
      "enabled": true
    },
    "技术专家": {
      "template": "你是{{role}}，专注于{{domain}}。\n时间: {{current_time}}",
      "enabled": true,
      "variables": {
        "role": "技术专家",
        "domain": "编程"
      }
    }
  }
}
```

---

## 五、收尾工作（20分钟）

### 【收尾工作】Code Review准备

**任务编号**: T-25
**预估时间**: 10分钟
**优先级**: P1

**具体内容**:
- [ ] 检查代码规范（命名、格式）
- [ ] 检查代码注释（关键方法有注释）
- [ ] 检查日志输出（日志级别合适）
- [ ] 检查错误处理（try-catch完善）
- [ ] 运行 `npm run lint`（如果有lint命令）

**验证标准**:
- [ ] 代码符合项目规范
- [ ] 注释清晰
- [ ] 无lint错误

**相关文件**:
- `src/services/SystemPromptService.ts`
- `src/services/ChatService.ts`

**注意事项**:
- 使用统一代码风格
- 关键方法必须有注释
- 日志级别要合适（错误用error，关键操作用info，调试用debug）

---

### 【收尾工作】提交代码

**任务编号**: T-26
**预估时间**: 10分钟
**优先级**: P1

**具体内容**:
- [ ] 使用 `git add` 添加所有修改
- [ ] 编写commit message
- [ ] 使用 `git commit` 提交
- [ ] 推送到远程分支（如果需要）

**验证标准**:
- [ ] 所有新文件已添加
- [ ] commit message清晰
- [ ] 提交成功无错误

**注意事项**:

**Commit Message格式**:
```
feat: 添加默认系统提示词功能

- 添加SystemPromptService服务类（80行）
- 支持{{variable}}占位符变量注入
- 集成到ChatService，自动添加system消息
- 创建示例配置文件
- 包含完整文档

实现基于：docs/proposal-system-prompt-ultra-simple.md
```

---

## 📊 任务统计

| 阶段 | 任务数 | 预估时间 | 优先级 | 状态 |
|------|--------|----------|--------|------|
| 前置准备 | 1 | 5分钟 | P0 | ⬜ |
| 阶段1 - 核心实现 | 8 | 2小时 | P0 | ⬜ |
| 阶段2 - ChatService集成 | 6 | 1小时 | P0 | ⬜ |
| 阶段3 - 测试优化 | 10 | 1小时 | P0/P1 | ⬜ |
| 收尾工作 | 2 | 20分钟 | P1 | ⬜ |
| **总计** | **27** | **3-4小时** | - | ⬜ |

---

## 🎯 关键成功标准

### 功能要求
- [ ] 配置文件加载成功
- [ ] 模板渲染正确（变量替换）
- [ ] system消息添加到messages开头
- [ ] 已有的system消息不重复添加
- [ ] enabled为false时不添加

### 性能要求
- [ ] 模板渲染 < 5ms
- [ ] 对请求总延迟影响 < 5%

### 质量要求
- [ ] 无TypeScript编译错误
- [ ] 无lint错误
- [ ] 代码注释完整
- [ ] 文档完整

### 文档要求
- [ ] README更新
- [ ] 配置文档创建
- [ ] 变量指南创建
- [ ] 配置示例创建

---

## 🚨 风险与应对

### 风险1: ConfigService.getConfigDir()不存在
**应对**: 直接使用'./config'作为默认值

### 风险2: VariableEngine不支持{{variable}}语法
**应对**: 快速验证VariableEngine文档，必要时修改实现

### 风险3: 类型错误（ChatOptions接口不匹配）
**应对**: 检查ChatOptions定义，必要时添加systemPrompt字段

### 风险4: 性能不达标
**应对**: 优化VariableEngine缓存，减少不必要的渲染

---

## 📋 Checklist（实施前）

- [ ] 已确认设计文档评审通过
- [ ] 已备份现有代码（git commit）
- [ ] 已确认所有依赖已安装
- [ ] 已确认有足够时间（3-4小时）
- [ ] 已准备好测试环境

---

## 📋 Checklist（实施后）

- [ ] 所有任务已完成
- [ ] 代码已提交
- [ ] 文档已更新
- [ ] Code Review已完成（如果需要）
- [ ] 功能已验证
- [ ] 性能已测试

---

**文档版本**: 1.0.0
**创建时间**: 2025-11-30
**创建者**: 浮浮酱 (猫娘工程师)
**状态**: 待实施
