# Skills 体系精简规范

## 变更类型
`MODIFIED`

## 变更范围
- 目录：`src/core/skills/`
- 模块：30+ 模块 → 10 个核心模块
- 影响：Skills 加载、执行、监控、预加载等相关功能

## 目标
精简 Skills 体系，从 30+ 模块减少到 10 个核心模块，专注核心执行能力，移除监控、预加载、性能优化等非必需模块。

## REMOVED Requirements

### 移除模块 1：生产监控服务

**模块：** `ProductionMonitorService.ts`

**Given** Skills 正在执行
**When** 代码生成或脚本执行
**Then** 不再记录生产指标（调用次数、错误率、延迟等）

**影响：** 失去生产环境 Skills 使用统计
**缓解：** 使用基础 Node.js 监控工具替代（如 PM2、Datadog）

### 移除模块 2：性能指标收集

**模块：** `SkillsMetricsCollector.ts`

**Given** Skills 执行完成
**When** 需要性能分析
**Then** 不再收集详细指标（内存使用、CPU 占用、执行时间）

**影响：** 失去细粒度性能数据
**缓解：** 依赖 Node.js 内置性能监控（Performance API）

### 移除模块 3：性能优化器

**模块：** `PerformanceOptimizer.ts`（依赖 MetricsCollector）

**Given** Skills 重复执行
**When** 识别性能瓶颈
**Then** 不再自动优化（预编译、缓存调整等）

**影响：** 首次执行性能可能下降
**缓解：** 部署时预热常用 Skills

### 移除模块 4：内存监控

**模块：** `MemoryMonitor.ts`

**Given** Skills 执行期间
**When** 内存使用增长
**Then** 不再实时监控内存使用

**影响：** 内存泄漏风险增加
**缓解：** 设置 Node.js --max-old-space-size 限制，定期重启进程

### 移除模块 5：预加载管理

**模块：**
- `PreloadManager.ts`
- `PreloadStrategy.ts`
- `ResourceLoader.ts`

**Given** 系统启动
**When** 初始化 Skills
**Then** 不再预加载 Skills（按需加载）

**影响：** 首次调用 Skills 延迟增加（需要编译）
**缓解：**
- 部署时预热常用 Skills
- 使用 SkillsCache 缓存编译结果
- 保持进程持久化（不频繁重启）

### 移除模块 6：内存管理器

**模块：**
- `MemoryManager.ts`
- `MemoryCleaner.ts`

**Given** Skills 缓存占满
**When** 需要释放内存
**Then** 不再自动清理缓存

**影响：** 内存持续增长
**缓解：**
- 依赖 Node.js GC
- 手动重启进程（部署时）
- 使用更小的缓存限制

### 移除模块 7：分布式执行器

**模块：** `executors/SkillsDistributedExecutor.ts`

**Given** Skills 需要远程执行
**When** 执行器选择
**Then** 不再有分布式执行选项

**影响：** 所有 Skills 必须在本地执行
**缓解：**
- 确保本地资源充足
- 如果需要分布式，通过 HTTP API 调用远程服务

### 移除模块 8：服务执行器（可选）

**模块：** `executors/SkillsServiceExecutor.ts`

**模块说明：** 用于调用外部服务执行 Skills

**Given** Skill 配置为 service 执行类型
**When** SkillsExecutionManager 调度
**Then** 不再支持 service 执行类型（或需要评估是否保留）

**影响：** 无法调用外部服务执行 Skills
**缓解：**
- 如果保留，需确保无外部依赖
- 如果移除，所有 Skills 必须本地可执行（direct/internal）

### 移除模块 9：静态执行器

**模块：** `executors/SkillsStaticExecutor.ts`

**Given** Skill 引用静态资源
**When** 执行器调度
**Then** 不再支持 static 执行类型

**影响：** 无法直接加载静态资源为 Skills
**缓解：** 静态资源可通过直接执行器（direct）读取

### 移除模块 10：预处理执行器

**模块：** `executors/SkillsPreprocessorExecutor.ts`

**Given** Skill 需要预处理输入
**When** 执行器调度
**Then** 不再支持 preprocessor 执行类型

**影响：** 失去输入预处理能力
**缓解：** 在 SkillsDirectExecutor 中内联预处理逻辑

### 移除模块 11+：其他优化模块

**模块列表：**
- `SkillsIndexOptimizer.ts`
- `LoadingConcurrencyController.ts`
- `CodeGenerationProfiler.ts`
- `DependencyManager.ts`
- `InstructionLoader.ts`（可合并到 SkillsLoader）
- `ProductionMonitor.ts`（与 ProductionMonitorService 重复）
- `ErrorHandler.ts`（可合并到 SkillsExecutionManager）

**总移除模块：** ~20 个模块

**总减少代码：** ~4000 行

## MODIFIED Requirements

### 修改能力 1：核心保留模块（10个）

#### 保留模块 1：SkillsExecutionManager

