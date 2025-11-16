/**
 * Request ID Generation Utilities
 * 
 * 生成和管理唯一的请求标识符
 * 
 * @module utils/request-id
 */

/**
 * 生成唯一的请求ID
 * 
 * 格式: req_{timestamp}_{random}
 * 示例: req_1730296800000_a3f9k2x
 * 
 * @returns 唯一的请求ID
 */
export function generateRequestId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11); // 9位随机字符
  return `req_${timestamp}_${random}`;
}

/**
 * 验证请求ID格式
 * 
 * @param requestId - 待验证的请求ID
 * @returns 是否有效
 */
export function isValidRequestId(requestId: string): boolean {
  if (!requestId || typeof requestId !== 'string') {
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
  if (!isValidRequestId(requestId)) {
    return null;
  }
  
  const parts = requestId.split('_');
  return parseInt(parts[1], 10);
}

