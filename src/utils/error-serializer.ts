/**
 * 错误响应序列化工具
 *
 * 提供安全的错误响应序列化逻辑，避免重复代码
 */

import { logger } from "./logger";

/**
 * 序列化错误响应数据
 *
 * @param error - 错误对象，包含 response 属性
 * @returns 格式化的错误详情字符串
 */
export function serializeErrorResponse(error: unknown): string {
  try {
    const err = error as Record<string, unknown>;
    if (
      err.response &&
      typeof err.response === "object" &&
      (err.response as Record<string, unknown>).data &&
      typeof (err.response as Record<string, unknown>).data === "object"
    ) {
      return JSON.stringify((err.response as { data: unknown }).data, null, 2);
    }
    const responseData = (err.response as { data: unknown })?.data;
    return responseData !== undefined ? String(responseData) : "无详细信息";
  } catch (error) {
    logger.warn(`[error-serializer] Failed to serialize error response`, error);
    return "[无法序列化响应数据]";
  }
}

/**
 * 记录错误响应的详细信息
 *
 * @param providerName - 提供商名称
 * @param error - 错误对象
 * @param context - 额外的上下文信息
 */
export function logErrorResponse(
  providerName: string,
  error: unknown,
  context: "chat" | "stream" | "embed" = "chat"
): void {
  const err = error as Record<string, unknown>;
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error(`❌ ${providerName} ${context} error:`, errorMessage);

  if (err.response) {
    const status = (err.response as { status?: number }).status;
    if (status !== undefined) {
      logger.error(`   HTTP状态: ${status}`);
    }
    const serialized = serializeErrorResponse(error);
    logger.error(`   错误详情: ${serialized}`);
  }
}

/**
 * 创建错误响应对象
 *
 * @param providerName - 提供商名称
 * @param error - 原始错误
 * @returns 标准化的错误消息
 */
export function createErrorMessage(providerName: string, error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return `${providerName} request failed: ${errorMessage}`;
}
