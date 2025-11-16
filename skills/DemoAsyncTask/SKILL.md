---
name: DemoAsyncTask
displayName: DemoAsyncTask
description: 模拟异步任务
version: 1.0.0
type: direct
domain: utility
keywords:
  - async-task
tags:
  - async-task
capabilities:
  - async-task
triggers:
  intents: []
  phrases:
    - DemoAsyncTask
    - async-task
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
# 演示异步任务

## 描述

模拟一个需要一定时间才能完成的任务，可选失败分支，并返回进度。

## 参数

- `taskName` (string): 任务名称，默认 `异步任务`。
- `duration` (number): 模拟耗时（毫秒），默认 2000，范围 200-10000。
- `shouldFail` (boolean): 是否模拟失败，默认 `false`。

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
