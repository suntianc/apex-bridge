# Skills沙箱执行配置规范

## 变更类型
`ADDED` + `MODIFIED`

## 变更范围
- 模块：`src/types/skills.ts`
- 模块：`src/core/skills/SkillsExecutionManager.ts`
- 模块：`src/core/skills/executors/SkillsDirectExecutor.ts`
- 新增：`src/core/skills/executors/SkillsDirectNodeExecutor.ts`

## 目标
为每个Skill添加沙箱执行配置，允许选择是否使用VM2沙箱执行，提升性能灵活性。

## ADDED Requirements

### REQ-SKILLS-001: SkillMetadata添加sandboxExecution字段
**Given** SkillMetadata类型定义
**When** 扩展类型
**Then** 添加 `sandboxExecution?: boolean` 字段
**And** 默认值为 `true`（使用沙箱）
**And** 字段可选，未配置时默认使用沙箱

**类型定义**:
```typescript
export interface SkillMetadata {
  // ... 现有字段
  sandboxExecution?: boolean; // 是否使用沙箱执行，默认true
}
```

#### Scenario: 类型定义扩展
```
Given SkillMetadata接口
When 添加sandboxExecution字段
Then 字段类型为boolean | undefined
And 默认值为true（使用沙箱）
```

### REQ-SKILLS-002: SkillsDirectExecutor根据配置选择执行方式
**Given** SkillsDirectExecutor执行Skill
**When** 检查Skill配置
**Then** 如果sandboxExecution=false，使用Node.js vm模块直接执行
**And** 如果sandboxExecution=true或未配置，使用VM2沙箱执行
**And** 记录执行方式日志和安全警告

#### Scenario: 沙箱执行（默认）
```
Given Skill配置 sandboxExecution: true（或未配置）
When SkillsDirectExecutor.executeSkill()
Then 使用VM2沙箱执行
And 返回结果
And 记录日志："Executing skill X with sandbox=true"
```

#### Scenario: 直接执行（非沙箱）
```
Given Skill配置 sandboxExecution: false
When SkillsDirectExecutor.executeSkill()
Then 使用Node.js vm模块直接执行
And 记录警告日志："技能 X 配置为不使用沙箱执行，直接执行代码（安全风险）"
And 返回结果
```

## MODIFIED Requirements

### REQ-SKILLS-003: SkillsDirectExecutor支持配置检查
**Given** SkillsDirectExecutor执行Skill
**When** 检查Skill配置
**Then** 根据sandboxExecution配置选择执行方式
**And** 如果sandboxExecution=true或未配置，使用沙箱执行
**And** 如果sandboxExecution=false，使用Node.js vm模块直接执行

#### Scenario: 执行方式选择
```
Given Skill配置 sandboxExecution: false
When SkillsDirectExecutor.executeSkill()
Then 检测到sandboxExecution=false
And 使用Node.js vm模块执行
And 添加安全警告到securityReport
```

