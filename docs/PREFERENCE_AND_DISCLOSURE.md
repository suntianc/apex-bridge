# 偏好学习与三段披露

本文档说明 ApexBridge 中“偏好学习（Preference Learning）”与“三段渐进式披露（metadata/brief/full）”的关系与接口。

## 偏好模型与优先级

- 视图合并顺序：session > user > default
- 每个偏好键保存来源与 TTL，可按需过期清理

## API（简述）

- GET `/api/preferences?userId=...`：列出用户偏好
- POST `/api/preferences`：创建/更新偏好
  - body: `{ userId, key, value, source?, ttlMs? }`

## 披露阶段覆盖

- 若在 `toolsDisclosure` 偏好中指定 `metadata|brief|full`，则工具描述按该阶段固定生成；
- 否则回退到当前的置信度驱动逻辑（低→metadata，中→brief，高→full）。

## 工具参数默认值

- 当工具参数缺省时，按优先级应用：
  1) 显式传入的参数
  2) ABP schema 的默认值（若存在）
  3) 偏好视图中的同名键值

相关实现：
- `SkillsToToolMapper.convertToolCallToExecutionRequestWithDefaults`
- `ChatService` 在执行工具前从 `PreferenceService` 提取合并视图并传入映射器


