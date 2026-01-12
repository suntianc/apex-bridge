/**
 * Request ID Generation Utilities
 *
 * 生成和管理唯一的请求标识符
 *
 * @module utils/request-id
 */

import * as crypto from "crypto";

/**
 * 生成唯一的请求ID
 *
 * 格式: req_{timestamp}_{random}
 * 示例: req_1730296800000_a3f9k2x8b
 *
 * @returns 唯一的请求ID
 */
export function generateRequestId(): string {
  const timestamp = Date.now();
  // 🛡️ 使用 crypto.randomBytes 保证长度固定且熵值更高
  // 生成 5 字节的随机数据并转为 hex (10字符)，截取前9位
  // 结果必定是 [0-9a-f]，符合 [a-z0-9] 的正则
  const random = crypto.randomBytes(5).toString("hex").substring(0, 9);
  return `req_${timestamp}_${random}`;
}

/**
 * 验证请求ID格式
 *
 * @param requestId - 待验证的请求ID
 * @returns 是否有效
 */
export function isValidRequestId(requestId: string): boolean {
  if (!requestId || typeof requestId !== "string") {
    return false;
  }

  // 格式: req_{timestamp}_{random}
  const pattern = /^req_\d{13}_[a-z0-9]{9}$/;
  return pattern.test(requestId);
}

/**
 * 从请求ID提取时间戳
 *
 * @param requestId - 请求ID
 * @returns Unix时间戳（毫秒），如果无效返回null
 */
export function extractTimestamp(requestId: string): number | null {
  // ⚡️ 优化：简单的分割提取，不强制进行完整的正则校验，性能更好
  if (!requestId || !requestId.startsWith("req_")) {
    return null;
  }

  const parts = requestId.split("_");
  if (parts.length < 2) {
    return null;
  }

  const timestamp = parseInt(parts[1], 10);
  return isNaN(timestamp) ? null : timestamp;
}