**路径：** `skills/SkillsExecutionManager.ts`

**Given** Skills 执行请求
**When** 调用 execute()
**Then** 应正常工作（不依赖被移除的模块）

**修改点：**
- 移除对 ProductionMonitorService 的依赖
- 移除对 MetricsCollector 的依赖
- 移除对 PerformanceOptimizer 的依赖

#### 保留模块 2-6：核心映射与索引

**模块列表：**
- `SkillsToToolMapper.ts`（工具映射）
- `SkillsIndex.ts`（能力索引）
- `SkillsLoader.ts`（能力加载）
- `ABPSkillsAdapter.ts`（ABP 协议适配）
- `CodeGenerator.ts`（代码生成）

**Given** Skills 系统运行
**When** 执行管理、加载、映射操作
**Then** 所有核心功能正常工作

**验证点：**
- Skills 发现正常
- Skills 到工具映射正常
- ABP 协议集成正常
- 代码生成正常

#### 保留模块 7-8：执行器

**模块列表：**
- `executors/SkillsDirectExecutor.ts`（直接执行）
- `executors/SkillsInternalExecutor.ts`（内部执行）

**Given** Skills 执行请求
**When** SkillsExecutionManager 调度
**Then** Direct 和 Internal 执行器正常工作

**执行器类型说明：**
- **direct**：执行本地 JavaScript/TypeScript 代码（最常见）
- **internal**：调用内部系统能力（如文件操作、系统命令）

#### 保留模块 9-10：安全与缓存

**模块列表：**
- `SecurityValidator.ts`（安全验证）
- `SkillsCache.ts` 或 `CodeCache.ts`（缓存）

**Given** Skills 代码生成
**When** 执行脚本
**Then** SecurityValidator 验证代码安全性

**Given** Skills 编译完成
**When** 重复执行相同 Skills
**Then** SkillsCache/CodeCache 返回缓存结果

## 技术方案

### 目录结构变更

**精简前（30+ 模块）：**
```
src/core/skills/
├── SkillsExecutionManager.ts          // ⭐ 保留
├── SkillsToToolMapper.ts              // ⭐ 保留
├── SkillsIndex.ts                     // ⭐ 保留
├── SkillsLoader.ts                    // ⭐ 保留
├── ABPSkillsAdapter.ts                // ⭐ 保留
├── CodeGenerator.ts                   // ⭐ 保留
├── SecurityValidator.ts               // ⭐ 保留
├── SandboxEnvironment.ts              // ⭐ 保留
├── SkillsCache.ts                     // ⭐ 保留
├── CodeCache.ts                       // ⭐ 保留
├── SkillsMetricsCollector.ts          // 🗑️ 移除
├── PerformanceOptimizer.ts            // 🗑️ 移除
├── ProductionMonitorService.ts        // 🗑️ 移除
├── MemoryMonitor.ts                   // 🗑️ 移除
├── MemoryManager.ts                   // 🗑️ 移除
├── MemoryCleaner.ts                   // 🗑️ 移除
├── PreloadManager.ts                  // 🗑️ 移除
├── PreloadStrategy.ts                 // 🗑️ 移除
├── ResourceLoader.ts                  // 🗑️ 移除
├── SkillsIndexOptimizer.ts            // 🗑️ 移除
├── LoadingConcurrencyController.ts    // 🗑️ 移除
├── CodeGenerationProfiler.ts          // 🗑️ 移除
├── DependencyManager.ts               // 🗑️ 移除
├── ... (其他 10+ 模块)
└── executors/
    ├── BaseSkillsExecutor.ts          // ⭐ 保留
    ├── SkillsDirectExecutor.ts        // ⭐ 保留
    ├── SkillsInternalExecutor.ts      // ⭐ 保留
    ├── SkillsDistributedExecutor.ts   // 🗑️ 移除
    ├── SkillsServiceExecutor.ts       // ⚠️ 可选保留
    ├── SkillsStaticExecutor.ts        // 🗑️ 移除
    ├── SkillsPreprocessorExecutor.ts  // 🗑️ 移除
    └── ...
```

**精简后（10个核心模块）：**
```
src/core/skills/
├── SkillsExecutionManager.ts          // ⭐ 核心执行管理
├── SkillsToToolMapper.ts              // ⭐ 工具映射
├── SkillsIndex.ts                     // ⭐ 能力索引
├── SkillsLoader.ts                    // ⭐ 能力加载
├── ABPSkillsAdapter.ts                // ⭐ ABP 协议适配
├── CodeGenerator.ts                   // ⭐ 代码生成
├── SecurityValidator.ts               // ⭐ 安全验证
├── SandboxEnvironment.ts              // ⭐ 沙箱环境
├── SkillsCache.ts                     // ⭐ 编译缓存
├── CodeCache.ts                       // ⭐ 脚本缓存
└── executors/
    ├── BaseSkillsExecutor.ts          // ⭐ 基类
    ├── SkillsDirectExecutor.ts        // ⭐ 直接执行
    ├── SkillsInternalExecutor.ts      // ⭐ 内部执行
    └── index.ts                       // 导出
```

