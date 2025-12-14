/**
 * 数据验证器执行脚本
 * 提供JSON Schema验证、CSV质量检查和业务规则验证
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const csv = require('csv-parser');
const fs = require('fs').promises;
const path = require('path');

module.exports = async function execute(args) {
  try {
    const { tool_name, input } = args;

    if (!tool_name) {
      throw new Error('缺少tool_name参数');
    }

    if (!input) {
      throw new Error('缺少input参数');
    }

    let parsedInput;
    try {
      parsedInput = typeof input === 'string' ? JSON.parse(input) : input;
    } catch (e) {
      throw new Error('input参数必须是有效的JSON字符串');
    }

    let result;

    switch (tool_name) {
      case 'schema_validation':
        result = await schemaValidation(parsedInput);
        break;

      case 'csv_quality_check':
        result = await csvQualityCheck(parsedInput);
        break;

      case 'business_rule_check':
        result = await businessRuleCheck(parsedInput);
        break;

      default:
        throw new Error(`不支持的工具: ${tool_name}`);
    }

    return {
      success: true,
      output: JSON.stringify(result),
      duration: Date.now()
    };

  } catch (error) {
    return {
      success: false,
      error: error.message || '数据验证失败',
      duration: Date.now()
    };
  }
};

// JSON Schema验证
async function schemaValidation(input) {
  const { data, schema_path } = input;

  if (!data || !schema_path) {
    throw new Error('data和schema_path为必填参数');
  }

  let schema;
  try {
    // 如果schema_path是文件路径，尝试读取
    if (fs.existsSync(schema_path)) {
      const schemaContent = await fs.readFile(schema_path, 'utf8');
      schema = JSON.parse(schemaContent);
    } else {
      // 尝试作为内联JSON解析
      schema = JSON.parse(schema_path);
    }
  } catch (e) {
    throw new Error(`无效的Schema: ${e.message}`);
  }

  let dataObj;
  try {
    dataObj = typeof data === 'string' ? JSON.parse(data) : data;
  } catch (e) {
    return {
      valid: false,
      summary: { total_errors: 1, error_types: { 'parse_error': 1 } },
      errors: [{
        path: '$',
        message: '数据不是有效的JSON格式',
        code: 'INVALID_JSON'
      }]
    };
  }

  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);

  const validate = ajv.compile(schema);
  const valid = validate(dataObj);

  if (valid) {
    return {
      valid: true,
      summary: { total_errors: 0, error_types: {} }
    };
  }

  const errors = (validate.errors || []).map(err => ({
    path: err.instancePath || '$',
    message: err.message || '验证失败',
    code: err.keyword?.toUpperCase() || 'VALIDATION_ERROR'
  }));

  const errorTypes = errors.reduce((acc, err) => {
    acc[err.code] = (acc[err.code] || 0) + 1;
    return acc;
  }, {});

  return {
    valid: false,
    errors,
    summary: {
      total_errors: errors.length,
      error_types: errorTypes
    }
  };
}

// CSV质量检查
async function csvQualityCheck(input) {
  const { csv_content, delimiter = ',', has_header = true, required_columns = [] } = input;

  if (!csv_content) {
    throw new Error('csv_content为必填参数');
  }

  return new Promise((resolve) => {
    const rows = [];
    const issues = [];
    let headers = null;
    let rowCount = 0;
    let validRowCount = 0;
    let nullValueCount = 0;
    const seenRows = new Set();

    const stream = require('stream');
    const buffer = new stream.Readable();
    buffer._read = () => {};
    buffer.push(csv_content);
    buffer.push(null);

    buffer
      .pipe(csv({ separator: delimiter }))
      .on('data', (row) => {
        rowCount++;

        // 检查必填列
        required_columns.forEach(col => {
          if (!row[col] || row[col].trim() === '') {
            issues.push({
              type: 'missing_column',
              row: rowCount,
              column: col,
              message: `必填列'${col}'缺失`
            });
          }
        });

        // 检查空值
        Object.values(row).forEach(value => {
          if (!value || value.trim() === '') {
            nullValueCount++;
          }
        });

        // 检查重复行
        const rowStr = JSON.stringify(row);
        if (seenRows.has(rowStr)) {
          issues.push({
            type: 'duplicate_value',
            row: rowCount,
            column: 'all',
            message: '检测到重复行'
          });
        } else {
          seenRows.add(rowStr);
        }

        if (issues.filter(i => i.row === rowCount).length === 0) {
          validRowCount++;
        }

        rows.push(row);
      })
      .on('end', () => {
        const qualityScore = calculateQualityScore(rowCount, validRowCount, issues);

        resolve({
          valid: issues.filter(i => i.type === 'missing_column').length === 0,
          quality_score: qualityScore,
          issues,
          statistics: {
            total_rows: rowCount,
            valid_rows: validRowCount,
            missing_values: nullValueCount,
            duplicate_rows: issues.filter(i => i.type === 'duplicate_value').length
          }
        });
      })
      .on('error', (error) => {
        resolve({
          valid: false,
          quality_score: 0,
          issues: [{
            type: 'invalid_format',
            row: 0,
            column: 'all',
            message: `CSV解析错误: ${error.message}`
          }],
          statistics: {
            total_rows: 0,
            valid_rows: 0,
            missing_values: 0,
            duplicate_rows: 0
          }
        });
      });
  });
}

// 业务规则验证
async function businessRuleCheck(input) {
  const { data, rule_type } = input;

  if (!data || !rule_type) {
    throw new Error('data和rule_type为必填参数');
  }

  let dataObj;
  try {
    dataObj = typeof data === 'string' ? JSON.parse(data) : data;
  } catch (e) {
    return {
      passed: false,
      violations: [{
        rule_id: 'PARSE_ERROR',
        severity: 'ERROR',
        message: '数据不是有效的JSON格式',
        field: 'all'
      }],
      compliance_score: 0,
      recommendations: ['检查数据格式是否为有效的JSON']
    };
  }

  // 模拟业务规则检查
  const violations = [];
  let passedRules = 0;
  let totalRules = 5;

  switch (rule_type) {
    case 'user':
      if (!dataObj.email || !dataObj.email.includes('@')) {
        violations.push({
          rule_id: 'USER_EMAIL_FORMAT',
          severity: 'ERROR',
          message: '邮箱格式不正确',
          field: 'email',
          expected: '有效的邮箱地址',
          actual: dataObj.email || 'null'
        });
      }
      if (!dataObj.age || dataObj.age < 0 || dataObj.age > 150) {
        violations.push({
          rule_id: 'USER_AGE_RANGE',
          severity: 'ERROR',
          message: '年龄必须在0-150之间',
          field: 'age',
          expected: '0-150之间的数字',
          actual: dataObj.age
        });
      }
      passedRules = violations.length === 0 ? 5 : 3;
      break;

    case 'ecommerce':
      if (!dataObj.price || dataObj.price < 0) {
        violations.push({
          rule_id: 'PRODUCT_PRICE_POSITIVE',
          severity: 'ERROR',
          message: '商品价格必须大于0',
          field: 'price',
          expected: '正数',
          actual: dataObj.price
        });
      }
      passedRules = violations.length === 0 ? 5 : 4;
      break;

    default:
      violations.push({
        rule_id: 'UNKNOWN_RULE_TYPE',
        severity: 'WARNING',
        message: `未知的规则类型: ${rule_type}`,
        field: 'all'
      });
      passedRules = 4;
  }

  const complianceScore = (passedRules / totalRules) * 100;

  return {
    passed: violations.filter(v => v.severity === 'ERROR').length === 0,
    violations,
    compliance_score: Math.round(complianceScore),
    recommendations: generateRecommendations(violations)
  };
}

// 计算质量评分
function calculateQualityScore(totalRows, validRows, issues) {
  if (totalRows === 0) return 0;

  const errorRate = issues.length / totalRows;
  const validRate = validRows / totalRows;

  // 基础分数减去错误率
  let score = validRate * 100;

  // 严重错误扣更多分
  const severeErrors = issues.filter(i => i.type === 'missing_column').length;
  score -= severeErrors * 10;

  // 中等错误扣分
  const mediumErrors = issues.filter(i => i.type === 'invalid_format').length;
  score -= mediumErrors * 5;

  // 轻微错误扣分
  const minorErrors = issues.filter(i => i.type === 'duplicate_value' || i.type === 'null_value').length;
  score -= minorErrors * 2;

  return Math.max(0, Math.round(score));
}

// 生成改进建议
function generateRecommendations(violations) {
  const recommendations = [];

  if (violations.some(v => v.rule_id?.includes('EMAIL'))) {
    recommendations.push('建议添加邮箱格式验证逻辑');
  }

  if (violations.some(v => v.rule_id?.includes('PRICE'))) {
    recommendations.push('在前端添加价格输入验证');
  }

  if (violations.length > 5) {
    recommendations.push('建议实施数据质量监控流程');
  }

  return recommendations;
}
