## 1. 核心功能实现

- [ ] 1.1 在RAGMemoryService中实现buildTimeline方法
  - [ ] 从RAG服务检索指定时间范围内的记忆
  - [ ] 按时间戳排序记忆（从旧到新）
  - [ ] 将Memory对象转换为TimelineEvent格式
  - [ ] 支持不同类型的事件识别（chat、emotion、preference等）
  - [ ] 添加事件元数据（source、tags等）

- [ ] 1.2 实现时间范围筛选
  - [ ] 支持days参数（最近N天）
  - [ ] 支持startDate和endDate参数（可选）
  - [ ] 默认返回最近30天的时间线
  - [ ] 验证时间范围参数

- [ ] 1.3 可选：时间线摘要生成
  - [ ] 使用LLM生成叙述性摘要（可选）
  - [ ] 或使用简单拼接方式生成摘要
  - [ ] 摘要长度限制和格式化

## 2. API开发

- [ ] 2.1 创建TimelineController
  - [ ] 实现`getTimeline()` - GET /api/admin/timeline
  - [ ] 实现`searchTimeline()` - GET /api/admin/timeline/search (可选)
  - [ ] 添加输入验证（userId、days参数等）
  - [ ] 添加错误处理

- [ ] 2.2 集成到路由系统
  - [ ] 在`src/server.ts`中添加路由
  - [ ] 使用`adminAuthMiddleware`保护API
  - [ ] 测试所有API端点

## 3. 测试和文档

- [ ] 3.1 单元测试
  - [ ] 测试buildTimeline方法
  - [ ] 测试时间范围筛选
  - [ ] 测试TimelineEvent转换

- [ ] 3.2 集成测试
  - [ ] 测试完整的时间线构建流程
  - [ ] 测试API端点

- [ ] 3.3 文档
  - [ ] API接口文档（时间范围参数说明）