### 模块依赖清理

**SkillsExecutionManager 修改：**

```typescript
// 精简前
delete import { ProductionMonitorService } from './ProductionMonitorService';
delete import { SkillsMetricsCollector } from './SkillsMetricsCollector';
delete import { PerformanceOptimizer } from './PerformanceOptimizer';

// 精简后（仅保留核心）
import { SkillsIndex } from './SkillsIndex';
import { SkillsToToolMapper } from './SkillsToToolMapper';
import { CodeGenerator } from './CodeGenerator';
import { SandboxEnvironment } from './SandboxEnvironment';
import { SecurityValidator } from './SecurityValidator';
import { SkillsCache } from './SkillsCache';
import { CodeCache } from './CodeCache';
```

### 执行器索引精简

```typescript
// src/core/skills/executors/index.ts

// 精简前
export * from './BaseSkillsExecutor';
export * from './SkillsDirectExecutor';
export * from './SkillsInternalExecutor';
export * from './SkillsDistributedExecutor';  // 🗑️ 移除
export * from './SkillsServiceExecutor';       // ⚠️ 可选
export * from './SkillsStaticExecutor';        // 🗑️ 移除
export * from './SkillsPreprocessorExecutor';  // 🗑️ 移除

// 精简后
export * from './BaseSkillsExecutor';
export * from './SkillsDirectExecutor';
export * from './SkillsInternalExecutor';
```

## ADDED Requirements

### 新增能力：部署时预热

**Given** 移除了 PreloadManager（运行时预热）
**When** 系统部署
**Then** 应提供预热脚本

**预热脚本示例：**
```bash
#!/bin/bash
# scripts/warmup-skills.sh

echo "Warming up Skills..."
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "messages": [{"role": "user", "content": "test"}],
    "skills": ["builtin:calculator", "builtin:web-search"]
  }'
```

## 兼容性要求

### 场景：Skills 执行不受影响

**Given** 精简到 10 个核心模块
**When** 执行内置 Skills（calculator、web-search 等）
**Then** 预期行为保持不变

**Given** 自定义 Skills
**When** 执行各种执行类型
**Then** direct 和 internal 类型正常工作（distributed、service、static、preprocessor 类型不再支持）

## 测试策略

### 单元测试

1. **核心模块测试**
   - SkillsExecutionManager.execute() 正常工作
   - SkillsToToolMapper.mapToolToSkill() 正确映射
   - SkillsIndex.getAllMetadata() 返回正确数据

2. **执行器测试**
   - SkillsDirectExecutor 执行 JavaScript 代码
   - SkillsInternalExecutor 调用内部能力

### 集成测试

1. **完整 Skills 流程**
   - 加载 → 映射 → 生成代码 → 验证 → 执行 → 返回结果

2. **安全测试**
   - SecurityValidator 拦截危险代码（eval、fs.readFile 等）
   - SandboxEnvironment 限制资源访问

3. **缓存测试**
   - SkillsCache 命中时返回缓存（不重新编译）
   - CodeCache 命中时返回缓存（不重新执行）

## 性能影响

### 启动性能

- **提升**：减少 20+ 模块加载，启动时间减少 ~1-2 秒
- **降低**：首次执行 Skills 需要编译（无预热）

### 运行时性能

- **降低**：失去 PerformanceOptimizer 自动优化
- **降低**：失去预加载，首次调用延迟增加（~100-500ms）

### 缓解措施

1. **部署预热**：部署时调用常用 Skills，填充缓存
2. **进程持久化**：保持 Node.js 进程运行（不频繁重启）
3. **合理缓存**：使用 SkillsCache/CodeCache 缓存编译结果

## 相关任务

- [ ] 审查所有 30+ Skills 模块，确定保留清单
- [ ] 删除 ProductionMonitorService.ts
- [ ] 删除 SkillsMetricsCollector.ts
- [ ] 删除 PerformanceOptimizer.ts
- [ ] 删除 MemoryMonitor.ts
- [ ] 删除 PreloadManager.ts、PreloadStrategy.ts、ResourceLoader.ts
- [ ] 删除 MemoryManager.ts、MemoryCleaner.ts
- [ ] 删除 SkillsDistributedExecutor.ts
- [ ] 删除 SkillsStaticExecutor.ts
- [ ] 删除 SkillsPreprocessorExecutor.ts
- [ ] 更新 SkillsExecutionManager，移除依赖
- [ ] 更新执行器索引文件
- [ ] 修改所有 import 语句
- [ ] 编写部署预热脚本
- [ ] 测试核心 Skills 执行
- [ ] 验证安全验证工作
- [ ] 验证缓存功能
- [ ] 性能基准测试（首次调用 vs 缓存调用）
