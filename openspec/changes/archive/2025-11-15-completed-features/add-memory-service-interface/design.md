## Context

当前RAG服务直接集成在VCPEngine中，缺乏统一的记忆服务接口。为了支持后续的apex-memory集成（独立Rust服务）和记忆系统增强功能，需要建立可插拔的记忆系统架构。

## Goals / Non-Goals

### Goals
- 定义统一的IMemoryService接口
- 实现RAGMemoryService包装现有RAG服务
- 在ChatService中使用IMemoryService（替代直接调用RAG）
- 保持向后兼容，不影响现有功能
- 为后续apex-memory集成预留接口

### Non-Goals
- MVP阶段不实现apex-memory集成（后续M2.1）
- MVP阶段不实现高级记忆功能（情感记录、偏好学习、时间线等，后续M2.1-M2.4）
- MVP阶段不修改插件系统对RAG的访问方式

## Decisions

### 决策1: 接口设计
**选择**: 定义IMemoryService接口，包含核心方法和可选扩展方法
**理由**: 
- 核心方法（save、recall）必需，所有实现都必须支持
- 扩展方法（recordEmotion、learnPreference等）可选，不同实现可能有不同支持
- 接口设计支持未来扩展
**实现**:
```typescript
interface IMemoryService {
  save(memory: Memory): Promise<void>;
  recall(query: string, context: Context): Promise<Memory[]>;
  recordEmotion?(userId: string, emotion: Emotion, context: string): Promise<void>;
  learnPreference?(userId: string, preference: Preference): Promise<void>;
  buildTimeline?(userId: string, days: number): Promise<TimelineEvent[]>;
}
```

### 决策2: RAG包装策略
**选择**: 创建RAGMemoryService，包装现有的RAG服务
**理由**: 
- 不破坏现有RAG服务实现
- 保持向后兼容
- VCPEngine中的ragService仍可用于插件系统
**实现**:
```typescript
class RAGMemoryService implements IMemoryService {
  constructor(private ragService: any) {}
  // 包装ragService的方法
}
```

### 决策3: 集成策略
**选择**: 在ChatService中使用IMemoryService，但保持VCPEngine.ragService供插件使用
**理由**: 
- ChatService应该通过统一接口访问记忆
- 插件系统可能直接使用ragService的特定方法
- 避免大规模重构
**实施**: 
- ChatService注入IMemoryService
- VCPEngine.ragService保持不变

### 决策4: 配置策略
**选择**: 使用环境变量`MEMORY_SYSTEM`选择实现（默认`rag`）
**理由**: 
- 简单明确
- 为后续apex-memory集成预留配置点
- 无需修改代码即可切换实现
**实现**:
```typescript
const memorySystem = process.env.MEMORY_SYSTEM || 'rag';
if (memorySystem === 'rag') {
  memoryService = new RAGMemoryService(vcpEngine.ragService);
} else if (memorySystem === 'memory') {
  // 后续实现：RemoteMemoryService
}
```

### 决策5: Memory数据模型
**选择**: 定义简化的Memory接口（MVP阶段）
**理由**: 
- MVP阶段仅需要基础功能
- 后续可以根据需要扩展
- 与RAG服务数据结构兼容
**实现**:
```typescript
interface Memory {
  content: string;
  metadata?: {
    userId?: string;
    timestamp?: number;
    source?: string;
    [key: string]: any;
  };
}
```

## Risks / Trade-offs

### 风险1: 性能损失
**缓解**: 
- 接口调用应该是简单的包装，开销最小
- 基准测试验证性能（目标: < 10ms开销）

### 风险2: 破坏现有功能
**缓解**: 
- 完全向后兼容设计
- 保持VCPEngine.ragService不变
- 充分测试验证

### 风险3: 接口设计不完善
**缓解**: 
- 接口设计考虑未来扩展
- 使用可选方法支持不同实现
- 后续可以根据需要调整

## Migration Plan

### 向后兼容
- 完全向后兼容
- 现有RAG功能正常工作
- 插件系统仍能访问ragService
- ChatService通过新接口访问，功能不变

### 扩展路径
- MVP阶段：RAGMemoryService实现
- M2.1阶段：添加扩展方法（recordEmotion等）
- 后续：实现RemoteMemoryService（连接apex-memory）

## Open Questions

无（所有设计决策已确定）

