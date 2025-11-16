# Skills系统生产环境监控指南

**创建日期**: 2025-11-14

## 概述

生产环境监控系统提供实时监控、健康检查、告警和性能指标收集功能，确保Skills系统在生产环境中的稳定运行。

## 功能特性

### 1. 实时监控指标

- **执行指标**: 成功率、错误率、平均执行时间、Token使用量
- **内存指标**: 堆内存使用、RSS、外部内存、内存压力等级
- **缓存指标**: 元数据/内容/资源缓存命中率
- **系统指标**: 运行时间、CPU使用率（如果可用）

### 2. 健康检查

- **执行健康**: 检查执行错误率和执行时间
- **内存健康**: 检查内存使用率和压力等级
- **缓存健康**: 检查缓存命中率
- **系统健康**: 检查系统运行状态

### 3. 告警系统

- **执行错误率告警**: 当错误率超过阈值时触发
- **执行时间告警**: 当执行时间过长时触发
- **内存压力告警**: 当内存使用率过高时触发
- **缓存命中率告警**: 当缓存命中率过低时触发

### 4. API接口

- `GET /api/monitoring/metrics` - 获取当前监控指标
- `GET /api/monitoring/metrics/history` - 获取指标历史
- `GET /api/monitoring/health` - 获取健康状态
- `GET /api/monitoring/alerts/active` - 获取活跃告警
- `GET /api/monitoring/alerts` - 获取所有告警
- `GET /api/monitoring/config` - 获取监控配置
- `PUT /api/monitoring/config` - 更新监控配置

## 集成步骤

### 1. 初始化监控服务

```typescript
import {
  ProductionMonitorService,
  getProductionMonitorService,
  SkillsExecutionManager,
  SkillsLoader,
  MemoryManager,
  SkillsMetricsCollector
} from './core/skills';

// 获取监控服务单例
const monitorService = getProductionMonitorService();

// 初始化（需要传入已初始化的组件）
monitorService.initialize(
  executionManager,      // SkillsExecutionManager实例
  skillsLoader,          // SkillsLoader实例
  memoryManager,         // MemoryManager实例
  {
    enabled: true,
    executionErrorRateThreshold: 0.1,  // 10%
    executionTimeThreshold: 500,        // 500ms
    memoryPressureThreshold: 0.85,      // 85%
    cacheHitRateThreshold: 0.7,        // 70%
    alertInterval: 60 * 1000           // 1分钟
  }
);
```

### 2. 启动监控

```typescript
// 启动监控，每30秒采集一次指标
monitorService.start(30 * 1000);
```

### 3. 注册API路由

```typescript
import { MonitoringController } from './api/controllers/MonitoringController';

// 创建监控控制器
const monitoringController = new MonitoringController(
  monitorService.getMonitor()
);

// 注册路由
app.use('/api/monitoring', monitoringController.getRouter());
```

### 4. 在服务器启动时启动监控

```typescript
// 在服务器启动后
async function startServer() {
  // ... 其他初始化代码 ...
  
  // 启动监控
  if (monitorService.isReady()) {
    monitorService.start(30 * 1000);
    logger.info('✅ 生产环境监控已启动');
  }
}
```

## 使用示例

### 获取当前指标

```bash
curl http://localhost:3000/api/monitoring/metrics
```

响应示例：
```json
{
  "success": true,
  "data": {
    "timestamp": 1700000000000,
    "execution": {
      "totalExecutions": 1000,
      "successfulExecutions": 950,
      "failedExecutions": 50,
      "averageExecutionTime": 45.5
    },
    "memory": {
      "heapUsed": 52428800,
      "heapTotal": 104857600,
      "rss": 157286400,
      "memoryUsagePercent": 0.5
    },
    "cache": {
      "metadata": { "hits": 900, "misses": 100, "hitRate": 0.9 },
      "content": { "hits": 850, "misses": 150, "hitRate": 0.85 },
      "resources": { "hits": 800, "misses": 200, "hitRate": 0.8 }
    }
  }
}
```

### 获取健康状态

```bash
curl http://localhost:3000/api/monitoring/health
```

