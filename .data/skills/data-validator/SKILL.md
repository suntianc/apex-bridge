---
name: "data-validator"
description: "验证JSON、CSV、XML等结构化数据的格式正确性、字段完整性和业务规则。当用户提供数据文件、提及数据验证或需要数据质量检查时触发。"
version: "1.0"
author: "Data Quality Team"
tags: ["data", "validation", "quality", "json", "csv", "xml"]
tools:
  - name: "schema_validation"
    description: "根据JSON Schema验证数据结构"
    input_schema:
      type: "object"
      properties:
        data:
          type: "string"
          description: "待验证的JSON数据字符串"
        schema_path:
          type: "string"
          description: "JSON Schema文件路径或内联schema"
          examples:
            - "schemas/user_schema.json"
            - "{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\"}}}"
      required: ["data"]
    output_schema:
      type: "object"
      properties:
        valid:
          type: "boolean"
          description: "数据是否通过Schema验证"
        errors:
          type: "array"
          items:
            type: "object"
            properties:
              path:
                type: "string"
                description: "错误字段路径（如$.user.name）"
              message:
                type: "string"
                description: "详细错误信息"
              code:
                type: "string"
                description: "错误代码"
          description: "验证错误列表"
        summary:
          type: "object"
          properties:
            total_errors:
              type: "integer"
            error_types:
              type: "object"
              description: "按错误类型分组的统计"
          required: ["total_errors"]
      required: ["valid", "summary"]

  - name: "csv_quality_check"
    description: "检查CSV数据的质量和完整性"
    input_schema:
      type: "object"
      properties:
        csv_content:
          type: "string"
          description: "CSV文件内容或数据字符串"
        delimiter:
          type: "string"
          description: "CSV分隔符（默认为逗号）"
          default: ","
        has_header:
          type: "boolean"
          description: "是否有标题行"
          default: true
        required_columns:
          type: "array"
          items:
            type: "string"
          description: "必填列名列表"
      required: ["csv_content"]
    output_schema:
      type: "object"
      properties:
        valid:
          type: "boolean"
          description: "CSV格式是否正确"
        quality_score:
          type: "number"
          description: "数据质量评分（0-100）"
        issues:
          type: "array"
          items:
            type: "object"
            properties:
              type:
                type: "string"
                enum: ["missing_column", "invalid_format", "duplicate_value", "null_value"]
              row:
                type: "integer"
                description: "问题行号"
              column:
                type: "string"
                description: "列名"
              message:
                type: "string"
                description: "问题描述"
          description: "发现的数据质量问题"
        statistics:
          type: "object"
          properties:
            total_rows:
              type: "integer"
            valid_rows:
              type: "integer"
            missing_values:
              type: "integer"
            duplicate_rows:
              type: "integer"
          required: ["total_rows"]

  - name: "business_rule_check"
    description: "根据自定义业务规则验证数据"
    input_schema:
      type: "object"
      properties:
        data:
          type: "string"
          description: "待验证的JSON数据"
        rules_file:
          type: "string"
          description: "业务规则JSON文件路径"
          examples:
            - "rules/ecommerce_rules.json"
            - "rules/user_validation.json"
        rule_type:
          type: "string"
          enum: ["ecommerce", "user", "finance", "custom"]
          description: "预定义的规则类型"
      required: ["data", "rule_type"]
    output_schema:
      type: "object"
      properties:
        passed:
          type: "boolean"
          description: "是否通过所有业务规则检查"
        violations:
          type: "array"
          items:
            type: "object"
            properties:
              rule_id:
                type: "string"
                description: "违反的规则ID"
              severity:
                type: "string"
                enum: ["ERROR", "WARNING", "INFO"]
              message:
                type: "string"
                description: "规则违反描述"
              field:
                type: "string"
                description: "违反的字段名"
              expected:
                type: "string"
                description: "期望值或格式"
              actual:
                type: "string"
                description: "实际值"
          description: "业务规则违反列表"
        compliance_score:
          type: "number"
          description: "业务规则符合度（0-100）"
        recommendations:
          type: "array"
          items:
            type: "string"
          description: "数据改进建议"
      required: ["passed", "violations"]
---

# 数据验证器 - 结构化数据质量保证

## 核心功能

数据验证器提供三层验证机制：
1. **结构验证**：确保数据符合预定义Schema
2. **质量检查**：评估数据完整性和一致性
3. **业务规则验证**：根据行业规则检查数据合规性

## 使用示例

### 场景1：JSON Schema验证
```xml
<tool_action name="data-validator">
  <tool_name value="schema_validation" />
  <input>
    {
      "data": {"name": "John", "email": "john@example.com", "age": 30},
      "schema_path": "schemas/user_schema.json"
    }
  </input>
</tool_action>
```

### 场景2：CSV质量检查
```xml
<tool_action name="data-validator">
  <tool_name value="csv_quality_check" />
  <input>
    {
      "csv_content": "name,email,age\nJohn,john@example.com,30\nJane,jane@example.com,25",
      "required_columns": ["name", "email"]
    }
  </input>
</tool_action>
```

## 操作流程

**当调用数据验证器时**：
1. **识别数据格式**：自动检测JSON、CSV或XML格式
2. **选择验证工具**：根据用户指定或自动选择合适的验证工具
3. **执行验证**：运行对应工具进行数据检查
4. **整合报告**：汇总所有验证结果，生成综合报告
5. **提供建议**：根据发现的问题给出修复建议

## 详细资源说明

详细的验证规则、Schema示例和业务规则配置请参考：
- **规则定义**：`rules/` 目录
- **Schema示例**：`schemas/` 目录
- **报告模板**：`templates/` 目录

*这些资源文件仅在需要深度配置或自定义规则时加载*
