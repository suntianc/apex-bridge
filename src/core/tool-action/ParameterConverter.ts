/**
 * ParameterConverter - 参数类型转换器
 * 将字符串参数转换为目标类型
 */

interface ParameterProperty {
  type: string;
  description?: string;
}

interface PropertySchema {
  properties?: Record<string, ParameterProperty>;
  required?: string[];
}

export class ParameterConverter {
  /**
   * 转换参数类型（字符串 -> 实际类型）
   */
  convert(params: Record<string, string>, schema?: PropertySchema | null): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      const propSchema = schema?.properties?.[key];

      if (!propSchema) {
        result[key] = value;
        continue;
      }

      result[key] = this.convertValue(value, propSchema.type);
    }

    return result;
  }

  /**
   * 转换单个值
   */
  private convertValue(value: string, targetType: string): any {
    switch (targetType) {
      case "number":
        return Number(value);

      case "boolean":
        return value === "true" || value === "1" || value === "yes";

      case "array":
        try {
          return JSON.parse(value);
        } catch {
          return value.split(",").map((s) => s.trim());
        }

      case "object":
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }

      case "integer":
        return parseInt(value, 10);

      case "float":
        return parseFloat(value);

      default:
        return value;
    }
  }

  /**
   * 批量转换数组参数
   */
  convertArray(
    items: Record<string, string>[],
    schema?: PropertySchema | null
  ): Record<string, any>[] {
    return items.map((item) => this.convert(item, schema));
  }

  /**
   * 验证必需参数
   */
  validateRequired(
    params: Record<string, any>,
    requiredFields: string[]
  ): { valid: boolean; missing?: string[] } {
    const missing = requiredFields.filter((field) => {
      const value = params[field];
      return value === undefined || value === null || value === "";
    });

    return {
      valid: missing.length === 0,
      missing: missing.length > 0 ? missing : undefined,
    };
  }

  /**
   * 获取参数默认值
   */
  getDefaultValue(schema: ParameterProperty, defaultValue?: string): any {
    if (defaultValue !== undefined) {
      return this.convertValue(defaultValue, schema.type);
    }
    if (schema.type === "boolean") return false;
    if (schema.type === "number" || schema.type === "integer") return 0;
    if (schema.type === "array") return [];
    if (schema.type === "object") return {};
    return "";
  }
}
