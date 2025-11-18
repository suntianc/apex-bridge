# 系统精简重构提案

## 目标
对 ApexBridge 系统进行减法重构，移除非核心模块，优化架构，提升性能和可维护性。

## 范围
本重构将保留以下核心能力：
1. 多LLM适配（重构为LLM管理器）
2. ABP协议（chat对话和WebSocket机制）
3. Skills全部机制
4. RAG能力（简化版）

## 影响的功能模块

### 完整移除（无核心依赖）
- PersonalityEngine - 人格引擎
- EmotionEngine - 情感引擎
- PreferenceService - 偏好服务
- RelationshipService - 关系管理
- TimelineService - 时间线管理
- NodeManager - 节点管理器
- DistributedService - 分布式服务
- Admin React 应用（所有后台管理界面）

### 精简保留（核心功能）
- ProtocolEngine（移除 RAG/Diary 变量解析器）
- WebSocketManager（移除分布式通道，保留Chat通道）
- Skills 体系（从30+模块精简到10个核心模块）
- Memory 系统（保留 SemanticMemoryService，可选保留简化版 EpisodicMemory）

## 预期收益
- 代码行数减少：-50%（~7500行）
- 启动速度提升：-60%（3-5秒）
- 内存占用降低：-60%（250-350MB）
- 维护复杂度降低：-70%（核心模块10+ vs 原35+）

## 相关规范
- 影响规范：`protocol`, `chat-pipeline`, `skills`
- 废除规范：`emotion`, `preference`, `relationship`（相关功能被移除）
