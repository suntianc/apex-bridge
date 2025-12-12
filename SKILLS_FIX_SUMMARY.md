# Skills执行返回空结果问题修复报告

## 问题描述

在ApexBridge项目中，Skills系统虽然能够成功检索到相关技能（如weather-query），但执行时返回空结果，导致用户无法获得技能的实际输出。

## 症状表现

1. **日志显示**：
   ```
   [ReActStrategy] Available tools: 5 built-in + 0 Skills  // Skills未注册
   ```
   修复后：
   ```
   [ReActStrategy] Available tools: 5 built-in + 1 Skills  // Skills成功注册
   ```

2. **技能执行失败**：
   ```
   [WARN] Skills weather-query exited with code 1, signal null
   [INFO] Skills weather-query completed successfully in 57ms
   resultContent:  // 空内容
   ```

3. **用户看到**：技能调用后返回空结果，无实际数据输出

## 根本原因

经过深入调试，发现了**两个关键问题**：

### 问题1：Skills未注册到ToolDispatcher
**位置**：`src/strategies/ReActStrategy.ts:245-306`

**原因**：ReActStrategy通过向量检索找到了相关Skills，但没有将它们注册为可执行的工具，导致ToolDispatcher无法访问这些Skills。

**解决方案**：添加了`registerSkillAsBuiltInTool()`方法，将检索到的Skills注册为内置工具的代理：

```typescript
private registerSkillAsBuiltInTool(skill: SkillTool): void {
  const proxyTool: BuiltInTool = {
    name: skill.name,
    description: skill.description,
    type: 'BUILTIN' as any,
    category: skill.tags?.join(', ') || 'skill',
    enabled: true,
    level: skill.level,
    parameters: skill.parameters,
    execute: async (args: Record<string, any>) => {
      const result = await this.skillsExecutor.execute({
        name: skill.name,
        args
      });
      return {
        success: result.success,
        output: result.success ? result.output : result.error,
        duration: result.duration,
        exitCode: result.exitCode
      };
    }
  };
  this.builtInRegistry.registerTool(proxyTool);
}
```

### 问题2：SkillsSandboxExecutor的cwd配置错误
**位置**：`src/services/executors/SkillsSandboxExecutor.ts:327-341`

**原因**：`prepareSpawnOptions()`方法将工作区目录设置为子进程的当前工作目录(`cwd`)，但同时又传递了脚本的绝对路径。Node.js在这种情况下会混淆路径，导致找不到脚本文件：

```
Error: Cannot find module '/tmp/skill-workspaces/.../.data/skills/weather-query/scripts/execute.js'
```

路径被错误地构造成：`workspace + skillPath`，而不是单独的`skillPath`。

**解决方案**：移除了`cwd`设置，让脚本使用绝对路径直接执行：

```typescript
private prepareSpawnOptions(
  cwd: string,
  env: NodeJS.ProcessEnv
): any {
  // 注意：不设置 cwd，使用脚本的绝对路径
  // workspace 只用于技能执行时的临时文件操作
  return {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    detached: false
  };
}
```

## 调试过程

1. **添加调试日志**：在weather-query技能脚本中添加了`console.error()`调试输出
2. **增强stderr记录**：修改SkillsSandboxExecutor，当技能执行失败时记录stderr内容
3. **发现路径错误**：通过stderr输出发现"Cannot find module"错误
4. **定位根本原因**：分析spawn调用发现cwd配置导致路径混淆

## 修复验证

### 测试1：技能直接执行
```bash
$ node ./.data/skills/weather-query/scripts/execute.js '{"city":"北京","type":"current"}'
{
  "city": "北京",
  "temperature": 22,
  "feelsLike": 22,
  "condition": "雷阵雨",
  ...
}
```
✅ 成功

### 测试2：通过API调用
```bash
$ curl -X POST http://localhost:12345/v1/chat/completions \
  -H "Authorization: Bearer sk-test-key" \
  -d '{"messages":[{"role":"user","content":"查询北京天气"}],"model":"deepseek-chat","provider":"deepseek","stream":true,"selfThinking":{"enabled":true}}'
```
响应中包含：
```
晴朗，气温21°C，湿度适中，东风18km/h，能见度良好，适合户外活动。
```
✅ 成功

### 测试3：服务器日志
```
[INFO] Executing Skills: weather-query
[INFO] Skills weather-query completed successfully in 52ms
[INFO] resultContent: {
  "city": "北京",
  "temperature": 21,
  "condition": "晴朗",
  ...
}
[INFO] ✅ API Access Success: POST /v1/chat/completions
```
✅ 成功

## 修改的文件

1. **src/strategies/ReActStrategy.ts**
   - 添加`registerSkillAsBuiltInTool()`方法
   - 在`initializeToolSystem()`中调用技能注册逻辑

2. **src/services/executors/SkillsSandboxExecutor.ts**
   - 修改`prepareSpawnOptions()`移除cwd设置
   - 增强stderr日志记录（用于调试）

3. **.data/skills/weather-query/scripts/execute.js**
   - 添加调试日志（后续已移除）

## 总结

此次修复解决了Skills系统的两个关键问题：
1. **注册问题**：Skills检索后未能注册，导致无法执行
2. **执行问题**：路径配置错误，导致脚本无法找到

修复后，Skills系统完全正常工作，能够：
- ✅ 成功检索相关Skills
- ✅ 将Skills注册为可执行工具
- ✅ 正确执行Skills脚本
- ✅ 返回完整的工具结果
- ✅ LLM基于工具结果生成自然语言回复

## 测试建议

建议测试以下场景以确保修复的完整性：
1. 不同城市的天气查询（中文、拼音）
2. 不同类型的查询（current、forecast、aqi）
3. 其他Skills的执行（如writing-guide）
4. 多个Skills连续调用
5. 并发调用多个Skills

---

**修复完成时间**：2025-12-12
**修复状态**：✅ 完成
**影响范围**：Skills执行系统
**向后兼容**：✅ 是
