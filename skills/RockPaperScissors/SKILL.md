---
name: RockPaperScissors
displayName: RockPaperScissors
description: 石头剪刀布
version: 1.0.0
type: direct
domain: utility
keywords:
  - rps
tags:
  - rps
capabilities:
  - rps
triggers:
  intents: []
  phrases:
    - RockPaperScissors
    - rps
  event_types: []
input_schema:
  type: object
  properties: {}
  additionalProperties: true
output_schema:
  type: object
  properties: {}
  additionalProperties: true
security:
  timeout_ms: 3000
  memory_mb: 128
  network: none
  network_allowlist: []
  filesystem: none
  environment: {}
resources:
  entry: ./scripts/execute.ts
cacheable: true
ttl: 3600
protocol: abp
permissions:
  network: false
  filesystem: none
---
# 猜拳游戏

## 描述

经典石头剪刀布，与 AI 对战，支持单局和三局两胜模式。

## 参数

- `player` (string): 玩家出拳，可使用中英文。必填。
- `mode` (string): `single` 或 `best-of-3`，默认 `single`。

## 代码

## 输入
- 详见 `input_schema`。

## 输出
- 详见 `output_schema`。

## 执行步骤
1. 根据上下文判断是否需要调用此技能。
2. 准备输入并调用 `./scripts/execute.ts` 中的 `execute` 方法。
3. 根据返回结果构造最终回复。

## 执行脚本
- 主入口: `./scripts/execute.ts`
- 所有脚本位于 `scripts/` 目录。
