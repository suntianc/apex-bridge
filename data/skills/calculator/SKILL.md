---
name: 计算器
version: 1.0.0
description: 简单的数学计算器工具，支持基本四则运算
tags:
  - 数学
  - 计算
  - 工具
  - 基础
abp:
  tools:
    - name: calculator
      description: 执行基本数学运算
      parameters:
        type: object
        properties:
          expression:
            type: string
            description: 数学表达式（如：2+3, 10*5, 100/4等）
            examples:
              - "2+3"
              - "10*5"
              - "100/4"
              - "25-10"
          operation:
            type: string
            description: 操作类型（可选，如果不提供则自动解析表达式）
            enum: [add, subtract, multiply, divide]
            default: auto
        required: [expression]
---

# 计算器技能包

这是一个简单的数学计算器工具，支持基本的四则运算。

## 功能

- 加法运算
- 减法运算
- 乘法运算
- 除法运算
- 复杂表达式计算

## 使用示例

用户可以说：
- "计算 2 加 3 等于多少"
- "25 乘以 4 是多少"
- "100 除以 5 等于多少"
- "帮我算一下 50 减 20"

## 实现说明

该技能使用 JavaScript 的 `eval()` 函数来解析数学表达式，支持复杂的数学运算。

## 注意事项

- 支持整数和小数运算
- 除法运算会自动处理小数结果
- 表达式解析会自动识别运算符