响应示例：
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": 1700000000000,
    "checks": {
      "execution": { "status": "ok", "message": "执行正常" },
      "memory": { "status": "ok", "message": "内存使用正常" },
      "cache": { "status": "ok", "message": "缓存命中率: 85.00%" },
      "system": { "status": "ok", "message": "系统运行正常，运行时间: 24.50小时" }
    },
    "issues": []
  }
}
```

### 获取活跃告警

```bash
curl http://localhost:3000/api/monitoring/alerts/active
```

响应示例：
```json
{
  "success": true,
  "data": {
    "count": 1,
    "alerts": [
      {
        "id": "execution-error-rate",
        "level": "error",
        "title": "执行错误率过高",
        "message": "执行错误率: 15.00%，超过阈值 10.00%",
        "timestamp": 1700000000000,
        "metric": "execution.errorRate",
        "value": 0.15,
        "threshold": 0.1,
        "resolved": false
      }
    ]
  }
}
```

## 配置选项

### AlertConfig

```typescript
interface AlertConfig {
  enabled: boolean;                      // 是否启用告警
  executionErrorRateThreshold: number;  // 执行错误率阈值 (0-1)
  executionTimeThreshold: number;       // 执行时间阈值 (ms)
  memoryPressureThreshold: number;     // 内存压力阈值 (0-1)
  cacheHitRateThreshold: number;        // 缓存命中率阈值 (0-1)
  alertInterval: number;                // 告警间隔 (ms)
}
```

### 默认配置

```typescript
{
  enabled: true,
  executionErrorRateThreshold: 0.1,     // 10%
  executionTimeThreshold: 500,          // 500ms
  memoryPressureThreshold: 0.85,        // 85%
  cacheHitRateThreshold: 0.7,           // 70%
  alertInterval: 60 * 1000              // 1分钟
}
```

## 监控指标说明

### 执行指标

- **totalExecutions**: 总执行次数
- **successfulExecutions**: 成功执行次数
- **failedExecutions**: 失败执行次数
- **averageExecutionTime**: 平均执行时间 (ms)
- **executorStats**: 各执行器统计

### 内存指标

- **heapUsed**: 已使用的堆内存 (bytes)
- **heapTotal**: 总堆内存 (bytes)
- **rss**: 常驻集大小 (bytes)
- **external**: 外部内存 (bytes)
- **memoryUsagePercent**: 内存使用百分比 (0-1)

### 缓存指标

- **metadata**: 元数据缓存统计
- **content**: 内容缓存统计
- **resources**: 资源缓存统计
- 每个缓存包含: hits, misses, hitRate

### 系统指标

- **uptime**: 系统运行时间 (ms)
- **memoryUsage**: 内存使用详情

## 健康检查状态

### 状态级别

- **healthy**: 所有检查通过
- **degraded**: 有警告但无错误
- **unhealthy**: 有错误

### 检查项

1. **执行健康**: 检查错误率和执行时间
2. **内存健康**: 检查内存使用率
3. **缓存健康**: 检查缓存命中率
4. **系统健康**: 检查系统运行状态

## 告警级别

- **info**: 信息级别告警
- **warning**: 警告级别告警
- **error**: 错误级别告警
- **critical**: 严重级别告警

## 最佳实践

### 1. 监控间隔

- **开发环境**: 60秒
- **生产环境**: 30秒
- **高负载环境**: 15秒

### 2. 告警阈值

根据实际业务需求调整阈值：
- 错误率阈值: 根据业务容忍度设置（建议5-10%）
- 执行时间阈值: 根据SLA设置（建议200-500ms）
- 内存压力阈值: 根据服务器配置设置（建议80-90%）
- 缓存命中率阈值: 根据性能要求设置（建议70-80%）

### 3. 告警处理

- 及时响应告警
- 记录告警处理过程
- 分析告警趋势
- 优化系统配置

### 4. 指标历史

- 保留最近1000条指标记录
- 定期导出历史数据
- 用于性能分析和趋势预测

## 故障排查

### 监控数据不可用

- 检查监控服务是否已启动
- 检查组件是否正确初始化
- 查看日志了解详细错误

### 告警频繁触发

- 检查阈值设置是否合理
- 分析系统实际性能
- 调整告警配置

### 健康检查失败

- 查看具体检查项状态
- 分析失败原因
- 采取相应修复措施

## 集成到现有系统

如果Skills系统已经集成到主服务器，可以这样添加监控：

```typescript
// 在server.ts中
import { getProductionMonitorService } from './core/skills/ProductionMonitorService';
import { MonitoringController } from './api/controllers/MonitoringController';

// 初始化监控（在Skills系统初始化后）
const monitorService = getProductionMonitorService();
monitorService.initialize(
  skillsExecutionManager,
  skillsLoader,
  memoryManager
);

// 注册API路由
const monitoringController = new MonitoringController(monitorService.getMonitor());
app.use('/api/monitoring', monitoringController.getRouter());

// 启动监控（在服务器启动后）
monitorService.start(30 * 1000);
```

## 总结

生产环境监控系统提供了完整的监控、告警和健康检查功能，帮助确保Skills系统在生产环境中的稳定运行。通过API接口可以方便地集成到管理后台或监控系统中。

---

*本文档将随着监控系统的完善持续更新*

