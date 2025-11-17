---
name: Echo
displayName: Echo
description: Echo tool for testing - echoes back the input parameters
version: 1.0.0
type: direct
domain: test
keywords:
  - echo
  - test
tags:
  - test
  - echo
capabilities:
  - echo
triggers:
  intents: []
  phrases:
    - echo
  event_types: []
input_schema:
  type: object
  properties:
    message:
      type: string
      description: Message to echo back
    metadata:
      type: object
      description: Optional metadata
  additionalProperties: true
output_schema:
  type: object
  properties:
    echoed:
      type: object
      description: Echoed input parameters
    metadata:
      type: object
      description: Echoed metadata if provided
  additionalProperties: true
security:
  timeout_ms: 5000
  memory_mb: 64
  network: none
  filesystem: none
  environment: {}
resources:
  entry: ./scripts/execute.ts
cacheable: false
protocol: abp
permissions:
  network: false
  filesystem: none
---
# Echo Skill

## 描述

简单的回显工具，用于测试 Skills 系统。将输入的参数原样返回。

## 输入

- `message` (string, 可选): 要回显的消息
- `metadata` (object, 可选): 可选的元数据

## 输出

- `echoed` (object): 回显的输入参数
- `metadata` (object): 回显的元数据（如果提供）

## 执行步骤

1. 接收输入参数
2. 将参数原样返回

## 执行脚本

- 主入口: `./scripts/execute.ts`

