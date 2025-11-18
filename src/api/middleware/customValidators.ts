/**
 * Custom Validators - 自定义业务规则验证器
 *
 * 提供业务特定的验证规则，用于补充 JSON Schema 验证
 */

import { addCustomFormat } from './validationMiddleware';

/**
 * 验证 API Key 格式
 */
export function validateAPIKey(value: string): boolean {
  if (typeof value !== 'string' || value.length < 10 || value.length > 200) {
    throw new Error('API Key 长度必须在 10 到 200 个字符之间');
  }

  // 基本格式检查（可以包含字母、数字、连字符、下划线）
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error('API Key 格式无效');
  }

  return true;
}

/**
 * 验证端口号
 */
export function validatePort(value: number): boolean {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error('端口号必须在 1 到 65535 之间');
  }
  return true;
}

/**
 * 验证温度值
 */
export function validateTemperature(value: number): boolean {
  if (typeof value !== 'number' || value < 0 || value > 2) {
    throw new Error('温度值必须在 0 到 2 之间');
  }
  return true;
}

/**
 * 初始化自定义验证器
 * 注册所有自定义格式到验证中间件
 */
export function initializeCustomValidators(): void {
  // API Key格式
  addCustomFormat('api-key', {
    validate: (value: string) => {
      try {
        return validateAPIKey(value);
      } catch {
        return false;
      }
    }
  });
}
